import React, { useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from "react-native";
import { Feather } from "@expo/vector-icons";
import { getAccounts, getTransactions, recordId } from "../services/surreal";
import { useAgentSession } from "../services/agentSession";
import { formatCLP } from "../utils/format";
import Screen, { ScreenHeader } from "../components/Screen";
import { colors, radius, space } from "../theme";

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
    <Screen>
      <ScreenHeader title="Movimientos" />
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
        style={{ flex: 1 }}
        contentContainerStyle={styles.list}
        keyExtractor={(item) => recordId(item.id)}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={<Text style={styles.empty}>Sin movimientos.</Text>}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        renderItem={({ item }) => {
          const outgoing = recordId(item.from_account) === activeAcct;
          return (
            <View style={styles.row}>
              <View style={[styles.iconCircle, outgoing ? styles.iconOut : styles.iconIn]}>
                <Feather
                  name={outgoing ? "arrow-up-right" : "arrow-down-left"}
                  size={18}
                  color={outgoing ? colors.textMuted : colors.emerald}
                />
              </View>
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  pickerRow: { flexDirection: "row", gap: 8, paddingHorizontal: space.lg, marginBottom: 12 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  chipSelected: { backgroundColor: colors.blueDeep, borderColor: colors.blue },
  chipText: { color: colors.textMuted },
  chipTextSelected: { color: "#fff", fontWeight: "600" },
  list: {
    marginHorizontal: space.lg,
    paddingHorizontal: 4,
    paddingBottom: 120,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14 },
  iconCircle: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  iconIn: { backgroundColor: "rgba(16,185,129,0.15)" },
  iconOut: { backgroundColor: "rgba(148,163,184,0.15)" },
  desc: { fontSize: 15, fontWeight: "600", color: colors.text },
  sub: { fontSize: 13, color: colors.textFaint, marginTop: 2 },
  amount: { fontSize: 15, fontWeight: "700" },
  neg: { color: colors.text },
  pos: { color: colors.emerald },
  sep: { height: 1, backgroundColor: colors.border },
  empty: { color: colors.textFaint, textAlign: "center", marginTop: 40 },
});
