"""
Pipeline de ingestión de documentos para la capa RAG.
1. Lee archivos .md de knowledge_base/
2. Los divide en chunks (con solapamiento)
3. Genera embeddings (Gemini text-embedding-004)
4. Los almacena en SurrealDB (kb_document + kb_chunk)

Uso:  python -m src.rag.ingest
"""
import os
import glob
import asyncio

from src.db import Database, first_row
from src.rag.embeddings import embed

CHUNK_SIZE = 500       # caracteres por chunk
CHUNK_OVERLAP = 100    # solapamiento entre chunks

KB_DIR = os.getenv("KB_DIR", "knowledge_base")


def split_into_chunks(text: str, size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """Divide texto en chunks con solapamiento, cortando en saltos/puntos."""
    chunks = []
    start = 0
    while start < len(text):
        end = start + size
        chunk = text[start:end]
        if end < len(text):
            last_break = max(chunk.rfind("\n"), chunk.rfind(". "))
            if last_break > size * 0.3:
                end = start + last_break + 1
                chunk = text[start:end]
        chunks.append(chunk.strip())
        start = end - overlap
    return [c for c in chunks if len(c) > 50]


async def ingest_document(filepath: str) -> dict:
    db = await Database.get()

    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    filename = os.path.basename(filepath).replace(".md", "")
    title = content.split("\n")[0].replace("# ", "").strip()
    category = filename.replace("_", " ").title()

    doc = first_row(await db.query(
        "CREATE kb_document SET title = $title, category = $category, content = $content;",
        {"title": title, "category": category, "content": content},
    ))
    doc_id = doc["id"]

    chunks = split_into_chunks(content)
    for i, chunk_text in enumerate(chunks):
        embedding = embed(chunk_text, task_type="RETRIEVAL_DOCUMENT")
        await db.query(
            """CREATE kb_chunk SET
                   document = $doc_id,
                   content = $content,
                   chunk_index = $idx,
                   embedding = $embedding;""",
            {"doc_id": doc_id, "content": chunk_text, "idx": i, "embedding": embedding},
        )

    return {"document": str(doc_id), "title": title, "chunks": len(chunks)}


async def ingest_all() -> list[dict]:
    # Limpiar ingestión previa (idempotente)
    db = await Database.get()
    await db.query("DELETE kb_chunk; DELETE kb_document;")

    files = sorted(glob.glob(os.path.join(KB_DIR, "*.md")))
    print(f"Encontrados {len(files)} documentos en {KB_DIR}/")

    results = []
    for f in files:
        print(f"  Procesando: {f}")
        r = await ingest_document(f)
        results.append(r)
        print(f"    → {r['chunks']} chunks insertados")

    print(f"\nTotal: {sum(r['chunks'] for r in results)} chunks")
    return results


if __name__ == "__main__":
    asyncio.run(ingest_all())
