"""
Entrena el clasificador de intención con embeddings de Gemini + MLPClassifier.
Entrada:  intent_dataset.json   (de generate_training_data.py)
Salida:   models/intent_classifier.joblib, models/intent_label_encoder.joblib
Uso:  GEMINI_API_KEY=... python train_classifier.py
"""
import os
import json
import numpy as np
import joblib
from google import genai
from google.genai import types
from sklearn.model_selection import train_test_split
from sklearn.neural_network import MLPClassifier
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import classification_report, confusion_matrix

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
EMBED_MODEL = os.getenv("GEMINI_EMBED_MODEL", "text-embedding-004")


def embed(text: str) -> list[float]:
    resp = client.models.embed_content(
        model=EMBED_MODEL,
        contents=text,
        config=types.EmbedContentConfig(task_type="RETRIEVAL_QUERY"),
    )
    return list(resp.embeddings[0].values)


def main():
    with open("intent_dataset.json", "r", encoding="utf-8") as f:
        dataset = json.load(f)

    texts = [d["text"] for d in dataset]
    labels = [d["intent"] for d in dataset]

    print(f"Generando embeddings para {len(texts)} frases...")
    X = np.array([embed(t) for t in texts])

    le = LabelEncoder()
    y = le.fit_transform(labels)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    print("Entrenando MLPClassifier...")
    clf = MLPClassifier(
        hidden_layer_sizes=(256, 128),
        activation="relu",
        max_iter=500,
        random_state=42,
        early_stopping=True,
        validation_fraction=0.15,
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
