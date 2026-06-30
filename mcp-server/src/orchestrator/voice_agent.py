"""
Agente de voz usando Gemini Live API.
Sesion bidireccional con deteccion automatica de turnos (VAD).
Audio-in streaming -> razonamiento + function calling -> audio-out.
"""
import os
import asyncio
import json
import logging
import struct
from google import genai
from google.genai import types

from src.orchestrator.tool_definitions import TOOL_DECLARATIONS
from src.orchestrator.agent import execute_tool_call

log = logging.getLogger("voice_agent")
log.setLevel(logging.INFO)
if not log.handlers:
    h = logging.StreamHandler()
    h.setFormatter(logging.Formatter("[VOICE] %(asctime)s %(message)s", datefmt="%H:%M:%S"))
    log.addHandler(h)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
VOICE_MODEL = os.getenv("GEMINI_VOICE_MODEL", "gemini-3.1-flash-live-preview")
client = genai.Client(api_key=GEMINI_API_KEY)

log.info("Voice model: %s", VOICE_MODEL)

SYSTEM_PROMPT_VOICE = """Eres VoxBank, asistente bancario de BancoFutura.
Hablas en español de Chile, de forma clara, amigable y concisa.
Cuando el usuario haga una consulta bancaria, usa las herramientas disponibles.
Para operaciones sensibles (transferencias, bloqueos), confirma verbalmente
antes de ejecutar.
Cuando el usuario indique que no necesita nada más, despídete brevemente y
llama la herramienta end_session para cerrar la sesión de voz.

CONTEXTO DEL USUARIO:
- Usuario: {user_name}
- Cuentas: {user_accounts}
- Tarjetas: {user_cards}
{prior_conversation}"""

END_SESSION_DECL = types.FunctionDeclaration(
    name="end_session",
    description="Finaliza la sesión de voz cuando el usuario indica que no necesita nada más.",
    parameters=types.Schema(type=types.Type.OBJECT, properties={}),
)


def build_live_config(user_context: dict | None = None, prior_history: list[dict] | None = None) -> types.LiveConnectConfig:
    prompt = SYSTEM_PROMPT_VOICE

    prior_conversation = ""
    if prior_history:
        prior_conversation = (
            "\nHISTORIAL DE CONVERSACIÓN PREVIA (continúa esta conversación, "
            "ya conoces al usuario y lo que han hablado):\n"
        )
        for entry in prior_history:
            label = "Usuario" if entry["role"] == "user" else "VoxBank"
            prior_conversation += f"{label}: {entry['text']}\n"

    if user_context:
        prompt = prompt.format(
            user_name=user_context.get("name", "Cliente"),
            user_accounts=json.dumps(
                user_context.get("accounts", []), ensure_ascii=False
            ),
            user_cards=json.dumps(
                user_context.get("cards", []), ensure_ascii=False
            ),
            prior_conversation=prior_conversation,
        )
    else:
        prompt = prompt.format(
            user_name="Cliente", user_accounts="[]", user_cards="[]",
            prior_conversation=prior_conversation,
        )

    return types.LiveConnectConfig(
        response_modalities=["AUDIO"],
        system_instruction=types.Content(
            parts=[types.Part.from_text(text=prompt)]
        ),
        tools=[types.Tool(function_declarations=[*TOOL_DECLARATIONS, END_SESSION_DECL])],
        speech_config=types.SpeechConfig(
            voice_config=types.VoiceConfig(
                prebuilt_voice_config=types.PrebuiltVoiceConfig(
                    voice_name="Aoede"
                )
            )
        ),
        realtime_input_config=types.RealtimeInputConfig(
            automatic_activity_detection=types.AutomaticActivityDetection(
                disabled=False,
                start_of_speech_sensitivity=types.StartSensitivity.START_SENSITIVITY_LOW,
                end_of_speech_sensitivity=types.EndSensitivity.END_SENSITIVITY_LOW,
                silence_duration_ms=700,
            ),
            activity_handling=types.ActivityHandling.START_OF_ACTIVITY_INTERRUPTS,
        ),
        output_audio_transcription=types.AudioTranscriptionConfig(),
    )


def pcm_to_wav(
    pcm_data: bytes,
    sample_rate: int = 24000,
    channels: int = 1,
    sample_width: int = 2,
) -> bytes:
    data_size = len(pcm_data)
    header = struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF",
        36 + data_size,
        b"WAVE",
        b"fmt ",
        16,
        1,
        channels,
        sample_rate,
        sample_rate * channels * sample_width,
        channels * sample_width,
        sample_width * 8,
        b"data",
        data_size,
    )
    return header + pcm_data


class VoiceLiveSession:
    """Sesion de voz Gemini Live con VAD automatico."""

    def __init__(self, user_context: dict, prior_history: list[dict] | None = None):
        self.user_context = user_context
        self.user_id = user_context.get("id")
        self.config = build_live_config(user_context, prior_history)
        self._ctx = None
        self._session = None
        log.info("VoiceLiveSession creada para user=%s", self.user_id)

    async def __aenter__(self):
        log.info("Conectando a Gemini Live model=%s ...", VOICE_MODEL)
        self._ctx = client.aio.live.connect(
            model=VOICE_MODEL, config=self.config
        )
        self._session = await self._ctx.__aenter__()
        log.info("Conexion Gemini Live establecida OK")
        return self

    async def __aexit__(self, *args):
        log.info("Cerrando sesion Gemini Live")
        if self._ctx:
            await self._ctx.__aexit__(*args)

    # ── Streaming (VAD automatico) ─────────────────────────
    _chunk_count = 0

    async def send_audio_chunk(
        self, audio_bytes: bytes, mime_type: str = "audio/pcm;rate=16000"
    ):
        self._chunk_count += 1
        try:
            await self._session.send_realtime_input(
                audio=types.Blob(data=audio_bytes, mime_type=mime_type)
            )
            if self._chunk_count % 20 == 1:
                log.info("send_audio_chunk #%d: %d bytes OK", self._chunk_count, len(audio_bytes))
        except Exception as e:
            log.error("send_audio_chunk #%d FAILED: %s", self._chunk_count, e)

    async def send_audio_end(self):
        log.info("send_audio_end: senalando fin de stream")
        await self._session.send_realtime_input(audio_stream_end=True)
        log.info("send_audio_end: enviado OK")

    async def receive_stream(self, on_tool=None):
        """
        Generador asincrono continuo que yield eventos de Gemini Live.
        Re-entra session.receive() despues de cada turno porque el SDK
        agota el generador en cada TURN_COMPLETE.
        """
        audio_chunks: list[bytes] = []
        log.info("receive_stream: esperando respuestas de Gemini...")

        resp_count = 0
        turn_number = 0

        while True:
            log.info("receive_stream: entrando en receive() para turno %d", turn_number + 1)
            got_turn_complete = False

            try:
                async for response in self._session.receive():
                    resp_count += 1

                    sru = getattr(response, "session_resumption_update", None)
                    if sru:
                        continue

                    data = None
                    text = None
                    tool_call = None
                    turn_complete = False

                    try:
                        tool_call = response.tool_call
                    except Exception:
                        pass

                    sc = getattr(response, "server_content", None)
                    if sc:
                        turn_complete = bool(getattr(sc, "turn_complete", False))

                        mt = getattr(sc, "model_turn", None)
                        if mt:
                            for part in getattr(mt, "parts", []):
                                inline = getattr(part, "inline_data", None)
                                if inline and getattr(inline, "data", None):
                                    data = inline.data

                        ot = getattr(sc, "output_transcription", None)
                        if ot:
                            ot_text = getattr(ot, "text", None)
                            if ot_text:
                                text = ot_text

                        it = getattr(sc, "input_transcription", None)
                        if it:
                            it_text = getattr(it, "text", None)
                            if it_text:
                                log.info("receive #%d: USER said: %s", resp_count, it_text[:200])
                                yield {"type": "user_transcript", "text": it_text}

                    if data:
                        audio_chunks.append(data)

                    if text:
                        log.info("receive #%d: transcript: %s", resp_count, text[:100])
                        yield {"type": "transcript", "text": text}

                    if tool_call:
                        for fc in tool_call.function_calls:
                            if fc.name == "end_session":
                                log.info("receive: end_session invocado, cerrando sesion de voz")
                                await self._session.send(
                                    input=types.LiveClientToolResponse(
                                        function_responses=[
                                            types.FunctionResponse(
                                                id=fc.id, name=fc.name,
                                                response={"status": "ok"},
                                            )
                                        ]
                                    )
                                )
                                yield {"type": "end_session"}
                                return

                            log.info("receive: tool_call -> %s(%s)", fc.name, dict(fc.args) if fc.args else {})
                            if on_tool:
                                yield {"type": "tool", "name": fc.name}
                            raw = await execute_tool_call(fc, self.user_id)
                            parsed = json.loads(raw) if isinstance(raw, str) else raw
                            log.info("receive: tool_result -> %s", str(parsed)[:200])
                            await self._session.send(
                                input=types.LiveClientToolResponse(
                                    function_responses=[
                                        types.FunctionResponse(
                                            id=fc.id, name=fc.name, response=parsed
                                        )
                                    ]
                                )
                            )
                            log.info("receive: tool_response enviado a Gemini")

                    if turn_complete:
                        turn_number += 1
                        log.info(
                            "receive: TURN_COMPLETE #%d — audio_chunks=%d, total_bytes=%d",
                            turn_number,
                            len(audio_chunks),
                            sum(len(c) for c in audio_chunks),
                        )
                        if audio_chunks:
                            wav = pcm_to_wav(b"".join(audio_chunks))
                            log.info("receive: WAV generado: %d bytes", len(wav))
                            yield {"type": "audio", "data": wav}
                            audio_chunks = []
                        yield {"type": "turn_complete"}
                        got_turn_complete = True
                        break

            except Exception as e:
                log.info("receive_stream: session ended (%s)", e)
                break

            if not got_turn_complete:
                log.info("receive_stream: receive() ended, session complete")
                break

            log.info("receive_stream: re-entering receive() for next turn...")

    # ── Push-to-talk (fallback sin streaming) ──────────────
    async def send_audio(
        self, audio_bytes: bytes, mime_type: str = "audio/mp4"
    ):
        log.info("send_audio (push-to-talk): %d bytes", len(audio_bytes))
        await self._session.send(
            input=types.Blob(data=audio_bytes, mime_type=mime_type),
            end_of_turn=True,
        )

    async def send_text(self, text: str):
        log.info("send_text: %s", text[:100])
        await self._session.send(input=text, end_of_turn=True)

    async def receive_response(self, on_tool=None):
        audio_chunks: list[bytes] = []
        transcript = ""
        log.info("receive_response: esperando respuesta completa...")

        async for response in self._session.receive():
            if response.data:
                audio_chunks.append(response.data)
                log.debug("receive_response: audio chunk %d bytes", len(response.data))
            if response.text:
                transcript += response.text
                log.debug("receive_response: text chunk: %s", response.text[:80])
            if response.tool_call:
                for fc in response.tool_call.function_calls:
                    log.info("receive_response: tool_call -> %s", fc.name)
                    if on_tool:
                        await on_tool(fc.name)
                    raw = await execute_tool_call(fc, self.user_id)
                    parsed = json.loads(raw) if isinstance(raw, str) else raw
                    await self._session.send(
                        input=types.LiveClientToolResponse(
                            function_responses=[
                                types.FunctionResponse(
                                    name=fc.name, response=parsed
                                )
                            ]
                        )
                    )
            sc = getattr(response, "server_content", None)
            if sc and getattr(sc, "turn_complete", False):
                log.info("receive_response: TURN_COMPLETE")
                break

        audio_wav = (
            pcm_to_wav(b"".join(audio_chunks)) if audio_chunks else None
        )
        log.info(
            "receive_response: done — audio=%s bytes, transcript=%s",
            len(audio_wav) if audio_wav else 0,
            repr(transcript[:100]) if transcript else None,
        )
        return audio_wav, transcript


async def voice_session_cli():
    ctx = {"id": "user:demo_1", "name": "Demo", "accounts": [], "cards": []}
    async with VoiceLiveSession(ctx) as voice:
        print("Sesion de voz iniciada. Escribe para hablar con VoxBank...")
        while True:
            user_input = await asyncio.get_event_loop().run_in_executor(
                None, input, "Tu (texto->voz): "
            )
            if user_input.lower() in ("salir", "exit"):
                break
            await voice.send_text(user_input)
            audio, text = await voice.receive_response()
            if audio:
                print(f"[Audio: {len(audio)} bytes WAV]")
            if text:
                print(f"VoxBank: {text}")


if __name__ == "__main__":
    asyncio.run(voice_session_cli())
