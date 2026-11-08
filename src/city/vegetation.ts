import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { seededRandom } from './builder';

export type TreeKind =
  | 'broadleaf'
  | 'palm'
  | 'banyan'
  | 'pine'
  | 'shrub'
  | 'reed';

export type TreeSpec = {
  kind: TreeKind;
  x: number;
  z: number;
  scale: number;
  rotY: number;
  tint: string;
};

const CANOPY_TINTS = [
  '#6aa55f',
  '#78b169',
  '#8cbe74',
  '#5c9c7f',
  '#a7b95f',
  '#4f8a55',
];

function merge(parts: THREE.BufferGeometry[]) {
  const geometry = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!geometry) throw new Error('vegetation merge failed');
  return geometry;
}

function blob(
  radius: number,
  x: number,
  y: number,
  z: number,
  scale: [number, number, number] = [1, 1, 1],
) {
  const geometry = new THREE.IcosahedronGeometry(radius, 1);
  geometry.scale(...scale);
  geometry.translate(x, y, z);
  return geometry;
}

function canopyBroadleaf() {
  return merge([
    blob(0.5, 0, 1.28, 0, [1.15, 0.92, 1.1]),
    blob(0.36, 0.34, 1.48, 0.12, [1.05, 0.9, 1]),
    blob(0.33, -0.38, 1.42, -0.14, [1, 0.86, 1.05]),
    blob(0.3, 0.02, 1.62, -0.3, [1.05, 0.8, 1]),
  ]);
}

function trunkBroadleaf() {
  const parts = [
    (() => {
      const g = new THREE.CylinderGeometry(0.055, 0.085, 0.95, 6);
      g.translate(0, 0.48, 0);
      return g;
    })(),
    (() => {
      const g = new THREE.CylinderGeometry(0.035, 0.05, 0.42, 5);
      g.rotateZ(0.4);
      g.translate(0.1, 0.96, 0);
      return g;
    })(),
    (() => {
      const g = new THREE.CylinderGeometry(0.03, 0.045, 0.36, 5);
      g.rotateZ(-0.5);
      g.translate(-0.09, 0.94, 0.02);
      return g;
    })(),
  ];
  return merge(parts);
}

function trunkPalm() {
  const parts: THREE.BufferGeometry[] = [];
  const heights = [0.38, 0.38, 0.34];
  let x = 0;
  let y = 0;
  heights.forEach((h, i) => {
    const g = new THREE.CylinderGeometry(
      0.045 - i * 0.006,
      0.06 - i * 0.006,
      h,
      6,
    );
    g.rotateZ(i * 0.045);
    x += 0.02 * i;
    g.translate(x, y + h / 2, 0);
    y += h;
    parts.push(g);
  });
  return merge(parts);
}

function canopyPalm() {
  const parts: THREE.BufferGeometry[] = [];
  const fronds = 8;
  for (let i = 0; i < fronds; i += 1) {
    const angle = (i / fronds) * Math.PI * 2;
    const length = 0.66 + (i % 3) * 0.06;
    const g = new THREE.BoxGeometry(length, 0.022, 0.15, 2, 1, 1);
    const position = g.getAttribute('position') as THREE.BufferAttribute;
    for (let v = 0; v < position.count; v += 1) {
      const px = position.getX(v);
      const bend = (px + length / 2) / length;
      position.setY(v, position.getY(v) - bend * bend * 0.24);
      position.setZ(v, position.getZ(v) * (1 - bend * 0.45));
    }
    g.computeVertexNormals();
    g.translate(length / 2, 1.16, 0);
    g.rotateY(angle);
    g.translate(0, 0.04 * ((i % 2) * 2 - 1), 0);
    parts.push(g);
  }
  // Coconut cluster.
  for (let i = 0; i < 3; i += 1) {
    const s = new THREE.SphereGeometry(0.07, 6, 5);
    s.translate(0.07 * Math.cos(i * 2.1), 1.08, 0.07 * Math.sin(i * 2.1));
    parts.push(s);
  }
  return merge(parts);
}

function canopyBanyan() {
  return merge([
    blob(0.82, 0, 1.62, 0, [1.3, 0.66, 1.2]),
    blob(0.58, 0.62, 1.5, 0.28, [1.1, 0.7, 1]),
    blob(0.55, -0.66, 1.48, -0.2, [1.05, 0.68, 1.1]),
    blob(0.5, 0.06, 1.82, -0.52, [1.1, 0.62, 1]),
  ]);
}

function trunkBanyan() {
  const parts: THREE.BufferGeometry[] = [
    (() => {
      const g = new THREE.CylinderGeometry(0.12, 0.2, 1.15, 7);
      g.translate(0, 0.57, 0);
      return g;
    })(),
    (() => {
      const g = new THREE.CylinderGeometry(0.07, 0.1, 0.55, 6);
      g.rotateZ(0.55);
      g.translate(0.28, 1.12, 0);
      return g;
    })(),
    (() => {
      const g = new THREE.CylinderGeometry(0.06, 0.09, 0.5, 6);
      g.rotateZ(-0.6);
      g.translate(-0.26, 1.1, 0.06);
      return g;
    })(),
  ];
  // Aerial roots.
  for (let i = 0; i < 5; i += 1) {
    const angle = (i / 5) * Math.PI * 2 + 0.6;
    const g = new THREE.CylinderGeometry(
      0.012,
      0.018,
      0.72 + (i % 3) * 0.12,
      4,
    );
    g.translate(Math.cos(angle) * 0.63, 0.45, Math.sin(angle) * 0.58);
    parts.push(g);
  }
  return merge(parts);
}

function canopyPine() {
  return merge([
    (() => {
      const g = new THREE.ConeGeometry(0.58, 0.62, 7);
      g.translate(0, 1.0, 0);
      return g;
    })(),
    (() => {
      const g = new THREE.ConeGeometry(0.46, 0.56, 7);
      g.translate(0, 1.34, 0);
      return g;
    })(),
    (() => {
      const g = new THREE.ConeGeometry(0.33, 0.5, 6);
      g.translate(0, 1.66, 0);
      return g;
    })(),
  ]);
}

function trunkPine() {
  const g = new THREE.CylinderGeometry(0.05, 0.07, 1.1, 5);
  g.translate(0, 0.55, 0);
  return g;
}

function canopyShrub() {
  return merge([
    blob(0.28, 0, 0.24, 0, [1.2, 0.8, 1]),
    blob(0.2, 0.22, 0.3, 0.08, [1, 0.8, 1]),
  ]);
}

function canopyReed() {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 7; i += 1) {
    const angle = (i / 7) * Math.PI * 2;
    const g = new THREE.BoxGeometry(0.02, 0.55 + (i % 3) * 0.12, 0.02);
    g.rotateX(0.16 * Math.cos(angle));
    g.rotateZ(0.16 * Math.sin(angle));
    g.translate(Math.cos(angle) * 0.08, 0.3, Math.sin(angle) * 0.08);
    parts.push(g);
  }
  return merge(parts);
}

export type TreeTemplate = {
  trunk: THREE.BufferGeometry | null;
  canopy: THREE.BufferGeometry;
  trunkColor: string;
};

let cache: Record<TreeKind, TreeTemplate> | null = null;

export function treeTemplates() {
  if (cache) return cache;
  cache = {
    broadleaf: {
      trunk: trunkBroadleaf(),
      canopy: canopyBroadleaf(),
      trunkColor: '#8a6247',
    },
    palm: { trunk: trunkPalm(), canopy: canopyPalm(), trunkColor: '#9c7b58' },
    banyan: {
      trunk: trunkBanyan(),
      canopy: canopyBanyan(),
      trunkColor: '#7d5c44',
    },
    pine: { trunk: trunkPine(), canopy: canopyPine(), trunkColor: '#75523d' },
    shrub: { trunk: null, canopy: canopyShrub(), trunkColor: '#8a6247' },
    reed: { trunk: null, canopy: canopyReed(), trunkColor: '#b7c47a' },
  };
  return cache;
}

export function tintFor(seed: number) {
  const random = seededRandom(seed);
  return CANOPY_TINTS[Math.floor(random() * CANOPY_TINTS.length)] ?? '#6aa55f';
}

export type TreeClusterOptions = {
  centerX: number;
  centerZ: number;
  radiusX: number;
  radiusZ: number;
  count: number;
  seed: number;
  kinds?: TreeKind[];
  avoid?: (x: number, z: number) => boolean;
};

/** Scatter trees with deterministic, clumped placement (never a perfect grid). */
export function scatterTrees(options: TreeClusterOptions): TreeSpec[] {
  const {
    centerX,
    centerZ,
    radiusX,
    radiusZ,
    count,
    seed,
    kinds = ['broadleaf', 'banyan', 'palm', 'pine'],
  } = options;
  const random = seededRandom(seed);
  const trees: TreeSpec[] = [];
  const clumps = Math.max(3, Math.round(count / 6));
  const clumpsPoints = Array.from({ length: clumps }, () => ({
    x: centerX + (random() * 2 - 1) * radiusX,
    z: centerZ + (random() * 2 - 1) * radiusZ,
  }));
  let guard = 0;
  while (trees.length < count && guard < count * 30) {
    guard += 1;
    const clump = clumpsPoints[Math.floor(random() * clumpsPoints.length)];
    if (!clump) continue;
    const x = clump.x + (random() * 2 - 1) * radiusX * 0.42;
    const z = clump.z + (random() * 2 - 1) * radiusZ * 0.42;
    if (Math.hypot((x - centerX) / radiusX, (z - centerZ) / radiusZ) > 1.08)
      continue;
    if (options.avoid?.(x, z)) continue;
    const kind = kinds[Math.floor(random() * kinds.length)] as TreeKind;
    trees.push({
      kind,
      x,
      z,
      scale: 0.72 + random() * 0.55,
      rotY: random() * Math.PI * 2,
      tint: tintFor(Math.round(seed + trees.length * 17)),
    });
  }
  return trees;
}
