import { StyleSheet, Text, View } from 'react-native';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>MAPA PARA DEJAR BANDEJAS</Text>
      <Text style={styles.title}>BANDEJAMAPS</Text>
      <Text style={styles.title}>Jiji</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff', // Fondo limpio
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
});