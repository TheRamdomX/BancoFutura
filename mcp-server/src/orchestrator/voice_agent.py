"""
Agente de voz usando Gemini Live API con Native Audio.
Reutiliza las tool declarations y handlers del orquestador (Fase 6.3).
"""
import os
import asyncio
from google import genai
from google.genai import types

from src.orchestrator.tool_definitions import TOOL_DECLARATIONS
from src.orchestrator.agent import execute_tool_call

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
VOICE_MODEL = os.getenv("GEMINI_VOICE_MODEL", "gemini-2.0-flash-live-001")
client = genai.Client(api_key=GEMINI_API_KEY)

SYSTEM_PROMPT_VOICE = """Eres VoxBank, asistente bancario de BancoFutura.
Hablas en español de Chile, de forma clara, amigable y concisa.
Cuando el usuario haga una consulta bancaria, usa las herramientas disponibles.
Para operaciones sensibles (transferencias, bloqueos), confirma verbalmente
antes de ejecutar."""


def build_live_config() -> "types.LiveConnectConfig":
    return types.LiveConnectConfig(
        response_modalities=["AUDIO"],
        system_instruction=types.Content(
            parts=[types.Part.from_text(text=SYSTEM_PROMPT_VOICE)]
        ),
        tools=[types.Tool(function_declarations=TOOL_DECLARATIONS)],
    )


async def voice_session_cli():
    """Sesión de voz interactiva por CLI (entrada de texto → salida de audio)."""
    async with client.aio.live.connect(model=VOICE_MODEL, config=build_live_config()) as session:
        print("Sesión de voz iniciada. Habla con VoxBank...")

        async def handle_responses():
            async for response in session.receive():
                if response.data:
                    print(f"[Audio: {len(response.data)} bytes]")
                if response.text:
                    print(f"VoxBank: {response.text}")
                if response.tool_call:
                    for fc in response.tool_call.function_calls:
                        result = await execute_tool_call(fc)
                        await session.send(
                            input=types.LiveClientToolResponse(
                                function_responses=[
                                    types.FunctionResponse(
                                        name=fc.name,
                                        response={"result": result},
                                    )
                                ]
                            )
                        )

        response_task = asyncio.create_task(handle_responses())
        while True:
            user_input = await asyncio.get_event_loop().run_in_executor(
                None, input, "Tú (texto→voz): "
            )
            if user_input.lower() in ("salir", "exit"):
                break
            await session.send(input=user_input, end_of_turn=True)
        response_task.cancel()


if __name__ == "__main__":
    asyncio.run(voice_session_cli())
