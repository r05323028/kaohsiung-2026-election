import { beforeEach, describe, expect, it } from 'vitest';
import type { WorldPoint } from './projection';
import { ROAD_EDGES } from './road-graph';
import {
  actorRenderPose,
  advanceSimulationFrame,
  getActors,
  resetSimulation,
} from './simulation';

function distanceToSegment(point: WorldPoint, a: WorldPoint, b: WorldPoint) {
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

function positionSnapshot() {
  return getActors().map((actor) => ({
    slug: actor.slug,
    x: actor.position.x,
    z: actor.position.z,
    edgeProgress: actor.edgeProgress,
    walkPhase: actor.walkPhase,
  }));
}

describe('fixed-step simulation frames', () => {
  beforeEach(() => {
    resetSimulation();
  });

  it('advances the same simulation regardless of render frame rate', () => {
    for (let frame = 0; frame < 180; frame += 1) {
      advanceSimulationFrame(1 / 60);
    }
    const sixtyHertz = positionSnapshot();

    resetSimulation();
    for (let frame = 0; frame < 90; frame += 1) {
      advanceSimulationFrame(1 / 30);
    }
    const thirtyHertz = positionSnapshot();

    expect(thirtyHertz).toHaveLength(sixtyHertz.length);
    for (let index = 0; index < sixtyHertz.length; index += 1) {
      expect(thirtyHertz[index]!.slug).toBe(sixtyHertz[index]!.slug);
      expect(thirtyHertz[index]!.x).toBeCloseTo(sixtyHertz[index]!.x, 8);
      expect(thirtyHertz[index]!.z).toBeCloseTo(sixtyHertz[index]!.z, 8);
      expect(thirtyHertz[index]!.edgeProgress).toBeCloseTo(
        sixtyHertz[index]!.edgeProgress,
        8,
      );
    }
  });

  it('renders interpolated poses on road segments and never resets the walk phase', () => {
    const firstSlug = getActors()[0]!.slug;
    let previousPhase = getActors()[0]!.walkPhase;

    for (let frame = 0; frame < 360; frame += 1) {
      const alpha = advanceSimulationFrame(1 / 60);
      if (frame % 6 !== 0) continue;
      for (const actor of getActors()) {
        const pose = actorRenderPose(actor, alpha);
        let nearest = Number.POSITIVE_INFINITY;
        for (const edge of ROAD_EDGES) {
          nearest = Math.min(
            nearest,
            distanceToSegment(pose.position, edge.a, edge.b),
          );
        }
        expect(nearest).toBeLessThan(0.01);
      }
      const first = getActors().find((actor) => actor.slug === firstSlug);
      if (!first) throw new Error('first actor disappeared');
      const phase = actorRenderPose(first, alpha).walkPhase;
      expect(phase).toBeGreaterThanOrEqual(previousPhase - 1e-9);
      previousPhase = phase;
    }

    expect(previousPhase).toBeGreaterThan(0);
  });
});
