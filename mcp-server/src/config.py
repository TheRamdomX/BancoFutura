"""
Lectura de secretos: prioriza Docker secrets (/run/secrets/<name>) y cae a
variables de entorno. Permite mover GEMINI_API_KEY / credenciales fuera de
env vars planas en producción.
"""
import os


def get_secret(name: str, env_fallback: str | None = None) -> str:
    secret_path = f"/run/secrets/{name}"
    if os.path.exists(secret_path):
        with open(secret_path) as f:
            return f.read().strip()
    if env_fallback:
        return os.getenv(env_fallback, "")
    raise RuntimeError(f"Secret '{name}' no encontrado")
