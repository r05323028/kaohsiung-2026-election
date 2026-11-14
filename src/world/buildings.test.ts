import { describe, expect, it } from 'vitest';
import {
  BUILDING_BASE_Y,
  BUILDING_DETAIL_ZOOM,
  BUILDING_RING_RADIUS,
  TREE_RING_RADIUS,
  buildingDetailForZoom,
  buildingProfileForDistrict,
  buildingsForTile,
  cityBuildingStats,
  footprintIntersectsCircle,
  generateCityBuildings,
  landmarkFootprints,
  layoutTileBuildings,
  maxSilhouetteHeight,
} from './buildings';
import { HEX_TILES } from './hex';

const buildings = generateCityBuildings();
const tilesById = new Map(HEX_TILES.map((tile) => [tile.id, tile]));
const ARCHETYPES = [
  'townhouse',
  'arcadeShophouse',
  'apartment',
  'cornerCommercial',
  'modernBlock',
  'warehouse',
] as const;

describe('city building layout', () => {
  it('is deterministic across generations', () => {
    expect(generateCityBuildings()).toEqual(buildings);
    for (const tile of HEX_TILES) {
      expect(buildingsForTile(tile)).toEqual(layoutTileBuildings(tile));
    }
  });

  it("places buildings in every district tile's own ring", () => {
    expect(buildings.length).toBeGreaterThan(100);
    for (const spec of buildings) {
      const tile = tilesById.get(spec.tileId);
      expect(tile, spec.id).toBeDefined();
      expect(spec.districtId).toBe(tile!.districtId);
      expect(spec.originX).toBe(tile!.center.x);
      expect(spec.originZ).toBe(tile!.center.z);
      expect(spec.baseY).toBe(BUILDING_BASE_Y);
      expect(spec.radius).toBeGreaterThanOrEqual(BUILDING_RING_RADIUS - 0.04);
      expect(spec.radius).toBeLessThanOrEqual(BUILDING_RING_RADIUS + 0.1);
      expect(Math.hypot(spec.x, spec.z)).toBeCloseTo(spec.radius, 5);
      // The outer footprint stays inside the tree ring and off the road.
      expect(spec.radius + spec.depth / 2).toBeLessThan(TREE_RING_RADIUS);
      expect(Number.isFinite(spec.width)).toBe(true);
      expect(Number.isFinite(spec.depth)).toBe(true);
      expect(spec.width).toBeGreaterThan(0.2);
      expect(spec.depth).toBeGreaterThan(0.2);
    }
  });

  it('keeps every silhouette below the far ring road', () => {
    for (const spec of buildings) {
      const limit = maxSilhouetteHeight(spec.radius + spec.depth / 2);
      expect(spec.height, spec.id).toBeLessThanOrEqual(limit + 0.001);
      expect(spec.height).toBeGreaterThan(0.2);
      expect(spec.height).toBeLessThanOrEqual(
        buildingProfileForDistrict(spec.districtId).maxHeight + 0.001,
      );
      expect(spec.floors).toBeGreaterThanOrEqual(1);
      expect(spec.bodyHeight).toBeGreaterThan(0);
      expect(spec.roofHeight).toBeGreaterThan(0);
    }
  });

  it('supports all six archetypes with valid variants', () => {
    const stats = cityBuildingStats(buildings);
    for (const archetype of ARCHETYPES) {
      expect(stats.byArchetype[archetype], archetype).toBeGreaterThan(0);
    }
    expect(stats.total).toBe(buildings.length);
    for (const spec of buildings) {
      expect(ARCHETYPES).toContain(spec.archetype);
      expect(['gable', 'hip', 'flat', 'sawtooth']).toContain(spec.roof);
      expect(spec.windowColumns).toBeGreaterThanOrEqual(1);
      expect(spec.windowColumns).toBeLessThanOrEqual(5);
      if (spec.archetype === 'warehouse') {
        expect(spec.floors).toBe(1);
        expect(spec.floorHeight).toBeGreaterThanOrEqual(0.34);
      }
    }
  });

  it("never overlaps a landmark's reserved footprint", () => {
    for (const tile of HEX_TILES) {
      const blockers = landmarkFootprints(tile);
      for (const spec of buildingsForTile(tile)) {
        for (const blocker of blockers) {
          expect(
            footprintIntersectsCircle(
              {
                x: spec.x,
                z: spec.z,
                rotationY: spec.rotationY,
                width: spec.width,
                depth: spec.depth,
              },
              blocker,
            ),
            spec.id + ' vs ' + blocker.landmarkId,
          ).toBe(false);
        }
      }
    }
  });

  it('gives Zuoying and Nanzih distinct architectural characters', () => {
    expect(buildingProfileForDistrict('E03').character).toBe('historic');
    expect(buildingProfileForDistrict('E04').character).toBe('industrial');

    const zuoying = buildings.filter((spec) => spec.districtId === 'E03');
    const nanzih = buildings.filter((spec) => spec.districtId === 'E04');
    expect(zuoying.length).toBeGreaterThan(0);
    expect(nanzih.length).toBeGreaterThan(0);
    expect(zuoying.some((spec) => spec.archetype === 'townhouse')).toBe(true);
    expect(zuoying.some((spec) => spec.archetype === 'arcadeShophouse')).toBe(
      true,
    );
    expect(nanzih.some((spec) => spec.archetype === 'warehouse')).toBe(true);
    expect(
      nanzih.some((spec) => spec.roof === 'sawtooth' || spec.roof === 'flat'),
    ).toBe(true);
  });

  it('keeps the camera-facing arc open so landmarks stay readable', () => {
    const cameraAzimuth = Math.atan2(18, 22);
    const angleGap = (angle: number) => {
      const wrapped = Math.atan2(
        Math.sin(angle - cameraAzimuth),
        Math.cos(angle - cameraAzimuth),
      );
      return Math.abs(wrapped);
    };
    for (const tile of HEX_TILES) {
      for (const spec of buildingsForTile(tile)) {
        expect(angleGap(Math.atan2(spec.z, spec.x)), spec.id).toBeGreaterThan(
          0.55 - 0.001,
        );
      }
    }
  });
});

describe('building detail selection', () => {
  it('Selects LOD by projected zoom, not camera distance', () => {
    expect(buildingDetailForZoom(Number.NaN)).toBe('low');
    expect(buildingDetailForZoom(0)).toBe('low');
    expect(buildingDetailForZoom(BUILDING_DETAIL_ZOOM.medium - 1)).toBe('low');
    expect(buildingDetailForZoom(BUILDING_DETAIL_ZOOM.medium)).toBe('medium');
    expect(buildingDetailForZoom(BUILDING_DETAIL_ZOOM.high - 1)).toBe('medium');
    expect(buildingDetailForZoom(BUILDING_DETAIL_ZOOM.high)).toBe('high');
  });

  it('caps fine detail on low-quality hardware but keeps facades when close', () => {
    expect(buildingDetailForZoom(20, 'low')).toBe('low');
    expect(buildingDetailForZoom(100, 'low')).toBe('medium');
    expect(buildingDetailForZoom(400, 'low')).toBe('medium');
    expect(buildingDetailForZoom(400, 'medium')).toBe('high');
  });
});
