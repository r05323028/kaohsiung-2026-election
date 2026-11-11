import { HEX_TILES, type HexTile } from './hex';
import { LANDMARKS_BY_TILE, type HexLandmark } from './hex-landmarks';

export type BuildingArchetype =
  | 'townhouse'
  | 'arcadeShophouse'
  | 'apartment'
  | 'cornerCommercial'
  | 'modernBlock'
  | 'warehouse';

export type BuildingRoofKind = 'gable' | 'hip' | 'flat' | 'sawtooth';

export type BuildingDetail = 'low' | 'medium' | 'high';

export type UrbanCharacter =
  | 'historic'
  | 'denseUrban'
  | 'industrial'
  | 'harbor'
  | 'rural'
  | 'mountain';

/** Walkable plaza surface; buildings sit on this plane. */
export const BUILDING_BASE_Y = 0.448;
/** Facade ring radius measured from the tile centre. */
export const BUILDING_RING_RADIUS = 1.02;
/** Trees line the outside of the plaza ring, clear of every facade. */
export const TREE_RING_RADIUS = 1.58;
/** The camera never rotates, so a fixed front clearing always frames the landmark. */
export const FRONT_CLEARING_RADIANS = 0.55;

const CAMERA_AZIMUTH = Math.atan2(18, 22);

export type BuildingSpec = {
  id: string;
  tileId: string;
  districtId: string;
  districtName: string;
  character: UrbanCharacter;
  archetype: BuildingArchetype;
  /** Position relative to the tile centre. */
  x: number;
  z: number;
  /** Tile-centre origin; x/z stay tile-relative for clearance tests. */
  originX: number;
  originZ: number;
  /** Local +z points away from the tile centre; the facade faces the landmark. */
  rotationY: number;
  width: number;
  depth: number;
  floors: number;
  floorHeight: number;
  bodyHeight: number;
  baseY: number;
  roof: BuildingRoofKind;
  roofHeight: number;
  /** Total height above baseY, roof included. */
  height: number;
  arcade: boolean;
  awning: boolean;
  balconies: boolean;
  /** Upper storey steps back to leave a front terrace. */
  setback: boolean;
  shopSign: boolean;
  waterTank: boolean;
  windowColumns: number;
  radius: number;
  wallColor: string;
  trimColor: string;
  roofColor: string;
  glassColor: string;
  metalColor: string;
  signColor: string;
  variant: number;
};

export type BuildingProfile = {
  character: UrbanCharacter;
  label: string;
  archetypes: ReadonlyArray<readonly [BuildingArchetype, number]>;
  floors: readonly [number, number];
  maxHeight: number;
  density: number;
  arcadeChance: number;
  awningChance: number;
  balconyChance: number;
  signChance: number;
  waterTankChance: number;
  wallColors: readonly string[];
  trimColors: readonly string[];
  roofColors: readonly string[];
  glassColors: readonly string[];
  metalColors: readonly string[];
  signColors: readonly string[];
};

const HISTORIC: BuildingProfile = {
  character: 'historic',
  label: 'traditional street town',
  archetypes: [
    ['townhouse', 0.38],
    ['arcadeShophouse', 0.3],
    ['apartment', 0.14],
    ['cornerCommercial', 0.1],
    ['modernBlock', 0.08],
  ],
  floors: [2, 4],
  maxHeight: 0.84,
  density: 0.9,
  arcadeChance: 0.48,
  awningChance: 0.55,
  balconyChance: 0.35,
  signChance: 0.5,
  waterTankChance: 0.72,
  wallColors: ['#e9cda1', '#e5c194', '#ddc9a9', '#e8d8bd', '#cfe0c9', '#cfdde2', '#e9d2c8', '#d8bf9f'],
  trimColors: ['#f3e9d6', '#dfd0b8', '#c4ab8a', '#b0977c'],
  roofColors: ['#b96a52', '#c47c5e', '#a9614d', '#8f9a94', '#7d9290', '#a08575'],
  glassColors: ['#6f9297', '#7ba0a2', '#5f8189'],
  metalColors: ['#b3b3a6', '#9aa198', '#8b9490'],
  signColors: ['#b8574a', '#3f7f7a', '#c99346', '#5b7396', '#e6ddc9'],
};

const DENSE_URBAN: BuildingProfile = {
  character: 'denseUrban',
  label: 'dense mixed-use core',
  archetypes: [
    ['arcadeShophouse', 0.28],
    ['apartment', 0.28],
    ['townhouse', 0.18],
    ['cornerCommercial', 0.16],
    ['modernBlock', 0.1],
  ],
  floors: [3, 5],
  maxHeight: 0.9,
  density: 0.98,
  arcadeChance: 0.5,
  awningChance: 0.45,
  balconyChance: 0.6,
  signChance: 0.55,
  waterTankChance: 0.6,
  wallColors: ['#e9dfc9', '#ded9cb', '#d7d2c4', '#eee6d6', '#d2cec0', '#e2d3bd', '#dfe4dc', '#e6dadd'],
  trimColors: ['#f2ebdd', '#dcd6c8', '#c7c1b2', '#bcae98'],
  roofColors: ['#9a9c94', '#8c918c', '#b06e57', '#a4a79f', '#7f8783', '#8c9ba0'],
  glassColors: ['#71949c', '#658791', '#84a4ab'],
  metalColors: ['#b6b9b3', '#9ba19e', '#8e9794'],
  signColors: ['#c06050', '#4a837e', '#c79a51', '#5b7ba0', '#f0e7d5'],
};

const INDUSTRIAL: BuildingProfile = {
  character: 'industrial',
  label: 'workshop and factory belt',
  archetypes: [
    ['warehouse', 0.4],
    ['modernBlock', 0.24],
    ['apartment', 0.2],
    ['arcadeShophouse', 0.11],
    ['cornerCommercial', 0.05],
  ],
  floors: [1, 4],
  maxHeight: 0.82,
  density: 0.86,
  arcadeChance: 0.18,
  awningChance: 0.22,
  balconyChance: 0.4,
  signChance: 0.35,
  waterTankChance: 0.45,
  wallColors: ['#d9dad2', '#ced2cd', '#c8d2d4', '#dfe0d6', '#c3cecc', '#e4e0d3', '#d8cdbd'],
  trimColors: ['#e9ece6', '#c9cfca', '#b9c1bd', '#a8b0ad'],
  roofColors: ['#8fa2a6', '#7d9298', '#9aa89f', '#b0b6ae', '#8d8579', '#b9765c'],
  glassColors: ['#748f96', '#66828b', '#86a1a6'],
  metalColors: ['#8fa4a8', '#7c9298', '#9aa8a4', '#b6b9b0'],
  signColors: ['#587f83', '#c08a4e', '#5a7392', '#a9b0a6', '#ece6d6'],
};

const HARBOR: BuildingProfile = {
  character: 'harbor',
  label: 'harbour and fishing town',
  archetypes: [
    ['townhouse', 0.32],
    ['warehouse', 0.28],
    ['arcadeShophouse', 0.2],
    ['apartment', 0.14],
    ['cornerCommercial', 0.06],
  ],
  floors: [2, 3],
  maxHeight: 0.74,
  density: 0.76,
  arcadeChance: 0.34,
  awningChance: 0.4,
  balconyChance: 0.3,
  signChance: 0.35,
  waterTankChance: 0.7,
  wallColors: ['#ecdfc2', '#e3d1b2', '#dacdb4', '#e6ddcb', '#d1c3a9', '#dfe4dd'],
  trimColors: ['#f2e8d5', '#ddd0b9', '#c0af94'],
  roofColors: ['#7d949b', '#8ea6a6', '#b06a55', '#9aa9a0', '#a97a5f', '#6f858c'],
  glassColors: ['#71959a', '#83a5a7', '#64878f'],
  metalColors: ['#8ea3a6', '#7c9295', '#a9b3ac'],
  signColors: ['#c26a52', '#4d8387', '#c79b55', '#6b86a5', '#eee4d0'],
};

const RURAL: BuildingProfile = {
  character: 'rural',
  label: 'country town',
  archetypes: [
    ['townhouse', 0.55],
    ['warehouse', 0.18],
    ['apartment', 0.1],
    ['arcadeShophouse', 0.14],
    ['cornerCommercial', 0.03],
  ],
  floors: [1, 3],
  maxHeight: 0.64,
  density: 0.6,
  arcadeChance: 0.22,
  awningChance: 0.3,
  balconyChance: 0.18,
  signChance: 0.22,
  waterTankChance: 0.65,
  wallColors: ['#ecdcbe', '#e2ceaa', '#d9c29c', '#efe5d0', '#d6c5a9', '#cfa98d'],
  trimColors: ['#f2e9d7', '#ded1ba', '#c2b093'],
  roofColors: ['#a9614d', '#b7705a', '#8b7a6b', '#9c6f58', '#7f8478', '#98705c'],
  glassColors: ['#78999a', '#89a6a3', '#68878a'],
  metalColors: ['#a8aea6', '#8e9892', '#b3b5a9'],
  signColors: ['#b96b52', '#4c7f72', '#c39a55', '#6d8197'],
};

const MOUNTAIN: BuildingProfile = {
  character: 'mountain',
  label: 'mountain settlement',
  archetypes: [
    ['townhouse', 0.7],
    ['warehouse', 0.14],
    ['apartment', 0.08],
    ['arcadeShophouse', 0.08],
  ],
  floors: [1, 2],
  maxHeight: 0.54,
  density: 0.46,
  arcadeChance: 0.12,
  awningChance: 0.2,
  balconyChance: 0.12,
  signChance: 0.12,
  waterTankChance: 0.75,
  wallColors: ['#e3d8c0', '#d6c9ae', '#c9bfa8', '#d9cdb6', '#cfc3ab'],
  trimColors: ['#efe8d6', '#d8cdb8', '#b9ae99'],
  roofColors: ['#6f6a5f', '#7c6a58', '#5f6a62', '#8a6a55', '#75706a'],
  glassColors: ['#749393', '#83a09c', '#688685'],
  metalColors: ['#9aa39b', '#7f8c87', '#aea89b'],
  signColors: ['#a86a52', '#4f7a6d', '#b08a55', '#6d7d8a'],
};

const PROFILE_BY_DISTRICT: Record<string, BuildingProfile> = {
  E01: DENSE_URBAN,
  E02: DENSE_URBAN,
  E03: HISTORIC,
  E04: INDUSTRIAL,
  E05: DENSE_URBAN,
  E06: DENSE_URBAN,
  E07: DENSE_URBAN,
  E08: DENSE_URBAN,
  E09: INDUSTRIAL,
  E10: HARBOR,
  E11: INDUSTRIAL,
  E12: DENSE_URBAN,
  E13: HARBOR,
  E14: INDUSTRIAL,
  E15: RURAL,
  E16: RURAL,
  E17: INDUSTRIAL,
  E18: RURAL,
  E19: INDUSTRIAL,
  E20: HARBOR,
  E21: RURAL,
  E22: RURAL,
  E23: RURAL,
  E24: INDUSTRIAL,
  E25: HARBOR,
  E26: HARBOR,
  E27: HARBOR,
  E28: HARBOR,
  E29: HARBOR,
  E30: RURAL,
  E31: RURAL,
  E32: MOUNTAIN,
  E33: MOUNTAIN,
  E34: MOUNTAIN,
  E35: RURAL,
  E36: MOUNTAIN,
  E37: MOUNTAIN,
  E38: MOUNTAIN,
};

export function buildingProfileForDistrict(districtId: string): BuildingProfile {
  return PROFILE_BY_DISTRICT[districtId] ?? DENSE_URBAN;
}

/**
 * Rough silhouette radius for each landmark kind, before the landmark scale is
 * applied. Deliberately generous: a little empty ground reads better than a
 * townhouse clipping a pagoda.
 */
const LANDMARK_CLEARANCE: Record<string, number> = {
  artCenter: 0.55,
  airport: 0.7,
  beach: 0.55,
  bridge: 0.65,
  convention: 0.65,
  dam: 0.55,
  exhibition: 0.6,
  farm: 0.42,
  forest: 0.45,
  fort: 0.5,
  harbor: 0.55,
  hotSpring: 0.45,
  lake: 0.55,
  lighthouse: 0.38,
  mountain: 0.48,
  museum: 0.55,
  monument: 0.45,
  nightMarket: 0.5,
  oldStreet: 0.55,
  pagoda: 0.5,
  park: 0.5,
  stadium: 0.75,
  sugarMill: 0.55,
  temple: 0.45,
  tower: 0.38,
  waterfall: 0.5,
  wetland: 0.55,
};

export type LandmarkFootprint = {
  landmarkId: string;
  x: number;
  z: number;
  radius: number;
};

/** Landmark exclusion circles relative to the tile centre. */
export function landmarkFootprints(tile: HexTile): LandmarkFootprint[] {
  return (LANDMARKS_BY_TILE.get(tile.id) ?? []).map((landmark) => ({
    landmarkId: landmark.id,
    x: landmark.offset.x,
    z: landmark.offset.z,
    radius: landmarkClearanceRadius(landmark),
  }));
}

function hash32(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(random: () => number, values: readonly T[]): T {
  return values[Math.floor(random() * values.length) % values.length]!;
}

function weightedPick<T>(
  random: () => number,
  values: ReadonlyArray<readonly [T, number]>,
): T {
  const total = values.reduce((sum, [, weight]) => sum + weight, 0);
  let target = random() * total;
  for (const [value, weight] of values) {
    target -= weight;
    if (target <= 0) return value;
  }
  return values[values.length - 1]![0];
}

function between(random: () => number, min: number, max: number): number {
  return min + random() * (max - min);
}

/** Maximum height whose top stays below the far ring road from the fixed camera. */
export function maxSilhouetteHeight(radius: number): number {
  return Math.max(0.3, (1.383 - 0.69 * radius) / 0.712);
}

const ARCHETYPE_WIDTH: Record<BuildingArchetype, readonly [number, number]> = {
  townhouse: [0.3, 0.42],
  arcadeShophouse: [0.34, 0.48],
  apartment: [0.5, 0.68],
  cornerCommercial: [0.44, 0.6],
  modernBlock: [0.54, 0.72],
  warehouse: [0.56, 0.8],
};

const ARCHETYPE_DEPTH: Record<BuildingArchetype, readonly [number, number]> = {
  townhouse: [0.26, 0.32],
  arcadeShophouse: [0.28, 0.34],
  apartment: [0.3, 0.36],
  cornerCommercial: [0.3, 0.36],
  modernBlock: [0.32, 0.38],
  warehouse: [0.36, 0.44],
};

/**
 * Districts lead with a signature archetype so regional character reads before
 * the weighted mix starts. Without this a factory belt can draw all shophouses.
 */
const SIGNATURE_ARCHETYPES: Record<UrbanCharacter, BuildingArchetype[]> = {
  historic: ['townhouse', 'arcadeShophouse', 'townhouse', 'apartment'],
  denseUrban: ['arcadeShophouse', 'apartment', 'cornerCommercial', 'modernBlock'],
  industrial: ['warehouse', 'modernBlock', 'warehouse', 'apartment'],
  harbor: ['warehouse', 'townhouse', 'arcadeShophouse', 'cornerCommercial'],
  rural: ['townhouse', 'townhouse', 'warehouse', 'arcadeShophouse'],
  mountain: ['townhouse', 'townhouse', 'warehouse'],
};

/** Deterministic width/depth overlap test in a building's local frame. */
export function footprintIntersectsCircle(
  building: Pick<BuildingSpec, 'x' | 'z' | 'rotationY' | 'width' | 'depth'>,
  circle: { x: number; z: number; radius: number },
): boolean {
  const dx = circle.x - building.x;
  const dz = circle.z - building.z;
  const cos = Math.cos(building.rotationY);
  const sin = Math.sin(building.rotationY);
  const localX = dx * cos - dz * sin;
  const localZ = dx * sin + dz * cos;
  const clampedX = Math.max(-building.width / 2, Math.min(building.width / 2, localX));
  const clampedZ = Math.max(-building.depth / 2, Math.min(building.depth / 2, localZ));
  return Math.hypot(localX - clampedX, localZ - clampedZ) < circle.radius;
}

function pickRoof(
  random: () => number,
  archetype: BuildingArchetype,
): BuildingRoofKind {
  const options: Record<BuildingArchetype, ReadonlyArray<readonly [BuildingRoofKind, number]>> = {
    townhouse: [
      ['gable', 0.55],
      ['hip', 0.22],
      ['flat', 0.23],
    ],
    arcadeShophouse: [
      ['flat', 0.55],
      ['gable', 0.3],
      ['hip', 0.15],
    ],
    apartment: [
      ['flat', 0.86],
      ['hip', 0.14],
    ],
    cornerCommercial: [
      ['flat', 0.72],
      ['hip', 0.28],
    ],
    modernBlock: [['flat', 1]],
    warehouse: [
      ['sawtooth', 0.45],
      ['flat', 0.4],
      ['gable', 0.15],
    ],
  };
  return weightedPick(random, options[archetype]);
}

function buildSpec(
  tile: HexTile,
  profile: BuildingProfile,
  random: () => number,
  options: {
    index: number;
    angle: number;
    radius: number;
    archetype: BuildingArchetype;
    width: number;
    depth: number;
  },
): BuildingSpec {
  const { index, angle, radius, archetype, width, depth } = options;
  const x = Math.cos(angle) * radius;
  const z = Math.sin(angle) * radius;
  const rotationY = Math.atan2(Math.cos(angle), Math.sin(angle));

  let floors = Math.floor(
    between(random, profile.floors[0], profile.floors[1] + 1),
  );
  let floorHeight = between(random, 0.17, 0.2);
  if (archetype === 'warehouse') {
    floors = 1;
    floorHeight = between(random, 0.34, 0.46);
  }
  const roof = pickRoof(random, archetype);
  const roofHeight =
    roof === 'flat'
      ? between(random, 0.035, 0.06)
      : roof === 'sawtooth'
        ? between(random, 0.06, 0.09)
        : between(random, 0.08, 0.13);

  const heightLimit = Math.min(
    profile.maxHeight,
    maxSilhouetteHeight(radius + depth / 2),
  );
  let bodyHeight = floors * floorHeight;
  const maxBody = heightLimit - roofHeight;
  if (bodyHeight > maxBody) {
    floors = Math.max(1, Math.floor(maxBody / floorHeight));
    bodyHeight = floors * floorHeight;
  }
  bodyHeight = Math.max(floorHeight, bodyHeight);

  const arcade =
    archetype === 'arcadeShophouse' ||
    (archetype !== 'warehouse' &&
      archetype !== 'modernBlock' &&
      random() < profile.arcadeChance);
  const awning = archetype !== 'warehouse' && random() < profile.awningChance;
  const balconies =
    archetype === 'apartment' ||
    archetype === 'modernBlock' ||
    (archetype !== 'warehouse' && random() < profile.balconyChance);
  const shopSign =
    archetype === 'arcadeShophouse' ||
    archetype === 'cornerCommercial' ||
    (archetype !== 'apartment' && random() < profile.signChance);
  const waterTank = random() < profile.waterTankChance;
  const setback =
    floors >= 3 &&
    (archetype === 'modernBlock'
      ? random() < 0.65
      : archetype === 'apartment' || archetype === 'cornerCommercial'
        ? random() < 0.35
        : false);

  let windowColumns = Math.max(1, Math.round(width / 0.072));
  if (archetype === 'apartment' || archetype === 'modernBlock') {
    windowColumns = Math.max(2, Math.round(width / 0.1));
  }
  windowColumns = Math.min(windowColumns, 5);

  return {
    id: tile.id + '-b' + index,
    tileId: tile.id,
    districtId: tile.districtId,
    districtName: tile.district.name,
    character: profile.character,
    archetype,
    x,
    z,
    originX: tile.center.x,
    originZ: tile.center.z,
    rotationY,
    width,
    depth,
    floors,
    floorHeight,
    bodyHeight,
    baseY: BUILDING_BASE_Y,
    roof,
    roofHeight,
    height: bodyHeight + roofHeight,
    arcade,
    awning,
    balconies,
    setback,
    shopSign,
    waterTank,
    windowColumns,
    radius,
    wallColor: pick(random, profile.wallColors),
    trimColor: pick(random, profile.trimColors),
    roofColor: pick(random, profile.roofColors),
    glassColor: pick(random, profile.glassColors),
    metalColor: pick(random, profile.metalColors),
    signColor: pick(random, profile.signColors),
    variant: Math.floor(random() * 1_000_000),
  };
}

/**
 * Lays out one arc of buildings behind and beside the landmark, leaving the
 * camera-facing side of the plaza open. All randomness is seeded from ids so a
 * tile always renders the same town.
 */
export function layoutTileBuildings(tile: HexTile): BuildingSpec[] {
  const profile = buildingProfileForDistrict(tile.districtId);
  const random = mulberry32(hash32(tile.id + ':' + tile.districtId + ':town'));
  const blockers = landmarkFootprints(tile);
  const specs: BuildingSpec[] = [];

  const front = CAMERA_AZIMUTH;
  const start = front + FRONT_CLEARING_RADIANS;
  const end = front + Math.PI * 2 - FRONT_CLEARING_RADIANS;
  const targetCount = Math.round((6 + profile.density * 6) * (0.85 + random() * 0.3));

  let angle = start + between(random, 0, 0.05);
  let attempts = 0;
  while (angle < end && specs.length < targetCount && attempts < 60) {
    attempts += 1;
    const signature = SIGNATURE_ARCHETYPES[profile.character];
    const archetype =
      specs.length < signature.length
        ? signature[specs.length]!
        : weightedPick(random, profile.archetypes);
    const [widthMin, widthMax] = ARCHETYPE_WIDTH[archetype];
    const [depthMin, depthMax] = ARCHETYPE_DEPTH[archetype];
    const width = between(random, widthMin, widthMax);
    const depth = between(random, depthMin, depthMax);
    const radius =
      BUILDING_RING_RADIUS +
      between(random, -0.035, 0.055) +
      (archetype === 'warehouse' ? 0.04 : 0);
    const arc = width / radius;
    const centerAngle = angle + arc / 2;
    if (centerAngle + arc / 2 > end) break;

    const draft = {
      x: Math.cos(centerAngle) * radius,
      z: Math.sin(centerAngle) * radius,
      rotationY: Math.atan2(Math.cos(centerAngle), Math.sin(centerAngle)),
      width,
      depth,
    };
    const blocked = blockers.some((blocker) =>
      footprintIntersectsCircle(draft, blocker),
    );
    const terraceRow =
      archetype === 'townhouse' || archetype === 'arcadeShophouse';
    const gap =
      (terraceRow
        ? between(random, 0.004, 0.016)
        : between(random, 0.018, 0.045)) +
      (random() < 0.06 ? between(random, 0.07, 0.12) : 0);

    if (!blocked) {
      specs.push(
        buildSpec(tile, profile, random, {
          index: specs.length,
          angle: centerAngle,
          radius,
          archetype,
          width,
          depth,
        }),
      );
    }
    angle = centerAngle + arc / 2 + gap / radius;
  }

  return specs;
}

const BUILDING_CACHE = new Map<string, BuildingSpec[]>();

export function buildingsForTile(tile: HexTile): BuildingSpec[] {
  const cached = BUILDING_CACHE.get(tile.id);
  if (cached) return cached;
  const specs = layoutTileBuildings(tile);
  BUILDING_CACHE.set(tile.id, specs);
  return specs;
}

export function generateCityBuildings(
  tiles: readonly HexTile[] = HEX_TILES,
): BuildingSpec[] {
  return tiles.flatMap((tile) => buildingsForTile(tile));
}

export function cityBuildingStats(specs: readonly BuildingSpec[]): {
  total: number;
  byArchetype: Record<BuildingArchetype, number>;
  byDistrict: Record<string, number>;
} {
  const byArchetype = {
    townhouse: 0,
    arcadeShophouse: 0,
    apartment: 0,
    cornerCommercial: 0,
    modernBlock: 0,
    warehouse: 0,
  } satisfies Record<BuildingArchetype, number>;
  const byDistrict: Record<string, number> = {};
  for (const spec of specs) {
    byArchetype[spec.archetype] += 1;
    byDistrict[spec.districtId] = (byDistrict[spec.districtId] ?? 0) + 1;
  }
  return { total: specs.length, byArchetype, byDistrict };
}

/** Zoom thresholds are expressed in screen pixels per world unit. */
export const BUILDING_DETAIL_ZOOM = {
  medium: 62,
  high: 155,
} as const;

export function buildingDetailForZoom(
  zoom: number,
  quality: BuildingDetail = 'high',
): BuildingDetail {
  if (!Number.isFinite(zoom)) return 'low';
  if (zoom < BUILDING_DETAIL_ZOOM.medium) return 'low';
  // Low-tier hardware still gets facade detail when the camera is close:
  // only the finest trim is dropped.
  return zoom >= BUILDING_DETAIL_ZOOM.high && quality !== 'low'
    ? 'high'
    : 'medium';
}

export function landmarkClearanceRadius(landmark: HexLandmark): number {
  return (LANDMARK_CLEARANCE[landmark.kind] ?? 0.6) * landmark.scale + 0.04;
}
