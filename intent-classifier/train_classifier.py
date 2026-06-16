"""
Entrena el clasificador de intención con embeddings de Gemini + MLPClassifier.
Entrada:  intent_dataset.json   (de generate_training_data.py)
Salida:   models/intent_classifier.joblib, models/intent_label_encoder.joblib
Uso:  GEMINI_API_KEY=... python train_classifier.py
"""
import os
import json
import time
import numpy as np
import joblib
from google import genai
from google.genai import types
from google.genai.errors import ClientError
from sklearn.model_selection import train_test_split
from sklearn.neural_network import MLPClassifier
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import classification_report, confusion_matrix

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
EMBED_MODEL = os.getenv("GEMINI_EMBED_MODEL", "gemini-embedding-001")
# 768 dims L2-normalizados dan confianzas nítidas (ver tune_classifier.py).
EMBED_DIM = int(os.getenv("GEMINI_EMBED_DIM", "768"))
# El free tier permite ~100 embeddings/min: espaciamos las llamadas.
THROTTLE_S = float(os.getenv("EMBED_THROTTLE_S", "0.7"))


def embed(text: str) -> list[float]:
    """Embebe una frase (768d, L2-normalizado) con reintento ante 429."""
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
            return (v / n if n > 0 else v).tolist()
        except ClientError as e:
            if getattr(e, "code", None) == 429 and attempt < 5:
                wait = 12 * (attempt + 1)
                print(f"    [429] cuota agotada, reintento en {wait}s…")
                time.sleep(wait)
                continue
            raise
    raise RuntimeError("no se pudo embeber tras varios reintentos")


def embed_all(texts: list[str]) -> np.ndarray:
    vecs = []
    for i, t in enumerate(texts, 1):
        vecs.append(embed(t))
        if i % 20 == 0:
            print(f"  embebidas {i}/{len(texts)}")
        time.sleep(THROTTLE_S)
    return np.array(vecs)


def main():
    with open("intent_dataset.json", "r", encoding="utf-8") as f:
        dataset = json.load(f)

    texts = [d["text"] for d in dataset]
    labels = [d["intent"] for d in dataset]

    print(f"Generando embeddings para {len(texts)} frases...")
    X = embed_all(texts)

    le = LabelEncoder()
    y = le.fit_transform(labels)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    print("Entrenando MLPClassifier...")
    # Config ganadora del sweep (tune_classifier.py): una capa + L2 fuerte
    # → 100% accuracy y confianza media ~0.92 en frases nuevas.
    clf = MLPClassifier(
        hidden_layer_sizes=(128,),
        activation="relu",
        alpha=1e-2,
        max_iter=800,
        random_state=42,
    )
    clf.fit(X_train, y_train)

    y_pred = clf.predict(X_test)
    print("\n=== Resultados ===")
    print(classification_report(y_test, y_pred, target_names=le.classes_))
    print("Matriz de confusión:")
    print(confusion_matrix(y_test, y_pred))
    print(f"\nAccuracy: {clf.score(X_test, y_test):.3f}")

    os.makedirs("models", exist_ok=True)
    joblib.dump(clf, "models/intent_classifier.joblib")
    joblib.dump(le, "models/intent_label_encoder.joblib")
    print("Modelo guardado en models/")


if __name__ == "__main__":
    main()
