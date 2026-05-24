/**
 * COMPONENTE INDOOR MAP - MAPA VECTORIAL SVG CON DIJKSTRA EXPERIMENTAL
 * * Este componente renderiza un mapa interactivo del primer piso del hospital
 * utilizando EXCLUSIVAMENTE react-native-svg, calculando rutas óptimas en tiempo real.
 */

import React, { useMemo } from 'react';
import { Dimensions, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Polyline, Rect, Polygon as SvgPolygon } from 'react-native-svg';

// Importar datos GeoJSON del hospital
import edificioGeoJson from '@/assets/data/edificio_ambulatorio_primer_piso.json';
import puntosGeoJson from '@/assets/data/pts_interes_primer_piso.json';
import rutasGeoJson from '@/assets/data/rutas_navegacion_primer_piso.json';

/**
 * TIPOS DE DATOS
 */
type GeoCoordinate = [number, number];
type PixelCoordinate = [number, number];

type PointOfInterest = {
  id: number;
  nombre: string;
  tipo: string;
  longitude: number;
  latitude: number;
  piso?: number;
};

type Route = {
  id: number;
  coordinates: GeoCoordinate[];
  accesible: string; // "si" o "no"
};

type Building = {
  id: number;
  nombre: string;
  tipo: string;
  coordinates: GeoCoordinate[];
  piso: number;
};

// Estructura para el Grafo de Dijkstra
type GraphEdge = {
  to: string;
  weight: number;
  accesible: boolean;
};

type GraphNode = {
  id: string;
  lon: number;
  lat: number;
  edges: GraphEdge[];
};

type Graph = Map<string, GraphNode>;

const POINT_COLORS: Record<string, string> = {
  box: '#0057d9',
  secretaria: '#d93025',
  baño: '#0f9d58',
  baños: '#0f9d58',
  ascensor: '#fbbc04',
  escalera: '#f37d02',
  bodega: '#8e44ad',
  seguridad: '#212121',
  oficina: '#1a73e8',
  some: '#00838f',
  salida: '#d32f2f',
  Entrada: '#1a73e8',
  sala_descanso: '#e8a825',
  default: '#3f51b5',
};

/**
 * LÓGICA MATEMÁTICA Y ALGORITMOS (100% OFFLINE)
 */

const calculateBounds = (coordinates: GeoCoordinate[]) => {
  let minLon = coordinates[0][0];
  let maxLon = coordinates[0][0];
  let minLat = coordinates[0][1];
  let maxLat = coordinates[0][1];

  coordinates.forEach(([lon, lat]) => {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  });

  return { minLon, maxLon, minLat, maxLat };
};

const geoToPixel = (
  lon: number,
  lat: number,
  bounds: ReturnType<typeof calculateBounds>,
  width: number,
  height: number
): PixelCoordinate => {
  const padding = 0.05; // Ajustado para maximizar el área visible
  const lonRange = bounds.maxLon - bounds.minLon;
  const latRange = bounds.maxLat - bounds.minLat;

  const availableWidth = width * (1 - padding * 2);
  const availableHeight = height * (1 - padding * 2);

  const pixelX = ((lon - bounds.minLon) / lonRange) * availableWidth + width * padding;
  const pixelY = ((bounds.maxLat - lat) / latRange) * availableHeight + height * padding;

  return [pixelX, pixelY];
};

/**
 * CONSTRUCTOR DEL GRAFO: Convierte segmentos de línea en una red interconectada
 */
const buildGraphFromRoutes = (routes: Route[]): Graph => {
  const graph: Graph = new Map();

  routes.forEach(route => {
    const coords = route.coordinates;
    const isAccesible = route.accesible === 'si';

    for (let i = 0; i < coords.length - 1; i++) {
      const [lon1, lat1] = coords[i];
      const [lon2, lat2] = coords[i + 1];
      
      const id1 = `${lon1},${lat1}`;
      const id2 = `${lon2},${lat2}`;

      // Distancia Euclidiana básica como peso del arco
      const weight = Math.sqrt(Math.pow(lon2 - lon1, 2) + Math.pow(lat2 - lat1, 2));

      if (!graph.has(id1)) graph.set(id1, { id: id1, lon: lon1, lat: lat1, edges: [] });
      if (!graph.has(id2)) graph.set(id2, { id: id2, lon: lon2, lat: lat2, edges: [] });

      // Conexión bidireccional (los pasillos se caminan en ambos sentidos)
      graph.get(id1)!.edges.push({ to: id2, weight, accesible: isAccesible });
      graph.get(id2)!.edges.push({ to: id1, weight, accesible: isAccesible });
    }
  });

  return graph;
};

/**
 * ENCONTRAR NODO MÁS CERCANO: Vincula un punto de interés al pasillo más próximo
 */
const findClosestGraphNode = (graph: Graph, lon: number, lat: number): string => {
  let closestId = '';
  let minDist = Infinity;

  graph.forEach((node) => {
    const dist = Math.sqrt(Math.pow(node.lon - lon, 2) + Math.pow(node.lat - lat, 2));
    if (dist < minDist) {
      minDist = dist;
      closestId = node.id;
    }
  });

  return closestId;
};

/**
 * ALGORITMO DE DIJKSTRA: Calcula el camino mínimo respetando la accesibilidad
 */
const executeDijkstra = (graph: Graph, startId: string, endId: string, soloAccesible: boolean): string[] => {
  const distances: Record<string, number> = {};
  const previous: Record<string, string | null> = {};
  const queue = new Set<string>();

  graph.forEach((_, id) => {
    distances[id] = Infinity;
    previous[id] = null;
    queue.add(id);
  });

  distances[startId] = 0;

  while (queue.size > 0) {
    let minNodeId: string | null = null;
    let minDist = Infinity;

    queue.forEach(id => {
      if (distances[id] < minDist) {
        minDist = distances[id];
        minNodeId = id;
      }
    });

    if (!minNodeId || distances[minNodeId] === Infinity) break;
    if (minNodeId === endId) break;

    queue.delete(minNodeId);

    const currNode = graph.get(minNodeId)!;
    currNode.edges.forEach(edge => {
      if (soloAccesible && !edge.accesible) return; // Filtro dinámico de camillas/sillas de ruedas
      if (!queue.has(edge.to)) return;

      const alt = distances[minNodeId!] + edge.weight;
      if (alt < distances[edge.to]) {
        distances[edge.to] = alt;
        previous[edge.to] = minNodeId;
      }
    });
  }

  const path: string[] = [];
  let u: string | null = endId;
  if (previous[u] || u === startId) {
    while (u) {
      path.unshift(u);
      u = previous[u];
    }
  }
  return path;
};

// Procesadores GeoJSON nativos
const processPoints = (): PointOfInterest[] => {
  return (puntosGeoJson as any).features.map((feature: any) => ({
    id: feature.properties.fid,
    nombre: feature.properties.nombre_puntointeres,
    tipo: feature.properties.tipo_puntointeres,
    longitude: feature.geometry.coordinates[0],
    latitude: feature.geometry.coordinates[1],
    piso: feature.properties.piso,
  }));
};

const processRoutes = (): Route[] => {
  return (rutasGeoJson as any).features.map((feature: any) => ({
    id: feature.properties.fid,
    coordinates: feature.geometry.coordinates,
    accesible: feature.properties.accesible,
  }));
};

const processBuildings = (): Building[] => {
  return (edificioGeoJson as any).features.map((feature: any) => ({
    id: feature.properties.fid,
    nombre: feature.properties.nombre,
    tipo: feature.properties.tipo,
    coordinates: feature.geometry.coordinates[0],
    piso: feature.properties.piso,
  }));
};

/**
 * COMPONENTE PRINCIPAL
 */
type IndoorMapProps = {
  origen_id?: string;      // Viene del QR escaneado (ej: "Entrada San Martín")
  destino_id?: string;     // Seleccionado en la UI (ej: "box_14")
  soloAccesible?: boolean; // Alternador para rutas de movilidad reducida
};

export default function IndoorMap({ origen_id, destino_id, soloAccesible = false }: IndoorMapProps) {
  const points = useMemo(() => processPoints(), []);
  const routes = useMemo(() => processRoutes(), []);
  const buildings = useMemo(() => processBuildings(), []);

  // Unificar coordenadas para encuadre global
  const allCoordinates = useMemo(() => {
    const coords: GeoCoordinate[] = [];
    buildings.forEach(b => coords.push(...b.coordinates));
    routes.forEach(r => coords.push(...r.coordinates));
    points.forEach(p => coords.push([p.longitude, p.latitude]));
    return coords;
  }, [buildings, routes, points]);

  const bounds = useMemo(() => calculateBounds(allCoordinates), [allCoordinates]);
  const graph = useMemo(() => buildGraphFromRoutes(routes), [routes]);

  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
  const svgWidth = screenWidth;
  const svgHeight = screenHeight * 0.65; // Ajustado para dar más espacio a la interfaz inferior

  // CÁLCULO DE LA RUTA EN TIEMPO REAL
  const activeRoutePixels = useMemo(() => {
    if (!origen_id || !destino_id) return null;

    // Encontrar las coordenadas geográficas de los nombres solicitados
    const startPoi = points.find(p => p.nombre?.toLowerCase() === origen_id.toLowerCase());
    const endPoi = points.find(p => p.nombre?.toLowerCase() === destino_id.toLowerCase());

    if (!startPoi || !endPoi) return null;

    // Conectarlos a la red de pasillos
    const startNodeId = findClosestGraphNode(graph, startPoi.longitude, startPoi.latitude);
    const endNodeId = findClosestGraphNode(graph, endPoi.longitude, endPoi.latitude);

    // Resolver camino óptimo
    const nodePath = executeDijkstra(graph, startNodeId, endNodeId, soloAccesible);

    // Mapear los nodos resueltos a píxeles de pantalla
    return nodePath.map(nodeId => {
      const [lon, lat] = nodeId.split(',').map(Number);
      return geoToPixel(lon, lat, bounds, svgWidth, svgHeight);
    });
  }, [origen_id, destino_id, graph, points, bounds, svgWidth, svgHeight, soloAccesible]);

  // Convertir matriz de píxeles a string compatible con SVG Polyline
  const activeRouteString = useMemo(() => {
    if (!activeRoutePixels) return '';
    return activeRoutePixels.map(([x, y]) => `${x},${y}`).join(' ');
  }, [activeRoutePixels]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Mallapp - Navegación Interna</Text>
        {origen_id ? (
          <Text style={styles.subtitle}>Ubicación establecida por código QR</Text>
        ) : (
          <Text style={styles.subtitle}>Escanee un código QR para iniciar el guiado</Text>
        )}
      </View>

      <ScrollView
        style={styles.scrollView}
        scrollEnabled={false}
        contentContainerStyle={{ width: svgWidth, height: svgHeight }}
      >
        <Svg width={svgWidth} height={svgHeight}>
          <Rect width={svgWidth} height={svgHeight} fill="#fafafa" />

          {/* 1. Capa Base: Polígonos estructurales de las salas */}
          <G>
            {buildings.map(building => {
              const pixelPoints = building.coordinates
                .map(([lon, lat]) => geoToPixel(lon, lat, bounds, svgWidth, svgHeight))
                .map(([x, y]) => `${x},${y}`)
                .join(' ');

              return (
                <SvgPolygon
                  key={`building-${building.id}`}
                  points={pixelPoints}
                  fill="#ffffff"
                  stroke="#cfd8dc"
                  strokeWidth={1}
                />
              );
            })}
          </G>

          {/* 2. Capa Secundaria: Red de pasillos completa (Atenuada de fondo) */}
          <G opacity={0.25}>
            {routes.map(route => {
              const pixelPoints = route.coordinates
                .map(([lon, lat]) => geoToPixel(lon, lat, bounds, svgWidth, svgHeight))
                .map(([x, y]) => `${x},${y}`)
                .join(' ');

              return (
                <Polyline
                  key={`route-${route.id}`}
                  points={pixelPoints}
                  stroke={route.accesible === 'si' ? '#b0bec5' : '#ffab91'}
                  strokeWidth={2}
                  strokeDasharray={route.accesible === 'si' ? undefined : '4,4'}
                  fill="none"
                />
              );
            })}
          </G>

          {/* 3. CAPA MAESTRA: Resaltado de la ruta activa calculada por Dijkstra */}
          {activeRouteString ? (
            <G>
              <Polyline
                points={activeRouteString}
                stroke="#00e5ff" // Color cian neón de alta visibilidad
                strokeWidth={5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Círculo parpadeante en el destino final */}
              {activeRoutePixels && activeRoutePixels.length > 0 && (
                <Circle
                  cx={activeRoutePixels[activeRoutePixels.length - 1][0]}
                  cy={activeRoutePixels[activeRoutePixels.length - 1][1]}
                  r={8}
                  fill="#00e5ff"
                  opacity={0.7}
                />
              )}
            </G>
          ) : null}

          {/* 4. Capa Superior: Puntos de Interés (Nodos destino) */}
          <G>
            {points.map(point => {
              const [pixelX, pixelY] = geoToPixel(point.longitude, point.latitude, bounds, svgWidth, svgHeight);
              const color = POINT_COLORS[point.tipo] || POINT_COLORS.default;

              // Si es el origen actual, lo dibujamos más grande como un pin dinámico
              const esOrigen = origen_id && point.nombre?.toLowerCase() === origen_id.toLowerCase();

              return (
                <Circle
                  key={`point-${point.id}`}
                  cx={pixelX}
                  cy={pixelY}
                  r={esOrigen ? "9" : "5"}
                  fill={esOrigen ? "#e53935" : color}
                  stroke="white"
                  strokeWidth={1.5}
                  opacity={esOrigen ? "1" : "0.8"}
                />
              );
            })}
          </G>
        </Svg>
      </ScrollView>

      {/* LEYENDA INTEGRADA */}
      <View style={styles.legend}>
        <View style={styles.legendRow}>
          <View style={[styles.legendColor, { backgroundColor: '#00e5ff' }]} />
          <Text style={styles.legendText}>Tu Camino</Text>
          <View style={[styles.legendColor, { backgroundColor: '#0057d9' }]} />
          <Text style={styles.legendText}>Boxes</Text>
          <View style={[styles.legendColor, { backgroundColor: '#0f9d58' }]} />
          <Text style={styles.legendText}>Baños</Text>
          <View style={[styles.legendColor, { backgroundColor: '#e53935' }]} />
          <Text style={styles.legendText}>Tu Ubicación (QR)</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { paddingTop: 20, paddingBottom: 12, paddingHorizontal: 16, backgroundColor: '#1a73e8' },
  title: { fontSize: 20, fontWeight: 'bold', color: 'white', marginBottom: 4 },
  subtitle: { fontSize: 13, color: '#e3f2fd' },
  scrollView: { flex: 1, backgroundColor: '#fafafa' },
  legend: { padding: 12, borderTopWidth: 1, borderTopColor: '#e0e0e0', backgroundColor: '#ffffff' },
  legendRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  legendColor: { width: 12, height: 12, borderRadius: 6, marginRight: 4 },
  legendText: { fontSize: 11, color: '#555', fontWeight: '500' },
});