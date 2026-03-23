FROM python:3.11-slim

WORKDIR /app

# Instalar dependencias necesarias de python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiamos todo el código fuente del MCP
COPY src ./src

# Iniciamos el servidor con python puro
CMD ["python", "src/main.py"]
