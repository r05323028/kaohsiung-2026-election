import {
  ADMIN_DISTRICT_BY_ID,
  ADMIN_DISTRICTS,
  type DistrictRecord,
} from './geography';
import { lonLatToWorld, type WorldPoint } from './projection';

/** Flat-top hexagons, one or more per administrative district. */
export const HEX_RADIUS = 2.9;
export const HEX_RING_SCALE = 0.8;
export const HEX_ROAD_WIDTH = 0.48;
export const HEX_TILE_GAP = 0;
/** Apothem of the ring-road centreline (distance to each shared edge). */
export const HEX_RING_APOTHEM =
  (HEX_RADIUS * HEX_RING_SCALE * Math.sqrt(3)) / 2;
/** Centre-only area left free of roads; ring roads sit outside this radius. */
export const HEX_CENTER_RADIUS = HEX_RING_APOTHEM - HEX_ROAD_WIDTH / 2 - 0.08;
/** Radius of the green landmark plaza inside every ring road. */
export const HEX_PLAZA_RADIUS = 1.5;

/** Neighbour directions in ring-midpoint order (angles 30° + 60°i). */
export const HEX_DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [0, -1],
  [1, -1],
];

export type HexAxial = { q: number; r: number };
export type HexPoint = { x: number; z: number };

export type HexTile = {
  id: string;
  districtId: string;
  adminId: string;
  district: DistrictRecord;
  q: number;
  r: number;
  center: HexPoint;
  corners: HexPoint[];
  /** Compact neighbour list (kept for callers that only need adjacency). */
  neighbourIds: string[];
  /** Direction-indexed neighbours; null preserves the shared-edge slot. */
  neighbourByDirection: Array<string | null>;
  landmarkIds: string[];
  /** Index of this tile within the district's tile list. */
  districtTileIndex: number;
};

export type HexFocus = {
  target: [number, number, number];
  offset: [number, number, number];
  radius: number;
};

/**
 * Deterministic compact layout generated once from official GIS centroids and
 * projected with one world unit per kilometre, then annealed into a compact
 * overlapping-free hex patch. Multi-tile districts are listed explicitly.
 * Reads recognizably: Gushan west of Yancheng, Cijin south-west, the southern
 * coast eastward, Zuoying/Nanzih north, and the mountain districts north-east.
 */
const AXIAL_BY_DISTRICT: Record<
  string,
  ReadonlyArray<readonly [number, number]>
> = {
  E01: [[-2, 2]],
  E02: [[-3, 2]],
  E03: [
    [-1, 0],
    [0, 0],
  ],
  E04: [[-2, 0]],
  E05: [[0, 1]],
  E06: [[-1, 2]],
  E07: [[-2, 1]],
  E08: [[-1, 1]],
  E09: [
    [-1, 3],
    [0, 2],
  ],
  E10: [[-2, 3]],
  E11: [[0, 3]],
  E12: [[1, 1]],
  E13: [[1, 2]],
  E14: [[2, 1]],
  E15: [[3, -2]],
  E16: [[2, -1]],
  E17: [[1, -1]],
  E18: [[1, 0]],
  E19: [[1, -2]],
  E20: [[0, -1]],
  E21: [[2, -2]],
  E22: [[2, -3]],
  E23: [[1, -3]],
  E24: [[0, -2]],
  E25: [[-1, -2]],
  E26: [[-2, -2]],
  E27: [[-3, -1]],
  E28: [[-2, -1]],
  E29: [[-1, -1]],
  E30: [[1, -4]],
  E31: [[2, -5]],
  E32: [[2, -7]],
  E33: [[3, -8]],
  E34: [[1, -5]],
  E35: [[0, -5]],
  E36: [[2, -6]],
  E37: [[4, -9]],
  E38: [[3, -9]],
};

export function hexCenter(q: number, r: number): HexPoint {
  return {
    x: HEX_RADIUS * 1.5 * q,
    z: HEX_RADIUS * Math.sqrt(3) * (r + q / 2),
  };
}

export function hexCorners(center: HexPoint, radius = HEX_RADIUS): HexPoint[] {
  return Array.from({ length: 6 }, (_, index) => {
    const angle = (Math.PI / 3) * index;
    return {
      x: center.x + Math.cos(angle) * radius,
      z: center.z + Math.sin(angle) * radius,
    };
  });
}

export function hexKey(q: number, r: number): string {
  return `${q},${r}`;
}

export function hexAxialDistance(a: HexAxial, b: HexAxial): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
}

/** Converts a world x/z point to the containing flat-top hex (axial rounding). */
export function hexAtPoint(point: HexPoint): HexAxial {
  const q = ((2 / 3) * point.x) / HEX_RADIUS;
  const r = (-point.x / 3 + (Math.sqrt(3) / 3) * point.z) / HEX_RADIUS;
  return roundAxial(q, r);
}

export function hexDistanceToCenter(point: HexPoint, center: HexPoint): number {
  return Math.hypot(point.x - center.x, point.z - center.z);
}

function roundAxial(q: number, r: number): HexAxial {
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(s);
  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  return { q: rq, r: rr };
}

export function hexTileId(districtId: string, index = 0): string {
  return index === 0 ? `tile-${districtId}` : `tile-${districtId}-${index + 1}`;
}

export const HEX_TILES: HexTile[] = ADMIN_DISTRICTS.flatMap((district) => {
  const coords = AXIAL_BY_DISTRICT[district.id];
  if (!coords || coords.length === 0)
    throw new Error(`Missing hex layout for ${district.id} ${district.name}`);
  return coords.map((axial, index) => {
    const center = hexCenter(axial[0], axial[1]);
    return {
      id: hexTileId(district.id, index),
      districtId: district.id,
      adminId: district.id,
      district,
      q: axial[0],
      r: axial[1],
      center,
      corners: hexCorners(center),
      neighbourIds: [],
      neighbourByDirection: [],
      landmarkIds: [],
      districtTileIndex: index,
    };
  });
});

export const HEX_TILE_BY_ID = new Map(HEX_TILES.map((tile) => [tile.id, tile]));
const TILE_BY_AXIAL = new Map(
  HEX_TILES.map((tile) => [hexKey(tile.q, tile.r), tile]),
);

for (const tile of HEX_TILES) {
  tile.neighbourByDirection = HEX_DIRECTIONS.map((direction) => {
    const neighbour = TILE_BY_AXIAL.get(
      hexKey(tile.q + direction[0], tile.r + direction[1]),
    );
    return neighbour?.id ?? null;
  });
  tile.neighbourIds = tile.neighbourByDirection.filter((id): id is string =>
    Boolean(id),
  );
}

export const HEX_TILES_BY_DISTRICT = new Map<string, HexTile[]>();
for (const tile of HEX_TILES) {
  const list = HEX_TILES_BY_DISTRICT.get(tile.districtId) ?? [];
  list.push(tile);
  HEX_TILES_BY_DISTRICT.set(tile.districtId, list);
}

/** First tile of each district, kept for callers that need one representative. */
export const HEX_TILE_BY_DISTRICT = new Map(
  [...HEX_TILES_BY_DISTRICT].map(([districtId, tiles]) => [
    districtId,
    tiles[0]!,
  ]),
);
export const HEX_TILES_BY_ADMIN = HEX_TILES_BY_DISTRICT;

export function tilesForDistrict(districtId: string): HexTile[] {
  return HEX_TILES_BY_DISTRICT.get(districtId) ?? [];
}

export const HEX_WORLD_BOUNDS = (() => {
  const xs = HEX_TILES.flatMap((tile) =>
    tile.corners.map((corner) => corner.x),
  );
  const zs = HEX_TILES.flatMap((tile) =>
    tile.corners.map((corner) => corner.z),
  );
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
    center: {
      x: (Math.min(...xs) + Math.max(...xs)) / 2,
      z: (Math.min(...zs) + Math.max(...zs)) / 2,
    },
  };
})();

export function hexFocusForTiles(
  tiles: readonly HexTile[],
  padding = 1.16,
): HexFocus {
  const unique = [...new Map(tiles.map((tile) => [tile.id, tile])).values()];
  const xs = unique.flatMap((tile) => tile.corners.map((corner) => corner.x));
  const zs = unique.flatMap((tile) => tile.corners.map((corner) => corner.z));
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  return {
    target: [(minX + maxX) / 2, 0.2, (minZ + maxZ) / 2],
    offset: [0.92, 1.08, 0.98],
    radius: Math.max(2.4, (Math.max(maxX - minX, maxZ - minZ) / 2) * padding),
  };
}

export function hexFocusForDistrictIds(
  districtIds: readonly string[],
  padding = 1.16,
): HexFocus | null {
  const tiles = districtIds.flatMap((id) => tilesForDistrict(id));
  return tiles.length === 0 ? null : hexFocusForTiles(tiles, padding);
}

export function hexFocusForAdminNames(
  names: readonly string[],
  padding = 1.16,
): HexFocus | null {
  const tiles = names.flatMap((name) => {
    const district = ADMIN_DISTRICTS.find((item) => item.name === name);
    return district ? tilesForDistrict(district.id) : [];
  });
  return tiles.length === 0 ? null : hexFocusForTiles(tiles, padding);
}

export const HEX_WORLD_FOCUS = hexFocusForTiles(HEX_TILES, 1.02);

export function districtAtHex(point: HexPoint): DistrictRecord | null {
  const axial = hexAtPoint(point);
  return TILE_BY_AXIAL.get(hexKey(axial.q, axial.r))?.district ?? null;
}

export function districtIdAtHex(point: HexPoint): string | null {
  return districtAtHex(point)?.id ?? null;
}

/** Point at the shared edge midpoint between two neighbouring tiles. */
export function sharedEdgeMidpoint(a: HexTile, b: HexTile): HexPoint {
  return { x: (a.center.x + b.center.x) / 2, z: (a.center.z + b.center.z) / 2 };
}

export function isNeighbour(a: HexTile, b: HexTile): boolean {
  return hexAxialDistance(a, b) === 1;
}

export function tileCentroidDistance(a: HexTile, b: HexTile): number {
  return Math.hypot(a.center.x - b.center.x, a.center.z - b.center.z);
}

export function districtWorldCentroid(district: DistrictRecord): WorldPoint {
  return lonLatToWorld(district.centroid[0], district.centroid[1]);
}

export function officialDistrictById(id: string): DistrictRecord {
  const district = ADMIN_DISTRICT_BY_ID.get(id);
  if (!district) throw new Error(`Unknown district ${id}`);
  return district;
}
