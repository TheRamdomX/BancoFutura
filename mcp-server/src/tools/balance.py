"""
Tool: get_balance
Devuelve el saldo de una cuenta dado su ID.
"""
from src.db import Database, first_row
from src.audit import log_action


async def get_balance(account_id: str) -> dict:
    """
    Parámetros:
        account_id: ID de la cuenta (e.g. "account:acc_1")

    Retorna:
        {"account_id": str, "balance": float, "currency": str}
    """
    db = await Database.get()
    try:
        result = await db.query(
            "SELECT id, balance, currency, type, owner.full_name AS titular "
            "FROM type::thing($tb, $id);",
            {"tb": "account", "id": account_id.replace("account:", "")},
        )
        account = first_row(result)
        if not account:
            raise ValueError(f"Cuenta {account_id} no encontrada")

        await log_action(
            actor="agent",
            action="query",
            tool_name="get_balance",
            parameters={"account_id": account_id},
            result={"balance": float(account["balance"])},
            success=True,
        )

        return {
            "account_id": str(account["id"]),
            "titular": account["titular"],
            "balance": float(account["balance"]),
            "currency": account["currency"],
            "type": account["type"],
        }

    except Exception as e:
        await log_action(
            actor="agent",
            action="query",
            tool_name="get_balance",
            parameters={"account_id": account_id},
            success=False,
            error_msg=str(e),
        )
        raise
