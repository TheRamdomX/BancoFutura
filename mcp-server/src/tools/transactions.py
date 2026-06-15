"""
Tool: get_transactions
Devuelve las últimas transacciones de una cuenta.
"""
from src.db import Database, rows_of
from src.audit import log_action


async def get_transactions(
    account_id: str,
    limit: int = 10,
    tx_type: str | None = None,
) -> dict:
    db = await Database.get()
    acct = account_id.replace("account:", "")

    where_clause = (
        "WHERE (from_account = type::thing('account', $acct) "
        "OR to_account = type::thing('account', $acct))"
    )
    if tx_type:
        where_clause += " AND type = $tx_type"

    query = f"""
        SELECT
            id,
            from_account.owner.full_name AS from_name,
            to_account.owner.full_name AS to_name,
            amount,
            type,
            description,
            status,
            created_at
        FROM transaction
        {where_clause}
        ORDER BY created_at DESC
        LIMIT $limit;
    """

    result = await db.query(
        query, {"acct": acct, "limit": limit, "tx_type": tx_type}
    )

    transactions = rows_of(result)

    await log_action(
        actor="agent", action="query",
        tool_name="get_transactions",
        parameters={"account_id": account_id, "limit": limit},
        result={"count": len(transactions)},
        success=True,
    )
    return {
        "account_id": account_id,
        "count": len(transactions),
        "transactions": [
            {
                "id": str(tx["id"]),
                "from": tx.get("from_name"),
                "to": tx.get("to_name"),
                "amount": float(tx["amount"]),
                "type": tx["type"],
                "description": tx.get("description"),
                "status": tx["status"],
                "date": str(tx["created_at"]),
            }
            for tx in transactions
        ],
    }
