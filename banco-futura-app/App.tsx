import React, { useEffect, useRef } from "react";
import { registerRootComponent } from "expo";
import { NavigationContainer, useNavigationContainerRef } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider } from "react-native-safe-area-context";

import LoginScreen from "./src/screens/LoginScreen";
import DashboardScreen from "./src/screens/DashboardScreen";
import TransferScreen from "./src/screens/TransferScreen";
import MovementsScreen from "./src/screens/MovementsScreen";
import CardsScreen from "./src/screens/CardsScreen";
import AgentDock from "./src/components/AgentDock";

import { useAgentSession } from "./src/services/agentSession";

const Stack = createNativeStackNavigator();

/**
 * Navegación dirigida por el agente: cuando el orquestador ejecuta una tool,
 * el WebSocket emite el destino y navegamos en tiempo real (sin esperar la
 * respuesta final). La fuente de verdad es agentSession.navTarget.
 */
function AgentNavigator({ navigationRef }: { navigationRef: any }) {
  const navTarget = useAgentSession((s) => s.navTarget);
  const lastTs = useRef<number>(0);

  useEffect(() => {
    if (!navTarget || navTarget.ts === lastTs.current) return;
    if (!navigationRef.isReady()) return;
    lastTs.current = navTarget.ts;
    navigationRef.navigate(navTarget.route as never);
  }, [navTarget, navigationRef]);

  return null;
}

export default function App() {
  const navigationRef = useNavigationContainerRef();

  return (
    <SafeAreaProvider>
      <NavigationContainer ref={navigationRef}>
        <Stack.Navigator initialRouteName="Login">
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Dashboard" component={DashboardScreen} options={{ title: "Banco Futura" }} />
          <Stack.Screen name="Transfer" component={TransferScreen} options={{ title: "Transferir" }} />
          <Stack.Screen name="Movements" component={MovementsScreen} options={{ title: "Movimientos" }} />
          <Stack.Screen name="Cards" component={CardsScreen} options={{ title: "Tarjetas" }} />
        </Stack.Navigator>
        <AgentNavigator navigationRef={navigationRef} />
        <AgentDock />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

// Con "main": "App.tsx", este archivo es el punto de entrada: hay que montar
// el componente raíz explícitamente (en web no se monta solo con export default).
registerRootComponent(App);
