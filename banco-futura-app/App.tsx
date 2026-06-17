import React, { useEffect, useRef } from "react";
import { registerRootComponent } from "expo";
import { Platform } from "react-native";
import {
  NavigationContainer,
  useNavigationContainerRef,
  DarkTheme,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";

import LoginScreen from "./src/screens/LoginScreen";
import DashboardScreen from "./src/screens/DashboardScreen";
import TransferScreen from "./src/screens/TransferScreen";
import MovementsScreen from "./src/screens/MovementsScreen";
import CardsScreen from "./src/screens/CardsScreen";
import AgentDock from "./src/components/AgentDock";
import { colors } from "./src/theme";

import { useAgentSession } from "./src/services/agentSession";

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// Tema oscuro para el contenedor: evita flashes blancos entre vistas.
const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.bg,
    primary: colors.blue,
    text: colors.text,
    border: colors.border,
  },
};

// Íconos Feather (la familia de la que deriva lucide) por cada pestaña.
const TAB_ICON: Record<string, React.ComponentProps<typeof Feather>["name"]> = {
  Dashboard: "home",
  Transfer: "send",
  Movements: "list",
  Cards: "credit-card",
};

const TAB_LABEL: Record<string, string> = {
  Dashboard: "Inicio",
  Transfer: "Transferir",
  Movements: "Movimientos",
  Cards: "Tarjetas",
};

/**
 * Barra de navegación inferior (extraída del mockup): fondo oscuro translúcido,
 * ítem activo en azul con un punto debajo, resto en gris.
 */
function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: true,
        tabBarActiveTintColor: colors.blue,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: {
          backgroundColor: "rgba(10,18,33,0.96)",
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 64,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontSize: 10 },
        tabBarIcon: ({ color, size }) => (
          <Feather name={TAB_ICON[route.name]} size={size ?? 20} color={color} />
        ),
        tabBarLabel: TAB_LABEL[route.name],
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Transfer" component={TransferScreen} />
      <Tab.Screen name="Movements" component={MovementsScreen} />
      <Tab.Screen name="Cards" component={CardsScreen} />
    </Tab.Navigator>
  );
}

/**
 * Navegación dirigida por el agente: cuando el orquestador ejecuta una tool,
 * el WebSocket emite el destino y navegamos en tiempo real. Las rutas viven
 * dentro del Tab navigator; navigate(name) las resuelve igual desde la raíz.
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
      <StatusBar style="light" />
      <NavigationContainer ref={navigationRef} theme={navTheme}>
        <Stack.Navigator
          initialRouteName="Login"
          screenOptions={{
            headerShown: false,
            animation: Platform.OS === "web" ? "fade" : "slide_from_right",
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Main" component={MainTabs} />
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
