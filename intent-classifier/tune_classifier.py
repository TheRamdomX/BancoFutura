"""
Itera sobre configuraciones del clasificador de intención para maximizar
accuracy Y confianza (probabilidad del argmax) en frases nuevas.

Cachea los embeddings en disco (.npy) para no re-llamar a Gemini en cada
iteración — el embedding de Gemini es lo único que cuesta cuota.

Embedding: gemini-embedding-001 @ 768 dims, L2-normalizado (debe coincidir
con classifier_service._classify_ml).

Uso:  GEMINI_API_KEY=... python tune_classifier.py
"""
import os
import json
import time
import hashlib
import numpy as np
import joblib
from google import genai
from google.genai import types
from google.genai.errors import ClientError
from sklearn.model_selection import train_test_split
from sklearn.neural_network import MLPClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.svm import SVC
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import accuracy_score

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
EMBED_MODEL = os.getenv("GEMINI_EMBED_MODEL", "gemini-embedding-001")
EMBED_DIM = int(os.getenv("GEMINI_EMBED_DIM", "768"))
THROTTLE_S = float(os.getenv("EMBED_THROTTLE_S", "0.7"))
CACHE_DIR = ".embed_cache"

# Frases nuevas (NO en el dataset) para medir confianza real de generalización.
NOVEL = [
    ("¿cuánta luca tengo en la cuenta?", "check_balance"),
    ("muéstrame la plata disponible", "check_balance"),
    ("mándale 20 lucas a mi hermano", "make_transfer"),
    ("necesito girar plata a la cuenta de mi mamá", "make_transfer"),
    ("qué movimientos hice esta semana", "list_transactions"),
    ("pásame el detalle de mis últimos gastos", "list_transactions"),
    ("mi tarjeta de crédito sirve?", "check_card"),
    ("está habilitada mi tarjeta?", "check_card"),
    ("wn perdí la tarjeta bloquéala altiro", "block_card"),
    ("me robaron la billetera, desactiva la tarjeta", "block_card"),
    ("cuánto es lo máximo que puedo transferir al día", "ask_info"),
    ("qué comisión me cobran por transferir", "ask_info"),
    ("recomiéndame una película", "out_of_scope"),
    ("qué hora es", "out_of_scope"),
]


def _embed_raw(text: str) -> np.ndarray:
    for attempt in range(6):
        try:
            resp = client.models.embed_content(
                model=EMBED_MODEL,
                contents=text,
                config=types.EmbedContentConfig(
                    task_type="RETRIEVAL_QUERY",
                    output_dimensionality=EMBED_DIM,
                ),
            )
            v = np.array(resp.embeddings[0].values, dtype=np.float32)
            n = np.linalg.norm(v)
            return v / n if n > 0 else v
        except ClientError as e:
            if getattr(e, "code", None) == 429 and attempt < 5:
                wait = 12 * (attempt + 1)
                print(f"    [429] cuota agotada, reintento en {wait}s…")
                time.sleep(wait)
                continue
            raise
    raise RuntimeError("embed falló")


def embed_cached(texts: list[str], tag: str) -> np.ndarray:
    os.makedirs(CACHE_DIR, exist_ok=True)
    key = hashlib.md5((f"{EMBED_MODEL}|{EMBED_DIM}|" + "|".join(texts)).encode()).hexdigest()
    path = os.path.join(CACHE_DIR, f"{tag}_{key}.npy")
    if os.path.exists(path):
        print(f"  [cache] {tag}: {path}")
        return np.load(path)
    print(f"  embebiendo {len(texts)} frases ({tag}) @ {EMBED_DIM}d…")
    vecs = []
    for i, t in enumerate(texts, 1):
        vecs.append(_embed_raw(t))
        if i % 20 == 0:
            print(f"    {i}/{len(texts)}")
        time.sleep(THROTTLE_S)
    X = np.vstack(vecs)
    np.save(path, X)
    return X


def evaluate(name, build, X_train, y_train, X_test, y_test, Xn, yn_idx):
    clf = build()
    clf.fit(X_train, y_train)
    acc = accuracy_score(y_test, clf.predict(X_test))
    probs = clf.predict_proba(Xn)
    pred = probs.argmax(axis=1)
    novel_acc = accuracy_score(yn_idx, pred)
    mean_conf = float(probs.max(axis=1).mean())
    mean_conf_correct = float(probs[np.arange(len(pred)), pred][pred == yn_idx].mean())
    print(f"{name:28s} test_acc={acc:.3f}  novel_acc={novel_acc:.3f}  "
          f"conf_media={mean_conf:.3f}  conf_aciertos={mean_conf_correct:.3f}")
    return clf, novel_acc, mean_conf


def main():
    with open("intent_dataset.json", encoding="utf-8") as f:
        dataset = json.load(f)
    texts = [d["text"] for d in dataset]
    labels = [d["intent"] for d in dataset]

    le = LabelEncoder()
    y = le.fit_transform(labels)
    X = embed_cached(texts, "train")

    novel_texts = [t for t, _ in NOVEL]
    novel_labels = [l for _, l in NOVEL]
    Xn = embed_cached(novel_texts, "novel")
    yn_idx = le.transform(novel_labels)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    configs = {
        "MLP(256,128)_relu": lambda: MLPClassifier(
            hidden_layer_sizes=(256, 128), max_iter=500, random_state=42,
            early_stopping=True, validation_fraction=0.15),
        "MLP(128)_alpha1e-2": lambda: MLPClassifier(
            hidden_layer_sizes=(128,), alpha=1e-2, max_iter=800, random_state=42),
        "LogReg_C10": lambda: LogisticRegression(C=10, max_iter=2000),
        "LogReg_C50": lambda: LogisticRegression(C=50, max_iter=2000),
        "SVC_rbf_proba": lambda: SVC(C=10, kernel="rbf", probability=True, random_state=42),
    }

    print("\n=== Comparación de configuraciones ===")
    results = {}
    for name, build in configs.items():
        clf, nacc, conf = evaluate(name, build, X_train, y_train, X_test, y_test, Xn, yn_idx)
        results[name] = (clf, nacc, conf)

    # Mejor = mayor novel_acc; desempate por confianza media.
    best_name = max(results, key=lambda n: (results[n][1], results[n][2]))
    best_clf, nacc, conf = results[best_name]
    print(f"\n>> Mejor: {best_name}  (novel_acc={nacc:.3f}, conf_media={conf:.3f})")

    # Reentrenar el mejor con TODO el dataset y guardar.
    final = configs[best_name]()
    final.fit(X, y)
    os.makedirs("models", exist_ok=True)
    joblib.dump(final, "models/intent_classifier.joblib")
    joblib.dump(le, "models/intent_label_encoder.joblib")
    print("Modelo final guardado en models/ (entrenado con todo el dataset)")


if __name__ == "__main__":
    main()
