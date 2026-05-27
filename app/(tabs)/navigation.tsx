/**
 * NAVIGATION SCREEN - SELECTOR AUTOMÁTICO DE PLATAFORMA
 * 
 * Este archivo actúa como mediador inteligente que selecciona automáticamente
 * la versión correcta del componente según la plataforma de ejecución.
 * 
 * ARQUITECTURA:
 * - navigation.native.tsx → Versión completa con cámara QR (Android/iOS)
 *   - Captura códigos QR con expo-camera
 *   - Parsea contenido JSON del QR
 *   - Renderiza mapa IndoorMap
 *   - Panel flotante de destinos
 *   - Botón para volver a escanear
 * 
 * - navigation.web.tsx → Fallback informativo (web)
 *   - Mensaje explicativo
 *   - Instrucción de usar versión móvil
 * 
 * CÓMO FUNCIONA:
 * React Native automáticamente reconoce los sufijos de archivo:
 * - Plataforma nativa (Android/iOS) → busca .native.tsx
 * - Plataforma web → busca .web.tsx
 * 
 * El framework carga el archivo apropiado sin código condicional.
 * 
 * MÁS INFORMACIÓN:
 * https://react-native.dev/docs/platform-specific-code#native-specific-extensions
 */

// Re-exportar el componente de plataforma nativa (React Native selecciona automáticamente)
export { default } from './navigation.native';

