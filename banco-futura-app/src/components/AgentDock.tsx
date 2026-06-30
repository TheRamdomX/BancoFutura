import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import Markdown from "react-native-markdown-display";
import { useAuthStore } from "../services/authStore";
import { useAgentSession } from "../services/agentSession";
import AgentOrb from "./AgentOrb";

/** username → record id que espera el backend en la ruta del WebSocket. */
function toUserId(username: string | null): string {
  if (username === "jperez") return "demo_1";
  if (username === "mlopez") return "demo_2";
  return username || "demo_1";
}

/**
 * Chat persistente del agente, sobre todas las vistas. Colapsado es el orbe;
 * expandido es un panel de chat anclado abajo-derecha. Mantiene la conexión
 * mientras haya sesión.
 */
export default function AgentDock() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const username = useAuthStore((s) => s.username);
  const token = useAuthStore((s) => s.token);

  const {
    connect,
    disconnect,
    send,
    connected,
    processing,
    expanded,
    setExpanded,
    orb,
    activity,
    messages,
    streaming,
    startVoiceStream,
    stopVoiceStream,
    playing,
    voiceTurn,
  } = useAgentSession();

  const [input, setInput] = React.useState("");
  const listRef = useRef<FlatList>(null);

  // Conectar/desconectar según la sesión.
  useEffect(() => {
    if (isAuthenticated && token) {
      connect(toUserId(username), token);
    } else {
      disconnect();
    }
  }, [isAuthenticated, token, username, connect, disconnect]);

  // Auto-scroll al último mensaje.
  useEffect(() => {
    if (messages.length) {
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    }
  }, [messages.length]);

  if (!isAuthenticated) return null;

  function handleSend() {
    const t = input.trim();
    if (!t) return;
    send(t);
    setInput("");
  }

  async function handleMicPress() {
    if (streaming) {
      await stopVoiceStream();
    } else {
      await startVoiceStream();
    }
  }

  // Colapsado: solo el orbe.
  if (!expanded) {
    return <AgentOrb state={orb} activity={activity} onPress={() => setExpanded(true)} />;
  }

  // Expandido: panel de chat.
  return (
    <KeyboardAvoidingView
      style={styles.panelWrap}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      pointerEvents="box-none"
    >
      <View style={styles.panel}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={[styles.dot, { backgroundColor: connected ? "#2E7D32" : "#9E9E9E" }]} />
            <Text style={styles.headerTitle}>VoxBank</Text>
          </View>
          <Pressable onPress={() => setExpanded(false)} hitSlop={10}>
            <Text style={styles.close}>✕</Text>
          </Pressable>
        </View>

        <FlatList
          ref={listRef}
          style={styles.list}
          contentContainerStyle={{ paddingVertical: 8 }}
          data={messages}
          keyExtractor={(_, i) => String(i)}
          renderItem={({ item }) => {
            if (item.role === "activity") {
              return (
                <View style={styles.activityRow}>
                  <Text style={styles.activityText}>⚙️ {item.text}</Text>
                </View>
              );
            }
            if (item.role === "agent") {
              return (
                <View style={[styles.bubble, styles.agent]}>
                  <Markdown style={mdStyles}>{item.text}</Markdown>
                </View>
              );
            }
            return (
              <View style={[styles.bubble, styles.user]}>
                <Text style={styles.userText}>{item.text}</Text>
              </View>
            );
          }}
          ListEmptyComponent={
            <Text style={styles.hint}>
              Pregúntame: "¿cuál es mi saldo?" o "transfiere 10.000 a la cuenta acc_3"
            </Text>
          }
        />

        {processing && <ActivityIndicator color="#0B5FFF" style={{ marginVertical: 6 }} />}

        {streaming ? (
          <View style={styles.inputRow}>
            <View style={[
              styles.recordingBar,
              voiceTurn === "speaking" && styles.speakingBar,
              voiceTurn === "thinking" && styles.thinkingBar,
            ]}>
              <Text style={[
                styles.recordingDot,
                voiceTurn === "speaking" && styles.speakingDot,
                voiceTurn === "thinking" && styles.thinkingDot,
              ]}>●</Text>
              <Text style={[
                styles.recordingLabel,
                voiceTurn === "speaking" && styles.speakingLabel,
                voiceTurn === "thinking" && styles.thinkingLabel,
              ]}>
                {voiceTurn === "speaking"
                  ? "VoxBank está hablando…"
                  : voiceTurn === "thinking"
                  ? "Procesando…"
                  : "Escuchando… habla con VoxBank"}
              </Text>
            </View>
            <Pressable style={styles.stopBtn} onPress={handleMicPress}>
              <Text style={styles.stopText}>⏹</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="Escribe un mensaje…"
              placeholderTextColor="#64748B"
              value={input}
              onChangeText={setInput}
              onSubmitEditing={handleSend}
              editable={connected && !processing}
            />
            <Pressable
              style={styles.micBtn}
              onPress={handleMicPress}
              disabled={!connected || processing}
            >
              <Text style={styles.micText}>{playing ? "🔊" : "🎤"}</Text>
            </Pressable>
            <Pressable
              style={styles.sendBtn}
              onPress={handleSend}
              disabled={!connected || processing}
            >
              <Text style={styles.sendText}>➤</Text>
            </Pressable>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const PANEL_WIDTH = 430;

// Estilos del markdown para los mensajes del agente (paleta de la app).
const mdStyles = StyleSheet.create({
  body: { color: "#E2E8F0", fontSize: 14, lineHeight: 20 },
  strong: { fontWeight: "700", color: "#fff" },
  em: { fontStyle: "italic" },
  bullet_list: { marginVertical: 2 },
  ordered_list: { marginVertical: 2 },
  list_item: { marginVertical: 1 },
  heading1: { fontSize: 18, fontWeight: "800", marginVertical: 4, color: "#fff" },
  heading2: { fontSize: 16, fontWeight: "800", marginVertical: 4, color: "#fff" },
  heading3: { fontSize: 15, fontWeight: "700", marginVertical: 3, color: "#fff" },
  link: { color: "#3B82F6" },
  code_inline: {
    backgroundColor: "rgba(255,255,255,0.10)",
    color: "#E2E8F0",
    borderRadius: 4,
    paddingHorizontal: 4,
    fontFamily: "monospace",
    fontSize: 13,
  },
  fence: {
    backgroundColor: "rgba(255,255,255,0.08)",
    color: "#E2E8F0",
    borderRadius: 8,
    padding: 8,
    fontFamily: "monospace",
    fontSize: 13,
  },
  code_block: {
    backgroundColor: "rgba(255,255,255,0.08)",
    color: "#E2E8F0",
    borderRadius: 8,
    padding: 8,
    fontFamily: "monospace",
    fontSize: 13,
  },
});

const styles = StyleSheet.create({
  panelWrap: {
    // Elevado para despejar la barra de navegación inferior (64px).
    position: "absolute",
    right: 24,
    bottom: 84,
    alignItems: "flex-end",
  },
  panel: {
    width: PANEL_WIDTH,
    maxWidth: "92%",
    height: 460,
    maxHeight: "78%",
    backgroundColor: "#111A2E",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 18,
    marginBottom: 12,
    padding: 12,
    elevation: 12,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  headerLeft: { flexDirection: "row", alignItems: "center" },
  dot: { width: 9, height: 9, borderRadius: 5, marginRight: 8 },
  headerTitle: { fontSize: 16, fontWeight: "800", color: "#fff" },
  close: { fontSize: 16, color: "#94A3B8", paddingHorizontal: 4 },
  list: { flex: 1 },
  bubble: { padding: 10, borderRadius: 12, marginVertical: 4, maxWidth: "85%" },
  user: { backgroundColor: "#2563EB", alignSelf: "flex-end" },
  agent: { backgroundColor: "rgba(255,255,255,0.06)", alignSelf: "flex-start" },
  userText: { color: "#fff" },
  agentText: { color: "#fff" },
  activityRow: { alignSelf: "center", marginVertical: 4 },
  activityText: { color: "#3B82F6", fontSize: 12, fontStyle: "italic" },
  hint: { color: "#64748B", textAlign: "center", marginTop: 28, paddingHorizontal: 12 },
  inputRow: { flexDirection: "row", alignItems: "center", marginTop: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.05)",
    color: "#fff",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  sendBtn: {
    backgroundColor: "#2563EB",
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },
  sendText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  micBtn: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },
  micText: { fontSize: 18 },
  recordingBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#EF4444",
    backgroundColor: "rgba(239,68,68,0.08)",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  recordingDot: { color: "#EF4444", fontSize: 14, marginRight: 8 },
  recordingLabel: { color: "#EF4444", fontSize: 14, fontWeight: "600" },
  speakingBar: { borderColor: "#3B82F6", backgroundColor: "rgba(59,130,246,0.08)" },
  speakingDot: { color: "#3B82F6" },
  speakingLabel: { color: "#3B82F6" },
  thinkingBar: { borderColor: "#F59E0B", backgroundColor: "rgba(245,158,11,0.08)" },
  thinkingDot: { color: "#F59E0B" },
  thinkingLabel: { color: "#F59E0B" },
  stopBtn: {
    backgroundColor: "#EF4444",
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },
  stopText: { color: "#fff", fontSize: 18 },
});
