import React, { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, Text, View, StyleSheet } from "react-native";
import type { OrbState } from "../services/agentSession";

const ORB_COLOR: Record<OrbState, string> = {
  idle: "#1A1F36",
  thinking: "#F5A623",
  working: "#0B5FFF",
  speaking: "#2E7D32",
};

const ORB_ICON: Record<OrbState, string> = {
  idle: "💬",
  thinking: "🤔",
  working: "⚙️",
  speaking: "🔊",
};

/**
 * Burbuja flotante del agente (estado colapsado del chat). Pulsa cuando el
 * agente piensa/trabaja/habla; al tocarla se expande el panel de chat.
 */
export default function AgentOrb({
  state,
  activity,
  onPress,
}: {
  state: OrbState;
  activity: string | null;
  onPress: () => void;
}) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const active = state !== "idle";
    if (!active) {
      pulse.stopAnimation(() => pulse.setValue(1));
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.18,
          duration: 600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [state, pulse]);

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      {activity ? (
        <View style={styles.activityPill}>
          <Text style={styles.activityText} numberOfLines={1}>
            {activity}
          </Text>
        </View>
      ) : null}
      <Pressable onPress={onPress}>
        <Animated.View
          style={[
            styles.orb,
            { backgroundColor: ORB_COLOR[state], transform: [{ scale: pulse }] },
          ]}
        >
          <Text style={styles.icon}>{ORB_ICON[state]}</Text>
        </Animated.View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    // Elevado para no quedar tapado por la barra de navegación inferior (64px).
    position: "absolute",
    bottom: 84,
    right: 24,
    alignItems: "flex-end",
  },
  orb: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  icon: { fontSize: 26 },
  activityPill: {
    backgroundColor: "#1A1F36",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 18,
    marginBottom: 10,
    maxWidth: 240,
  },
  activityText: { color: "#fff", fontSize: 13, fontWeight: "600" },
});
