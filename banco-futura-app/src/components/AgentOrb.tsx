import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function AgentOrb({ state }: { state: 'idle' | 'listening' | 'thinking' | 'speaking' }) {
  // Determinamos el color en base al estado simulando la animación global
  const getColor = () => {
    switch (state) {
      case 'listening': return '#2196F3'; // Azul
      case 'thinking': return '#FFC107'; // Amarillo
      case 'speaking': return '#4CAF50'; // Verde
      default: return '#9E9E9E'; // Gris (idle)
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: getColor() }]}>
      <Text style={styles.text}>{state.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 15,
    borderRadius: 50,
    position: 'absolute',
    bottom: 30,
    right: 30,
    elevation: 5,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 100,
  },
  text: {
    color: '#fff',
    fontWeight: 'bold',
  }
});