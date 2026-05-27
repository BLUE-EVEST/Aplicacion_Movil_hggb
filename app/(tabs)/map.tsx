/**
 * INDOOR MAP - SELECTOR AUTOMÁTICO DE PLATAFORMA
 * 
 * Este archivo actúa como mediador inteligente que selecciona automáticamente
 * la versión correcta del componente según la plataforma de ejecución.
 * 
 * ARQUITECTURA:
 * - map.native.tsx → Versión completa (Android/iOS)
 *   - Renderiza mapa vectorial SVG con:
 *   - Polígonos de salas
 *   - Rutas/pasillos con diferenciación de accesibilidad
 *   - Puntos de interés con códigos de color
 *   - Leyenda interactiva
 * 
 * - map.web.tsx → Fallback (web)
 *   - Mensaje informativo
 *   - Instrucción de usar versión móvil
 * 
 * CÓMO FUNCIONA LA SELECCIÓN:
 * React Native automáticamente reconoce los sufijos de archivo:
 * - Plataforma nativa (Android/iOS) → busca .native.tsx
 * - Plataforma web → busca .web.tsx
 * 
 * El framework carga el archivo apropiado sin necesidad de código condicional.
 * 
 * MÁS INFORMACIÓN:
 * https://react-native.dev/docs/platform-specific-code#native-specific-extensions
 */

// Re-exportar el componente de plataforma nativa (React Native selecciona automáticamente)
export { default } from './map.native';

