/**
 * COMPONENTE: IndoorMap (Versión Nativa para Android/iOS)
 * PROPÓSITO: Renderiza el mapa vectorial de interiores del Hospital (HGGB) utilizando GeoJSONs de
 * estructura de edificio, pasillos (rutas) y puntos de interés (POIs). Calcula dinámicamente
 * rutas de navegación en base a Dijkstra y renderiza el resultado con polígonos y líneas SVG.
 * 
 * JUSTIFICACIÓN ARQUITECTÓNICA:
 * - Offline-first: Al cargar archivos GeoJSON estáticos empaquetados localmente, la aplicación no
 *   depende de una conexión a internet ni de servicios de mapas pagados (Google Maps API, Mapbox)
 *   que a menudo carecen de soporte nativo o detallado para interiores de edificios.
 * - Rendimiento: El uso de React Native SVG permite dibujar gráficos vectoriales acelerados por hardware.
 * - Desacoplamiento: Los cálculos matemáticos de proyección geográfica y búsqueda de caminos se realizan
 *   directamente en JS a través de funciones puras, lo que facilita su testeo y mantenimiento.
 */

import React, { useMemo } from 'react';
import { Dimensions, ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Polyline, Rect, Text as SvgText, Polygon as SvgPolygon } from 'react-native-svg';

// Importación de datos geográficos vectoriales (Capas SIG exportadas del hospital)
import edificioGeoJson from '@/assets/data/edificio_ambulatorio_primer_piso.json'; // Polígonos de paredes/estructuras
import puntosGeoJson from '@/assets/data/pts_interes_primer_piso.json'; // Ubicación de boxes, baños, accesos
import rutasGeoJson from '@/assets/data/rutas_navegacion_primer_piso.json'; // Líneas que representan pasillos transitables

// ─── Tipos ────────────────────────────────────────────────────────────────────
type GeoCoordinate   = [number, number]; // [Longitud, Latitud]
type PixelCoordinate = [number, number]; // [X en pixeles, Y en pixeles]

type PointOfInterest = {
  id: number;
  nombre: string;
  tipo: string; // Determina el color del ícono en el mapa (ej: box, baño)
  longitude: number;
  latitude: number;
  piso?: number;
};

type Route = {
  id: number;
  coordinates: GeoCoordinate[];
  accesible: string; // 'si' o 'no', define si es apto para personas con movilidad reducida
};

type Building = {
  id: number;
  nombre: string;
  tipo: string;
  coordinates: GeoCoordinate[];
  piso: number;
};

// Estructuras de datos optimizadas para el motor Dijkstra
type GraphEdge = { to: string; weight: number; accesible: boolean };
type GraphNode = { id: string; lon: number; lat: number; edges: GraphEdge[] };
type Graph     = Map<string, GraphNode>;

// ─── Colores por tipo ─────────────────────────────────────────────────────────
// Patrón de diseño: Mapeo estático de tipos de POI a colores institucionales / normativos.
// Por ejemplo, verde para baños (estándar higiénico), rojo para secretarías y salidas (alerta/atención).
const POINT_COLORS: Record<string, string> = {
  box:           '#0057d9',
  secretaria:    '#d93025',
  baño:          '#0f9d58',
  baños:         '#0f9d58',
  ascensor:      '#fbbc04',
  escalera:      '#f37d02',
  bodega:        '#8e44ad',
  seguridad:     '#212121',
  oficina:       '#1a73e8',
  some:          '#00838f',
  salida:        '#d32f2f',
  Entrada:       '#1a73e8',
  sala_descanso: '#e8a825',
  default:       '#3f51b5',
};

// ─── Matemáticas y Proyecciones ──────────────────────────────────────────────

/**
 * calculateBounds:
 * Encuentra los límites geográficos (Bounding Box) de todas las coordenadas provistas.
 * JUSTIFICACIÓN: Permite normalizar y escalar las coordenadas GPS relativas del GeoJSON al tamaño de la pantalla
 * del dispositivo móvil del usuario sin deformar el mapa y ajustando el zoom dinámicamente.
 */
const calculateBounds = (coordinates: GeoCoordinate[]) => {
  let minLon = coordinates[0][0], maxLon = coordinates[0][0];
  let minLat = coordinates[0][1], maxLat = coordinates[0][1];
  coordinates.forEach(([lon, lat]) => {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  });
  return { minLon, maxLon, minLat, maxLat };
};

/**
 * geoToPixel:
 * Transforma una coordenada esférica geográfica [Longitud, Latitud] en una posición cartesiana [X, Y]
 * en píxeles para renderizar dentro del lienzo SVG.
 * JUSTIFICACIÓN:
 * - Dado que los mapas de interiores cubren áreas muy pequeñas (metros), se puede omitir la proyección de Mercator
 *   compleja y usar una proyección lineal simple (proyección equirrectangular plana), la cual ahorra procesamiento
 *   y mantiene precisión absoluta en estas dimensiones.
 * - Aplica un margen (padding) del 5% en los bordes para evitar que los elementos colinden directamente con los extremos visuales.
 */
const geoToPixel = (
  lon: number, lat: number,
  bounds: ReturnType<typeof calculateBounds>,
  width: number, height: number
): PixelCoordinate => {
  const padding    = 0.05; // 5% de separación protectora
  const lonRange   = bounds.maxLon - bounds.minLon;
  const latRange   = bounds.maxLat - bounds.minLat;
  const availableW = width  * (1 - padding * 2);
  const availableH = height * (1 - padding * 2);
  
  // Mapeo lineal: Relación porcentual de la distancia respecto al límite inferior.
  const pixelX = ((lon - bounds.minLon) / lonRange) * availableW + width  * padding;
  // En coordenadas de pantalla, el eje Y crece hacia abajo, por lo que invertimos la latitud.
  const pixelY = ((bounds.maxLat - lat) / latRange) * availableH + height * padding;
  return [pixelX, pixelY];
};

/**
 * getClosestPointOnSegment:
 * Proyecta ortogonalmente un punto P(px, py) sobre un segmento lineal AB definido por A(ax, ay) y B(bx, by).
 * Retorna las coordenadas [x, y] proyectadas y el coeficiente t (proporción entre 0 y 1 del segmento).
 * JUSTIFICACIÓN:
 * - Permite realizar "Snapping" geométrico. Esto sirve para interceptar o conectar vértices que están ligeramente
 *   desconectados en los archivos vectoriales debido al dibujo manual de los GeoJSONs.
 */
const getClosestPointOnSegment = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  // Evitar división por cero si el segmento es un punto
  if (len2 === 0) return { x: ax, y: ay, t: 0 };
  
  // Coeficiente de proyección escalar parametrizada: t = (AP · AB) / |AB|^2
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  // Acotamos t al intervalo [0, 1] para que el punto proyectado caiga obligatoriamente dentro del segmento AB
  t = Math.max(0, Math.min(1, t));
  
  return {
    x: ax + t * dx,
    y: ay + t * dy,
    t: t
  };
};

/**
 * buildGraphFromRoutes:
 * Transforma un conjunto de líneas vectoriales (rutas de pasillos) y puntos de interés (POIs)
 * en una red matemática indexada (Grafo Adyacente no dirigido) apta para el algoritmo de Dijkstra.
 * 
 * PROCESO INTERNO CRÍTICO:
 * 1. Descompone las rutas polilíneas en segmentos individuales de dos puntos.
 * 2. Identifica puntos extremos únicos que componen la red.
 * 3. Ejecuta intersección geométrica (Snapping) con un umbral de tolerancia (~5.5 metros).
 *    Si una ruta pasa muy cerca de un vértice de otra ruta, el segmento original se subdivide e intersecta.
 *    Esto repara "cortes" lógicos en el mapa vectorial y garantiza que el algoritmo de búsqueda no quede atrapado.
 * 4. Crea las aristas bidireccionales asignando un peso igual a la distancia euclidiana y arrastrando la accesibilidad.
 * 5. Conecta dinámicamente los POIs (ej: boxes) al nodo del pasillo transitable más cercano para permitir calcular
 *    la ruta exacta partiendo o llegando directamente desde el interior del box.
 */
const buildGraphFromRoutes = (routes: Route[], pois: PointOfInterest[]): Graph => {
  const graph: Graph = new Map();

  // 1. Primero, recopilamos todos los segmentos originales de las rutas
  const originalSegments: { a: GeoCoordinate, b: GeoCoordinate, accesible: boolean }[] = [];
  routes.forEach(route => {
    const coords = route.coordinates;
    const isAccesible = route.accesible === 'si';
    for (let i = 0; i < coords.length - 1; i++) {
      originalSegments.push({
        a: coords[i],
        b: coords[i + 1],
        accesible: isAccesible
      });
    }
  });

  // 2. Extraemos todos los puntos extremos de estos segmentos
  const uniquePointsMap = new Map<string, GeoCoordinate>();
  originalSegments.forEach(seg => {
    uniquePointsMap.set(`${seg.a[0]},${seg.a[1]}`, seg.a);
    uniquePointsMap.set(`${seg.b[0]},${seg.b[1]}`, seg.b);
  });
  const originalPoints = Array.from(uniquePointsMap.values());

  // Umbral de snapping físico en grados decimales (aprox. 5.5 metros)
  const snapThreshold = 0.00005; 
  const finalSegments: { a: GeoCoordinate, b: GeoCoordinate, accesible: boolean }[] = [];

  // 3. Para cada segmento, encontrar todos los puntos originales que se proyectan en él
  originalSegments.forEach(seg => {
    const ax = seg.a[0], ay = seg.a[1];
    const bx = seg.b[0], by = seg.b[1];
    const projections: { t: number, c: GeoCoordinate, p: GeoCoordinate }[] = [];

    originalPoints.forEach(p => {
      const px = p[0], py = p[1];
      // Ignorar si ya es un extremo del segmento
      if ((px === ax && py === ay) || (px === bx && py === by)) return;

      const proj = getClosestPointOnSegment(px, py, ax, ay, bx, by);
      // Solo consideramos proyecciones estrictamente dentro del cuerpo del segmento
      if (proj.t <= 0.001 || proj.t >= 0.999) return;

      // Medir la distancia euclidiana entre el punto y su proyección
      const dist = Math.sqrt(Math.pow(px - proj.x, 2) + Math.pow(py - proj.y, 2));
      if (dist <= snapThreshold) {
        projections.push({
          t: proj.t,
          c: [proj.x, proj.y],
          p: p
        });
      }
    });

    if (projections.length === 0) {
      finalSegments.push(seg);
    } else {
      // Ordenar las proyecciones por factor 't' de menor a mayor para reconstruir el camino lineal
      projections.sort((a, b) => a.t - b.t);

      // Dividir el segmento original en tramos más pequeños uniendo las intersecciones consecutivas
      let lastPoint = seg.a;
      projections.forEach(proj => {
        finalSegments.push({ a: lastPoint, b: proj.c, accesible: seg.accesible });
        // Crear un puente de conexión entre el punto original P y su proyección C
        finalSegments.push({ a: proj.p, b: proj.c, accesible: true });
        lastPoint = proj.c;
      });
      // Conectar la última intersección proyectada con el final original B
      finalSegments.push({ a: lastPoint, b: seg.b, accesible: seg.accesible });
    }
  });

  // 4. Construir el grafo final agregando nodos y aristas bidireccionales (grafo no dirigido)
  finalSegments.forEach(seg => {
    const id1 = `${seg.a[0]},${seg.a[1]}`;
    const id2 = `${seg.b[0]},${seg.b[1]}`;
    // Peso de la arista = Distancia geométrica euclidiana en el espacio plano
    const weight = Math.sqrt(Math.pow(seg.b[0] - seg.a[0], 2) + Math.pow(seg.b[1] - seg.a[1], 2));

    if (!graph.has(id1)) graph.set(id1, { id: id1, lon: seg.a[0], lat: seg.a[1], edges: [] });
    if (!graph.has(id2)) graph.set(id2, { id: id2, lon: seg.b[0], lat: seg.b[1], edges: [] });

    const edgeExists1 = graph.get(id1)!.edges.some(e => e.to === id2);
    if (!edgeExists1) {
      graph.get(id1)!.edges.push({ to: id2, weight, accesible: seg.accesible });
    }
    const edgeExists2 = graph.get(id2)!.edges.some(e => e.to === id1);
    if (!edgeExists2) {
      graph.get(id2)!.edges.push({ to: id1, weight, accesible: seg.accesible });
    }
  });

  // 5. Conectar los puntos de interés (POIs) al nodo físico más cercano del grafo
  pois.forEach(poi => {
    const poiId = `poi_${poi.nombre}_${poi.id}`;
    let closestId = '';
    let minDist   = Infinity;
    
    graph.forEach(node => {
      if (node.id.startsWith('poi_')) return; // No conectar POIs entre sí directamente
      const dist = Math.sqrt(
        Math.pow(node.lon - poi.longitude, 2) + Math.pow(node.lat - poi.latitude, 2)
      );
      if (dist < minDist) { minDist = dist; closestId = node.id; }
    });
    
    if (!closestId) return;
    // Inserción bidireccional del nodo POI para garantizar accesibilidad de entrada y salida
    if (!graph.has(poiId)) graph.set(poiId, { id: poiId, lon: poi.longitude, lat: poi.latitude, edges: [] });
    graph.get(poiId)!.edges.push({ to: closestId, weight: minDist, accesible: true });
    graph.get(closestId)!.edges.push({ to: poiId,  weight: minDist, accesible: true });
  });

  return graph;
};

// ─── Dijkstra ─────────────────────────────────────────────────────────────────
/**
 * executeDijkstra:
 * Implementación clásica del algoritmo de Dijkstra para encontrar el camino más corto en un grafo ponderado.
 * 
 * JUSTIFICACIÓN Y DETALLES DE IMPLEMENTACIÓN:
 * - Complejidad Temporal: O(V^2) en el peor de los casos al no utilizar una cola de prioridad basada en montículo binario.
 *   Debido a que el grafo del primer piso del hospital es sumamente acotado (menor a 200 nodos), esta implementación
 *   es sumamente eficiente, requiere cero dependencias externas y se ejecuta en milisegundos sin congelar la UI.
 * - Filtro de Accesibilidad: Si `soloAccesible` es verdadero, el algoritmo ignora activamente las aristas
 *   que no estén marcadas con `accesible: true` (ej: tramos con escaleras, pasillos angostos o sin rampas),
 *   asegurando una ruta viable para personas en silla de ruedas o cochecitos de bebé.
 */
const executeDijkstra = (
  graph: Graph, startId: string, endId: string, soloAccesible: boolean
): string[] => {
  const distances: Record<string, number>        = {}; // Tabla hash para almacenar la distancia mínima conocida a cada nodo
  const previous:  Record<string, string | null> = {}; // Tabla para reconstruir la ruta hacia atrás
  const queue = new Set<string>(); // Cola de prioridad simple (Set de JS)

  // Inicialización de distancias de Dijkstra
  graph.forEach((_, id) => {
    distances[id] = Infinity;
    previous[id]  = null;
    queue.add(id);
  });
  distances[startId] = 0;

  // Bucle principal de exploración
  while (queue.size > 0) {
    let minNodeId: string | null = null;
    let minDist = Infinity;
    
    // Búsqueda lineal del nodo con menor distancia tentativa acumulada
    queue.forEach(id => {
      if (distances[id] < minDist) { minDist = distances[id]; minNodeId = id; }
    });
    
    // Si no quedan nodos alcanzables o llegamos a una sección desconectada, terminamos
    if (!minNodeId || distances[minNodeId] === Infinity) break;
    // Optimización: Si el nodo evaluado es el destino final, detenemos la búsqueda (búsqueda orientada a objetivo)
    if (minNodeId === endId) break;
    queue.delete(minNodeId);

    const currNode = graph.get(minNodeId)!;
    currNode.edges.forEach(edge => {
      // Filtro crítico: Omitir pasajes no adaptados si el usuario seleccionó modo accesible
      if (soloAccesible && !edge.accesible) return;
      if (!queue.has(edge.to)) return; // Ignorar nodos ya cerrados
      
      const alt = distances[minNodeId!] + edge.weight;
      // Relajación de la arista
      if (alt < distances[edge.to]) {
        distances[edge.to] = alt;
        previous[edge.to]  = minNodeId;
      }
    });
  }

  // Reconstrucción del camino óptimo desde el final (Destino) hacia el inicio (Origen)
  const path: string[] = [];
  let u: string | null = endId;
  if (previous[u] || u === startId) {
    while (u) { path.unshift(u); u = previous[u]; }
  }
  return path;
};

// ─── Procesadores GeoJSON ─────────────────────────────────────────────────────
// Nota: Actúan como mapeadores puros de datos, aislando la estructura interna del JSON
// e inyectando tipado estructurado de Typescript en tiempo de desarrollo.

const processPoints = (): PointOfInterest[] =>
  (puntosGeoJson as any).features.map((f: any) => ({
    id:        f.properties.fid,
    nombre:    f.properties.nombre_puntointeres,
    tipo:      f.properties.tipo_puntointeres,
    longitude: f.geometry.coordinates[0],
    latitude:  f.geometry.coordinates[1],
    piso:      f.properties.piso,
  }));

const processRoutes = (): Route[] =>
  (rutasGeoJson as any).features.map((f: any) => ({
    id:          f.properties.fid,
    coordinates: f.geometry.coordinates,
    accesible:   f.properties.accesible,
  }));

const processBuildings = (): Building[] =>
  (edificioGeoJson as any).features.map((f: any) => ({
    id:          f.properties.fid,
    nombre:      f.properties.nombre,
    tipo:        f.properties.tipo,
    coordinates: f.geometry.coordinates[0],
    piso:        f.properties.piso,
  }));

// ─── Props ────────────────────────────────────────────────────────────────────
// ─── Props ────────────────────────────────────────────────────────────────────
type IndoorMapProps = {
  origen_id?:     string; // ID de inicio obtenido usualmente a través del escaneo QR
  destino_id?:    string; // Nombre/ID de destino seleccionado desde la lista de servicios
  soloAccesible?: boolean; // Controla si se restringe la ruta a caminos adaptados para movilidad reducida
  highlightedFid?: number; // Para propósitos de depuración de desarrollador, resalta una arista/ruta específica en fucsia
};

// ─── Componente Principal ─────────────────────────────────────────────────────
export default function IndoorMap({ origen_id, destino_id, soloAccesible = false, highlightedFid }: IndoorMapProps) {
  
  // Memorizar la decodificación de GeoJSONs al montar para evitar reprocesamiento en cada render.
  const points    = useMemo(() => processPoints(),    []);
  const routes    = useMemo(() => processRoutes(),    []);
  const buildings = useMemo(() => processBuildings(), []);

  // Recopila todas las coordenadas del plano para calcular la envoltura (bounds) óptima.
  const allCoordinates = useMemo(() => {
    const coords: GeoCoordinate[] = [];
    buildings.forEach(b => coords.push(...b.coordinates));
    routes.forEach(r    => coords.push(...r.coordinates));
    points.forEach(p    => coords.push([p.longitude, p.latitude]));
    return coords;
  }, [buildings, routes, points]);

  const bounds = useMemo(() => calculateBounds(allCoordinates), [allCoordinates]);

  // Se genera el grafo uniendo pasillos y ubicando físicamente los POIs en los nodos más cercanos.
  const graph = useMemo(() => buildGraphFromRoutes(routes, points), [routes, points]);

  // Dimensionamiento dinámico del mapa basado en el tamaño de la pantalla del dispositivo
  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
  const svgWidth  = screenWidth;
  const svgHeight = screenHeight * 0.82; // El mapa ocupa un 82% de la pantalla para abarcar casi todo el fondo detrás del panel flotante.

  // ─── Cálculo de ruta dinámica (Dijkstra) ──────────────────────────────────
  const activeRoutePixels = useMemo(() => {
    if (!origen_id || !destino_id) return null;

    // Obtener los POIs asociados al nombre de origen y destino (case-insensitive)
    const startPois = points.filter(p => p.nombre?.toLowerCase() === origen_id.toLowerCase());
    const endPois   = points.filter(p => p.nombre?.toLowerCase() === destino_id.toLowerCase());

    if (startPois.length === 0 || endPois.length === 0) return null;

    let shortestPath: string[] = [];
    let minPathWeight = Infinity;

    // Bucle cruzado: Dado que pueden existir múltiples POIs con nombres similares o redundancias,
    // calculamos la ruta óptima cruzada y seleccionamos la de menor longitud geométrica acumulada.
    for (const startPoi of startPois) {
      for (const endPoi of endPois) {
        const startNodeId = `poi_${startPoi.nombre}_${startPoi.id}`;
        const endNodeId   = `poi_${endPoi.nombre}_${endPoi.id}`;
        const nodePath = executeDijkstra(graph, startNodeId, endNodeId, soloAccesible);
        
        if (nodePath.length > 1) {
          let weight = 0;
          let valid = true;
          // Sumar el peso físico acumulado de la ruta resultante
          for (let i = 0; i < nodePath.length - 1; i++) {
            const node = graph.get(nodePath[i]);
            const edge = node?.edges.find(e => e.to === nodePath[i+1]);
            if (edge) {
              weight += edge.weight;
            } else {
              valid = false;
              break;
            }
          }
          if (valid && weight < minPathWeight) {
            minPathWeight = weight;
            shortestPath = nodePath;
          }
        }
      }
    }

    // Si encontramos una ruta válida, convertimos las coordenadas geográficas de los nodos a píxeles
    if (shortestPath.length > 1) {
      return shortestPath.map(nodeId => {
        if (nodeId.startsWith('poi_')) {
          const parts = nodeId.split('_');
          const id = Number(parts[parts.length - 1]);
          const poi = points.find(p => p.id === id);
          if (poi) return geoToPixel(poi.longitude, poi.latitude, bounds, svgWidth, svgHeight);
        }
        const [lon, lat] = nodeId.split(',').map(Number);
        return geoToPixel(lon, lat, bounds, svgWidth, svgHeight);
      });
    }

    // Respaldo de seguridad (Fallback): Si Dijkstra falla (ej: grafo desconectado por error),
    // dibuja una línea directa de trazo recto entre el origen y el destino para guiar al usuario a nivel conceptual.
    const startPoi = startPois[0];
    const endPoi   = endPois[0];
    return [
      geoToPixel(startPoi.longitude, startPoi.latitude, bounds, svgWidth, svgHeight),
      geoToPixel(endPoi.longitude,   endPoi.latitude,   bounds, svgWidth, svgHeight),
    ];

  }, [origen_id, destino_id, graph, points, bounds, svgWidth, svgHeight, soloAccesible]);

  // Transforma el array de coordenadas [[x1, y1], [x2, y2]] a formato de cadena "x1,y1 x2,y2" requerido por SvgPolyline.
  const activeRouteString = useMemo(() => {
    if (!activeRoutePixels) return '';
    return activeRoutePixels.map(([x, y]) => `${x},${y}`).join(' ');
  }, [activeRoutePixels]);

  // ─── Renderizado SVG del Mapa ─────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* 
       * ScrollView bloqueada (scrollEnabled={false}):
       * Se utiliza como un contenedor de tamaño fijo para estructurar y centrar el SVG responsivamente.
       */}
      <ScrollView
        style={styles.scrollView}
        scrollEnabled={false}
        contentContainerStyle={{ width: svgWidth, height: svgHeight }}
      >
        <Svg width={svgWidth} height={svgHeight}>
          {/* Fondo neutro claro */}
          <Rect width={svgWidth} height={svgHeight} fill="#fafafa" />

          {/* Capa 1: Estructuras arquitectónicas (Polígonos de salas y pasillos perimetrales) */}
          <G>
            {buildings.map(building => {
              const pixelPoints = building.coordinates
                .map(([lon, lat]) => geoToPixel(lon, lat, bounds, svgWidth, svgHeight))
                .map(([x, y]) => `${x},${y}`).join(' ');
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

          {/* Capa 2: Red completa de pasillos transitables (Grafo subyacente atenuado al 25% de opacidad) */}
          <G opacity={0.25}>
            {routes.map(route => {
              const pixelPoints = route.coordinates
                .map(([lon, lat]) => geoToPixel(lon, lat, bounds, svgWidth, svgHeight))
                .map(([x, y]) => `${x},${y}`).join(' ');
              return (
                <Polyline
                  key={`route-${route.id}`}
                  points={pixelPoints}
                  // Visualización de accesibilidad: gris para accesibles, naranja para restringidos (ej. escaleras).
                  stroke={route.accesible === 'si' ? '#b0bec5' : '#ffab91'}
                  strokeWidth={2}
                  strokeDasharray={route.accesible === 'si' ? undefined : '4,4'}
                  fill="none"
                />
              );
            })}
          </G>

          {/* Capa 3: Ruta Activa Calculada (Dijkstra) en Cian Brillante */}
          {activeRouteString ? (
            <G>
              <Polyline
                points={activeRouteString}
                stroke="#00e5ff"
                strokeWidth={5}
                strokeLinecap="round" // Esquinas redondeadas para un look moderno y premium
                strokeLinejoin="round"
                fill="none"
              />
              {/* Círculo indicador en el destino final de la ruta activa */}
              {activeRoutePixels && activeRoutePixels.length > 0 && (
                <Circle
                  cx={activeRoutePixels[activeRoutePixels.length - 1][0]}
                  cy={activeRoutePixels[activeRoutePixels.length - 1][1]}
                  r={10}
                  fill="#00e5ff"
                  opacity={0.8}
                />
              )}
            </G>
          ) : null}

          {/* Capa 3.5: Herramienta de Depuración para Desarrollador (Resaltado de FID)
           * Permite ingresar el ID físico de una ruta (Feature ID o FID) en la UI de desarrollo
           * para iluminarla en fucsia intenso y calcular su punto medio para etiquetarla.
           */}
          {highlightedFid && (() => {
            const hRoute = routes.find(r => r.id === highlightedFid);
            if (!hRoute) return null;
            const pixelPoints = hRoute.coordinates
              .map(([lon, lat]) => geoToPixel(lon, lat, bounds, svgWidth, svgHeight));
            const pointsString = pixelPoints.map(([x, y]) => `${x},${y}`).join(' ');
            
            // Calcular punto medio para colocar la etiqueta
            const midIndex = Math.floor(pixelPoints.length / 2);
            const [midX, midY] = pixelPoints[midIndex];

            return (
              <G>
                <Polyline
                  points={pointsString}
                  stroke="#ff00ff"
                  strokeWidth={6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
                <Circle
                  cx={midX}
                  cy={midY}
                  r={12}
                  fill="#ff00ff"
                  stroke="white"
                  strokeWidth={1.5}
                />
                <SvgText
                  x={midX}
                  y={midY + 4}
                  fill="#ffffff"
                  fontSize="11"
                  fontWeight="bold"
                  textAnchor="middle"
                >
                  {hRoute.id.toString()}
                </SvgText>
              </G>
            );
          })()}

          {/* Capa 4: Nodos de Puntos de Interés (POIs) con códigos de color e indicador de origen */}
          <G>
            {points.map(point => {
              const [pixelX, pixelY] = geoToPixel(point.longitude, point.latitude, bounds, svgWidth, svgHeight);
              const color    = POINT_COLORS[point.tipo] || POINT_COLORS.default;
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
    </View>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#fafafa' },
  scrollView: { flex: 1 },
});

