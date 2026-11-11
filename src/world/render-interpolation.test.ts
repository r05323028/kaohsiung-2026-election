import { describe, expect, it } from 'vitest';
import {
  type ActorRenderPose,
  type ActorRenderTransition,
  interpolateActorPose,
  lerpAngle,
} from './render-interpolation';

function pose(
  position: { x: number; z: number },
  heading: number,
  walkPhase: number,
  edgeId: string,
  fromNodeId: string,
  pathNodeIds: string[],
  destination: { x: number; z: number },
  walking = true,
): ActorRenderPose {
  return {
    position,
    heading,
    walkPhase,
    walking,
    edgeId,
    fromNodeId,
    pathNodeIds,
    destination,
  };
}

function transition(
  from: ActorRenderPose,
  to: ActorRenderPose,
): ActorRenderTransition {
  return { from, to, at: 0 };
}

describe('render interpolation', () => {
  it('interpolates across a node without cutting through the tile corner', () => {
    const from = pose({ x: 0, z: 0 }, 0, 1, 'edge-a', 'a', ['a', 'b'], {
      x: 1,
      z: 0,
    });
    const to = pose({ x: 1, z: 1 }, Math.PI / 2, 2, 'edge-b', 'b', ['b', 'c'], {
      x: 1,
      z: 2,
    });
    const result = interpolateActorPose(transition(from, to), 0.5);
    expect(result.position.x).toBeCloseTo(1, 10);
    expect(result.position.z).toBeCloseTo(0, 10);
  });

  it('interpolates position, walk phase and walking state on one road edge', () => {
    const from = pose({ x: 0, z: 0 }, 0.2, 3, 'edge', 'a', ['a', 'b'], {
      x: 2,
      z: 0,
    });
    const to = pose({ x: 2, z: 0 }, 0.6, 4, 'edge', 'a', ['a', 'b'], {
      x: 2,
      z: 0,
    });
    const result = interpolateActorPose(transition(from, to), 0.25);
    expect(result.position).toEqual({ x: 0.5, z: 0 });
    expect(result.walkPhase).toBeCloseTo(3.25, 10);
    expect(result.walking).toBe(true);
  });

  it('takes the shortest angular path across the +/-PI wrap', () => {
    const midpoint = lerpAngle(3.0, -3.0, 0.5);
    expect(Math.abs(midpoint)).toBeCloseTo(Math.PI, 5);
    expect(lerpAngle(3.0, -3.0, 1)).toBeCloseTo(-3.0 + Math.PI * 2, 10);
    expect(lerpAngle(0, Math.PI / 2, 0.5)).toBeCloseTo(Math.PI / 4, 10);
  });

  it('clamps interpolation and never overshoots an edge', () => {
    const from = pose({ x: 0, z: 0 }, 0, 0, 'edge', 'a', ['a', 'b'], {
      x: 1,
      z: 0,
    });
    const to = pose({ x: 1, z: 0 }, 0, 1, 'edge', 'a', ['a', 'b'], {
      x: 1,
      z: 0,
    });
    expect(interpolateActorPose(transition(from, to), -1).position).toEqual({
      x: 0,
      z: 0,
    });
    expect(interpolateActorPose(transition(from, to), 2).position).toEqual({
      x: 1,
      z: 0,
    });
  });
});
