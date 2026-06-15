import React, { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { getAccounts, recordId } from "../services/surreal";
import { transfer } from "../services/api";
import { formatCLP } from "../utils/format";

export default function TransferScreen({ navigation }: any) {
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
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      <Text style={styles.title}>Realizar transferencia</Text>

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

      <Text style={styles.label}>Cuenta destino</Text>
      <TextInput
        style={styles.input}
        placeholder="account:acc_3"
        autoCapitalize="none"
        value={toId}
        onChangeText={setToId}
      />

      <Text style={styles.label}>Monto (CLP)</Text>
      <TextInput
        style={styles.input}
        placeholder="10000"
        keyboardType="numeric"
        value={amount}
        onChangeText={setAmount}
      />

      <Text style={styles.label}>Descripción (opcional)</Text>
      <TextInput
        style={styles.input}
        placeholder="Pago arriendo"
        value={description}
        onChangeText={setDescription}
      />

      {status.err && <Text style={styles.error}>{status.err}</Text>}
      {status.ok && <Text style={styles.ok}>{status.ok}</Text>}

      <TouchableOpacity style={styles.button} onPress={handleTransfer} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Transferir</Text>}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backLink}>
        <Text style={styles.backText}>Volver</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 16 },
  label: { fontSize: 14, color: "#666", marginTop: 12, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 14, fontSize: 16 },
  pickerRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderColor: "#0B5FFF", borderRadius: 20, paddingVertical: 8, paddingHorizontal: 14, marginRight: 8, marginBottom: 8 },
  chipSelected: { backgroundColor: "#0B5FFF" },
  chipText: { color: "#0B5FFF" },
  chipTextSelected: { color: "#fff" },
  button: { backgroundColor: "#0B5FFF", padding: 16, borderRadius: 10, alignItems: "center", marginTop: 24 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  error: { color: "#D32F2F", marginTop: 12 },
  ok: { color: "#2E7D32", marginTop: 12 },
  backLink: { alignItems: "center", marginTop: 16 },
  backText: { color: "#0B5FFF" },
});
