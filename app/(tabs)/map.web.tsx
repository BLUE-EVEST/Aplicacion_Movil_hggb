/**
 * INDOOR MAP - VERSIÓN WEB
 * 
 * Este es un fallback para la plataforma web.
 * Nota: React Native SVG tiene soporte limitado en web en comparación con Android/iOS,
 * así que se muestra un mensaje informativo en su lugar.
 * 
 * En dispositivos móviles (Android/iOS) se utiliza map.native.tsx con funcionalidad completa.
 */

import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

/**
 * COMPONENTE: IndoorMap (versión web)
 * 
 * Renderiza un mensaje explicativo para usuarios de web.
 * La funcionalidad completa del mapa vectorial SVG está disponible en móvil.
 */
export default function IndoorMap() {
  return (
    <ThemedView style={styles.webFallback}>
      {/* Título principal */}
      <ThemedText type="title">Mapa Interactivo</ThemedText>
      
      {/* Mensaje explicativo */}
      <ThemedText>
        La versión web del mapa tiene soporte limitado en React Native SVG.
      </ThemedText>

      {/* Instrucción al usuario */}
      <ThemedText style={styles.info}>
        Abre esta pantalla en un dispositivo Android o iOS para acceder
        al mapa completo con polígonos interactivos, rutas y puntos de interés.
      </ThemedText>
    </ThemedView>
  );
}

/**
 * ESTILOS
 * Centra el contenido y proporciona espaciado visual
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
});
