import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { signIn } from "../services/surreal";
import { useAuthStore } from "../services/authStore";

export default function LoginScreen({ navigation }: any) {
  const [username, setUsername] = useState("jperez");
  const [password, setPassword] = useState("demo1234");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const setUser = useAuthStore((s) => s.setUser);

  async function handleLogin() {
    setError(null);
    setLoading(true);
    try {
      const token = await signIn(username.trim(), password);
      setUser(username.trim(), String(token ?? ""));
      navigation.replace("Dashboard");
    } catch (e: any) {
      setError("Credenciales inválidas. Prueba jperez / demo1234.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.brand}>Banco Futura</Text>
      <Text style={styles.subtitle}>Ingresa a tu cuenta</Text>

      <TextInput
        style={styles.input}
        placeholder="Usuario"
        autoCapitalize="none"
        value={username}
        onChangeText={setUsername}
      />
      <TextInput
        style={styles.input}
        placeholder="Contraseña"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {error && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Entrar</Text>}
      </TouchableOpacity>

      <Text style={styles.hint}>Demo: jperez / demo1234</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: "#fff" },
  brand: { fontSize: 32, fontWeight: "800", color: "#0B5FFF", textAlign: "center" },
  subtitle: { fontSize: 16, color: "#555", textAlign: "center", marginBottom: 32 },
  input: { borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 14, marginBottom: 12, fontSize: 16 },
  button: { backgroundColor: "#0B5FFF", padding: 16, borderRadius: 10, alignItems: "center", marginTop: 8 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  error: { color: "#D32F2F", marginBottom: 8, textAlign: "center" },
  hint: { color: "#999", textAlign: "center", marginTop: 24, fontSize: 13 },
});
