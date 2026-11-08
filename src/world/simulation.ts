import { type CandidateProfile, candidateProfiles } from '../data';
import {
  candidateRole,
  constituencyNumberForSlug,
  movementScopeForCandidate,
} from './constituencies';
import {
  ADMIN_DISTRICT_BY_ID,
  districtAtWorld,
  districtIdAtWorldTolerant,
  WORLD_DISTRICT_BY_ID,
  type WorldDistrict,
} from './geography';
import { worldToHeroLocal } from './hero';
import {
  COUNCIL_04_ROUTE,
  routeForCandidate,
  sampleRoute,
  type WorldRoute,
} from './navigation';
import { distanceKm, type WorldPoint } from './projection';
import {
  HERO_WALK_GRAPH,
  heroObstacleAt,
  shortestWalkPath,
  type WalkGraph,
  type WalkNode,
} from './walk-graph';

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
  blockedTransitions: number;
  spawnAdminId: string | null;
  spawnAdminName: string | null;
  rngState: number;
  simulated: true;
  note: string;
};

type SimulationState = {
  actors: WorldActor[];
  selectedSlug: string | null;
  followSlug: string | null;
  elapsedSeconds: number;
  revision: number;
};

const TIME_SCALE = 4;
const SPEEDS: Record<ActorRole, number> = {
  mayor: 0.0024,
  council: 0.0013,
  indigenous: 0.0016,
  demo: 0,
};
const TURN_RATE = 2.8;
const FICTIONAL_NOTE = '此為虛構互動模擬，不代表真實所在地、行程或競選活動。';

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberrySeed(value: string): number {
  return (hashString(value) ^ 0x9e3779b9) >>> 0;
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

function angleDelta(from: number, to: number): number {
  return normalizeAngle(to - from);
}

function turnToward(actor: WorldActor, target: number, maxStep: number): void {
  actor.desiredHeading = target;
  const delta = angleDelta(actor.heading, target);
  actor.heading = normalizeAngle(
    actor.heading + Math.max(-maxStep, Math.min(maxStep, delta)),
  );
}

function headingFor(actor: WorldActor, target: WorldPoint): number {
  return Math.atan2(target.x - actor.position.x, target.z - actor.position.z);
}

function fallbackPoint(allowedAdminIds: string[]): WorldPoint {
  for (const id of allowedAdminIds) {
    const district = ADMIN_DISTRICT_BY_ID.get(id);
    if (district) {
      return {
        x: (district.labelPoint[0] - 120.3) * 102.7,
        z: -(district.labelPoint[1] - 22.7) * 110.57,
      };
    }
  }
  return { x: 0, z: 0 };
}

function safeGraphNode(actor: WorldActor, node: WalkNode): boolean {
  if (node.kind === 'gate') return false;
  if (node.adminId && !actor.allowedAdminIds.includes(node.adminId)) {
    return false;
  }
  if (actor.routeId === HERO_WALK_GRAPH.id) {
    return heroObstacleAt(worldToHeroLocal(node.point)) === 'none';
  }
  return true;
}

function graphNodesForActor(actor: WorldActor): WalkNode[] {
  return HERO_WALK_GRAPH.nodes.filter((node) => safeGraphNode(actor, node));
}

function isCouncil04(candidate: CandidateProfile): boolean {
  return (
    candidateRole(candidate) === 'council' &&
    constituencyNumberForSlug(candidate.district.slug) === 4
  );
}

function chooseGraphPath(
  actor: WorldActor,
  startId: string,
  random: number,
): string[] {
  const nodes = graphNodesForActor(actor);
  if (nodes.length < 2) return [startId];
  const first = Math.floor(random * nodes.length);
  for (let attempt = 0; attempt < nodes.length; attempt += 1) {
    const target = nodes[(first + attempt) % nodes.length];
    if (!target || target.id === startId) continue;
    const path = shortestWalkPath(HERO_WALK_GRAPH, startId, target.id);
    if (path.length > 1) return path;
  }
  return [startId];
}

function initialGraphActor(
  actor: WorldActor,
  candidate: CandidateProfile,
  index: number,
  usedNodes: Set<string>,
): void {
  const nodes = graphNodesForActor(actor);
  if (nodes.length === 0) {
    actor.behavior = 'idle';
    actor.state = 'idle';
    return;
  }
  const seedIndex =
    (hashString(candidate.candidacy.slug) + index * 11) % nodes.length;
  let start = nodes[seedIndex] ?? nodes[0];
  for (let attempt = 0; attempt < nodes.length && start; attempt += 1) {
    if (!usedNodes.has(start.id)) break;
    start = nodes[(seedIndex + attempt + 1) % nodes.length];
  }
  if (!start) return;
  usedNodes.add(start.id);
  const path = chooseGraphPath(
    actor,
    start.id,
    (hashString(actor.slug) % 1000) / 1000,
  );
  actor.graphId = HERO_WALK_GRAPH.id;
  actor.currentNodeId = start.id;
  actor.pathNodeIds = path;
  actor.pathIndex = path.length > 1 ? 1 : 0;
  actor.position = start.point;
  actor.currentAdminId = start.adminId;
  actor.currentAdminName = start.adminId
    ? (ADMIN_DISTRICT_BY_ID.get(start.adminId)?.name ?? null)
    : null;
  actor.spawnAdminId = start.adminId;
  actor.spawnAdminName = actor.currentAdminName;
  const nextId = path[1];
  const nextNode = nextId ? HERO_WALK_GRAPH.nodeById.get(nextId) : undefined;
  actor.destination = nextNode?.point ?? start.point;
  actor.heading = headingFor(actor, actor.destination);
  actor.desiredHeading = actor.heading;
  actor.behavior = path.length > 1 ? 'walking' : 'pausing';
  actor.behaviorTimer = path.length > 1 ? 0 : 1.5;
  actor.state = path.length > 1 ? 'walking' : 'idle';
  actor.nextPauseKm = 0.28 + (hashString(actor.slug) % 80) / 100;
  actor.walkedSincePause = 0;
}

function initialRouteActor(
  actor: WorldActor,
  candidate: CandidateProfile,
  route: WorldRoute,
  index: number,
): void {
  const hash = hashString(candidate.candidacy.slug);
  const offsetRatio = ((hash + index * 97) % 1000) / 1000;
  const initialProgress = route.lengthKm * offsetRatio;
  const position = route.valid
    ? sampleRoute(route, initialProgress)
    : fallbackPoint(actor.allowedAdminIds);
  const district = districtAtWorld(position);
  actor.progressKm = initialProgress;
  actor.position = position;
  actor.direction = 1;
  actor.destination = route.valid
    ? sampleRoute(route, initialProgress + 0.22)
    : position;
  actor.currentAdminId = district?.id ?? null;
  actor.currentAdminName = district?.name ?? null;
  actor.spawnAdminId = actor.currentAdminId;
  actor.spawnAdminName = actor.currentAdminName;
  actor.heading = headingFor(actor, actor.destination);
  actor.desiredHeading = actor.heading;
  actor.behavior = route.valid ? 'walking' : 'idle';
  actor.state = route.valid ? 'walking' : 'idle';
  actor.behaviorTimer = 0;
  actor.nextPauseKm = 0.3 + (hash % 90) / 100;
  actor.walkedSincePause = 0;
}

function actorForCandidate(
  candidate: CandidateProfile,
  index: number,
  usedNodes: Set<string>,
): WorldActor {
  const scope = movementScopeForCandidate(candidate);
  const role = candidateRole(candidate) as ActorRole;
  const route: WorldRoute = routeForCandidate(candidate);
  const baseSpeed = SPEEDS[role];
  const variance = 0.82 + (hashString(candidate.candidacy.slug) % 17) / 100;
  const actor: WorldActor = {
    id: candidate.candidacy.id,
    slug: candidate.candidacy.slug,
    candidateId: candidate.candidacy.id,
    displayName: candidate.person.displayName,
    shortName: candidate.person.shortName,
    role,
    electoralDistrictSlug: candidate.district.slug,
    allowedAdminIds: scope.allowedAdminIds,
    allowedAdminNames: scope.allowedAdminNames,
    routeId: route.id,
    routeLabel: route.label,
    routeValid: route.valid,
    routeLengthKm: route.lengthKm,
    routeWarnings: route.warnings,
    speedKmPerSec: baseSpeed * variance,
    progressKm: 0,
    position: { x: 0, z: 0 },
    destination: { x: 0, z: 0 },
    currentAdminId: null,
    currentAdminName: null,
    state: 'idle',
    behavior: 'idle',
    pathMode: 'route',
    graphId: null,
    currentNodeId: null,
    pathNodeIds: [],
    pathIndex: 0,
    heading: 0,
    desiredHeading: 0,
    behaviorTimer: 0,
    walkPhase: 0,
    walkedSincePause: 0,
    nextPauseKm: 0.4,
    direction: 1,
    followingUser: false,
    transitionTimer: 0,
    districtTransitions: 0,
    blockedTransitions: 0,
    spawnAdminId: null,
    spawnAdminName: null,
    rngState: mulberrySeed(candidate.candidacy.slug),
    simulated: true,
    note: FICTIONAL_NOTE,
  };

  if (isCouncil04(candidate)) {
    actor.pathMode = 'graph';
    actor.routeId = HERO_WALK_GRAPH.id;
    actor.routeLabel = '左營・楠梓局部步行網路';
    actor.routeValid = HERO_WALK_GRAPH.valid;
    actor.routeLengthKm = COUNCIL_04_ROUTE.lengthKm;
    actor.routeWarnings = [
      ...HERO_WALK_GRAPH.warnings,
      '角色在局部已驗證步行網路上自行選點，不代表完整人行道測繪。',
    ];
    initialGraphActor(actor, candidate, index, usedNodes);
    return actor;
  }

  initialRouteActor(actor, candidate, route, index);
  return actor;
}

function createState(): SimulationState {
  const usedNodes = new Set<string>();
  const seen = new Set<string>();
  const actors: WorldActor[] = [];
  for (const candidate of candidateProfiles) {
    if (candidate.person.isDemo || candidateRole(candidate) === 'demo')
      continue;
    if (seen.has(candidate.candidacy.slug)) continue;
    seen.add(candidate.candidacy.slug);
    actors.push(actorForCandidate(candidate, actors.length, usedNodes));
  }
  return {
    actors,
    selectedSlug: null,
    followSlug: null,
    elapsedSeconds: 0,
    revision: 0,
  };
}

let state = createState();

function setBehavior(
  actor: WorldActor,
  behavior: ActorBehavior,
  timer: number,
): void {
  actor.behavior = behavior;
  actor.behaviorTimer = Math.max(0, timer);
  actor.state =
    behavior === 'walking' || behavior === 'transitioning' ? 'walking' : 'idle';
}

function applyNextPosition(actor: WorldActor, next: WorldPoint): boolean {
  const districtId = districtIdAtWorldTolerant(next);
  if (!districtId) {
    actor.blockedTransitions += 1;
    setBehavior(actor, 'idle', 0.8);
    return false;
  }
  if (!actor.allowedAdminIds.includes(districtId)) {
    actor.blockedTransitions += 1;
    setBehavior(actor, 'idle', 1.2);
    return false;
  }
  actor.position = next;
  if (districtId !== actor.currentAdminId) {
    actor.districtTransitions += 1;
    actor.currentAdminId = districtId;
    actor.currentAdminName = ADMIN_DISTRICT_BY_ID.get(districtId)?.name ?? null;
    actor.transitionTimer = 0.8;
    if (actor.behavior !== 'arriving') {
      setBehavior(actor, 'transitioning', 0.8);
    }
  }
  return true;
}

function updateRouteDestination(actor: WorldActor): void {
  actor.destination = sampleRoute(
    routeForCandidateBySlug(actor.slug) ?? COUNCIL_04_ROUTE,
    actor.progressKm + actor.direction * 0.22,
  );
  actor.desiredHeading = headingFor(actor, actor.destination);
}

function pauseThenChoose(actor: WorldActor): void {
  const roll = nextRandom(actor);
  if (roll < 0.28) {
    setBehavior(actor, 'observing', 2.2 + nextRandom(actor) * 3.6);
    return;
  }
  setBehavior(actor, 'pausing', 1.2 + nextRandom(actor) * 3.4);
}

function chooseGraphDestination(actor: WorldActor): void {
  const startId = actor.currentNodeId;
  if (!startId) {
    setBehavior(actor, 'idle', 1);
    return;
  }
  const path = chooseGraphPath(actor, startId, nextRandom(actor));
  if (path.length < 2) {
    setBehavior(actor, 'pausing', 2);
    return;
  }
  actor.pathNodeIds = path;
  actor.pathIndex = 1;
  const nextId = path[1];
  const nextNode = nextId ? HERO_WALK_GRAPH.nodeById.get(nextId) : undefined;
  actor.destination = nextNode?.point ?? actor.position;
  actor.walkedSincePause = 0;
  actor.nextPauseKm = 0.24 + nextRandom(actor) * 0.75;
  const targetHeading = headingFor(actor, actor.destination);
  const turn = Math.abs(angleDelta(actor.heading, targetHeading));
  if (turn > 0.35) {
    setBehavior(actor, 'turning', Math.min(1.4, turn / TURN_RATE + 0.18));
    actor.desiredHeading = targetHeading;
  } else {
    setBehavior(actor, 'walking', 0);
  }
}

function stepGraphActor(actor: WorldActor, deltaSeconds: number): void {
  const delta = deltaSeconds;
  if (actor.behavior === 'transitioning') {
    actor.transitionTimer -= delta;
    if (actor.transitionTimer <= 0) setBehavior(actor, 'walking', 0);
  }
  if (
    actor.behavior === 'idle' ||
    actor.behavior === 'choosing' ||
    actor.behavior === 'pausing' ||
    actor.behavior === 'observing' ||
    actor.behavior === 'arriving'
  ) {
    actor.state = 'idle';
    actor.behaviorTimer -= delta;
    if (actor.behaviorTimer <= 0) {
      const nextId = actor.pathNodeIds[actor.pathIndex];
      if (nextId) {
        // Resume the interrupted edge instead of walking back to the last node.
        actor.walkedSincePause = 0;
        actor.nextPauseKm = 0.24 + nextRandom(actor) * 0.75;
        setBehavior(actor, 'walking', 0);
      } else {
        chooseGraphDestination(actor);
      }
    }
    return;
  }
  if (actor.behavior === 'turning') {
    actor.state = 'idle';
    actor.behaviorTimer -= delta;
    turnToward(actor, actor.desiredHeading, TURN_RATE * delta);
    if (actor.behaviorTimer <= 0) setBehavior(actor, 'walking', 0);
    return;
  }
  if (actor.behavior !== 'walking' && actor.behavior !== 'transitioning')
    return;

  const nextId = actor.pathNodeIds[actor.pathIndex];
  const nextNode = nextId ? HERO_WALK_GRAPH.nodeById.get(nextId) : undefined;
  if (!nextNode) {
    setBehavior(actor, 'arriving', 0.8);
    actor.state = 'idle';
    return;
  }
  const remaining = distanceKm(actor.position, nextNode.point);
  const stepDistance = Math.max(0, actor.speedKmPerSec * TIME_SCALE * delta);
  const targetHeading = headingFor(actor, nextNode.point);
  if (remaining <= stepDistance + 1e-6) {
    if (!applyNextPosition(actor, nextNode.point)) return;
    actor.currentNodeId = nextNode.id;
    actor.pathIndex += 1;
    actor.walkPhase += Math.max(0.08, remaining) * 9;
    actor.walkedSincePause += remaining;
    const followingId = actor.pathNodeIds[actor.pathIndex];
    if (!followingId) {
      actor.currentNodeId = nextNode.id;
      setBehavior(actor, 'arriving', 0.75);
      actor.state = 'idle';
      return;
    }
    const followingNode = HERO_WALK_GRAPH.nodeById.get(followingId);
    actor.destination = followingNode?.point ?? nextNode.point;
    actor.desiredHeading = headingFor(actor, actor.destination);
    if (actor.behavior !== 'transitioning') setBehavior(actor, 'walking', 0);
    return;
  }
  const ratio = stepDistance / Math.max(remaining, 1e-9);
  const nextPoint = {
    x: actor.position.x + (nextNode.point.x - actor.position.x) * ratio,
    z: actor.position.z + (nextNode.point.z - actor.position.z) * ratio,
  };
  if (!applyNextPosition(actor, nextPoint)) return;
  turnToward(actor, targetHeading, TURN_RATE * delta);
  actor.walkPhase += stepDistance * 9;
  actor.walkedSincePause += stepDistance;
  actor.state = 'walking';
  if (actor.walkedSincePause >= actor.nextPauseKm) {
    pauseThenChoose(actor);
  }
}

function stepRouteActor(actor: WorldActor, deltaSeconds: number): void {
  const route = routeForCandidateBySlug(actor.slug);
  if (!route?.valid || route.lengthKm <= 0.05) {
    actor.state = 'idle';
    actor.behavior = 'idle';
    return;
  }
  if (actor.behavior === 'transitioning') {
    actor.transitionTimer -= deltaSeconds;
    if (actor.transitionTimer <= 0) setBehavior(actor, 'walking', 0);
  }
  if (
    actor.behavior === 'idle' ||
    actor.behavior === 'choosing' ||
    actor.behavior === 'pausing' ||
    actor.behavior === 'observing' ||
    actor.behavior === 'arriving'
  ) {
    actor.state = 'idle';
    actor.behaviorTimer -= deltaSeconds;
    if (actor.behaviorTimer <= 0) {
      if (nextRandom(actor) < 0.24)
        actor.direction = actor.direction === 1 ? -1 : 1;
      actor.walkedSincePause = 0;
      actor.nextPauseKm = 0.3 + nextRandom(actor) * 0.9;
      const target = sampleRoute(
        route,
        actor.progressKm + actor.direction * 0.22,
      );
      const targetHeading = headingFor(actor, target);
      actor.desiredHeading = targetHeading;
      if (Math.abs(angleDelta(actor.heading, targetHeading)) > 0.35) {
        setBehavior(actor, 'turning', 0.35);
      } else {
        setBehavior(actor, 'walking', 0);
      }
    }
    return;
  }
  if (actor.behavior === 'turning') {
    actor.state = 'idle';
    actor.behaviorTimer -= deltaSeconds;
    turnToward(actor, actor.desiredHeading, TURN_RATE * deltaSeconds);
    if (actor.behaviorTimer <= 0) setBehavior(actor, 'walking', 0);
    return;
  }
  if (actor.behavior !== 'walking' && actor.behavior !== 'transitioning')
    return;
  const step =
    actor.speedKmPerSec * TIME_SCALE * deltaSeconds * actor.direction;
  const nextProgress =
    (actor.progressKm + step + route.lengthKm) % route.lengthKm;
  const nextPosition = sampleRoute(route, nextProgress);
  if (!applyNextPosition(actor, nextPosition)) return;
  actor.progressKm = nextProgress;
  actor.walkPhase += Math.abs(step) * 9;
  actor.walkedSincePause += Math.abs(step);
  updateRouteDestination(actor);
  turnToward(actor, actor.desiredHeading, TURN_RATE * deltaSeconds);
  actor.state = 'walking';
  if (actor.walkedSincePause >= actor.nextPauseKm) {
    pauseThenChoose(actor);
  }
}

function stepActor(actor: WorldActor, deltaSeconds: number): void {
  if (actor.pathMode === 'graph') {
    stepGraphActor(actor, deltaSeconds);
    return;
  }
  stepRouteActor(actor, deltaSeconds);
}

const actorRouteCache = new Map<string, WorldRoute>();
function routeForCandidateBySlug(slug: string): WorldRoute | null {
  const cached = actorRouteCache.get(slug);
  if (cached) return cached;
  const candidate = candidateProfiles.find(
    (item) => item.candidacy.slug === slug,
  );
  if (!candidate) return null;
  const route = routeForCandidate(candidate);
  actorRouteCache.set(slug, route);
  return route;
}

export function advanceSimulation(deltaSeconds: number): void {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
  const total = Math.min(deltaSeconds, 2);
  state.elapsedSeconds += total;
  state.revision += 1;
  for (const actor of state.actors) stepActor(actor, total);
}

/** Deterministic test helper: advance in one-second steps without frame clamping. */
export function advanceSimulationSeconds(seconds: number): void {
  let remaining = Math.max(0, seconds);
  while (remaining > 0) {
    const step = Math.min(1, remaining);
    state.elapsedSeconds += step;
    for (const actor of state.actors) stepActor(actor, step);
    remaining -= step;
  }
  state.revision += 1;
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
  for (const actor of state.actors) actor.followingUser = actor.slug === slug;
}

export function resetSimulation(): void {
  actorRouteCache.clear();
  state = createState();
}

export function canActorEnterDistrict(
  actor: WorldActor,
  adminId: string,
): boolean {
  return actor.allowedAdminIds.includes(adminId);
}

export function graphForActor(actor: WorldActor): WalkGraph | null {
  return actor.pathMode === 'graph' ? HERO_WALK_GRAPH : null;
}

export function actorDistrict(actor: WorldActor): WorldDistrict | null {
  if (!actor.currentAdminId) return null;
  return WORLD_DISTRICT_BY_ID.get(actor.currentAdminId) ?? null;
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
  let blocked = 0;
  let transitions = 0;
  for (const actor of state.actors) {
    byRole.set(actor.role, (byRole.get(actor.role) ?? 0) + 1);
    byBehavior.set(actor.behavior, (byBehavior.get(actor.behavior) ?? 0) + 1);
    if (!actor.routeValid) invalidRoutes += 1;
    if (actor.state === 'idle') idle += 1;
    else walking += 1;
    blocked += actor.blockedTransitions;
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
    blockedTransitions: blocked,
    districtTransitions: transitions,
    byRole: Object.fromEntries(byRole),
    byBehavior: Object.fromEntries(byBehavior),
    byDistrict: Object.fromEntries(byDistrict),
    populatedDistricts: byDistrict.size,
    elapsedSeconds: state.elapsedSeconds,
    timeScale: TIME_SCALE,
    demoActors: 0,
  };
}

export const SIMULATION_META = {
  timeScale: TIME_SCALE,
  speeds: SPEEDS,
  actorCount: () => state.actors.length,
  note: '角色移動為可重現的虛構模擬，不是真實人物定位或行程。',
};
