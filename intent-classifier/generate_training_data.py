"""
Genera un dataset de entrenamiento usando Gemini para parafrasear las frases
semilla de cada intención.  Salida: intent_dataset.json
Uso:  GEMINI_API_KEY=... python generate_training_data.py
"""
import os
import json
from google import genai

from src.intent.intents import INTENTS

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")


def generate_variations(intent: str, seeds: list[str], n: int = 30) -> list[str]:
    prompt = f"""Genera {n} variaciones en español chileno de las siguientes frases
que expresan la intención "{intent}" en un contexto bancario.
Las variaciones deben ser naturales, coloquiales, e incluir modismos chilenos.
Incluye errores ortográficos ocasionales que un usuario real haría.
Frases semilla: {json.dumps(seeds, ensure_ascii=False)}
Responde SOLO con un JSON array de strings, sin explicaciones."""
    response = client.models.generate_content(model=MODEL, contents=prompt)
    raw = (response.text or "").strip().replace("```json", "").replace("```", "")
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        print(f"  [!] Error parseando respuesta para {intent}")
        return []


def main():
    dataset = []
    for intent, seeds in INTENTS.items():
        print(f"Generando variaciones para: {intent}")
        for phrase in generate_variations(intent, seeds):
            dataset.append({"text": phrase, "intent": intent})
        # Incluir también las semillas originales
        for phrase in seeds:
            dataset.append({"text": phrase, "intent": intent})

    with open("intent_dataset.json", "w", encoding="utf-8") as f:
        json.dump(dataset, f, ensure_ascii=False, indent=2)
    print(f"\nDataset generado: {len(dataset)} ejemplos → intent_dataset.json")


if __name__ == "__main__":
    main()
