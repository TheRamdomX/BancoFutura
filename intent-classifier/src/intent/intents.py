"""
Taxonomía de intenciones de VoxBank y frases semilla.
Cada intención corresponde 1:1 con una tool del MCP server (o ninguna).
"""

# Frases semilla por intención (se expanden con Gemini en generate_training_data.py)
INTENTS = {
    "check_balance": [
        "¿Cuál es mi saldo?",
        "Quiero ver cuánta plata tengo",
        "Dime mi balance",
    ],
    "make_transfer": [
        "Quiero transferir 50 mil pesos",
        "Necesito mandar plata a otra cuenta",
        "Haz una transferencia",
    ],
    "list_transactions": [
        "Muéstrame mis últimos movimientos",
        "¿Qué transacciones he hecho?",
        "Quiero ver mi historial",
    ],
    "check_card": [
        "¿Mi tarjeta está activa?",
        "Quiero ver el estado de mi tarjeta",
        "¿Cómo está mi tarjeta de débito?",
    ],
    "block_card": [
        "Bloquea mi tarjeta",
        "Perdí mi tarjeta, bloquéala",
        "Necesito desactivar mi tarjeta ahora",
    ],
    "ask_info": [
        "¿Cuál es el límite de transferencia?",
        "¿Cuáles son los horarios de transferencia?",
        "¿Qué comisiones cobra el banco?",
    ],
    "out_of_scope": [
        "¿Cuál es el clima hoy?",
        "Cuéntame un chiste",
        "¿Quién ganó el partido?",
    ],
}

INTENT_NAMES = list(INTENTS.keys())

# Mapeo intención → tool del MCP server (referencia para el orquestador)
INTENT_TO_TOOL = {
    "check_balance": "get_balance",
    "make_transfer": "make_transfer",
    "list_transactions": "get_transactions",
    "check_card": "get_card_status",
    "block_card": "block_card",
    "ask_info": "search_knowledge_base",
    "out_of_scope": None,
}

# Palabras clave para el clasificador de respaldo (sin modelo ML / sin red).
KEYWORDS = {
    "block_card": ["bloque", "bloquea", "desactiv", "perdí", "robaron", "robo", "cancela tarjeta"],
    "check_card": ["estado de mi tarjeta", "tarjeta activa", "mi tarjeta", "tarjeta de", "cupo"],
    "make_transfer": ["transf", "manda", "envia", "envía", "girar", "pasar plata", "pagar a"],
    "list_transactions": ["movimiento", "transacc", "historial", "últimos", "ultimos", "gastos"],
    "check_balance": ["saldo", "balance", "cuánta plata", "cuanta plata", "cuánto tengo", "cuanto tengo"],
    "ask_info": ["límite", "limite", "horario", "comisión", "comision", "política", "politica",
                 "requisito", "cómo funciona", "como funciona", "cuánto puedo", "cuanto puedo"],
}
