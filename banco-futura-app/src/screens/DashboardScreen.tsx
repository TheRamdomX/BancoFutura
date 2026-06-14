import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { initSurreal, subscribeToBalance } from '../services/surrealLive';

export default function DashboardScreen() {
  const [balance, setBalance] = useState<number>(0);

  useEffect(() => {
    // Ensuring it waits until the db is initialized (simplification for safety)
    setTimeout(() => {
      subscribeToBalance('user_1', (newBalance) => setBalance(newBalance));
    }, 1000);
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Dashboard Banco Futura</Text>
      <Text style={styles.balance}>Saldo: ${balance}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: 'bold' },
  balance: { fontSize: 32, marginTop: 20, color: 'green' }
});
