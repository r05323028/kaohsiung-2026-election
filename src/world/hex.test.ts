import { beforeEach, describe, expect, it } from 'vitest';
import { candidateProfiles } from '../data';
import { COUNCIL_CONSTITUENCIES } from '../data/constituencies';
import { movementScopeForCandidate } from './constituencies';
import { ADMIN_DISTRICTS } from './geography';
import { HERO_LANDMARK_SPECS } from './hero-landmarks';
import type { HexPoint } from './hex';
import {
  HEX_CENTER_RADIUS,
  HEX_DIRECTIONS,
  HEX_PLAZA_RADIUS,
  HEX_RING_APOTHEM,
  HEX_ROAD_WIDTH,
  HEX_TILE_BY_DISTRICT,
  HEX_TILES,
  HEX_TILES_BY_DISTRICT,
  isNeighbour,
  sharedEdgeMidpoint,
} from './hex';
import {
  DEDICATED_LANDMARK_FEATURES,
  dedicatedLandmarks,
  HEX_LANDMARKS,
  LANDMARKS_BY_TILE,
  landmarkWorldPosition,
} from './hex-landmarks';
import {
  adminDistrictConnectivity,
  allowedEdge,
  connectorEndpointsMatchEdges,
  edgesAtNode,
  edgesForTile,
  HEX_ROAD_GRAPH,
  nearestRoadNode,
  pathLengthKm,
  ROAD_EDGES,
  ringNodeIdsForTile,
  roadEdge,
  roadGraphStats,
  roadNode,
  roadSegments,
  shortestRoadPath,
} from './road-graph';
import {
  actorIsOnRoad,
  advanceSimulationSeconds,
  getActors,
  resetSimulation,
  SIMULATION_META,
  spawnPlan,
} from './simulation';

beforeEach(() => {
  resetSimulation();
});

function axialKey(q: number, r: number): string {
  return q + ',' + r;
}

function distanceToSegment(point: HexPoint, a: HexPoint, b: HexPoint): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared === 0) return Math.hypot(point.x - a.x, point.z - a.z);
  const t = Math.max(
    0,
    Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / lengthSquared),
  );
  return Math.hypot(point.x - (a.x + dx * t), point.z - (a.z + dz * t));
}

function connectedRingCount(
  startId: string,
  filter: (tileId: string) => boolean,
): number {
  const seen = new Set<string>([startId]);
  const queue = [startId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edgeId of HEX_ROAD_GRAPH.neighbourEdges.get(current) ?? []) {
      const edge = roadEdge(edgeId);
      if (edge.kind !== 'ring' || !filter(edge.tileIds[0] ?? '')) continue;
      const next = edge.from === current ? edge.to : edge.from;
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen.size;
}

describe('hexagonal administrative world', () => {
  it('represents all 38 official districts with valid non-overlapping tiles', () => {
    expect(HEX_TILES).toHaveLength(40);
    expect(ADMIN_DISTRICTS).toHaveLength(38);
    expect(new Set(HEX_TILES.map((tile) => tile.districtId)).size).toBe(38);
    expect(HEX_TILE_BY_DISTRICT.size).toBe(38);
    expect([...HEX_TILE_BY_DISTRICT.keys()].sort()).toEqual(
      ADMIN_DISTRICTS.map((district) => district.id).sort(),
    );
    expect(
      HEX_TILES.filter((tile) => tile.districtTileIndex === 0),
    ).toHaveLength(38);
    for (const district of ADMIN_DISTRICTS) {
      const tiles = HEX_TILES_BY_DISTRICT.get(district.id) ?? [];
      expect(tiles.length, district.name).toBeGreaterThanOrEqual(1);
      expect(tiles.length, district.name).toBeLessThanOrEqual(2);
      expect(tiles[0]!.id).toBe(HEX_TILE_BY_DISTRICT.get(district.id)!.id);
    }
    expect(HEX_TILES_BY_DISTRICT.get('E03')).toHaveLength(2);
    expect(HEX_TILES_BY_DISTRICT.get('E09')).toHaveLength(2);
    const occupancy = new Map<string, string>();
    for (const tile of HEX_TILES) {
      expect(tile.districtId).toBe(tile.adminId);
      expect(tile.district.name.length).toBeGreaterThan(0);
      expect(tile.landmarkIds.length).toBeGreaterThanOrEqual(1);
      expect(tile.landmarkIds.length).toBeLessThanOrEqual(2);
      const key = axialKey(tile.q, tile.r);
      expect(occupancy.has(key)).toBe(false);
      occupancy.set(key, tile.id);
    }
  });

  it('keeps every tile graph and every district tile set connected', () => {
    for (const tile of HEX_TILES) {
      for (
        let direction = 0;
        direction < HEX_DIRECTIONS.length;
        direction += 1
      ) {
        const neighbourId = tile.neighbourByDirection[direction];
        const compactNeighbour = tile.neighbourIds.includes(neighbourId ?? '');
        if (!neighbourId) continue;
        expect(compactNeighbour).toBe(true);
        const neighbour = HEX_TILES.find((item) => item.id === neighbourId)!;
        expect(isNeighbour(tile, neighbour)).toBe(true);
        expect(neighbour.neighbourByDirection[(direction + 3) % 6]).toBe(
          tile.id,
        );
      }
    }
    const seen = new Set<string>([HEX_TILES[0]!.id]);
    const queue = [HEX_TILES[0]!];
    while (queue.length > 0) {
      const tile = queue.shift()!;
      for (const neighbourId of tile.neighbourIds) {
        if (seen.has(neighbourId)) continue;
        seen.add(neighbourId);
        queue.push(HEX_TILES.find((item) => item.id === neighbourId)!);
      }
    }
    expect(seen.size).toBe(40);
    for (const district of ADMIN_DISTRICTS) {
      const tiles = HEX_TILES_BY_DISTRICT.get(district.id)!;
      const allowed = new Set(tiles.map((tile) => tile.id));
      const districtSeen = new Set<string>([tiles[0]!.id]);
      const districtQueue = [tiles[0]!];
      while (districtQueue.length > 0) {
        const tile = districtQueue.shift()!;
        for (const neighbourId of tile.neighbourIds) {
          if (!allowed.has(neighbourId) || districtSeen.has(neighbourId))
            continue;
          districtSeen.add(neighbourId);
          districtQueue.push(
            HEX_TILES.find((item) => item.id === neighbourId)!,
          );
        }
      }
      expect(districtSeen.size, district.name).toBe(tiles.length);
    }
  });

  it('reserves roughly two thirds of the ring interior for the landmark plaza', () => {
    const innerRingApothem = HEX_RING_APOTHEM - HEX_ROAD_WIDTH / 2;
    const innerArea = 2 * Math.sqrt(3) * innerRingApothem ** 2;
    const plazaRatio = (Math.PI * HEX_PLAZA_RADIUS ** 2) / innerArea;
    expect(plazaRatio).toBeGreaterThanOrEqual(0.6);
    expect(plazaRatio).toBeLessThanOrEqual(0.7);
  });

  it('places 1-2 decorative landmarks inside every tile centre', () => {
    expect(HEX_LANDMARKS).toHaveLength(78);
    const ids = new Set<string>();
    for (const tile of HEX_TILES) {
      const landmarks = LANDMARKS_BY_TILE.get(tile.id) ?? [];
      expect(landmarks.length).toBeGreaterThanOrEqual(1);
      expect(landmarks.length).toBeLessThanOrEqual(2);
      for (const landmark of landmarks) {
        expect(ids.has(landmark.id)).toBe(false);
        ids.add(landmark.id);
        expect(landmark.districtId).toBe(tile.districtId);
        expect(landmark.label.length).toBeGreaterThan(0);
        const point = landmarkWorldPosition(landmark);
        expect(
          Math.hypot(point.x - tile.center.x, point.z - tile.center.z),
        ).toBeLessThan(HEX_CENTER_RADIUS);
      }
    }
  });

  it('assigns all seven dedicated landmark compositions to their districts', () => {
    const dedicated = dedicatedLandmarks();
    expect(dedicated).toHaveLength(7);
    expect(new Set(dedicated.map((landmark) => landmark.feature))).toEqual(
      new Set(DEDICATED_LANDMARK_FEATURES),
    );
    const expected = new Map([
      ['hsrStation', 'E03'],
      ['worldGamesStadium', 'E03'],
      ['lotusPagodas', 'E03'],
      ['weiwuying', 'E12'],
      ['pier2', 'E01'],
      ['dreamMallFerris', 'E09'],
      ['skyTower85', 'E08'],
    ]);
    for (const landmark of dedicated) {
      expect(landmark.districtId).toBe(expected.get(landmark.feature!));
    }
    expect(
      dedicated
        .filter((landmark) => landmark.districtId === 'E03')
        .map((landmark) => landmark.feature)
        .sort(),
    ).toEqual(['hsrStation', 'lotusPagodas', 'worldGamesStadium']);

    const specs = new Map(
      HERO_LANDMARK_SPECS.map((spec) => [spec.feature, spec]),
    );
    expect(specs.size).toBe(7);
    for (const landmark of dedicated) {
      const spec = specs.get(landmark.feature!);
      expect(spec).toBeDefined();
      expect(spec?.districtId).toBe(landmark.districtId);
      expect(spec?.tileId).toBe(landmark.tileId);
      expect(spec?.height).toBeGreaterThan(0);
      expect(spec?.footprintRadius).toBeLessThanOrEqual(HEX_CENTER_RADIUS);
    }
  });
});

describe('shared road graph', () => {
  it('builds a closed 12-node ring road for every tile', () => {
    expect(HEX_ROAD_GRAPH.nodes.size).toBe(40 * 12);
    for (const tile of HEX_TILES) {
      const ringNodeIds = ringNodeIdsForTile(tile.id);
      expect(ringNodeIds).toHaveLength(12);
      for (const nodeId of ringNodeIds) {
        const edgeIds = edgesAtNode(nodeId).filter(
          (edge) => edge.kind === 'ring' && edge.tileIds[0] === tile.id,
        );
        expect(edgeIds).toHaveLength(2);
      }
      expect(
        connectedRingCount(ringNodeIds[0]!, (tileId) => tileId === tile.id),
      ).toBe(12);
    }
  });

  it('keeps every road segment outside the protected landmark core', () => {
    for (const tile of HEX_TILES) {
      for (const edge of edgesForTile(tile.id)) {
        expect(
          distanceToSegment(tile.center, edge.a, edge.b),
          `${tile.id} ${edge.id}`,
        ).toBeGreaterThan(HEX_CENTER_RADIUS);
      }
    }
  });

  it('joins selected neighbours with aligned two-to-four connectors per tile', () => {
    const neighborPairs = new Set<string>();
    for (const tile of HEX_TILES) {
      for (const neighbourId of tile.neighbourIds) {
        neighborPairs.add([tile.id, neighbourId].sort().join('|'));
      }
    }
    const connectors = ROAD_EDGES.filter((edge) => edge.kind === 'connector');
    expect(connectors).toHaveLength(43);
    expect(connectorEndpointsMatchEdges()).toBe(true);
    for (const edge of connectors) {
      expect(
        neighborPairs.has([...edge.tileIds].sort().join('|')),
        edge.id,
      ).toBe(true);
      const a = roadNode(edge.from);
      const b = roadNode(edge.to);
      const tileA = HEX_TILES.find((tile) => tile.id === edge.tileIds[0])!;
      const tileB = HEX_TILES.find((tile) => tile.id === edge.tileIds[1])!;
      const direction = tileA.neighbourByDirection.findIndex(
        (id) => id === tileB.id,
      );
      expect(direction, edge.id).toBeGreaterThanOrEqual(0);
      expect(a.kind).toBe('ring-mid');
      expect(b.kind).toBe('ring-mid');
      expect(a.slot, edge.id).toBe(direction * 2 + 1);
      expect(b.slot, edge.id).toBe(((direction + 3) % 6) * 2 + 1);
      const midpoint = sharedEdgeMidpoint(tileA, tileB);
      expect((a.point.x + b.point.x) / 2).toBeCloseTo(midpoint.x, 6);
      expect((a.point.z + b.point.z) / 2).toBeCloseTo(midpoint.z, 6);
      expect(edge.lengthKm).toBeGreaterThan(0);
    }
    for (const tile of HEX_TILES) {
      const count = edgesForTile(tile.id).filter(
        (edge) => edge.kind === 'connector',
      ).length;
      if (tile.neighbourIds.length === 1) expect(count, tile.id).toBe(1);
      else expect(count, tile.id).toBeGreaterThanOrEqual(2);
      expect(count, tile.id).toBeLessThanOrEqual(4);
    }
  });

  it('matches rendered road geometry to the navigational graph', () => {
    expect(roadSegments()).toBe(ROAD_EDGES);
    for (const edge of ROAD_EDGES) {
      const from = roadNode(edge.from);
      const to = roadNode(edge.to);
      expect(edge.a.x).toBeCloseTo(from.point.x, 9);
      expect(edge.a.z).toBeCloseTo(from.point.z, 9);
      expect(edge.b.x).toBeCloseTo(to.point.x, 9);
      expect(edge.b.z).toBeCloseTo(to.point.z, 9);
      expect(edge.lengthKm).toBeCloseTo(
        Math.hypot(from.point.x - to.point.x, from.point.z - to.point.z),
        9,
      );
    }
    expect(roadGraphStats()).toMatchObject({
      tiles: 40,
      districts: 38,
      nodes: 480,
      edges: 523,
      ringEdges: 480,
      connectorEdges: 43,
    });
  });

  it('connects every road node, district tile and ordinary constituency', () => {
    const start = ringNodeIdsForTile(HEX_TILES[0]!.id)[0]!;
    let visited = 0;
    for (const nodeId of HEX_ROAD_GRAPH.nodes.keys()) {
      if (shortestRoadPath(start, nodeId) !== null) visited += 1;
    }
    expect(visited).toBe(HEX_ROAD_GRAPH.nodes.size);
    for (const district of ADMIN_DISTRICTS) {
      for (const tile of HEX_TILES_BY_DISTRICT.get(district.id)!) {
        const destination = ringNodeIdsForTile(tile.id)[0]!;
        expect(shortestRoadPath(start, destination), tile.id).not.toBeNull();
      }
    }
    expect(pathLengthKm(shortestRoadPath(start, start)!)).toBe(0);

    const groups = new Map<string, Set<string>>();
    for (const actor of getActors().filter((item) => item.role === 'council')) {
      const allowed = new Set(actor.allowedAdminIds);
      groups.set([...allowed].sort().join(','), allowed);
    }
    expect(groups.size).toBeGreaterThan(0);
    for (const allowed of groups.values()) {
      const firstTile = HEX_TILES.find((tile) => allowed.has(tile.adminId))!;
      const firstNode = ringNodeIdsForTile(firstTile.id)[0]!;
      for (const tile of HEX_TILES.filter((item) =>
        allowed.has(item.adminId),
      )) {
        expect(
          shortestRoadPath(firstNode, ringNodeIdsForTile(tile.id)[0]!, allowed),
          tile.id,
        ).not.toBeNull();
      }
    }
  });
});

describe('candidate road movement and territory', () => {
  it('spawns every official candidate directly on a road centerline', () => {
    const actors = getActors();
    const official = candidateProfiles.filter(
      (candidate) => !candidate.candidacy.isDemo,
    );
    expect(actors).toHaveLength(official.length);
    expect(spawnPlan()).toHaveLength(official.length);
    expect(actors.some((actor) => actor.role === 'demo')).toBe(false);
    for (const actor of actors) {
      expect(actor.routeValid).toBe(true);
      expect(actor.pathMode).toBe('graph');
      expect(actorIsOnRoad(actor)).toBe(true);
      expect(actor.currentAdminId).not.toBeNull();
      expect(actor.allowedAdminIds).toContain(actor.currentAdminId);
      expect(HEX_TILE_BY_DISTRICT.has(actor.currentAdminId!)).toBe(true);
      const edge = roadEdge(actor.edgeId);
      expect(
        edge.tileIds.some(
          (tileId) =>
            HEX_TILES.find((tile) => tile.id === tileId)?.adminId ===
            actor.currentAdminId,
        ),
      ).toBe(true);
    }
    expect(SIMULATION_META.actorCount()).toBe(official.length);
  });

  it('lets candidates pass through each other without blocking or reversal', () => {
    const mayors = getActors().filter((actor) => actor.role === 'mayor');
    expect(mayors.length).toBeGreaterThanOrEqual(2);
    const first = mayors[0]!;
    const second = mayors[1]!;
    const edge = ROAD_EDGES.find(
      (item) =>
        item.kind === 'ring' &&
        item.tileIds.some((tileId) => {
          const tile = HEX_TILES.find((candidate) => candidate.id === tileId)!;
          return (
            first.allowedAdminIds.includes(tile.adminId) &&
            second.allowedAdminIds.includes(tile.adminId)
          );
        }),
    )!;
    const tile = HEX_TILES.find((item) => item.id === edge.tileIds[0])!;

    const place = (
      actor: (typeof mayors)[number],
      reverse: boolean,
      progress: number,
    ) => {
      const from = reverse ? edge.b : edge.a;
      const to = reverse ? edge.a : edge.b;
      actor.edgeId = edge.id;
      actor.fromNodeId = reverse ? edge.to : edge.from;
      actor.destination = { x: to.x, z: to.z };
      actor.pathNodeIds = [actor.fromNodeId, reverse ? edge.from : edge.to];
      actor.edgeProgress = progress;
      actor.position = {
        x: from.x + (to.x - from.x) * progress,
        z: from.z + (to.z - from.z) * progress,
      };
      actor.currentAdminId = tile.adminId;
      actor.walkPhase = 0;
      actor.walkedSincePause = 0;
      actor.nextPauseKm = 100;
      actor.state = 'walking';
      actor.behavior = 'walking';
      actor.pauseRemaining = 0;
    };
    place(first, false, 0.5);
    place(second, true, 0.5);
    expect(
      Math.hypot(
        first.position.x - second.position.x,
        first.position.z - second.position.z,
      ),
    ).toBeCloseTo(0, 9);
    const firstStart = { ...first.position };
    const secondStart = { ...second.position };
    const edgeX = edge.b.x - edge.a.x;
    const edgeZ = edge.b.z - edge.a.z;

    advanceSimulationSeconds(0.25);

    // Both kept their own direction and speed; neither waited or reversed.
    const firstTravel =
      (first.position.x - firstStart.x) * edgeX +
      (first.position.z - firstStart.z) * edgeZ;
    const secondTravel =
      (second.position.x - secondStart.x) * edgeX +
      (second.position.z - secondStart.z) * edgeZ;
    expect(firstTravel).toBeGreaterThan(0);
    expect(secondTravel).toBeLessThan(0);
    expect(firstTravel).toBeCloseTo(-secondTravel, 6);
    expect(first.state).toBe('walking');
    expect(second.state).toBe('walking');
    expect(first.walkPhase).toBeGreaterThan(0);
    expect(second.walkPhase).toBeGreaterThan(0);
    expect(actorIsOnRoad(first)).toBe(true);
    expect(actorIsOnRoad(second)).toBe(true);
    const separation = Math.hypot(
      first.position.x - second.position.x,
      first.position.z - second.position.z,
    );
    expect(separation).toBeGreaterThan(0.05);
    expect(separation).toBeLessThan(0.2);
    resetSimulation();
  });

  it('allows multiple candidates to occupy the same road node', () => {
    const mayors = getActors().filter((actor) => actor.role === 'mayor');
    expect(mayors.length).toBeGreaterThanOrEqual(2);
    const first = mayors[0]!;
    const second = mayors[1]!;
    const edge = ROAD_EDGES.find(
      (item) =>
        item.kind === 'ring' &&
        item.tileIds.some((tileId) => {
          const tile = HEX_TILES.find((candidate) => candidate.id === tileId)!;
          return (
            first.allowedAdminIds.includes(tile.adminId) &&
            second.allowedAdminIds.includes(tile.adminId)
          );
        }),
    )!;
    const tile = HEX_TILES.find((item) => item.id === edge.tileIds[0])!;

    for (const actor of [first, second]) {
      actor.edgeId = edge.id;
      actor.fromNodeId = edge.from;
      actor.destination = { x: edge.b.x, z: edge.b.z };
      actor.pathNodeIds = [edge.from, edge.to];
      actor.edgeProgress = 0;
      actor.position = { x: edge.a.x, z: edge.a.z };
      actor.currentAdminId = tile.adminId;
      actor.walkPhase = 0;
      actor.walkedSincePause = 0;
      actor.nextPauseKm = 100;
      actor.state = 'walking';
      actor.behavior = 'walking';
      actor.pauseRemaining = 0;
    }

    expect(
      Math.hypot(
        first.position.x - second.position.x,
        first.position.z - second.position.z,
      ),
    ).toBeCloseTo(0, 9);

    advanceSimulationSeconds(0.25);

    expect(first.state).toBe('walking');
    expect(second.state).toBe('walking');
    expect(actorIsOnRoad(first)).toBe(true);
    expect(actorIsOnRoad(second)).toBe(true);
    expect(first.position.x).toBeCloseTo(second.position.x, 6);
    expect(first.position.z).toBeCloseTo(second.position.z, 6);
    expect(first.walkPhase).toBeGreaterThan(0);
    expect(second.walkPhase).toBeGreaterThan(0);
    resetSimulation();
  });

  it('stays on the graph and outside landmark cores for a long deterministic walk', () => {
    advanceSimulationSeconds(300);
    const first = getActors().map((actor) => ({ ...actor.position }));
    for (const actor of getActors()) {
      expect(actorIsOnRoad(actor)).toBe(true);
      expect(actor.allowedAdminIds).toContain(actor.currentAdminId);
      expect(actor.edgeId.length).toBeGreaterThan(0);
      const edge = roadEdge(actor.edgeId);
      expect(allowedEdge(edge, new Set(actor.allowedAdminIds))).toBe(true);
      for (const tileId of edge.tileIds) {
        const tile = HEX_TILES.find((item) => item.id === tileId)!;
        expect(
          distanceToSegment(tile.center, edge.a, edge.b),
          `${actor.slug} ${edge.id}`,
        ).toBeGreaterThan(HEX_CENTER_RADIUS);
      }
    }
    resetSimulation();
    advanceSimulationSeconds(300);
    const second = getActors().map((actor) => ({ ...actor.position }));
    expect(second).toEqual(first);
  });

  it('lets mayoral candidates reach every district tile', () => {
    const mayors = getActors().filter((actor) => actor.role === 'mayor');
    expect(mayors.length).toBeGreaterThan(0);
    for (const mayor of mayors) {
      expect(mayor.allowedAdminIds).toHaveLength(38);
      const start = nearestRoadNode(
        mayor.position,
        new Set(mayor.allowedAdminIds),
      )!;
      for (const tile of HEX_TILES) {
        const path = shortestRoadPath(
          start.id,
          ringNodeIdsForTile(tile.id)[0]!,
          new Set(mayor.allowedAdminIds),
        );
        expect(path, tile.id).not.toBeNull();
      }
    }
  });

  it('keeps council candidates inside their official constituency only', () => {
    const council = getActors().filter((actor) => actor.role === 'council');
    expect(council.length).toBeGreaterThan(0);
    for (const actor of council) {
      const allowed = new Set(actor.allowedAdminIds);
      expect(allowed.size).toBeGreaterThan(0);
      expect(allowed.size).toBeLessThan(38);
      const start = nearestRoadNode(actor.position, allowed)!;
      for (const tile of HEX_TILES) {
        const path = shortestRoadPath(
          start.id,
          ringNodeIdsForTile(tile.id)[0]!,
          allowed,
        );
        if (allowed.has(tile.adminId)) expect(path, tile.id).not.toBeNull();
        else expect(path, tile.id).toBeNull();
      }
    }
    for (let elapsed = 0; elapsed < 600; elapsed += 30) {
      advanceSimulationSeconds(30);
      for (const actor of getActors().filter(
        (item) => item.role === 'council',
      )) {
        expect(actor.allowedAdminIds).toContain(actor.currentAdminId);
        const edge = roadEdge(actor.edgeId);
        expect(allowedEdge(edge, new Set(actor.allowedAdminIds))).toBe(true);
        expect(actorIsOnRoad(actor)).toBe(true);
      }
    }
  });

  it('derives indigenous movement from canonical coverage and road connectivity', () => {
    const indigenousProfiles = candidateProfiles.filter(
      (candidate) =>
        !candidate.candidacy.isDemo &&
        movementScopeForCandidate(candidate).kind === 'indigenous',
    );
    expect(indigenousProfiles.length).toBeGreaterThan(0);

    for (const candidate of indigenousProfiles) {
      const scope = movementScopeForCandidate(candidate);
      const coverage = COUNCIL_CONSTITUENCIES.find(
        (item) => item.slug === candidate.district.slug,
      )!;
      expect(coverage).toBeDefined();
      expect(scope.eligibilityNote?.length ?? 0).toBeGreaterThan(0);
      const actor = getActors().find(
        (item) => item.slug === candidate.candidacy.slug,
      )!;
      expect(actor.role).toBe('indigenous');
      expect(new Set(actor.allowedAdminIds)).toEqual(
        new Set(scope.allowedAdminIds),
      );

      const allowed = new Set(actor.allowedAdminIds);
      if (coverage.kind === 'plains-indigenous') {
        // Constituency 12 is the documented citywide Plains Indigenous seat.
        expect(scope.allowedAdminIds).toHaveLength(38);
        expect(scope.label).toContain('全市');
      } else {
        // Constituencies 13-15 are eligibility lists, not one contiguous
        // geography: movement uses the largest connected component only.
        const connectivity = adminDistrictConnectivity(
          coverage.adminDistrictIds,
        );
        expect(scope.allowedAdminIds).toEqual(connectivity.largestComponent);
        expect(scope.allowedAdminIds.length).toBeLessThan(38);
        expect(scope.label).toContain('區移動範圍');
        for (const detachedId of connectivity.detached) {
          expect(allowed.has(detachedId)).toBe(false);
          expect(coverage.adminDistrictIds).toContain(detachedId);
        }
      }

      const start = nearestRoadNode(actor.position, allowed)!;
      for (const tile of HEX_TILES) {
        const path = shortestRoadPath(
          start.id,
          ringNodeIdsForTile(tile.id)[0]!,
          allowed,
        );
        if (allowed.has(tile.adminId)) expect(path, tile.id).not.toBeNull();
        else expect(path, tile.id).toBeNull();
      }

      advanceSimulationSeconds(300);
      expect(actor.allowedAdminIds).toContain(actor.currentAdminId);
      expect(
        allowedEdge(roadEdge(actor.edgeId), new Set(actor.allowedAdminIds)),
      ).toBe(true);
      expect(actorIsOnRoad(actor)).toBe(true);
    }
  });
});
