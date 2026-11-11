import type { DedicatedFeature } from './hex-landmarks';

/**
 * Production metadata for the seven Tier-1 hero assets. Footprints are in the
 * landmark model's local units before the per-tile landmark scale is applied.
 * They are used by layout validation and the developer asset inspector.
 */
export type HeroAssetSpec = {
  feature: DedicatedFeature;
  label: string;
  districtId: string;
  tileId: string;
  footprintRadius: number;
  height: number;
  pipeline: 'authored-procedural';
};

export const HERO_LANDMARK_SPECS: readonly HeroAssetSpec[] = [
  {
    feature: 'hsrStation',
    label: '高鐵左營站',
    districtId: 'E03',
    tileId: 'tile-E03-2',
    footprintRadius: 0.94,
    height: 0.9,
    pipeline: 'authored-procedural',
  },
  {
    feature: 'worldGamesStadium',
    label: '高雄世運主場館',
    districtId: 'E03',
    tileId: 'tile-E03-2',
    footprintRadius: 1.03,
    height: 0.82,
    pipeline: 'authored-procedural',
  },
  {
    feature: 'lotusPagodas',
    label: '蓮池潭與龍虎塔',
    districtId: 'E03',
    tileId: 'tile-E03',
    footprintRadius: 1.04,
    height: 1.3,
    pipeline: 'authored-procedural',
  },
  {
    feature: 'weiwuying',
    label: '衛武營國家藝術文化中心',
    districtId: 'E12',
    tileId: 'tile-E12',
    footprintRadius: 1.02,
    height: 0.82,
    pipeline: 'authored-procedural',
  },
  {
    feature: 'pier2',
    label: '駁二藝術特區',
    districtId: 'E01',
    tileId: 'tile-E01',
    footprintRadius: 0.9,
    height: 0.58,
    pipeline: 'authored-procedural',
  },
  {
    feature: 'dreamMallFerris',
    label: '夢時代購物中心',
    districtId: 'E09',
    tileId: 'tile-E09-2',
    footprintRadius: 0.98,
    height: 1.55,
    pipeline: 'authored-procedural',
  },
  {
    feature: 'skyTower85',
    label: '高雄85大樓',
    districtId: 'E08',
    tileId: 'tile-E08',
    footprintRadius: 0.58,
    height: 2.05,
    pipeline: 'authored-procedural',
  },
];

export const HERO_ASSET_BY_FEATURE = new Map(
  HERO_LANDMARK_SPECS.map((spec) => [spec.feature, spec]),
);
