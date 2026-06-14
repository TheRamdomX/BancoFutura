FROM python:3.11-slim

WORKDIR /app

# Instalar dependencias necesarias de python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiamos todo el código fuente del MCP
COPY src ./src

# Exponer el puerto para FastAPI
EXPOSE 8002

# Iniciamos el servidor con uvicorn en el puerto 8002
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8002"]
