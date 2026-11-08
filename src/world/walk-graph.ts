import { POND_OUTLINE, RIVER_POINTS } from '../city/layout';
import {
  ADMIN_DISTRICT_BY_ID,
  ADMIN_DISTRICT_BY_NAME,
  ADMIN_DISTRICTS,
  districtIdAtWorldTolerant,
  GEOGRAPHY,
} from './geography';
import { HERO_KM_PER_UNIT, heroPointToWorld, worldToHeroLocal } from './hero';
import { distanceKm, type WorldPoint } from './projection';

export type WalkSurface =
  | 'footpath'
  | 'street'
  | 'bridge'
  | 'plaza'
  | 'park'
  | 'arterial'
  | 'ferry'
  | 'schematic';

export type WalkNodeKind = 'path' | 'landmark' | 'gate' | 'bridge' | 'transit';

export type WalkNode = {
  id: string;
  label: string;
  point: WorldPoint;
  adminId: string | null;
  kind: WalkNodeKind;
};

export type WalkEdge = {
  id: string;
  from: string;
  to: string;
  lengthKm: number;
  surface: WalkSurface;
  adminIds: string[];
  bridge: boolean;
  transit: boolean;
};

export type WalkGraph = {
  id: string;
  label: string;
  nodes: WalkNode[];
  edges: WalkEdge[];
  nodeById: Map<string, WalkNode>;
  edgesFrom: Map<string, WalkEdge[]>;
  valid: boolean;
  warnings: string[];
};

export type ObstacleKind = 'none' | 'water' | 'outside';

function edgeId(a: string, b: string): string {
  return [a, b].sort().join('|');
}

function pointInPolygon(
  point: WorldPoint,
  polygon: Array<[number, number]>,
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const pi = polygon[i];
    const pj = polygon[j];
    if (!pi || !pj) continue;
    const intersects =
      pi[1] > point.z !== pj[1] > point.z &&
      point.x < ((pj[0] - pi[0]) * (point.z - pi[1])) / (pj[1] - pi[1]) + pi[0];
    if (intersects) inside = !inside;
  }
  return inside;
}

function distanceToSegment(
  point: WorldPoint,
  a: [number, number],
  b: [number, number],
): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const lengthSq = dx * dx + dz * dz;
  if (lengthSq === 0) return Math.hypot(point.x - a[0], point.z - a[1]);
  const t = Math.max(
    0,
    Math.min(1, ((point.x - a[0]) * dx + (point.z - a[1]) * dz) / lengthSq),
  );
  return Math.hypot(point.x - (a[0] + dx * t), point.z - (a[1] + dz * t));
}

/** Local hero-space terrain check. Used only to reject routes that cross the
 * pond or the river where no bridge edge is declared. */
export function heroObstacleAt(local: WorldPoint): ObstacleKind {
  if (local.x < -17.6 || local.x > 17.6 || local.z < -16.2 || local.z > 16.2) {
    return 'outside';
  }
  if (pointInPolygon(local, POND_OUTLINE)) return 'water';
  for (let index = 1; index < RIVER_POINTS.length; index += 1) {
    const a = RIVER_POINTS[index - 1];
    const b = RIVER_POINTS[index];
    if (a && b && distanceToSegment(local, a, b) < 0.62) return 'water';
  }
  return 'none';
}

function node(
  id: string,
  label: string,
  point: WorldPoint,
  kind: WalkNodeKind,
  adminId?: string | null,
): WalkNode {
  const resolved =
    adminId === undefined ? districtIdAtWorldTolerant(point, 0.04) : adminId;
  return { id, label, point, adminId: resolved, kind };
}

function heroNode(
  id: string,
  label: string,
  x: number,
  z: number,
  kind: WalkNodeKind = 'path',
): WalkNode {
  return node(id, label, heroPointToWorld(x, z), kind);
}

function makeGraph(
  id: string,
  label: string,
  nodes: WalkNode[],
  rawEdges: Array<{
    from: string;
    to: string;
    surface: WalkSurface;
    adminIds?: string[];
    bridge?: boolean;
    transit?: boolean;
  }>,
): WalkGraph {
  const nodeById = new Map(nodes.map((item) => [item.id, item]));
  const edges: WalkEdge[] = [];
  const warnings: string[] = [];
  for (const raw of rawEdges) {
    const from = nodeById.get(raw.from);
    const to = nodeById.get(raw.to);
    if (!from || !to) {
      warnings.push(`edge endpoint missing: ${raw.from} -> ${raw.to}`);
      continue;
    }
    const lengthKm = distanceKm(from.point, to.point);
    if (lengthKm < 1e-6) {
      warnings.push(`zero-length edge: ${raw.from} -> ${raw.to}`);
      continue;
    }
    const adminIds = raw.adminIds ?? [
      ...new Set(
        [from.adminId, to.adminId].filter((value): value is string =>
          Boolean(value),
        ),
      ),
    ];
    edges.push({
      id: edgeId(raw.from, raw.to),
      from: raw.from,
      to: raw.to,
      lengthKm,
      surface: raw.surface,
      adminIds,
      bridge: raw.bridge === true || raw.surface === 'bridge',
      transit: raw.transit === true || raw.surface === 'ferry',
    });
  }
  const edgesFrom = new Map<string, WalkEdge[]>();
  for (const edge of edges) {
    edgesFrom.set(edge.from, [...(edgesFrom.get(edge.from) ?? []), edge]);
    edgesFrom.set(edge.to, [...(edgesFrom.get(edge.to) ?? []), edge]);
  }
  return {
    id,
    label,
    nodes,
    edges,
    nodeById,
    edgesFrom,
    valid: warnings.length === 0,
    warnings,
  };
}

/* ------------------------------------------------------------------ */
/* Hero graph: each edge follows an existing footpath, street, plaza,  */
/* deck or a declared bridge. The three short connectors were added to */
/* the diorama in the same change.                                     */
/* ------------------------------------------------------------------ */

const heroNodes: WalkNode[] = [
  heroNode('z-plaza', '左營廣場', 0.6, 5.8, 'landmark'),
  heroNode('z-west', '左營西側', -2.3, 5.8),
  heroNode('z-southwest', '左營南側', -2.3, -8.8),
  heroNode('z-south', '左營南緣', 2.0, -8.8),
  heroNode('z-crossing', '左營・楠梓路口', 2.0, -1.0),
  heroNode('z-pond-east', '蓮池潭東岸', 0.6, 1.0),
  heroNode('w-bank-south', '後勁溪西岸南', 6.2, 0.5),
  heroNode('w-bank-mid', '後勁溪西岸中', 6.6, 3.4),
  heroNode('w-bank-north', '後勁溪西岸北', 7.3, 6.2),
  heroNode('w-bridge-south', '後勁溪西路橋南', 6.8, 4.2),
  heroNode('e-bridge-south', '後勁溪東路橋南', 9.2, 4.2),
  heroNode('e-bank-south', '後勁溪東岸南', 9.9, -1.4),
  heroNode('e-bank-mid', '後勁溪東岸中', 9.9, 3.6),
  heroNode('e-bank-north', '後勁溪東岸北', 9.7, 6.8),
  heroNode('w-bridge-north', '後勁溪西路橋北', 7.0, 7.6),
  heroNode('e-bridge-north', '後勁溪東路橋北', 9.6, 7.6),
  heroNode('n-loop', '楠梓南環', 2.0, -6.4),
  heroNode('n-bridge-west', '後勁溪步橋西', 6.15, -6.4),
  heroNode('n-bridge-west-approach', '後勁溪步橋西引道', 6.9, -6.4),
  heroNode('n-bridge-east-approach', '後勁溪步橋東引道', 9.3, -6.4),
  heroNode('n-bridge-east', '後勁溪步橋東', 10.05, -6.4),
  heroNode('n-bridge-exit', '後勁溪步橋出口', 10.2, -7.1),
  heroNode('n-deck-west', '都會公園木棧道西', 10.2, -6.15, 'landmark'),
  heroNode('n-deck-east', '都會公園木棧道東', 13.1, -6.15),
  heroNode('p-south', '都會公園南入口', 10.0, -2.8, 'landmark'),
  heroNode('p-mid', '都會公園中段', 11.4, -4.4),
  heroNode('p-high', '都會公園高點', 12.1, -5.6, 'landmark'),
  heroNode('p-east', '都會公園東側', 13.7, -6.6),
  heroNode('p-north', '都會公園北側', 14.9, -7.9),
  heroNode('p-north-end', '都會公園北端', 15.0, -9.2),
  heroNode('p-branch', '都會公園支線', 13.8, -6.7),
  heroNode('p-branch-mid', '都會公園支線中段', 14.0, -9.6),
  heroNode('p-branch-end', '都會公園支線末端', 12.9, -11.0),
];

export const HERO_WALK_GRAPH = makeGraph(
  'hero-zuoying-nanzih',
  '左營・楠梓步行網路（局部驗證）',
  heroNodes,
  [
    { from: 'z-plaza', to: 'z-west', surface: 'plaza' },
    { from: 'z-west', to: 'z-southwest', surface: 'street' },
    { from: 'z-southwest', to: 'z-south', surface: 'street' },
    { from: 'z-south', to: 'n-loop', surface: 'footpath' },
    { from: 'n-loop', to: 'n-bridge-west', surface: 'footpath' },
    {
      from: 'n-bridge-west',
      to: 'n-bridge-west-approach',
      surface: 'footpath',
    },
    {
      from: 'n-bridge-west-approach',
      to: 'n-bridge-east-approach',
      surface: 'bridge',
      bridge: true,
    },
    {
      from: 'n-bridge-east-approach',
      to: 'n-bridge-east',
      surface: 'footpath',
    },
    { from: 'n-bridge-east', to: 'n-bridge-exit', surface: 'footpath' },
    { from: 'n-bridge-exit', to: 'n-deck-west', surface: 'footpath' },
    { from: 'n-deck-west', to: 'n-deck-east', surface: 'park' },
    { from: 'n-deck-east', to: 'p-east', surface: 'footpath' },
    { from: 'p-east', to: 'p-high', surface: 'park' },
    { from: 'p-high', to: 'p-mid', surface: 'park' },
    { from: 'p-mid', to: 'p-south', surface: 'park' },
    { from: 'p-south', to: 'e-bank-south', surface: 'footpath' },
    { from: 'e-bank-mid', to: 'e-bridge-south', surface: 'footpath' },
    {
      from: 'e-bridge-south',
      to: 'w-bridge-south',
      surface: 'bridge',
      bridge: true,
    },
    { from: 'w-bridge-south', to: 'w-bank-mid', surface: 'footpath' },
    { from: 'w-bank-mid', to: 'w-bank-south', surface: 'footpath' },
    { from: 'w-bank-south', to: 'z-crossing', surface: 'footpath' },
    { from: 'z-crossing', to: 'z-pond-east', surface: 'street' },
    { from: 'z-pond-east', to: 'z-plaza', surface: 'street' },
    { from: 'w-bank-mid', to: 'w-bank-north', surface: 'footpath' },
    { from: 'w-bank-north', to: 'w-bridge-north', surface: 'footpath' },
    {
      from: 'w-bridge-north',
      to: 'e-bridge-north',
      surface: 'bridge',
      bridge: true,
    },
    { from: 'e-bridge-north', to: 'e-bank-north', surface: 'footpath' },
    { from: 'e-bank-north', to: 'e-bank-mid', surface: 'footpath' },
    { from: 'p-east', to: 'p-north', surface: 'park' },
    { from: 'p-north', to: 'p-north-end', surface: 'park' },
    { from: 'p-east', to: 'p-branch', surface: 'park' },
    { from: 'p-branch', to: 'p-branch-mid', surface: 'park' },
    { from: 'p-branch-mid', to: 'p-branch-end', surface: 'park' },
  ],
);

/* ------------------------------------------------------------------ */
/* World graph: district label nodes connected through the official    */
/* boundary gates. Sea gates become explicit ferry edges.              */
/* ------------------------------------------------------------------ */

type RawGate = { a: string; b: string; point: [number, number] };

function gateNodeId(a: string, b: string): string {
  return `gate:${[a, b].sort().join(':')}`;
}

function districtNodeId(name: string): string {
  return `district:${name}`;
}

function districtCentre(name: string): WorldPoint {
  const district = ADMIN_DISTRICT_BY_NAME.get(name);
  if (!district) throw new Error(`unknown district: ${name}`);
  return {
    x: (district.labelPoint[0] - 120.3) * 102.7,
    z: -(district.labelPoint[1] - 22.7) * 110.57,
  };
}

function districtIdForName(name: string): string | null {
  return ADMIN_DISTRICT_BY_NAME.get(name)?.id ?? null;
}

const SEA_GATE_PAIRS: Array<[string, string]> = [
  ['前鎮', '旗津'],
  ['小港', '旗津'],
  ['旗津', '鼓山'],
];
const SEA_GATE_KEYS = new Set(
  SEA_GATE_PAIRS.map(([a, b]) => [a, b].sort().join('|')),
);

function isSeaGate(gate: RawGate): boolean {
  // Qijin is only reachable by ferry; model that as an explicit transit edge
  // instead of inferring a walk across the harbour from simplified polygons.
  return SEA_GATE_KEYS.has([gate.a, gate.b].sort().join('|'));
}

function buildWorldGraph(): WalkGraph {
  const nodes: WalkNode[] = ADMIN_DISTRICTS.map((district) =>
    node(
      districtNodeId(district.shortName),
      district.name,
      districtCentre(district.shortName),
      'landmark',
      district.id,
    ),
  );
  const rawEdges: Array<{
    from: string;
    to: string;
    surface: WalkSurface;
    adminIds?: string[];
    bridge?: boolean;
    transit?: boolean;
  }> = [];
  for (const gate of GEOGRAPHY.gates as RawGate[]) {
    const gatePoint = {
      x: (gate.point[0] - 120.3) * 102.7,
      z: -(gate.point[1] - 22.7) * 110.57,
    };
    const id = gateNodeId(gate.a, gate.b);
    if (!nodes.some((item) => item.id === id)) {
      const aId = districtIdForName(gate.a);
      const bId = districtIdForName(gate.b);
      nodes.push(
        node(id, `${gate.a}・${gate.b} 交界`, gatePoint, 'gate', aId ?? bId),
      );
    }
    const ferry = isSeaGate(gate);
    rawEdges.push({
      from: districtNodeId(gate.a),
      to: id,
      surface: ferry ? 'ferry' : 'schematic',
      adminIds: [districtIdForName(gate.a), districtIdForName(gate.b)].filter(
        (value): value is string => Boolean(value),
      ),
      transit: ferry,
    });
    rawEdges.push({
      from: id,
      to: districtNodeId(gate.b),
      surface: ferry ? 'ferry' : 'schematic',
      adminIds: [districtIdForName(gate.a), districtIdForName(gate.b)].filter(
        (value): value is string => Boolean(value),
      ),
      transit: ferry,
    });
  }
  return makeGraph(
    'world-district-connectivity',
    '三十八區行政區連通圖（幹道與渡輪）',
    nodes,
    rawEdges,
  );
}

export const WORLD_WALK_GRAPH = buildWorldGraph();

/* ------------------------------------------------------------------ */
/* Deterministic shortest path                                         */
/* ------------------------------------------------------------------ */

export function shortestWalkPath(
  graph: WalkGraph,
  startId: string,
  goalId: string,
): string[] {
  if (!graph.nodeById.has(startId) || !graph.nodeById.has(goalId)) return [];
  if (startId === goalId) return [startId];
  const distances = new Map<string, number>();
  const previous = new Map<string, string>();
  const visited = new Set<string>();
  for (const item of graph.nodes)
    distances.set(item.id, Number.POSITIVE_INFINITY);
  distances.set(startId, 0);
  while (visited.size < graph.nodes.length) {
    let current: string | null = null;
    let best = Number.POSITIVE_INFINITY;
    for (const item of graph.nodes) {
      if (visited.has(item.id)) continue;
      const value = distances.get(item.id) ?? Number.POSITIVE_INFINITY;
      if (value < best) {
        best = value;
        current = item.id;
      }
    }
    if (!current || best === Number.POSITIVE_INFINITY) break;
    if (current === goalId) break;
    visited.add(current);
    for (const edge of graph.edgesFrom.get(current) ?? []) {
      const next = edge.from === current ? edge.to : edge.from;
      if (visited.has(next)) continue;
      const candidate = best + edge.lengthKm;
      if (candidate < (distances.get(next) ?? Number.POSITIVE_INFINITY)) {
        distances.set(next, candidate);
        previous.set(next, current);
      }
    }
  }
  if (!previous.has(goalId) && startId !== goalId) return [];
  const path = [goalId];
  let cursor = goalId;
  while (cursor !== startId) {
    const before = previous.get(cursor);
    if (!before) return [];
    path.unshift(before);
    cursor = before;
  }
  return path;
}

export function edgeBetween(
  graph: WalkGraph,
  a: string,
  b: string,
): WalkEdge | undefined {
  return (graph.edgesFrom.get(a) ?? []).find(
    (edge) =>
      (edge.from === a && edge.to === b) || (edge.from === b && edge.to === a),
  );
}

export function gateBetween(a: string, b: string): string {
  const found = (GEOGRAPHY.gates as RawGate[]).find(
    (gate) => (gate.a === a && gate.b === b) || (gate.a === b && gate.b === a),
  );
  if (!found) throw new Error(`no official gate between ${a} and ${b}`);
  return gateNodeId(found.a, found.b);
}

/** Build a node path that follows named districts through their official
 * gates, in order. Repeated names create an out-and-back path. */
export function worldNodePathForNames(names: string[]): string[] {
  if (names.length < 2) return names.map(districtNodeId);
  const path: string[] = [districtNodeId(names[0] ?? '')];
  for (let index = 1; index < names.length; index += 1) {
    const fromName = names[index - 1];
    const toName = names[index];
    if (!fromName || !toName) continue;
    const gate = gateBetween(fromName, toName);
    path.push(gate, districtNodeId(toName));
  }
  return path;
}

export function districtNameForNodeId(id: string): string | null {
  if (!id.startsWith('district:')) return null;
  return id.slice('district:'.length);
}

export function districtIdForNodeId(id: string): string | null {
  const name = districtNameForNodeId(id);
  return name ? districtIdForName(name) : null;
}

export function adminIdsForGateNode(id: string): string[] {
  if (!id.startsWith('gate:')) return [];
  return id
    .slice('gate:'.length)
    .split(':')
    .map((name) => districtIdForName(name))
    .filter((value): value is string => Boolean(value));
}

/** Converts a sampled world point to a district check. Bridge and ferry
 * edges are allowed to leave the district polygon; all other edges are not. */
export function sampleAllowed(
  graph: WalkGraph,
  edge: WalkEdge,
  point: WorldPoint,
  allowedAdminIds: string[],
): boolean {
  if (edge.transit) return true;
  const districtId = districtIdAtWorldTolerant(point, 0.04);
  if (!districtId) return edge.bridge;
  if (!allowedAdminIds.includes(districtId)) return false;
  if (graph.id === HERO_WALK_GRAPH.id && !edge.bridge) {
    const local = worldToHeroLocal(point);
    if (heroObstacleAt(local) === 'water') return false;
  }
  return true;
}

export const WALK_GRAPH_META = {
  heroNodeCount: HERO_WALK_GRAPH.nodes.length,
  heroEdgeCount: HERO_WALK_GRAPH.edges.length,
  worldNodeCount: WORLD_WALK_GRAPH.nodes.length,
  worldEdgeCount: WORLD_WALK_GRAPH.edges.length,
  note: '步行網路只覆蓋已驗證的左營・楠梓局部路徑；其他行政區僅有幹道／示意圈。',
};

/** Approximate one local hero unit in kilometres, exported for tests that
 * need to convert bridge spans without importing the whole layout module. */
export const HERO_UNIT_KM = HERO_KM_PER_UNIT;

export function districtExists(name: string): boolean {
  return (
    ADMIN_DISTRICT_BY_NAME.has(name) &&
    Boolean(ADMIN_DISTRICT_BY_ID.get(districtIdForName(name) ?? ''))
  );
}
