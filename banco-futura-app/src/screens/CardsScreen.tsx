import React, { useCallback, useEffect, useState } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { getCards, recordId } from "../services/surreal";
import { blockCard } from "../services/api";
import { useAgentSession } from "../services/agentSession";
import { formatCLP } from "../utils/format";
import Screen, { ScreenHeader } from "../components/Screen";
import { colors, gradients, radius, space } from "../theme";

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
    <Screen>
      <ScreenHeader title="Tarjetas" subtitle="Tus tarjetas" />
      <FlatList
        style={{ flex: 1 }}
        contentContainerStyle={styles.list}
        data={cards}
        keyExtractor={(item) => recordId(item.id)}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={<Text style={styles.empty}>Sin tarjetas.</Text>}
        renderItem={({ item }) => {
          const blocked = item.status !== "active";
          const grad = blocked
            ? gradients.cardBlocked
            : item.type === "credit"
            ? gradients.cardCredit
            : gradients.cardDebit;
          return (
            <View style={styles.cardWrap}>
              <LinearGradient
                colors={grad}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.card}
              >
                <View style={styles.cardTop}>
                  <Text style={styles.cardBrand}>
                    {item.type === "credit" ? "Crédito" : "Débito"}
                  </Text>
                  <Feather name="credit-card" size={20} color="rgba(255,255,255,0.7)" />
                </View>
                <Text style={styles.cardNumber}>•••• •••• •••• {item.last_four}</Text>
                <View style={styles.cardFooter}>
                  <Text style={styles.limit}>
                    Límite diario: {formatCLP(item.daily_limit)}
                  </Text>
                  <Text style={styles.status}>{item.status.toUpperCase()}</Text>
                </View>

                {blocked && (
                  <View style={styles.blockedOverlay}>
                    <Feather name="lock" size={16} color="rgba(255,255,255,0.85)" />
                    <Text style={styles.blockedText}>Bloqueada</Text>
                  </View>
                )}
              </LinearGradient>

              {!blocked && (
                <TouchableOpacity
                  style={styles.blockBtn}
                  onPress={() => handleBlock(recordId(item.id))}
                  activeOpacity={0.8}
                >
                  <Feather name="lock" size={16} color={colors.text} />
                  <Text style={styles.blockText}>Bloquear tarjeta</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: space.lg, paddingBottom: 120 },
  cardWrap: { marginBottom: 16 },
  card: { borderRadius: radius.md, padding: 20, overflow: "hidden" },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardBrand: { color: "rgba(255,255,255,0.7)", fontSize: 14 },
  cardNumber: { color: "#fff", fontSize: 20, letterSpacing: 2, marginTop: 16 },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 18,
  },
  limit: { color: "rgba(255,255,255,0.75)", fontSize: 13 },
  status: { color: "#fff", fontSize: 13, fontWeight: "700" },
  blockedOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: radius.md,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  blockedText: { color: "rgba(255,255,255,0.85)", fontSize: 14, fontWeight: "600" },
  blockBtn: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  blockText: { color: colors.text, fontWeight: "600" },
  empty: { color: colors.textFaint, textAlign: "center", marginTop: 40 },
});
