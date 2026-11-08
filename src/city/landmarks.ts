import * as THREE from 'three';
import { CityBuilder, type DetailLevel, frame } from './builder';

/**
 * Hero landmarks. These are built as their own geometry groups so the scene can
 * lift or highlight them without touching the rest of the city.
 */

function ring(
  b: CityBuilder,
  x: number,
  y: number,
  z: number,
  radius: number,
  key: Parameters<CityBuilder['add']>[1],
  tube = 0.012,
) {
  const geometry = new THREE.TorusGeometry(radius, tube, 3, 8);
  geometry.rotateX(Math.PI / 2);
  geometry.translate(x, y, z);
  b.add(geometry, key);
}

function dragonHead(b: CityBuilder, x: number, z: number, detail: DetailLevel) {
  const f = frame(b, x, z, 0);
  // Skull and muzzle.
  f.roundedBox(0.6, 0.44, 0.5, 0.13, 0, 0.7, 0.44, 'tealDeep');
  f.roundedBox(0.44, 0.22, 0.4, 0.08, 0, 0.6, 0.78, 'teal');
  f.roundedBox(0.34, 0.14, 0.22, 0.06, 0, 0.5, 0.96, 'tealDeep');
  // Nostrils and smoke curls.
  for (const side of [-1, 1]) {
    f.sphere(0.045, side * 0.11, 0.56, 1.04, 'ink', [1, 0.8, 1], 6);
    f.sphere(0.03, side * 0.11, 0.52, 0.9, 'gold', [1, 1, 1], 5);
  }
  // Eyes: gold with dark pupils, set under heavy brows.
  for (const side of [-1, 1]) {
    f.sphere(0.095, side * 0.19, 0.83, 0.74, 'gold', [1, 1, 0.7], 8);
    f.sphere(0.045, side * 0.2, 0.84, 0.79, 'ink', [1, 1, 0.6], 6);
    f.box(
      0.18,
      0.05,
      0.14,
      side * 0.2,
      0.92,
      0.73,
      'tealDeep',
      0,
      0,
      side * -0.3,
    );
  }
  // Open mouth: the entrance.
  f.box(0.36, 0.3, 0.26, 0, 0.46, 0.9, 'ink');
  f.box(0.46, 0.045, 0.06, 0, 0.64, 1.04, 'gold');
  f.box(0.46, 0.045, 0.06, 0, 0.29, 1.04, 'gold');
  for (const side of [-1, 1]) {
    f.box(0.045, 0.36, 0.06, side * 0.23, 0.46, 1.04, 'templeRed');
  }
  f.roundedBox(0.4, 0.08, 0.3, 0.03, 0, 0.33, 0.9, 'tealDeep');
  for (let i = 0; i < 4; i += 1) {
    f.cone(0.028, 0.09, 5, -0.13 + i * 0.087, 0.56, 0.97, 'cream');
    f.cone(0.024, 0.07, 5, -0.12 + i * 0.08, 0.38, 0.96, 'cream');
  }
  // Fangs and whiskers.
  for (const side of [-1, 1]) {
    f.cone(0.035, 0.16, 5, side * 0.15, 0.5, 0.99, 'cream');
    f.box(0.3, 0.018, 0.018, side * 0.4, 0.6, 0.92, 'gold', 0, 0, side * -0.5);
    f.box(
      0.16,
      0.015,
      0.015,
      side * 0.52,
      0.54,
      0.98,
      'gold',
      0.3,
      0,
      side * 0.9,
    );
    // Ears / fins.
    f.box(0.16, 0.1, 0.24, side * 0.3, 0.94, 0.46, 'teal', 0, 0, side * 0.4);
    // Horns sweep back in two segments.
    f.box(0.05, 0.22, 0.05, side * 0.21, 1.05, 0.4, 'gold', 0, 0, side * 0.18);
    f.box(0.04, 0.2, 0.04, side * 0.26, 1.18, 0.3, 'gold', 0, 0.5, side * 0.45);
    f.cone(0.03, 0.1, 5, side * 0.3, 1.26, 0.22, 'gold');
  }
  // Beard and mane.
  f.cone(0.08, 0.24, 6, 0, 0.34, 0.74, 'tealDeep');
  const mane = 10;
  for (let i = 0; i < mane; i += 1) {
    const angle = -Math.PI * 0.85 + (i / (mane - 1)) * Math.PI * 1.7;
    const px = Math.sin(angle) * 0.32;
    const pz = 0.3 + Math.cos(angle) * 0.28;
    f.cone(
      0.05,
      0.2,
      5,
      px,
      0.88 + Math.cos(angle) * 0.06,
      pz,
      i % 2 === 0 ? 'gold' : 'teal',
      angle,
    );
  }
  // Gold trim along the skull.
  f.box(0.34, 0.035, 0.36, 0, 0.93, 0.44, 'gold');
  if (detail === 'high') {
    // Painted scale plates down the cheeks.
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i += 1) {
        f.box(
          0.08,
          0.05,
          0.09,
          side * (0.26 - i * 0.01),
          0.68 - i * 0.07,
          0.6 + i * 0.06,
          'gold',
        );
      }
    }
  }
}

function tigerHead(b: CityBuilder, x: number, z: number, detail: DetailLevel) {
  const f = frame(b, x, z, 0);
  f.roundedBox(0.62, 0.48, 0.52, 0.16, 0, 0.7, 0.44, 'vehicleYellow');
  f.roundedBox(0.42, 0.24, 0.36, 0.1, 0, 0.58, 0.8, 'cream');
  f.roundedBox(0.3, 0.16, 0.2, 0.06, 0, 0.5, 0.98, 'cream');
  // Nose + mouth.
  f.cone(0.07, 0.1, 4, 0, 0.58, 1.02, 'templeRed', Math.PI / 4);
  f.box(0.34, 0.28, 0.24, 0, 0.44, 0.9, 'ink');
  f.box(0.44, 0.045, 0.06, 0, 0.61, 1.04, 'gold');
  f.box(0.44, 0.045, 0.06, 0, 0.28, 1.04, 'gold');
  for (const side of [-1, 1]) {
    f.box(0.045, 0.34, 0.06, side * 0.22, 0.45, 1.04, 'templeRed');
  }
  f.roundedBox(0.36, 0.1, 0.28, 0.04, 0, 0.31, 0.9, 'cream');
  for (let i = 0; i < 4; i += 1) {
    f.cone(0.026, 0.08, 5, -0.12 + i * 0.08, 0.54, 0.97, 'cream');
    f.cone(0.022, 0.06, 5, -0.11 + i * 0.075, 0.36, 0.96, 'cream');
  }
  for (const side of [-1, 1]) {
    f.cone(0.034, 0.14, 5, side * 0.14, 0.48, 1.0, 'cream');
  }
  // Eyes.
  for (const side of [-1, 1]) {
    f.sphere(0.085, side * 0.2, 0.82, 0.75, 'gold', [1, 1, 0.7], 8);
    f.sphere(0.04, side * 0.21, 0.83, 0.8, 'ink', [1, 1, 0.6], 6);
    f.box(
      0.17,
      0.05,
      0.12,
      side * 0.2,
      0.9,
      0.74,
      'woodDark',
      0,
      0,
      side * -0.35,
    );
  }
  // Rounded ears with warm inner ear.
  for (const side of [-1, 1]) {
    f.sphere(0.13, side * 0.27, 1.0, 0.38, 'vehicleYellow', [0.9, 1, 0.6], 8);
    f.sphere(0.075, side * 0.28, 1.01, 0.45, 'coral', [0.85, 1, 0.4], 6);
  }
  // Forehead stripes and cheek stripes.
  f.box(0.05, 0.14, 0.05, 0, 0.93, 0.57, 'ink');
  f.box(0.04, 0.11, 0.04, -0.1, 0.94, 0.55, 'ink', 0, 0, 0.2);
  f.box(0.04, 0.11, 0.04, 0.1, 0.94, 0.55, 'ink', 0, 0, -0.2);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i += 1) {
      f.box(
        0.05,
        0.11,
        0.06,
        side * (0.3 - i * 0.015),
        0.75 - i * 0.09,
        0.55 + i * 0.02,
        'ink',
        0,
        0,
        side * 0.25,
      );
    }
    f.box(
      0.26,
      0.016,
      0.016,
      side * 0.38,
      0.52,
      0.94,
      'ink',
      0,
      0,
      side * -0.4,
    );
  }
  // Chin ruff.
  for (let i = 0; i < 5; i += 1) {
    const angle = -Math.PI * 0.6 + (i / 4) * Math.PI * 1.2;
    f.cone(
      0.05,
      0.16,
      5,
      Math.sin(angle) * 0.22,
      0.36,
      0.72 + Math.cos(angle) * 0.2,
      'cream',
      angle,
    );
  }
  if (detail === 'high') {
    f.box(0.3, 0.02, 0.02, 0, 0.68, 0.83, 'woodDark');
  }
}

function pagodaTower(
  b: CityBuilder,
  x: number,
  z: number,
  kind: 'dragon' | 'tiger',
  detail: DetailLevel,
) {
  const f = frame(b, x, z, 0);
  // Octagonal stone platform rising out of the pond.
  f.cylinder(0.62, 0.72, 0.14, 8, 0, 0.07, 0, 'stoneDark');
  f.cylinder(0.58, 0.62, 0.12, 8, 0, 0.2, 0, 'stone');
  f.cylinder(0.5, 0.56, 0.1, 8, 0, 0.31, 0, 'stoneDark');

  // The sculpted head doubles as the ground-floor entrance. Build it in a
  // scratch builder so it can be scaled as one hero asset without hand-tuning
  // every facial feature.
  const head = new CityBuilder();
  if (kind === 'dragon') dragonHead(head, 0, 0, detail);
  else tigerHead(head, 0, 0, detail);
  b.addBuilder(head, { scale: 2.0, x, y: 0.04, z: z + 0.52 });

  const tiers = 7;
  let y = 1.24;
  for (let i = 0; i < tiers; i += 1) {
    const radius = 0.31 - i * 0.011;
    const bodyH = 0.21;
    const body = i % 2 === 0 ? 'cream' : 'plasterWhite';
    f.cylinder(radius * 0.97, radius, bodyH, 8, 0, y + bodyH / 2, 0, body);
    f.cylinder(
      radius * 1.015,
      radius * 1.015,
      0.035,
      8,
      0,
      y + 0.02,
      0,
      'templeRed',
    );
    f.cylinder(
      radius * 1.015,
      radius * 1.015,
      0.022,
      8,
      0,
      y + bodyH - 0.01,
      0,
      'gold',
    );
    // Painted panel band.
    f.cylinder(
      radius * 1.005,
      radius * 1.005,
      0.08,
      8,
      0,
      y + bodyH * 0.5,
      0,
      i % 2 === 0 ? 'tealDeep' : 'roofTeal',
    );
    // Corner columns.
    for (let k = 0; k < 8; k += 1) {
      const angle = (k / 8) * Math.PI * 2 + Math.PI / 8;
      f.cylinder(
        0.015,
        0.017,
        bodyH,
        5,
        Math.cos(angle) * radius * 0.99,
        y + bodyH / 2,
        Math.sin(angle) * radius * 0.99,
        'templeRed',
      );
    }
    // Four dark window openings around the shaft.
    const windowY = y + bodyH * 0.52;
    for (let k = 0; k < 4; k += 1) {
      const angle = (k / 4) * Math.PI * 2;
      const wx = Math.cos(angle) * radius * 1.01;
      const wz = Math.sin(angle) * radius * 1.01;
      const rot = -angle;
      f.box(0.12, bodyH * 0.42, 0.02, wx, windowY, wz, 'ink', rot);
      f.box(0.145, 0.018, 0.03, wx, windowY + bodyH * 0.23, wz, 'gold', rot);
      if (detail === 'high') {
        f.box(
          0.1,
          0.015,
          0.035,
          wx,
          windowY - bodyH * 0.23,
          wz,
          'templeRed',
          rot,
        );
      }
    }
    // Balcony slab + railing.
    f.cylinder(
      radius + 0.065,
      radius + 0.065,
      0.028,
      8,
      0,
      y + bodyH + 0.014,
      0,
      'stone',
    );
    ring(
      b,
      x,
      y + bodyH + 0.09,
      z,
      (radius + 0.065) * 0.98,
      'templeRed',
      0.009,
    );
    for (let k = 0; k < 8; k += 1) {
      const angle = (k / 8) * Math.PI * 2 + Math.PI / 8;
      f.box(
        0.016,
        0.15,
        0.016,
        Math.cos(angle) * (radius + 0.065) * 0.98,
        y + bodyH + 0.085,
        Math.sin(angle) * (radius + 0.065) * 0.98,
        'templeRed',
      );
    }
    // Flared green eave above each storey.
    f.eave(radius + 0.13, 0.055, 0, y + bodyH + 0.03, 0, 'roofTeal', 0.03);
    if (detail === 'high') {
      // Glazed tile ribs on the eave.
      for (let k = 0; k < 8; k += 1) {
        const angle = (k / 8) * Math.PI * 2 + Math.PI / 8;
        f.box(
          0.015,
          0.015,
          radius + 0.11,
          Math.cos(angle) * (radius + 0.05),
          y + bodyH + 0.055,
          Math.sin(angle) * (radius + 0.05),
          'roofTeal',
          angle,
        );
      }
    }
    y += bodyH + 0.075;
  }

  // Crowning roof.
  f.eave(0.38, 0.09, 0, y + 0.05, 0, 'roofTeal', 0.07);
  f.cylinder(0.32, 0.36, 0.09, 8, 0, y + 0.14, 0, 'roofTeal');
  f.cone(0.28, 0.26, 8, 0, y + 0.31, 0, 'roofTeal');
  f.cylinder(0.1, 0.13, 0.05, 8, 0, y + 0.47, 0, 'gold');
  f.sphere(0.07, 0, y + 0.55, 0, 'gold', [1, 1, 1], 8);
  f.cylinder(0.016, 0.026, 0.16, 5, 0, y + 0.67, 0, 'gold');
  f.sphere(0.028, 0, y + 0.78, 0, 'gold', [1, 1, 1], 6);
  if (detail === 'high') {
    // Little bells hanging from each corner of the top eave.
    for (let k = 0; k < 8; k += 1) {
      const angle = (k / 8) * Math.PI * 2 + Math.PI / 8;
      f.sphere(
        0.026,
        Math.cos(angle) * 0.42,
        y + 0.02,
        Math.sin(angle) * 0.42,
        'gold',
        [1, 1, 1],
        5,
      );
    }
  }
}

export function dragonTigerPagodas(
  b: CityBuilder,
  x: number,
  z: number,
  detail: DetailLevel,
) {
  // Shared terrace over the water.
  b.cylinder(1.5, 1.6, 0.18, 8, x, 0.09, z, 'stoneDark');
  b.cylinder(1.38, 1.45, 0.1, 8, x, 0.2, z, 'stone');
  b.box(2.6, 0.14, 1.35, x, 0.24, z + 0.1, 'stone');
  b.box(2.6, 0.06, 1.4, x, 0.31, z + 0.1, 'stoneDark');
  // Steps toward the approach bridge.
  for (let i = 0; i < 3; i += 1) {
    b.box(1.0, 0.06, 0.16, x, 0.05 + i * 0.045, z + 0.86 - i * 0.08, 'stone');
  }
  // Low balustrade around the terrace.
  for (const side of [-1, 1]) {
    b.box(2.3, 0.03, 0.04, x, 0.48, z + 0.82 + side * 0.02, 'stone');
    for (let i = 0; i < 9; i += 1) {
      b.box(0.035, 0.28, 0.035, x - 1.1 + i * 0.275, 0.38, z + 0.82, 'stone');
    }
  }

  pagodaTower(b, x - 1.0, z + 0.1, 'dragon', detail);
  pagodaTower(b, x + 1.0, z + 0.1, 'tiger', detail);

  // Connecting sky bridge between the two first-floor balconies.
  const bridgeY = 1.62;
  b.box(2.0, 0.07, 0.5, x, bridgeY, z + 0.1, 'stone');
  for (const side of [-1, 1]) {
    b.box(
      2.0,
      0.03,
      0.03,
      x,
      bridgeY + 0.26,
      z + 0.1 + side * 0.24,
      'templeRed',
    );
    for (let i = 0; i <= 8; i += 1) {
      b.box(
        0.025,
        0.24,
        0.025,
        x - 1.0 + i * 0.25,
        bridgeY + 0.14,
        z + 0.1 + side * 0.24,
        'templeRed',
      );
    }
  }
  b.box(2.0, 0.02, 0.5, x, bridgeY + 0.055, z + 0.1, 'roofTerracotta');

  // Entrance lanterns between the heads.
  for (const side of [-1, 1]) {
    b.cylinder(
      0.012,
      0.012,
      0.3,
      4,
      x + side * 0.42,
      1.0,
      z + 0.9,
      'metalDark',
    );
    b.sphere(
      0.08,
      x + side * 0.42,
      0.82,
      z + 0.9,
      'templeRed',
      7,
      6,
      [0.9, 1.1, 0.9],
    );
    b.cylinder(0.03, 0.04, 0.03, 6, x + side * 0.42, 0.94, z + 0.9, 'gold');
    b.cylinder(0.02, 0.02, 0.04, 6, x + side * 0.42, 0.7, z + 0.9, 'gold');
  }
}

function pavilion(
  b: CityBuilder,
  x: number,
  z: number,
  scale: number,
  detail: DetailLevel,
) {
  const f = frame(b, x, z, 0);
  const r = 0.44 * scale;
  f.cylinder(r + 0.1, r + 0.12, 0.1, 8, 0, 0.05, 0, 'stone');
  f.cylinder(r + 0.04, r + 0.06, 0.1, 8, 0, 0.15, 0, 'stoneDark');
  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2 + Math.PI / 8;
    f.cylinder(
      0.025,
      0.028,
      0.7,
      6,
      Math.cos(angle) * r,
      0.55,
      Math.sin(angle) * r,
      'templeRed',
    );
    f.box(
      0.09,
      0.03,
      0.09,
      Math.cos(angle) * r,
      0.9,
      Math.sin(angle) * r,
      'stone',
    );
  }
  // Railing between columns.
  ring(b, x, 0.36, z, r * 0.99, 'templeRed', 0.01);
  f.cylinder(r * 0.98, r * 0.98, 0.02, 8, 0, 0.88, 0, 'templeRed');
  f.eave(r + 0.18, 0.09, 0, 0.94, 0, 'roofTeal', 0.06);
  f.cylinder(r * 0.82, r * 0.9, 0.12, 8, 0, 1.02, 0, 'roofTeal');
  f.cone(r * 0.7, 0.24, 8, 0, 1.17, 0, 'roofTeal');
  f.sphere(0.06 * scale, 0, 1.31, 0, 'gold', [1, 1, 1], 7);
  if (detail === 'high') {
    f.cylinder(r * 0.16, r * 0.24, 0.05, 8, 0, 1.35, 0, 'gold');
  }
}

export function springAutumnPavilions(
  b: CityBuilder,
  x: number,
  z: number,
  detail: DetailLevel,
) {
  // Shared island and white bridge deck.
  b.box(3.3, 0.16, 2.2, x, 0.08, z, 'stoneDark');
  b.box(3.1, 0.08, 2.0, x, 0.19, z, 'stone');
  // Two pavilions, one slightly further back.
  pavilion(b, x - 0.85, z + 0.25, 1, detail);
  pavilion(b, x + 0.85, z - 0.35, 1.05, detail);

  // Guanyin statue on a lotus pedestal between them.
  b.cylinder(0.16, 0.2, 0.12, 8, x, 0.29, z - 0.05, 'stone');
  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2;
    b.sphere(
      0.09,
      x + Math.cos(angle) * 0.14,
      0.4,
      z - 0.05 + Math.sin(angle) * 0.14,
      'lotusFlower',
      5,
      6,
      [1, 0.5, 1],
    );
  }
  b.cylinder(0.07, 0.11, 0.46, 7, x, 0.62, z - 0.05, 'gold');
  b.sphere(0.055, x, 0.88, z - 0.05, 'gold', 7, 6, [1, 1, 1]);
  b.cylinder(0.16, 0.03, 0.08, 8, x, 0.95, z - 0.05, 'gold');
  b.sphere(0.045, x, 0.99, z - 0.05, 'gold', 6, 6, [1, 1, 1]);
  if (detail === 'high') {
    // Halo disc.
    b.cylinder(0.18, 0.18, 0.012, 10, x, 0.92, z - 0.18, 'gold', 0, false);
    // Bridge lamps.
    for (const side of [-1, 1]) {
      b.cylinder(
        0.02,
        0.02,
        0.3,
        5,
        x + side * 1.4,
        0.32,
        z + 0.85,
        'metalDark',
      );
      b.sphere(
        0.055,
        x + side * 1.4,
        0.48,
        z + 0.85,
        'lightWarm',
        6,
        6,
        [1, 1, 1],
      );
    }
  }
}

/** West approach bridge to the Spring & Autumn Pavilions. */
export function pavilionBridge(
  b: CityBuilder,
  x1: number,
  x2: number,
  z: number,
) {
  const length = Math.abs(x2 - x1);
  const cx = (x1 + x2) / 2;
  b.box(length, 0.09, 0.62, cx, 0.16, z, 'plasterWhite');
  b.box(length, 0.02, 0.66, cx, 0.22, z, 'stone');
  for (const side of [-1, 1]) {
    b.box(length, 0.03, 0.04, cx, 0.46, z + side * 0.29, 'plasterWhite');
    for (let i = 0; i <= Math.round(length / 0.28); i += 1) {
      b.box(
        0.035,
        0.26,
        0.035,
        x1 + (length / Math.round(length / 0.28)) * i,
        0.34,
        z + side * 0.29,
        'plasterWhite',
      );
    }
  }
  // Piers.
  for (let i = 1; i < 5; i += 1) {
    b.cylinder(
      0.06,
      0.08,
      0.16,
      6,
      x1 + (length / 5) * i,
      0.08,
      z,
      'stoneDark',
    );
  }
}

/** East gate of the old Zuoying wall (左營舊城東門). */
export function oldCityGate(
  b: CityBuilder,
  x: number,
  z: number,
  detail: DetailLevel,
) {
  const f = frame(b, x, z, Math.PI / 2);
  const wallH = 1.15;
  const wallD = 0.5;
  // Wall segments north and south of the gate.
  for (const side of [-1, 1]) {
    const segLength = 1.9;
    const center = side * 1.65;
    f.box(segLength, wallH, wallD, 0, wallH / 2, center, 'roofTerracotta');
    f.box(segLength, 0.18, wallD + 0.08, 0, 0.09, center, 'stoneDark');
    f.box(segLength, 0.08, wallD + 0.1, 0, wallH + 0.02, center, 'stone');
    // Battlements.
    for (let i = 0; i < 7; i += 1) {
      f.box(
        0.16,
        0.16,
        0.08,
        -segLength / 2 + 0.18 + i * 0.27,
        wallH + 0.13,
        center + wallD / 2 - 0.03,
        'roofClay',
      );
      f.box(
        0.16,
        0.16,
        0.08,
        -segLength / 2 + 0.18 + i * 0.27,
        wallH + 0.13,
        center - wallD / 2 + 0.03,
        'roofClay',
      );
    }
    if (detail === 'high') {
      // Brick courses.
      for (let row = 0; row < 5; row += 1) {
        f.box(
          segLength - 0.1,
          0.012,
          wallD + 0.012,
          0,
          0.22 + row * 0.18,
          center,
          'roofClay',
        );
      }
    }
  }

  // Gate opening with corbelled arch.
  f.box(1.4, wallH, wallD, 0, wallH / 2, 0, 'roofTerracotta');
  f.box(0.62, 0.64, wallD + 0.04, 0, 0.34, 0, 'ink');
  for (let i = 0; i < 4; i += 1) {
    f.box(0.62 - i * 0.14, 0.12, wallD + 0.05, 0, 0.72 + i * 0.075, 0, 'ink');
  }
  f.box(0.9, 0.16, wallD + 0.12, 0, 1.02, 0, 'stone');
  // Corner towers / buttresses.
  for (const side of [-1, 1]) {
    f.box(
      0.42,
      wallH + 0.16,
      wallD + 0.1,
      0,
      (wallH + 0.16) / 2,
      side * 0.82,
      'roofTerracotta',
    );
    f.box(0.38, 0.12, wallD + 0.14, 0, wallH + 0.22, side * 0.82, 'stone');
  }

  // Gate tower above the passage.
  const towerBase = wallH + 0.06;
  f.box(1.1, 0.12, 0.72, 0, towerBase + 0.06, 0, 'stone');
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i += 1) {
      f.cylinder(
        0.03,
        0.034,
        0.5,
        6,
        -0.4 + i * 0.4,
        towerBase + 0.37,
        side * 0.26,
        'templeRed',
      );
    }
  }
  f.box(0.94, 0.5, 0.6, 0, towerBase + 0.37, 0, 'woodDark');
  f.box(0.8, 0.28, 0.02, 0, towerBase + 0.4, 0.31, 'ink');
  f.box(0.7, 0.04, 0.03, 0, towerBase + 0.48, 0.32, 'gold');
  f.hipRoof(1.08, 0.76, 0.34, 0, towerBase + 0.64, 0, 'roofTerracotta', 0.14);
  f.box(0.5, 0.05, 0.06, 0, towerBase + 0.86, 0, 'roofClay');
  if (detail === 'high') {
    // Plaque over the arch and hanging lanterns.
    f.box(0.34, 0.16, 0.03, 0, 0.98, wallD / 2 + 0.04, 'woodDark');
    f.box(0.28, 0.1, 0.012, 0, 0.98, wallD / 2 + 0.06, 'gold');
    for (const side of [-1, 1]) {
      f.sphere(
        0.06,
        side * 0.34,
        0.85,
        wallD / 2 + 0.1,
        'templeRed',
        [0.9, 1.1, 0.9],
        6,
      );
      f.cylinder(
        0.012,
        0.012,
        0.12,
        4,
        side * 0.34,
        0.95,
        wallD / 2 + 0.1,
        'metalDark',
      );
    }
  }
  // Approach steps.
  for (let i = 0; i < 3; i += 1) {
    f.box(
      1.0,
      0.05,
      0.18,
      0,
      0.025 + i * 0.03,
      wallD / 2 + 0.22 + i * 0.1,
      'stone',
    );
  }
}

/** Flat-topped Banping Mountain, the limestone mesa behind Lotus Pond. */
export function banpingMountain(
  b: CityBuilder,
  x: number,
  z: number,
  scale = 1,
) {
  const base = 0.14;
  b.cylinder(
    1.9 * scale,
    3.1 * scale,
    0.5 * scale,
    9,
    x,
    base + 0.25 * scale,
    z,
    'grassDark',
  );
  b.cylinder(
    1.65 * scale,
    2.2 * scale,
    1.5 * scale,
    9,
    x,
    base + 1.15 * scale,
    z,
    'stoneDark',
  );
  b.cylinder(
    1.55 * scale,
    1.68 * scale,
    0.4 * scale,
    9,
    x,
    base + 1.95 * scale,
    z,
    'stone',
  );
  b.cylinder(
    1.5 * scale,
    1.52 * scale,
    0.12 * scale,
    9,
    x,
    base + 2.2 * scale,
    z,
    'grass',
  );
  // Cliff bands.
  for (let i = 0; i < 3; i += 1) {
    b.cylinder(
      (1.7 + i * 0.08) * scale,
      (1.8 + i * 0.08) * scale,
      0.09 * scale,
      9,
      x,
      base + (0.6 + i * 0.38) * scale,
      z,
      'stone',
    );
  }
  // Sparse vegetation caught on the cliff.
  for (let i = 0; i < 9; i += 1) {
    const angle = (i / 9) * Math.PI * 2 + 0.4;
    const radius = (1.7 + (i % 3) * 0.2) * scale;
    b.sphere(
      0.18 * scale,
      x + Math.cos(angle) * radius,
      base + (0.5 + (i % 4) * 0.35) * scale,
      z + Math.sin(angle) * radius,
      'foliageDeep',
      6,
      6,
      [1, 0.7, 1],
    );
  }
}

/** Small hexagonal gazebo for Metropolitan Park. */
export function parkPavilion(b: CityBuilder, x: number, z: number) {
  // A larger lakeside pavilion gives the park a readable focal structure at
  // both district and landmark camera distances.
  b.cylinder(0.78, 0.84, 0.12, 8, x, 0.06, z, 'stone');
  b.cylinder(0.7, 0.76, 0.08, 8, x, 0.16, z, 'wood');
  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2;
    b.cylinder(
      0.028,
      0.034,
      0.82,
      5,
      x + Math.cos(angle) * 0.54,
      0.57,
      z + Math.sin(angle) * 0.54,
      'woodDark',
    );
  }
  // Low railings keep the open pavilion readable from the elevated camera.
  b.cylinder(0.61, 0.61, 0.04, 8, x, 0.56, z, 'woodDark', 0, true);
  b.cylinder(0.61, 0.61, 0.04, 8, x, 0.9, z, 'woodDark', 0, true);
  b.cylinder(0.64, 0.68, 0.05, 8, x, 0.99, z, 'woodDark');
  b.cylinder(0.7, 0.76, 0.07, 8, x, 1.04, z, 'roofTerracotta');
  b.cone(0.78, 0.46, 8, x, 1.26, z, 'roofTerracotta');
  b.sphere(0.05, x, 1.5, z, 'gold', 6, 6, [1, 1, 1]);
}

/** Distant Kaohsiung skyline, including the 85 Sky Tower silhouette. */
export function distantSkyline(b: CityBuilder, x: number, z: number) {
  // 85 Sky Tower: two legs, tapering shaft, spire.
  b.box(0.42, 1.8, 0.42, x - 0.2, 0.9, z, 'plasterSky');
  b.box(0.42, 1.8, 0.42, x + 0.2, 0.9, z, 'plasterSky');
  b.box(0.8, 0.2, 0.5, x, 1.75, z, 'plasterSky');
  b.box(0.62, 1.1, 0.42, x, 2.35, z, 'glass');
  b.box(0.42, 0.6, 0.3, x, 3.15, z, 'glassDark');
  b.box(0.3, 0.5, 0.24, x, 3.65, z, 'glass');
  b.cylinder(0.02, 0.05, 0.6, 5, x, 4.2, z, 'metal');
  // Neighbouring towers.
  const towers = [
    [1.4, 1.3, 0.5],
    [-1.6, 0.9, 0.62],
    [2.6, 0.7, 0.8],
    [-2.7, 1.1, 0.5],
    [0.7, 0.55, 0.7],
  ] as Array<[number, number, number]>;
  for (const [offset, height, width] of towers) {
    b.box(
      width,
      height,
      width * 0.8,
      x + offset,
      height / 2,
      z - 0.4,
      'plasterSky',
    );
    b.box(
      width * 0.9,
      height * 0.16,
      width * 0.84,
      x + offset,
      height * 0.78,
      z - 0.4,
      'glass',
    );
  }
}
