"""
Retriever híbrido: combina BM25 (full-text) + similitud vectorial (MTREE).
Degrada a BM25-only si los embeddings (Gemini) no están disponibles.
"""
from src.db import Database, rows_of
from src.rag.embeddings import embed

TOP_K = 5
BM25_WEIGHT = 0.4
VECTOR_WEIGHT = 0.6


async def search_bm25(query: str, limit: int = TOP_K) -> list[dict]:
    """Búsqueda full-text con BM25 sobre kb_chunk."""
    db = await Database.get()
    results = await db.query(
        """SELECT
               id,
               content,
               document.title AS doc_title,
               search::score(1) AS bm25_score
           FROM kb_chunk
           WHERE content @1@ $query
           ORDER BY bm25_score DESC
           LIMIT $limit;""",
        {"query": query, "limit": limit},
    )
    return rows_of(results)


async def search_vector(query: str, limit: int = TOP_K) -> list[dict]:
    """Búsqueda por similitud de embeddings con el índice MTREE."""
    db = await Database.get()
    embedding = embed(query, task_type="RETRIEVAL_QUERY")
    k = int(limit)  # el operador KNN exige un entero literal
    results = await db.query(
        f"""SELECT
               id,
               content,
               document.title AS doc_title,
               vector::similarity::cosine(embedding, $vec) AS vec_score
           FROM kb_chunk
           WHERE embedding <|{k}|> $vec
           ORDER BY vec_score DESC;""",
        {"vec": embedding},
    )
    return rows_of(results)


def _normalize(results: list, score_key: str) -> dict:
    if not results:
        return {}
    max_score = max((r[score_key] or 0) for r in results) or 1
    return {
        str(r["id"]): {**r, "normalized_score": (r[score_key] or 0) / max_score}
        for r in results
    }


async def hybrid_search(query: str, limit: int = TOP_K) -> list[dict]:
    """
    Combina BM25 + vectorial con pesos configurables.
    Si la búsqueda vectorial falla (sin Gemini), usa solo BM25.
    """
    bm25_results = await search_bm25(query, limit * 2)

    try:
        vec_results = await search_vector(query, limit * 2)
    except Exception as e:
        print(f"[retriever] búsqueda vectorial no disponible, uso BM25-only: {e}")
        vec_results = []

    bm25_map = _normalize(bm25_results, "bm25_score")
    vec_map = _normalize(vec_results, "vec_score")

    all_ids = set(bm25_map.keys()) | set(vec_map.keys())
    fused = []
    for chunk_id in all_ids:
        bm25_score = bm25_map.get(chunk_id, {}).get("normalized_score", 0)
        vec_score = vec_map.get(chunk_id, {}).get("normalized_score", 0)
        combined = BM25_WEIGHT * bm25_score + VECTOR_WEIGHT * vec_score
        data = bm25_map.get(chunk_id) or vec_map.get(chunk_id)
        fused.append({
            "id": chunk_id,
            "content": data["content"],
            "doc_title": data.get("doc_title", ""),
            "bm25_score": bm25_score,
            "vec_score": vec_score,
            "combined_score": combined,
        })

    fused.sort(key=lambda x: x["combined_score"], reverse=True)
    return fused[:limit]
