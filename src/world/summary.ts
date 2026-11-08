import summaryJson from '../data/geography/kaohsiung-districts-summary.json';
import type { WorldFocus } from './geography';
import {
  KM_PER_DEG_LAT,
  KM_PER_DEG_LON,
  type LonLat,
  lonLatToWorld,
} from './projection';

export type Terrain = 'urban' | 'coastal' | 'hill' | 'mountain';

type RawDistrict = {
  id: string;
  code: string;
  name: string;
  shortName: string;
  nameEn: string;
  slug: string;
  bbox: number[];
  centroid: number[];
  labelPoint: number[];
  areaKm2: number;
  terrain: string;
  remoteCount: number;
};

type SummaryFile = {
  metadata: Record<string, string>;
  districts: RawDistrict[];
  adjacency: Record<string, string[]>;
  remoteTerritories: Array<{
    districtId: string;
    districtName: string;
    name: string;
    bbox: number[];
    centroid: number[];
    areaKm2: number;
  }>;
};

const raw = summaryJson as SummaryFile;

function tuple4(values: number[]): [number, number, number, number] {
  return [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0, values[3] ?? 0];
}
function tuple2(values: number[]): LonLat {
  return [values[0] ?? 0, values[1] ?? 0];
}

export type AdminDistrictSummary = {
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
  remoteCount: number;
};

export const ADMIN_SUMMARY: AdminDistrictSummary[] = raw.districts.map(
  (district) => ({
    ...district,
    bbox: tuple4(district.bbox),
    centroid: tuple2(district.centroid),
    labelPoint: tuple2(district.labelPoint),
    terrain: district.terrain as Terrain,
  }),
);
export const ADMIN_SUMMARY_BY_ID = new Map(
  ADMIN_SUMMARY.map((district) => [district.id, district]),
);
export const ADMIN_SUMMARY_BY_NAME = new Map(
  ADMIN_SUMMARY.map((district) => [district.shortName, district]),
);
export const ADMIN_ADJACENCY = raw.adjacency;

export const ADMIN_WORLD_BOUNDS = (() => {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const district of ADMIN_SUMMARY) {
    const [west, south, east, north] = district.bbox;
    const a = lonLatToWorld(west, north);
    const b = lonLatToWorld(east, south);
    minX = Math.min(minX, a.x);
    maxX = Math.max(maxX, b.x);
    minZ = Math.min(minZ, a.z);
    maxZ = Math.max(maxZ, b.z);
  }
  return { minX, maxX, minZ, maxZ };
})();

export const ADMIN_WORLD_CENTER = {
  x: (ADMIN_WORLD_BOUNDS.minX + ADMIN_WORLD_BOUNDS.maxX) / 2,
  z: (ADMIN_WORLD_BOUNDS.minZ + ADMIN_WORLD_BOUNDS.maxZ) / 2,
};

export function summaryWorldFocus(
  district: AdminDistrictSummary,
  padding = 1.35,
): WorldFocus {
  const [west, south, east, north] = district.bbox;
  const a = lonLatToWorld(west, north);
  const b = lonLatToWorld(east, south);
  const width = Math.abs(b.x - a.x);
  const height = Math.abs(b.z - a.z);
  return {
    target: [(a.x + b.x) / 2, 0, (a.z + b.z) / 2],
    offset: [0.78, 1.55, 0.95],
    radius: Math.max(1.1, (Math.max(width, height) / 2) * padding),
  };
}

export function summaryFocusForNames(
  names: string[],
  padding = 1.35,
): WorldFocus | null {
  const districts = names
    .map((name) => ADMIN_SUMMARY_BY_NAME.get(name))
    .filter((district): district is AdminDistrictSummary => Boolean(district));
  if (districts.length === 0) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const district of districts) {
    const [west, south, east, north] = district.bbox;
    const a = lonLatToWorld(west, north);
    const b = lonLatToWorld(east, south);
    minX = Math.min(minX, a.x);
    maxX = Math.max(maxX, b.x);
    minZ = Math.min(minZ, a.z);
    maxZ = Math.max(maxZ, b.z);
  }
  return {
    target: [(minX + maxX) / 2, 0, (minZ + maxZ) / 2],
    offset: [0.78, 1.55, 0.95],
    radius: Math.max(1.1, (Math.max(maxX - minX, maxZ - minZ) / 2) * padding),
  };
}

export function focusForWorldSummary(): WorldFocus {
  const width = ADMIN_WORLD_BOUNDS.maxX - ADMIN_WORLD_BOUNDS.minX;
  const height = ADMIN_WORLD_BOUNDS.maxZ - ADMIN_WORLD_BOUNDS.minZ;
  return {
    target: [ADMIN_WORLD_CENTER.x, 0, ADMIN_WORLD_CENTER.z],
    offset: [0.9, 1.7, 0.85],
    radius: Math.max(width, height) * 0.4,
  };
}

export function districtIsHeroFriendly(name: string): boolean {
  return name === '左營' || name === '楠梓';
}

export function projectedDistanceKm(
  a: [number, number],
  b: [number, number],
): number {
  return Math.hypot(
    (a[0] - b[0]) * KM_PER_DEG_LON,
    (a[1] - b[1]) * KM_PER_DEG_LAT,
  );
}
