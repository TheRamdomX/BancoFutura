"""
Cliente singleton para SurrealDB.
Todas las operaciones bancarias pasan por aquí.
"""
import os
from surrealdb import AsyncSurreal


class Database:
    _instance: "AsyncSurreal | None" = None

    @classmethod
    async def get(cls) -> "AsyncSurreal":
        if cls._instance is None:
            db = AsyncSurreal(os.getenv("SURREAL_URL", "ws://localhost:8000/rpc"))
            await db.connect()
            await db.signin({
                "username": os.getenv("SURREAL_USER", "root"),
                "password": os.getenv("SURREAL_PASS", "root"),
            })
            await db.use(
                os.getenv("SURREAL_NS", "banco"),
                os.getenv("SURREAL_DB", "futura"),
            )
            cls._instance = db
        return cls._instance


def first_row(result):
    """
    Normaliza el resultado de `db.query()` a la primera fila (dict) o None.

    El SDK moderno de SurrealDB (>=1.0) devuelve directamente la lista de
    registros de la última sentencia; versiones antiguas envuelven en
    [{"result": [...]}]. Este helper soporta ambos.
    """
    rows = rows_of(result)
    return rows[0] if rows else None


def rows_of(result):
    """Devuelve la lista de filas de un resultado de query, agnóstico de versión."""
    if result is None:
        return []
    # SDK antiguo: [{"status": "OK", "result": [...]}]
    if isinstance(result, list) and result and isinstance(result[0], dict) and "result" in result[0]:
        return result[-1].get("result") or []
    # SDK moderno: la query() devuelve directamente la lista de registros
    if isinstance(result, list):
        return result
    return [result]
