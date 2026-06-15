import React, { useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from "react-native";
import { getAccounts, getTransactions, recordId } from "../services/surreal";
import { useAgentSession } from "../services/agentSession";
import { formatCLP } from "../utils/format";

export default function MovementsScreen() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [activeAcct, setActiveAcct] = useState<string>("");
  const [txs, setTxs] = useState<any[]>([]);
  // Cada acción del agente refresca los movimientos.
  const actionTick = useAgentSession((s) => s.actionTick);

  useEffect(() => {
    getAccounts().then((a) => {
      setAccounts(a);
      if (a[0]) setActiveAcct(recordId(a[0].id));
    });
  }, []);

  useEffect(() => {
    if (activeAcct) getTransactions(activeAcct).then(setTxs).catch(console.error);
  }, [activeAcct, actionTick]);

  return (
    <View style={styles.container}>
      <View style={styles.pickerRow}>
        {accounts.map((a) => {
          const id = recordId(a.id);
          const selected = id === activeAcct;
          return (
            <TouchableOpacity
              key={id}
              style={[styles.chip, selected && styles.chipSelected]}
              onPress={() => setActiveAcct(id)}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {a.type === "savings" ? "Ahorro" : "Corriente"}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <FlatList
        data={txs}
        keyExtractor={(item) => recordId(item.id)}
        ListEmptyComponent={<Text style={styles.empty}>Sin movimientos.</Text>}
        renderItem={({ item }) => {
          const outgoing = recordId(item.from_account) === activeAcct;
          return (
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.desc}>{item.description || item.type}</Text>
                <Text style={styles.sub}>
                  {outgoing ? `Para ${item.to_name || "—"}` : `De ${item.from_name || "—"}`}
                </Text>
              </View>
              <Text style={[styles.amount, outgoing ? styles.neg : styles.pos]}>
                {outgoing ? "-" : "+"}
                {formatCLP(item.amount)}
              </Text>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 16 },
  pickerRow: { flexDirection: "row", marginBottom: 12 },
  chip: { borderWidth: 1, borderColor: "#0B5FFF", borderRadius: 20, paddingVertical: 6, paddingHorizontal: 14, marginRight: 8 },
  chipSelected: { backgroundColor: "#0B5FFF" },
  chipText: { color: "#0B5FFF" },
  chipTextSelected: { color: "#fff" },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#eee" },
  desc: { fontSize: 16, fontWeight: "600" },
  sub: { fontSize: 13, color: "#888", marginTop: 2 },
  amount: { fontSize: 16, fontWeight: "700" },
  neg: { color: "#D32F2F" },
  pos: { color: "#2E7D32" },
  empty: { color: "#999", textAlign: "center", marginTop: 40 },
});
