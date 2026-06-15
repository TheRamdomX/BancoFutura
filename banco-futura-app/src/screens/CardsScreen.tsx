import React, { useCallback, useEffect, useState } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { getCards, recordId } from "../services/surreal";
import { blockCard } from "../services/api";
import { useAgentSession } from "../services/agentSession";
import { formatCLP } from "../utils/format";

export default function CardsScreen() {
  const [cards, setCards] = useState<any[]>([]);
  // Cada acción del agente (p.ej. bloquear tarjeta) refresca la vista.
  const actionTick = useAgentSession((s) => s.actionTick);

  const load = useCallback(async () => {
    try {
      setCards(await getCards());
    } catch (e) {
      console.error(e);
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

  async function handleBlock(cardId: string) {
    try {
      await blockCard(cardId, "user_request");
      await load();
    } catch (e: any) {
      Alert.alert("No se pudo bloquear", e.message || "Error");
    }
  }

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={{ padding: 16 }}
      data={cards}
      keyExtractor={(item) => recordId(item.id)}
      ListEmptyComponent={<Text style={styles.empty}>Sin tarjetas.</Text>}
      renderItem={({ item }) => {
        const blocked = item.status !== "active";
        return (
          <View style={[styles.card, blocked && styles.cardBlocked]}>
            <Text style={styles.cardBrand}>
              {item.type === "credit" ? "Crédito" : "Débito"}
            </Text>
            <Text style={styles.cardNumber}>•••• •••• •••• {item.last_four}</Text>
            <View style={styles.cardFooter}>
              <Text style={styles.limit}>Límite diario: {formatCLP(item.daily_limit)}</Text>
              <Text style={styles.status}>{item.status.toUpperCase()}</Text>
            </View>
            {!blocked && (
              <TouchableOpacity style={styles.blockBtn} onPress={() => handleBlock(recordId(item.id))}>
                <Text style={styles.blockText}>Bloquear tarjeta</Text>
              </TouchableOpacity>
            )}
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F7FB" },
  card: { backgroundColor: "#1A1F36", borderRadius: 16, padding: 20, marginBottom: 16 },
  cardBlocked: { backgroundColor: "#6B7280" },
  cardBrand: { color: "#9CB4FF", fontSize: 14 },
  cardNumber: { color: "#fff", fontSize: 20, letterSpacing: 2, marginTop: 12 },
  cardFooter: { flexDirection: "row", justifyContent: "space-between", marginTop: 16 },
  limit: { color: "#cbd5e1", fontSize: 13 },
  status: { color: "#fff", fontSize: 13, fontWeight: "700" },
  blockBtn: { marginTop: 16, backgroundColor: "rgba(255,255,255,0.15)", padding: 12, borderRadius: 8, alignItems: "center" },
  blockText: { color: "#fff", fontWeight: "600" },
  empty: { color: "#999", textAlign: "center", marginTop: 40 },
});
