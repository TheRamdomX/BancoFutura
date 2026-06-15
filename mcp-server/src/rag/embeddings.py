"""
Generación de embeddings con Gemini text-embedding-004 (768 dims).
Usa el SDK moderno google-genai (el mismo cliente del orquestador).
"""
import os
from google import genai
from google.genai import types

EMBED_MODEL = os.getenv("GEMINI_EMBED_MODEL", "text-embedding-004")

_client: genai.Client | None = None


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        _client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
    return _client


def embed(text: str, task_type: str = "RETRIEVAL_DOCUMENT") -> list[float]:
    """
    Genera el embedding de un texto.
    task_type: RETRIEVAL_DOCUMENT (ingestión) | RETRIEVAL_QUERY (consulta).
    """
    resp = _get_client().models.embed_content(
        model=EMBED_MODEL,
        contents=text,
        config=types.EmbedContentConfig(task_type=task_type),
    )
    return list(resp.embeddings[0].values)
