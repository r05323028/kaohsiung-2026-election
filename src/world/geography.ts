import districtsJson from '../data/geography/kaohsiung-districts.json';
import type { LonLat, WorldPoint } from './projection';
import { KM_PER_DEG_LAT, KM_PER_DEG_LON, lonLatToWorld } from './projection';

export type Terrain = 'urban' | 'coastal' | 'hill' | 'mountain';

export type DistrictPolygon = LonLat[];

export type DistrictRecord = {
  id: string;
  code: string;
  name: string;
  shortName: string;
  nameEn: string;
  slug: string;
  bbox: [number, number, number, number];
  centroid: LonLat;
  labelPoint: LonLat;
  areaKm2: number;
  terrain: Terrain;
  polygons: DistrictPolygon[];
  remoteCount: number;
};

type RawDistrict = Omit<
  DistrictRecord,
  'bbox' | 'centroid' | 'labelPoint' | 'terrain' | 'polygons'
> & {
  bbox: number[];
  centroid: number[];
  labelPoint: number[];
  terrain: string;
  polygons: number[][][];
};

type GeographyFile = {
  metadata: Record<string, string>;
  districts: RawDistrict[];
  adjacency: Record<string, string[]>;
  gates: Array<{ a: string; b: string; point: number[] }>;
  remoteTerritories: Array<{
    districtId: string;
    districtName: string;
    name: string;
    bbox: number[];
    centroid: number[];
    areaKm2: number;
  }>;
};

const rawGeography = districtsJson as GeographyFile;

function tuple4(values: number[]): [number, number, number, number] {
  return [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0, values[3] ?? 0];
}

function tuple2(values: number[]): LonLat {
  return [values[0] ?? 0, values[1] ?? 0];
}

export const GEOGRAPHY = {
  ...rawGeography,
  districts: rawGeography.districts.map((district) => ({
    ...district,
    bbox: tuple4(district.bbox),
    centroid: tuple2(district.centroid),
    labelPoint: tuple2(district.labelPoint),
    terrain: district.terrain as Terrain,
    polygons: district.polygons.map((ring) =>
      ring.map((point) => tuple2(point)),
    ),
  })),
  gates: rawGeography.gates.map((gate) => ({
    ...gate,
    point: tuple2(gate.point),
  })),
  remoteTerritories: rawGeography.remoteTerritories.map((territory) => ({
    ...territory,
    bbox: tuple4(territory.bbox),
    centroid: tuple2(territory.centroid),
  })),
};

export const ADMIN_DISTRICTS: DistrictRecord[] = GEOGRAPHY.districts;
export const ADMIN_DISTRICT_BY_ID = new Map(
  ADMIN_DISTRICTS.map((district) => [district.id, district]),
);
export const ADMIN_DISTRICT_BY_NAME = new Map(
  ADMIN_DISTRICTS.map((district) => [district.shortName, district]),
);
export const ADMIN_DISTRICT_BY_SLUG = new Map(
  ADMIN_DISTRICTS.map((district) => [district.slug, district]),
);

export const WORLD_ADJACENCY = GEOGRAPHY.adjacency;

/** Main-island citywide bounds: remote Qijin islands are excluded. */
export const WORLD_BOUNDS = (() => {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const district of ADMIN_DISTRICTS) {
    const [west, south, east, north] = district.bbox;
    minLon = Math.min(minLon, west);
    minLat = Math.min(minLat, south);
    maxLon = Math.max(maxLon, east);
    maxLat = Math.max(maxLat, north);
  }
  return { minLon, minLat, maxLon, maxLat };
})();

export const WORLD_CENTER = lonLatToWorld(
  (WORLD_BOUNDS.minLon + WORLD_BOUNDS.maxLon) / 2,
  (WORLD_BOUNDS.minLat + WORLD_BOUNDS.maxLat) / 2,
);

export const WORLD_RADIUS_KM =
  Math.max(
    (WORLD_BOUNDS.maxLon - WORLD_BOUNDS.minLon) * KM_PER_DEG_LON,
    (WORLD_BOUNDS.maxLat - WORLD_BOUNDS.minLat) * KM_PER_DEG_LAT,
  ) / 2;

export type WorldFocus = {
  target: [number, number, number];
  offset: [number, number, number];
  radius: number;
};

export type WorldDistrict = DistrictRecord & {
  worldPolygons: WorldPoint[][];
  worldBbox: { minX: number; maxX: number; minZ: number; maxZ: number };
};

export const WORLD_ADMIN_DISTRICTS: WorldDistrict[] = ADMIN_DISTRICTS.map(
  (district) => {
    const worldPolygons = district.polygons.map((ring) => worldPolygon(ring));
    const points = worldPolygons.flat();
    return {
      ...district,
      worldPolygons,
      worldBbox: {
        minX: Math.min(...points.map((point) => point.x)),
        maxX: Math.max(...points.map((point) => point.x)),
        minZ: Math.min(...points.map((point) => point.z)),
        maxZ: Math.max(...points.map((point) => point.z)),
      },
    };
  },
);

export const WORLD_DISTRICT_BY_ID = new Map(
  WORLD_ADMIN_DISTRICTS.map((district) => [district.id, district]),
);
export const WORLD_DISTRICT_BY_NAME = new Map(
  WORLD_ADMIN_DISTRICTS.map((district) => [district.shortName, district]),
);

export function worldPolygon(ring: DistrictPolygon): WorldPoint[] {
  return ring.map(([lon, lat]) => lonLatToWorld(lon, lat));
}

export function pointInWorldRing(
  point: WorldPoint,
  ring: WorldPoint[],
): boolean {
  const x = point.x;
  const z = point.z;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i];
    const b = ring[j];
    if (!a || !b) continue;
    const intersect =
      a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function pointInWorldDistrict(
  point: WorldPoint,
  district: WorldDistrict,
): boolean {
  const box = district.worldBbox;
  if (
    point.x < box.minX ||
    point.x > box.maxX ||
    point.z < box.minZ ||
    point.z > box.maxZ
  ) {
    return false;
  }
  return district.worldPolygons.some((ring) => pointInWorldRing(point, ring));
}

export function districtAtWorld(point: WorldPoint): WorldDistrict | null {
  for (const district of WORLD_ADMIN_DISTRICTS) {
    if (pointInWorldDistrict(point, district)) return district;
  }
  return null;
}

export function districtIdAtWorldTolerant(
  point: WorldPoint,
  toleranceKm = 0.04,
): string | null {
  const direct = districtAtWorld(point);
  if (direct) return direct.id;
  for (const [dx, dz] of [
    [toleranceKm, 0],
    [-toleranceKm, 0],
    [0, toleranceKm],
    [0, -toleranceKm],
    [toleranceKm, toleranceKm],
    [-toleranceKm, -toleranceKm],
  ] as Array<[number, number]>) {
    const nearby = districtAtWorld({ x: point.x + dx, z: point.z + dz });
    if (nearby) return nearby.id;
  }
  return null;
}

export function districtAtLonLat(
  lon: number,
  lat: number,
): DistrictRecord | null {
  return districtAtWorld(lonLatToWorld(lon, lat));
}

/** Coarse camera framing for one administrative district. */
export function focusForAdminDistrict(
  district: DistrictRecord,
  padding = 1.35,
): WorldFocus {
  const [west, south, east, north] = district.bbox;
  const a = lonLatToWorld(west, north);
  const b = lonLatToWorld(east, south);
  const width = Math.abs(b.x - a.x);
  const height = Math.abs(b.z - a.z);
  const radius = Math.max(1.1, (Math.max(width, height) / 2) * padding);
  const centre = lonLatToWorld((west + east) / 2, (south + north) / 2);
  return {
    target: [centre.x, 0, centre.z],
    offset: [0.78, 1.55, 0.95],
    radius,
  };
}

export function focusForWorldOverview(): WorldFocus {
  return {
    target: [WORLD_CENTER.x, 0, WORLD_CENTER.z],
    offset: [0.9, 1.7, 0.85],
    radius: WORLD_RADIUS_KM * 1.12,
  };
}

export function districtPath(district: DistrictRecord): WorldPoint[] {
  const ring = district.polygons[0];
  return ring ? worldPolygon(ring) : [];
}
