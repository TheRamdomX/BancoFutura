import React, { useEffect, useRef } from "react";
import { Animated, ViewStyle, StyleProp } from "react-native";
import { useIsFocused } from "@react-navigation/native";

/**
 * Equivalente RN del `<FadeIn>` del mockup web: aparece con opacidad +
 * desplazamiento vertical, con un `delay` opcional para escalonar
 * (stagger) una lista de elementos al montar la vista.
 *
 *   <FadeInView delay={100}>...</FadeInView>
 *
 * El bottom-tabs NO desmonta las pantallas al cambiar de pestaña, así que la
 * animación se re-dispara cada vez que la vista gana foco (no solo al montar).
 * Usa el driver nativo (transform/opacity) para que sea fluida en móvil y web.
 */
export default function FadeInView({
  children,
  delay = 0,
  offset = 12,
  duration = 420,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  offset?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  const isFocused = useIsFocused();

  useEffect(() => {
    if (!isFocused) return;
    // Reinicia al estado oculto y vuelve a animar cada vez que la vista
    // gana foco (cambiar de pestaña no remonta el componente).
    progress.setValue(0);
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration,
      delay,
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [isFocused, progress, delay, duration]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [offset, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
