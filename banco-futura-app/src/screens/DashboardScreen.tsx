import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { subscribeToBalance } from '../services/surrealLive';

export default function DashboardScreen() {
  const [balance, setBalance] = useState<number>(0);

  useEffect(() => {
    subscribeToBalance('user_1', (newBalance) => setBalance(newBalance));
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
