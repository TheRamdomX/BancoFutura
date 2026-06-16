"""
Definiciones de herramientas para Gemini function calling.
Espejo de las tools del MCP server (src/tools/*).
"""

TOOL_DECLARATIONS = [
    {
        "name": "get_balance",
        "description": (
            "Consulta el saldo actual de una cuenta bancaria del usuario. "
            "Retorna el saldo, moneda, tipo de cuenta y nombre del titular."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "account_id": {
                    "type": "string",
                    "description": "ID de la cuenta, e.g. 'account:acc_1'",
                }
            },
            "required": ["account_id"],
        },
    },
    {
        "name": "make_transfer",
        "description": (
            "Realiza una transferencia bancaria. SIEMPRE pedir confirmación "
            "explícita al usuario antes de ejecutar. Informar monto, origen "
            "y destino antes de confirmar."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "from_account_id": {"type": "string"},
                "to_account_id": {"type": "string"},
                "amount": {"type": "number"},
                "description": {"type": "string"},
            },
            "required": ["from_account_id", "to_account_id", "amount"],
        },
    },
    {
        "name": "get_transactions",
        "description": "Obtiene el historial de transacciones de una cuenta.",
        "parameters": {
            "type": "object",
            "properties": {
                "account_id": {"type": "string"},
                "limit": {"type": "integer"},
                "tx_type": {"type": "string"},
            },
            "required": ["account_id"],
        },
    },
    {
        "name": "get_card_status",
        "description": "Consulta el estado actual de una tarjeta.",
        "parameters": {
            "type": "object",
            "properties": {
                "card_id": {"type": "string"},
            },
            "required": ["card_id"],
        },
    },
    {
        "name": "block_card",
        "description": (
            "Bloquea una tarjeta de forma inmediata. "
            "SIEMPRE confirmar con el usuario antes de ejecutar."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "card_id": {"type": "string"},
                "reason": {"type": "string"},
            },
            "required": ["card_id"],
        },
    },
    {
        "name": "unblock_card",
        "description": (
            "Reactiva (desbloquea) una tarjeta previamente bloqueada. "
            "SIEMPRE confirmar con el usuario antes de ejecutar."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "card_id": {"type": "string"},
                "reason": {"type": "string"},
            },
            "required": ["card_id"],
        },
    },
    {
        "name": "search_knowledge_base",
        "description": (
            "Busca información en la base de conocimiento del banco: "
            "políticas, límites, procedimientos, preguntas frecuentes."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "limit": {"type": "integer"},
            },
            "required": ["query"],
        },
    },
]
