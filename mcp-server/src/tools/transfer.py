"""
Tool: make_transfer
Ejecuta una transferencia entre dos cuentas con validaciones.
"""
from decimal import Decimal
from src.db import Database, first_row
from src.audit import log_action
from src.security.validations import validate_transfer_permissions

MAX_SINGLE_TRANSFER = Decimal("5000000")  # 5M CLP


async def make_transfer(
    from_account_id: str,
    to_account_id: str,
    amount: float,
    description: str = "",
    actor_user_id: str | None = None,
) -> dict:
    """
    Parámetros:
        from_account_id: cuenta origen (e.g. "account:acc_1")
        to_account_id:   cuenta destino (e.g. "account:acc_3")
        amount:          monto a transferir (> 0)
        description:     descripción opcional

    Retorna:
        {"status": str, "amount": float, "new_balance_origin": float}
    """
    db = await Database.get()
    amount_d = Decimal(str(amount))

    # --- Validaciones de negocio ---
    if amount_d <= 0:
        raise ValueError("El monto debe ser mayor a 0")
    if amount_d > MAX_SINGLE_TRANSFER:
        raise ValueError(
            f"El monto excede el límite por transferencia "
            f"({MAX_SINGLE_TRANSFER} CLP)"
        )
    if from_account_id == to_account_id:
        raise ValueError("La cuenta origen y destino no pueden ser la misma")

    # Si se actúa en nombre de un usuario, validar propiedad/estado/límite diario
    if actor_user_id:
        await validate_transfer_permissions(actor_user_id, from_account_id, float(amount_d))

    try:
        # Verificar saldo suficiente
        origin = await db.query(
            "SELECT balance FROM type::thing('account', $id);",
            {"id": from_account_id.replace("account:", "")},
        )
        origin_row = first_row(origin)
        if not origin_row:
            raise ValueError(f"Cuenta origen {from_account_id} no encontrada")
        origin_balance = Decimal(str(origin_row["balance"]))
        if origin_balance < amount_d:
            raise ValueError(
                f"Saldo insuficiente. Disponible: {origin_balance} CLP"
            )

        # Ejecutar transferencia (actualizar ambas cuentas + crear transacción)
        await db.query(
            """
            BEGIN TRANSACTION;

            UPDATE type::thing('account', $from_id)
                SET balance -= $amount;

            UPDATE type::thing('account', $to_id)
                SET balance += $amount;

            CREATE transaction SET
                from_account = type::thing('account', $from_id),
                to_account   = type::thing('account', $to_id),
                amount       = $amount,
                type         = 'transfer',
                description  = $desc,
                status       = 'completed';

            COMMIT TRANSACTION;
            """,
            {
                "from_id": from_account_id.replace("account:", ""),
                "to_id": to_account_id.replace("account:", ""),
                "amount": float(amount_d),
                "desc": description,
            },
        )

        # Obtener nuevo saldo
        new_bal = await db.query(
            "SELECT balance FROM type::thing('account', $id);",
            {"id": from_account_id.replace("account:", "")},
        )

        response = {
            "status": "completed",
            "amount": float(amount_d),
            "new_balance_origin": float(first_row(new_bal)["balance"]),
        }

        await log_action(
            actor="agent",
            action="transfer",
            tool_name="make_transfer",
            parameters={
                "from": from_account_id,
                "to": to_account_id,
                "amount": float(amount_d),
            },
            result=response,
            success=True,
        )

        return response

    except Exception as e:
        await log_action(
            actor="agent",
            action="transfer",
            tool_name="make_transfer",
            parameters={
                "from": from_account_id,
                "to": to_account_id,
                "amount": float(amount_d),
            },
            success=False,
            error_msg=str(e),
        )
        raise
