"""
Clasificador de respaldo por palabras clave.
Determinista, sin red ni modelo entrenado. Se usa cuando el modelo ML
(intent_classifier.joblib) no está disponible todavía.
"""
from src.intent.intents import KEYWORDS, INTENT_NAMES


def classify_by_keywords(text: str) -> tuple[str, float, dict]:
    t = text.lower()
    scores = {name: 0.0 for name in INTENT_NAMES}

    for intent, kws in KEYWORDS.items():
        for kw in kws:
            if kw in t:
                scores[intent] += 1.0

    total = sum(scores.values())
    if total == 0:
        # Nada matchea → fuera de alcance con baja confianza
        scores["out_of_scope"] = 1.0
        total = 1.0

    probs = {k: round(v / total, 4) for k, v in scores.items()}
    best = max(probs, key=probs.get)
    return best, probs[best], probs
