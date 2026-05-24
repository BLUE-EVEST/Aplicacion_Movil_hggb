/**
 * NAVIGATION SCREEN - VERSIÓN WEB
 * 
 * Fallback para plataforma web.
 * La funcionalidad completa de escaneo QR y navegación está disponible en Android/iOS.
 */

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { StyleSheet } from 'react-native';

/**
 * COMPONENTE: NavigationScreen (versión web)
 * 
 * Muestra un mensaje informativo explicando que esta funcionalidad
 * solo está disponible en dispositivos móviles.
 */
export default function NavigationScreen() {
  return (
    <ThemedView style={styles.webFallback}>
      {/* Título principal */}
      <ThemedText type="title">Navegación por QR</ThemedText>

      {/* Mensaje explicativo */}
      <ThemedText>
        La función de escaneo de códigos QR requiere una cámara de dispositivo móvil.
      </ThemedText>

      {/* Instrucción al usuario */}
      <ThemedText style={styles.info}>
        Abre esta pantalla en un dispositivo Android o iOS para acceder
        al sistema de navegación basado en códigos QR.
      </ThemedText>

      {/* Características disponibles */}
      <ThemedText style={styles.features}>
        Funcionalidades en móvil:
        {'\n'}• Escaneo de QR
        {'\n'}• Mapa interactivo del hospital
        {'\n'}• Selección de destino
        {'\n'}• Futuro algoritmo de ruta óptima
      </ThemedText>
    </ThemedView>
  );
}

/**
 * ESTILOS
 * Centrado y con espaciado visual
 */
const styles = StyleSheet.create({
  webFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 12,
  },
  info: {
    marginTop: 12,
    textAlign: 'center',
    fontSize: 14,
  },
  features: {
    marginTop: 20,
    textAlign: 'left',
    fontSize: 12,
    lineHeight: 20,
  },
});
