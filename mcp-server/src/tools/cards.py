"""
Tools: get_card_status, block_card, unblock_card
"""
from src.db import Database, first_row
from src.audit import log_action
from src.security.validations import validate_card_ownership


async def get_card_status(card_id: str) -> dict:
    db = await Database.get()
    result = await db.query(
        """SELECT id, last_four, type, status, daily_limit,
                  account.owner.full_name AS titular
           FROM type::thing('card', $id);""",
        {"id": card_id.replace("card:", "")},
    )
    card = first_row(result)
    if not card:
        raise ValueError(f"Tarjeta {card_id} no encontrada")

    await log_action(
        actor="agent", action="query",
        tool_name="get_card_status",
        parameters={"card_id": card_id},
        result={"status": card["status"]},
        success=True,
    )
    return {
        "card_id": str(card["id"]),
        "last_four": card["last_four"],
        "type": card["type"],
        "status": card["status"],
        "daily_limit": float(card["daily_limit"]),
        "titular": card["titular"],
    }


async def block_card(card_id: str, reason: str = "user_request", actor_user_id: str | None = None) -> dict:
    db = await Database.get()

    # Si se actúa en nombre de un usuario, validar propiedad de la tarjeta
    if actor_user_id:
        await validate_card_ownership(actor_user_id, card_id)

    # Verificar que exista y esté activa
    current = await get_card_status(card_id)
    if current["status"] == "blocked":
        raise ValueError("La tarjeta ya está bloqueada")
    if current["status"] in ("expired", "cancelled"):
        raise ValueError(
            f"No se puede bloquear una tarjeta con estado: {current['status']}"
        )

    await db.query(
        """UPDATE type::thing('card', $id) SET
               status = 'blocked',
               blocked_at = time::now(),
               blocked_by = $reason;""",
        {"id": card_id.replace("card:", ""), "reason": reason},
    )

    await log_action(
        actor="agent", action="block",
        tool_name="block_card",
        parameters={"card_id": card_id, "reason": reason},
        result={"new_status": "blocked"},
        success=True,
    )
    return {"card_id": card_id, "new_status": "blocked", "reason": reason}


async def unblock_card(card_id: str, reason: str = "user_request", actor_user_id: str | None = None) -> dict:
    db = await Database.get()

    # Si se actúa en nombre de un usuario, validar propiedad de la tarjeta
    if actor_user_id:
        await validate_card_ownership(actor_user_id, card_id)

    # Solo se reactiva una tarjeta que esté bloqueada
    current = await get_card_status(card_id)
    if current["status"] == "active":
        raise ValueError("La tarjeta ya está activa")
    if current["status"] in ("expired", "cancelled"):
        raise ValueError(
            f"No se puede reactivar una tarjeta con estado: {current['status']}"
        )

    await db.query(
        """UPDATE type::thing('card', $id) SET
               status = 'active',
               blocked_at = NONE,
               blocked_by = NONE;""",
        {"id": card_id.replace("card:", "")},
    )

    await log_action(
        actor="agent", action="unblock",
        tool_name="unblock_card",
        parameters={"card_id": card_id, "reason": reason},
        result={"new_status": "active"},
        success=True,
    )
    return {"card_id": card_id, "new_status": "active", "reason": reason}
