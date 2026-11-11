import { type CandidateProfile, candidateProfiles } from '../data';
import { candidateRole, movementScopeForCandidate } from './constituencies';
import { ADMIN_DISTRICT_BY_ID, type DistrictRecord } from './geography';
import { HEX_TILES_BY_DISTRICT, type HexPoint } from './hex';
import { distanceKm, type WorldPoint } from './projection';
import {
  type ActorRenderPose,
  type ActorRenderTransition,
  type InterpolatedActorPose,
  interpolateActorPose,
} from './render-interpolation';
import {
  allowedEdge,
  edgesAtNode,
  edgesForTile,
  HEX_ROAD_GRAPH,
  type RoadEdge,
  type RoadGraph,
  roadNode,
} from './road-graph';

export type ActorRole = 'mayor' | 'council' | 'indigenous' | 'demo';
export type ActorState = 'walking' | 'idle';
export type ActorBehavior =
  | 'idle'
  | 'choosing'
  | 'walking'
  | 'turning'
  | 'arriving'
  | 'pausing'
  | 'observing'
  | 'transitioning'
  | 'following';
export type ActorPathMode = 'graph' | 'route';

export type WorldActor = {
  id: string;
  slug: string;
  candidateId: string;
  displayName: string;
  shortName: string;
  role: ActorRole;
  electoralDistrictSlug: string;
  allowedAdminIds: string[];
  allowedAdminNames: string[];
  routeId: string;
  routeLabel: string;
  routeValid: boolean;
  routeLengthKm: number;
  routeWarnings: string[];
  speedKmPerSec: number;
  progressKm: number;
  position: WorldPoint;
  destination: WorldPoint;
  currentAdminId: string | null;
  currentAdminName: string | null;
  state: ActorState;
  behavior: ActorBehavior;
  pathMode: ActorPathMode;
  graphId: string | null;
  currentNodeId: string | null;
  pathNodeIds: string[];
  pathIndex: number;
  heading: number;
  desiredHeading: number;
  behaviorTimer: number;
  walkPhase: number;
  walkedSincePause: number;
  nextPauseKm: number;
  direction: 1 | -1;
  followingUser: boolean;
  transitionTimer: number;
  districtTransitions: number;
  territoryRejections: number;
  spawnAdminId: string | null;
  spawnAdminName: string | null;
  rngState: number;
  simulated: true;
  note: string;
  /** Current navigable edge and progress along it (0..1). */
  edgeId: string;
  edgeProgress: number;
  fromNodeId: string;
  pauseRemaining: number;
};

type SimulationState = {
  actors: WorldActor[];
  selectedSlug: string | null;
  followSlug: string | null;
  elapsedSeconds: number;
  revision: number;
};

const TIME_SCALE = 3;
const SPEEDS: Record<ActorRole, number> = {
  mayor: 0.055,
  council: 0.045,
  indigenous: 0.05,
  demo: 0,
};
const BASE_TURN_RATE = 2.8;
/**
 * The simulation walks in fixed visual ticks. Rendering interpolates between
 * the poses on either side of each tick, so display refresh rate and walking
 * animation speed are independent of the simulation step.
 */
export const VISUAL_STEP_SECONDS = 1 / 60;
const FICTIONAL_NOTE = '此為虛構互動模擬，不代表真實所在地、行程或競選活動。';

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function nextRandom(actor: WorldActor): number {
  actor.rngState = (Math.imul(actor.rngState, 1664525) + 1013904223) >>> 0;
  return actor.rngState / 4294967296;
}

function normalizeAngle(value: number): number {
  let angle = value;
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function headingBetween(a: HexPoint, b: HexPoint): number {
  return Math.atan2(b.x - a.x, b.z - a.z);
}

function pointOnEdge(edge: RoadEdge, progress: number): WorldPoint {
  const t = Math.max(0, Math.min(1, progress));
  return {
    x: edge.a.x + (edge.b.x - edge.a.x) * t,
    z: edge.a.z + (edge.b.z - edge.a.z) * t,
  };
}

/** Interpolate from the node the actor entered to the node it is walking to. */
function pointOnActorEdge(
  actor: WorldActor,
  progress = actor.edgeProgress,
): WorldPoint {
  const start = actor.fromNodeId
    ? roadNode(actor.fromNodeId).point
    : { x: 0, z: 0 };
  const t = Math.max(0, Math.min(1, progress));
  return {
    x: start.x + (actor.destination.x - start.x) * t,
    z: start.z + (actor.destination.z - start.z) * t,
  };
}

function allowedSet(actor: WorldActor): Set<string> {
  return new Set(actor.allowedAdminIds);
}

function chooseAdminId(
  role: ActorRole,
  allowedAdminIds: string[],
  seed: number,
): string | null {
  if (allowedAdminIds.length === 0) return null;
  const pool =
    role === 'council'
      ? allowedAdminIds
      : allowedAdminIds.filter((id) => HEX_TILES_BY_DISTRICT.has(id));
  return pool[seed % pool.length] ?? allowedAdminIds[0] ?? null;
}

function ringEdgesFor(adminId: string): RoadEdge[] {
  return (HEX_TILES_BY_DISTRICT.get(adminId) ?? []).flatMap((tile) =>
    edgesForTile(tile.id).filter((edge) => edge.kind === 'ring'),
  );
}

function spawnActor(candidate: CandidateProfile, index: number): WorldActor {
  const scope = movementScopeForCandidate(candidate);
  const role = candidateRole(candidate);
  const allowedAdminIds = [...scope.allowedAdminIds];
  const seed = hashString(candidate.candidacy.slug);
  const adminId = chooseAdminId(role, allowedAdminIds, seed + index * 17);
  const district = adminId ? ADMIN_DISTRICT_BY_ID.get(adminId) : undefined;
  const edges = adminId ? ringEdgesFor(adminId) : [];
  const fallbackEdge = edges.length > 0 ? edges[seed % edges.length]! : null;
  const edge = fallbackEdge ?? {
    id: '',
    kind: 'ring' as const,
    from: '',
    to: '',
    a: { x: 0, z: 0 },
    b: { x: 0, z: 0 },
    lengthKm: 0,
    tileIds: [],
    adminIds: [],
  };
  const progress = ((seed >>> 8) % 1000) / 1000;
  const fromNode = edge.from ? roadNode(edge.from) : null;
  const toNode = edge.to ? roadNode(edge.to) : null;
  const position = pointOnEdge(edge, progress);
  const heading = headingBetween(edge.a, edge.b);

  return {
    id: candidate.candidacy.id,
    slug: candidate.candidacy.slug,
    candidateId: candidate.candidacy.id,
    displayName: candidate.person.displayName,
    shortName: candidate.person.shortName,
    role,
    electoralDistrictSlug: candidate.district.slug,
    allowedAdminIds,
    allowedAdminNames: [...scope.allowedAdminNames],
    routeId: 'hex-road-graph',
    routeLabel: district ? `${district.shortName}環路` : '高雄環路',
    routeValid: Boolean(edge.id),
    routeLengthKm: edges.reduce((sum, item) => sum + item.lengthKm, 0),
    routeWarnings: [],
    speedKmPerSec: SPEEDS[role],
    progressKm: 0,
    position,
    destination: toNode?.point ?? position,
    currentAdminId: district?.id ?? null,
    currentAdminName: district?.name ?? null,
    state: 'walking',
    behavior: 'walking',
    pathMode: 'graph',
    graphId: 'hex-road-graph',
    currentNodeId: fromNode?.id ?? null,
    pathNodeIds: edge.from && edge.to ? [edge.from, edge.to] : [],
    pathIndex: 0,
    heading,
    desiredHeading: heading,
    behaviorTimer: 0,
    walkPhase: (seed % 628) / 100,
    walkedSincePause: 0,
    nextPauseKm: 1.1 + ((seed >>> 12) % 240) / 100,
    direction: 1,
    followingUser: false,
    transitionTimer: 0,
    districtTransitions: 0,
    territoryRejections: 0,
    spawnAdminId: district?.id ?? null,
    spawnAdminName: district?.name ?? null,
    rngState: (seed ^ 0x9e3779b9) >>> 0,
    simulated: true,
    note: FICTIONAL_NOTE,
    edgeId: edge.id,
    edgeProgress: progress,
    fromNodeId: edge.from,
    pauseRemaining: 0,
  };
}

function buildState(): SimulationState {
  const actors = candidateProfiles
    .filter((candidate) => !candidate.candidacy.isDemo)
    .map((candidate, index) => spawnActor(candidate, index));
  return {
    actors,
    selectedSlug: null,
    followSlug: null,
    elapsedSeconds: 0,
    revision: 0,
  };
}

const state: SimulationState = buildState();
const renderTransitions = new Map<string, ActorRenderTransition>();
let renderAccumulator = 0;

function captureRenderPose(actor: WorldActor): ActorRenderPose {
  return {
    position: { x: actor.position.x, z: actor.position.z },
    heading: actor.heading,
    walkPhase: actor.walkPhase,
    walking: actor.state === 'walking',
    edgeId: actor.edgeId,
    fromNodeId: actor.fromNodeId,
    pathNodeIds: [...actor.pathNodeIds],
    destination: { x: actor.destination.x, z: actor.destination.z },
  };
}

function primeRenderState(): void {
  renderTransitions.clear();
  for (const actor of state.actors) {
    const pose = captureRenderPose(actor);
    renderTransitions.set(actor.slug, {
      from: pose,
      to: pose,
      at: state.elapsedSeconds,
    });
  }
  renderAccumulator = 0;
}

primeRenderState();

function currentEdge(actor: WorldActor): RoadEdge | null {
  return actor.edgeId ? (HEX_ROAD_GRAPH.edges.get(actor.edgeId) ?? null) : null;
}

function pickNextEdge(actor: WorldActor, arrivingAt: string): RoadEdge | null {
  const options = edgesAtNode(arrivingAt).filter((edge) => {
    if (edge.id === actor.edgeId) return false;
    return allowedEdge(edge, allowedSet(actor));
  });
  const pool =
    options.length > 0
      ? options
      : edgesAtNode(arrivingAt).filter((edge) =>
          allowedEdge(edge, allowedSet(actor)),
        );
  if (pool.length === 0) return null;
  const totalWeight = pool.reduce(
    (sum, edge) => sum + (edge.kind === 'connector' ? 2 : 5),
    0,
  );
  let roll = nextRandom(actor) * totalWeight;
  for (const edge of pool) {
    roll -= edge.kind === 'connector' ? 2 : 5;
    if (roll <= 0) return edge;
  }
  return pool[pool.length - 1] ?? null;
}

function beginEdge(
  actor: WorldActor,
  edge: RoadEdge,
  fromNodeId: string,
): void {
  const from = fromNodeId === edge.to ? edge.to : edge.from;
  const to = from === edge.from ? edge.to : edge.from;
  actor.edgeId = edge.id;
  actor.edgeProgress = 0;
  actor.fromNodeId = from;
  actor.pathNodeIds = [from, to];
  actor.pathIndex = 0;
  actor.destination = roadNode(to).point;
  actor.desiredHeading = headingBetween(
    roadNode(from).point,
    roadNode(to).point,
  );
}

function arrive(actor: WorldActor, nodeId: string): boolean {
  const node = roadNode(nodeId);
  actor.position = node.point;
  actor.currentNodeId = nodeId;
  actor.edgeProgress = 1;
  const priorAdminId = actor.currentAdminId;
  actor.currentAdminId = node.adminId;
  actor.currentAdminName = node.districtId
    ? (ADMIN_DISTRICT_BY_ID.get(node.districtId)?.name ?? null)
    : null;
  if (priorAdminId && priorAdminId !== node.adminId)
    actor.districtTransitions += 1;

  const traversedKm = currentEdge(actor)?.lengthKm ?? 0;
  actor.walkedSincePause += traversedKm;
  actor.nextPauseKm -= traversedKm;
  if (actor.nextPauseKm <= 0) {
    actor.nextPauseKm = 1.6 + nextRandom(actor) * 2.4;
    if (nextRandom(actor) < 0.35) {
      actor.state = 'idle';
      actor.behavior = 'pausing';
      actor.pauseRemaining = 1.2 + nextRandom(actor) * 2.2;
      return true;
    }
  }

  const next = pickNextEdge(actor, nodeId);
  if (!next) {
    actor.state = 'idle';
    actor.behavior = 'idle';
    return true;
  }
  const nextNodeId = next.from === nodeId ? next.to : next.from;
  const nextAdminId = roadNode(nextNodeId).adminId;
  if (!actor.allowedAdminIds.includes(nextAdminId)) {
    actor.territoryRejections += 1;
    actor.state = 'idle';
    actor.behavior = 'idle';
    return true;
  }
  actor.state = 'walking';
  actor.behavior = 'walking';
  beginEdge(actor, next, nodeId);
  return false;
}

function walk(actor: WorldActor, deltaSeconds: number): void {
  if (actor.state === 'idle') {
    actor.behaviorTimer += deltaSeconds;
    actor.pauseRemaining -= deltaSeconds;
    if (actor.pauseRemaining > 0) return;
    const nodeId = actor.currentNodeId;
    if (!nodeId) {
      actor.state = 'walking';
      actor.behavior = 'walking';
      return;
    }
    const next = pickNextEdge(actor, nodeId);
    if (!next) return;
    actor.state = 'walking';
    actor.behavior = 'walking';
    actor.behaviorTimer = 0;
    beginEdge(actor, next, nodeId);
    return;
  }

  let remaining = actor.speedKmPerSec * TIME_SCALE * deltaSeconds;
  if (remaining <= 0) return;
  let guard = 0;
  while (remaining > 0 && guard < 8) {
    guard += 1;
    const edge = currentEdge(actor);
    if (!edge) {
      const fallback = actor.currentNodeId
        ? pickNextEdge(actor, actor.currentNodeId)
        : null;
      if (!fallback || !actor.currentNodeId) return;
      beginEdge(actor, fallback, actor.currentNodeId);
      continue;
    }
    const remainingOnEdge = (1 - actor.edgeProgress) * edge.lengthKm;
    const step = Math.min(remaining, remainingOnEdge);
    const nextProgress =
      actor.edgeProgress + step / Math.max(edge.lengthKm, 0.0001);
    actor.edgeProgress = nextProgress;
    actor.progressKm += step;
    remaining -= step;
    actor.walkPhase += step * 3.4;
    actor.position = pointOnActorEdge(actor);
    actor.desiredHeading = headingBetween(
      actor.fromNodeId ? roadNode(actor.fromNodeId).point : edge.a,
      actor.destination,
    );
    const turnStep = BASE_TURN_RATE * deltaSeconds;
    actor.heading = normalizeAngle(
      actor.heading +
        Math.max(
          -turnStep,
          Math.min(
            turnStep,
            normalizeAngle(actor.desiredHeading - actor.heading),
          ),
        ),
    );
    if (actor.edgeProgress >= 0.9999) {
      const arrivalNodeId = actor.pathNodeIds[1] ?? edge.to;
      actor.edgeProgress = 1;
      const paused = arrive(actor, arrivalNodeId);
      if (paused) return;
    }
  }
}

export function advanceSimulation(deltaSeconds: number): void {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
  const clamped = Math.min(deltaSeconds, 1.5);
  for (const actor of state.actors) walk(actor, clamped);
  state.elapsedSeconds += clamped;
  state.revision += 1;
}

export function advanceSimulationSeconds(seconds: number): void {
  let remaining = Math.max(0, seconds);
  while (remaining > 0) {
    const step = Math.min(remaining, 0.25);
    advanceSimulation(step);
    remaining -= step;
  }
}

/**
 * Advance the authoritative graph simulation in fixed ticks and leave a
 * visual interpolation transition for the renderer. Returns the interpolation
 * alpha (0..1) within the most recent tick.
 *
 * Direct calls to advanceSimulation stay available for deterministic tests and
 * tools that do not render. This function is the only path used by the scene.
 */
export function advanceSimulationFrame(deltaSeconds: number): number {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
    return Math.max(0, Math.min(1, renderAccumulator / VISUAL_STEP_SECONDS));
  }
  renderAccumulator += Math.min(deltaSeconds, 1.5);
  let steps = 0;
  while (renderAccumulator >= VISUAL_STEP_SECONDS && steps < 12) {
    const previous = new Map<string, ActorRenderPose>();
    for (const actor of state.actors) {
      previous.set(
        actor.slug,
        renderTransitions.get(actor.slug)?.to ?? captureRenderPose(actor),
      );
    }
    advanceSimulation(VISUAL_STEP_SECONDS);
    for (const actor of state.actors) {
      renderTransitions.set(actor.slug, {
        from: previous.get(actor.slug)!,
        to: captureRenderPose(actor),
        at: state.elapsedSeconds,
      });
    }
    renderAccumulator -= VISUAL_STEP_SECONDS;
    steps += 1;
  }
  return Math.max(0, Math.min(1, renderAccumulator / VISUAL_STEP_SECONDS));
}

/** Purely visual pose, interpolated on the authoritative road segment. */
export function actorRenderPose(
  actor: WorldActor,
  alpha: number,
): InterpolatedActorPose {
  const transition = renderTransitions.get(actor.slug);
  if (!transition) {
    return {
      position: { x: actor.position.x, z: actor.position.z },
      heading: actor.heading,
      walkPhase: actor.walkPhase,
      walking: actor.state === 'walking',
    };
  }
  return interpolateActorPose(transition, alpha);
}

export function getSimulationSnapshot(): SimulationState {
  return state;
}

export function getActors(): WorldActor[] {
  return state.actors;
}

export function getActor(slug: string): WorldActor | undefined {
  return state.actors.find((actor) => actor.slug === slug);
}

export function selectActor(slug: string | null): void {
  state.selectedSlug = slug;
}

export function followActor(slug: string | null): void {
  state.followSlug = slug;
}

export function resetSimulation(): void {
  const next = buildState();
  state.actors = next.actors;
  state.selectedSlug = null;
  state.followSlug = null;
  state.elapsedSeconds = 0;
  state.revision = 0;
  primeRenderState();
}

export function canActorEnterDistrict(
  actor: WorldActor,
  adminId: string,
): boolean {
  return actor.allowedAdminIds.includes(adminId);
}

export function graphForActor(_actor: WorldActor): RoadGraph {
  return HEX_ROAD_GRAPH;
}

export function actorDistrict(actor: WorldActor): DistrictRecord | null {
  return actor.currentAdminId
    ? (ADMIN_DISTRICT_BY_ID.get(actor.currentAdminId) ?? null)
    : null;
}

export function actorIsOnRoad(actor: WorldActor): boolean {
  const edge = currentEdge(actor);
  if (!edge) return false;
  const point = pointOnActorEdge(actor);
  return distanceKm(point, actor.position) < 0.001;
}

export function actorsInWorldBounds(
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
): WorldActor[] {
  return state.actors.filter(
    (actor) =>
      actor.position.x >= minX &&
      actor.position.x <= maxX &&
      actor.position.z >= minZ &&
      actor.position.z <= maxZ,
  );
}

export function spawnPlan() {
  return state.actors.map((actor) => ({
    slug: actor.slug,
    role: actor.role,
    pathMode: actor.pathMode,
    spawnAdminId: actor.spawnAdminId,
    spawnAdminName: actor.spawnAdminName,
    allowedAdminIds: actor.allowedAdminIds,
  }));
}

export function simulationStats() {
  const byDistrict = new Map<string, number>();
  const byRole = new Map<string, number>();
  const byBehavior = new Map<string, number>();
  let invalidRoutes = 0;
  let idle = 0;
  let walking = 0;
  let territoryRejections = 0;
  let transitions = 0;
  for (const actor of state.actors) {
    byRole.set(actor.role, (byRole.get(actor.role) ?? 0) + 1);
    byBehavior.set(actor.behavior, (byBehavior.get(actor.behavior) ?? 0) + 1);
    if (!actor.routeValid) invalidRoutes += 1;
    if (actor.state === 'idle') idle += 1;
    else walking += 1;
    territoryRejections += actor.territoryRejections;
    transitions += actor.districtTransitions;
    if (actor.currentAdminName) {
      byDistrict.set(
        actor.currentAdminName,
        (byDistrict.get(actor.currentAdminName) ?? 0) + 1,
      );
    }
  }
  return {
    actors: state.actors.length,
    invalidRoutes,
    idle,
    walking,
    territoryRejections,
    districtTransitions: transitions,
    byRole: Object.fromEntries(byRole),
    byBehavior: Object.fromEntries(byBehavior),
    byDistrict: Object.fromEntries(byDistrict),
    populatedDistricts: byDistrict.size,
    elapsedSeconds: state.elapsedSeconds,
    timeScale: TIME_SCALE,
    demoActors: 0,
    roadNodes: HEX_ROAD_GRAPH.nodes.size,
    roadEdges: HEX_ROAD_GRAPH.edges.size,
    onRoad: state.actors.filter(actorIsOnRoad).length,
  };
}

export const SIMULATION_META = {
  timeScale: TIME_SCALE,
  speeds: SPEEDS,
  actorCount: () => state.actors.length,
  note: '角色移動為可重現的虛構模擬，不是真實人物定位或行程。',
};
