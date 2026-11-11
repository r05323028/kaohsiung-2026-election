import {
  HEX_TILE_BY_ID,
  HEX_TILES,
  HEX_TILES_BY_DISTRICT,
  type HexPoint,
} from './hex';

export type LandmarkKind =
  | 'artCenter'
  | 'airport'
  | 'beach'
  | 'bridge'
  | 'convention'
  | 'dam'
  | 'exhibition'
  | 'farm'
  | 'forest'
  | 'fort'
  | 'harbor'
  | 'hotSpring'
  | 'lake'
  | 'lighthouse'
  | 'mountain'
  | 'museum'
  | 'monument'
  | 'nightMarket'
  | 'oldStreet'
  | 'pagoda'
  | 'park'
  | 'stadium'
  | 'sugarMill'
  | 'temple'
  | 'tower'
  | 'waterfall'
  | 'wetland';

/** Seven hero compositions that get a bespoke low-poly model. */
export type DedicatedFeature =
  | 'hsrStation'
  | 'worldGamesStadium'
  | 'lotusPagodas'
  | 'weiwuying'
  | 'pier2'
  | 'dreamMallFerris'
  | 'skyTower85';

export const DEDICATED_LANDMARK_FEATURES: readonly DedicatedFeature[] = [
  'hsrStation',
  'worldGamesStadium',
  'lotusPagodas',
  'weiwuying',
  'pier2',
  'dreamMallFerris',
  'skyTower85',
];

export type HexLandmark = {
  id: string;
  districtId: string;
  tileId: string;
  label: string;
  kind: LandmarkKind;
  feature?: DedicatedFeature;
  /** Decorative position relative to the tile centre. */
  offset: HexPoint;
  rotation: number;
  scale: number;
};

type LandmarkSeed = readonly [
  label: string,
  kind: LandmarkKind,
  feature?: DedicatedFeature,
];

/**
 * Verified Kaohsiung landmarks and natural features, grouped by the tile that
 * displays them. Purely decorative: no interaction handlers are attached.
 * Zuoying and Cianjhen each occupy two tiles so dense landmark clusters fit.
 */
const LANDMARKS_BY_DISTRICT: Record<
  string,
  readonly (readonly LandmarkSeed[])[]
> = {
  E01: [
    [
      ['駁二藝術特區', 'artCenter', 'pier2'],
      ['高雄流行音樂中心', 'convention'],
    ],
  ],
  E02: [
    [
      ['西子灣', 'beach'],
      ['打狗英國領事館', 'fort'],
    ],
  ],
  E03: [
    [['蓮池潭與龍虎塔', 'lake', 'lotusPagodas']],
    [
      ['高鐵左營站', 'tower', 'hsrStation'],
      ['高雄世運主場館', 'stadium', 'worldGamesStadium'],
    ],
  ],
  E04: [
    [
      ['楠梓都會公園', 'park'],
      ['後勁溪', 'wetland'],
    ],
  ],
  E05: [
    [
      ['金獅湖', 'lake'],
      ['愛河之心', 'park'],
    ],
  ],
  E06: [
    [
      ['六合夜市', 'nightMarket'],
      ['中央公園', 'park'],
    ],
  ],
  E07: [
    [
      ['高雄市立歷史博物館', 'museum'],
      ['愛河', 'wetland'],
    ],
  ],
  E08: [
    [
      ['高雄85大樓', 'tower', 'skyTower85'],
      ['高雄音樂中心', 'convention'],
    ],
  ],
  E09: [
    [
      ['高雄港', 'harbor'],
      ['高雄展覽館', 'exhibition'],
    ],
    [['夢時代購物中心與高雄之眼', 'tower', 'dreamMallFerris']],
  ],
  E10: [
    [
      ['旗津燈塔', 'lighthouse'],
      ['旗津海水浴場', 'beach'],
    ],
  ],
  E11: [
    [
      ['高雄國際機場', 'airport'],
      ['紅毛港', 'harbor'],
    ],
  ],
  E12: [
    [
      ['衛武營國家藝術文化中心', 'stadium', 'weiwuying'],
      ['鳳山龍山寺', 'temple'],
    ],
  ],
  E13: [
    [
      ['林園濕地', 'wetland'],
      ['林園漁港', 'harbor'],
    ],
  ],
  E14: [
    [
      ['大寮農田', 'farm'],
      ['鳳山水庫', 'dam'],
    ],
  ],
  E15: [
    [
      ['佛光山', 'temple'],
      ['高屏舊鐵橋', 'bridge'],
    ],
  ],
  E16: [
    [
      ['觀音山', 'mountain'],
      ['大社農田', 'farm'],
    ],
  ],
  E17: [
    [
      ['觀音湖', 'lake'],
      ['仁武森林', 'forest'],
    ],
  ],
  E18: [
    [
      ['澄清湖', 'lake'],
      ['鳥松濕地', 'wetland'],
    ],
  ],
  E19: [
    [
      ['岡山壽天宮', 'temple'],
      ['岡山河堤公園', 'park'],
    ],
  ],
  E20: [
    [
      ['橋頭糖廠', 'sugarMill'],
      ['橋頭老街', 'oldStreet'],
    ],
  ],
  E21: [
    [
      ['燕巢泥火山', 'mountain'],
      ['燕巢森林', 'forest'],
    ],
  ],
  E22: [
    [
      ['田寮月世界', 'mountain'],
      ['田寮森林', 'forest'],
    ],
  ],
  E23: [
    [
      ['大崗山', 'mountain'],
      ['大崗山超峰寺', 'temple'],
    ],
  ],
  E24: [
    [
      ['路竹天后宮', 'temple'],
      ['路竹農田', 'farm'],
    ],
  ],
  E25: [
    [
      ['明寧靖王墓', 'monument'],
      ['湖內濕地', 'wetland'],
    ],
  ],
  E26: [
    [
      ['茄萣濕地', 'wetland'],
      ['興達港', 'harbor'],
    ],
  ],
  E27: [
    [
      ['永安濕地', 'wetland'],
      ['永安漁港', 'harbor'],
    ],
  ],
  E28: [
    [
      ['彌陀漁港', 'harbor'],
      ['漯底山', 'mountain'],
    ],
  ],
  E29: [
    [
      ['蚵仔寮漁港', 'harbor'],
      ['梓官農田', 'farm'],
    ],
  ],
  E30: [
    [
      ['旗山老街', 'oldStreet'],
      ['旗山天后宮', 'temple'],
    ],
  ],
  E31: [
    [
      ['美濃湖', 'lake'],
      ['美濃客家文物館', 'museum'],
    ],
  ],
  E32: [
    [
      ['六龜大佛', 'monument'],
      ['六龜溫泉', 'hotSpring'],
    ],
  ],
  E33: [
    [
      ['甲仙大橋', 'bridge'],
      ['甲仙化石館', 'museum'],
    ],
  ],
  E34: [
    [
      ['杉林花田', 'farm'],
      ['杉林森林', 'forest'],
    ],
  ],
  E35: [
    [
      ['內門紫竹寺', 'temple'],
      ['內門宋江陣廣場', 'monument'],
    ],
  ],
  E36: [
    [
      ['茂林瀑布', 'waterfall'],
      ['茂林森林', 'forest'],
    ],
  ],
  E37: [
    [
      ['桃源溫泉', 'hotSpring'],
      ['桃源森林', 'forest'],
    ],
  ],
  E38: [
    [
      ['那瑪夏螢火蟲', 'forest'],
      ['楠梓仙溪', 'wetland'],
    ],
  ],
};

const TWO_OFFSETS: readonly [HexPoint, HexPoint] = [
  { x: -0.68, z: 0.22 },
  { x: 0.68, z: -0.22 },
];

/** Dedicated features need a little more air around their larger silhouettes. */
const HERO_PAIR_OFFSETS: readonly [HexPoint, HexPoint] = [
  { x: -0.72, z: 0.22 },
  { x: 0.72, z: -0.22 },
];
const ONE_OFFSET: HexPoint = { x: 0, z: 0 };

function tileSeeds(tileId: string): readonly LandmarkSeed[] {
  const tile = HEX_TILE_BY_ID.get(tileId);
  if (!tile) throw new Error(`Unknown tile ${tileId}`);
  const byTile = LANDMARKS_BY_DISTRICT[tile.districtId];
  if (!byTile) throw new Error(`Missing landmarks for ${tile.district.name}`);
  return byTile[tile.districtTileIndex] ?? byTile[0] ?? [];
}

export const HEX_LANDMARKS: HexLandmark[] = HEX_TILES.flatMap(
  (tile, tileIndex) => {
    const seeds = tileSeeds(tile.id);
    const heroes = seeds.filter((seed) => seed[2]).length;
    const angle = (tileIndex % 9) * 0.11;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const pairScale = heroes === 2 ? 0.72 : heroes === 1 ? 0.92 : 0.98;
    const baseScale = seeds.length === 1 ? 1.26 : pairScale;
    return seeds.map(([label, kind, feature], index) => {
      const base =
        seeds.length === 1
          ? ONE_OFFSET
          : heroes > 0
            ? HERO_PAIR_OFFSETS[index]!
            : TWO_OFFSETS[index]!;
      return {
        id: `${tile.id}-${index === 0 ? 'a' : 'b'}`,
        districtId: tile.districtId,
        tileId: tile.id,
        label,
        kind,
        ...(feature ? { feature } : {}),
        offset: {
          x: base.x * cos - base.z * sin,
          z: base.x * sin + base.z * cos,
        },
        rotation: feature ? 0 : angle + index * 0.35,
        scale: baseScale + (tileIndex % 3) * 0.015,
      };
    });
  },
);

export const LANDMARKS_BY_TILE = new Map<string, HexLandmark[]>();
for (const landmark of HEX_LANDMARKS) {
  const list = LANDMARKS_BY_TILE.get(landmark.tileId) ?? [];
  list.push(landmark);
  LANDMARKS_BY_TILE.set(landmark.tileId, list);
}

for (const tile of HEX_TILES) {
  tile.landmarkIds = (LANDMARKS_BY_TILE.get(tile.id) ?? []).map(
    (landmark) => landmark.id,
  );
}

export const LANDMARK_BY_ID = new Map(
  HEX_LANDMARKS.map((landmark) => [landmark.id, landmark]),
);

export function landmarksForDistrict(districtId: string): HexLandmark[] {
  return (HEX_TILES_BY_DISTRICT.get(districtId) ?? []).flatMap(
    (tile) => LANDMARKS_BY_TILE.get(tile.id) ?? [],
  );
}

export function dedicatedLandmarks(): HexLandmark[] {
  return HEX_LANDMARKS.filter((landmark) => landmark.feature);
}

export function landmarkWorldPosition(landmark: HexLandmark): HexPoint {
  const tile = HEX_TILE_BY_ID.get(landmark.tileId);
  if (!tile) throw new Error(`Unknown tile for landmark ${landmark.id}`);
  return {
    x: tile.center.x + landmark.offset.x,
    z: tile.center.z + landmark.offset.z,
  };
}
