"""
Puente entre la app Expo y el backend.

- WebSocket /ws/chat/{user_id}: conversación con el orquestador Gemini.
  El PRIMER mensaje debe ser {"token": "<jwt>"}; se valida contra SurrealDB.
- REST /api/*: operaciones de escritura usadas por la UI "sin IA" (Fase 3),
  protegidas con el JWT del usuario (header Authorization: Bearer <jwt>).

El backend es el único con credenciales de escritura en SurrealDB; toda
operación sensible valida propiedad/límites contra el usuario autenticado.
"""
import asyncio
import base64
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from src.db import Database, first_row, rows_of
from src.tools.transfer import make_transfer
from src.tools.cards import block_card
from src.auth.middleware import validate_user_token
from src.audit import log_action

app = FastAPI(title="VoxBank Orchestrator")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # dev
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def update_ui_state(screen: str, action: str | None = None, message: str | None = None):
    """Actualiza ui_state en SurrealDB para que el frontend reaccione (live query)."""
    db = await Database.get()
    await db.query(
        """UPDATE ui_state:current SET
               active_screen = $screen,
               last_action = $action,
               agent_message = $message;""",
        {"screen": screen, "action": action, "message": message},
    )


ACTION_TO_SCREEN = {
    "get_balance": "DashboardScreen",
    "make_transfer": "DashboardScreen",
    "get_transactions": "MovementsScreen",
    "get_card_status": "CardsScreen",
    "block_card": "CardsScreen",
    "search_knowledge_base": "DashboardScreen",
}


@app.get("/health")
async def health():
    return {"status": "ok"}


# ── Auth helper para REST ──────────────────────────────────
async def require_user(authorization: str | None = Header(None)) -> dict:
    """Valida el header Authorization: Bearer <jwt> y devuelve el usuario."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Token requerido")
    token = authorization.split(" ", 1)[1].strip()
    user = await validate_user_token(token)
    if not user:
        raise HTTPException(status_code=403, detail="Token inválido o expirado")
    return user


# ── REST: operaciones de escritura (Fase 3), autenticadas ──
class TransferBody(BaseModel):
    from_account_id: str
    to_account_id: str
    amount: float
    description: str = ""


class BlockCardBody(BaseModel):
    card_id: str
    reason: str = "user_request"


@app.post("/api/transfer")
async def api_transfer(body: TransferBody, authorization: str | None = Header(None)):
    user = await require_user(authorization)
    try:
        result = await make_transfer(
            body.from_account_id, body.to_account_id, body.amount, body.description,
            actor_user_id=str(user["id"]),
        )
        await update_ui_state("DashboardScreen", "make_transfer", "Transferencia realizada")
        return result
    except Exception as e:
        return {"error": True, "message": str(e)}


@app.post("/api/cards/block")
async def api_block_card(body: BlockCardBody, authorization: str | None = Header(None)):
    user = await require_user(authorization)
    try:
        result = await block_card(body.card_id, body.reason, actor_user_id=str(user["id"]))
        await update_ui_state("CardsScreen", "block_card", "Tarjeta bloqueada")
        return result
    except Exception as e:
        return {"error": True, "message": str(e)}


# ── WebSocket: conversación con el orquestador Gemini ──────
def _jsonable_rows(rows: list) -> list:
    """Convierte RecordID/Decimal de SurrealDB a tipos JSON-serializables."""
    out = []
    for row in rows:
        clean = {}
        for k, v in row.items():
            if k == "id" or hasattr(v, "table_name"):  # RecordID
                clean[k] = str(v)
            else:
                try:
                    clean[k] = float(v) if k == "balance" else v
                except (TypeError, ValueError):
                    clean[k] = str(v)
        out.append(clean)
    return out


async def load_user_context(user_id: str) -> dict | None:
    db = await Database.get()
    uid = user_id.replace("user:", "")
    user = first_row(await db.query(
        "SELECT id, full_name FROM type::thing('user', $uid);", {"uid": uid}
    ))
    if not user:
        return None
    accounts = await db.query(
        "SELECT id, type, balance FROM account WHERE owner = type::thing('user', $uid);",
        {"uid": uid},
    )
    cards = await db.query(
        "SELECT id, last_four, type, status FROM card "
        "WHERE account.owner = type::thing('user', $uid);",
        {"uid": uid},
    )
    return {
        "id": str(user["id"]),
        "name": user["full_name"],
        "accounts": _jsonable_rows(rows_of(accounts)),
        "cards": _jsonable_rows(rows_of(cards)),
    }


@app.websocket("/ws/chat/{user_id}")
async def websocket_chat(websocket: WebSocket, user_id: str):
    await websocket.accept()

    # El primer mensaje debe traer el token JWT.
    try:
        auth_msg = await asyncio.wait_for(websocket.receive_json(), timeout=10)
    except (asyncio.TimeoutError, Exception):
        await websocket.close(code=4001)
        return

    token = (auth_msg or {}).get("token")
    if not token:
        await websocket.send_json({"error": "Token requerido"})
        await websocket.close(code=4001)
        return

    user = await validate_user_token(token)
    if not user:
        await log_action(actor=user_id, action="login_failed",
                         tool_name="ws_auth", success=False, error_msg="token inválido")
        await websocket.send_json({"error": "Token inválido o expirado"})
        await websocket.close(code=4003)
        return

    # El usuario autenticado manda; ignoramos el user_id de la ruta.
    auth_user_id = str(user["id"])
    context = await load_user_context(auth_user_id)
    if context is None:
        await websocket.send_json({"error": "Usuario no encontrado"})
        await websocket.close()
        return

    await log_action(actor=auth_user_id, action="login", tool_name="ws_auth", success=True)

    from src.orchestrator.agent import ConversationSession
    session = ConversationSession(context)

    try:
        while True:
            data = await websocket.receive_json()
            user_text = data.get("text", "")
            if not user_text:
                continue

            # Callback: cada vez que el agente va a ejecutar una tool, navegamos
            # la UI y avisamos al frontend EN VIVO (antes de la respuesta final),
            # para mostrar "lo que hace el agente" paso a paso.
            async def on_event(evt: dict):
                tool = evt.get("tool")
                screen = ACTION_TO_SCREEN.get(tool, "DashboardScreen")
                await update_ui_state(screen, tool, None)
                await websocket.send_json({
                    "type": "tool",
                    "tool_used": tool,
                    "navigate_to": screen,
                })

            try:
                response = await session.process_message(user_text, on_event=on_event)
            except Exception as e:
                # Un error del modelo/herramienta NO debe cerrar la sesión.
                msg = str(e)
                if "RESOURCE_EXHAUSTED" in msg or "429" in msg:
                    friendly = "El servicio de IA alcanzó su cuota. Intenta nuevamente en un momento."
                elif "API key" in msg or "PERMISSION_DENIED" in msg or "401" in msg or "403" in msg:
                    friendly = "El servicio de IA no está configurado correctamente (revisa GEMINI_API_KEY)."
                else:
                    friendly = "Ocurrió un error procesando tu solicitud. Inténtalo de nuevo."
                await log_action(actor=auth_user_id, action="agent_error",
                                 tool_name="process_message", success=False, error_msg=msg[:300])
                await websocket.send_json({"type": "error", "text": friendly, "error": True})
                continue

            last_tool = None
            for content in reversed(session.history):
                for part in (content.parts or []):
                    if getattr(part, "function_call", None):
                        last_tool = part.function_call.name
                        break
                if last_tool:
                    break

            target_screen = ACTION_TO_SCREEN.get(last_tool, "DashboardScreen")
            await update_ui_state(target_screen, last_tool, response[:200])

            await websocket.send_json({
                "type": "message",
                "text": response,
                "navigate_to": target_screen,
                "tool_used": last_tool,
            })

    except WebSocketDisconnect:
        print(f"Usuario {auth_user_id} desconectado")


# ── WebSocket: sesion de voz con Gemini Live API ─────────
import logging
vlog = logging.getLogger("ws_voice")
vlog.setLevel(logging.DEBUG)
if not vlog.handlers:
    _vh = logging.StreamHandler()
    _vh.setFormatter(logging.Formatter("[WS_VOICE] %(asctime)s %(message)s", datefmt="%H:%M:%S"))
    vlog.addHandler(_vh)


@app.websocket("/ws/voice/{user_id}")
async def websocket_voice(websocket: WebSocket, user_id: str):
    vlog.info("Nueva conexion voice WS para user_id=%s", user_id)
    await websocket.accept()

    try:
        auth_msg = await asyncio.wait_for(websocket.receive_json(), timeout=10)
    except (asyncio.TimeoutError, Exception) as e:
        vlog.warning("Auth timeout o error: %s", e)
        await websocket.close(code=4001)
        return

    token = (auth_msg or {}).get("token")
    if not token:
        vlog.warning("No se recibio token")
        await websocket.send_json({"error": "Token requerido"})
        await websocket.close(code=4001)
        return

    user = await validate_user_token(token)
    if not user:
        vlog.warning("Token invalido para user_id=%s", user_id)
        await log_action(actor=user_id, action="login_failed",
                         tool_name="ws_voice_auth", success=False,
                         error_msg="token invalido")
        await websocket.send_json({"error": "Token invalido o expirado"})
        await websocket.close(code=4003)
        return

    auth_user_id = str(user["id"])
    vlog.info("Auth OK: %s", auth_user_id)

    context = await load_user_context(auth_user_id)
    if context is None:
        vlog.warning("Usuario no encontrado: %s", auth_user_id)
        await websocket.send_json({"error": "Usuario no encontrado"})
        await websocket.close()
        return

    vlog.info("Contexto cargado: name=%s, accounts=%d, cards=%d",
              context.get("name"), len(context.get("accounts", [])),
              len(context.get("cards", [])))

    await log_action(actor=auth_user_id, action="voice_session_start",
                     tool_name="ws_voice", success=True)

    from src.orchestrator.voice_agent import VoiceLiveSession

    ws_lock = asyncio.Lock()
    chunk_count = 0

    async def ws_send(msg: dict):
        async with ws_lock:
            t = msg.get("type", "?")
            if t == "audio":
                vlog.info("ws_send -> client: type=audio, b64_len=%d", len(msg.get("data", "")))
            else:
                vlog.info("ws_send -> client: %s", {k: (v[:80] if isinstance(v, str) and len(v) > 80 else v) for k, v in msg.items()})
            await websocket.send_json(msg)

    try:
        vlog.info("Abriendo VoiceLiveSession...")
        async with VoiceLiveSession(context) as voice:
            vlog.info("VoiceLiveSession abierta, enviando ready al cliente")
            await ws_send({"type": "ready"})

            # ── Task 2: Gemini -> Cliente ──────────────────
            async def gemini_loop():
                vlog.info("gemini_loop: iniciado, esperando eventos de Gemini...")
                try:
                    async for event in voice.receive_stream():
                        etype = event["type"]
                        vlog.info("gemini_loop: evento recibido type=%s", etype)

                        if etype == "audio":
                            b64 = base64.b64encode(event["data"]).decode()
                            vlog.info("gemini_loop: audio WAV %d bytes -> b64 %d chars",
                                      len(event["data"]), len(b64))
                            await ws_send({"type": "audio", "data": b64})

                        elif etype == "transcript":
                            vlog.info("gemini_loop: transcript: %s", event["text"][:100])
                            await ws_send({"type": "transcript", "text": event["text"]})

                        elif etype == "user_transcript":
                            vlog.info("gemini_loop: user said: %s", event["text"][:100])
                            await ws_send({"type": "user_transcript", "text": event["text"]})

                        elif etype == "tool":
                            tool_name = event["name"]
                            screen = ACTION_TO_SCREEN.get(tool_name, "DashboardScreen")
                            vlog.info("gemini_loop: tool=%s -> screen=%s", tool_name, screen)
                            await update_ui_state(screen, tool_name, None)
                            await ws_send({
                                "type": "tool",
                                "tool_used": tool_name,
                                "navigate_to": screen,
                            })

                        elif etype == "end_session":
                            vlog.info("gemini_loop: END_SESSION")
                            await ws_send({"type": "end_session"})

                        elif etype == "turn_complete":
                            vlog.info("gemini_loop: TURN_COMPLETE")
                            await ws_send({"type": "turn_complete"})

                except asyncio.CancelledError:
                    vlog.info("gemini_loop: cancelado")
                    return
                except Exception as e:
                    vlog.error("gemini_loop: ERROR: %s", e, exc_info=True)
                    await ws_send({
                        "type": "error",
                        "text": f"Error en sesion de voz: {e}",
                    })

            gemini_task = asyncio.create_task(gemini_loop())
            vlog.info("gemini_task creado, entrando en client_loop...")

            # ── Task 1: Cliente -> Gemini ──────────────────
            try:
                while True:
                    data = await websocket.receive_json()
                    msg_type = data.get("type")

                    if msg_type == "audio_chunk":
                        audio_b64 = data.get("data", "")
                        mime = data.get("mime", "audio/pcm;rate=16000")
                        audio_bytes = base64.b64decode(audio_b64)
                        chunk_count += 1
                        if chunk_count % 10 == 1:
                            vlog.info("client_loop: audio_chunk #%d, %d bytes, mime=%s",
                                      chunk_count, len(audio_bytes), mime)
                        await voice.send_audio_chunk(audio_bytes, mime)

                    elif msg_type == "audio_end":
                        vlog.info("client_loop: audio_end (ignored, VAD handles turns)")
                        chunk_count = 0

                    else:
                        vlog.warning("client_loop: tipo desconocido: %s", msg_type)

            except WebSocketDisconnect:
                vlog.info("client_loop: WebSocket desconectado: %s", auth_user_id)
            finally:
                vlog.info("client_loop: cancelando gemini_task...")
                gemini_task.cancel()
                try:
                    await gemini_task
                except asyncio.CancelledError:
                    pass
                vlog.info("client_loop: cleanup completo")

    except Exception as e:
        vlog.error("Error general en sesion de voz %s: %s", auth_user_id, e, exc_info=True)
        try:
            await websocket.send_json({"type": "error", "text": str(e)})
        except Exception:
            pass
