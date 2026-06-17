import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { getAccounts, recordId } from "../services/surreal";
import { useAuthStore } from "../services/authStore";
import { useAgentSession } from "../services/agentSession";
import { formatCLP } from "../utils/format";
import Screen, { ScreenHeader, HeaderIcon } from "../components/Screen";
import FadeInView from "../components/FadeInView";
import { colors, gradients, radius, space } from "../theme";

const QUICK_ACTIONS: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  route: string;
}[] = [
  { icon: "send", label: "Transferir", route: "Transfer" },
  { icon: "list", label: "Movimientos", route: "Movements" },
  { icon: "credit-card", label: "Tarjetas", route: "Cards" },
];

export default function DashboardScreen({ navigation }: any) {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [hideBalance, setHideBalance] = useState(false);
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
    <Screen>
      <ScreenHeader
        subtitle="Buenos días"
        title={username || "cliente"}
        right={
          <>
            <HeaderIcon name="bell" badge />
            <HeaderIcon name="user" />
          </>
        }
      />
      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.textMuted}
          />
        }
      >
        <FadeInView delay={60}>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>Tus cuentas</Text>
            <TouchableOpacity onPress={() => setHideBalance((h) => !h)} hitSlop={8}>
              <Feather
                name={hideBalance ? "eye-off" : "eye"}
                size={16}
                color={colors.textFaint}
              />
            </TouchableOpacity>
          </View>
        </FadeInView>

        {accounts.map((a, i) => (
          <FadeInView key={recordId(a.id)} delay={120 + i * 80}>
            <LinearGradient
              colors={a.type === "savings" ? gradients.savings : gradients.checking}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.acct}
            >
              <View style={styles.acctTop}>
                <Text style={styles.acctType}>
                  {a.type === "savings" ? "Cuenta de ahorro" : "Cuenta corriente"}
                </Text>
                <Feather name="chevron-right" size={20} color="rgba(255,255,255,0.55)" />
              </View>
              <Text style={styles.balance}>
                {hideBalance ? "••••••••" : formatCLP(a.balance)}
              </Text>
              <Text style={styles.acctId}>{recordId(a.id)}</Text>
            </LinearGradient>
          </FadeInView>
        ))}
        {accounts.length === 0 && (
          <Text style={styles.empty}>Sin cuentas o sin sesión.</Text>
        )}

        <FadeInView delay={260}>
          <Text style={[styles.sectionTitle, { marginTop: space.lg }]}>
            Acciones rápidas
          </Text>
          <View style={styles.actions}>
            {QUICK_ACTIONS.map((qa) => (
              <TouchableOpacity
                key={qa.route}
                style={styles.action}
                activeOpacity={0.8}
                onPress={() => navigation.navigate(qa.route)}
              >
                <Feather name={qa.icon} size={22} color={colors.blue} />
                <Text style={styles.actionText}>{qa.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </FadeInView>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.lg, paddingBottom: 120 },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 12,
  },
  acct: { borderRadius: radius.lg, padding: 20, marginBottom: 12 },
  acctTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  acctType: { color: "rgba(255,255,255,0.75)", fontSize: 14 },
  balance: { color: "#fff", fontSize: 28, fontWeight: "800", marginTop: 6 },
  acctId: { color: "rgba(255,255,255,0.55)", fontSize: 12, marginTop: 8 },
  empty: { color: colors.textFaint, marginVertical: 12 },
  actions: { flexDirection: "row", gap: 12 },
  action: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: 18,
    alignItems: "center",
    gap: 8,
  },
  actionText: { color: colors.textMuted, fontSize: 12 },
});
