import type { WorldPoint } from './projection';

/** Visual-only state captured around a fixed simulation tick. */
export type ActorRenderPose = {
  position: WorldPoint;
  heading: number;
  walkPhase: number;
  walking: boolean;
  edgeId: string;
  fromNodeId: string;
  pathNodeIds: readonly string[];
  destination: WorldPoint;
};

export type ActorRenderTransition = {
  from: ActorRenderPose;
  to: ActorRenderPose;
  /** Simulation time at which the `to` state was produced. */
  at: number;
};

export type InterpolatedActorPose = {
  position: WorldPoint;
  heading: number;
  walkPhase: number;
  walking: boolean;
};

export function lerpAngle(from: number, to: number, t: number): number {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + delta * Math.max(0, Math.min(1, t));
}

function point(value: WorldPoint): WorldPoint {
  return { x: value.x, z: value.z };
}

function samplePolyline(points: readonly WorldPoint[], t: number): WorldPoint {
  if (points.length === 0) return { x: 0, z: 0 };
  if (points.length === 1) return point(points[0]!);
  let total = 0;
  const lengths: number[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const length = Math.hypot(
      points[index]!.x - points[index - 1]!.x,
      points[index]!.z - points[index - 1]!.z,
    );
    lengths.push(length);
    total += length;
  }
  if (total < 0.0000001) return point(points[points.length - 1]!);
  let distance = Math.max(0, Math.min(1, t)) * total;
  for (let index = 1; index < points.length; index += 1) {
    const length = lengths[index - 1]!;
    if (distance <= length || index === points.length - 1) {
      const local = length > 0 ? Math.min(1, distance / length) : 0;
      const a = points[index - 1]!;
      const b = points[index]!;
      return {
        x: a.x + (b.x - a.x) * local,
        z: a.z + (b.z - a.z) * local,
      };
    }
    distance -= length;
  }
  return point(points[points.length - 1]!);
}

/**
 * Interpolate along the travelled road segments. When a tick crosses a graph
 * node, the old destination node becomes an intermediate point instead of a
 * straight-line shortcut across the tile corner.
 */
function interpolatedPosition(
  from: ActorRenderPose,
  to: ActorRenderPose,
  t: number,
): WorldPoint {
  const sameSegment =
    from.edgeId === to.edgeId && from.fromNodeId === to.fromNodeId;
  if (sameSegment) {
    return {
      x: from.position.x + (to.position.x - from.position.x) * t,
      z: from.position.z + (to.position.z - from.position.z) * t,
    };
  }
  const oldDestination = from.pathNodeIds[1];
  if (oldDestination && oldDestination === to.fromNodeId) {
    return samplePolyline([from.position, from.destination, to.position], t);
  }
  return {
    x: from.position.x + (to.position.x - from.position.x) * t,
    z: from.position.z + (to.position.z - from.position.z) * t,
  };
}

export function interpolateActorPose(
  transition: ActorRenderTransition,
  alpha: number,
): InterpolatedActorPose {
  const t = Math.max(0, Math.min(1, alpha));
  return {
    position: interpolatedPosition(transition.from, transition.to, t),
    heading: lerpAngle(transition.from.heading, transition.to.heading, t),
    walkPhase:
      transition.from.walkPhase +
      (transition.to.walkPhase - transition.from.walkPhase) * t,
    walking: transition.to.walking,
  };
}
