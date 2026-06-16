"""
Servicio FastAPI que expone el clasificador de intención.
GET /classify?text=...

Estrategia:
- Si existe el modelo ML entrenado (models/intent_classifier.joblib) y hay
  GEMINI_API_KEY válida, usa embeddings + MLPClassifier.
- Si no, degrada a un clasificador por palabras clave (sin red), de modo que
  el servicio SIEMPRE responda y el orquestador pueda usarlo desde el día 1.
"""
import os
from fastapi import FastAPI, Query
from pydantic import BaseModel

from src.intent.keyword_classifier import classify_by_keywords

app = FastAPI(title="VoxBank Intent Classifier")

MODEL_PATH = os.getenv("MODEL_PATH", "models/intent_classifier.joblib")
ENCODER_PATH = os.getenv("ENCODER_PATH", "models/intent_label_encoder.joblib")

_clf = None
_le = None
_genai_client = None


def _load_ml():
    """Carga perezosa del modelo ML; devuelve True si está disponible."""
    global _clf, _le, _genai_client
    if _clf is not None:
        return True
    if not (os.path.exists(MODEL_PATH) and os.path.exists(ENCODER_PATH)):
        return False
    try:
        import joblib
        from google import genai
        _clf = joblib.load(MODEL_PATH)
        _le = joblib.load(ENCODER_PATH)
        _genai_client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
        return True
    except Exception as e:
        print(f"[classifier] no se pudo cargar el modelo ML: {e}")
        return False


def _classify_ml(text: str) -> tuple[str, float, dict]:
    import numpy as np
    from google.genai import types
    # IMPORTANTE: debe coincidir con el embedding usado al entrenar
    # (gemini-embedding-001 @ 768 dims, L2-normalizado).
    resp = _genai_client.models.embed_content(
        model=os.getenv("GEMINI_EMBED_MODEL", "gemini-embedding-001"),
        contents=text,
        config=types.EmbedContentConfig(
            task_type="RETRIEVAL_QUERY",
            output_dimensionality=int(os.getenv("GEMINI_EMBED_DIM", "768")),
        ),
    )
    v = np.array(resp.embeddings[0].values, dtype=np.float32)
    norm = np.linalg.norm(v)
    if norm > 0:
        v = v / norm
    embedding = v.reshape(1, -1)
    probs = _clf.predict_proba(embedding)[0]
    idx = int(np.argmax(probs))
    intent = _le.inverse_transform([idx])[0]
    all_scores = {
        _le.inverse_transform([i])[0]: round(float(p), 4) for i, p in enumerate(probs)
    }
    return intent, round(float(probs[idx]), 4), all_scores


class ClassificationResult(BaseModel):
    text: str
    intent: str
    confidence: float
    all_scores: dict[str, float]
    method: str


@app.get("/classify", response_model=ClassificationResult)
async def classify(text: str = Query(..., min_length=1)):
    if _load_ml():
        try:
            intent, conf, scores = _classify_ml(text)
            return ClassificationResult(
                text=text, intent=intent, confidence=conf,
                all_scores=scores, method="ml",
            )
        except Exception as e:
            print(f"[classifier] fallo ML, uso keywords: {e}")

    intent, conf, scores = classify_by_keywords(text)
    return ClassificationResult(
        text=text, intent=intent, confidence=conf,
        all_scores=scores, method="keyword",
    )


@app.get("/health")
async def health():
    return {"status": "ok", "ml_available": _load_ml()}
