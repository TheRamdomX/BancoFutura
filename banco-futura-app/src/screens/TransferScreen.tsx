import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function TransferScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Realizar Transferencia</Text>
      <Text>La interfaz interactúa con la IA para gestionar el destinatario y monto.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: 'bold' },
});
