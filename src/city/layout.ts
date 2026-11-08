import { CANDIDATE_ANCHOR, candidateMarkerPosition } from './anchors';
import { CityBuilder, type DetailLevel, seededRandom } from './builder';
import {
  apartment,
  civicHall,
  officeBlock,
  paletteFor,
  shophouse,
  temple,
  tower,
} from './buildings';
import {
  banpingMountain,
  distantSkyline,
  dragonTigerPagodas,
  oldCityGate,
  parkPavilion,
  pavilionBridge,
  springAutumnPavilions,
} from './landmarks';
import {
  bench,
  bus,
  busStop,
  car,
  container,
  ferry,
  gantryCrane,
  lanternString,
  lotusBoat,
  pedestrian,
  planter,
  scooter,
  ship,
  stall,
  trashBin,
} from './props';
import {
  archBridge,
  boardwalk,
  crosswalk,
  footpath,
  lightRail,
  plaza,
  powerLine,
  roadX,
  roadZ,
  streetlight,
  zigzagBridge,
} from './streets';
import { scatterTrees, type TreeSpec } from './vegetation';

export { CANDIDATE_ANCHOR, candidateMarkerPosition };

/**
 * The miniature Zuoying–Nanzih world.
 *
 * 1 world unit represents roughly 80 metres of real ground, deliberately
 * compressed so both districts read as one walkable diorama. Landmark
 * positions keep their real relative bearings: Lotus Pond and the pagodas in
 * the west, Houjing River through the middle-east, Metropolitan Park in the
 * north-east and the harbour to the south.
 */

export type MergedParts = Array<{
  key: Parameters<CityBuilder['add']>[1];
  geometry: import('three').BufferGeometry;
}>;

export type Focus = {
  target: [number, number, number];
  offset: [number, number, number];
  radius: number;
};

export type LandmarkId =
  | 'dragon-tiger-pagodas'
  | 'lotus-pond'
  | 'spring-autumn-pavilions'
  | 'old-city-gate'
  | 'zuoying-old-street'
  | 'houjing-river'
  | 'metropolitan-park'
  | 'nanzih-neighborhood'
  | 'harbor-front';

export type LandmarkSpec = {
  id: LandmarkId;
  label: string;
  english: string;
  blurb: string;
  x: number;
  z: number;
  focus: Focus;
  build?: (builder: CityBuilder, detail: DetailLevel) => void;
};

export const POND_OUTLINE: Array<[number, number]> = [
  [-15.6, -2.0],
  [-13.6, -1.7],
  [-11.4, -1.55],
  [-9.2, -1.5],
  [-7.6, -1.6],
  [-6.4, -1.75],
  [-4.9, -1.9],
  [-3.7, -2.3],
  [-2.9, -3.0],
  [-2.55, -4.1],
  [-2.6, -5.4],
  [-3.0, -6.7],
  [-3.9, -7.9],
  [-5.3, -8.8],
  [-7.2, -9.4],
  [-9.4, -9.6],
  [-11.6, -9.4],
  [-13.6, -8.7],
  [-15.1, -7.6],
  [-16.0, -6.2],
  [-16.2, -4.2],
  [-15.9, -2.8],
];

export const RIVER_POINTS: Array<[number, number]> = [
  [7.9, -14.5],
  [7.3, -11.5],
  [7.9, -8.5],
  [8.6, -5.5],
  [8.2, -2.5],
  [7.4, 0.5],
  [7.8, 3.5],
  [8.8, 6.5],
  [8.4, 9.5],
  [7.6, 12.5],
  [8.0, 15.2],
];

export const DISTRICT_FOCUS = {
  zuoying: {
    target: [-6.5, 0.2, -0.5] as [number, number, number],
    offset: [13, 17, 15] as [number, number, number],
    radius: 15,
  },
  nanzih: {
    target: [9.5, 0.2, 1.5] as [number, number, number],
    offset: [13, 16, 15] as [number, number, number],
    radius: 14,
  },
  overview: {
    target: [0, 0.2, 1.0] as [number, number, number],
    offset: [16, 22, 21] as [number, number, number],
    radius: 15.6,
  },
};

export const LANDMARKS: LandmarkSpec[] = [
  {
    id: 'dragon-tiger-pagodas',
    label: '龍虎塔',
    english: 'Dragon and Tiger Pagodas',
    blurb:
      '兩座七層寶塔以龍、虎張口的入口聞名，是蓮池潭最具辨識度的天際線。此為藝術化重建，並非施工現況紀錄。',
    x: -6.2,
    z: -3.55,
    focus: {
      target: [-6.2, 1.35, -3.2],
      offset: [6.5, 6.2, 8.0],
      radius: 4.2,
    },
    build: (b, detail) => {
      dragonTigerPagodas(b, -6.2, -3.55, detail);
      // Nine-turn approach bridge from the south shore.
      const points: Array<[number, number]> = [
        [-4.7, -1.28],
        [-5.45, -1.72],
        [-5.02, -2.04],
        [-5.95, -2.36],
        [-6.2, -2.62],
      ];
      zigzagBridge(b, points, {
        width: 0.5,
        height: 0.16,
        railKey: 'plasterWhite',
        detail,
      });
      b.box(0.8, 0.05, 0.5, -4.7, 0.11, -1.2, 'stone');
    },
  },
  {
    id: 'lotus-pond',
    label: '蓮池潭',
    english: 'Lotus Pond',
    blurb:
      '左營最具代表性的水域，環潭步道串連龍虎塔、春秋閣與在地廟宇。水面與蓮葉為縮尺藝術表現。',
    x: -9.2,
    z: -5.2,
    focus: {
      target: [-9.2, 0.4, -5.2],
      offset: [11, 10, 12],
      radius: 8.5,
    },
  },
  {
    id: 'spring-autumn-pavilions',
    label: '春秋閣',
    english: 'Spring and Autumn Pavilions',
    blurb:
      '兩座臨水樓閣與觀音騎龍像，以曲橋與西岸相連。屋頂與比例採風格化重現。',
    x: -11.8,
    z: -6.2,
    focus: {
      target: [-11.8, 0.9, -6.2],
      offset: [6.0, 5.4, 7.0],
      radius: 4.0,
    },
    build: (b, detail) => {
      springAutumnPavilions(b, -11.8, -6.2, detail);
      pavilionBridge(b, -16.2, -13.35, -6.2);
    },
  },
  {
    id: 'old-city-gate',
    label: '左營舊城東門',
    english: 'East Gate of Old Zuoying',
    blurb:
      '清代鳳山縣舊城的東門，城牆與門樓見證左營的聚落起源。磚牆細節為縮尺詮釋。',
    x: -15.9,
    z: 3.4,
    focus: {
      target: [-15.7, 1.0, 3.4],
      offset: [6.0, 5.2, 6.4],
      radius: 3.4,
    },
    build: (b, detail) => {
      oldCityGate(b, -15.9, 3.4, detail);
      b.box(1.0, 0.05, 0.9, -16.4, 0.09, 3.4, 'stone');
    },
  },
  {
    id: 'zuoying-old-street',
    label: '左營舊街',
    english: 'Zuoying Old Streets',
    blurb:
      '廟宇、透天店面與騎樓交織的舊聚落。街道尺度與店招為風格化重組，並非精確測繪。',
    x: -8.2,
    z: 3.0,
    focus: {
      target: [-8.8, 0.8, 3.2],
      offset: [9.5, 10.5, 10.5],
      radius: 6.0,
    },
  },
  {
    id: 'houjing-river',
    label: '後勁溪',
    english: 'Houjing River',
    blurb:
      '穿越楠梓的後勁溪，河岸步道與橋梁串連住宅、公園與通勤路線。河道線形為藝術化簡化。',
    x: 8.0,
    z: 2.0,
    focus: {
      target: [8.0, 0.4, -3.2],
      offset: [3.4, 7.0, 4.2],
      radius: 5.0,
    },
  },
  {
    id: 'metropolitan-park',
    label: '高雄都會公園',
    english: 'Kaohsiung Metropolitan Park',
    blurb:
      '楠梓北側的大片綠地，草坡、樹叢與步道構成城市邊緣的呼吸空間。地形與植栽為縮尺重現。',
    x: 13.0,
    z: -6.8,
    focus: {
      target: [11.9, 0.5, -8.4],
      offset: [-4.4, 9.0, 6.0],
      radius: 4.3,
    },
    build: (b) => {
      parkPavilion(b, 12.6, -9.4);
      b.box(1.7, 0.04, 1.7, 12.6, 0.09, -9.4, 'stone');
      // Timber observation deck.
      b.box(1.4, 0.08, 1.2, 10.4, 0.3, -11.4, 'wood');
      b.box(1.4, 0.3, 0.06, 10.4, 0.45, -10.82, 'woodDark');
      for (const side of [-0.65, 0.65]) {
        b.box(0.06, 0.6, 0.06, 10.4 + side, 0.3, -11.4, 'woodDark');
      }
    },
  },
  {
    id: 'nanzih-neighborhood',
    label: '楠梓街區',
    english: 'Nanzih Neighbourhoods',
    blurb:
      '楠梓的住宅大樓、透天店面與科學園區邊緣，呈現與左營舊聚落不同的現代都市紋理。',
    x: 12.6,
    z: 5.4,
    focus: {
      target: [12.4, 0.8, 5.0],
      offset: [10, 11, 10],
      radius: 6.5,
    },
  },
  {
    id: 'harbor-front',
    label: '港灣前哨',
    english: 'Harbour Front',
    blurb:
      '南側的港區邊緣：貨櫃、龍門吊與渡輪，提示高雄作為港灣城市的尺度。非實際港區作業範圍。',
    x: 4.0,
    z: 11.6,
    focus: {
      target: [2.0, 0.8, 11.4],
      offset: [12, 10, 13],
      radius: 7.5,
    },
    build: (b, detail) => {
      container(b, 6.2, 10.9, 0, 'templeRed', 1);
      container(b, 7.3, 10.9, 0, 'vehicleTeal', 0);
      container(b, 10.4, 10.9, 0, 'coral', 1);
      gantryCrane(b, 8.3, 11.55, Math.PI / 2);
      gantryCrane(b, 12.6, 11.55, Math.PI / 2);
      ship(b, 9.8, 13.2, Math.PI / 2);
      ferry(b, -4.6, 12.1, 0.2);
      if (detail === 'high') {
        b.cylinder(0.12, 0.18, 0.7, 8, 15.0, 0.4, 15.0, 'plasterWhite');
        b.cylinder(0.13, 0.13, 0.16, 8, 15.0, 0.78, 15.0, 'templeRed');
        b.cone(0.2, 0.18, 8, 15.0, 0.95, 15.0, 'templeRed');
      }
    },
  },
];

function fillShops(
  b: CityBuilder,
  options: {
    x1: number;
    x2: number;
    z: number;
    facing: 1 | -1;
    seed: number;
    detail: DetailLevel;
    floors?: number[];
    depth?: number;
  },
) {
  const {
    x1,
    x2,
    z,
    facing,
    seed,
    detail,
    floors = [2, 3, 4],
    depth = 1.0,
  } = options;
  const random = seededRandom(seed);
  let cursor = x1;
  let index = 0;
  while (x2 - cursor > 0.62) {
    const width = Math.min(x2 - cursor, 0.95 + random() * 0.55);
    if (width < 0.68) break;
    const palette = paletteFor(seed + index * 31);
    shophouse(b, {
      x: cursor + width / 2,
      z,
      rotY: facing === 1 ? 0 : Math.PI,
      width: width - 0.04,
      depth,
      floors: floors[Math.floor(random() * floors.length)] ?? 3,
      palette,
      detail,
      arcade: random() > 0.18,
      awning: random() > 0.22,
      seed: seed + index * 7,
    });
    cursor += width;
    index += 1;
  }
}

function fillApartments(
  b: CityBuilder,
  positions: Array<{
    x: number;
    z: number;
    width: number;
    depth: number;
    floors: number;
    rotY?: number;
  }>,
  detail: DetailLevel,
  seed = 17,
) {
  positions.forEach((position, index) => {
    apartment(b, {
      ...position,
      palette: paletteFor(seed + index * 23),
      detail,
      seed: seed + index * 11,
    });
  });
}

function oldTown(b: CityBuilder, detail: DetailLevel) {
  const road = 0.82;
  // East-west streets.
  roadX(b, { x1: -15.4, x2: -4.2, z: 1.0, width: road, detail });
  roadX(b, { x1: -15.4, x2: -4.2, z: 3.5, width: road - 0.05, detail });
  roadX(b, { x1: -15.4, x2: -4.2, z: 5.9, width: road, detail });
  // North-south lanes.
  for (const x of [-13.6, -10.2, -6.9]) {
    roadZ(b, { z1: 1.0, z2: 5.9, x, width: 0.7, detail });
  }
  // Clean intersections. Three crossings are enough to read the street grid;
  // the previous 18 crossing marks were visual noise at miniature scale.
  for (const [x, z] of [
    [-10.2, 1.0],
    [-10.2, 5.9],
    [-6.9, 3.5],
  ] as Array<[number, number]>) {
    b.box(0.86, 0.05, 0.86, x, 0.072, z, 'road');
    crosswalk(b, { x, z: z + 0.55, across: 'x', width: 0.82, length: 0.35 });
    crosswalk(b, { x: x + 0.5, z, across: 'z', width: 0.82, length: 0.35 });
  }

  const segments: Array<[number, number]> = [
    [-15.2, -14.2],
    [-13.0, -10.7],
    [-9.7, -7.4],
    [-6.4, -4.1],
  ];
  const rows: Array<{ z: number; facing: 1 | -1 }> = [
    { z: 0.18, facing: 1 },
    { z: 1.78, facing: -1 },
    { z: 4.28, facing: -1 },
    { z: 5.28, facing: 1 },
  ];
  rows.forEach((row, rowIndex) => {
    segments.forEach((segment, segmentIndex) => {
      if (row.z > 2.2 && row.z < 5.8 && segmentIndex === 3) return;
      // Leave a forecourt in front of the Dragon and Tiger Pagodas so the
      // sculpted entrances and the nine-turn bridge stay legible from the
      // standard city camera.
      if (row.z < 2.2 && segmentIndex === 3) return;
      fillShops(b, {
        x1: segment[0],
        x2: segment[1],
        z: row.z,
        facing: row.facing,
        seed: 100 + rowIndex * 37 + segmentIndex * 13,
        detail,
        floors: row.z > 4.8 ? [2, 3] : [2, 3, 4],
      });
    });
  });

  // Temple square at the edge of the plaza.
  b.box(2.3, 0.05, 2.7, -4.75, 0.1, 4.3, 'stone');
  temple(b, { x: -4.65, z: 4.2, rotY: Math.PI / 2, detail, scale: 0.72 });
  bench(b, -3.5, 3.0, Math.PI / 2);
  planter(b, -3.4, 5.6, detail);

  // Promenade along the pond and a stone landing at the pagoda entrance.
  boardwalk(b, { x1: -14.8, z1: -1.1, x2: -3.4, z2: -1.1, width: 0.6, detail });
  b.box(2.6, 0.04, 0.9, -6.1, 0.11, -1.15, 'stone');
  // Pagoda forecourt: paving, planting and a bench instead of a solid
  // shophouse row, preserving a clear view of the dragon and tiger heads.
  b.box(2.15, 0.045, 1.45, -5.25, 0.105, 0.55, 'stone');
  bench(b, -4.35, 0.1, -Math.PI / 2);
  planter(b, -6.05, 0.2, detail);
  planter(b, -6.05, 1.0, detail);
  for (const x of [-14.4, -10.8, -7.2, -3.8]) {
    streetlight(b, x, -0.55, 0, detail);
  }
  bench(b, -12.0, -0.6, Math.PI);
  bench(b, -4.8, -0.6, Math.PI);

  // West waterfront path to the Spring & Autumn bridge.
  footpath(
    b,
    [
      [-16.3, -1.2],
      [-16.6, -3.2],
      [-16.7, -5.0],
      [-16.4, -6.2],
    ],
    0.42,
  );
  for (const z of [-2.4, -4.2, -5.8]) {
    streetlight(b, -16.5, z, 0, detail);
  }

  // Parked scooters along the main lane.
  const random = seededRandom(411);
  for (let i = 0; i < 4; i += 1) {
    scooter(
      b,
      -14.4 + i * 2.0,
      1.42,
      Math.PI / 2 + (random() - 0.5) * 0.12,
      random() > 0.5 ? 'vehicleCream' : 'vehicleCoral',
      detail,
    );
  }
  scooter(b, -5.9, 5.4, 0, 'vehicleBlue', detail);

  // One market stall leaves the temple forecourt open.
  stall(b, -5.4, 2.2, 0.2, 'coral');
  lanternString(
    b,
    [
      [-6.2, 3.0],
      [-5.0, 3.0],
      [-3.9, 3.0],
    ],
    1.1,
  );
}

function plazaArea(b: CityBuilder, detail: DetailLevel) {
  plaza(b, { x: 0.6, z: 5.3, width: 5.2, depth: 4.6, detail });

  // Candidate walking loop: plaza, pond east shore, park edge, then back.
  footpath(
    b,
    [
      [0.6, 5.8],
      [-2.3, 5.8],
      [-2.3, -8.8],
      [2.0, -8.8],
      [2.0, -1.0],
      [0.6, 1.0],
      [0.6, 5.8],
    ],
    0.34,
    'stone',
  );
  civicHall(b, { x: 0.7, z: 2.5, width: 4.4, depth: 1.9, rotY: 0, detail });
  // Connectors shared with HERO_WALK_GRAPH: south edge -> Nanzih loop,
  // and the west-bank link from the old-town crossing to the river path.
  footpath(
    b,
    [
      [2.0, -8.8],
      [2.0, -6.4],
      [6.15, -6.4],
    ],
    0.3,
    'stone',
  );
  footpath(
    b,
    [
      [2.0, -1.0],
      [6.2, 0.5],
    ],
    0.3,
    'stone',
  );
  // Low planting and benches frame the candidate markers without blocking them.
  for (const x of [-1.7, 0.6, 2.9]) {
    planter(b, x, 7.25, detail);
  }
  bench(b, -1.6, 4.0, Math.PI / 2);
  bench(b, 2.8, 4.0, -Math.PI / 2);
  for (const x of [-1.9, 0.6, 3.1]) {
    streetlight(b, x, 3.15, 0, detail);
  }
  b.box(0.1, 0.02, 0.1, 2.9, 0.1, 4.6, 'metalDark');
}

function nanzih(b: CityBuilder, detail: DetailLevel) {
  // River crossing roads and lanes.
  roadX(b, { x1: 9.0, x2: 17.0, z: 0.6, width: 0.9, detail });
  roadX(b, { x1: 3.0, x2: 6.8, z: 4.2, width: 0.85, detail });
  roadX(b, { x1: 9.2, x2: 17.0, z: 4.2, width: 0.85, detail });
  roadX(b, { x1: -1.8, x2: 6.8, z: 7.6, width: 0.95, detail });
  roadX(b, { x1: 9.4, x2: 17.0, z: 7.6, width: 0.95, detail });
  roadZ(b, { z1: 0.6, z2: 7.6, x: 5.2, width: 0.65, detail });
  roadZ(b, { z1: -2.2, z2: 7.6, x: 9.9, width: 0.8, detail });
  roadZ(b, { z1: -2.2, z2: 7.6, x: 14.2, width: 0.8, detail });
  for (const z of [0.6, 4.2, 7.6]) {
    for (const x of [9.9, 14.2]) {
      b.box(0.88, 0.05, 0.88, x, 0.072, z, 'road');
    }
  }
  crosswalk(b, { x: 5.2, z: 4.2, across: 'x', width: 0.8, length: 0.4 });
  crosswalk(b, { x: 10.0, z: 4.2, across: 'x', width: 0.8, length: 0.4 });
  crosswalk(b, { x: 14.2, z: 4.2, across: 'x', width: 0.8, length: 0.4 });

  // Cross-river road bridges.
  archBridge(b, {
    x: 8.15,
    z: 4.2,
    length: 2.5,
    width: 1.0,
    rise: 0.28,
    detail,
    color: 'stone',
  });
  archBridge(b, {
    x: 8.3,
    z: 7.6,
    length: 2.5,
    width: 1.05,
    rise: 0.26,
    detail,
    color: 'stone',
  });
  archBridge(b, {
    x: 8.1,
    z: -6.4,
    length: 2.4,
    width: 0.9,
    rise: 0.4,
    detail,
    color: 'teal',
  });
  footpath(
    b,
    [
      [6.15, -6.4],
      [6.9, -6.4],
    ],
    0.3,
    'stone',
  );
  footpath(
    b,
    [
      [9.3, -6.4],
      [10.05, -6.4],
      [10.2, -7.1],
    ],
    0.3,
    'stone',
  );

  // West-of-river strip: low-rise homes and a small market.
  fillApartments(
    b,
    [{ x: 4.5, z: 2.2, width: 2.0, depth: 1.4, floors: 5, rotY: 0 }],
    detail,
    41,
  );
  shophouse(b, {
    x: 6.2,
    z: 2.0,
    rotY: 0,
    width: 1.0,
    depth: 1.1,
    floors: 2,
    palette: paletteFor(77),
    detail,
  });
  stall(b, 6.0, 5.9, -0.4, 'teal');
  lanterStringSafe(b);
  bench(b, 6.3, 6.8, Math.PI / 2);
  planter(b, 3.7, 4.9, detail);

  // East of the river: dense residential blocks.
  fillApartments(
    b,
    [
      { x: 10.9, z: 1.5, width: 2.3, depth: 1.25, floors: 6, rotY: Math.PI },
      { x: 10.9, z: 3.25, width: 2.3, depth: 1.25, floors: 7, rotY: 0 },
      { x: 10.4, z: 6.6, width: 2.1, depth: 1.2, floors: 6, rotY: 0 },
    ],
    detail,
    19,
  );
  tower(b, {
    x: 12.6,
    z: 5.5,
    width: 1.8,
    depth: 1.65,
    floors: 11,
    palette: paletteFor(211),
    detail,
    crown: 'lantern',
  });
  tower(b, {
    x: 15.6,
    z: 7.0,
    width: 1.7,
    depth: 1.5,
    floors: 12,
    palette: paletteFor(229),
    detail,
    crown: 'lantern',
  });

  // Neighbourhood row facing the northern road.
  fillShops(b, {
    x1: 10.0,
    x2: 13.8,
    z: -0.4,
    facing: 1,
    seed: 301,
    detail,
    floors: [2, 3, 4],
    depth: 1.1,
  });

  // Science-park edge offices.
  officeBlock(b, {
    x: 15.4,
    z: -1.2,
    width: 1.9,
    depth: 1.5,
    floors: 6,
    detail,
    rotY: Math.PI,
  });
  // Pocket plaza between the towers.
  plaza(b, { x: 12.0, z: 6.6, width: 1.9, depth: 1.6, detail, bands: false });
  for (const x of [9.8, 14.2]) {
    streetlight(b, x, 4.4, 0, detail);
  }
  streetlight(b, 9.85, 2.2, Math.PI / 2, detail);

  // One car, one bus and two scooters keep the streets inhabited without a
  // parking-lot of repeated props.
  car(b, 10.8, 4.35, Math.PI / 2, 'vehicleCream', detail);
  bus(b, 11.8, 0.75, Math.PI / 2, detail);
  for (let i = 0; i < 2; i += 1) {
    scooter(b, 14.5, 2.2 + i * 0.28, 0, 'vehicleTeal', detail);
  }
  pedestrian(b, 10.2, 4.9, -0.4, 'coral', detail);
}

function lanterStringSafe(b: CityBuilder) {
  // A short string of lanterns over the market corner.
  lanternString(
    b,
    [
      [5.4, 5.0],
      [6.6, 5.0],
      [6.6, 6.6],
    ],
    1.15,
  );
}

function park(b: CityBuilder, detail: DetailLevel) {
  // Flowering beds add warm colour between the paths.
  for (const [fx, fz, key] of [
    [12.0, -4.7, 'coral'],
    [14.4, -6.7, 'gold'],
  ] as Array<[number, number, Parameters<CityBuilder['sphere']>[4]]>) {
    b.sphere(0.24, fx, 0.075, fz, key, 16, 10, [1.4, 0.06, 1]);
    b.sphere(0.12, fx + 0.22, 0.09, fz - 0.12, 'foliage', 12, 8, [1, 0.5, 1]);
  }
  // Winding paths.
  footpath(
    b,
    [
      [10.0, -2.8],
      [11.4, -4.4],
      [12.1, -5.6],
      [13.7, -6.6],
      [14.9, -7.9],
      [15.0, -9.2],
    ],
    0.4,
  );
  footpath(
    b,
    [
      [13.8, -6.7],
      [14.0, -9.6],
      [12.9, -11.0],
    ],
    0.3,
    'stone',
  );
  // Small lake is added as water geometry; a timber deck and benches face it.
  boardwalk(b, {
    x1: 10.2,
    z1: -6.15,
    x2: 13.1,
    z2: -6.15,
    width: 0.36,
    detail,
  });
  // Short links from the footbridge exit and deck to the verified park path.
  footpath(
    b,
    [
      [10.2, -7.1],
      [10.2, -6.15],
    ],
    0.3,
    'stone',
  );
  footpath(
    b,
    [
      [13.1, -6.15],
      [13.7, -6.6],
    ],
    0.3,
    'stone',
  );
  footpath(
    b,
    [
      [9.9, -1.4],
      [10.0, -2.8],
    ],
    0.3,
    'stone',
  );
  bench(b, 11.1, -5.2, Math.PI / 2);
  bench(b, 13.6, -8.4, -0.4);
  for (const [x, z] of [
    [10.6, -3.4],
    [15.4, -7.2],
    [10.0, -8.4],
  ] as Array<[number, number]>) {
    streetlight(b, x, z, 0, detail);
  }
  // Playground.
  b.box(1.0, 0.06, 0.7, 14.5, 0.11, -10.2, 'sand');
  b.box(0.08, 0.5, 0.08, 14.1, 0.35, -10.4, 'templeRed');
  b.box(0.08, 0.5, 0.08, 14.7, 0.35, -10.4, 'tealDeep');
  b.box(0.7, 0.06, 0.08, 14.4, 0.58, -10.4, 'wood');
  b.box(0.5, 0.03, 0.1, 14.4, 0.32, -10.4, 'wood');
  b.sphere(0.12, 15.0, 0.18, -9.9, 'coral', 7, 6, [1, 1, 1]);
  b.cylinder(0.02, 0.02, 0.3, 4, 15.0, 0.27, -9.9, 'metal');
}

function harbour(b: CityBuilder, detail: DetailLevel) {
  // Quay, warehouses and harbour edge.
  b.box(34, 0.12, 1.6, 0, 0.04, 10.9, 'concrete');
  b.box(34, 0.16, 0.16, 0, 0.1, 11.68, 'stoneDark');
  for (let x = -16; x <= 16; x += 2.6) {
    b.cylinder(0.05, 0.06, 0.1, 6, x, 0.1, 11.6, 'metalDark');
  }
  // One warehouse plus the ferry terminal reads as a working edge without a
  // wall of repeated sheds.
  for (const x of [-9.5]) {
    b.box(3.2, 1.0, 1.2, x, 0.58, 10.35, 'plasterSky');
    b.gableRoof(3.1, 1.15, 0.35, x, 1.06, 10.35, 'roofSlate', 0.08);
    b.box(3.0, 0.08, 0.05, x, 0.72, 10.78, 'glassDark');
    b.box(0.7, 0.5, 0.03, x + 1.1, 0.3, 10.76, 'metalDark');
  }
  // Ferry terminal.
  b.box(2.2, 0.8, 1.3, -4.2, 0.6, 10.5, 'plasterWhite');
  b.box(2.4, 0.08, 1.5, -4.2, 1.03, 10.5, 'tealDeep');
  b.box(1.6, 0.3, 0.06, -4.2, 0.7, 11.16, 'glassDark');
  b.box(0.8, 0.05, 0.3, -4.2, 1.08, 11.0, 'teal');
  for (const x of [-6.0, -4.8, -3.6]) {
    b.box(0.06, 0.7, 0.06, x, 0.35, 11.0, 'metalDark');
  }
  // Far shore and skyline.
  b.box(34, 0.2, 1.6, 0, 0.06, 15.9, 'stoneDark');
  distantSkyline(b, 1.8, 16.1);
  // Breakwater lighthouse.
  b.box(5.0, 0.2, 0.5, 13.0, 0.2, 15.0, 'stone');
  b.cylinder(0.2, 0.26, 0.8, 8, 15.2, 0.55, 15.0, 'plasterWhite');
  b.cylinder(0.22, 0.22, 0.14, 8, 15.2, 0.62, 15.0, 'templeRed');
  b.cylinder(0.16, 0.19, 0.14, 8, 15.2, 0.96, 15.0, 'templeRed');
  b.sphere(0.09, 15.2, 1.1, 15.0, 'lightWarm', 6, 6, [1, 1, 1]);

  // Boulevard, rail and stations.
  roadX(b, { x1: -16.2, x2: 16.2, z: 8.3, width: 1.1, detail });
  lightRail(b, { x1: -16.2, x2: 6.7, z: 9.4, detail });
  lightRail(b, { x1: 9.5, x2: 16.2, z: 9.4, detail });
  for (const x of [-14.8, -8.2, -1.6, 5.0]) {
    streetlight(b, x, 7.8, 0, detail);
  }
  for (const x of [10.8, 16.2]) {
    streetlight(b, x, 7.8, 0, detail);
  }
  busStop(b, -1.6, 9.8, 0, detail);
  // Station platform west of the river.
  b.box(3.6, 0.14, 0.6, 4.9, 0.1, 9.4, 'concrete');
  b.box(3.6, 0.04, 0.5, 4.9, 0.19, 9.4, 'sidewalk');
  b.box(2.8, 0.06, 0.5, 4.9, 0.28, 8.55, 'tealDeep');
  for (const x of [3.7, 6.1]) {
    b.cylinder(0.04, 0.05, 0.5, 6, x, 0.25, 8.55, 'metalDark');
  }
  // Stray containers and service vehicles.
  container(b, -1.0, 10.2, 0, 'vehicleYellow', 0);
  car(b, 2.6, 10.0, Math.PI / 2, 'vehicleTeal', detail);
  bus(b, 1.0, 8.2, -Math.PI / 2, detail);
}

export function buildStaticCity(detail: DetailLevel): MergedParts {
  const b = new CityBuilder();

  // The ground is the authoritative district polygon mesh in WorldLayer.
  // Do not add a rectangular diorama base here: it would replace the
  // geographic footprint whenever the hero detail layer is visible.

  // Banping Mountain closes the view behind Lotus Pond.
  banpingMountain(b, -12.2, -12.4, 0.78);

  // Soft meadow patches, deterministic and sparse. Twenty-four sides keep
  // the rims curved instead of reading as large flat polygons.
  const random = seededRandom(913);
  for (let i = 0; i < 18; i += 1) {
    const x = -16 + random() * 32;
    const z = -14 + random() * 26;
    if (x < -2 && z < -1.2 && z > -10.2) continue;
    if (x > 6 && x < 10) continue;
    if (x > 9.5 && z < -1.5) continue;
    if (Math.abs(x - 8) < 1.9) continue;
    if (z > 7) continue;
    b.sphere(
      0.55 + random() * 0.85,
      x,
      0.072,
      z,
      i % 2 === 0 ? 'grassWarm' : 'grassDark',
      24,
      14,
      [1, 0.025, 1],
    );
  }

  oldTown(b, detail);
  plazaArea(b, detail);
  nanzih(b, detail);
  park(b, detail);
  harbour(b, detail);

  // Street trees and promenade planting.
  for (let x = -16.0; x <= -4.0; x += 1.6) {
    b.cylinder(0.03, 0.04, 0.38, 5, x, 0.27, -0.55, 'trunk');
    b.sphere(0.22, x, 0.6, -0.55, 'foliageLight', 6, 6, [1, 0.8, 1]);
  }
  // Pond-edge reeds are instanced; add a few large banyans on the promenade.
  for (const [x, z] of [
    [-13.6, -1.1],
    [-9.0, -0.9],
    [-4.4, -0.8],
  ] as Array<[number, number]>) {
    b.cylinder(0.08, 0.12, 0.55, 6, x, 0.34, z, 'trunk');
    b.sphere(0.5, x, 0.85, z, 'foliageDeep', 7, 6, [1.3, 0.7, 1.2]);
    b.sphere(0.34, x + 0.35, 0.72, z + 0.1, 'foliageTeal', 6, 6, [1, 0.7, 1]);
  }
  // Riverside embankment on the city side.
  for (let i = 0; i < RIVER_POINTS.length - 1; i += 1) {
    const a = RIVER_POINTS[i];
    const c = RIVER_POINTS[i + 1];
    if (!a || !c) continue;
    const dx = c[0] - a[0];
    const dz = c[1] - a[1];
    const length = Math.hypot(dx, dz);
    const angle = Math.atan2(-dz, dx);
    // Both channel walls sit on the bank ribbon, tight to the water.
    for (const side of [-1, 1]) {
      const cx = (a[0] + c[0]) / 2 + Math.sin(angle) * 0.72 * side;
      const cz = (a[1] + c[1]) / 2 + Math.cos(angle) * 0.72 * side;
      b.box(length, 0.16, 0.09, cx, 0.08, cz, 'stoneDark', angle);
      b.box(length, 0.035, 0.15, cx, 0.175, cz, 'stone', angle);
    }
  }
  // Riverbank footpath and reeds.
  footpath(
    b,
    [
      [6.35, -1.8],
      [6.2, 0.5],
      [6.6, 3.4],
      [7.3, 6.2],
      [7.0, 8.0],
    ],
    0.36,
    'wood',
  );
  footpath(
    b,
    [
      [9.9, -1.4],
      [9.9, 3.6],
      [9.7, 6.8],
    ],
    0.34,
  );

  // Street furniture and daily life around the plaza / boulevard.
  pedestrian(b, 0.2, 7.6, 2.3, 'tealDeep', detail);
  pedestrian(b, -0.6, 4.5, 0.8, 'gold', detail);
  pedestrian(b, -12.8, 5.2, -2.2, 'vehicleCoral', detail);
  pedestrian(b, 13.1, 6.9, 2.0, 'vehicleBlue', detail);
  trashBin(b, 3.15, 7.3);
  trashBin(b, -1.0, 4.0);
  for (const x of [-1.8, 3.0]) {
    for (const z of [3.4, 7.1]) {
      b.cylinder(0.035, 0.045, 0.2, 6, x, 0.1, z, 'metalDark');
    }
  }
  lanternString(
    b,
    [
      [-6.2, 5.95],
      [-4.6, 5.95],
      [-3.0, 5.95],
    ],
    1.2,
  );

  // Light poles along the promenade and boulevard edge.
  for (const x of [-14.6, -11.8, -8.6]) {
    streetlight(b, x, 0.4, Math.PI, detail);
  }

  // Power lines on the old-town lanes.
  powerLine(
    b,
    [
      [-14.6, 6.4],
      [-11.4, 6.4],
      [-8.2, 6.4],
      [-5.0, 6.4],
    ],
    detail,
  );
  powerLine(
    b,
    [
      [10.0, 7.0],
      [12.0, 7.0],
      [14.0, 7.0],
    ],
    detail,
  );

  // Parked boats on the pond.
  lotusBoat(b, -10.0, -3.2, 0.4);
  lotusBoat(b, -13.2, -4.6, -0.7);

  return b.merge();
}

export function buildLandmarks(detail: DetailLevel): Array<{
  id: LandmarkId;
  parts: MergedParts;
}> {
  return LANDMARKS.map((landmark) => {
    const builder = new CityBuilder();
    landmark.build?.(builder, detail);
    return { id: landmark.id, parts: builder.merge() };
  });
}

export function buildTrees(): TreeSpec[] {
  const trees: TreeSpec[] = [];
  // Park: dense but clumped.
  trees.push(
    ...scatterTrees({
      centerX: 13.0,
      centerZ: -7.4,
      radiusX: 3.6,
      radiusZ: 4.4,
      count: 46,
      seed: 701,
      kinds: ['broadleaf', 'banyan', 'pine', 'broadleaf', 'palm'],
      avoid: (x, z) => {
        if (Math.hypot((x - 11.6) / 3.4, (z + 7.4) / 2.75) < 1) return true;
        if (Math.hypot(x - 12.6, z + 9.4) < 2.0) return true;
        if (Math.abs(x - 11.5) < 0.6 && z > -11.6 && z < -2.6) return true;
        // Keep the lake deck, benches and playground readable from above.
        if (x > 9.8 && x < 13.5 && z > -6.8 && z < -5.5) return true;
        if (Math.hypot(x - 11.1, z + 5.2) < 1.9) return true;
        if (Math.hypot(x - 13.6, z + 8.4) < 1.9) return true;
        if (Math.hypot(x - 10.8, z + 9.9) < 1.9) return true;
        if (Math.hypot(x - 14.5, z + 10.2) < 2.0) return true;
        return false;
      },
    }),
  );
  // Wooded foothills north-east of the park close the diorama edge.
  trees.push(
    ...scatterTrees({
      centerX: 13.6,
      centerZ: -12.7,
      radiusX: 2.8,
      radiusZ: 1.5,
      count: 9,
      seed: 709,
      kinds: ['broadleaf', 'pine', 'banyan'],
    }),
  );
  // Pond promenade: palms and banyans.
  trees.push(
    ...scatterTrees({
      centerX: -8.5,
      centerZ: -0.9,
      radiusX: 6.2,
      radiusZ: 0.35,
      count: 12,
      seed: 811,
      kinds: ['palm', 'broadleaf'],
      avoid: (x, z) => x > -8.4 && x < -3.8 && z > -2.3 && z < 0.4,
    }),
  );
  trees.push(
    ...scatterTrees({
      centerX: -14.0,
      centerZ: -6.0,
      radiusX: 1.4,
      radiusZ: 2.4,
      count: 8,
      seed: 823,
      kinds: ['banyan', 'broadleaf', 'palm'],
    }),
  );
  // Old-town back lanes.
  trees.push(
    ...scatterTrees({
      centerX: -10.5,
      centerZ: 6.6,
      radiusX: 4.6,
      radiusZ: 0.22,
      count: 8,
      seed: 829,
      kinds: ['broadleaf', 'banyan'],
    }),
  );
  // Riverbanks.
  trees.push(
    ...scatterTrees({
      centerX: 6.4,
      centerZ: 1.0,
      radiusX: 0.4,
      radiusZ: 6.4,
      count: 12,
      seed: 837,
      kinds: ['broadleaf', 'palm', 'banyan'],
    }),
  );
  trees.push(
    ...scatterTrees({
      centerX: 10.0,
      centerZ: 2.2,
      radiusX: 0.45,
      radiusZ: 4.2,
      count: 9,
      seed: 839,
      kinds: ['broadleaf', 'pine'],
    }),
  );
  // Nanzih street trees.
  for (const [x, z] of [
    [10.1, 2.2],
    [10.1, 5.2],
    [13.8, 2.2],
    [13.8, 5.2],
    [9.7, 6.8],
    [14.4, 7.0],
    [4.8, 3.6],
    [5.1, 7.1],
    [3.4, 6.3],
  ] as Array<[number, number]>) {
    trees.push({
      kind: x < 6 ? 'broadleaf' : 'palm',
      x,
      z,
      scale: 0.85,
      rotY: x * 0.7,
      tint: '#6aa55f',
    });
  }
  // Mountain flank.
  for (let i = 0; i < 10; i += 1) {
    const angle = (i / 10) * Math.PI * 2;
    trees.push({
      kind: i % 3 === 0 ? 'pine' : 'broadleaf',
      x: -12.2 + Math.cos(angle) * 1.9,
      z: -12.4 + Math.sin(angle) * 1.5,
      scale: 0.55,
      rotY: angle,
      tint: '#4f8a55',
    });
  }
  return trees;
}

export function buildLotus(): {
  leaves: Array<{ x: number; z: number; scale: number; rotY: number }>;
  flowers: Array<{ x: number; z: number; scale: number }>;
} {
  const random = seededRandom(517);
  const leaves: Array<{ x: number; z: number; scale: number; rotY: number }> =
    [];
  const flowers: Array<{ x: number; z: number; scale: number }> = [];
  let guard = 0;
  while (leaves.length < 150 && guard < 4000) {
    guard += 1;
    const x = -15.2 + random() * 12.2;
    const z = -9.0 + random() * 6.8;
    if (!pointInPolygon(x, z, POND_OUTLINE)) continue;
    if (Math.hypot(x + 6.2, z + 3.55) < 1.9) continue;
    if (x > -13.7 && x < -9.9 && z > -7.5 && z < -4.9) continue;
    if (z > -2.2 && z < -0.8) continue;
    leaves.push({
      x,
      z,
      scale: 0.65 + random() * 0.85,
      rotY: random() * Math.PI * 2,
    });
  }
  for (let i = 0; i < 26; i += 1) {
    const leaf = leaves[Math.floor(random() * leaves.length)];
    if (!leaf) continue;
    flowers.push({
      x: leaf.x + 0.04,
      z: leaf.z - 0.03,
      scale: 0.7 + random() * 0.5,
    });
  }
  return { leaves, flowers };
}

export function buildPondReeds(): TreeSpec[] {
  const reeds: TreeSpec[] = [];
  const random = seededRandom(613);
  for (let i = 0; i < POND_OUTLINE.length; i += 1) {
    const a = POND_OUTLINE[i];
    const c = POND_OUTLINE[(i + 1) % POND_OUTLINE.length];
    if (!a || !c) continue;
    const steps = 3;
    for (let s = 0; s < steps; s += 1) {
      if (random() > 0.62) continue;
      const t = (s + 0.5) / steps;
      const x = a[0] + (c[0] - a[0]) * t + (random() - 0.5) * 0.18;
      const z = a[1] + (c[1] - a[1]) * t + (random() - 0.5) * 0.18;
      if (z > -1.5) continue;
      reeds.push({
        kind: 'reed',
        x,
        z,
        scale: 0.55 + random() * 0.5,
        rotY: random() * Math.PI * 2,
        tint: '#b7c47a',
      });
    }
  }
  // River reeds follow the banks.
  for (let i = 0; i < RIVER_POINTS.length - 1; i += 1) {
    const a = RIVER_POINTS[i];
    const c = RIVER_POINTS[i + 1];
    if (!a || !c) continue;
    for (let s = 0; s < 2; s += 1) {
      const t = (s + 0.5) / 2;
      const x = a[0] + (c[0] - a[0]) * t;
      const z = a[1] + (c[1] - a[1]) * t;
      for (const side of [-1, 1]) {
        if (random() > 0.5) continue;
        reeds.push({
          kind: 'reed',
          x: x + side * 0.72,
          z,
          scale: 0.45 + random() * 0.4,
          rotY: random() * Math.PI * 2,
          tint: '#b7c47a',
        });
      }
    }
  }
  return reeds;
}

function pointInPolygon(
  x: number,
  z: number,
  polygon: Array<[number, number]>,
) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i]?.[0] ?? 0;
    const zi = polygon[i]?.[1] ?? 0;
    const xj = polygon[j]?.[0] ?? 0;
    const zj = polygon[j]?.[1] ?? 0;
    const intersect =
      zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
