"""
Prueba manual de las tools contra una instancia viva de SurrealDB.
Uso:  python -m tests.test_tools_live
Requiere SurrealDB corriendo con el schema aplicado.
"""
import asyncio
import json

from src.tools.balance import get_balance
from src.tools.transfer import make_transfer
from src.tools.cards import get_card_status, block_card
from src.tools.transactions import get_transactions
from src.db import Database


def show(label, value):
    print(f"\n=== {label} ===")
    print(json.dumps(value, ensure_ascii=False, indent=2, default=str))


async def main():
    show("get_balance(account:acc_1)", await get_balance("account:acc_1"))

    show("make_transfer acc_1 -> acc_3 (10000)",
         await make_transfer("account:acc_1", "account:acc_3", 10000, "test e2e"))

    show("get_balance(account:acc_1) tras transferencia",
         await get_balance("account:acc_1"))

    show("get_transactions(account:acc_1)",
         await get_transactions("account:acc_1", limit=5))

    show("get_card_status(card:card_2)", await get_card_status("card:card_2"))
    show("block_card(card:card_2)", await block_card("card:card_2", "prueba"))

    # Validaciones esperadas (deben fallar)
    for label, coro in [
        ("saldo insuficiente", make_transfer("account:acc_3", "account:acc_1", 999999999)),
        ("bloquear tarjeta ya bloqueada", block_card("card:card_2")),
        ("monto negativo", make_transfer("account:acc_1", "account:acc_3", -5)),
    ]:
        try:
            await coro
            print(f"\n[!] {label}: NO lanzó error (inesperado)")
        except Exception as e:
            print(f"\n[ok] {label} rechazado: {e}")

    # Auditoría
    db = await Database.get()
    from src.db import rows_of
    audit = rows_of(await db.query("SELECT tool_name, success, error_msg, timestamp FROM audit_log ORDER BY timestamp DESC LIMIT 8;"))
    show("audit_log (últimas 8)", audit)


if __name__ == "__main__":
    asyncio.run(main())
