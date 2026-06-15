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

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="Escribe un mensaje…"
            value={input}
            onChangeText={setInput}
            onSubmitEditing={handleSend}
            editable={connected}
          />
          <Pressable style={styles.sendBtn} onPress={handleSend} disabled={!connected}>
            <Text style={styles.sendText}>➤</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const PANEL_WIDTH = 430;

// Estilos del markdown para los mensajes del agente (paleta de la app).
const mdStyles = StyleSheet.create({
  body: { color: "#1A1F36", fontSize: 14, lineHeight: 20 },
  strong: { fontWeight: "700" },
  em: { fontStyle: "italic" },
  bullet_list: { marginVertical: 2 },
  ordered_list: { marginVertical: 2 },
  list_item: { marginVertical: 1 },
  heading1: { fontSize: 18, fontWeight: "800", marginVertical: 4 },
  heading2: { fontSize: 16, fontWeight: "800", marginVertical: 4 },
  heading3: { fontSize: 15, fontWeight: "700", marginVertical: 3 },
  link: { color: "#0B5FFF" },
  code_inline: {
    backgroundColor: "#E3E9F2",
    color: "#1A1F36",
    borderRadius: 4,
    paddingHorizontal: 4,
    fontFamily: "monospace",
    fontSize: 13,
  },
  fence: {
    backgroundColor: "#E3E9F2",
    borderRadius: 8,
    padding: 8,
    fontFamily: "monospace",
    fontSize: 13,
  },
  code_block: {
    backgroundColor: "#E3E9F2",
    borderRadius: 8,
    padding: 8,
    fontFamily: "monospace",
    fontSize: 13,
  },
});

const styles = StyleSheet.create({
  panelWrap: {
    position: "absolute",
    right: 24,
    bottom: 28,
    alignItems: "flex-end",
  },
  panel: {
    width: PANEL_WIDTH,
    maxWidth: "92%",
    height: 460,
    maxHeight: "78%",
    backgroundColor: "#fff",
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
    borderBottomColor: "#EEF2F8",
  },
  headerLeft: { flexDirection: "row", alignItems: "center" },
  dot: { width: 9, height: 9, borderRadius: 5, marginRight: 8 },
  headerTitle: { fontSize: 16, fontWeight: "800", color: "#1A1F36" },
  close: { fontSize: 16, color: "#666", paddingHorizontal: 4 },
  list: { flex: 1 },
  bubble: { padding: 10, borderRadius: 12, marginVertical: 4, maxWidth: "85%" },
  user: { backgroundColor: "#0B5FFF", alignSelf: "flex-end" },
  agent: { backgroundColor: "#EEF2F8", alignSelf: "flex-start" },
  userText: { color: "#fff" },
  agentText: { color: "#1A1F36" },
  activityRow: { alignSelf: "center", marginVertical: 4 },
  activityText: { color: "#0B5FFF", fontSize: 12, fontStyle: "italic" },
  hint: { color: "#999", textAlign: "center", marginTop: 28, paddingHorizontal: 12 },
  inputRow: { flexDirection: "row", alignItems: "center", marginTop: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  sendBtn: {
    backgroundColor: "#0B5FFF",
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },
  sendText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
