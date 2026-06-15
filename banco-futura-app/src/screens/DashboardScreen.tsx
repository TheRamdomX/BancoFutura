import React, { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { getAccounts, recordId } from "../services/surreal";
import { useAuthStore } from "../services/authStore";
import { useAgentSession } from "../services/agentSession";
import { formatCLP } from "../utils/format";

export default function DashboardScreen({ navigation }: any) {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const username = useAuthStore((s) => s.username);
  // Cada acción del agente refresca los saldos en vivo.
  const actionTick = useAgentSession((s) => s.actionTick);

  const load = useCallback(async () => {
    try {
      setAccounts(await getAccounts());
    } catch (e) {
      console.error("load accounts", e);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    load();
  }, [actionTick, load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.hello}>Hola, {username || "cliente"}</Text>
      <Text style={styles.section}>Tus cuentas</Text>

      {accounts.map((a) => (
        <View key={recordId(a.id)} style={styles.card}>
          <Text style={styles.cardType}>
            {a.type === "savings" ? "Cuenta de ahorro" : "Cuenta corriente"}
          </Text>
          <Text style={styles.balance}>{formatCLP(a.balance)}</Text>
          <Text style={styles.acctId}>{recordId(a.id)}</Text>
        </View>
      ))}
      {accounts.length === 0 && <Text style={styles.empty}>Sin cuentas o sin sesión.</Text>}

      <View style={styles.actions}>
        <Action label="Transferir" onPress={() => navigation.navigate("Transfer")} />
        <Action label="Movimientos" onPress={() => navigation.navigate("Movements")} />
        <Action label="Tarjetas" onPress={() => navigation.navigate("Cards")} />
      </View>


    </ScrollView>
  );
}

function Action({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.action} onPress={onPress}>
      <Text style={styles.actionText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F7FB", padding: 20 },
  hello: { fontSize: 22, fontWeight: "700", marginTop: 8 },
  section: { fontSize: 15, color: "#666", marginTop: 16, marginBottom: 8 },
  card: { backgroundColor: "#0B5FFF", borderRadius: 14, padding: 20, marginBottom: 12 },
  cardType: { color: "#cfe0ff", fontSize: 14 },
  balance: { color: "#fff", fontSize: 28, fontWeight: "800", marginTop: 4 },
  acctId: { color: "#cfe0ff", fontSize: 12, marginTop: 8 },
  empty: { color: "#999", marginVertical: 12 },
  actions: { flexDirection: "row", justifyContent: "space-between", marginTop: 16 },
  action: { flex: 1, backgroundColor: "#fff", borderRadius: 12, padding: 16, marginHorizontal: 4, alignItems: "center" },
  actionText: { color: "#0B5FFF", fontWeight: "700" },
  assistant: { backgroundColor: "#1A1F36", borderRadius: 12, padding: 16, alignItems: "center", marginTop: 20 },
  assistantText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
