import { CameraView, useCameraPermissions } from 'expo-camera';
import React, { useState } from 'react';
import { Alert, Button, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// Importamos el mapa inteligente que acabas de configurar
import IndoorMap from './map';

export default function NavigationScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [origen, setOrigen] = useState<string | undefined>(undefined);
  const [destino, setDestino] = useState<string | undefined>(undefined);
  const [modoAccesible, setModoAccesible] = useState(false);

  // Pantalla de carga de permisos
  if (!permission) {
    return <View style={styles.container} />;
  }

  // Pantalla si el usuario denegó la cámara
  if (!permission.granted) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.textoPermiso}>
          Mallapp necesita acceso a tu cámara para leer los códigos QR del hospital.
        </Text>
        <Button onPress={requestPermission} title="Otorgar permiso" color="#1a73e8" />
      </View>
    );
  }

  // Lógica cuando la cámara detecta un QR
  const handleBarCodeScanned = ({ data }: { data: string }) => {
    setScanned(true);
    try {
      const parsedData = JSON.parse(data);
      if (parsedData.origen_id) {
        setOrigen(parsedData.origen_id);
      } else {
        Alert.alert('QR Inválido', 'Este código no pertenece al sistema del HGGB.');
        setScanned(false);
      }
    } catch (error) {
      Alert.alert('Error', 'Formato de código QR no reconocido.');
      setScanned(false);
    }
  };

  // Botón para desarrolladores: Simula escanear un QR en el emulador
  const simularEscaneoEmulador = () => {
    handleBarCodeScanned({ 
      data: '{"origen_id": "Entrada_San_Martin", "piso": 1}' 
    });
  };

  const reiniciarEscaneo = () => {
    setScanned(false);
    setOrigen(undefined);
    setDestino(undefined);
  };

  return (
    <View style={styles.container}>
      
      {/* ESTADO 1: ESCANER QR ACTIVO */}
      {!origen ? (
        <View style={styles.container}>
          <CameraView
            style={StyleSheet.absoluteFillObject}
            facing="back"
            onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
          />
          <View style={styles.overlayCamara}>
            <Text style={styles.instruccionCamara}>Escanea el código QR de la pared para ubicarte</Text>
            
            {/* Truco para probar en el PC sin cámara física */}
            <TouchableOpacity style={styles.btnSimular} onPress={simularEscaneoEmulador}>
              <Text style={styles.btnSimularText}>[DEV] Simular Escaneo en Entrada San Martín</Text>
            </TouchableOpacity>
          </View>
        </View>

      ) : (

        /* ESTADO 2: MAPA Y PANEL DE NAVEGACIÓN */
        <View style={styles.container}>
          
          {/* Aquí inyectamos el mapa vectorial que armaste y le pasamos los datos */}
          <View style={styles.mapContainer}>
            <IndoorMap 
              origen_id={origen} 
              destino_id={destino} 
              soloAccesible={modoAccesible} 
            />
          </View>

          {/* Panel Flotante Inferior */}
          <View style={styles.panelFlotante}>
            <Text style={styles.textoDestinoTitulo}>¿A dónde te diriges?</Text>
            
            <View style={styles.filaBotones}>
              <TouchableOpacity style={styles.btnDestino} onPress={() => setDestino('box_14')}>
                <Text style={styles.textoBtnDestino}>Box 14</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnDestino} onPress={() => setDestino('some_01')}>
                <Text style={styles.textoBtnDestino}>SOME 1</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnDestino} onPress={() => setDestino('baños_publicos')}>
                <Text style={styles.textoBtnDestino}>Baños</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.filaControles}>
              <TouchableOpacity 
                style={[styles.btnAccesibilidad, modoAccesible && styles.btnAccesibilidadActivo]} 
                onPress={() => setModoAccesible(!modoAccesible)}
              >
                <Text style={styles.textoAccesibilidad}>
                  {modoAccesible ? '♿ Ruta Silla de Ruedas' : '🚶 Ruta Estándar'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.btnReiniciar} onPress={reiniciarEscaneo}>
                <Text style={styles.textoReiniciar}>Reiniciar</Text>
              </TouchableOpacity>
            </View>
          </View>

        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: '#fff' },
  textoPermiso: { textAlign: 'center', fontSize: 16, marginBottom: 20, color: '#333' },
  
  // Estilos de Cámara
  overlayCamara: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  instruccionCamara: { color: '#fff', fontSize: 24, textAlign: 'center', fontWeight: 'bold', marginBottom: 40, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: {width: 1, height: 1}, textShadowRadius: 3 },
  btnSimular: { backgroundColor: '#e53935', padding: 15, borderRadius: 10, marginTop: 50, borderWidth: 2, borderColor: '#fff' },
  btnSimularText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },

  // Estilos del Panel y Mapa
  mapContainer: { flex: 1 },
  panelFlotante: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 30,
    elevation: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  textoDestinoTitulo: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 15, textAlign: 'center' },
  filaBotones: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  btnDestino: { flex: 1, backgroundColor: '#f0f2f5', padding: 12, borderRadius: 10, marginHorizontal: 5, alignItems: 'center', borderWidth: 1, borderColor: '#e0e0e0' },
  textoBtnDestino: { color: '#1a73e8', fontWeight: '600' },
  filaControles: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  btnAccesibilidad: { flex: 2, backgroundColor: '#fff', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#cfd8dc', marginRight: 10, alignItems: 'center' },
  btnAccesibilidadActivo: { backgroundColor: '#e3f2fd', borderColor: '#1a73e8' },
  textoAccesibilidad: { color: '#555', fontWeight: 'bold' },
  btnReiniciar: { flex: 1, backgroundColor: '#e53935', padding: 12, borderRadius: 10, alignItems: 'center' },
  textoReiniciar: { color: '#fff', fontWeight: 'bold' },
});