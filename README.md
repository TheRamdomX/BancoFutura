# BancoFutura — VoxBank

Asistente bancario por voz. El usuario habla con la app; **Gemini Native Audio**
transcribe y responde en voz; un **orquestador** decide qué operación ejecutar y
las realiza de forma segura y auditada a través de un **MCP server** sobre
**SurrealDB**.

## Arquitectura objetivo

```
┌──────────────────────────────────────┐
│          banco-futura-app            │  ← Expo / React Native
│  (captura audio, muestra resultados) │
└──────────────┬───────────────────────┘
               │ audio / texto (WebSocket /ws/chat)
               ▼
┌──────────────────────────────────────┐
│       Gemini Native Audio            │  ← Google AI Live API (en el backend)
│  (voz ↔ texto, contexto de sesión)  │
└──────────────┬───────────────────────┘
               │ texto transcrito
        ┌──────┴──────┐
        ▼             ▼
┌──────────────┐ ┌──────────────────┐
│ Clasificador │ │    Capa RAG      │   (Fases 4–5, posteriores)
│ de intención │ │ BM25 + vectores  │
└──────┬───────┘ └────────┬─────────┘
       └──────┬───────────┘
              ▼
┌──────────────────────────────────────┐
│       Gemini orquestador             │  ← function calling
└──────────────┬───────────────────────┘
               │ tool calls (MCP, stdio)
               ▼
┌──────────────────────────────────────┐
│          MCP server (Python)         │  ← valida, audita, ejecuta
└──────────────┬───────────────────────┘
               │ SurrealQL
               ▼
┌──────────────────────────────────────┐
│            SurrealDB                 │  ← datos + vectores + FTS
└──────────────────────────────────────┘
```

| Componente | Tecnología |
|---|---|
| Base de datos | SurrealDB (Docker) |
| MCP server | Python + SDK `mcp` (transporte stdio) |
| Orquestador IA | Gemini (function calling) |
| Voz | Gemini Native Audio (Live API) |
| Frontend | Expo / React Native (TypeScript) |
| Infraestructura | Docker Compose |

> **Nota arquitectónica:** Gemini corre en el **backend** (orquestador Python),
> no en el navegador. El frontend habla con el backend por WebSocket
> (`/ws/chat/{user_id}`); el MCP server se invoca por stdio desde el orquestador.

## Servicios y puertos

| Servicio | Puerto | Descripción |
|---|---|---|
| `surrealdb` | 8000 | Base de datos (WebSocket `/rpc`) |
| `mcp-server` | 8002 | Orquestador + WebSocket bridge; lanza el MCP por stdio |
| `banco-futura-app` | 8081 | App Expo (web) |

## Variables de entorno

Copia `.env.example` a `.env` y completa los valores. `.env` 

- `SURREAL_URL`, `SURREAL_USER`, `SURREAL_PASS`, `SURREAL_NS`, `SURREAL_DB`
- `GEMINI_API_KEY` — obtenla en https://aistudio.google.com/apikey
- `MCP_SERVER_PORT`, `MCP_LOG_LEVEL`

## Cómo levantar

```bash
cp .env.example .env       
docker compose up --build
```

Aplicar el esquema de base de datos (una vez SurrealDB esté arriba):

```bash
surreal import --conn http://localhost:8000 --user root --pass root \
    --ns banco --db futura schema.surql
```

## Estado de implementación

| Fase | Descripción | Estado |
|---|---|---|
| 0 | Entorno, secretos, README | ✅ |
| 1 | Esquema SurrealDB completo | ✅ |
| 2 | MCP server: tools bancarias | ✅ |
| 3 | Frontend funcional sin IA | ✅ |
| 4 | Capa RAG (BM25 + vectorial) | ✅ (ingestión requiere GEMINI_API_KEY) |
| 5 | Clasificador de intención | ✅ (respaldo por keywords; ML requiere entrenar) |
| 6 | Orquestador Gemini | ✅ (conversación requiere GEMINI_API_KEY) |
| 7 | Integración end-to-end | ✅ |
| 8 | Seguridad / JWT / auditoría | ✅ |

Detalle de cada fase en `plan_implementacion_voxbank.md`.

## Puesta en marcha de IA (requiere GEMINI_API_KEY válida)

```bash
# Ingestar la base de conocimiento
docker compose exec mcp-server python -m src.rag.ingest

# Entrenar el clasificador de intención (opcional; usa keywords si no)
cd intent-classifier
GEMINI_API_KEY=... python generate_training_data.py
GEMINI_API_KEY=... python train_classifier.py

# Probar el orquestador en modo texto 
cd mcp-server && python test_orchestrator.py
```

## Modelo de seguridad

- El frontend lee datos vía SurrealDB con permisos a nivel de fila (`$auth.id`).
- Toda **escritura** pasa por el backend (REST con `Authorization: Bearer <jwt>`
  o WebSocket con token como primer mensaje), único con credenciales de escritura.
- Operaciones sensibles validan propiedad de cuenta/tarjeta y límite diario.
- Cada operación queda registrada en `audit_log` (ver `audit_queries.surql`).
