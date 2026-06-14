import asyncio
import os
from surrealdb import Surreal
from mcp.server.sse import SseServerTransport
import mcp.types as types
from mcp.server import Server
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.requests import Request

# Initialize Server
server = Server("BancoFutura MCP")

# Configurar FastAPI
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Para dev
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

sse_transport: SseServerTransport | None = None

# Set up SurrealDB client
db = Surreal("ws://127.0.0.1:8000/rpc") # Will be overridden by connect_db logic

async def connect_db():
    url = os.environ.get("SURREAL_URL", "ws://127.0.0.1:8000/rpc")
    global db
    db = Surreal(url)
    try:
        await db.connect()
        await db.signin({
            "user": os.environ.get("SURREAL_USER", "root"),
            "pass": os.environ.get("SURREAL_PASS", "root")
        })
        await db.use(
            namespace=os.environ.get("SURREAL_NS", "banco"),
            database=os.environ.get("SURREAL_DB", "futura")
        )
        print("Connected to SurrealDB")
        
        # Automatizar la inicializacion del schema
        schema_query = """
        DEFINE TABLE account SCHEMALESS;
        DEFINE TABLE transaction SCHEMALESS;
        DEFINE TABLE ui_state SCHEMALESS;

        CREATE account:user_1 SET balance = 100000, user = 'user_1';
        CREATE account:user_2 SET balance = 50000, user = 'user_2';

        CREATE ui_state:current SET active_screen = 'DashboardScreen';
        """
        # Intentar inicializar datos si no existen
        try:
            await db.query(schema_query)
            print("Schema initialized")
        except Exception as query_err:
            print("Schema possibly already initialized or error: ", query_err)
            
    except Exception as e:
        print(f"Failed to connect to SurrealDB: {e}")

@server.list_tools()
async def handle_list_tools() -> list[types.Tool]:
    """List available banking tools."""
    return [
        types.Tool(
            name="get_balance",
            description="Get the current balance of a user account",
            inputSchema={
                "type": "object",
                "properties": {
                    "userId": {"type": "string", "description": "The ID of the user (e.g. user_1)"}
                },
                "required": ["userId"]
            }
        ),
        types.Tool(
            name="transfer_funds",
            description="Transfer funds from one account to another",
            inputSchema={
                "type": "object",
                "properties": {
                    "fromId": {"type": "string"},
                    "toId": {"type": "string"},
                    "amount": {"type": "number"}
                },
                "required": ["fromId", "toId", "amount"]
            }
        ),
        types.Tool(
            name="get_recent_transactions",
            description="Get recent transactions for a user",
            inputSchema={
                "type": "object",
                "properties": {
                    "userId": {"type": "string"}
                },
                "required": ["userId"]
            }
        ),
        types.Tool(
            name="change_screen",
            description="Change the active screen being displayed in the app",
            inputSchema={
                "type": "object",
                "properties": {
                    "screenName": {"type": "string", "description": "Screen to show (e.g. TransferScreen, DashboardScreen)"}
                },
                "required": ["screenName"]
            }
        )
    ]

@server.call_tool()
async def handle_call_tool(
    name: str, arguments: dict | None
) -> list[types.TextContent | types.ImageContent | types.EmbeddedResource]:
    """Handle tool execution requests."""
    if not arguments:
        raise ValueError("Missing arguments")

    if name == "get_balance":
        user_id = arguments.get("userId")
        # Format for python surrealdb client
        result = await db.query('SELECT balance FROM type::thing("account", $userId)', {"userId": user_id})
        return [types.TextContent(type="text", text=str(result))]

    elif name == "transfer_funds":
        from_id = arguments.get("fromId")
        to_id = arguments.get("toId")
        amount = arguments.get("amount")
        
        # Simplified transfer logic via transaction
        query_str = """
        BEGIN TRANSACTION;
        UPDATE type::thing("account", $fromId) SET balance = balance - $amount;
        UPDATE type::thing("account", $toId) SET balance = balance + $amount;
        CREATE transaction SET from = $fromId, to = $toId, amount = $amount, time = time::now();
        COMMIT TRANSACTION;
        """
        await db.query(query_str, {
            "fromId": from_id, 
            "toId": to_id, 
            "amount": amount
        })
        return [types.TextContent(type="text", text=f"Transferred {amount} from {from_id} to {to_id}")]

    elif name == "get_recent_transactions":
        user_id = arguments.get("userId")
        result = await db.query('SELECT * FROM transaction WHERE from = $userId OR to = $userId ORDER BY time DESC LIMIT 10', {"userId": user_id})
        return [types.TextContent(type="text", text=str(result))]

    elif name == "change_screen":
        screen_name = arguments.get("screenName")
        await db.query('UPDATE ui_state:current SET active_screen = $screenName', {"screenName": screen_name})
        return [types.TextContent(type="text", text=f"Screen changed to {screen_name}")]

    else:
        raise ValueError(f"Unknown tool: {name}")

@app.on_event("startup")
async def startup_event():
    print("Starting APP and DB connect...")
    await connect_db()

@app.get("/sse")
async def sse_route(request: Request):
    """Establece la conexión SSE con el cliente HTTP de React Native Web."""
    global sse_transport
    async with SseServerTransport("/messages") as transport:
        sse_transport = transport
        
        # Iniciar el servidor persistente vinculado al transport SSE asincrónico 
        # sin bloquear la vista gracias al background task run
        task = asyncio.create_task(
            server.run(
                transport.read_stream,
                transport.write_stream,
                server.create_initialization_options()
            )
        )
        # Se cede el control a la respuesta Starlette del SSe transport
        response = await transport.handle_sse(request)
        return response

@app.post("/messages")
async def messages_route(request: Request):
    """Recibe los flujos de mensajería (tool calls) y los enruta al transport."""
    global sse_transport
    if sse_transport is None:
        return {"error": "SSE not initialized"}
    
    await sse_transport.handle_post_message(request)
    return {"status": "ok"}
