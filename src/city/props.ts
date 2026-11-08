import { type CityBuilder, type DetailLevel, frame } from './builder';
import type { MaterialKey } from './materials';

/** Street furniture, vehicles and harbour equipment. */

export function scooter(
  b: CityBuilder,
  x: number,
  z: number,
  rotY: number,
  color: MaterialKey = 'vehicleCream',
  detail: DetailLevel = 'high',
) {
  const f = frame(b, x, z, rotY);
  f.sphere(0.058, 0, 0.06, 0.17, 'tyre', [1, 1, 0.38], 6);
  f.sphere(0.058, 0, 0.06, -0.17, 'tyre', [1, 1, 0.38], 6);
  f.roundedBox(0.14, 0.09, 0.34, 0.03, 0, 0.15, 0.01, color);
  f.box(0.16, 0.05, 0.2, 0, 0.2, -0.04, 'ink');
  f.box(0.18, 0.03, 0.22, 0, 0.245, -0.05, 'woodDark');
  f.box(0.13, 0.3, 0.05, 0, 0.27, 0.21, color, 0, -0.18);
  f.sphere(0.035, 0, 0.35, 0.25, 'lightWarm', [1, 1, 1], 6);
  f.box(0.26, 0.025, 0.025, 0, 0.4, 0.2, 'metalDark');
  if (detail !== 'low') {
    f.box(0.02, 0.11, 0.02, -0.09, 0.45, 0.19, 'metalDark');
    f.box(0.07, 0.05, 0.012, -0.1, 0.5, 0.19, 'metal');
    f.box(0.16, 0.14, 0.16, 0, 0.31, -0.2, 'vehicleCream');
  }
  if (detail === 'high') {
    f.box(0.1, 0.06, 0.008, 0, 0.17, 0.355, 'lightWarm');
    f.box(0.14, 0.012, 0.26, 0, 0.21, 0.02, 'metal');
  }
}

export function car(
  b: CityBuilder,
  x: number,
  z: number,
  rotY: number,
  color: MaterialKey = 'vehicleTeal',
  detail: DetailLevel = 'high',
) {
  const f = frame(b, x, z, rotY);
  f.roundedBox(0.34, 0.13, 0.62, 0.05, 0, 0.14, 0, color);
  f.roundedBox(0.3, 0.13, 0.34, 0.05, 0, 0.26, -0.04, color);
  f.box(0.29, 0.1, 0.3, 0, 0.27, -0.04, 'glassDark');
  f.box(0.28, 0.02, 0.32, 0, 0.33, -0.04, color);
  if (detail !== 'low') {
    f.box(0.3, 0.02, 0.02, 0, 0.27, 0.12, color);
    const wheels: Array<[number, number]> = [
      [-0.16, 0.2],
      [0.16, 0.2],
      [-0.16, -0.2],
      [0.16, -0.2],
    ];
    for (const [wx, wz] of wheels) {
      f.sphere(0.075, wx, 0.075, wz, 'tyre', [1, 1, 0.5], 6);
      f.sphere(
        0.04,
        wx,
        0.075,
        wz + Math.sign(wz) * 0.03,
        'metal',
        [1, 1, 0.3],
        5,
      );
    }
  }
  if (detail === 'high') {
    f.box(0.1, 0.035, 0.015, -0.1, 0.15, 0.31, 'lightWarm');
    f.box(0.1, 0.035, 0.015, 0.1, 0.15, 0.31, 'lightWarm');
    f.box(0.09, 0.03, 0.015, -0.1, 0.15, -0.31, 'templeRed');
    f.box(0.09, 0.03, 0.015, 0.1, 0.15, -0.31, 'templeRed');
    f.box(0.3, 0.03, 0.04, 0, 0.1, 0.31, 'metalDark');
    f.box(0.3, 0.03, 0.04, 0, 0.1, -0.31, 'metalDark');
  }
}

export function bus(
  b: CityBuilder,
  x: number,
  z: number,
  rotY: number,
  detail: DetailLevel = 'high',
) {
  const f = frame(b, x, z, rotY);
  f.roundedBox(0.44, 0.36, 1.24, 0.07, 0, 0.28, 0, 'vehicleCream');
  f.box(0.46, 0.09, 1.2, 0, 0.14, 0, 'teal');
  f.box(0.42, 0.17, 0.96, 0, 0.33, 0.04, 'glassDark');
  f.box(0.4, 0.03, 0.98, 0, 0.42, 0.04, 'vehicleCream');
  f.box(0.4, 0.09, 0.02, 0, 0.36, 0.63, 'glassDark');
  f.box(0.3, 0.05, 0.02, 0, 0.47, 0.62, 'lightCool');
  if (detail !== 'low') {
    const wheels: Array<[number, number]> = [
      [-0.2, 0.38],
      [0.2, 0.38],
      [-0.2, -0.36],
      [0.2, -0.36],
    ];
    for (const [wx, wz] of wheels) {
      f.sphere(0.08, wx, 0.08, wz, 'tyre', [1, 1, 0.5], 6);
    }
    f.box(0.02, 0.24, 0.1, -0.225, 0.28, 0.3, 'ink');
    f.box(0.02, 0.24, 0.1, 0.225, 0.28, 0.3, 'ink');
    f.box(0.32, 0.05, 0.5, 0, 0.48, -0.2, 'metal');
  }
}

export function pedestrian(
  b: CityBuilder,
  x: number,
  z: number,
  rotY: number,
  shirt: MaterialKey = 'coral',
  detail: DetailLevel = 'medium',
) {
  const f = frame(b, x, z, rotY);
  const skin: MaterialKey = 'sand';
  f.box(0.05, 0.14, 0.05, -0.035, 0.07, 0, 'ink');
  f.box(0.05, 0.14, 0.05, 0.035, 0.07, 0, 'ink');
  f.roundedBox(0.16, 0.17, 0.1, 0.03, 0, 0.22, 0, shirt);
  f.box(0.045, 0.12, 0.045, -0.1, 0.2, 0, skin);
  f.box(0.045, 0.12, 0.045, 0.1, 0.2, 0, skin);
  f.sphere(0.055, 0, 0.36, 0, skin, [1, 1, 0.95], 7);
  f.box(0.11, 0.025, 0.1, 0, 0.41, -0.005, 'ink');
  if (detail === 'high') {
    f.box(0.1, 0.03, 0.06, 0, 0.335, 0, 'ink');
    f.box(0.06, 0.12, 0.04, 0.06, 0.16, 0.05, 'woodDark');
  }
}

export function bench(b: CityBuilder, x: number, z: number, rotY: number) {
  const f = frame(b, x, z, rotY);
  for (const side of [-1, 1]) {
    f.box(0.04, 0.1, 0.22, side * 0.24, 0.05, 0, 'metalDark');
    f.box(0.04, 0.2, 0.05, side * 0.24, 0.18, -0.09, 'metalDark');
  }
  for (let i = 0; i < 4; i += 1) {
    f.box(0.56, 0.025, 0.055, 0, 0.13, -0.07 + i * 0.055, 'wood');
  }
  f.box(0.56, 0.03, 0.06, 0, 0.19, -0.1, 'wood');
  f.box(0.56, 0.03, 0.06, 0, 0.26, -0.1, 'wood');
}

export function planter(
  b: CityBuilder,
  x: number,
  z: number,
  detail: DetailLevel = 'high',
) {
  b.box(0.34, 0.16, 0.34, x, 0.1, z, 'stone');
  b.box(0.28, 0.04, 0.28, x, 0.19, z, 'soil');
  b.sphere(0.13, x, 0.29, z, 'foliageLight', 7, 5, [1.1, 0.9, 1.1]);
  if (detail === 'high') {
    b.sphere(0.07, x + 0.09, 0.25, z + 0.08, 'blossom', 6, 6, [1, 1, 1]);
    b.sphere(0.07, x - 0.08, 0.24, z - 0.05, 'blossom', 6, 6, [1, 1, 1]);
  }
}

export function bollard(b: CityBuilder, x: number, z: number) {
  b.cylinder(0.035, 0.045, 0.16, 6, x, 0.08, z, 'metalDark');
  b.sphere(0.035, x, 0.16, z, 'metal', 6, 6, [1, 1, 1]);
}

export function trashBin(b: CityBuilder, x: number, z: number) {
  b.cylinder(0.09, 0.08, 0.24, 7, x, 0.12, z, 'tealDeep');
  b.cylinder(0.1, 0.1, 0.03, 7, x, 0.25, z, 'metalDark');
}

export function busStop(
  b: CityBuilder,
  x: number,
  z: number,
  rotY: number,
  detail: DetailLevel = 'high',
) {
  const f = frame(b, x, z, rotY);
  f.box(0.9, 0.05, 0.4, 0, 0.32, 0, 'teal');
  f.box(0.9, 0.05, 0.4, 0, 0.02, 0, 'concrete');
  for (const side of [-1, 1]) {
    f.box(0.05, 0.3, 0.05, side * 0.42, 0.17, 0.16, 'metalDark');
    f.box(0.05, 0.3, 0.05, side * 0.42, 0.17, -0.16, 'metalDark');
  }
  f.box(0.9, 0.26, 0.03, 0, 0.17, -0.18, 'glass');
  f.box(0.5, 0.04, 0.16, 0, 0.07, 0.02, 'wood');
  if (detail !== 'low') {
    f.box(0.14, 0.3, 0.04, -0.3, 0.2, 0.2, 'metalDark');
    f.box(0.12, 0.18, 0.012, -0.3, 0.23, 0.225, 'cream');
    f.cylinder(0.03, 0.035, 0.5, 6, 0.5, 0.25, -0.1, 'metalDark');
    f.box(0.16, 0.12, 0.05, 0.5, 0.5, -0.1, 'tealDeep');
  }
}

export function stall(
  b: CityBuilder,
  x: number,
  z: number,
  rotY: number,
  canopy: MaterialKey = 'coral',
) {
  const f = frame(b, x, z, rotY);
  for (const [px, pz] of [
    [-0.22, -0.18],
    [0.22, -0.18],
    [-0.22, 0.18],
    [0.22, 0.18],
  ] as Array<[number, number]>) {
    f.box(0.025, 0.52, 0.025, px, 0.26, pz, 'metalDark');
  }
  const panels = 4;
  for (let i = 0; i < panels; i += 1) {
    f.box(
      0.125,
      0.035,
      0.46,
      -0.19 + i * 0.125,
      0.53,
      0,
      i % 2 === 0 ? canopy : 'cream',
      0,
      0,
      -0.12,
    );
  }
  f.box(0.5, 0.05, 0.3, 0, 0.24, 0.02, 'wood');
  f.box(0.46, 0.16, 0.26, 0, 0.32, 0.02, 'woodDark');
  f.box(0.18, 0.1, 0.18, -0.12, 0.43, 0, 'templeRed');
  f.box(0.14, 0.08, 0.14, 0.12, 0.42, 0.02, 'gold');
}

export function container(
  b: CityBuilder,
  x: number,
  z: number,
  rotY: number,
  color: MaterialKey,
  stacked = 0,
) {
  const f = frame(b, x, z, rotY);
  for (let level = 0; level <= stacked; level += 1) {
    const y = 0.12 + level * 0.27;
    f.box(0.92, 0.24, 0.34, 0, y, 0, color);
    for (let i = 0; i < 6; i += 1) {
      f.box(
        0.92,
        0.22,
        0.012,
        0,
        y,
        -0.165 + i * 0.066,
        color === 'templeRed' ? 'roofClay' : 'concreteShadow',
      );
    }
    f.box(0.94, 0.03, 0.36, 0, y + 0.12, 0, 'metalDark');
  }
}

export function gantryCrane(
  b: CityBuilder,
  x: number,
  z: number,
  rotY: number,
) {
  const f = frame(b, x, z, rotY);
  const legH = 2.15;
  for (const [px, pz] of [
    [-0.8, -0.42],
    [0.8, -0.42],
    [-0.8, 0.42],
    [0.8, 0.42],
  ] as Array<[number, number]>) {
    f.box(0.12, legH, 0.12, px, legH / 2, pz, 'templeRed');
  }
  f.box(1.9, 0.16, 0.2, 0, legH, -0.42, 'templeRed');
  f.box(1.9, 0.16, 0.2, 0, legH, 0.42, 'templeRed');
  f.box(0.2, 0.2, 1.0, -0.8, legH, 0, 'templeRed');
  f.box(0.2, 0.2, 1.0, 0.8, legH, 0, 'templeRed');
  // Boom and counter-boom.
  f.box(0.22, 0.28, 2.6, 0, legH + 0.28, 0.45, 'metal');
  f.box(0.2, 0.22, 0.8, 0, legH + 0.26, -0.75, 'metalDark');
  f.box(0.36, 0.34, 0.3, 0, legH + 0.2, -0.58, 'metalDark');
  f.box(0.16, 0.5, 0.14, 0, legH + 0.55, -1.02, 'metalDark');
  // Trolley + cable + spreader.
  f.box(0.3, 0.12, 0.3, 0, legH + 0.12, 0.95, 'metalDark');
  f.box(0.02, 1.1, 0.02, 0.1, legH - 0.45, 0.95, 'metalDark');
  f.box(0.02, 1.1, 0.02, -0.1, legH - 0.45, 0.95, 'metalDark');
  f.box(0.9, 0.08, 0.4, 0, legH - 1.02, 0.95, 'metal');
  // A-frame mast.
  f.box(0.14, 0.9, 0.14, 0, legH + 0.8, 0.05, 'templeRed');
  f.box(0.02, 0.7, 0.02, 0.36, legH + 0.9, 0.05, 'metalDark');
  f.box(0.02, 0.7, 0.02, -0.36, legH + 0.9, 0.05, 'metalDark');
}

export function ship(b: CityBuilder, x: number, z: number, rotY: number) {
  const f = frame(b, x, z, rotY);
  // Hull.
  f.box(4.4, 0.32, 1.1, 0, 0.2, 0, 'tealDeep');
  f.box(4.1, 0.2, 0.96, 0, 0.42, 0, 'ink');
  f.box(4.6, 0.04, 1.16, 0, 0.06, 0, 'metalDark');
  // Container stacks.
  const colors: MaterialKey[] = [
    'templeRed',
    'vehicleYellow',
    'vehicleTeal',
    'vehicleBlue',
    'coral',
  ];
  for (let i = 0; i < 4; i += 1) {
    for (let level = 0; level < 2; level += 1) {
      f.box(
        0.84,
        0.22,
        0.24,
        -1.5 + i * 0.9,
        0.57 + level * 0.24,
        -0.3 + ((i + level) % 3) * 0.3,
        colors[(i + level) % colors.length] as MaterialKey,
      );
    }
  }
  // Bridge + funnel.
  f.box(0.6, 0.8, 0.9, 1.55, 0.86, 0, 'plasterWhite');
  f.box(0.5, 0.2, 0.8, 1.55, 1.3, 0, 'glassDark');
  f.box(0.18, 0.36, 0.18, 1.55, 1.55, -0.1, 'metalDark');
}

export function ferry(b: CityBuilder, x: number, z: number, rotY: number) {
  const f = frame(b, x, z, rotY);
  f.box(1.5, 0.2, 0.56, 0, 0.12, 0, 'plasterWhite');
  f.box(1.4, 0.12, 0.5, 0, 0.3, 0, 'teal');
  f.box(1.1, 0.34, 0.44, 0, 0.47, 0, 'plasterWhite');
  f.box(1.0, 0.14, 0.4, 0, 0.52, 0, 'glassDark');
  f.box(0.7, 0.05, 0.5, 0, 0.66, 0, 'tealDeep');
  f.box(0.2, 0.2, 0.2, 0.3, 0.68, 0, 'metalDark');
  f.box(0.1, 0.02, 0.1, 0, 0.75, 0.2, 'templeRed');
}

export function lotusBoat(b: CityBuilder, x: number, z: number, rotY: number) {
  const f = frame(b, x, z, rotY);
  f.roundedBox(0.5, 0.16, 0.28, 0.12, 0, 0.12, 0, 'plasterWhite');
  f.roundedBox(0.44, 0.08, 0.22, 0.06, 0, 0.22, 0, 'teal');
  for (const [sx, sz] of [
    [-0.16, -0.08],
    [0.16, -0.08],
  ] as Array<[number, number]>) {
    f.box(0.08, 0.08, 0.08, sx, 0.29, sz, 'coral');
  }
  const panels = 5;
  for (let i = 0; i < panels; i += 1) {
    f.box(
      0.11,
      0.03,
      0.26,
      -0.22 + i * 0.11,
      0.44,
      0,
      i % 2 === 0 ? 'cream' : 'teal',
    );
  }
  f.box(0.02, 0.18, 0.02, -0.23, 0.34, 0.11, 'metalDark');
  f.box(0.02, 0.18, 0.02, 0.23, 0.34, 0.11, 'metalDark');
  f.box(0.02, 0.18, 0.02, -0.23, 0.34, -0.11, 'metalDark');
  f.box(0.02, 0.18, 0.02, 0.23, 0.34, -0.11, 'metalDark');
}

export function lanternString(
  b: CityBuilder,
  points: Array<[number, number]>,
  height = 1.4,
) {
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const c = points[index + 1];
    if (!a || !c) continue;
    const dx = c[0] - a[0];
    const dz = c[1] - a[1];
    const length = Math.hypot(dx, dz);
    const rotY = Math.atan2(-dz, dx);
    const f = frame(b, (a[0] + c[0]) / 2, (a[1] + c[1]) / 2, rotY);
    f.box(length, 0.012, 0.012, 0, height, 0, 'ink');
    const lanterns = Math.max(2, Math.round(length / 0.34));
    for (let i = 1; i < lanterns; i += 1) {
      const px = -length / 2 + (length / lanterns) * i;
      f.cylinder(0.02, 0.02, 0.05, 5, px, height - 0.03, 0, 'gold');
      f.sphere(0.075, px, height - 0.12, 0, 'templeRed', [0.85, 1, 0.85], 7);
      f.cylinder(0.015, 0.015, 0.04, 5, px, height - 0.2, 0, 'gold');
    }
  }
}

export function signpost(
  b: CityBuilder,
  x: number,
  z: number,
  rotY: number,
  color: MaterialKey = 'tealDeep',
) {
  const f = frame(b, x, z, rotY);
  f.cylinder(0.025, 0.03, 0.9, 6, 0, 0.45, 0, 'metalDark');
  f.box(0.44, 0.26, 0.03, 0, 0.82, 0, color);
  f.box(0.38, 0.05, 0.01, 0, 0.86, 0.02, 'cream');
  f.box(0.26, 0.035, 0.01, 0, 0.79, 0.02, 'cream');
  f.sphere(0.025, 0, 0.92, 0, 'gold', [1, 1, 1], 5);
}

export function acUnit(
  b: CityBuilder,
  x: number,
  y: number,
  z: number,
  rotY = 0,
) {
  const f = frame(b, x, z, rotY);
  f.box(0.2, 0.14, 0.16, 0, y, 0, 'plasterWhite');
  f.sphere(0.055, 0, y, 0.085, 'metalDark', [0.7, 0.7, 0.4], 6);
}
