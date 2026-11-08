import {
  type CityBuilder,
  type DetailLevel,
  type Frame,
  frame,
  pick,
  seededRandom,
} from './builder';
import type { MaterialKey } from './materials';

/**
 * Architectural vocabulary for the miniature city.
 *
 * Buildings are composed from a small set of recognisable Taiwanese parts:
 * covered arcades, recessed shopfronts, tiled stair halls, balcony cages,
 * rooftop water tanks, awnings and layered roofs. Detail level controls how
 * many of those parts are generated.
 */

export type Palette = {
  wall: MaterialKey;
  trim: MaterialKey;
  roof: MaterialKey;
  accent: MaterialKey;
};

export const WALL_PALETTE: MaterialKey[] = [
  'plasterCream',
  'plasterSand',
  'plasterPeach',
  'plasterMint',
  'plasterSky',
  'plasterWhite',
];

export const ROOF_PALETTE: MaterialKey[] = [
  'roofTerracotta',
  'roofClay',
  'roofSlate',
  'roofTeal',
];

export const ACCENT_PALETTE: MaterialKey[] = [
  'coral',
  'teal',
  'gold',
  'templeRed',
  'tealDeep',
];

export function paletteFor(seed: number): Palette {
  const random = seededRandom(seed);
  return {
    wall: pick(random, WALL_PALETTE),
    trim: pick(random, ['cream', 'concrete', 'plasterWhite', 'stone']),
    roof: pick(random, ROOF_PALETTE),
    accent: pick(random, ACCENT_PALETTE),
  };
}

type RecessedWindowOptions = {
  width: number;
  height: number;
  detail: DetailLevel;
  frameKey?: MaterialKey;
  glassKey?: MaterialKey;
  sill?: boolean;
  cage?: boolean;
};

/** A recessed window with a protruding frame, sill and optional security cage. */
function recessedWindow(
  f: Frame,
  localX: number,
  y: number,
  localZ: number,
  options: RecessedWindowOptions,
) {
  const { width, height, detail } = options;
  const frameKey = options.frameKey ?? 'plasterWhite';
  const glassKey = options.glassKey ?? 'glass';
  // Dark reveal behind the glass gives real depth instead of a flat sticker.
  f.box(
    width + 0.05,
    height + 0.05,
    0.05,
    localX,
    y,
    localZ - 0.012,
    'concreteShadow',
  );
  f.box(width, height, 0.03, localX, y, localZ + 0.012, glassKey);
  if (detail === 'low') {
    f.box(
      width + 0.06,
      0.035,
      0.05,
      localX,
      y + height / 2,
      localZ + 0.02,
      frameKey,
    );
    return;
  }
  // Mullions + outer frame.
  f.box(0.028, height, 0.04, localX, y, localZ + 0.028, frameKey);
  f.box(
    width + 0.06,
    0.035,
    0.06,
    localX,
    y + height / 2,
    localZ + 0.026,
    frameKey,
  );
  f.box(
    width + 0.06,
    0.035,
    0.06,
    localX,
    y - height / 2,
    localZ + 0.026,
    frameKey,
  );
  f.box(
    0.035,
    height + 0.06,
    0.06,
    localX - width / 2,
    y,
    localZ + 0.026,
    frameKey,
  );
  f.box(
    0.035,
    height + 0.06,
    0.06,
    localX + width / 2,
    y,
    localZ + 0.026,
    frameKey,
  );
  if (options.sill !== false) {
    f.box(
      width + 0.1,
      0.045,
      0.11,
      localX,
      y - height / 2 - 0.03,
      localZ + 0.04,
      'stone',
    );
  }
  if (options.cage && detail === 'high') {
    const bars = Math.max(3, Math.round(width / 0.09));
    for (let i = 0; i < bars; i += 1) {
      const bx = localX - width / 2 + (width / (bars - 1)) * i;
      f.box(0.014, height, 0.02, bx, y, localZ + 0.12, 'metalDark');
    }
    f.box(
      width + 0.05,
      0.018,
      0.02,
      localX,
      y + height / 2,
      localZ + 0.12,
      'metalDark',
    );
    f.box(
      width + 0.05,
      0.018,
      0.02,
      localX,
      y - height / 2,
      localZ + 0.12,
      'metalDark',
    );
  }
}

function balcony(
  f: Frame,
  localX: number,
  y: number,
  localZ: number,
  width: number,
  depth: number,
  detail: DetailLevel,
  accent: MaterialKey,
) {
  f.box(width, 0.06, depth, localX, y, localZ + depth / 2, 'concrete');
  // Railing: top rail plus uprights. Medium/low use a solid parapet instead.
  if (detail === 'high') {
    f.box(width, 0.03, 0.03, localX, y + 0.24, localZ + depth, accent);
    const bars = Math.max(3, Math.round(width / 0.12));
    for (let i = 0; i < bars; i += 1) {
      const bx = localX - width / 2 + (width / (bars - 1)) * i;
      f.box(0.018, 0.24, 0.018, bx, y + 0.13, localZ + depth, 'metalDark');
    }
    f.box(
      0.03,
      0.26,
      depth,
      localX - width / 2,
      y + 0.14,
      localZ + depth / 2,
      accent,
    );
    f.box(
      0.03,
      0.26,
      depth,
      localX + width / 2,
      y + 0.14,
      localZ + depth / 2,
      accent,
    );
  } else {
    f.box(width, 0.24, 0.035, localX, y + 0.14, localZ + depth, accent);
  }
  // A plant or laundry pole keeps the balconies from looking machine-made.
  f.box(
    0.16,
    0.12,
    0.16,
    localX - width * 0.25,
    y + 0.11,
    localZ + depth * 0.55,
    'foliage',
  );
  if (detail !== 'low') {
    f.box(
      width * 0.55,
      0.016,
      0.016,
      localX,
      y + 0.42,
      localZ + depth * 0.72,
      'metal',
    );
    const cloths = [0, 1, 2];
    cloths.forEach((index) => {
      const cloth = pick(seededRandom(Math.round((y + width) * 100) + index), [
        'coral',
        'teal',
        'cream',
        'plasterSky',
        'gold',
      ] as MaterialKey[]);
      f.box(
        0.14,
        0.2,
        0.01,
        localX - 0.16 + index * 0.16,
        y + 0.31,
        localZ + depth * 0.72,
        cloth,
      );
    });
  }
}

function rooftop(
  f: Frame,
  width: number,
  depth: number,
  y: number,
  seed: number,
  detail: DetailLevel,
  wall: MaterialKey,
) {
  // Parapet with a darker coping.
  const t = 0.07;
  f.box(width, 0.22, t, 0, y + 0.11, depth / 2, wall);
  f.box(width, 0.22, t, 0, y + 0.11, -depth / 2, wall);
  f.box(t, 0.22, depth, width / 2, y + 0.11, 0, wall);
  f.box(t, 0.22, depth, -width / 2, y + 0.11, 0, wall);
  f.box(width + 0.04, 0.045, t + 0.04, 0, y + 0.23, depth / 2, 'stone');
  f.box(width + 0.04, 0.045, t + 0.04, 0, y + 0.23, -depth / 2, 'stone');
  f.box(t + 0.04, 0.045, depth + 0.04, width / 2, y + 0.23, 0, 'stone');
  f.box(t + 0.04, 0.045, depth + 0.04, -width / 2, y + 0.23, 0, 'stone');

  const random = seededRandom(seed);
  // Stair bulkhead — nearly every Taiwanese rooftop has one.
  const stairW = Math.min(width * 0.34, 0.62);
  f.box(stairW, 0.4, 0.42, -width * 0.22, y + 0.2, -depth * 0.16, wall);
  f.box(
    stairW + 0.06,
    0.05,
    0.48,
    -width * 0.22,
    y + 0.41,
    -depth * 0.16,
    'concrete',
  );
  f.box(
    0.2,
    0.3,
    0.03,
    -width * 0.22,
    y + 0.15,
    -depth * 0.16 + 0.215,
    'woodDark',
  );

  if (detail === 'low') return;

  // Rooftop water tank. Keep these sparse and light-toned so they read as
  // everyday roof equipment instead of a repeated dark chimney forest.
  if (random() > 0.46) {
    const tx = width * 0.24;
    const tz = depth * 0.12;
    f.cylinder(0.16, 0.16, 0.3, 10, tx, y + 0.38, tz, 'cream');
    f.cylinder(0.17, 0.17, 0.035, 10, tx, y + 0.54, tz, 'metalDark');
    f.box(0.03, 0.2, 0.03, tx - 0.1, y + 0.12, tz - 0.1, 'metalDark');
    f.box(0.03, 0.2, 0.03, tx + 0.1, y + 0.12, tz - 0.1, 'metalDark');
  }
  // Solar water heater panel.
  if (random() > 0.55) {
    f.box(0.5, 0.03, 0.34, 0, y + 0.26, depth * 0.24, 'glassDark', 0, -0.42);
    f.cylinder(0.11, 0.11, 0.34, 8, 0, y + 0.2, depth * 0.42, 'metal');
  }
  if (detail === 'high') {
    // Antenna + AC condensers.
    const ax = width * 0.34;
    f.cylinder(0.012, 0.012, 0.5, 5, ax, y + 0.5, -depth * 0.3, 'metalDark');
    f.box(0.2, 0.01, 0.012, ax, y + 0.62, -depth * 0.3, 'metalDark');
    f.box(0.16, 0.13, 0.2, width * 0.1, y + 0.36, -depth * 0.3, 'plasterWhite');
    // Small rooftop garden.
    if (random() > 0.5) {
      f.box(0.3, 0.1, 0.22, -width * 0.3, y + 0.31, depth * 0.3, 'soil');
      f.sphere(
        0.14,
        -width * 0.3,
        y + 0.4,
        depth * 0.3,
        'foliage',
        [1.2, 0.8, 1],
      );
    }
  }
}

type ShophouseOptions = {
  x: number;
  z: number;
  rotY?: number;
  width: number;
  depth: number;
  floors: number;
  palette: Palette;
  detail: DetailLevel;
  arcade?: boolean;
  awning?: boolean;
  corner?: boolean;
  seed?: number;
};

export function shophouse(builder: CityBuilder, options: ShophouseOptions) {
  const { x, z, rotY = 0, width, depth, floors, palette, detail } = options;
  const f = frame(builder, x, z, rotY);
  const floorH = 0.56;
  const height = floors * floorH;
  const random = seededRandom(
    options.seed ?? Math.round((x * 97 + z * 131) * 13),
  );
  const arcade = options.arcade ?? true;
  const front = depth / 2;

  // Plinth + main volume, split into two masses so the facade is not a plain box.
  f.box(width + 0.06, 0.12, depth + 0.06, 0, 0.06, 0, 'stone');
  f.box(width, height, depth, 0, height / 2 + 0.1, 0, palette.wall);

  // Ground floor: recessed shop behind an arcade or a direct shopfront.
  const shopH = floorH * 0.92;
  const shopY = 0.1 + shopH / 2;
  if (arcade) {
    f.box(width, 0.13, 0.5, 0, 0.16, front + 0.2, 'sidewalk');
    const columnCount = Math.max(2, Math.round(width / 0.55));
    for (let i = 0; i < columnCount; i += 1) {
      const cx = -width / 2 + (width / (columnCount - 1)) * i;
      f.box(0.11, shopH, 0.11, cx, shopY + 0.1, front + 0.42, palette.trim);
      f.box(0.15, 0.05, 0.15, cx, 0.12, front + 0.42, 'stone');
    }
    f.box(width, 0.12, 0.12, 0, 0.1 + shopH + 0.12, front + 0.42, palette.trim);
    // Shop opening set back into the arcade.
    f.box(
      width - 0.18,
      shopH * 0.72,
      0.05,
      0,
      shopY,
      front - 0.05,
      'glassWarm',
    );
    f.box(width - 0.1, shopH * 0.2, 0.04, 0, 0.28, front - 0.045, 'woodDark');
    // Warm interior glow strip.
    f.box(width - 0.3, 0.06, 0.03, 0, shopH * 0.62, front - 0.02, 'lightWarm');
  } else {
    f.box(
      width - 0.14,
      shopH * 0.72,
      0.05,
      0,
      shopY,
      front + 0.02,
      'glassWarm',
    );
    f.box(width - 0.06, 0.12, 0.08, 0, 0.17, front + 0.05, 'curb');
    f.box(
      0.62,
      0.32,
      0.04,
      -width * 0.06,
      shopH * 0.66,
      front + 0.07,
      'plasterWhite',
    );
  }

  // Awning: alternating fabric panels add a handmade feel.
  if (options.awning !== false) {
    const panels = Math.max(3, Math.round(width / 0.26));
    const panelW = (width + 0.16) / panels;
    for (let i = 0; i < panels; i += 1) {
      const panelX = -width / 2 - 0.08 + panelW * (i + 0.5);
      f.box(
        panelW - 0.012,
        0.035,
        0.5,
        panelX,
        0.1 + shopH + 0.14,
        front + 0.58,
        i % 2 === 0 ? palette.accent : 'cream',
        0,
        -0.26,
      );
    }
    f.cylinder(
      0.014,
      0.014,
      width + 0.16,
      6,
      0,
      0.1 + shopH + 0.29,
      front + 0.82,
      'metal',
      Math.PI / 2,
    );
  }

  // Signboard above the shopfront, abstract character strips rather than text.
  const signY = 0.1 + shopH + (arcade ? 0.33 : 0.26);
  f.box(
    width * 0.86,
    0.2,
    0.06,
    0,
    signY,
    front + (arcade ? 0.47 : 0.18),
    palette.accent,
  );
  if (detail !== 'low') {
    const glyphs = Math.max(2, Math.round((width * 0.7) / 0.14));
    for (let i = 0; i < glyphs; i += 1) {
      const gx = -width * 0.33 + i * 0.14;
      f.box(
        0.075,
        0.1,
        0.012,
        gx,
        signY,
        front + (arcade ? 0.505 : 0.215),
        'cream',
      );
    }
  }

  // Upper windows: paired windows with occasional full-width balcony.
  const upperFloors = Math.max(1, floors - 1);
  for (let floorIndex = 0; floorIndex < upperFloors; floorIndex += 1) {
    const floorY = 0.1 + floorH * (floorIndex + 1) + floorH / 2;
    if (detail !== 'low') {
      f.box(
        width + 0.02,
        0.05,
        0.04,
        0,
        floorY + floorH / 2 - 0.03,
        front + 0.02,
        palette.trim,
      );
    }
    const windowCount = width > 1.25 ? 2 : 1;
    const available = width - 0.36;
    for (let i = 0; i < windowCount; i += 1) {
      const wx =
        windowCount === 1
          ? 0
          : -available / 2 + (available / (windowCount - 1)) * i;
      recessedWindow(f, wx, floorY, front + 0.02, {
        width: windowCount === 1 ? width * 0.44 : width * 0.3,
        height: floorH * 0.5,
        detail,
        frameKey: palette.trim,
        cage: random() > 0.55,
      });
    }
    // Side windows on the visible flank.
    if (detail === 'high') {
      recessedWindow(f, width / 2 + 0.02, floorY, 0, {
        width: depth * 0.34,
        height: floorH * 0.46,
        detail,
        frameKey: palette.trim,
        sill: false,
      });
    }
    if (floorIndex === upperFloors - 1 && detail === 'high' && random() > 0.5) {
      balcony(
        f,
        0,
        floorY - 0.12,
        front + 0.02,
        width * 0.62,
        0.32,
        detail,
        palette.accent,
      );
    }
  }

  // Roof with a shallow overhang and, sometimes, a small tiled canopy.
  f.box(width + 0.16, 0.08, depth + 0.16, 0, height + 0.14, 0, palette.roof);
  f.box(width + 0.08, 0.04, depth + 0.08, 0, height + 0.2, 0, 'stone');
  rooftop(
    f,
    width,
    depth,
    height + 0.21,
    options.seed ?? Math.round((x + z) * 100),
    detail,
    palette.wall,
  );

  if (floors >= 4 && detail === 'high') {
    // Small setback volume with a second, higher roofline.
    f.box(
      width * 0.52,
      0.5,
      depth * 0.5,
      width * 0.16,
      height + 0.46,
      -depth * 0.18,
      palette.wall,
    );
    f.box(
      width * 0.56,
      0.06,
      depth * 0.54,
      width * 0.16,
      height + 0.73,
      -depth * 0.18,
      palette.roof,
    );
  }
}

type ApartmentOptions = {
  x: number;
  z: number;
  rotY?: number;
  width: number;
  depth: number;
  floors: number;
  palette: Palette;
  detail: DetailLevel;
  seed?: number;
};

export function apartment(builder: CityBuilder, options: ApartmentOptions) {
  const { x, z, rotY = 0, width, depth, floors, palette, detail } = options;
  const f = frame(builder, x, z, rotY);
  const floorH = 0.52;
  const height = floors * floorH;
  const front = depth / 2;

  f.box(width + 0.1, 0.16, depth + 0.1, 0, 0.08, 0, 'stone');
  f.box(width, height, depth, 0, height / 2 + 0.12, 0, palette.wall);

  // Vertical colour bands give mid-rise blocks a Taiwanese apartment identity.
  f.box(
    0.18,
    height,
    depth + 0.02,
    -width / 2 + 0.18,
    height / 2 + 0.12,
    0,
    palette.trim,
  );
  f.box(
    0.18,
    height,
    depth + 0.02,
    width / 2 - 0.18,
    height / 2 + 0.12,
    0,
    palette.trim,
  );

  // Ground floor: lobby + covered parking bay.
  f.box(
    width * 0.36,
    0.44,
    0.05,
    -width * 0.18,
    0.36,
    front + 0.02,
    'glassWarm',
  );
  f.box(
    width * 0.3,
    0.4,
    0.04,
    width * 0.2,
    0.34,
    front + 0.01,
    'concreteShadow',
  );
  f.box(width * 0.34, 0.06, 0.16, width * 0.2, 0.08, front + 0.08, 'sidewalk');
  f.box(width + 0.2, 0.09, 0.7, 0, 0.16, front + 0.3, 'concrete');
  f.box(width + 0.22, 0.04, 0.72, 0, 0.12, front + 0.3, 'concreteShadow');

  for (let i = 1; i < floors; i += 1) {
    const floorY = 0.12 + floorH * i + floorH / 2;
    // Floor slab edge.
    f.box(
      width + 0.04,
      0.045,
      depth + 0.04,
      0,
      floorY + floorH / 2,
      0,
      'concrete',
    );
    const windowCount = Math.max(2, Math.round(width / 0.62));
    for (let w = 0; w < windowCount; w += 1) {
      const wx = -width / 2 + (width / windowCount) * (w + 0.5);
      recessedWindow(f, wx, floorY, front + 0.02, {
        width: (width / windowCount) * 0.56,
        height: floorH * 0.5,
        detail,
        frameKey: palette.trim,
        cage: detail === 'high' && (w + i) % 3 === 0,
      });
    }
    if (detail !== 'low' && i % 2 === 0) {
      balcony(
        f,
        -width * 0.12,
        floorY - floorH * 0.4,
        front + 0.03,
        width * 0.5,
        0.34,
        detail,
        palette.accent,
      );
    }
    if (detail === 'high' && i % 3 === 1) {
      // Full-width laundry balcony.
      balcony(
        f,
        width * 0.22,
        floorY - floorH * 0.4,
        front + 0.03,
        width * 0.34,
        0.26,
        detail,
        'metal',
      );
    }
  }

  f.box(width + 0.18, 0.1, depth + 0.18, 0, height + 0.16, 0, palette.roof);
  rooftop(
    f,
    width,
    depth,
    height + 0.22,
    options.seed ?? Math.round((x - z) * 71),
    detail,
    palette.wall,
  );
}

type TowerOptions = {
  x: number;
  z: number;
  width: number;
  depth: number;
  floors: number;
  palette: Palette;
  detail: DetailLevel;
  rotY?: number;
  crown?: 'flat' | 'lantern' | 'garden';
};

export function tower(builder: CityBuilder, options: TowerOptions) {
  const {
    x,
    z,
    width,
    depth,
    floors,
    palette,
    detail,
    rotY = 0,
    crown = 'flat',
  } = options;
  const f = frame(builder, x, z, rotY);
  const floorH = 0.5;
  const height = floors * floorH;
  const podiumH = 0.62;
  const front = depth / 2;

  // Podium with a glazed lobby.
  f.box(width + 0.3, podiumH, depth + 0.26, 0, podiumH / 2, 0, 'concrete');
  f.box(width + 0.34, 0.06, depth + 0.3, 0, podiumH + 0.02, 0, 'stone');
  f.box(width * 0.6, 0.38, 0.04, 0, 0.34, front + 0.14, 'glassWarm');
  f.box(width * 0.66, 0.05, 0.08, 0, 0.57, front + 0.15, 'metal');

  // Tower shaft with chamfered corner columns.
  f.box(width, height, depth, 0, podiumH + height / 2, 0, palette.wall);
  f.box(
    0.16,
    height,
    0.16,
    -width / 2 + 0.06,
    podiumH + height / 2,
    front - 0.06,
    palette.accent,
  );
  f.box(
    0.16,
    height,
    0.16,
    width / 2 - 0.06,
    podiumH + height / 2,
    front - 0.06,
    palette.accent,
  );

  // Continuous glazed strips + balcony ribbons.
  for (let i = 2; i < floors; i += 2) {
    const floorY = podiumH + floorH * i + floorH / 2;
    f.box(
      width + 0.06,
      0.04,
      depth + 0.06,
      0,
      floorY + floorH / 2,
      0,
      'concrete',
    );
    if (detail === 'low') continue;
    const cols = Math.max(3, Math.round(width / 0.36));
    for (let c = 0; c < cols; c += 1) {
      const wx = -width / 2 + (width / cols) * (c + 0.5);
      f.box(
        (width / cols) * 0.82,
        floorH * 1.4,
        0.04,
        wx,
        floorY + floorH * 0.5,
        front + 0.02,
        'glass',
      );
    }
    if (detail === 'high') {
      f.box(width * 0.9, 0.06, 0.34, 0, floorY - 0.1, front + 0.17, 'concrete');
      f.box(width * 0.9, 0.3, 0.03, 0, floorY + 0.02, front + 0.33, 'glass');
      f.box(width * 0.9, 0.03, 0.035, 0, floorY + 0.17, front + 0.33, 'metal');
    }
  }

  if (crown === 'lantern') {
    f.box(
      width * 0.7,
      0.3,
      depth * 0.7,
      0,
      podiumH + height + 0.12,
      0,
      'concrete',
    );
    f.box(width * 0.5, 0.5, depth * 0.5, 0, podiumH + height + 0.5, 0, 'glass');
    f.box(
      width * 0.54,
      0.06,
      depth * 0.54,
      0,
      podiumH + height + 0.78,
      0,
      'metal',
    );
    for (let i = 0; i < 4; i += 1) {
      const angle = (i / 4) * Math.PI * 2;
      f.cylinder(
        0.02,
        0.02,
        0.42,
        4,
        Math.cos(angle) * width * 0.24,
        podiumH + height + 0.98,
        Math.sin(angle) * depth * 0.24,
        'metalDark',
      );
    }
  } else if (crown === 'garden') {
    f.box(
      width * 0.86,
      0.12,
      depth * 0.86,
      0,
      podiumH + height + 0.06,
      0,
      'grass',
    );
    for (let i = 0; i < 4; i += 1) {
      const angle = (i / 4) * Math.PI * 2 + 0.4;
      f.sphere(
        0.2,
        Math.cos(angle) * width * 0.3,
        podiumH + height + 0.24,
        Math.sin(angle) * depth * 0.3,
        'foliage',
        [1.1, 0.9, 1.1],
      );
    }
    f.box(
      width * 0.3,
      0.24,
      depth * 0.3,
      0,
      podiumH + height + 0.18,
      0,
      'plasterWhite',
    );
  } else {
    f.box(
      width * 0.8,
      0.14,
      depth * 0.8,
      0,
      podiumH + height + 0.07,
      0,
      'concrete',
    );
    f.box(
      width * 0.44,
      0.32,
      depth * 0.44,
      0,
      podiumH + height + 0.24,
      0,
      'metal',
    );
  }
  if (detail === 'high') {
    f.cylinder(
      0.015,
      0.015,
      0.6,
      5,
      width * 0.3,
      podiumH + height + 0.5,
      -depth * 0.3,
      'metalDark',
    );
  }
}

type CivicOptions = {
  x: number;
  z: number;
  width: number;
  depth: number;
  rotY?: number;
  detail: DetailLevel;
};

/** A neighbourhood civic hall / library: colonnade, steps, planted forecourt. */
export function civicHall(builder: CityBuilder, options: CivicOptions) {
  const { x, z, width, depth, rotY = 0, detail } = options;
  const f = frame(builder, x, z, rotY);
  const h = 1.5;
  const front = depth / 2;

  f.box(width + 0.9, 0.12, depth + 1.1, 0, 0.06, 0.1, 'sidewalk');
  f.box(width + 0.6, 0.16, depth + 0.8, 0, 0.16, 0.1, 'stone');
  f.box(width + 0.3, 0.16, depth + 0.5, 0, 0.31, 0.1, 'stoneDark');
  f.box(width, h, depth, 0, h / 2 + 0.36, 0, 'plasterWhite');
  f.box(width * 0.92, 0.5, depth * 0.92, 0, h + 0.6, 0, 'concrete');
  f.box(width * 0.96, 0.08, depth * 0.96, 0, h + 0.88, 0, 'roofSlate');
  f.box(
    width * 0.5,
    0.24,
    depth * 0.5,
    0,
    h + 1.02,
    -depth * 0.1,
    'plasterWhite',
  );
  f.box(
    width * 0.54,
    0.06,
    depth * 0.54,
    0,
    h + 1.17,
    -depth * 0.1,
    'roofTeal',
  );

  // Deep colonnade.
  const columns = Math.max(4, Math.round(width / 0.62));
  for (let i = 0; i < columns; i += 1) {
    const cx = -width / 2 + (width / (columns - 1)) * i;
    f.box(0.16, 1.1, 0.16, cx, 0.92, front + 0.56, 'plasterWhite');
    f.box(0.24, 0.07, 0.24, cx, 0.38, front + 0.56, 'stone');
    f.box(0.22, 0.06, 0.22, cx, 1.5, front + 0.56, 'stone');
  }
  f.box(width + 0.1, 0.16, 0.6, 0, 1.62, front + 0.36, 'plasterWhite');
  f.box(width * 0.78, 0.9, 0.05, 0, 0.9, front + 0.06, 'glassDark');
  f.box(width * 0.5, 0.2, 0.04, 0, 1.42, front + 0.32, 'lightWarm');

  // Forecourt trees, benches, flag-less civic marker.
  f.box(width + 1.4, 0.04, 1.6, 0, 0.08, front + 1.6, 'grass');
  f.box(width * 0.9, 0.02, 0.1, 0, 0.1, front + 1.7, 'sidewalk');
  if (detail !== 'low') {
    for (const side of [-1, 1]) {
      f.cylinder(
        0.03,
        0.045,
        0.56,
        6,
        side * (width * 0.55),
        0.38,
        front + 2.1,
        'trunk',
      );
      f.sphere(
        0.34,
        side * (width * 0.55),
        0.84,
        front + 2.1,
        'foliage',
        [1, 0.8, 1],
      );
    }
  }
  f.box(1.2, 0.1, 0.1, 0, 0.32, front + 1.9, 'wood');
  f.box(1.2, 0.34, 0.08, 0, 0.5, front + 1.9, 'wood');
}

type TempleOptions = {
  x: number;
  z: number;
  rotY?: number;
  detail: DetailLevel;
  scale?: number;
};

/** A small neighbourhood temple with a swallowtail roof and stone forecourt. */
export function temple(builder: CityBuilder, options: TempleOptions) {
  const { x, z, rotY = 0, detail, scale = 1 } = options;
  const f = frame(builder, x, z, rotY);
  const w = 3.0 * scale;
  const d = 2.0 * scale;
  const plinth = 0.26;

  f.box(w + 1.2, 0.12, d + 1.4, 0, 0.06, 0.2, 'sidewalk');
  f.box(w + 0.8, plinth, d + 1.0, 0, 0.13, 0.16, 'stone');
  f.box(w + 0.8, 0.05, 0.5, 0, 0.12, d / 2 + 0.86, 'stoneDark');

  // Main hall.
  f.box(w, 0.9, d, 0, 0.26 + 0.45, 0, 'plasterWhite');
  f.box(w - 0.5, 0.5, d - 0.4, 0, 0.26 + 0.9, 0, 'plasterCream');

  // Red columns across the front.
  const columns = Math.max(4, Math.round(w / 0.62));
  for (let i = 0; i < columns; i += 1) {
    const cx = -w / 2 + (w / (columns - 1)) * i;
    f.cylinder(0.09, 0.1, 1.32, 8, cx, 0.95, d / 2 + 0.18, 'templeRed');
    f.cylinder(0.13, 0.13, 0.08, 8, cx, 0.32, d / 2 + 0.18, 'stone');
  }
  // Carved dark timber doors.
  f.box(0.9, 1.0, 0.06, 0, 0.82, d / 2 + 0.02, 'woodDark');
  f.box(0.72, 0.86, 0.03, 0, 0.82, d / 2 + 0.06, 'templeRedDark');
  for (let i = 0; i < 5; i += 1) {
    f.box(0.04, 0.78, 0.02, -0.28 + i * 0.14, 0.82, d / 2 + 0.085, 'gold');
  }

  // Layered swallowtail roof.
  const roofY = 1.62;
  f.box(w + 0.5, 0.08, d + 0.5, 0, roofY, 0, 'roofTerracotta');
  f.gableRoof(
    w + 0.2,
    d + 0.2,
    0.72,
    0,
    roofY + 0.05,
    0,
    'roofTerracotta',
    0.34,
  );
  f.box(
    0.16,
    0.28,
    0.55,
    -w / 2 - 0.32,
    roofY + 0.34,
    0,
    'roofClay',
    0,
    0,
    0.42,
  );
  f.box(
    0.16,
    0.28,
    0.55,
    w / 2 + 0.32,
    roofY + 0.34,
    0,
    'roofClay',
    0,
    0,
    -0.42,
  );
  f.box(w * 0.72, 0.09, 0.16, 0, roofY + 0.84, 0, 'roofClay');
  f.box(w * 0.1, 0.1, 0.1, 0, roofY + 0.95, 0, 'gold');

  // Incense burner + stone lions in the forecourt.
  if (detail !== 'low') {
    f.cylinder(0.26, 0.3, 0.34, 8, 0, 0.3, d / 2 + 1.15, 'metalDark');
    f.cylinder(0.18, 0.22, 0.2, 8, 0, 0.54, d / 2 + 1.15, 'gold');
    for (const side of [-1, 1]) {
      f.box(0.26, 0.24, 0.42, side * (w * 0.42), 0.24, d / 2 + 1.05, 'stone');
      f.box(0.16, 0.18, 0.16, side * (w * 0.42), 0.4, d / 2 + 1.18, 'stone');
      f.sphere(0.1, side * (w * 0.42), 0.54, d / 2 + 1.18, 'stoneDark');
    }
  }
  if (detail === 'high') {
    // Lanterns under the eaves.
    for (const side of [-1, 1]) {
      f.cylinder(
        0.12,
        0.12,
        0.22,
        8,
        side * w * 0.3,
        roofY - 0.25,
        d / 2 + 0.4,
        'templeRed',
      );
      f.cylinder(
        0.13,
        0.13,
        0.03,
        8,
        side * w * 0.3,
        roofY - 0.12,
        d / 2 + 0.4,
        'gold',
      );
    }
  }
}

type OfficeOptions = {
  x: number;
  z: number;
  width: number;
  depth: number;
  floors: number;
  detail: DetailLevel;
  rotY?: number;
};

/** Clean modern office block for the Nanzih science-park edge. */
export function officeBlock(builder: CityBuilder, options: OfficeOptions) {
  const { x, z, width, depth, floors, detail, rotY = 0 } = options;
  const f = frame(builder, x, z, rotY);
  const floorH = 0.48;
  const height = floors * floorH;
  f.box(width + 0.3, 0.14, depth + 0.3, 0, 0.07, 0, 'concrete');
  f.box(width, height, depth, 0, height / 2 + 0.14, 0, 'plasterWhite');
  f.box(width + 0.12, 0.12, depth + 0.12, 0, height + 0.16, 0, 'concrete');
  for (let i = 1; i <= floors; i += 1) {
    const y = 0.14 + floorH * i - 0.1;
    f.box(width + 0.04, 0.04, depth + 0.04, 0, y, 0, 'glassDark');
    if (detail === 'low') continue;
    f.box(
      width * 0.78,
      floorH * 0.52,
      0.04,
      0,
      y - floorH * 0.36,
      depth / 2 + 0.02,
      'glass',
    );
    f.box(
      width * 0.78,
      0.025,
      0.05,
      0,
      y - floorH * 0.1,
      depth / 2 + 0.03,
      'metal',
    );
  }
  f.box(width * 0.5, 0.34, depth * 0.5, 0, height + 0.36, 0, 'plasterWhite');
  f.box(width * 0.54, 0.05, depth * 0.54, 0, height + 0.55, 0, 'roofSlate');
  if (detail === 'high') {
    f.box(
      width * 0.22,
      0.5,
      depth * 0.22,
      -width * 0.22,
      height + 0.4,
      0,
      'glassDark',
    );
  }
}
