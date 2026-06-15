"""
Tool: search_knowledge_base  (capa RAG, Fase 4)
Búsqueda híbrida BM25 + vectorial sobre la base de conocimiento del banco.

Degrada con elegancia: si no hay chunks ingestados o la búsqueda falla,
devuelve un resultado vacío con un mensaje, sin romper el flujo del orquestador.
"""
from src.rag.retriever import hybrid_search
from src.audit import log_action


async def search_knowledge_base(query: str, limit: int = 5) -> dict:
    try:
        results = await hybrid_search(query, limit)
    except Exception as e:
        await log_action(
            actor="agent", action="rag_search",
            tool_name="search_knowledge_base",
            parameters={"query": query, "limit": limit},
            success=False, error_msg=str(e),
        )
        return {
            "query": query,
            "available": False,
            "results": [],
            "message": "La base de conocimiento no está disponible en este momento.",
        }

    await log_action(
        actor="agent", action="rag_search",
        tool_name="search_knowledge_base",
        parameters={"query": query, "limit": limit},
        result={"results_count": len(results)},
        success=True,
    )

    return {
        "query": query,
        "available": True,
        "results_count": len(results),
        "results": [
            {
                "content": r["content"],
                "source": r["doc_title"],
                "relevance": round(r["combined_score"], 3),
            }
            for r in results
        ],
    }
