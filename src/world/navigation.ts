import type { CandidateProfile } from '../data';
import {
  CONSTITUENCY_ADMIN_NAMES,
  constituencyNumberForSlug,
  movementScopeForCandidate,
} from './constituencies';
import {
  ADMIN_DISTRICT_BY_ID,
  ADMIN_DISTRICT_BY_NAME,
  ADMIN_DISTRICTS,
  districtAtWorld,
  districtIdAtWorldTolerant,
  type WorldDistrict,
} from './geography';
import {
  distanceKm,
  type LonLat,
  lonLatToWorld,
  type WorldPoint,
} from './projection';
import {
  edgeBetween,
  HERO_WALK_GRAPH,
  sampleAllowed,
  type WalkEdge,
  type WalkGraph,
  type WalkSurface,
  WORLD_WALK_GRAPH,
  worldNodePathForNames,
} from './walk-graph';

export type TravelMode = 'walking' | 'transit';
export type RouteValidation = 'graph' | 'schematic';
export type RouteScale = 'hero' | 'world';

export type WorldRoute = {
  id: string;
  label: string;
  mode: TravelMode;
  scale: RouteScale;
  validation: RouteValidation;
  points: WorldPoint[];
  cumulativeKm: number[];
  lengthKm: number;
  allowedAdminIds: string[];
  districtIds: string[];
  edgeIds: string[];
  surfaces: WalkSurface[];
  traversable: boolean;
  valid: boolean;
  warnings: string[];
  fictional: true;
};

const SAMPLE_KM = 0.04;

const COUNCIL_04_ALLOWED = [
  ADMIN_DISTRICT_BY_NAME.get('左營')?.id,
  ADMIN_DISTRICT_BY_NAME.get('楠梓')?.id,
].filter((id): id is string => Boolean(id));

const ALL_DISTRICT_IDS = ADMIN_DISTRICTS.map((district) => district.id);

function cumulative(points: WorldPoint[]): number[] {
  const values = [0];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (!previous || !current) continue;
    values.push((values[index - 1] ?? 0) + distanceKm(previous, current));
  }
  return values;
}

function sampleSegment(
  previous: WorldPoint,
  current: WorldPoint,
  callback: (point: WorldPoint, t: number) => void,
): void {
  const length = distanceKm(previous, current);
  const steps = Math.max(1, Math.ceil(length / SAMPLE_KM));
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    callback(
      {
        x: previous.x + (current.x - previous.x) * t,
        z: previous.z + (current.z - previous.z) * t,
      },
      t,
    );
  }
}

function gateTransitionDistance(
  graph: WalkGraph,
  point: WorldPoint,
  districtA: string,
  districtB: string,
): number {
  const gates = graph.nodes.filter((item) => item.kind === 'gate');
  let best = Number.POSITIVE_INFINITY;
  for (const gate of gates) {
    const ids = gate.id
      .slice('gate:'.length)
      .split(':')
      .map((name) => ADMIN_DISTRICT_BY_NAME.get(name)?.id)
      .filter((value): value is string => Boolean(value));
    if (!ids.includes(districtA) || !ids.includes(districtB)) continue;
    best = Math.min(best, distanceKm(point, gate.point));
  }
  return best;
}

export function buildGraphRoute(options: {
  id: string;
  label: string;
  graph: WalkGraph;
  nodeIds: string[];
  allowedAdminIds: string[];
  scale: RouteScale;
}): WorldRoute {
  const { id, label, graph, allowedAdminIds, scale } = options;
  const nodeIds = [...options.nodeIds];
  if (nodeIds.length < 2) {
    return {
      id,
      label,
      mode: 'walking',
      scale,
      validation: 'graph',
      points: [],
      cumulativeKm: [0],
      lengthKm: 0,
      allowedAdminIds,
      districtIds: [],
      edgeIds: [],
      surfaces: [],
      traversable: false,
      valid: false,
      warnings: ['路線節點不足。'],
      fictional: true,
    };
  }
  const points: WorldPoint[] = [];
  const edges: WalkEdge[] = [];
  for (let index = 0; index < nodeIds.length; index += 1) {
    const current = nodeIds[index];
    if (!current) continue;
    const walkNode = graph.nodeById.get(current);
    if (!walkNode) {
      return {
        id,
        label,
        mode: 'walking',
        scale,
        validation: 'graph',
        points: [],
        cumulativeKm: [0],
        lengthKm: 0,
        allowedAdminIds,
        districtIds: [],
        edgeIds: [],
        surfaces: [],
        traversable: false,
        valid: false,
        warnings: [`找不到步行節點：${current}`],
        fictional: true,
      };
    }
    points.push(walkNode.point);
    const previousId = nodeIds[index - 1];
    if (!previousId) continue;
    const edge = edgeBetween(graph, previousId, current);
    if (!edge) {
      return {
        id,
        label,
        mode: 'walking',
        scale,
        validation: 'graph',
        points,
        cumulativeKm: cumulative(points),
        lengthKm: 0,
        allowedAdminIds,
        districtIds: [],
        edgeIds: [],
        surfaces: [],
        traversable: false,
        valid: false,
        warnings: [`節點之間沒有已宣告的步行邊：${previousId} → ${current}`],
        fictional: true,
      };
    }
    edges.push(edge);
  }

  const warnings: string[] = [];
  const districtIds = new Set<string>();
  let invalidSamples = 0;
  let offsetGateCrossings = 0;
  let previousDistrict: string | null = null;
  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[index];
    const current = points[index + 1];
    const edge = edges[index];
    if (!previous || !current || !edge) continue;
    sampleSegment(previous, current, (point) => {
      const districtId = districtIdAtWorldTolerant(point, 0.04);
      if (districtId) {
        districtIds.add(districtId);
        if (previousDistrict && previousDistrict !== districtId) {
          if (scale === 'world') {
            const gateDistance = gateTransitionDistance(
              graph,
              point,
              previousDistrict,
              districtId,
            );
            if (!Number.isFinite(gateDistance)) invalidSamples += 1;
            else {
              if (gateDistance > 0.3) offsetGateCrossings += 1;
            }
          }
        }
        previousDistrict = districtId;
      } else if (edge.transit) {
      } else if (!edge.bridge) {
        invalidSamples += 1;
      }
      if (!sampleAllowed(graph, edge, point, allowedAdminIds)) {
        invalidSamples += 1;
      }
    });
  }

  if (edges.some((edge) => edge.transit)) {
    warnings.push('跨海段以渡輪／運輸轉換表示，角色不會步行跨越水面。');
  }
  if (offsetGateCrossings > 0) {
    warnings.push(
      `${offsetGateCrossings} 個行政區轉換點與官方交界座標有簡化邊界偏差；路線經交界節點銜接，但此段為示意銜接，非街道級步行認證。`,
    );
  }
  if (invalidSamples > 0) {
    warnings.push(
      `${invalidSamples} 個取樣點不在已驗證的可步行邊、允許行政區或官方交界上。`,
    );
  }
  if (scale === 'hero') {
    warnings.push('本路線僅驗證左營・楠梓局部步行網路，不代表全市人行道完整。');
  } else {
    warnings.push('跨區幹道示意，尚未完成街道級人行道測繪。');
  }

  const lengthKm = cumulative(points).at(-1) ?? 0;
  if (lengthKm < 0.05) warnings.push('路線長度不足。');
  return {
    id,
    label,
    mode: edges.some((edge) => edge.transit) ? 'transit' : 'walking',
    scale,
    validation: 'graph',
    points,
    cumulativeKm: cumulative(points),
    lengthKm,
    allowedAdminIds,
    districtIds: [...districtIds],
    edgeIds: edges.map((edge) => edge.id),
    surfaces: edges.map((edge) => edge.surface),
    traversable: invalidSamples === 0 && lengthKm >= 0.05 && graph.valid,
    valid: invalidSamples === 0 && lengthKm >= 0.05 && graph.valid,
    warnings,
    fictional: true,
  };
}

/** Legacy schematic loop used only where no street-level graph exists yet.
 * It is explicitly labeled; it is not evidence of a completed pedestrian
 * network. */
function buildSchematicRoute(
  id: string,
  label: string,
  points: WorldPoint[],
  allowedAdminIds: string[],
  closed = true,
): WorldRoute {
  const first = points[0];
  const path: WorldPoint[] =
    closed && points.length > 1 && first ? [...points, first] : points;
  const cumulativeKm = cumulative(path);
  const lengthKm = cumulativeKm.at(-1) ?? 0;
  const districtIds = new Set<string>();
  const warnings: string[] = [];
  if (lengthKm < 0.05) warnings.push('路線長度不足，角色將在原地待機。');
  let invalidSamples = 0;
  for (let index = 1; index < path.length; index += 1) {
    const previous = path[index - 1];
    const current = path[index];
    if (!previous || !current) continue;
    sampleSegment(previous, current, (point) => {
      const districtId = districtIdAtWorldTolerant(point);
      if (!districtId) {
        invalidSamples += 1;
        return;
      }
      districtIds.add(districtId);
      if (!allowedAdminIds.includes(districtId)) invalidSamples += 1;
    });
  }
  if (invalidSamples > 0) {
    warnings.push(
      `${invalidSamples} 個取樣點落在允許行政區之外；此路線僅保留為除錯證據。`,
    );
  }
  warnings.push('行政區中心示意圈：尚未完成街道路網驗證，不代表實際人行道。');
  return {
    id,
    label,
    mode: 'walking',
    scale: 'world',
    validation: 'schematic',
    points: path,
    cumulativeKm,
    lengthKm,
    allowedAdminIds,
    districtIds: [...districtIds],
    edgeIds: [],
    surfaces: Array.from(
      { length: Math.max(0, path.length - 1) },
      () => 'schematic',
    ),
    traversable: invalidSamples === 0 && lengthKm >= 0.05,
    valid: invalidSamples === 0 && lengthKm >= 0.05,
    warnings,
    fictional: true,
  };
}

/** Council-04 proof route: a graph-validated loop across Zuoying and Nanzih.
 * It uses the two river footbridges, the road bridge and existing paths. */
export const COUNCIL_04_HERO_POINTS: Array<[number, number]> = [
  [0.6, 5.8],
  [-2.3, 5.8],
  [-2.3, -8.8],
  [2.0, -8.8],
  [6.15, -6.4],
  [9.3, -6.4],
  [10.2, -7.1],
  [10.2, -6.15],
  [13.1, -6.15],
  [13.7, -6.6],
  [12.1, -5.6],
  [11.4, -4.4],
  [10.0, -2.8],
  [9.9, -1.4],
  [9.9, 3.6],
  [9.2, 4.2],
  [6.8, 4.2],
  [6.6, 3.4],
  [6.2, 0.5],
  [2.0, -1.0],
  [0.6, 1.0],
  [0.6, 5.8],
];

const COUNCIL_04_NODE_PATH = [
  'z-plaza',
  'z-west',
  'z-southwest',
  'z-south',
  'n-loop',
  'n-bridge-west',
  'n-bridge-west-approach',
  'n-bridge-east-approach',
  'n-bridge-east',
  'n-bridge-exit',
  'n-deck-west',
  'n-deck-east',
  'p-east',
  'p-high',
  'p-mid',
  'p-south',
  'e-bank-south',
  'p-south',
  'p-mid',
  'p-high',
  'p-east',
  'n-deck-east',
  'n-deck-west',
  'n-bridge-exit',
  'n-bridge-east',
  'n-bridge-east-approach',
  'n-bridge-west-approach',
  'n-bridge-west',
  'n-loop',
  'z-south',
  'z-southwest',
  'z-west',
  'z-plaza',
];

export const COUNCIL_04_ROUTE = buildGraphRoute({
  id: 'council-04-zuoying-nanzih',
  label: '左營・楠梓議員跨區步行路線（局部驗證）',
  graph: HERO_WALK_GRAPH,
  nodeIds: COUNCIL_04_NODE_PATH,
  allowedAdminIds: COUNCIL_04_ALLOWED,
  scale: 'hero',
});

/** Mayoral proof route: follows official land boundary gates instead of
 * straight lines between district label points. */
export const MAYORAL_ROUTE = buildGraphRoute({
  id: 'mayoral-zuoying-nanzih-qiaotou-gangshan',
  label: '市長跨區示範路線：左營→楠梓→橋頭→岡山→回程',
  graph: WORLD_WALK_GRAPH,
  nodeIds: worldNodePathForNames([
    '左營',
    '楠梓',
    '橋頭',
    '岡山',
    '橋頭',
    '楠梓',
    '左營',
  ]),
  allowedAdminIds: ALL_DISTRICT_IDS,
  scale: 'world',
});

/** Build a graph route through named districts for tests and evidence. */
export function worldRouteForNames(
  names: string[],
  id = `route-${names.join('-')}`,
  label = `跨區路線：${names.join('→')}`,
): WorldRoute {
  return buildGraphRoute({
    id,
    label,
    graph: WORLD_WALK_GRAPH,
    nodeIds: worldNodePathForNames(names),
    allowedAdminIds: ALL_DISTRICT_IDS,
    scale: 'world',
  });
}

/** Small deterministic loops for council actors outside constituency 4. */
export function loopForDistrict(district: WorldDistrict): WorldPoint[] {
  const centre = lonLatToWorld(district.labelPoint[0], district.labelPoint[1]);
  const [west, south, east, north] = district.bbox;
  const widthKm = Math.abs(east - west) * 102.7;
  const heightKm = Math.abs(north - south) * 110.57;
  let radius = Math.max(
    0.16,
    Math.min(0.62, Math.min(widthKm, heightKm) * 0.18),
  );
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const points: WorldPoint[] = [];
    for (let index = 0; index < 12; index += 1) {
      const angle = (index / 12) * Math.PI * 2;
      points.push({
        x: centre.x + Math.cos(angle) * radius,
        z: centre.z + Math.sin(angle) * radius * 0.82,
      });
    }
    const valid = points.every((point) => {
      const districtId = districtIdAtWorldTolerant(point);
      return districtId === district.id;
    });
    if (valid) return points;
    radius *= 0.78;
  }
  return [centre];
}

const districtLoopCache = new Map<string, WorldRoute>();

export function loopRouteForDistrict(district: WorldDistrict): WorldRoute {
  const cached = districtLoopCache.get(district.id);
  if (cached) return cached;
  const points = loopForDistrict(district);
  const route = buildSchematicRoute(
    `council-loop-${district.slug}`,
    `${district.name}議員選區示意圈`,
    points,
    [district.id],
  );
  districtLoopCache.set(district.id, route);
  return route;
}

const candidateRouteCache = new Map<string, WorldRoute>();

export function routeForCandidate(candidate: CandidateProfile): WorldRoute {
  const cached = candidateRouteCache.get(candidate.candidacy.slug);
  if (cached) return cached;
  const scope = movementScopeForCandidate(candidate);
  let route: WorldRoute;
  if (scope.kind === 'mayoral' || scope.kind === 'indigenous') {
    route = MAYORAL_ROUTE;
  } else if (scope.kind === 'council') {
    const number = constituencyNumberForSlug(candidate.district.slug);
    if (number === 4) {
      route = COUNCIL_04_ROUTE;
    } else {
      const names = number ? (CONSTITUENCY_ADMIN_NAMES[number] ?? []) : [];
      const hash = candidate.candidacy.slug
        .split('')
        .reduce((value, char) => value + char.charCodeAt(0), 0);
      const selectedName = names[hash % Math.max(names.length, 1)];
      const district = selectedName
        ? ADMIN_DISTRICT_BY_NAME.get(selectedName)
        : undefined;
      const worldDistrict = district
        ? ADMIN_DISTRICTS.find((item) => item.id === district.id)
        : undefined;
      route = worldDistrict
        ? loopRouteForDistrict(worldDistrict as WorldDistrict)
        : COUNCIL_04_ROUTE;
    }
  } else {
    route = COUNCIL_04_ROUTE;
  }
  candidateRouteCache.set(candidate.candidacy.slug, route);
  return route;
}

export function sampleRoute(route: WorldRoute, progressKm: number): WorldPoint {
  if (route.points.length === 0) return { x: 0, z: 0 };
  if (route.lengthKm <= 0) return route.points[0] ?? { x: 0, z: 0 };
  const wrapped =
    ((progressKm % route.lengthKm) + route.lengthKm) % route.lengthKm;
  let index = 1;
  while (
    index < route.cumulativeKm.length &&
    (route.cumulativeKm[index] ?? 0) < wrapped
  ) {
    index += 1;
  }
  const previousIndex = Math.max(0, index - 1);
  const nextIndex = Math.min(index, route.points.length - 1);
  const previous = route.points[previousIndex];
  const next = route.points[nextIndex];
  if (!previous || !next) return route.points[0] ?? { x: 0, z: 0 };
  const start = route.cumulativeKm[previousIndex] ?? 0;
  const end = route.cumulativeKm[nextIndex] ?? start;
  const t = end > start ? (wrapped - start) / (end - start) : 0;
  return {
    x: previous.x + (next.x - previous.x) * t,
    z: previous.z + (next.z - previous.z) * t,
  };
}

export function routeDistrictIds(route: WorldRoute): string[] {
  return route.districtIds;
}

export function routeAudit(): Array<{
  id: string;
  label: string;
  lengthKm: number;
  districtIds: string[];
  validation: RouteValidation;
  traversable: boolean;
  valid: boolean;
  warnings: string[];
}> {
  return [COUNCIL_04_ROUTE, MAYORAL_ROUTE].map((route) => ({
    id: route.id,
    label: route.label,
    lengthKm: route.lengthKm,
    districtIds: route.districtIds.map(
      (id) => ADMIN_DISTRICT_BY_ID.get(id)?.name ?? id,
    ),
    validation: route.validation,
    traversable: route.traversable,
    valid: route.valid,
    warnings: route.warnings,
  }));
}

export function districtAtRoutePoint(point: WorldPoint) {
  return districtAtWorld(point);
}

export function lonLatRoutePoint(lon: number, lat: number): WorldPoint {
  return lonLatToWorld(lon, lat);
}

export const ROUTE_LON_LAT_DEBUG: Record<string, LonLat[]> = {
  mayoral: MAYORAL_ROUTE.points.map((point) => {
    const x = point.x;
    const z = point.z;
    return [120.3 + x / 102.7, 22.7 - z / 110.57];
  }),
};
