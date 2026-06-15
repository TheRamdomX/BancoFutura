/**
 * Wrapper REST hacia el backend (mcp-server / orquestador en :8002).
 *
 * Las operaciones de ESCRITURA (transferencias, bloqueo de tarjetas) pasan
 * SIEMPRE por el backend, que es el único con credenciales de escritura en
 * SurrealDB. El frontend nunca modifica la base directamente.
 */
import { useAuthStore } from "./authStore";

const WS_URL =
  process.env.EXPO_PUBLIC_WS_URL || "ws://localhost:8002/ws/chat";
// Derivar la base HTTP del WS_URL (ws://host:port/... -> http://host:port)
const API_BASE = (() => {
  try {
    const u = new URL(WS_URL.replace(/^ws/, "http"));
    return `${u.protocol}//${u.host}`;
  } catch {
    return "http://localhost:8002";
  }
})();

async function post(path: string, body: unknown) {
  const token = useAuthStore.getState().token;
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || data?.error) {
    throw new Error(data?.message || data?.detail || "Operación rechazada");
  }
  return data;
}

export function transfer(
  fromAccountId: string,
  toAccountId: string,
  amount: number,
  description = ""
) {
  return post("/api/transfer", {
    from_account_id: fromAccountId,
    to_account_id: toAccountId,
    amount,
    description,
  });
}

export function blockCard(cardId: string, reason = "user_request") {
  return post("/api/cards/block", { card_id: cardId, reason });
}
