import * as THREE from 'three';
import type { BuildingSpec } from './buildings';

export type BuildingBucket = 'wall' | 'glass' | 'metal';

export type BuildingGeometryBucket = {
  geometry: THREE.BufferGeometry;
  /** Index count that renders the silhouette-only tier. */
  lowIndexCount: number;
  /** Index count that renders silhouette plus standard facade detail. */
  mediumIndexCount: number;
  /** Index count for the fully detailed tier. */
  highIndexCount: number;
};

export type CityBuildingGeometry = {
  buckets: Record<BuildingBucket, BuildingGeometryBucket>;
  stats: {
    buildings: number;
    lowTriangles: number;
    mediumTriangles: number;
    highTriangles: number;
  };
};

type Vec3 = { x: number; y: number; z: number };

const ROOF_DECKS = ['#b3aea2', '#a9a79f', '#bdb7a9', '#a5a49c', '#b7b1a3'];

const COLOR_CACHE = new Map<string, THREE.Color>();

function linearColor(hex: string): THREE.Color {
  const cached = COLOR_CACHE.get(hex);
  if (cached) return cached;
  const color = new THREE.Color(hex);
  COLOR_CACHE.set(hex, color);
  return color;
}

class Batch {
  readonly positions: number[] = [];
  readonly normals: number[] = [];
  readonly colors: number[] = [];
  readonly indices: number[] = [];

  addQuad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, color: THREE.Color): void {
    const ux = b.x - a.x;
    const uy = b.y - a.y;
    const uz = b.z - a.z;
    const vx = c.x - a.x;
    const vy = c.y - a.y;
    const vz = c.z - a.z;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz) || 1;
    nx /= length;
    ny /= length;
    nz /= length;
    const base = this.positions.length / 3;
    for (const point of [a, b, c, d]) {
      this.positions.push(point.x, point.y, point.z);
      this.normals.push(nx, ny, nz);
      this.colors.push(color.r, color.g, color.b);
    }
    this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  addTriangle(a: Vec3, b: Vec3, c: Vec3, color: THREE.Color): void {
    const ux = b.x - a.x;
    const uy = b.y - a.y;
    const uz = b.z - a.z;
    const vx = c.x - a.x;
    const vy = c.y - a.y;
    const vz = c.z - a.z;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz) || 1;
    nx /= length;
    ny /= length;
    nz /= length;
    const base = this.positions.length / 3;
    for (const point of [a, b, c]) {
      this.positions.push(point.x, point.y, point.z);
      this.normals.push(nx, ny, nz);
      this.colors.push(color.r, color.g, color.b);
    }
    this.indices.push(base, base + 1, base + 2);
  }

  get triangleCount(): number {
    return this.indices.length / 3;
  }

  toGeometry(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(this.positions, 3),
    );
    geometry.setAttribute(
      'normal',
      new THREE.Float32BufferAttribute(this.normals, 3),
    );
    geometry.setAttribute(
      'color',
      new THREE.Float32BufferAttribute(this.colors, 3),
    );
    geometry.setIndex(
      this.indices.length > 65_535
        ? new THREE.Uint32BufferAttribute(this.indices, 1)
        : new THREE.Uint16BufferAttribute(this.indices, 1),
    );
    geometry.computeBoundingSphere();
    return geometry;
  }
}

const BOX_CORNERS: ReadonlyArray<readonly [number, number, number]> = [
  [-0.5, -0.5, -0.5],
  [0.5, -0.5, -0.5],
  [0.5, 0.5, -0.5],
  [-0.5, 0.5, -0.5],
  [-0.5, -0.5, 0.5],
  [0.5, -0.5, 0.5],
  [0.5, 0.5, 0.5],
  [-0.5, 0.5, 0.5],
];

const BOX_FACES: ReadonlyArray<readonly [number, number, number, number]> = [
  [4, 5, 6, 7],
  [1, 0, 3, 2],
  [5, 1, 2, 6],
  [0, 4, 7, 3],
  [7, 6, 2, 3],
  [4, 0, 1, 5],
];

class Frame {
  readonly cos: number;
  readonly sin: number;

  constructor(private readonly spec: BuildingSpec) {
    this.cos = Math.cos(spec.rotationY);
    this.sin = Math.sin(spec.rotationY);
  }

  toWorld(localX: number, localY: number, localZ: number): Vec3 {
    return {
      x: this.spec.originX + this.spec.x + localX * this.cos + localZ * this.sin,
      y: this.spec.baseY + localY,
      z: this.spec.originZ + this.spec.z - localX * this.sin + localZ * this.cos,
    };
  }

  box(
    batch: Batch,
    hex: string,
    width: number,
    height: number,
    depth: number,
    x: number,
    y: number,
    z: number,
    tiltX = 0,
    yaw = 0,
  ): void {
    const color = linearColor(hex);
    const cosTilt = Math.cos(tiltX);
    const sinTilt = Math.sin(tiltX);
    const cosYaw = Math.cos(yaw);
    const sinYaw = Math.sin(yaw);
    const points: Vec3[] = BOX_CORNERS.map(([px, py, pz]) => {
      const sx = px * width;
      const sy = py * height;
      const sz = pz * depth;
      const tiltedY = sy * cosTilt - sz * sinTilt;
      const tiltedZ = sy * sinTilt + sz * cosTilt;
      const yawedX = sx * cosYaw + tiltedZ * sinYaw;
      const yawedZ = -sx * sinYaw + tiltedZ * cosYaw;
      return this.toWorld(x + yawedX, y + tiltedY, z + yawedZ);
    });
    for (const face of BOX_FACES) {
      batch.addQuad(
        points[face[0]]!,
        points[face[1]]!,
        points[face[2]]!,
        points[face[3]]!,
        color,
      );
    }
  }

  cylinder(
    batch: Batch,
    hex: string,
    radius: number,
    height: number,
    x: number,
    y: number,
    z: number,
    segments = 8,
  ): void {
    const color = linearColor(hex);
    const bottom: Vec3[] = [];
    const top: Vec3[] = [];
    for (let index = 0; index < segments; index += 1) {
      const angle = (index / segments) * Math.PI * 2;
      const px = x + Math.cos(angle) * radius;
      const pz = z + Math.sin(angle) * radius;
      bottom.push(this.toWorld(px, y, pz));
      top.push(this.toWorld(px, y + height, pz));
    }
    for (let index = 0; index < segments; index += 1) {
      const next = (index + 1) % segments;
      batch.addQuad(bottom[index]!, bottom[next]!, top[next]!, top[index]!, color);
    }
    const center = this.toWorld(x, y + height, z);
    for (let index = 0; index < segments; index += 1) {
      const next = (index + 1) % segments;
      batch.addTriangle(top[index]!, top[next]!, center, color);
    }
  }

  gableRoof(
    batch: Batch,
    hex: string,
    width: number,
    depth: number,
    rise: number,
    x: number,
    y: number,
    z: number,
  ): void {
    const color = linearColor(hex);
    const w = width / 2;
    const d = depth / 2;
    const leftFront = this.toWorld(x - w, y, z + d);
    const rightFront = this.toWorld(x + w, y, z + d);
    const leftBack = this.toWorld(x - w, y, z - d);
    const rightBack = this.toWorld(x + w, y, z - d);
    const ridgeRight = this.toWorld(x + w, y + rise, z);
    const ridgeLeft = this.toWorld(x - w, y + rise, z);
    batch.addQuad(leftFront, rightFront, ridgeRight, ridgeLeft, color);
    batch.addQuad(rightBack, leftBack, ridgeLeft, ridgeRight, color);
    batch.addTriangle(rightFront, rightBack, ridgeRight, color);
    batch.addTriangle(leftBack, leftFront, ridgeLeft, color);
  }

  hipRoof(
    batch: Batch,
    hex: string,
    width: number,
    depth: number,
    rise: number,
    x: number,
    y: number,
    z: number,
  ): void {
    const color = linearColor(hex);
    const w = width / 2;
    const d = depth / 2;
    const ridge = Math.min(w * 0.62, width * 0.3);
    const frontLeft = this.toWorld(x - w, y, z + d);
    const frontRight = this.toWorld(x + w, y, z + d);
    const backLeft = this.toWorld(x - w, y, z - d);
    const backRight = this.toWorld(x + w, y, z - d);
    const ridgeLeft = this.toWorld(x - ridge, y + rise, z);
    const ridgeRight = this.toWorld(x + ridge, y + rise, z);
    batch.addQuad(frontLeft, frontRight, ridgeRight, ridgeLeft, color);
    batch.addQuad(backRight, backLeft, ridgeLeft, ridgeRight, color);
    batch.addTriangle(frontRight, backRight, ridgeRight, color);
    batch.addTriangle(backLeft, frontLeft, ridgeLeft, color);
  }

  shedRoof(
    batch: Batch,
    hex: string,
    width: number,
    depth: number,
    rise: number,
    x: number,
    y: number,
    z: number,
  ): void {
    const color = linearColor(hex);
    const w = width / 2;
    const d = depth / 2;
    const frontLeft = this.toWorld(x - w, y, z + d);
    const frontRight = this.toWorld(x + w, y, z + d);
    const backLeft = this.toWorld(x - w, y + rise, z - d);
    const backRight = this.toWorld(x + w, y + rise, z - d);
    batch.addQuad(frontRight, frontLeft, backLeft, backRight, color);
    batch.addTriangle(frontLeft, backLeft, this.toWorld(x - w, y, z - d), color);
    batch.addTriangle(frontRight, this.toWorld(x + w, y, z - d), backRight, color);
  }
}

type Writers = Record<BuildingBucket, Batch>;

function makeWriters(): Writers {
  return { wall: new Batch(), glass: new Batch(), metal: new Batch() };
}

type Phase = 0 | 1 | 2;

type DetailContext = {
  spec: BuildingSpec;
  frame: Frame;
  writers: Writers;
  phase: Phase;
};

function put(
  context: DetailContext,
  bucket: BuildingBucket,
  hex: string,
  width: number,
  height: number,
  depth: number,
  x: number,
  y: number,
  z: number,
  tiltX = 0,
  yaw = 0,
): void {
  context.frame.box(
    context.writers[bucket],
    hex,
    width,
    height,
    depth,
    x,
    y,
    z,
    tiltX,
    yaw,
  );
}

type FacadeSide = 'front' | 'left' | 'right';

const SIDE_YAW: Record<FacadeSide, number> = {
  front: 0,
  right: Math.PI / 2,
  left: -Math.PI / 2,
};

/**
 * Window assembled from real geometry: a trim reveal, a dark recess panel,
 * glass and (at the finest tier) a sill and mullion. Offset is measured
 * outward from the facade plane.
 */
function addWindow(
  context: DetailContext,
  side: FacadeSide,
  offset: number,
  centerX: number,
  centerY: number,
  width: number,
  height: number,
  trim: string,
  glass: string,
): void {
  const { spec } = context;
  const yaw = SIDE_YAW[side];
  const surface = (outward: number): [number, number, number] => {
    if (side === 'front') return [centerX, centerY, -spec.depth / 2 - outward];
    if (side === 'right') return [spec.width / 2 + outward, centerY, centerX];
    return [-spec.width / 2 - outward, centerY, centerX];
  };
  const reveal = surface(offset);
  put(context, 'wall', trim, width + 0.024, height + 0.022, 0.012, ...reveal, 0, yaw);
  const shadow = surface(offset + 0.006);
  put(context, 'wall', '#6d6a60', width + 0.008, height + 0.006, 0.01, ...shadow, 0, yaw);
  const pane = surface(offset + 0.01);
  put(context, 'glass', glass, width, height, 0.008, ...pane, 0, yaw);
  if (context.phase === 2) {
    const sill = surface(offset + 0.015);
    put(
      context,
      'wall',
      trim,
      width + 0.032,
      0.01,
      0.022,
      sill[0],
      centerY - height / 2 - 0.006,
      sill[2],
      0,
      yaw,
    );
    const mullion = surface(offset + 0.016);
    put(
      context,
      'metal',
      '#a9ada6',
      0.006,
      height,
      0.006,
      mullion[0],
      centerY,
      mullion[2],
      0,
      yaw,
    );
  }
}

function topMass(spec: BuildingSpec): {
  width: number;
  depth: number;
  offsetZ: number;
} {
  return spec.setback
    ? { width: spec.width - 0.08, depth: spec.depth - 0.1, offsetZ: 0.05 }
    : { width: spec.width, depth: spec.depth, offsetZ: 0 };
}

function addParapet(context: DetailContext, hex: string): void {
  const { spec } = context;
  const mass = topMass(spec);
  const w = mass.width + 0.02;
  const d = mass.depth + 0.02;
  const height = 0.032;
  const thickness = 0.02;
  const top = spec.bodyHeight + height / 2;
  put(context, 'wall', hex, w, height, thickness, 0, top, mass.offsetZ - mass.depth / 2);
  put(context, 'wall', hex, w, height, thickness, 0, top, mass.offsetZ + mass.depth / 2);
  put(context, 'wall', hex, thickness, height, d, -mass.width / 2, top, mass.offsetZ);
  put(context, 'wall', hex, thickness, height, d, mass.width / 2, top, mass.offsetZ);
}

function addRoof(context: DetailContext): void {
  const { spec } = context;
  const w = spec.width + 0.05;
  const d = spec.depth + 0.07;
  const roofY = spec.bodyHeight;
  if (spec.roof === 'gable') {
    context.frame.gableRoof(
      context.writers.wall,
      spec.roofColor,
      w,
      d,
      spec.roofHeight,
      0,
      roofY,
      0,
    );
    if (context.phase === 2) {
      put(
        context,
        'metal',
        '#8c7a6c',
        0.016,
        0.012,
        d,
        0,
        roofY + spec.roofHeight - 0.004,
        0,
      );
    }
  } else if (spec.roof === 'hip') {
    context.frame.hipRoof(
      context.writers.wall,
      spec.roofColor,
      w,
      d,
      spec.roofHeight,
      0,
      roofY,
      0,
    );
    if (context.phase === 2) {
      put(
        context,
        'metal',
        '#8c7a6c',
        0.02,
        0.01,
        0.02,
        0,
        roofY + spec.roofHeight,
        0,
      );
    }
  } else if (spec.roof === 'sawtooth') {
    // Two pitched teeth with clerestory glazing: the factory roof silhouette.
    const toothDepth = d / 2;
    for (let tooth = 0; tooth < 2; tooth += 1) {
      context.frame.shedRoof(
        context.writers.metal,
        spec.roofColor,
        w,
        toothDepth,
        spec.roofHeight,
        0,
        roofY,
        tooth === 0 ? toothDepth / 2 : -toothDepth / 2,
      );
    }
    put(
      context,
      'metal',
      '#8e928c',
      w,
      spec.roofHeight * 0.42,
      0.012,
      0,
      roofY + spec.roofHeight * 0.79,
      0,
    );
    put(
      context,
      'glass',
      spec.glassColor,
      w * 0.94,
      spec.roofHeight * 0.34,
      0.014,
      0,
      roofY + spec.roofHeight * 0.8,
      -0.008,
    );
    if (context.phase >= 1) {
      put(
        context,
        'metal',
        spec.trimColor,
        w,
        0.02,
        0.028,
        0,
        roofY + spec.roofHeight,
        -d / 2,
      );
    }
  } else {
    // Concrete roof deck: from the high camera this top surface is what most
    // buildings show, so give it its own weathered material.
    const mass = topMass(spec);
    const deckColor = ROOF_DECKS[spec.variant % ROOF_DECKS.length] ?? '#b3aea2';
    put(
      context,
      'wall',
      deckColor,
      mass.width * 0.96,
      0.012,
      mass.depth * 0.96,
      0,
      spec.bodyHeight + 0.006,
      mass.offsetZ,
    );
    addParapet(context, spec.trimColor);
  }
}

function addGroundFloor(context: DetailContext): void {
  const { spec } = context;
  const fz = -spec.depth / 2;
  const fh = spec.floorHeight;
  const doorX = -spec.width * 0.26;
  if (spec.arcade) {
    put(
      context,
      'wall',
      spec.wallColor,
      spec.width,
      spec.bodyHeight - fh,
      spec.depth,
      0,
      fh + (spec.bodyHeight - fh) / 2,
      0,
    );
    // Back wall of the recessed walkway plus a shop window.
    put(
      context,
      'wall',
      spec.wallColor,
      spec.width,
      fh,
      0.04,
      0,
      fh / 2,
      spec.depth / 2 - 0.02,
    );
    put(
      context,
      'glass',
      spec.glassColor,
      spec.width - 0.08,
      fh * 0.56,
      0.012,
      0,
      fh * 0.42,
      spec.depth / 2 - 0.045,
    );
    put(
      context,
      'wall',
      '#5f5c55',
      spec.width - 0.06,
      fh * 0.66,
      0.006,
      0,
      fh * 0.36,
      spec.depth / 2 - 0.038,
    );
    // Columns and the beam that carries the upper floors.
    const columns = Math.max(2, Math.round(spec.width / 0.1));
    for (let index = 0; index < columns; index += 1) {
      const x = -spec.width / 2 + (index / (columns - 1)) * spec.width;
      put(
        context,
        'wall',
        spec.trimColor,
        0.026,
        fh,
        0.026,
        x,
        fh / 2,
        fz + 0.018,
      );
    }
    put(
      context,
      'wall',
      spec.trimColor,
      spec.width,
      0.03,
      0.036,
      0,
      fh - 0.015,
      fz + 0.018,
    );
    if (spec.awning) {
      put(
        context,
        'metal',
        spec.metalColor,
        spec.width * 0.82,
        0.008,
        0.09,
        0,
        fh - 0.055,
        fz - 0.062,
        0.32,
      );
    }
    return;
  }

  if (spec.setback) {
    const mass = topMass(spec);
    const lowerHeight = spec.bodyHeight - fh;
    put(
      context,
      'wall',
      spec.wallColor,
      spec.width,
      lowerHeight,
      spec.depth,
      0,
      lowerHeight / 2,
      0,
    );
    // Terrace slab and the low parapet at the front edge.
    put(
      context,
      'wall',
      spec.trimColor,
      spec.width + 0.03,
      0.012,
      spec.depth + 0.03,
      0,
      lowerHeight + 0.006,
      0,
    );
    put(
      context,
      'wall',
      spec.trimColor,
      spec.width + 0.03,
      0.03,
      0.014,
      0,
      lowerHeight + 0.021,
      -spec.depth / 2 - 0.008,
    );
    put(
      context,
      'wall',
      spec.wallColor,
      mass.width,
      fh,
      mass.depth,
      0,
      lowerHeight + fh / 2,
      mass.offsetZ,
    );
  } else {
    put(
      context,
      'wall',
      spec.wallColor,
      spec.width,
      spec.bodyHeight,
      spec.depth,
      0,
      spec.bodyHeight / 2,
      0,
    );
  }
  // Door.
  put(context, 'wall', '#5c5950', 0.075, 0.165, 0.018, doorX, 0.085, fz - 0.006);
  if (context.phase === 2) {
    put(
      context,
      'wall',
      spec.trimColor,
      0.095,
      0.19,
      0.012,
      doorX,
      0.09,
      fz - 0.002,
    );
  }
  if (spec.archetype === 'warehouse') {
    const doorHeight = Math.min(0.24, fh * 0.66);
    put(
      context,
      'metal',
      spec.metalColor,
      spec.width * 0.5,
      doorHeight,
      0.02,
      spec.width * 0.13,
      doorHeight / 2 + 0.01,
      fz - 0.006,
    );
    const slats = 4;
    for (let index = 1; index < slats; index += 1) {
      put(
        context,
        'wall',
        '#78796f',
        spec.width * 0.5,
        0.006,
        0.008,
        spec.width * 0.13,
        (doorHeight / slats) * index,
        fz - 0.014,
      );
    }
    if (context.phase === 2) {
      put(
        context,
        'metal',
        spec.metalColor,
        0.04,
        0.03,
        0.02,
        -spec.width * 0.34,
        fh - 0.06,
        fz - 0.006,
      );
    }
    return;
  }
  // Shop window beside the door.
  const shopWidth = spec.width * 0.44;
  const shopX = spec.width * 0.2;
  addWindow(
    context,
    'front',
    0,
    shopX,
    0.105,
    Math.min(shopWidth * 0.8, 0.16),
    0.105,
    spec.trimColor,
    spec.glassColor,
  );
  if (spec.archetype === 'townhouse' || spec.shopSign) {
    put(
      context,
      'metal',
      spec.metalColor,
      shopWidth * 0.9,
      0.14,
      0.012,
      shopX,
      0.105,
      fz - 0.008,
    );
    if (context.phase === 2) {
      for (let index = 0; index < 3; index += 1) {
        put(
          context,
          'wall',
          '#7c7d74',
          shopWidth * 0.9,
          0.008,
          0.008,
          shopX,
          0.06 + index * 0.03,
          fz - 0.016,
        );
      }
    }
  }
}

function addFacadeDetail(context: DetailContext): void {
  const { spec } = context;
  const fh = spec.floorHeight;
  const frontZ = -spec.depth / 2;
  const cameraX = 0.773;
  const cameraZ = 0.634;
  const localCameraX =
    cameraX * Math.cos(spec.rotationY) - cameraZ * Math.sin(spec.rotationY);
  const visibleSide: FacadeSide = localCameraX >= 0 ? 'right' : 'left';

  const columns = spec.windowColumns;
  const cell = (spec.width - 0.06) / columns;
  const windowWidth = Math.min(cell * 0.6, 0.095);
  const windowHeight = Math.min(fh * 0.5, 0.085);
  const topFloor = spec.setback ? spec.floors - 1 : spec.floors;
  for (let floor = 1; floor < topFloor; floor += 1) {
    const y = floor * fh + fh * 0.55;
    for (let column = 0; column < columns; column += 1) {
      const x = -spec.width / 2 + 0.03 + cell * (column + 0.5);
      if ((spec.variant + floor * 7 + column * 3) % 13 === 0) continue;
      addWindow(
        context,
        'front',
        0,
        x,
        y,
        windowWidth,
        windowHeight,
        spec.trimColor,
        spec.glassColor,
      );
    }
    // Horizontal floor band, a strong shadow line at this scale.
    put(
      context,
      'wall',
      spec.trimColor,
      spec.width + 0.008,
      0.012,
      0.012,
      0,
      floor * fh,
      frontZ - 0.004,
    );
    if (spec.floors > 2) {
      put(
        context,
        'wall',
        spec.trimColor,
        0.012,
        0.012,
        spec.depth + 0.008,
        spec.width / 2 + 0.004,
        floor * fh,
        0,
      );
    }
  }

  if (spec.setback) {
    // Ribbon window on the stepped-back top floor.
    const mass = topMass(spec);
    const y = (spec.floors - 1) * fh + fh * 0.55;
    const z = mass.offsetZ - mass.depth / 2;
    put(
      context,
      'wall',
      spec.trimColor,
      mass.width * 0.72,
      fh * 0.44,
      0.01,
      0,
      y,
      z - 0.005,
    );
    put(
      context,
      'glass',
      spec.glassColor,
      mass.width * 0.64,
      fh * 0.36,
      0.012,
      0,
      y,
      z - 0.014,
    );
    for (const offset of [-0.22, 0, 0.22]) {
      put(
        context,
        'metal',
        '#a9ada6',
        0.005,
        fh * 0.36,
        0.006,
        mass.width * offset,
        y,
        z - 0.02,
      );
    }
  }

  if (
    spec.archetype !== 'warehouse' &&
    spec.archetype !== 'modernBlock' &&
    !spec.arcade
  ) {
    // Corner pilasters give the flat street wall a vertical rhythm.
    for (const side of [-1, 1]) {
      put(
        context,
        'wall',
        spec.trimColor,
        0.018,
        spec.bodyHeight,
        0.016,
        side * (spec.width / 2 - 0.009),
        spec.bodyHeight / 2,
        frontZ - 0.006,
      );
    }
    put(
      context,
      'wall',
      spec.trimColor,
      spec.width + 0.024,
      0.018,
      0.02,
      0,
      spec.bodyHeight - 0.012,
      frontZ - 0.008,
    );
  }

  // Side windows only on the camera-facing side: the other side is never seen.
  const sideColumns = Math.max(1, Math.round(spec.depth / 0.09));
  const sideWindowWidth = Math.min((spec.depth - 0.05) / sideColumns * 0.55, 0.075);
  for (let floor = 1; floor < topFloor; floor += 1) {
    const y = floor * fh + fh * 0.55;
    for (let column = 0; column < Math.min(sideColumns, 3); column += 1) {
      const z = -spec.depth / 2 + 0.02 + (spec.depth - 0.04) * ((column + 0.5) / Math.min(sideColumns, 3));
      addWindow(
        context,
        visibleSide,
        0,
        z,
        y,
        sideWindowWidth,
        windowHeight,
        spec.trimColor,
        spec.glassColor,
      );
    }
  }
}

function addShopfrontDetails(context: DetailContext): void {
  const { spec } = context;
  if (spec.arcade || spec.archetype === 'warehouse') return;
  const fz = -spec.depth / 2;
  if (spec.awning) {
    put(
      context,
      'metal',
      spec.metalColor,
      spec.width * 0.8,
      0.008,
      0.085,
      0,
      spec.floorHeight - 0.028,
      fz - 0.055,
      0.34,
    );
    put(
      context,
      'wall',
      spec.signColor,
      spec.width * 0.8,
      0.016,
      0.008,
      0,
      spec.floorHeight - 0.062,
      fz - 0.095,
    );
  }
  if (!spec.shopSign) return;
  // Taipei-style blade sign hanging from the shopfront.
  const side = (spec.variant & 1) === 0 ? 1 : -1;
  const x = side * (spec.width / 2 - 0.05);
  put(
    context,
    'metal',
    '#8e928c',
    0.012,
    0.012,
    0.04,
    x,
    spec.floorHeight - 0.075,
    fz - 0.03,
  );
  put(
    context,
    'wall',
    spec.signColor,
    0.014,
    0.105,
    0.075,
    x,
    spec.floorHeight - 0.14,
    fz - 0.075,
  );
  // Painted sign band across the facade.
  put(
    context,
    'wall',
    spec.signColor,
    spec.width * 0.56,
    0.045,
    0.012,
    0,
    spec.floorHeight + 0.045,
    fz - 0.012,
  );
}

function addRooftop(context: DetailContext): void {
  const { spec } = context;
  const mass = topMass(spec);
  const roofY = spec.bodyHeight;
  const cornerX = mass.width * (spec.variant % 2 === 0 ? 0.26 : -0.26);
  const cornerZ = mass.offsetZ + mass.depth * 0.2;
  if (spec.roof !== 'flat' && spec.roof !== 'sawtooth') return;
  // Rooftop water tank on its little concrete pad plus a stair bulkhead.
  put(
    context,
    'wall',
    spec.trimColor,
    0.085,
    0.018,
    0.075,
    cornerX,
    roofY + 0.009,
    cornerZ,
  );
  for (let tank = 0; tank < (spec.variant % 4 === 0 ? 2 : 1); tank += 1) {
    context.frame.cylinder(
      context.writers.metal,
      spec.metalColor,
      0.05,
      0.115,
      cornerX - tank * 0.11,
      roofY + 0.018,
      cornerZ,
      8,
    );
  }
  if (spec.variant % 3 === 0) {
    // Solar water heater panel, a fixture on nearly every Taiwanese roof.
    put(
      context,
      'metal',
      '#4d6b7a',
      mass.width * 0.3,
      0.012,
      mass.depth * 0.2,
      mass.width * 0.08,
      roofY + 0.12,
      mass.offsetZ - mass.depth * 0.02,
      -0.5,
    );
  }
  put(
    context,
    'wall',
    spec.trimColor,
    0.1,
    0.06,
    0.075,
    -mass.width * 0.24,
    roofY + 0.03,
    mass.offsetZ - mass.depth * 0.2,
  );
  if (spec.archetype === 'warehouse') {
    // Factory stack and roof vents give the industrial belt its silhouette.
    if (spec.variant % 3 === 0) {
      context.frame.cylinder(
        context.writers.metal,
        spec.metalColor,
        0.024,
        0.23,
        mass.width * 0.28,
        roofY + 0.115,
        mass.offsetZ - mass.depth * 0.24,
        8,
      );
      put(
        context,
        'metal',
        '#8d918b',
        0.07,
        0.014,
        0.07,
        mass.width * 0.28,
        roofY + 0.235,
        mass.offsetZ - mass.depth * 0.24,
      );
    }
    for (let vent = 0; vent < 2; vent += 1) {
      put(
        context,
        'metal',
        spec.metalColor,
        0.05,
        0.03,
        0.05,
        -mass.width * 0.1 + vent * 0.11,
        roofY + 0.015,
        mass.offsetZ + mass.depth * 0.26,
      );
    }
  }
}

function addBalconyRailings(context: DetailContext): void {
  const { spec } = context;
  if (!spec.balconies) return;
  const fh = spec.floorHeight;
  const frontZ = -spec.depth / 2;
  const cell = (spec.width - 0.06) / spec.windowColumns;
  const x = -spec.width / 2 + 0.03 + cell * (Math.floor(spec.windowColumns / 2) + 0.5);
  const topFloor = spec.setback ? spec.floors - 1 : spec.floors;
  for (let floor = 1; floor < topFloor; floor += 1) {
    put(
      context,
      'wall',
      spec.trimColor,
      cell * 0.9,
      0.014,
      0.06,
      x,
      floor * fh + 0.006,
      frontZ - 0.028,
    );
    put(
      context,
      'wall',
      spec.trimColor,
      cell * 0.9,
      0.026,
      0.012,
      x,
      floor * fh + 0.02,
      frontZ - 0.056,
    );
  }
}

function addLandmarkWindow(context: DetailContext): void {
  const { spec } = context;
  if (spec.archetype === 'warehouse' || spec.arcade) return;
  if (!spec.shopSign) return;
  const facadeWidth = spec.width * 0.5;
  put(
    context,
    'wall',
    spec.signColor,
    facadeWidth,
    0.04,
    0.01,
    0,
    spec.bodyHeight - 0.035,
    -spec.depth / 2 - 0.008,
  );
}

/** Adds one building from every phase into the shared batches. */
function writeBuildingPhase(
  spec: BuildingSpec,
  phase: Phase,
  writers: Writers,
): void {
  const context: DetailContext = {
    spec,
    frame: new Frame(spec),
    writers,
    phase,
  };
  if (phase === 0) {
    // Foundation slab, body, roof, and the details that shape the silhouette.
    put(
      context,
      'wall',
      '#d3c7b2',
      spec.width + 0.09,
      0.018,
      spec.depth + 0.09,
      0,
      0.009,
      0,
    );
    addGroundFloor(context);
    addRoof(context);
    addRooftop(context);
    addBalconyRailings(context);
    if (spec.awning && !spec.arcade) {
      put(
        context,
        'wall',
        spec.signColor,
        spec.width * 0.82,
        0.008,
        0.09,
        0,
        spec.floorHeight - 0.04,
        -spec.depth / 2 - 0.06,
        0.3,
      );
      put(
        context,
        'metal',
        '#8e928c',
        spec.width * 0.82,
        0.006,
        0.008,
        0,
        spec.floorHeight - 0.044,
        -spec.depth / 2 - 0.105,
      );
    }
    if (spec.shopSign && spec.archetype !== 'warehouse') {
      const side = (spec.variant & 1) === 0 ? 1 : -1;
      put(
        context,
        'metal',
        '#8e928c',
        0.012,
        0.012,
        0.04,
        side * (spec.width / 2 - 0.05),
        spec.floorHeight - 0.075,
        -spec.depth / 2 - 0.03,
      );
      put(
        context,
        'wall',
        spec.signColor,
        0.016,
        0.11,
        0.075,
        side * (spec.width / 2 - 0.05),
        spec.floorHeight - 0.14,
        -spec.depth / 2 - 0.075,
      );
    }
  } else if (phase === 1) {
    addFacadeDetail(context);
    addShopfrontDetails(context);
    addLandmarkWindow(context);
    if (spec.waterTank && spec.roof !== 'flat' && spec.roof !== 'sawtooth') {
      context.frame.cylinder(
        context.writers.metal,
        spec.metalColor,
        0.035,
        0.07,
        spec.width * 0.26,
        spec.bodyHeight + spec.roofHeight * 0.4,
        spec.depth * 0.16,
        8,
      );
    }
  } else {
    // AC condensers, antenna and the gutter downpipe.
    for (let index = 0; index < 2; index += 1) {
      put(
        context,
        'metal',
        spec.metalColor,
        0.05,
        0.034,
        0.03,
        -spec.width * 0.12 + index * 0.08,
        spec.bodyHeight + 0.017,
        -spec.depth * 0.18,
      );
    }
    put(
      context,
      'metal',
      '#8a8f88',
      0.004,
      0.11,
      0.004,
      spec.width * 0.3,
      spec.bodyHeight + 0.055,
      -spec.depth * 0.24,
    );
    put(
      context,
      'metal',
      '#9aa09a',
      0.012,
      spec.bodyHeight,
      0.012,
      spec.width / 2 - 0.01,
      spec.bodyHeight / 2,
      -spec.depth / 2 - 0.008,
    );
    put(
      context,
      'wall',
      spec.trimColor,
      spec.width * 0.3,
      0.05,
      0.02,
      0,
      spec.bodyHeight - 0.045,
      -spec.depth / 2 - 0.012,
    );
  }
}

export function buildCityBuildingGeometry(
  specs: readonly BuildingSpec[],
): CityBuildingGeometry {
  const writers = makeWriters();
  const indexCounts: Record<BuildingBucket, number[]> = {
    wall: [0, 0, 0],
    glass: [0, 0, 0],
    metal: [0, 0, 0],
  };
  for (const phase of [0, 1, 2] as const) {
    for (const spec of specs) writeBuildingPhase(spec, phase, writers);
    for (const bucket of ['wall', 'glass', 'metal'] as const) {
      indexCounts[bucket]![phase] = writers[bucket].indices.length;
    }
  }

  const buckets = {} as Record<BuildingBucket, BuildingGeometryBucket>;
  for (const bucket of ['wall', 'glass', 'metal'] as const) {
    const batch = writers[bucket];
    const counts = indexCounts[bucket]!;
    buckets[bucket] = {
      geometry: batch.toGeometry(),
      lowIndexCount: counts[0]!,
      mediumIndexCount: counts[1]!,
      highIndexCount: counts[2]!,
    };
  }

  const triangles = (bucket: BuildingBucket): number =>
    buckets[bucket].highIndexCount / 3;
  return {
    buckets,
    stats: {
      buildings: specs.length,
      lowTriangles: Math.round(
        (buckets.wall.lowIndexCount +
          buckets.glass.lowIndexCount +
          buckets.metal.lowIndexCount) /
          3,
      ),
      mediumTriangles: Math.round(
        (buckets.wall.mediumIndexCount +
          buckets.glass.mediumIndexCount +
          buckets.metal.mediumIndexCount) /
          3,
      ),
      highTriangles: Math.round(
        (triangles('wall') + triangles('glass') + triangles('metal')) / 1,
      ),
    },
  };
}
