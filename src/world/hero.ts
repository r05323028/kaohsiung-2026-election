import type { WorldFocus } from './geography';
import {
  type LonLat,
  lonLatToWorld,
  type WorldPoint,
  worldToLonLat,
} from './projection';

/** The existing Zuoying–Nanzih diorama is a high-fidelity tile inside the
 * citywide world. Its local coordinates are compressed art, not a survey.
 */
export const HERO_ANCHOR: LonLat = [120.298, 22.7];
export const HERO_KM_PER_UNIT = 0.18;
// Hero art is authored in local units. A 0.07 vertical scale keeps the
// miniature readable without the 5x flattening produced by the old 0.035.
export const HERO_HEIGHT_SCALE = 0.07;
export const HERO_ORIGIN = lonLatToWorld(HERO_ANCHOR[0], HERO_ANCHOR[1]);

export const HERO_LOCAL_BOUNDS = {
  minX: -17.6,
  maxX: 17.6,
  minZ: -16.2,
  maxZ: 16.2,
};

export function heroPointToWorld(x: number, z: number): WorldPoint {
  return {
    x: HERO_ORIGIN.x + x * HERO_KM_PER_UNIT,
    z: HERO_ORIGIN.z + z * HERO_KM_PER_UNIT,
  };
}

export function heroLocalToLonLat(x: number, z: number): LonLat {
  const world = heroPointToWorld(x, z);
  return worldToLonLat(world.x, world.z);
}

export function worldToHeroLocal(point: WorldPoint): WorldPoint {
  return {
    x: (point.x - HERO_ORIGIN.x) / HERO_KM_PER_UNIT,
    z: (point.z - HERO_ORIGIN.z) / HERO_KM_PER_UNIT,
  };
}

export function insideHero(point: WorldPoint, margin = 0): boolean {
  const local = worldToHeroLocal(point);
  return (
    local.x >= HERO_LOCAL_BOUNDS.minX - margin &&
    local.x <= HERO_LOCAL_BOUNDS.maxX + margin &&
    local.z >= HERO_LOCAL_BOUNDS.minZ - margin &&
    local.z <= HERO_LOCAL_BOUNDS.maxZ + margin
  );
}

export function heroFocusToWorld(focus: WorldFocus): WorldFocus {
  const target = heroPointToWorld(focus.target[0], focus.target[2]);
  return {
    target: [target.x, focus.target[1] * HERO_HEIGHT_SCALE, target.z],
    offset: focus.offset,
    radius: Math.max(0.38, focus.radius * HERO_KM_PER_UNIT),
  };
}

export const HERO_WORLD_BOUNDS = {
  minX: HERO_ORIGIN.x + HERO_LOCAL_BOUNDS.minX * HERO_KM_PER_UNIT,
  maxX: HERO_ORIGIN.x + HERO_LOCAL_BOUNDS.maxX * HERO_KM_PER_UNIT,
  minZ: HERO_ORIGIN.z + HERO_LOCAL_BOUNDS.minZ * HERO_KM_PER_UNIT,
  maxZ: HERO_ORIGIN.z + HERO_LOCAL_BOUNDS.maxZ * HERO_KM_PER_UNIT,
};

export function heroVisibleForFocus(radiusKm: number): boolean {
  return radiusKm <= 6.5;
}
