"""
Validaciones de negocio que el MCP server aplica al actuar en nombre de un
usuario autenticado. El MCP se conecta como root (bypassa permisos de fila),
por lo que la propiedad de la cuenta/tarjeta debe verificarse explícitamente.
"""
from src.db import Database, first_row, rows_of

DAILY_TRANSFER_LIMIT = 10_000_000  # CLP


async def validate_transfer_permissions(
    user_id: str, from_account_id: str, amount: float
) -> None:
    """Valida propiedad, estado y límite diario antes de transferir.

    user_id: record id del usuario (e.g. 'user:demo_1' o 'demo_1').
    Lanza PermissionError / ValueError si alguna verificación falla.
    """
    db = await Database.get()
    uid = user_id.replace("user:", "")
    acct = from_account_id.replace("account:", "")

    # ¿Es dueño de la cuenta origen?
    owner = first_row(await db.query(
        """SELECT id FROM type::thing('account', $acct)
           WHERE owner = type::thing('user', $uid);""",
        {"acct": acct, "uid": uid},
    ))
    if not owner:
        raise PermissionError("No tienes permiso sobre esta cuenta")

    # ¿Cuenta activa?
    account = first_row(await db.query(
        "SELECT is_active FROM type::thing('account', $acct);", {"acct": acct}
    ))
    if not account or not account.get("is_active", True):
        raise ValueError("La cuenta de origen no está activa")

    # Límite diario acumulado
    agg = first_row(await db.query(
        """SELECT math::sum(amount) AS total FROM transaction
           WHERE from_account = type::thing('account', $acct)
             AND created_at >= time::now() - 24h
             AND status = 'completed'
           GROUP ALL;""",
        {"acct": acct},
    ))
    current_daily = float((agg or {}).get("total", 0) or 0)
    if current_daily + amount > DAILY_TRANSFER_LIMIT:
        raise ValueError(
            f"Excederías el límite diario de transferencias. "
            f"Transferido hoy: ${current_daily:,.0f} CLP"
        )


async def validate_card_ownership(user_id: str, card_id: str) -> None:
    """Verifica que la tarjeta pertenezca al usuario autenticado."""
    db = await Database.get()
    uid = user_id.replace("user:", "")
    cid = card_id.replace("card:", "")
    owned = rows_of(await db.query(
        """SELECT id FROM type::thing('card', $cid)
           WHERE account.owner = type::thing('user', $uid);""",
        {"cid": cid, "uid": uid},
    ))
    if not owned:
        raise PermissionError("No tienes permiso sobre esta tarjeta")
