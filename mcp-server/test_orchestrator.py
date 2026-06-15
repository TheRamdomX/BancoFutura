"""
Prueba interactiva del orquestador en modo texto (sin audio).
Uso:  python test_orchestrator.py
Requiere SurrealDB corriendo, schema aplicado y GEMINI_API_KEY válida.
"""
import asyncio
from src.orchestrator.agent import ConversationSession

USER_CONTEXT = {
    "name": "Juan Pérez",
    "accounts": [
        {"id": "account:acc_1", "type": "checking", "balance": 1500000},
        {"id": "account:acc_2", "type": "savings", "balance": 3200000},
    ],
    "cards": [
        {"id": "card:card_1", "last_four": "4521", "type": "debit"},
        {"id": "card:card_2", "last_four": "8873", "type": "credit"},
    ],
}


async def main():
    session = ConversationSession(USER_CONTEXT)
    print("=== VoxBank Orquestador (modo texto) ===")
    print("Escribe 'salir' para terminar.\n")

    while True:
        user_input = input("Tú: ").strip()
        if user_input.lower() in ("salir", "exit", "quit"):
            break
        response = await session.process_message(user_input)
        print(f"\nVoxBank: {response}\n")


if __name__ == "__main__":
    asyncio.run(main())
