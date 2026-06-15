import { create } from "zustand";

/**
 * Sesión global del agente VoxBank.
 *
 * Mantiene UN solo WebSocket al orquestador (backend) que sobrevive a la
 * navegación: el chat es el AgentOrb y vive sobre todas las vistas. Además del
 * texto, el backend emite eventos `type: "tool"` en tiempo real cuando ejecuta
 * una herramienta, lo que usamos para navegar la app y mostrar "qué está
 * haciendo el agente" paso a paso, aunque por detrás sea una llamada MCP.
 */

export type OrbState = "idle" | "thinking" | "working" | "speaking";

export interface ChatMessage {
  role: "user" | "agent" | "activity";
  text: string;
}

/** Mensaje de "actividad" amigable por cada tool (lo que el agente hace). */
const TOOL_LABEL: Record<string, string> = {
  get_balance: "Consultando tu saldo…",
  make_transfer: "Realizando la transferencia…",
  get_transactions: "Buscando tus movimientos…",
  get_card_status: "Revisando tus tarjetas…",
  block_card: "Bloqueando la tarjeta…",
  search_knowledge_base: "Buscando en la base de conocimiento…",
};

/** active_screen (backend) → ruta de navegación de la app. */
const SCREEN_TO_ROUTE: Record<string, string> = {
  DashboardScreen: "Dashboard",
  TransferScreen: "Transfer",
  MovementsScreen: "Movements",
  CardsScreen: "Cards",
};

interface NavTarget {
  route: string;
  ts: number;
}

interface AgentSession {
  socket: WebSocket | null;
  currentUser: string | null;
  connected: boolean;
  processing: boolean;
  expanded: boolean;
  orb: OrbState;
  activity: string | null;
  messages: ChatMessage[];
  navTarget: NavTarget | null;
  actionTick: number;

  connect: (userId: string, token: string) => void;
  disconnect: () => void;
  send: (text: string) => void;
  setExpanded: (v: boolean) => void;
  toggle: () => void;
}

const WS_URL = process.env.EXPO_PUBLIC_WS_URL || "ws://localhost:8002/ws/chat";

let speakTimer: ReturnType<typeof setTimeout> | null = null;

export const useAgentSession = create<AgentSession>((set, get) => ({
  socket: null,
  currentUser: null,
  connected: false,
  processing: false,
  expanded: false,
  orb: "idle",
  activity: null,
  messages: [],
  navTarget: null,
  actionTick: 0,

  connect: (userId, token) => {
    const { socket, currentUser } = get();
    // Evita reconexiones duplicadas para el mismo usuario.
    if (
      socket &&
      currentUser === userId &&
      (socket.readyState === WebSocket.OPEN ||
        socket.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
    if (socket) socket.close();

    const ws = new WebSocket(`${WS_URL}/${userId}`);
    set({ socket: ws, currentUser: userId });

    ws.onopen = () => {
      set({ connected: true });
      ws.send(JSON.stringify({ token })); // el backend exige el JWT primero
    };
    ws.onclose = () => set({ connected: false });
    ws.onerror = () => set({ connected: false });

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      // Evento en vivo: el agente va a ejecutar una tool → navega + actividad.
      if (data.type === "tool") {
        const route = SCREEN_TO_ROUTE[data.navigate_to];
        const label = TOOL_LABEL[data.tool_used] || "Trabajando…";
        set((s) => ({
          orb: "working",
          activity: label,
          messages: [...s.messages, { role: "activity", text: label }],
          navTarget: route ? { route, ts: Date.now() } : s.navTarget,
          actionTick: s.actionTick + 1,
        }));
        return;
      }

      // Error: mostrar mensaje y volver a idle.
      if (data.type === "error" || data.error) {
        set((s) => ({
          processing: false,
          orb: "idle",
          activity: null,
          messages: [...s.messages, { role: "agent", text: data.text }],
        }));
        return;
      }

      // Respuesta final de texto.
      if (data.text) {
        const route = data.navigate_to ? SCREEN_TO_ROUTE[data.navigate_to] : null;
        set((s) => ({
          processing: false,
          orb: "speaking",
          activity: null,
          messages: [...s.messages, { role: "agent", text: data.text }],
          navTarget: route ? { route, ts: Date.now() } : s.navTarget,
          actionTick: s.actionTick + 1,
        }));
        // Tras "hablar", volver a idle.
        if (speakTimer) clearTimeout(speakTimer);
        speakTimer = setTimeout(() => set({ orb: "idle" }), 1400);
      }
    };
  },

  disconnect: () => {
    const { socket } = get();
    if (socket) socket.close();
    set({
      socket: null,
      currentUser: null,
      connected: false,
      processing: false,
      orb: "idle",
      activity: null,
      messages: [],
      navTarget: null,
    });
  },

  send: (text) => {
    const { socket } = get();
    const t = text.trim();
    if (!t || socket?.readyState !== WebSocket.OPEN) return;
    set((s) => ({
      messages: [...s.messages, { role: "user", text: t }],
      processing: true,
      orb: "thinking",
      activity: "Pensando…",
    }));
    socket.send(JSON.stringify({ text: t }));
  },

  setExpanded: (v) => set({ expanded: v }),
  toggle: () => set((s) => ({ expanded: !s.expanded })),
}));
