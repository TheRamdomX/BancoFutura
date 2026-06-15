FROM python:3.11-slim

WORKDIR /app
COPY pyproject.toml .
RUN pip install --no-cache-dir .

COPY src/ src/
# models/ es opcional: si no existe un modelo entrenado, el servicio usa el
# clasificador por palabras clave de respaldo.
COPY models/ models/

EXPOSE 8003
CMD ["uvicorn", "src.intent.classifier_service:app", "--host", "0.0.0.0", "--port", "8003"]
