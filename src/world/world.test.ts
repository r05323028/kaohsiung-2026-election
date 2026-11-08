import { beforeEach, describe, expect, it } from 'vitest';
import { candidateProfiles, isDemoProfile } from '../data';
import {
  constituencyNumberForSlug,
  electoralDistrictSlugForAdminName,
  movementScopeForCandidate,
  movementScopeForDistrictSlug,
} from './constituencies';
import {
  districtGeometryStats,
  geometryAreaKm2,
  triangulateRings,
  worldDistrictFocus,
} from './district-geometry';
import {
  ADMIN_DISTRICT_BY_NAME,
  ADMIN_DISTRICTS,
  districtAtWorld,
  focusForAdminDistrict,
  focusForWorldOverview,
  pointInWorldDistrict,
  WORLD_ADJACENCY,
  WORLD_ADMIN_DISTRICTS,
} from './geography';
import {
  HERO_ORIGIN,
  heroFocusToWorld,
  heroVisibleForFocus,
  worldToHeroLocal,
} from './hero';
import {
  COUNCIL_04_ROUTE,
  MAYORAL_ROUTE,
  routeAudit,
  routeForCandidate,
  sampleRoute,
} from './navigation';
import { distanceKm, lonLatToWorld, worldToLonLat } from './projection';
import {
  advanceSimulationSeconds,
  canActorEnterDistrict,
  followActor,
  getActor,
  getActors,
  resetSimulation,
  selectActor,
  simulationStats,
  spawnPlan,
} from './simulation';
import {
  HERO_WALK_GRAPH,
  heroObstacleAt,
  shortestWalkPath,
  WORLD_WALK_GRAPH,
} from './walk-graph';

beforeEach(() => {
  resetSimulation();
});

describe('Kaohsiung projection', () => {
  it('maps the origin and round-trips a point', () => {
    const origin = lonLatToWorld(120.3, 22.7);
    expect(origin.x).toBe(0);
    expect(origin.z).toBeCloseTo(0, 8);
    const point = lonLatToWorld(120.352, 22.641);
    const back = worldToLonLat(point.x, point.z);
    expect(back[0]).toBeCloseTo(120.352, 5);
    expect(back[1]).toBeCloseTo(22.641, 5);
  });

  it('measures kilometre distances', () => {
    const a = lonLatToWorld(120.3, 22.7);
    const b = lonLatToWorld(120.4, 22.7);
    expect(distanceKm(a, b)).toBeGreaterThan(9);
    expect(distanceKm(a, b)).toBeLessThan(12);
  });
});

describe('administrative geography', () => {
  it('contains all 38 Kaohsiung districts', () => {
    expect(ADMIN_DISTRICTS).toHaveLength(38);
    expect(new Set(ADMIN_DISTRICTS.map((district) => district.id)).size).toBe(
      38,
    );
    expect(ADMIN_DISTRICTS.some((district) => district.name === '左營區')).toBe(
      true,
    );
    expect(ADMIN_DISTRICTS.some((district) => district.name === '楠梓區')).toBe(
      true,
    );
  });

  it('has a symmetric, connected adjacency graph', () => {
    for (const district of ADMIN_DISTRICTS) {
      const neighbours = WORLD_ADJACENCY[district.shortName] ?? [];
      expect(neighbours.length).toBeGreaterThan(0);
      for (const neighbour of neighbours) {
        expect(WORLD_ADJACENCY[neighbour]).toContain(district.shortName);
      }
    }
    expect(WORLD_ADJACENCY.左營).toContain('楠梓');
    expect(WORLD_ADJACENCY.楠梓).toContain('左營');
  });

  it('keeps internal label points and citywide bounds usable', () => {
    const zuoying = ADMIN_DISTRICT_BY_NAME.get('左營');
    const nanzih = ADMIN_DISTRICT_BY_NAME.get('楠梓');
    expect(zuoying).toBeDefined();
    expect(nanzih).toBeDefined();
    if (!zuoying || !nanzih) return;
    const point = lonLatToWorld(zuoying.labelPoint[0], zuoying.labelPoint[1]);
    expect(districtAtWorld(point)?.name).toBe('左營區');
    const focus = focusForAdminDistrict(zuoying);
    expect(focus.radius).toBeGreaterThan(1);
    const maxX = Math.max(
      ...WORLD_ADMIN_DISTRICTS.map((district) => district.worldBbox.maxX),
    );
    expect(maxX).toBeGreaterThan(50);
    expect(focusForWorldOverview().radius).toBeGreaterThan(40);
  });

  it('keeps Qijin remote islands out of the main city bounds', () => {
    const qijin = ADMIN_DISTRICT_BY_NAME.get('旗津');
    expect(qijin).toBeDefined();
    if (!qijin) return;
    expect(qijin.remoteCount).toBe(16);
  });
});

describe('electoral and administrative domains', () => {
  it('maps council district 4 to Zuoying and Nanzih only', () => {
    const scope = movementScopeForDistrictSlug('kaohsiung-council-04');
    expect(scope.kind).toBe('council');
    expect(scope.allowedAdminNames).toEqual(
      expect.arrayContaining(['左營', '楠梓']),
    );
    expect(scope.allowedAdminNames).toHaveLength(2);
  });

  it('allows mayoral candidates across all 38 districts', () => {
    const scope = movementScopeForDistrictSlug('kaohsiung-mayor-2026');
    expect(scope.kind).toBe('mayoral');
    expect(scope.allowedAdminNames).toHaveLength(38);
  });

  it('models indigenous identity separately from geography', () => {
    const scope = movementScopeForDistrictSlug('kaohsiung-indigenous-flat-12');
    expect(scope.kind).toBe('indigenous');
    expect(scope.allowedAdminNames).toHaveLength(38);
    expect(scope.eligibilityNote).toContain('身分');
  });

  it('resolves candidate roles and electoral district names', () => {
    expect(constituencyNumberForSlug('kaohsiung-council-04')).toBe(4);
    expect(electoralDistrictSlugForAdminName('左營')).toBe(
      'kaohsiung-council-04',
    );
    expect(electoralDistrictSlugForAdminName('楠梓')).toBe(
      'kaohsiung-council-04',
    );
    expect(electoralDistrictSlugForAdminName('鳳山')).toBe(
      'kaohsiung-council-09',
    );
    const mayor = candidateProfiles.find(
      (candidate) => candidate.candidacy.slug === 'kaohsiung-mayor-2026',
    );
    expect(mayor).toBeUndefined();
  });

  it('derives a movement scope from a real candidate', () => {
    const candidate = candidateProfiles.find(
      (profile) =>
        profile.candidacy.slug.startsWith('kaohsiung-council-04-') === true,
    );
    expect(candidate).toBeDefined();
    if (!candidate) return;
    const scope = movementScopeForCandidate(candidate);
    expect(scope.kind).toBe('council');
    expect(scope.allowedAdminNames).toEqual(
      expect.arrayContaining(['左營', '楠梓']),
    );
  });
});

describe('walkable navigation graph', () => {
  it('builds a connected hero graph from paths, streets and bridges', () => {
    expect(HERO_WALK_GRAPH.valid).toBe(true);
    expect(HERO_WALK_GRAPH.nodes.length).toBeGreaterThanOrEqual(30);
    expect(HERO_WALK_GRAPH.edges.length).toBeGreaterThanOrEqual(30);
    for (const edge of HERO_WALK_GRAPH.edges) {
      expect(HERO_WALK_GRAPH.nodeById.has(edge.from)).toBe(true);
      expect(HERO_WALK_GRAPH.nodeById.has(edge.to)).toBe(true);
      expect(edge.lengthKm).toBeGreaterThan(0);
      if (edge.bridge) continue;
      const from = HERO_WALK_GRAPH.nodeById.get(edge.from);
      const to = HERO_WALK_GRAPH.nodeById.get(edge.to);
      if (!from || !to) continue;
      for (let index = 0; index <= 12; index += 1) {
        const t = index / 12;
        const point = {
          x: from.point.x + (to.point.x - from.point.x) * t,
          z: from.point.z + (to.point.z - from.point.z) * t,
        };
        expect(heroObstacleAt(worldToHeroLocal(point))).not.toBe('water');
      }
    }
    const path = shortestWalkPath(HERO_WALK_GRAPH, 'z-plaza', 'p-south');
    expect(path.length).toBeGreaterThan(12);
    expect(path[0]).toBe('z-plaza');
    expect(path.at(-1)).toBe('p-south');
  });

  it('models Qijin sea links as explicit ferry transitions', () => {
    expect(WORLD_WALK_GRAPH.valid).toBe(true);
    const ferries = WORLD_WALK_GRAPH.edges.filter(
      (edge) => edge.surface === 'ferry',
    );
    expect(ferries.length).toBeGreaterThan(0);
    expect(ferries.every((edge) => edge.transit)).toBe(true);
  });

  it('connects every district through official boundary gates', () => {
    for (const district of WORLD_WALK_GRAPH.nodes.filter((node) =>
      node.id.startsWith('district:'),
    )) {
      if (district.id === 'district:左營') continue;
      const path = shortestWalkPath(
        WORLD_WALK_GRAPH,
        district.id,
        'district:左營',
      );
      expect(path.length).toBeGreaterThan(1);
    }
  });
});

describe('world routes', () => {
  it('keeps the council-04 route inside its two permitted districts', () => {
    expect(COUNCIL_04_ROUTE.valid).toBe(true);
    expect(COUNCIL_04_ROUTE.validation).toBe('graph');
    expect(COUNCIL_04_ROUTE.traversable).toBe(true);
    expect(COUNCIL_04_ROUTE.lengthKm).toBeGreaterThan(1);
    expect([...COUNCIL_04_ROUTE.districtIds].sort()).toEqual(
      ['E03', 'E04'].sort(),
    );
    expect(COUNCIL_04_ROUTE.allowedAdminIds).toHaveLength(2);
    expect(COUNCIL_04_ROUTE.edgeIds.length).toBeGreaterThan(20);
    for (let index = 0; index <= 120; index += 1) {
      const point = sampleRoute(
        COUNCIL_04_ROUTE,
        (COUNCIL_04_ROUTE.lengthKm * index) / 120,
      );
      expect(['左營區', '楠梓區']).toContain(districtAtWorld(point)?.name);
      expect(COUNCIL_04_ROUTE.warnings.join(' ')).not.toContain('水');
    }
  });

  it('keeps the mayoral route across multiple districts', () => {
    expect(MAYORAL_ROUTE.valid).toBe(true);
    expect(MAYORAL_ROUTE.validation).toBe('graph');
    expect(MAYORAL_ROUTE.traversable).toBe(true);
    expect(MAYORAL_ROUTE.districtIds).toEqual(
      expect.arrayContaining(['E03', 'E04', 'E20', 'E19']),
    );
    expect(MAYORAL_ROUTE.allowedAdminIds).toHaveLength(38);
    expect(MAYORAL_ROUTE.edgeIds.length).toBeGreaterThan(5);
    for (let index = 0; index <= 80; index += 1) {
      const point = sampleRoute(
        MAYORAL_ROUTE,
        (MAYORAL_ROUTE.lengthKm * index) / 80,
      );
      expect(districtAtWorld(point)).not.toBeNull();
    }
  });

  it('rejects routes that cross a non-permitted district', () => {
    const fuoshan = ADMIN_DISTRICT_BY_NAME.get('鳳山');
    const zuoying = ADMIN_DISTRICT_BY_NAME.get('左營');
    expect(fuoshan).toBeDefined();
    expect(zuoying).toBeDefined();
    if (!fuoshan || !zuoying) return;
    const scope = movementScopeForDistrictSlug('kaohsiung-council-04');
    const councilCandidate = candidateProfiles.find(
      (profile) =>
        profile.candidacy.slug.startsWith('kaohsiung-council-04-') === true,
    );
    if (!councilCandidate) throw new Error('missing council-04 candidate');
    const route = routeForCandidate(councilCandidate);
    expect([...route.allowedAdminIds].sort()).toEqual(
      [...scope.allowedAdminIds].sort(),
    );
  });

  it('audits every candidate route without invalid geography', () => {
    const audit = routeAudit();
    expect(audit.length).toBeGreaterThan(0);
    expect(audit.every((item) => item.valid)).toBe(true);
  });
});

describe('persistent candidate simulation', () => {
  it('creates one stable actor for every real candidate and excludes demos', () => {
    const actors = getActors();
    const official = candidateProfiles.filter(
      (candidate) => !candidate.person.isDemo,
    );
    expect(official).toHaveLength(106);
    expect(actors).toHaveLength(official.length);
    expect(actors.some((actor) => actor.role === 'demo')).toBe(false);
    expect(new Set(actors.map((actor) => actor.slug)).size).toBe(actors.length);
    expect(new Set(actors.map((actor) => actor.id)).size).toBe(actors.length);
    const demoSlugs = candidateProfiles
      .filter((candidate) => isDemoProfile(candidate))
      .map((candidate) => candidate.candidacy.slug);
    expect(actors.some((actor) => demoSlugs.includes(actor.slug))).toBe(false);
    for (const actor of actors) {
      expect(actor.simulated).toBe(true);
      expect(actor.note).toContain('模擬');
      expect(actor.routeValid).toBe(true);
      expect(actor.speedKmPerSec).toBeGreaterThan(0.001);
      expect(actor.speedKmPerSec).toBeLessThan(0.003);
    }
  });

  it('spawns council-04 actors at distinct verified walk nodes', () => {
    const council04 = getActors().filter(
      (actor) => actor.electoralDistrictSlug === 'kaohsiung-council-04',
    );
    expect(council04).toHaveLength(12);
    const nodes = council04.map((actor) => actor.currentNodeId);
    expect(new Set(nodes).size).toBe(council04.length);
    const spawns = spawnPlan().filter((item) => item.pathMode === 'graph');
    expect(new Set(spawns.map((item) => item.slug)).size).toBe(spawns.length);
    expect(
      spawns.every(
        (item) =>
          item.spawnAdminId === null ||
          item.allowedAdminIds.includes(item.spawnAdminId),
      ),
    ).toBe(true);
  });

  it('keeps every council actor inside its authorized constituency', () => {
    advanceSimulationSeconds(900);
    for (const actor of getActors()) {
      if (actor.role !== 'council' || !actor.currentAdminId) continue;
      expect(actor.allowedAdminIds).toContain(actor.currentAdminId);
    }
    const stats = simulationStats();
    expect(stats.blockedTransitions).toBe(0);
  });

  it('lets council-04 actors cross Zuoying and Nanzih but nowhere else', () => {
    const seen = new Set<string>();
    for (let second = 0; second < 1800; second += 30) {
      advanceSimulationSeconds(30);
      for (const actor of getActors()) {
        if (actor.electoralDistrictSlug === 'kaohsiung-council-04') {
          if (actor.currentAdminName) seen.add(actor.currentAdminName);
          expect(actor.currentAdminId).toMatch(/^E0[34]$/);
        }
      }
    }
    expect(seen).toEqual(new Set(['左營區', '楠梓區']));
  });

  it('checks council-04 movement at every simulated second', () => {
    resetSimulation();
    for (let second = 0; second < 300; second += 1) {
      advanceSimulationSeconds(1);
      for (const actor of getActors()) {
        if (actor.electoralDistrictSlug !== 'kaohsiung-council-04') continue;
        expect(actor.currentAdminId).toMatch(/^E0[34]$/);
      }
    }
    expect(simulationStats().blockedTransitions).toBe(0);
  });

  it('denies unauthorized districts at the movement boundary', () => {
    const council = getActors().find(
      (actor) => actor.electoralDistrictSlug === 'kaohsiung-council-04',
    );
    const mayor = getActors().find((actor) => actor.role === 'mayor');
    if (!council || !mayor) throw new Error('missing simulation actors');
    expect(canActorEnterDistrict(council, 'E03')).toBe(true);
    expect(canActorEnterDistrict(council, 'E04')).toBe(true);
    expect(canActorEnterDistrict(council, 'E05')).toBe(false);
    expect(canActorEnterDistrict(council, 'E17')).toBe(false);
    for (const district of ADMIN_DISTRICTS) {
      expect(canActorEnterDistrict(mayor, district.id)).toBe(true);
    }
  });

  it('lets mayoral actors travel across several districts', () => {
    const seen = new Set<string>();
    advanceSimulationSeconds(900);
    for (const actor of getActors()) {
      if (actor.role === 'mayor' && actor.currentAdminName) {
        seen.add(actor.currentAdminName);
      }
    }
    expect(seen.size).toBeGreaterThanOrEqual(2);
  });

  it('keeps route actors moving when their direction is reversed', () => {
    const actor = getActors().find(
      (item) => item.pathMode === 'route' && item.role === 'mayor',
    );
    if (!actor) throw new Error('missing mayoral route actor');
    actor.direction = -1;
    actor.behavior = 'walking';
    actor.state = 'walking';
    actor.behaviorTimer = 0;
    actor.walkedSincePause = 0;
    actor.nextPauseKm = 10;
    const before = actor.progressKm;
    advanceSimulationSeconds(5);
    expect(Math.abs(actor.progressKm - before)).toBeGreaterThan(0.001);
  });

  it('alternates walking, pausing, observing and turning', () => {
    const behaviors = new Set<string>();
    for (let second = 0; second < 300; second += 10) {
      advanceSimulationSeconds(10);
      for (const actor of getActors()) behaviors.add(actor.behavior);
    }
    expect(behaviors.has('walking')).toBe(true);
    expect(
      ['pausing', 'observing', 'turning', 'arriving'].some((behavior) =>
        behaviors.has(behavior),
      ),
    ).toBe(true);
    const stats = simulationStats();
    expect(stats.actors).toBe(106);
    expect(stats.invalidRoutes).toBe(0);
    expect(stats.idle + stats.walking).toBe(stats.actors);
    expect(stats.populatedDistricts).toBeGreaterThanOrEqual(31);
    expect(stats.populatedDistricts).toBeLessThanOrEqual(38);
    expect(stats.demoActors).toBe(0);
  });

  it('keeps actor state when selection and follow change', () => {
    advanceSimulationSeconds(90);
    const actor = getActors().find(
      (item) => item.electoralDistrictSlug === 'kaohsiung-council-04',
    );
    if (!actor) throw new Error('missing council-04 actor');
    const before = { ...actor.position };
    const count = getActors().length;
    selectActor(actor.slug);
    followActor(actor.slug);
    expect(getActor(actor.slug)).toBe(actor);
    expect(getActors()).toHaveLength(count);
    advanceSimulationSeconds(15);
    expect(getActor(actor.slug)).toBe(actor);
    expect(actor.position).not.toEqual(before);
    selectActor(null);
    followActor(null);
    expect(actor.followingUser).toBe(false);
    expect(getActor(actor.slug)?.slug).toBe(actor.slug);
  });

  it('is deterministic after reset', () => {
    advanceSimulationSeconds(120);
    const before = getActors().map((actor) => ({
      slug: actor.slug,
      x: actor.position.x,
      z: actor.position.z,
    }));
    resetSimulation();
    advanceSimulationSeconds(120);
    const after = getActors().map((actor) => ({
      slug: actor.slug,
      x: actor.position.x,
      z: actor.position.z,
    }));
    expect(after).toEqual(before);
  });
});

describe('hero streaming transform', () => {
  it('only enables the dense hero near Zuoying', () => {
    expect(heroVisibleForFocus(6.4)).toBe(true);
    expect(heroVisibleForFocus(8)).toBe(false);
    expect(HERO_ORIGIN.x).toBeLessThan(1);
    const focus = heroFocusToWorld({
      target: [0, 0.4, 0],
      offset: [4, 6, 4],
      radius: 1.8,
    });
    expect(focus.radius).toBeGreaterThan(0.3);
    expect(focus.radius).toBeLessThan(0.4);
  });
});

describe('authoritative district geometry', () => {
  it('triangulates all 38 official footprints without substituting bboxes', () => {
    expect(WORLD_ADMIN_DISTRICTS).toHaveLength(38);
    for (const district of WORLD_ADMIN_DISTRICTS) {
      const stats = districtGeometryStats(district);
      expect(stats.valid, district.name).toBe(true);
      expect(stats.ringCount, district.name).toBe(
        district.worldPolygons.length,
      );
      expect(stats.triangleCount, district.name).toBeGreaterThan(0);
      expect(stats.areaKm2, district.name).toBeCloseTo(district.areaKm2, 0);
      expect(stats.areaKm2 / district.areaKm2, district.name).toBeGreaterThan(
        0.97,
      );
      expect(stats.areaKm2 / district.areaKm2, district.name).toBeLessThan(
        1.03,
      );
      expect(stats.bboxAreaKm2 / stats.areaKm2, district.name).toBeGreaterThan(
        1.5,
      );
    }
  });

  it('keeps every district focus target inside the authoritative polygon', () => {
    for (const district of WORLD_ADMIN_DISTRICTS) {
      const focus = worldDistrictFocus(district);
      const target = { x: focus.target[0], z: focus.target[2] };
      expect(pointInWorldDistrict(target, district), district.name).toBe(true);
      expect(focus.radius, district.name).toBeGreaterThan(0);
    }
    const taoyuan = WORLD_ADMIN_DISTRICTS.find(
      (district) => district.name === '桃源區',
    );
    expect(taoyuan?.worldPolygons).toHaveLength(2);
    const qijin = WORLD_ADMIN_DISTRICTS.find(
      (district) => district.name === '旗津區',
    );
    expect(qijin?.remoteCount).toBe(16);
  });

  it('supports holes and multi-ring shapes', () => {
    const outer = [
      { x: 0, z: 0 },
      { x: 2, z: 0 },
      { x: 2, z: 2 },
      { x: 0, z: 2 },
    ];
    const hole = [
      { x: 0.5, z: 0.5 },
      { x: 1.5, z: 0.5 },
      { x: 1.5, z: 1.5 },
      { x: 0.5, z: 1.5 },
    ];
    const plain = triangulateRings(outer);
    const holed = triangulateRings(outer, [hole]);
    expect(plain).not.toBeNull();
    expect(holed).not.toBeNull();
    if (!plain || !holed) throw new Error('triangulateRings returned null');
    expect(geometryAreaKm2(plain)).toBeCloseTo(4, 8);
    expect(geometryAreaKm2(holed)).toBeCloseTo(3, 8);
  });
});
