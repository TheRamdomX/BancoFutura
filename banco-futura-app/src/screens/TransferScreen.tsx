import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { getAccounts, recordId } from "../services/surreal";
import { transfer } from "../services/api";
import { formatCLP } from "../utils/format";
import Screen, { ScreenHeader } from "../components/Screen";
import FadeInView from "../components/FadeInView";
import { colors, radius, space } from "../theme";

export default function TransferScreen() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [fromId, setFromId] = useState<string>("");
  const [toId, setToId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [status, setStatus] = useState<{ ok?: string; err?: string }>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getAccounts()
      .then((a) => {
        setAccounts(a);
        if (a[0]) setFromId(recordId(a[0].id));
      })
      .catch((e) => console.error(e));
  }, []);

  async function handleTransfer() {
    setStatus({});
    const amt = parseFloat(amount);
    if (!fromId || !toId || !amt) {
      setStatus({ err: "Completa cuenta origen, destino y monto." });
      return;
    }
    setLoading(true);
    try {
      const res = await transfer(fromId, toId.trim(), amt, description.trim());
      setStatus({ ok: `Transferencia realizada. Nuevo saldo: ${formatCLP(res.new_balance_origin)}` });
      setAmount("");
      setDescription("");
    } catch (e: any) {
      setStatus({ err: e.message || "Error al transferir" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <ScreenHeader title="Transferir" subtitle="Nueva transferencia" />
      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
      >
        <FadeInView delay={60}>
          <Text style={styles.label}>Desde</Text>
          <View style={styles.pickerRow}>
            {accounts.map((a) => {
              const id = recordId(a.id);
              const selected = id === fromId;
              return (
                <TouchableOpacity
                  key={id}
                  style={[styles.chip, selected && styles.chipSelected]}
                  onPress={() => setFromId(id)}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                    {a.type === "savings" ? "Ahorro" : "Corriente"} · {formatCLP(a.balance)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </FadeInView>

        <FadeInView delay={140}>
          <Text style={styles.label}>Cuenta destino</Text>
          <View style={styles.inputWrap}>
            <Feather name="user" size={18} color={colors.textFaint} />
            <TextInput
              style={styles.input}
              placeholder="account:acc_3"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="none"
              value={toId}
              onChangeText={setToId}
            />
          </View>

          <Text style={styles.label}>Monto (CLP)</Text>
          <View style={styles.inputWrap}>
            <Text style={styles.currency}>$</Text>
            <TextInput
              style={styles.input}
              placeholder="10000"
              placeholderTextColor={colors.textFaint}
              keyboardType="numeric"
              value={amount}
              onChangeText={setAmount}
            />
          </View>

          <Text style={styles.label}>Descripción (opcional)</Text>
          <View style={styles.inputWrap}>
            <Feather name="edit-3" size={18} color={colors.textFaint} />
            <TextInput
              style={styles.input}
              placeholder="Pago arriendo"
              placeholderTextColor={colors.textFaint}
              value={description}
              onChangeText={setDescription}
            />
          </View>
        </FadeInView>

        {status.err && <Text style={styles.error}>{status.err}</Text>}
        {status.ok && (
          <View style={styles.okRow}>
            <Feather name="check-circle" size={18} color={colors.emerald} />
            <Text style={styles.ok}>{status.ok}</Text>
          </View>
        )}

        <FadeInView delay={220}>
          <TouchableOpacity
            style={styles.button}
            onPress={handleTransfer}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Feather name="send" size={18} color="#fff" />
                <Text style={styles.buttonText}>Transferir</Text>
              </>
            )}
          </TouchableOpacity>
        </FadeInView>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.lg, paddingBottom: 120 },
  label: { fontSize: 14, color: colors.textMuted, marginTop: 14, marginBottom: 8 },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
  },
  input: { flex: 1, paddingVertical: 14, fontSize: 16, color: colors.text },
  currency: { color: colors.textFaint, fontSize: 18 },
  pickerRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  chipSelected: { backgroundColor: colors.blueDeep, borderColor: colors.blue },
  chipText: { color: colors.textMuted },
  chipTextSelected: { color: "#fff", fontWeight: "600" },
  button: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: colors.blueDeep,
    padding: 16,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 26,
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  error: { color: colors.red, marginTop: 14 },
  okRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14 },
  ok: { color: colors.emerald, flex: 1 },
});
