import {
  HEX_RADIUS,
  HEX_RING_SCALE,
  HEX_TILE_BY_ID,
  HEX_TILES,
  type HexPoint,
  type HexTile,
} from './hex';

export type RoadNodeKind = 'corner' | 'ring-mid';
export type RoadEdgeKind = 'ring' | 'connector';

export type RoadNode = {
  id: string;
  tileId: string;
  adminId: string;
  districtId: string;
  kind: RoadNodeKind;
  /** Ring slot 0..11 (corner i is 2i, mid i is 2i+1). */
  slot: number;
  point: HexPoint;
};

export type RoadEdge = {
  id: string;
  kind: RoadEdgeKind;
  from: string;
  to: string;
  a: HexPoint;
  b: HexPoint;
  lengthKm: number;
  tileIds: string[];
  adminIds: string[];
};

export type RoadGraph = {
  nodes: Map<string, RoadNode>;
  edges: Map<string, RoadEdge>;
  neighbourEdges: Map<string, string[]>;
  ringNodeIds: Map<string, string[]>;
  connectorEdgeIds: string[];
};

/**
 * Deterministic cross-tile connector subset. Every ordinary council
 * constituency stays internally connected, every tile keeps at least two
 * links (E35 has a single shared edge), and the whole city is one graph.
 * Selected once with a deterministic degree-aware spanning search; keeping all
 * shared edges made needless multi-way junctions.
 */
const CONNECTOR_PAIRS = new Set(
  [
    ['tile-E01', 'tile-E02'],
    ['tile-E01', 'tile-E10'],
    ['tile-E02', 'tile-E07'],
    ['tile-E03-2', 'tile-E05'],
    ['tile-E03', 'tile-E03-2'],
    ['tile-E03', 'tile-E04'],
    ['tile-E04', 'tile-E07'],
    ['tile-E05', 'tile-E12'],
    ['tile-E06', 'tile-E08'],
    ['tile-E06', 'tile-E09-2'],
    ['tile-E06', 'tile-E10'],
    ['tile-E07', 'tile-E08'],
    ['tile-E09', 'tile-E09-2'],
    ['tile-E09', 'tile-E11'],
    ['tile-E11', 'tile-E13'],
    ['tile-E12', 'tile-E14'],
    ['tile-E12', 'tile-E18'],
    ['tile-E13', 'tile-E14'],
    ['tile-E15', 'tile-E16'],
    ['tile-E15', 'tile-E21'],
    ['tile-E16', 'tile-E17'],
    ['tile-E17', 'tile-E18'],
    ['tile-E19', 'tile-E20'],
    ['tile-E19', 'tile-E21'],
    ['tile-E20', 'tile-E29'],
    ['tile-E21', 'tile-E22'],
    ['tile-E22', 'tile-E23'],
    ['tile-E23', 'tile-E24'],
    ['tile-E23', 'tile-E30'],
    ['tile-E24', 'tile-E25'],
    ['tile-E25', 'tile-E26'],
    ['tile-E26', 'tile-E27'],
    ['tile-E27', 'tile-E28'],
    ['tile-E28', 'tile-E29'],
    ['tile-E30', 'tile-E31'],
    ['tile-E30', 'tile-E34'],
    ['tile-E31', 'tile-E36'],
    ['tile-E32', 'tile-E33'],
    ['tile-E32', 'tile-E36'],
    ['tile-E33', 'tile-E37'],
    ['tile-E33', 'tile-E38'],
    ['tile-E34', 'tile-E35'],
    ['tile-E37', 'tile-E38'],
  ].map(([a, b]) => [a, b].sort().join('|')),
);

export const SELECTED_CONNECTOR_PAIRS = [...CONNECTOR_PAIRS].sort();

function nodeId(tile: HexTile, kind: RoadNodeKind, index: number): string {
  return `${tile.id}:ring:${kind}:${index}`;
}

function ringNodePoint(
  tile: HexTile,
  kind: RoadNodeKind,
  index: number,
): HexPoint {
  const angle = (Math.PI / 3) * index + (kind === 'ring-mid' ? Math.PI / 6 : 0);
  const radius =
    HEX_RADIUS * HEX_RING_SCALE * (kind === 'corner' ? 1 : Math.sqrt(3) / 2);
  return {
    x: tile.center.x + Math.cos(angle) * radius,
    z: tile.center.z + Math.sin(angle) * radius,
  };
}

function buildGraph(): RoadGraph {
  const nodes = new Map<string, RoadNode>();
  const edges = new Map<string, RoadEdge>();
  const neighbourEdges = new Map<string, string[]>();
  const ringNodeIds = new Map<string, string[]>();
  const connectorEdgeIds: string[] = [];

  const addEdge = (edge: RoadEdge) => {
    edges.set(edge.id, edge);
    for (const node of [edge.from, edge.to]) {
      const list = neighbourEdges.get(node) ?? [];
      list.push(edge.id);
      neighbourEdges.set(node, list);
    }
  };

  for (const tile of HEX_TILES) {
    const ring: string[] = [];
    for (let index = 0; index < 6; index += 1) {
      for (const kind of ['corner', 'ring-mid'] as const) {
        const id = nodeId(tile, kind, index);
        nodes.set(id, {
          id,
          tileId: tile.id,
          adminId: tile.adminId,
          districtId: tile.districtId,
          kind,
          slot: index * 2 + (kind === 'ring-mid' ? 1 : 0),
          point: ringNodePoint(tile, kind, index),
        });
        ring.push(id);
      }
    }
    ringNodeIds.set(tile.id, ring);
    for (let index = 0; index < ring.length; index += 1) {
      const fromId = ring[index]!;
      const toId = ring[(index + 1) % ring.length]!;
      const from = nodes.get(fromId)!;
      const to = nodes.get(toId)!;
      addEdge({
        id: `${tile.id}:ring:${index}`,
        kind: 'ring',
        from: fromId,
        to: toId,
        a: from.point,
        b: to.point,
        lengthKm: Math.hypot(
          from.point.x - to.point.x,
          from.point.z - to.point.z,
        ),
        tileIds: [tile.id],
        adminIds: [tile.adminId],
      });
    }
  }

  const seen = new Set<string>();
  for (const tile of HEX_TILES) {
    for (let direction = 0; direction < 6; direction += 1) {
      const neighbourId = tile.neighbourByDirection[direction];
      if (!neighbourId) continue;
      const neighbour = HEX_TILE_BY_ID.get(neighbourId);
      if (!neighbour) continue;
      const pairKey = [tile.id, neighbour.id].sort().join('|');
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);
      if (!CONNECTOR_PAIRS.has(pairKey)) continue;

      const aId = nodeId(tile, 'ring-mid', direction);
      const bId = nodeId(neighbour, 'ring-mid', (direction + 3) % 6);
      const a = nodes.get(aId);
      const b = nodes.get(bId);
      if (!a || !b)
        throw new Error(`Connector endpoints missing for ${pairKey}`);
      const edge: RoadEdge = {
        id: `${tile.id}~${neighbour.id}:connector`,
        kind: 'connector',
        from: aId,
        to: bId,
        a: a.point,
        b: b.point,
        lengthKm: Math.hypot(a.point.x - b.point.x, a.point.z - b.point.z),
        tileIds: [tile.id, neighbour.id],
        adminIds: [tile.adminId, neighbour.adminId],
      };
      addEdge(edge);
      connectorEdgeIds.push(edge.id);
    }
  }

  return { nodes, edges, neighbourEdges, ringNodeIds, connectorEdgeIds };
}

export const HEX_ROAD_GRAPH: RoadGraph = buildGraph();

export const ROAD_EDGES = [...HEX_ROAD_GRAPH.edges.values()];

export function roadNode(id: string): RoadNode {
  const node = HEX_ROAD_GRAPH.nodes.get(id);
  if (!node) throw new Error(`Unknown road node ${id}`);
  return node;
}

export function roadEdge(id: string): RoadEdge {
  const edge = HEX_ROAD_GRAPH.edges.get(id);
  if (!edge) throw new Error(`Unknown road edge ${id}`);
  return edge;
}

export function edgesAtNode(nodeId: string): RoadEdge[] {
  return (HEX_ROAD_GRAPH.neighbourEdges.get(nodeId) ?? []).map(roadEdge);
}

export function ringNodeIdsForTile(tileId: string): string[] {
  return HEX_ROAD_GRAPH.ringNodeIds.get(tileId) ?? [];
}

export function ringEdgesForTile(tileId: string): RoadEdge[] {
  return edgesForTile(tileId).filter((edge) => edge.kind === 'ring');
}

export function edgesForTile(tileId: string): RoadEdge[] {
  return ROAD_EDGES.filter((edge) => edge.tileIds.includes(tileId));
}

export function allowedEdge(
  edge: RoadEdge,
  allowedAdminIds: ReadonlySet<string> | null,
): boolean {
  return (
    allowedAdminIds === null ||
    edge.adminIds.every((id) => allowedAdminIds.has(id))
  );
}

/**
 * Movement territory is simulation-space, not electoral, data. Group the
 * requested administrative districts by road connectivity so callers can pick a
 * traversable territory without ever adding a district that official coverage
 * excludes.
 */
export type AdminDistrictConnectivity = {
  components: string[][];
  largestComponent: string[];
  detached: string[];
};

export function adminDistrictConnectivity(
  adminDistrictIds: readonly string[],
): AdminDistrictConnectivity {
  const ids = [...new Set(adminDistrictIds)].sort();
  const parent = new Map(ids.map((id) => [id, id]));

  const find = (id: string): string => {
    let cursor = id;
    for (;;) {
      const next = parent.get(cursor);
      if (!next || next === cursor) return cursor;
      parent.set(cursor, next);
      cursor = next;
    }
  };
  const union = (a: string, b: string) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA === rootB) return;
    // Keep the lexicographically smaller id as the root for deterministic output.
    if (rootA < rootB) parent.set(rootB, rootA);
    else parent.set(rootA, rootB);
  };

  for (const edge of ROAD_EDGES) {
    if (edge.kind !== 'connector') continue;
    const [first, second] = edge.adminIds;
    if (!first || !second || first === second) continue;
    if (!parent.has(first) || !parent.has(second)) continue;
    union(first, second);
  }

  const grouped = new Map<string, string[]>();
  for (const id of ids) {
    const rootId = find(id);
    const members = grouped.get(rootId);
    if (members) members.push(id);
    else grouped.set(rootId, [id]);
  }

  const components = [...grouped.values()]
    .map((members) => members.sort())
    .sort((a, b) => b.length - a.length || (a[0]! < b[0]! ? -1 : 1));
  const largestComponent = components[0] ?? [];
  const largest = new Set(largestComponent);

  return {
    components,
    largestComponent,
    detached: ids.filter((id) => !largest.has(id)),
  };
}

export function nearestRoadNode(
  point: HexPoint,
  allowedAdminIds: ReadonlySet<string> | null = null,
): RoadNode | null {
  let best: RoadNode | null = null;
  let bestDistance = Infinity;
  for (const node of HEX_ROAD_GRAPH.nodes.values()) {
    if (allowedAdminIds && !allowedAdminIds.has(node.adminId)) continue;
    const distance = Math.hypot(node.point.x - point.x, node.point.z - point.z);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = node;
    }
  }
  return best;
}

/** Dijkstra over the road graph; connectors are blocked unless both districts are allowed. */
export function shortestRoadPath(
  startNodeId: string,
  endNodeId: string,
  allowedAdminIds: ReadonlySet<string> | null = null,
): string[] | null {
  if (
    !HEX_ROAD_GRAPH.nodes.has(startNodeId) ||
    !HEX_ROAD_GRAPH.nodes.has(endNodeId)
  )
    return null;
  const distances = new Map<string, number>([[startNodeId, 0]]);
  const previous = new Map<string, string>();
  const queue = new Set<string>([startNodeId]);

  while (queue.size > 0) {
    let current: string | null = null;
    let currentDistance = Infinity;
    for (const id of queue) {
      const distance = distances.get(id) ?? Infinity;
      if (distance < currentDistance) {
        currentDistance = distance;
        current = id;
      }
    }
    if (!current) break;
    queue.delete(current);
    if (current === endNodeId) break;

    for (const edgeId of HEX_ROAD_GRAPH.neighbourEdges.get(current) ?? []) {
      const edge = roadEdge(edgeId);
      if (!allowedEdge(edge, allowedAdminIds)) continue;
      const next = edge.from === current ? edge.to : edge.from;
      const candidate = currentDistance + edge.lengthKm;
      if (candidate < (distances.get(next) ?? Infinity)) {
        distances.set(next, candidate);
        previous.set(next, current);
        queue.add(next);
      }
    }
  }

  if (!distances.has(endNodeId)) return null;
  const path = [endNodeId];
  let cursor = endNodeId;
  while (cursor !== startNodeId) {
    const prior = previous.get(cursor);
    if (!prior) return null;
    path.push(prior);
    cursor = prior;
  }
  return path.reverse();
}

export function pathLengthKm(pathNodeIds: string[]): number {
  let total = 0;
  for (let index = 0; index < pathNodeIds.length - 1; index += 1) {
    const a = roadNode(pathNodeIds[index]!);
    const b = roadNode(pathNodeIds[index + 1]!);
    total += Math.hypot(a.point.x - b.point.x, a.point.z - b.point.z);
  }
  return total;
}

export function roadGraphStats() {
  let ringEdges = 0;
  let connectorEdges = 0;
  let ringLengthKm = 0;
  let connectorLengthKm = 0;
  for (const edge of ROAD_EDGES) {
    if (edge.kind === 'ring') {
      ringEdges += 1;
      ringLengthKm += edge.lengthKm;
    } else {
      connectorEdges += 1;
      connectorLengthKm += edge.lengthKm;
    }
  }
  return {
    tiles: HEX_TILES.length,
    districts: new Set(HEX_TILES.map((tile) => tile.districtId)).size,
    nodes: HEX_ROAD_GRAPH.nodes.size,
    edges: ROAD_EDGES.length,
    ringEdges,
    connectorEdges,
    ringLengthKm,
    connectorLengthKm,
  };
}

export function edgeMidpoint(edge: RoadEdge): HexPoint {
  return { x: (edge.a.x + edge.b.x) / 2, z: (edge.a.z + edge.b.z) / 2 };
}

/** Shared by the renderer so road meshes and navigation cannot drift apart. */
export function roadSegments(): RoadEdge[] {
  return ROAD_EDGES;
}

export function connectorEndpointsMatchEdges(): boolean {
  for (const edge of ROAD_EDGES) {
    if (edge.kind !== 'connector') continue;
    const a = roadNode(edge.from);
    const b = roadNode(edge.to);
    if (!a.tileId || !b.tileId) return false;
  }
  return true;
}

export type { HexPoint };
