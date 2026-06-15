FROM python:3.11-slim

WORKDIR /app
COPY pyproject.toml .
RUN pip install --no-cache-dir .

COPY src/ src/

# Por defecto se ejecuta el orquestador + WebSocket bridge (Fase 7) en el
# puerto 8002. El MCP server stdio (src.server) se usa de forma aislada para
# pruebas con MCP Inspector:  python -m src.server
EXPOSE 8002
CMD ["uvicorn", "src.orchestrator.ws_bridge:app", "--host", "0.0.0.0", "--port", "8002"]
