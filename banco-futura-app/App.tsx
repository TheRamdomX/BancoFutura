import React, { useEffect } from 'react';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import DashboardScreen from './src/screens/DashboardScreen';
import TransferScreen from './src/screens/TransferScreen';
import AgentOrb from './src/components/AgentOrb';
import { initSurreal, subscribeToUIState } from './src/services/surrealLive';
import { useAgentStore } from './src/services/agentStore';

const Stack = createNativeStackNavigator();

export default function App() {
  const navigationRef = useNavigationContainerRef();
  const agentState = useAgentStore((state: any) => state.state);

  useEffect(() => {
    let unsubs: any;

    async function setupBase() {
      try {
        await initSurreal();
        console.log('SurrealDB client connected');
        unsubs = await subscribeToUIState((screen) => {
          console.log(`Agent commanded screen change to: ${screen}`);
          if (screen === 'TransferScreen' && navigationRef.isReady()) {
            navigationRef.navigate('Transfer' as never);
          } else if (screen === 'DashboardScreen' && navigationRef.isReady()) {
            navigationRef.navigate('Dashboard' as never);
          }
        });
      } catch (err) {
        console.error("Failed to setup DB listener: ", err);
      }
    }
    setupBase();

    return () => {
      // clean up if needed
    }
  }, []);

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator initialRouteName="Dashboard">
        <Stack.Screen name="Dashboard" component={DashboardScreen} />
        <Stack.Screen name="Transfer" component={TransferScreen} />
      </Stack.Navigator>
      <AgentOrb state={agentState} />
    </NavigationContainer>
  );
}
