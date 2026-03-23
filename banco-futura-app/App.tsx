import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import DashboardScreen from './src/screens/DashboardScreen';
import TransferScreen from './src/screens/TransferScreen';
import AgentOrb from './src/components/AgentOrb';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Dashboard">
        <Stack.Screen name="Dashboard" component={DashboardScreen} />
        <Stack.Screen name="Transfer" component={TransferScreen} />
      </Stack.Navigator>
      <AgentOrb state="idle" />
    </NavigationContainer>
  );
}
