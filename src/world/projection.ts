/** Geographic projection for the miniature Kaohsiung world.
 *
 * One world unit is one kilometre. The projection is a local equirectangular
 * approximation centred on 120.30E, 22.70N. It is intentionally simple and
 * documented as display geometry, not a survey projection.
 */

export const WORLD_ORIGIN = { lon: 120.3, lat: 22.7 } as const;
export const KM_PER_DEG_LAT = 110.57;
export const KM_PER_DEG_LON =
  111.32 * Math.cos((WORLD_ORIGIN.lat * Math.PI) / 180);

export type LonLat = [number, number];
export type WorldPoint = { x: number; z: number };

export function lonLatToWorld(lon: number, lat: number): WorldPoint {
  return {
    x: (lon - WORLD_ORIGIN.lon) * KM_PER_DEG_LON,
    z: -(lat - WORLD_ORIGIN.lat) * KM_PER_DEG_LAT,
  };
}

export function worldToLonLat(x: number, z: number): LonLat {
  return [
    WORLD_ORIGIN.lon + x / KM_PER_DEG_LON,
    WORLD_ORIGIN.lat - z / KM_PER_DEG_LAT,
  ];
}

export function distanceKm(a: WorldPoint, b: WorldPoint): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function formatKm(value: number): string {
  return value >= 10 ? value.toFixed(0) : value.toFixed(1);
}
