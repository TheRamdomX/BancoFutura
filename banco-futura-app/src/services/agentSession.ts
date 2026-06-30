import { create } from "zustand";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system";
import { Platform } from "react-native";

/**
 * Sesion global del agente VoxBank.
 *
 * Mantiene un WebSocket de texto y otro de voz (lazy) al orquestador.
 * El modo voz usa streaming con VAD automatico: el usuario abre el mic,
 * habla libremente, y Gemini detecta los turnos sin boton de "enviar".
 */

export type OrbState = "idle" | "thinking" | "working" | "speaking";
export type VoiceTurn = "listening" | "thinking" | "speaking" | null;

export interface ChatMessage {
  role: "user" | "agent" | "activity";
  text: string;
}

const TOOL_LABEL: Record<string, string> = {
  get_balance: "Consultando tu saldo…",
  make_transfer: "Realizando la transferencia…",
  get_transactions: "Buscando tus movimientos…",
  get_card_status: "Revisando tus tarjetas…",
  block_card: "Bloqueando la tarjeta…",
  search_knowledge_base: "Buscando en la base de conocimiento…",
};

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
  currentToken: string | null;
  connected: boolean;
  processing: boolean;
  expanded: boolean;
  orb: OrbState;
  activity: string | null;
  messages: ChatMessage[];
  navTarget: NavTarget | null;
  actionTick: number;

  // Voice streaming
  voiceSocket: WebSocket | null;
  voiceConnected: boolean;
  voiceReady: boolean;
  streaming: boolean;
  playing: boolean;
  voiceTurn: VoiceTurn;

  connect: (userId: string, token: string) => void;
  disconnect: () => void;
  send: (text: string) => void;
  setExpanded: (v: boolean) => void;
  toggle: () => void;

  connectVoice: () => void;
  disconnectVoice: () => void;
  startVoiceStream: () => Promise<void>;
  stopVoiceStream: () => Promise<void>;
}

const WS_URL = process.env.EXPO_PUBLIC_WS_URL || "ws://localhost:8002/ws/chat";
const WS_VOICE_URL = WS_URL.replace("/ws/chat", "/ws/voice");

const CHUNK_MS = 400;

let speakTimer: ReturnType<typeof setTimeout> | null = null;
let currentSound: Audio.Sound | null = null;
let streamingFlag = false;
let pendingTranscript = "";
let chunkLoopHandle: ReturnType<typeof setTimeout> | null = null;

const TAG = "[VoiceSession]";

// ── Audio playback (web + native) ─────────────────────────

async function playAudioBase64(b64: string) {
  console.log(TAG, "playAudioBase64: b64 len=", b64.length);
  try {
    if (Platform.OS === "web") {
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: "audio/wav" });
      const url = URL.createObjectURL(blob);
      const audio = new window.Audio(url);
      useAgentSession.setState({ playing: true, orb: "speaking", voiceTurn: "speaking" });
      audio.onended = () => {
        URL.revokeObjectURL(url);
        useAgentSession.setState({ playing: false, orb: "idle", voiceTurn: "listening" });
      };
      await audio.play();
      return;
    }

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
    });
    if (currentSound) {
      await currentSound.unloadAsync().catch(() => {});
      currentSound = null;
    }
    const fileUri = (FileSystem.cacheDirectory || "") + "voxbank_response.wav";
    await FileSystem.writeAsStringAsync(fileUri, b64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const { sound } = await Audio.Sound.createAsync({ uri: fileUri });
    currentSound = sound;
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) {
        sound.unloadAsync().catch(() => {});
        currentSound = null;
        useAgentSession.setState({ playing: false, orb: "idle", voiceTurn: "listening" });
      }
    });
    useAgentSession.setState({ playing: true, orb: "speaking" });
    await sound.playAsync();
  } catch (e) {
    console.warn(TAG, "playAudioBase64 ERROR:", e);
    useAgentSession.setState({ playing: false, orb: "idle" });
  }
}

// ── Web audio recording via Web Audio API (raw PCM 16kHz) ──

let webMediaStream: MediaStream | null = null;
let webAudioCtx: AudioContext | null = null;
let webSourceNode: MediaStreamAudioSourceNode | null = null;
let webProcessorNode: ScriptProcessorNode | null = null;

const TARGET_SAMPLE_RATE = 16000;
const PCM_MIME = "audio/pcm;rate=16000";

function downsampleBuffer(
  buffer: Float32Array,
  inputRate: number,
  outputRate: number
): Int16Array {
  if (inputRate === outputRate) {
    const out = new Int16Array(buffer.length);
    for (let i = 0; i < buffer.length; i++) {
      const s = Math.max(-1, Math.min(1, buffer[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
  }
  const ratio = inputRate / outputRate;
  const newLength = Math.round(buffer.length / ratio);
  const out = new Int16Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const idx = Math.round(i * ratio);
    const s = Math.max(-1, Math.min(1, buffer[idx] || 0));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function startWebPCMCapture(ws: WebSocket) {
  console.log(TAG, "startWebPCMCapture: solicitando mic...");
  navigator.mediaDevices
    .getUserMedia({ audio: { sampleRate: TARGET_SAMPLE_RATE, channelCount: 1, echoCancellation: true } })
    .then((stream) => {
      webMediaStream = stream;
      webAudioCtx = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
      const actualRate = webAudioCtx.sampleRate;
      console.log(TAG, "startWebPCMCapture: AudioContext sampleRate=", actualRate);

      webSourceNode = webAudioCtx.createMediaStreamSource(stream);
      const bufferSize = 4096;
      webProcessorNode = webAudioCtx.createScriptProcessor(bufferSize, 1, 1);

      let chunkN = 0;
      webProcessorNode.onaudioprocess = (e) => {
        if (!streamingFlag || useAgentSession.getState().voiceTurn !== "listening" || ws.readyState !== WebSocket.OPEN) return;
        const input = e.inputBuffer.getChannelData(0);
        const pcm16 = downsampleBuffer(input, actualRate, TARGET_SAMPLE_RATE);
        const bytes = new Uint8Array(pcm16.buffer);
        const b64 = uint8ToBase64(bytes);
        chunkN++;
        if (chunkN % 10 === 1) {
          console.log(TAG, `pcmChunk #${chunkN}: ${bytes.length} bytes -> ${b64.length} b64`);
        }
        ws.send(
          JSON.stringify({
            type: "audio_chunk",
            data: b64,
            mime: PCM_MIME,
          })
        );
      };

      webSourceNode.connect(webProcessorNode);
      webProcessorNode.connect(webAudioCtx.destination);
      console.log(TAG, "startWebPCMCapture: captura iniciada");
    })
    .catch((err) => {
      console.warn(TAG, "startWebPCMCapture: getUserMedia error:", err);
    });
}

function stopWebPCMCapture() {
  console.log(TAG, "stopWebPCMCapture");
  if (webProcessorNode) {
    webProcessorNode.disconnect();
    webProcessorNode = null;
  }
  if (webSourceNode) {
    webSourceNode.disconnect();
    webSourceNode = null;
  }
  if (webAudioCtx) {
    webAudioCtx.close().catch(() => {});
    webAudioCtx = null;
  }
  if (webMediaStream) {
    webMediaStream.getTracks().forEach((t) => t.stop());
    webMediaStream = null;
  }
}

// ── Native audio recording (expo-av) ──────────────────────

let chunkSeq = 0;

async function recordOneChunk(): Promise<string | null> {
  try {
    const { recording } = await Audio.Recording.createAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY
    );
    await new Promise((r) => setTimeout(r, CHUNK_MS));
    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    if (!uri) return null;
    const b64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    chunkSeq++;
    console.log(TAG, `recordOneChunk #${chunkSeq}: b64 len=${b64.length}`);
    return b64;
  } catch (e) {
    console.warn(TAG, "recordOneChunk ERROR:", e);
    return null;
  }
}

function sendChunk(ws: WebSocket, b64: string) {
  if (ws.readyState === WebSocket.OPEN) {
    console.log(TAG, `sendChunk: enviando ${b64.length} chars b64`);
    ws.send(
      JSON.stringify({ type: "audio_chunk", data: b64, mime: "audio/mp4" })
    );
  } else {
    console.warn(TAG, "sendChunk: WS no esta OPEN, readyState=", ws.readyState);
  }
}

export const useAgentSession = create<AgentSession>((set, get) => ({
  socket: null,
  currentUser: null,
  currentToken: null,
  connected: false,
  processing: false,
  expanded: false,
  orb: "idle",
  activity: null,
  messages: [],
  navTarget: null,
  actionTick: 0,

  voiceSocket: null,
  voiceConnected: false,
  voiceReady: false,
  streaming: false,
  playing: false,
  voiceTurn: null,

  connect: (userId, token) => {
    const { socket, currentUser } = get();
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
    set({ socket: ws, currentUser: userId, currentToken: token });

    ws.onopen = () => {
      set({ connected: true });
      ws.send(JSON.stringify({ token }));
    };
    ws.onclose = () => set({ connected: false });
    ws.onerror = () => set({ connected: false });

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

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

      if (data.type === "error" || data.error) {
        set((s) => ({
          processing: false,
          orb: "idle",
          activity: null,
          messages: [...s.messages, { role: "agent", text: data.text }],
        }));
        return;
      }

      if (data.text) {
        const route = data.navigate_to
          ? SCREEN_TO_ROUTE[data.navigate_to]
          : null;
        set((s) => ({
          processing: false,
          orb: "speaking",
          activity: null,
          messages: [...s.messages, { role: "agent", text: data.text }],
          navTarget: route ? { route, ts: Date.now() } : s.navTarget,
          actionTick: s.actionTick + 1,
        }));
        if (speakTimer) clearTimeout(speakTimer);
        speakTimer = setTimeout(() => set({ orb: "idle" }), 1400);
      }
    };
  },

  disconnect: () => {
    const { socket } = get();
    if (socket) socket.close();
    get().disconnectVoice();
    set({
      socket: null,
      currentUser: null,
      currentToken: null,
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

  // ── Voice streaming ─────────────────────────────────────
  connectVoice: () => {
    const { voiceSocket, currentUser, currentToken } = get();
    console.log(TAG, "connectVoice: user=", currentUser);
    if (!currentUser || !currentToken) return;
    if (
      voiceSocket &&
      (voiceSocket.readyState === WebSocket.OPEN ||
        voiceSocket.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
    if (voiceSocket) voiceSocket.close();

    const url = `${WS_VOICE_URL}/${currentUser}`;
    console.log(TAG, "connectVoice: url=", url);
    const ws = new WebSocket(url);
    set({ voiceSocket: ws, voiceReady: false });

    ws.onopen = () => {
      console.log(TAG, "connectVoice: WS abierto, enviando token");
      set({ voiceConnected: true });
      ws.send(JSON.stringify({ token: currentToken }));
    };
    ws.onclose = (e) => {
      console.log(TAG, "connectVoice: WS cerrado, code=", e.code);
      set({ voiceConnected: false, voiceReady: false });
    };
    ws.onerror = (e) => {
      console.warn(TAG, "connectVoice: WS error:", e);
      set({ voiceConnected: false, voiceReady: false });
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log(
        TAG,
        "voice WS msg:",
        data.type,
        data.type === "audio"
          ? `(b64 len=${data.data?.length})`
          : JSON.stringify(data).substring(0, 120)
      );

      if (data.type === "ready") {
        set({ voiceReady: true });
        return;
      }

      if (data.type === "user_transcript") {
        set((s) => ({
          messages: [...s.messages, { role: "user", text: data.text }],
          voiceTurn: "thinking",
          orb: "thinking",
        }));
        return;
      }

      if (data.type === "tool") {
        const route = SCREEN_TO_ROUTE[data.navigate_to];
        const label = TOOL_LABEL[data.tool_used] || "Trabajando…";
        set((s) => ({
          orb: "working",
          activity: label,
          voiceTurn: "thinking",
          messages: [...s.messages, { role: "activity", text: label }],
          navTarget: route ? { route, ts: Date.now() } : s.navTarget,
          actionTick: s.actionTick + 1,
        }));
        return;
      }

      if (data.type === "transcript") {
        pendingTranscript += data.text;
        if (!get().voiceTurn || get().voiceTurn === "listening") {
          set({ voiceTurn: "thinking", orb: "thinking" });
        }
        return;
      }

      if (data.type === "audio") {
        const fullText = pendingTranscript.trim();
        pendingTranscript = "";
        if (fullText) {
          set((s) => ({
            messages: [...s.messages, { role: "agent", text: fullText }],
          }));
        }
        playAudioBase64(data.data);
        return;
      }

      if (data.type === "end_session") {
        const leftover = pendingTranscript.trim();
        pendingTranscript = "";
        if (leftover) {
          set((s) => ({
            messages: [...s.messages, { role: "agent", text: leftover }],
          }));
        }
        streamingFlag = false;
        if (Platform.OS === "web") { stopWebPCMCapture(); }
        set({
          streaming: false,
          processing: false,
          orb: "idle",
          voiceTurn: null,
          activity: null,
        });
        get().disconnectVoice();
        return;
      }

      if (data.type === "turn_complete") {
        const leftover = pendingTranscript.trim();
        pendingTranscript = "";
        const isPlaying = get().playing;
        set((s) => ({
          processing: false,
          activity: null,
          actionTick: s.actionTick + 1,
          voiceTurn: isPlaying ? s.voiceTurn : "listening",
          orb: isPlaying ? s.orb : "idle",
          messages: leftover
            ? [...s.messages, { role: "agent", text: leftover }]
            : s.messages,
        }));
        return;
      }

      if (data.type === "error") {
        pendingTranscript = "";
        set((s) => ({
          processing: false,
          orb: "idle",
          voiceTurn: null,
          activity: null,
          messages: [...s.messages, { role: "agent", text: data.text }],
        }));
        return;
      }
    };
  },

  disconnectVoice: () => {
    console.log(TAG, "disconnectVoice");
    streamingFlag = false;
    stopWebPCMCapture();
    if (chunkLoopHandle) {
      clearTimeout(chunkLoopHandle);
      chunkLoopHandle = null;
    }
    const { voiceSocket } = get();
    if (voiceSocket) voiceSocket.close();
    if (currentSound) {
      currentSound.unloadAsync().catch(() => {});
      currentSound = null;
    }
    set({
      voiceSocket: null,
      voiceConnected: false,
      voiceReady: false,
      streaming: false,
      playing: false,
      voiceTurn: null,
    });
  },

  startVoiceStream: async () => {
    console.log(TAG, "startVoiceStream: platform=", Platform.OS);
    const state = get();

    if (!state.voiceReady) {
      console.log(TAG, "startVoiceStream: conectando voice WS...");
      state.connectVoice();
      await new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if (useAgentSession.getState().voiceReady) {
            clearInterval(check);
            resolve();
          }
        }, 100);
        setTimeout(() => {
          clearInterval(check);
          console.warn(TAG, "startVoiceStream: timeout esperando ready");
          resolve();
        }, 5000);
      });
    }

    if (!useAgentSession.getState().voiceReady) {
      console.warn(TAG, "startVoiceStream: voice WS nunca llego a ready");
      return;
    }

    streamingFlag = true;
    chunkSeq = 0;
    pendingTranscript = "";
    set({ streaming: true, orb: "idle", voiceTurn: "listening", activity: null });

    const ws = useAgentSession.getState().voiceSocket;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.warn(TAG, "startVoiceStream: WS no disponible");
      return;
    }

    if (Platform.OS === "web") {
      startWebPCMCapture(ws);
    } else {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        console.warn(TAG, "startVoiceStream: permisos denegados");
        set({ streaming: false });
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const loop = async () => {
        while (streamingFlag) {
          const ws2 = useAgentSession.getState().voiceSocket;
          if (!ws2 || ws2.readyState !== WebSocket.OPEN) break;
          if (useAgentSession.getState().voiceTurn !== "listening") {
            await new Promise((r) => setTimeout(r, 100));
            continue;
          }
          const b64 = await recordOneChunk();
          if (b64 && streamingFlag) sendChunk(ws2, b64);
        }
        console.log(TAG, "startVoiceStream loop: terminado");
      };
      loop();
    }
  },

  stopVoiceStream: async () => {
    console.log(TAG, "stopVoiceStream: deteniendo captura (sin cerrar stream)");
    streamingFlag = false;

    if (Platform.OS === "web") {
      stopWebPCMCapture();
    }

    set({
      streaming: false,
      processing: false,
      orb: "idle",
      voiceTurn: null,
      activity: null,
    });
  },
}));
