"""
Registra cada operación ejecutada por el agente en audit_log.
"""
from src.db import Database


async def log_action(
    actor: str,
    action: str,
    tool_name: str,
    parameters: dict | None = None,
    result: dict | None = None,
    success: bool = True,
    error_msg: str | None = None,
) -> None:
    db = await Database.get()
    await db.query(
        """
        CREATE audit_log SET
            actor      = $actor,
            action     = $action,
            tool_name  = $tool_name,
            parameters = $parameters,
            result     = $result,
            success    = $success,
            error_msg  = $error_msg;
        """,
        {
            "actor": actor,
            "action": action,
            "tool_name": tool_name,
            "parameters": parameters,
            "result": result,
            "success": success,
            "error_msg": error_msg,
        },
    )
