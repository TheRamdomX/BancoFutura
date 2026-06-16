"""
Punto de entrada del MCP server.
Expone las tools bancarias vía el protocolo MCP (transporte stdio).
"""
import asyncio
import json
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent

from src.tools.balance import get_balance
from src.tools.transfer import make_transfer
from src.tools.cards import get_card_status, block_card, unblock_card
from src.tools.transactions import get_transactions
from src.tools.knowledge import search_knowledge_base

server = Server("voxbank-mcp")

# ── Registro de tools ──────────────────────────────────────

TOOLS = [
    Tool(
        name="get_balance",
        description=(
            "Consulta el saldo actual de una cuenta bancaria. "
            "Retorna saldo, moneda, tipo de cuenta y titular."
        ),
        inputSchema={
            "type": "object",
            "properties": {
                "account_id": {
                    "type": "string",
                    "description": "ID de la cuenta, e.g. 'account:acc_1'",
                }
            },
            "required": ["account_id"],
        },
    ),
    Tool(
        name="make_transfer",
        description=(
            "Realiza una transferencia entre dos cuentas. "
            "Requiere confirmación del usuario antes de ejecutar. "
            "Valida saldo suficiente y límite máximo."
        ),
        inputSchema={
            "type": "object",
            "properties": {
                "from_account_id": {
                    "type": "string",
                    "description": "Cuenta origen",
                },
                "to_account_id": {
                    "type": "string",
                    "description": "Cuenta destino",
                },
                "amount": {
                    "type": "number",
                    "description": "Monto en CLP (> 0, máx 5.000.000)",
                },
                "description": {
                    "type": "string",
                    "description": "Descripción de la transferencia",
                },
            },
            "required": ["from_account_id", "to_account_id", "amount"],
        },
    ),
    Tool(
        name="get_card_status",
        description="Consulta el estado actual de una tarjeta (activa, bloqueada, etc).",
        inputSchema={
            "type": "object",
            "properties": {
                "card_id": {
                    "type": "string",
                    "description": "ID de la tarjeta, e.g. 'card:card_1'",
                }
            },
            "required": ["card_id"],
        },
    ),
    Tool(
        name="block_card",
        description=(
            "Bloquea una tarjeta de forma inmediata. "
            "Requiere confirmación del usuario."
        ),
        inputSchema={
            "type": "object",
            "properties": {
                "card_id": {"type": "string", "description": "ID de la tarjeta"},
                "reason": {
                    "type": "string",
                    "description": "Motivo del bloqueo",
                    "default": "user_request",
                },
            },
            "required": ["card_id"],
        },
    ),
    Tool(
        name="unblock_card",
        description=(
            "Reactiva (desbloquea) una tarjeta previamente bloqueada. "
            "Requiere confirmación del usuario."
        ),
        inputSchema={
            "type": "object",
            "properties": {
                "card_id": {"type": "string", "description": "ID de la tarjeta"},
                "reason": {
                    "type": "string",
                    "description": "Motivo del desbloqueo",
                    "default": "user_request",
                },
            },
            "required": ["card_id"],
        },
    ),
    Tool(
        name="get_transactions",
        description="Lista las últimas transacciones de una cuenta.",
        inputSchema={
            "type": "object",
            "properties": {
                "account_id": {"type": "string"},
                "limit": {
                    "type": "integer",
                    "description": "Cantidad máxima (default 10)",
                    "default": 10,
                },
                "tx_type": {
                    "type": "string",
                    "enum": ["transfer", "deposit", "withdrawal", "payment"],
                    "description": "Filtrar por tipo (opcional)",
                },
            },
            "required": ["account_id"],
        },
    ),
    Tool(
        name="search_knowledge_base",
        description=(
            "Busca en la base de conocimiento del banco (políticas, FAQs, "
            "normativas). Útil para preguntas sobre límites, horarios o "
            "procedimientos. (Capa RAG — Fase 4.)"
        ),
        inputSchema={
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Consulta en lenguaje natural"},
                "limit": {"type": "integer", "default": 5},
            },
            "required": ["query"],
        },
    ),
]


@server.list_tools()
async def list_tools():
    return TOOLS


@server.call_tool()
async def call_tool(name: str, arguments: dict):
    """Despacha la llamada a la función correspondiente."""
    handlers = {
        "get_balance": get_balance,
        "get_card_status": get_card_status,
        "block_card": block_card,
        "unblock_card": unblock_card,
        "make_transfer": make_transfer,
        "get_transactions": get_transactions,
        "search_knowledge_base": search_knowledge_base,
    }

    handler = handlers.get(name)
    if not handler:
        return [TextContent(type="text", text=f"Tool '{name}' no encontrada")]

    try:
        result = await handler(**arguments)
        return [TextContent(type="text", text=json.dumps(result, ensure_ascii=False))]
    except Exception as e:
        return [TextContent(type="text", text=json.dumps({
            "error": True,
            "message": str(e),
        }))]


async def main():
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
