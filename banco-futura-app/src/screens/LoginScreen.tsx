import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { signIn } from "../services/surreal";
import { useAuthStore } from "../services/authStore";
import FadeInView from "../components/FadeInView";
import { colors, radius, space } from "../theme";

export default function LoginScreen({ navigation }: any) {
  const [username, setUsername] = useState("jperez");
  const [password, setPassword] = useState("demo1234");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const setUser = useAuthStore((s) => s.setUser);

  async function handleLogin() {
    setError(null);
    setLoading(true);
    try {
      const token = await signIn(username.trim(), password);
      setUser(username.trim(), String(token ?? ""));
      navigation.replace("Main");
    } catch (e: any) {
      setError("Credenciales inválidas. Prueba jperez / demo1234.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <FadeInView>
        <View style={styles.logoRow}>
          <View style={styles.logoBadge}>
            <Feather name="home" size={26} color="#fff" />
          </View>
        </View>
        <Text style={styles.brand}>Banco Futura</Text>
        <Text style={styles.subtitle}>Ingresa a tu cuenta</Text>
      </FadeInView>

      <FadeInView delay={120}>
        <View style={styles.inputWrap}>
          <Feather name="user" size={18} color={colors.textFaint} />
          <TextInput
            style={styles.input}
            placeholder="Usuario"
            placeholderTextColor={colors.textFaint}
            autoCapitalize="none"
            value={username}
            onChangeText={setUsername}
          />
        </View>

        <View style={styles.inputWrap}>
          <Feather name="lock" size={18} color={colors.textFaint} />
          <TextInput
            style={styles.input}
            placeholder="Contraseña"
            placeholderTextColor={colors.textFaint}
            secureTextEntry={!showPass}
            value={password}
            onChangeText={setPassword}
          />
          <TouchableOpacity onPress={() => setShowPass((v) => !v)} hitSlop={8}>
            <Feather
              name={showPass ? "eye-off" : "eye"}
              size={18}
              color={colors.textFaint}
            />
          </TouchableOpacity>
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity
          style={styles.button}
          onPress={handleLogin}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Entrar</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.hint}>Demo: jperez / demo1234</Text>
      </FadeInView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: space.xl,
    backgroundColor: colors.bg,
  },
  logoRow: { alignItems: "center", marginBottom: space.md },
  logoBadge: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: colors.blueDeep,
    alignItems: "center",
    justifyContent: "center",
  },
  brand: {
    fontSize: 30,
    fontWeight: "800",
    color: colors.text,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15,
    color: colors.textMuted,
    textAlign: "center",
    marginBottom: space.xl + 8,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  input: { flex: 1, paddingVertical: 14, fontSize: 16, color: colors.text },
  button: {
    backgroundColor: colors.blueDeep,
    padding: 16,
    borderRadius: radius.sm,
    alignItems: "center",
    marginTop: 8,
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  error: { color: colors.red, marginBottom: 8, textAlign: "center" },
  hint: { color: colors.textFaint, textAlign: "center", marginTop: space.xl, fontSize: 13 },
});
