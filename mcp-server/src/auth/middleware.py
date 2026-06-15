"""
Validación de tokens JWT emitidos por SurrealDB (DEFINE ACCESS user_access).
"""
import os
from surrealdb import AsyncSurreal

from src.db import first_row


async def validate_user_token(token: str) -> dict | None:
    """
    Valida un token JWT de SurrealDB y devuelve los datos del usuario.
    Si el token es inválido o expirado, devuelve None.

    Usa una conexión efímera autenticada CON EL TOKEN (no root), de modo que
    los permisos a nivel de fila garanticen que solo se vea al propio usuario.
    """
    db = AsyncSurreal(os.getenv("SURREAL_URL", "ws://localhost:8000/rpc"))
    try:
        await db.connect()
        await db.use(
            os.getenv("SURREAL_NS", "banco"),
            os.getenv("SURREAL_DB", "futura"),
        )
        await db.authenticate(token)
        user = first_row(await db.query("SELECT id, username, full_name FROM user;"))
        return user
    except Exception:
        return None
    finally:
        try:
            await db.close()
        except Exception:
            pass
