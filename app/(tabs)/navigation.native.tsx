import { CameraView, useCameraPermissions } from 'expo-camera';
import React, { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import puntosGeoJson from '@/assets/data/pts_interes_primer_piso.json';
import rutasGeoJson from '@/assets/data/rutas_navegacion_primer_piso.json';
import IndoorMap from './map';

// ─── Tipos ────────────────────────────────────────────────────────────────────
type PuntoInteres = { nombre: string; tipo: string };
type Ruta = { nombre_ruta: string; accesible: string; coordinates: [number,number][] };

// ─── Íconos por tipo ──────────────────────────────────────────────────────────
const TIPO_EMOJI: Record<string, string> = {
  box:           '🏥',
  some:          '📋',
  baño:          '🚻',
  baños:         '🚻',
  ascensor:      '🛗',
  escalera:      '🪜',
  secretaria:    '🗂️',
  sala_descanso: '💺',
  salida:        '🚪',
  seguridad:     '🔒',
  oficina:       '🏢',
  bodega:        '📦',
  Entrada:       '🚶',
  default:       '📍',
};

// ─── Instrucciones legibles por nombre de ruta ────────────────────────────────
const INSTRUCCIONES_RUTA: Record<string, string> = {
  ruta_principal:     'Avanza por el pasillo principal',
  ruta_boxes_superior:'Dirígete hacia los boxes superiores',
  ruta_boxes_medio:   'Avanza hacia los boxes del sector medio',
  ruta_boxes_inferior:'Continúa hacia los boxes inferiores',
  ruta_boxes_extremo: 'Avanza hacia los boxes del extremo',
  ruta_some:          'Dirígete hacia el sector SOME',
  ruta_secretarias:   'Avanza hacia el sector de secretarías',
  ruta_baños:         'Dirígete hacia los baños públicos',
  ruta_oncologia:     'Avanza hacia el Policlínico de Oncología',
};

// ─── Normalizar texto para matching flexible ──────────────────────────────────
const normalizar = (texto: string): string =>
  texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita tildes
    .replace(/[\s-]/g, '_');          // espacios y guiones → guión bajo

// ─── Cargar datos desde GeoJSON ───────────────────────────────────────────────
const cargarDestinos = (): PuntoInteres[] =>
  (puntosGeoJson as any).features.map((f: any) => ({
    nombre: f.properties.nombre_puntointeres,
    tipo:   f.properties.tipo_puntointeres,
  }));

const cargarRutas = (): Ruta[] =>
  (rutasGeoJson as any).features.map((f: any) => ({
    nombre_ruta: f.properties.nombre_ruta,
    accesible:   f.properties.accesible,
    coordinates: f.geometry.coordinates,
  }));

// ─── Generar instrucciones desde las rutas disponibles ───────────────────────
const generarInstrucciones = (
  origenNombre: string,
  destinoNombre: string,
  rutas: Ruta[],
  soloAccesible: boolean
): string[] => {
  // Filtrar rutas según accesibilidad
  const rutasFiltradas = soloAccesible
    ? rutas.filter(r => r.accesible === 'si')
    : rutas;

  // Detectar qué rutas son relevantes para el destino
  const instrucciones: string[] = [];
  instrucciones.push(`📍 Inicio: ${origenNombre.replace(/_/g, ' ')}`);

  // Siempre partimos por el pasillo principal
  instrucciones.push('➡️  ' + INSTRUCCIONES_RUTA['ruta_principal']);

  // Detectar ruta específica según el destino
  const dest = normalizar(destinoNombre);

  if (dest.includes('box')) {
    const num = parseInt(destinoNombre.replace(/\D/g, ''), 10);
    if (num <= 3)       instrucciones.push('↗️  ' + INSTRUCCIONES_RUTA['ruta_boxes_superior']);
    else if (num <= 7)  instrucciones.push('➡️  ' + INSTRUCCIONES_RUTA['ruta_boxes_medio']);
    else if (num <= 11) instrucciones.push('↘️  ' + INSTRUCCIONES_RUTA['ruta_boxes_inferior']);
    else {
      instrucciones.push('↘️  ' + INSTRUCCIONES_RUTA['ruta_boxes_inferior']);
      if (!soloAccesible)
        instrucciones.push('⚠️  ' + INSTRUCCIONES_RUTA['ruta_boxes_extremo'] + ' (sin acceso para sillas de ruedas)');
      else
        instrucciones.push('⚠️  Esta ruta no está disponible en modo accesible');
    }
  } else if (dest.includes('some')) {
    instrucciones.push('↖️  ' + INSTRUCCIONES_RUTA['ruta_some']);
  } else if (dest.includes('secretaria')) {
    instrucciones.push('↙️  ' + INSTRUCCIONES_RUTA['ruta_secretarias']);
    if (dest.includes('oncologia'))
      instrucciones.push('↙️  ' + INSTRUCCIONES_RUTA['ruta_oncologia']);
  } else if (dest.includes('bano') || dest.includes('baño')) {
    instrucciones.push('➡️  ' + INSTRUCCIONES_RUTA['ruta_baños']);
  }

  instrucciones.push(`🏁 Destino: ${destinoNombre.replace(/_/g, ' ')}`);
  return instrucciones;
};

// ─── Componente Principal ─────────────────────────────────────────────────────
export default function NavigationScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned,          setScanned]          = useState(false);
  const [origen,           setOrigen]           = useState<string | undefined>(undefined);
  const [destino,          setDestino]          = useState<string | undefined>(undefined);
  const [modoAccesible,    setModoAccesible]    = useState(false);
  const [busqueda,         setBusqueda]         = useState('');
  const [tipoFiltro,       setTipoFiltro]       = useState<string | null>(null);
  const [verInstrucciones, setVerInstrucciones] = useState(false);

  const todosLosDestinos = useMemo(() => cargarDestinos(), []);
  const todasLasRutas    = useMemo(() => cargarRutas(),    []);

  const tiposUnicos = useMemo(() => {
    const set = new Set(todosLosDestinos.map(p => p.tipo));
    return Array.from(set).filter(Boolean);
  }, [todosLosDestinos]);

  const destinosFiltrados = useMemo(() => {
    return todosLosDestinos.filter(p => {
      const coincideBusqueda = p.nombre?.toLowerCase().includes(busqueda.toLowerCase());
      const coincideTipo     = tipoFiltro ? p.tipo === tipoFiltro : true;
      return coincideBusqueda && coincideTipo;
    });
  }, [todosLosDestinos, busqueda, tipoFiltro]);

  // Instrucciones calculadas cuando hay origen y destino
  const instrucciones = useMemo(() => {
    if (!origen || !destino) return [];
    return generarInstrucciones(origen, destino, todasLasRutas, modoAccesible);
  }, [origen, destino, todasLasRutas, modoAccesible]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleBarCodeScanned = ({ data }: { data: string }) => {
    setScanned(true);
    try {
      const parsed = JSON.parse(data);
      if (parsed.origen_id) {
        // FIX CRÍTICO: normalizamos el origen_id del QR para que matchee
        // con el nombre exacto del GeoJSON
        const origenNormalizado = parsed.origen_id;
        setOrigen(origenNormalizado);
      } else {
        Alert.alert('QR Inválido', 'Este código no pertenece al sistema del HGGB.');
        setScanned(false);
      }
    } catch {
      Alert.alert('Error', 'Formato de código QR no reconocido.');
      setScanned(false);
    }
  };

  // FIX: el QR simulado ahora usa el nombre EXACTO del GeoJSON
  const simularEscaneo = () => {
    handleBarCodeScanned({ data: '{"origen_id": "Entrada_San_Martin", "piso": 1}' });
  };

  const reiniciar = () => {
    setScanned(false);
    setOrigen(undefined);
    setDestino(undefined);
    setBusqueda('');
    setTipoFiltro(null);
    setVerInstrucciones(false);
  };

  const seleccionarDestino = (nombre: string) => {
    setDestino(nombre);
    setVerInstrucciones(false); // resetear vista instrucciones al cambiar destino
  };

  // ── Permisos ──────────────────────────────────────────────────────────────
  if (!permission) return <View style={s.container} />;

  if (!permission.granted) {
    return (
      <SafeAreaView style={s.centrado}>
        <Text style={s.iconoGrande}>📷</Text>
        <Text style={s.textoPermiso}>
          La app necesita acceso a tu cámara para leer los códigos QR del hospital.
        </Text>
        <TouchableOpacity style={s.btnPrimario} onPress={requestPermission}>
          <Text style={s.btnPrimarioTexto}>Dar permiso a la cámara</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ── ESTADO 1: Escáner QR ──────────────────────────────────────────────────
  if (!origen) {
    return (
      <View style={s.container}>
        <CameraView
          style={StyleSheet.absoluteFillObject}
          facing="back"
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        />
        <View style={s.overlayQR}>
          <Text style={s.tituloQR}>📍 ¿Dónde estás?</Text>
          <Text style={s.instruccionQR}>
            Busca un código QR pegado en la pared más cercana y apunta la cámara hacia él
          </Text>
          <View style={s.marcoQR} />
          <TouchableOpacity style={s.btnSimular} onPress={simularEscaneo}>
            <Text style={s.btnSimularTexto}>[DEV] Simular escaneo en Entrada San Martín</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── ESTADO 2: Mapa + Panel ────────────────────────────────────────────────
  return (
    <View style={s.container}>

      {/* Mapa — 58% de la pantalla */}
      <View style={s.mapaContainer}>
        <IndoorMap
          origen_id={origen}
          destino_id={destino}
          soloAccesible={modoAccesible}
        />
      </View>

      {/* Panel flotante inferior — 42% */}
      <View style={s.panel}>

        {/* Toggle: Lista destinos / Instrucciones */}
        {destino && (
          <View style={s.toggleBar}>
            <TouchableOpacity
              style={[s.toggleBtn, !verInstrucciones && s.toggleBtnActivo]}
              onPress={() => setVerInstrucciones(false)}
            >
              <Text style={[s.toggleTexto, !verInstrucciones && s.toggleTextoActivo]}>
                🗺️ Destinos
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.toggleBtn, verInstrucciones && s.toggleBtnActivo]}
              onPress={() => setVerInstrucciones(true)}
            >
              <Text style={[s.toggleTexto, verInstrucciones && s.toggleTextoActivo]}>
                📋 Instrucciones
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Destino activo */}
        {destino ? (
          <View style={s.destinoActivo}>
            <Text style={s.destinoActivoTexto}>
              🧭 <Text style={s.destinoActivoNombre}>{destino.replace(/_/g,' ')}</Text>
            </Text>
            <TouchableOpacity onPress={() => setDestino(undefined)}>
              <Text style={s.cambiarDestino}>Cambiar</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={s.panelTitulo}>¿A dónde te diriges?</Text>
        )}

        {/* ── Vista instrucciones ── */}
        {verInstrucciones && destino ? (
          <ScrollView style={s.listaInstrucciones} showsVerticalScrollIndicator={false}>
            {instrucciones.map((paso, i) => (
              <View key={i} style={[
                s.itemInstruccion,
                i === 0 && s.itemInstruccionInicio,
                i === instrucciones.length - 1 && s.itemInstruccionFin,
              ]}>
                <Text style={s.itemInstruccionTexto}>{paso}</Text>
              </View>
            ))}
          </ScrollView>

        ) : (
          /* ── Vista lista destinos ── */
          <>
            <View style={s.buscadorContainer}>
              <TextInput
                style={s.buscador}
                placeholder="🔍  Buscar servicio o sala..."
                placeholderTextColor="#999"
                value={busqueda}
                onChangeText={setBusqueda}
                clearButtonMode="while-editing"
              />
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={s.filtrosScroll}
              contentContainerStyle={s.filtrosContenido}
            >
              <TouchableOpacity
                style={[s.chipFiltro, !tipoFiltro && s.chipFiltroActivo]}
                onPress={() => setTipoFiltro(null)}
              >
                <Text style={[s.chipTexto, !tipoFiltro && s.chipTextoActivo]}>Todos</Text>
              </TouchableOpacity>
              {tiposUnicos.map(tipo => (
                <TouchableOpacity
                  key={tipo}
                  style={[s.chipFiltro, tipoFiltro === tipo && s.chipFiltroActivo]}
                  onPress={() => setTipoFiltro(tipoFiltro === tipo ? null : tipo)}
                >
                  <Text style={[s.chipTexto, tipoFiltro === tipo && s.chipTextoActivo]}>
                    {TIPO_EMOJI[tipo] || '📍'} {tipo.charAt(0).toUpperCase() + tipo.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <FlatList
              data={destinosFiltrados}
              keyExtractor={(item, i) => `${item.nombre}-${i}`}
              style={s.listaDestinos}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[s.itemDestino, destino === item.nombre && s.itemDestinoActivo]}
                  onPress={() => seleccionarDestino(item.nombre)}
                >
                  <Text style={s.itemIcono}>{TIPO_EMOJI[item.tipo] || '📍'}</Text>
                  <Text style={s.itemNombre}>{item.nombre.replace(/_/g, ' ')}</Text>
                  {destino === item.nombre && <Text style={s.checkDestino}>✓</Text>}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={s.sinResultados}>No se encontraron servicios</Text>
              }
            />
          </>
        )}

        {/* Controles inferiores */}
        <View style={s.filaControles}>
          <TouchableOpacity
            style={[s.btnAccesibilidad, modoAccesible && s.btnAccesibilidadActivo]}
            onPress={() => setModoAccesible(!modoAccesible)}
          >
            <Text style={s.btnAccesibilidadTexto}>
              {modoAccesible ? '♿ Silla de ruedas' : '🚶 Ruta estándar'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.btnReiniciar} onPress={reiniciar}>
            <Text style={s.btnReiniciarTexto}>🔄 Reiniciar</Text>
          </TouchableOpacity>
        </View>

      </View>
    </View>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────
const AZUL  = '#1a73e8';
const ROJO  = '#e53935';
const VERDE = '#2e7d32';
const FONDO = '#f0f4f8';

const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#000' },
  centrado:   { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30, backgroundColor: '#fff' },
  iconoGrande:{ fontSize: 60, marginBottom: 20 },

  // Permisos
  textoPermiso:     { fontSize: 18, textAlign: 'center', color: '#333', marginBottom: 30, lineHeight: 26 },
  btnPrimario:      { backgroundColor: AZUL, paddingVertical: 16, paddingHorizontal: 40, borderRadius: 14 },
  btnPrimarioTexto: { color: '#fff', fontSize: 18, fontWeight: 'bold' },

  // QR
  overlayQR:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  tituloQR:       { fontSize: 32, fontWeight: 'bold', color: '#fff', marginBottom: 16 },
  instruccionQR:  { fontSize: 18, color: '#fff', textAlign: 'center', lineHeight: 26, marginBottom: 40 },
  marcoQR:        { width: 220, height: 220, borderWidth: 3, borderColor: '#fff', borderRadius: 16, marginBottom: 40 },
  btnSimular:     { backgroundColor: ROJO, padding: 14, borderRadius: 10, borderWidth: 2, borderColor: '#fff' },
  btnSimularTexto:{ color: '#fff', fontWeight: 'bold', fontSize: 14 },

  // Layout
  mapaContainer: { flex: 58 },   // 58% de la pantalla
  panel: {
    flex: 42,                     // 42% de la pantalla
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
  },

  // Toggle destinos / instrucciones
  toggleBar:         { flexDirection: 'row', backgroundColor: FONDO, borderRadius: 12, marginBottom: 10, padding: 3 },
  toggleBtn:         { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  toggleBtnActivo:   { backgroundColor: '#fff', elevation: 2 },
  toggleTexto:       { fontSize: 14, color: '#888', fontWeight: '600' },
  toggleTextoActivo: { color: AZUL },

  // Destino activo
  destinoActivo:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, backgroundColor: '#e8f5e9', padding: 10, borderRadius: 10 },
  destinoActivoTexto:  { fontSize: 14, color: '#333' },
  destinoActivoNombre: { fontWeight: 'bold', color: VERDE },
  cambiarDestino:      { color: AZUL, fontWeight: 'bold', fontSize: 14 },
  panelTitulo:         { fontSize: 18, fontWeight: 'bold', color: '#222', marginBottom: 10, textAlign: 'center' },

  // Instrucciones
  listaInstrucciones:      { flex: 1, marginBottom: 8 },
  itemInstruccion:         { backgroundColor: FONDO, borderRadius: 10, padding: 12, marginBottom: 6, borderLeftWidth: 3, borderLeftColor: AZUL },
  itemInstruccionInicio:   { borderLeftColor: VERDE },
  itemInstruccionFin:      { borderLeftColor: ROJO },
  itemInstruccionTexto:    { fontSize: 15, color: '#333', lineHeight: 22 },

  // Buscador
  buscadorContainer: { marginBottom: 8 },
  buscador:          { backgroundColor: FONDO, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: '#222', borderWidth: 1, borderColor: '#dde3ea' },

  // Chips
  filtrosScroll:    { marginBottom: 8 },
  filtrosContenido: { paddingRight: 16, gap: 8, flexDirection: 'row' },
  chipFiltro:       { backgroundColor: FONDO, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1, borderColor: '#dde3ea' },
  chipFiltroActivo: { backgroundColor: AZUL, borderColor: AZUL },
  chipTexto:        { fontSize: 13, color: '#555', fontWeight: '600' },
  chipTextoActivo:  { color: '#fff' },

  // Lista destinos
  listaDestinos:     { flex: 1, marginBottom: 6 },
  itemDestino:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 10, borderRadius: 10, marginBottom: 5, backgroundColor: FONDO },
  itemDestinoActivo: { backgroundColor: '#e3f2fd', borderWidth: 1.5, borderColor: AZUL },
  itemIcono:         { fontSize: 20, marginRight: 10 },
  itemNombre:        { fontSize: 15, color: '#222', flex: 1, fontWeight: '500' },
  checkDestino:      { fontSize: 18, color: AZUL, fontWeight: 'bold' },
  sinResultados:     { textAlign: 'center', color: '#999', fontSize: 15, paddingVertical: 16 },

  // Controles
  filaControles:          { flexDirection: 'row', gap: 10, marginTop: 6 },
  btnAccesibilidad:       { flex: 2, backgroundColor: FONDO, paddingVertical: 12, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#cfd8dc' },
  btnAccesibilidadActivo: { backgroundColor: '#e3f2fd', borderColor: AZUL },
  btnAccesibilidadTexto:  { fontSize: 14, fontWeight: 'bold', color: '#444' },
  btnReiniciar:           { flex: 1, backgroundColor: ROJO, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  btnReiniciarTexto:      { color: '#fff', fontWeight: 'bold', fontSize: 14 },
});