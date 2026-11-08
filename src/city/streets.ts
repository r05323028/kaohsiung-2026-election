import * as THREE from 'three';
import { type CityBuilder, type DetailLevel, frame } from './builder';

/** Street, path and bridge geometry shared by both districts. */

export function roadX(
  b: CityBuilder,
  options: {
    x1: number;
    x2: number;
    z: number;
    width?: number;
    detail?: DetailLevel;
    markings?: boolean;
    sidewalk?: number;
  },
) {
  const {
    x1,
    x2,
    z,
    width = 1.15,
    detail = 'high',
    markings = true,
    sidewalk = 0.26,
  } = options;
  const length = Math.abs(x2 - x1);
  const cx = (x1 + x2) / 2;
  b.box(length, 0.05, width, cx, 0.045, z, 'road');
  b.box(
    length,
    0.07,
    sidewalk,
    cx,
    0.055,
    z - width / 2 - sidewalk / 2 + 0.02,
    'sidewalk',
  );
  b.box(
    length,
    0.07,
    sidewalk,
    cx,
    0.055,
    z + width / 2 + sidewalk / 2 - 0.02,
    'sidewalk',
  );
  b.box(length, 0.02, 0.05, cx, 0.07, z - width / 2 + 0.03, 'curb');
  b.box(length, 0.02, 0.05, cx, 0.07, z + width / 2 - 0.03, 'curb');
  if (detail === 'low') return;
  if (markings) {
    for (
      let x = Math.min(x1, x2) + 0.25;
      x < Math.max(x1, x2) - 0.2;
      x += 0.42
    ) {
      b.box(0.18, 0.012, 0.035, x, 0.075, z, 'roadLine');
    }
    b.box(length, 0.012, 0.025, cx, 0.075, z - width / 2 + 0.09, 'roadLine');
    b.box(length, 0.012, 0.025, cx, 0.075, z + width / 2 - 0.09, 'roadLine');
  }
  if (detail === 'high') {
    // Manhole covers and a handful of asphalt patches break up the tarmac.
    b.cylinder(
      0.07,
      0.07,
      0.012,
      8,
      cx + length * 0.18,
      0.075,
      z + width * 0.16,
      'metalDark',
    );
    b.box(
      length * 0.16,
      0.008,
      width * 0.4,
      cx - length * 0.2,
      0.073,
      z - width * 0.12,
      'roadEdge',
    );
  }
}

export function roadZ(
  b: CityBuilder,
  options: {
    z1: number;
    z2: number;
    x: number;
    width?: number;
    detail?: DetailLevel;
    markings?: boolean;
    sidewalk?: number;
  },
) {
  const {
    z1,
    z2,
    x,
    width = 1.15,
    detail = 'high',
    markings = true,
    sidewalk = 0.26,
  } = options;
  const length = Math.abs(z2 - z1);
  const cz = (z1 + z2) / 2;
  b.box(width, 0.05, length, x, 0.045, cz, 'road');
  b.box(
    sidewalk,
    0.07,
    length,
    x - width / 2 - sidewalk / 2 + 0.02,
    0.055,
    cz,
    'sidewalk',
  );
  b.box(
    sidewalk,
    0.07,
    length,
    x + width / 2 + sidewalk / 2 - 0.02,
    0.055,
    cz,
    'sidewalk',
  );
  b.box(0.05, 0.02, length, x - width / 2 + 0.03, 0.07, cz, 'curb');
  b.box(0.05, 0.02, length, x + width / 2 - 0.03, 0.07, cz, 'curb');
  if (detail === 'low') return;
  if (markings) {
    for (
      let z = Math.min(z1, z2) + 0.25;
      z < Math.max(z1, z2) - 0.2;
      z += 0.42
    ) {
      b.box(0.035, 0.012, 0.18, x, 0.075, z, 'roadLine');
    }
    b.box(0.025, 0.012, length, x - width / 2 + 0.09, 0.075, cz, 'roadLine');
    b.box(0.025, 0.012, length, x + width / 2 - 0.09, 0.075, cz, 'roadLine');
  }
  if (detail === 'high') {
    b.cylinder(
      0.07,
      0.07,
      0.012,
      8,
      x - width * 0.16,
      0.075,
      cz + length * 0.14,
      'metalDark',
    );
    b.box(
      width * 0.4,
      0.008,
      length * 0.14,
      x + width * 0.12,
      0.073,
      cz - length * 0.22,
      'roadEdge',
    );
  }
}

export function crosswalk(
  b: CityBuilder,
  options: {
    x: number;
    z: number;
    width?: number;
    across?: 'x' | 'z';
    length?: number;
  },
) {
  const { x, z, width = 1.15, across = 'x', length = 0.55 } = options;
  const stripes = 6;
  for (let i = 0; i < stripes; i += 1) {
    const offset =
      -width / 2 +
      (width / (stripes - 1)) * i +
      (width / (stripes - 1)) * 0.5 -
      width * 0.03;
    if (across === 'x') {
      b.box(0.06, 0.014, length, x + offset, 0.08, z, 'crosswalk');
    } else {
      b.box(length, 0.014, 0.06, x, 0.08, z + offset, 'crosswalk');
    }
  }
}

export function streetlight(
  b: CityBuilder,
  x: number,
  z: number,
  rotY: number,
  detail: DetailLevel,
) {
  const f = frame(b, x, z, rotY);
  f.cylinder(0.035, 0.045, 0.98, 6, 0, 0.49, 0, 'metalDark');
  f.box(0.34, 0.035, 0.05, 0.15, 0.97, 0, 'metalDark', 0, 0, -0.18);
  f.box(0.18, 0.05, 0.11, 0.32, 0.93, 0, 'metalDark');
  f.box(0.13, 0.025, 0.08, 0.32, 0.9, 0, 'lightWarm');
  f.cylinder(0.13, 0.15, 0.06, 8, 0, 0.03, 0, 'stone');
  if (detail === 'high') {
    f.box(0.14, 0.24, 0.14, 0.12, 0.66, 0, 'metalDark');
    f.box(0.12, 0.18, 0.012, 0.12, 0.68, 0.075, 'cream');
  }
}

/** Concrete utility pole with sagging overhead wires. */
export function utilityPole(
  b: CityBuilder,
  x: number,
  z: number,
  detail: DetailLevel,
  previous?: { x: number; z: number },
) {
  b.cylinder(0.045, 0.06, 1.85, 6, x, 0.93, z, 'concreteShadow');
  b.box(0.6, 0.06, 0.07, x, 1.62, z, 'metalDark');
  b.box(0.44, 0.05, 0.06, x, 1.44, z, 'metalDark');
  b.cylinder(0.025, 0.025, 0.16, 6, x + 0.18, 1.76, z, 'metalDark');
  if (detail === 'high') {
    b.cylinder(0.11, 0.11, 0.24, 8, x - 0.16, 1.36, z, 'metal');
    b.cylinder(0.1, 0.1, 0.02, 8, x - 0.16, 1.49, z, 'metalDark');
  }
  if (previous && detail !== 'low') {
    const heights = [1.6, 1.48, 1.34];
    heights.forEach((height, index) => {
      const start = new THREE.Vector3(previous.x, height, previous.z);
      const end = new THREE.Vector3(x, height, z);
      const mid = start.clone().lerp(end, 0.5);
      mid.y -= 0.12;
      const curve = new THREE.CatmullRomCurve3([
        start,
        mid.clone().add(new THREE.Vector3(0, 0, index === 1 ? 0.03 : 0)),
        end,
      ]);
      const wire = new THREE.TubeGeometry(curve, 7, 0.009, 3, false);
      b.add(wire, 'ink');
    });
  }
}

export function powerLine(
  b: CityBuilder,
  points: Array<[number, number]>,
  detail: DetailLevel,
) {
  let previous: { x: number; z: number } | undefined;
  for (const [x, z] of points) {
    utilityPole(b, x, z, detail, previous);
    previous = { x, z };
  }
}

/** Planked waterfront boardwalk between two points. */
export function boardwalk(
  b: CityBuilder,
  options: {
    x1: number;
    z1: number;
    x2: number;
    z2: number;
    width?: number;
    detail?: DetailLevel;
  },
) {
  const { x1, z1, x2, z2, width = 0.55, detail = 'high' } = options;
  const dx = x2 - x1;
  const dz = z2 - z1;
  const length = Math.hypot(dx, dz);
  const rotY = Math.atan2(-dz, dx);
  const f = frame(b, (x1 + x2) / 2, (z1 + z2) / 2, rotY);
  f.box(length, 0.055, width, 0, 0.085, 0, 'wood');
  f.box(length, 0.025, 0.06, 0, 0.12, width / 2, 'woodDark');
  f.box(length, 0.025, 0.06, 0, 0.12, -width / 2, 'woodDark');
  if (detail !== 'low') {
    const planks = Math.max(4, Math.round(length / 0.14));
    for (let i = 0; i < planks; i += 1) {
      const px = -length / 2 + (length / planks) * (i + 0.5);
      f.box(
        length / planks - 0.014,
        0.012,
        width,
        px,
        0.116,
        0,
        i % 2 === 0 ? 'wood' : 'woodDark',
      );
    }
  }
  if (detail !== 'low') {
    const posts = Math.max(2, Math.round(length / 0.9));
    for (let i = 0; i <= posts; i += 1) {
      const px = -length / 2 + (length / posts) * i;
      for (const side of [-1, 1]) {
        f.cylinder(
          0.035,
          0.04,
          0.28,
          5,
          px,
          0.02,
          (side * width) / 2,
          'woodDark',
        );
      }
    }
  }
}

/** Gentle arched bridge over the Houjing River. */
export function archBridge(
  b: CityBuilder,
  options: {
    x: number;
    z: number;
    rotY?: number;
    length: number;
    width: number;
    rise?: number;
    detail?: DetailLevel;
    color?: 'stone' | 'teal';
  },
) {
  const {
    x,
    z,
    rotY = 0,
    length,
    width,
    rise = 0.4,
    detail = 'high',
    color = 'stone',
  } = options;
  const f = frame(b, x, z, rotY);
  const segments = 12;
  const segLength = length / segments;
  const deckKey = color === 'teal' ? 'teal' : 'stone';
  for (let i = 0; i < segments; i += 1) {
    const t = (i + 0.5) / segments;
    const y = rise * Math.sin(Math.PI * t);
    const slope = (Math.PI * rise * Math.cos(Math.PI * t)) / length;
    const px = -length / 2 + segLength * (i + 0.5);
    f.box(
      segLength + 0.03,
      0.06,
      width,
      px,
      y + 0.22,
      0,
      'concrete',
      0,
      0,
      slope,
    );
    if (detail !== 'low') {
      for (const side of [-1, 1]) {
        f.box(
          segLength + 0.05,
          0.03,
          0.05,
          px,
          y + 0.52,
          (side * width) / 2,
          deckKey,
        );
        f.box(
          segLength + 0.03,
          0.2,
          0.03,
          px,
          y + 0.41,
          (side * width) / 2,
          deckKey,
        );
      }
    }
  }
  // Piers.
  if (detail !== 'low') {
    for (const side of [-1, 1]) {
      f.cylinder(0.13, 0.16, 0.5, 7, length * 0.28 * side, 0.2, 0, 'stoneDark');
    }
  }
  if (detail === 'high') {
    for (const side of [-1, 1]) {
      for (let i = 0; i <= 6; i += 1) {
        const t = i / 6;
        const px = -length / 2 + length * t;
        const y = rise * Math.sin(Math.PI * t);
        f.box(0.05, 0.34, 0.05, px, y + 0.38, (side * width) / 2, 'stone');
        f.sphere(
          0.055,
          px,
          y + 0.58,
          (side * width) / 2,
          'stoneDark',
          [1, 1, 1],
          6,
        );
      }
    }
  }
}

/** Zig-zag bridge (nine-turn bridge) connecting arbitrary points. */
export function zigzagBridge(
  b: CityBuilder,
  points: Array<[number, number]>,
  options: {
    width?: number;
    height?: number;
    railKey?: 'stone' | 'templeRed' | 'plasterWhite';
    detail?: DetailLevel;
  } = {},
) {
  const {
    width = 0.5,
    height = 0.18,
    railKey = 'plasterWhite',
    detail = 'high',
  } = options;
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const c = points[index + 1];
    if (!a || !c) continue;
    const dx = c[0] - a[0];
    const dz = c[1] - a[1];
    const length = Math.hypot(dx, dz);
    const rotY = Math.atan2(-dz, dx);
    const f = frame(b, (a[0] + c[0]) / 2, (a[1] + c[1]) / 2, rotY);
    f.box(length + 0.06, 0.05, width, 0, height, 0, 'plasterWhite');
    f.box(length + 0.06, 0.02, width + 0.02, 0, height + 0.03, 0, 'stone');
    if (detail !== 'low') {
      for (const side of [-1, 1]) {
        f.box(
          length,
          0.03,
          0.045,
          0,
          height + 0.28,
          (side * width) / 2,
          railKey,
        );
        for (let i = 0; i <= 5; i += 1) {
          const px = -length / 2 + (length / 5) * i;
          f.box(
            0.035,
            0.26,
            0.035,
            px,
            height + 0.15,
            (side * width) / 2,
            railKey,
          );
        }
      }
    }
    // Supporting piles.
    if (detail === 'high') {
      f.cylinder(
        0.035,
        0.045,
        height,
        5,
        -length * 0.32,
        height / 2,
        0,
        'stoneDark',
      );
      f.cylinder(
        0.035,
        0.045,
        height,
        5,
        length * 0.32,
        height / 2,
        0,
        'stoneDark',
      );
    }
  }
}

/** Paved plaza with banded paving and planters. */
export function plaza(
  b: CityBuilder,
  options: {
    x: number;
    z: number;
    width: number;
    depth: number;
    detail?: DetailLevel;
    bands?: boolean;
  },
) {
  const { x, z, width, depth, detail = 'high', bands = true } = options;
  b.box(width, 0.06, depth, x, 0.045, z, 'sidewalk');
  b.box(width + 0.16, 0.02, depth + 0.16, x, 0.085, z, 'stone');
  if (!bands) return;
  const rows = Math.max(3, Math.round(depth / 0.34));
  for (let i = 0; i < rows; i += 1) {
    if (i % 3 !== 1) continue;
    b.box(
      width - 0.2,
      0.012,
      0.1,
      x,
      0.093,
      z - depth / 2 + (depth / rows) * (i + 0.5),
      'stoneDark',
    );
  }
  if (detail === 'high') {
    for (const side of [-1, 1]) {
      b.box(
        0.3,
        0.12,
        0.3,
        x + side * (width / 2 - 0.3),
        0.12,
        z + depth / 2 - 0.3,
        'stone',
      );
      b.box(
        0.24,
        0.07,
        0.24,
        x + side * (width / 2 - 0.3),
        0.21,
        z + depth / 2 - 0.3,
        'soil',
      );
      b.sphere(
        0.15,
        x + side * (width / 2 - 0.3),
        0.32,
        z + depth / 2 - 0.3,
        'foliage',
        8,
        6,
        [1, 0.85, 1],
      );
    }
  }
}

/** Light-rail track: bed, rails, sleepers, catenary masts. */
export function lightRail(
  b: CityBuilder,
  options: { x1: number; x2: number; z: number; detail?: DetailLevel },
) {
  const { x1, x2, z, detail = 'high' } = options;
  const length = Math.abs(x2 - x1);
  const cx = (x1 + x2) / 2;
  b.box(length, 0.06, 1.02, cx, 0.04, z, 'roadEdge');
  b.box(length, 0.02, 0.12, cx, 0.075, z - 0.26, 'rail');
  b.box(length, 0.02, 0.12, cx, 0.075, z + 0.26, 'rail');
  if (detail !== 'low') {
    for (let x = Math.min(x1, x2) + 0.1; x < Math.max(x1, x2); x += 0.26) {
      b.box(0.09, 0.03, 0.86, x, 0.06, z, 'concreteShadow');
    }
  }
  if (detail === 'high') {
    for (let x = Math.min(x1, x2) + 1.5; x < Math.max(x1, x2); x += 3.2) {
      b.cylinder(0.04, 0.05, 1.75, 6, x, 0.87, z + 0.52, 'metalDark');
      b.box(0.06, 0.05, 0.62, x, 1.7, z + 0.24, 'metalDark');
    }
    b.box(length, 0.012, 0.012, cx, 1.66, z, 'ink');
  }
}

/** Narrow pedestrian path following a polyline. */
export function footpath(
  b: CityBuilder,
  points: Array<[number, number]>,
  width = 0.34,
  key: 'sidewalk' | 'stone' | 'wood' = 'sidewalk',
) {
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const c = points[index + 1];
    if (!a || !c) continue;
    const dx = c[0] - a[0];
    const dz = c[1] - a[1];
    const length = Math.hypot(dx, dz);
    if (length < 0.01) continue;
    const rotY = Math.atan2(-dz, dx);
    const f = frame(b, (a[0] + c[0]) / 2, (a[1] + c[1]) / 2, rotY);
    f.box(length + 0.02, 0.04, width, 0, 0.075, 0, key);
    f.box(length + 0.02, 0.02, 0.04, 0, 0.09, width / 2, 'curb');
    f.box(length + 0.02, 0.02, 0.04, 0, 0.09, -width / 2, 'curb');
  }
}
