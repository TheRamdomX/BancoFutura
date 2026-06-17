import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { colors, space } from "../theme";

/**
 * Cabecera oscura tipo "sticky header" del mockup: título a la izquierda y
 * acciones (campana / perfil) a la derecha. Reutilizable en todas las vistas.
 */
export function ScreenHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        <Text style={styles.title}>{title}</Text>
      </View>
      {right}
    </View>
  );
}

/** Botón redondo translúcido para la cabecera (campana, perfil, etc.). */
export function HeaderIcon({
  name,
  onPress,
  badge,
}: {
  name: React.ComponentProps<typeof Feather>["name"];
  onPress?: () => void;
  badge?: boolean;
}) {
  return (
    <Pressable style={styles.iconBtn} onPress={onPress} hitSlop={8}>
      <Feather name={name} size={20} color={colors.textMuted} />
      {badge ? <View style={styles.badge} /> : null}
    </Pressable>
  );
}

/**
 * Fondo oscuro a pantalla completa con safe-area arriba y espacio inferior para
 * no quedar tapado por la barra de navegación + el orbe del agente.
 */
export default function Screen({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>{children}</View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
  },
  subtitle: { color: colors.textMuted, fontSize: 13 },
  title: { color: colors.text, fontSize: 24, fontWeight: "700", marginTop: 2 },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  badge: {
    position: "absolute",
    top: 9,
    right: 9,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.red,
  },
});
