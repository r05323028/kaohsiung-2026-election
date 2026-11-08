import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Water geometry and material builders. */

export type WaterGeometry = {
  water: THREE.BufferGeometry;
  shore: THREE.BufferGeometry;
};

function pondShape(points: Array<[number, number]>) {
  const shape = new THREE.Shape();
  const mapped = points.map(([x, z]) => new THREE.Vector2(x, -z));
  const first = mapped[0];
  if (!first) return shape;
  shape.moveTo(first.x, first.y);
  shape.splineThru([...mapped.slice(1), first]);
  return shape;
}

function expandedPoints(points: Array<[number, number]>, distance: number) {
  const cx = points.reduce((sum, p) => sum + p[0], 0) / points.length;
  const cz = points.reduce((sum, p) => sum + p[1], 0) / points.length;
  return points.map(([x, z]) => {
    const dx = x - cx;
    const dz = z - cz;
    const length = Math.hypot(dx, dz) || 1;
    return [x + (dx / length) * distance, z + (dz / length) * distance] as [
      number,
      number,
    ];
  });
}

/** Smooth pond with a sandy shoreline ring. */
export function makePond(
  points: Array<[number, number]>,
  y = 0.1,
): WaterGeometry {
  const shape = pondShape(points);
  const geometry = new THREE.ShapeGeometry(shape, 28);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, y, 0);
  geometry.computeVertexNormals();

  const outer = pondShape(expandedPoints(points, 0.42));
  const hole = new THREE.Path();
  const mapped = points.map(([x, z]) => new THREE.Vector2(x, -z));
  const first = mapped[0];
  if (first) {
    hole.moveTo(first.x, first.y);
    hole.splineThru([...mapped.slice(1), first]);
  }
  outer.holes.push(hole);
  const shore = new THREE.ShapeGeometry(outer, 24);
  shore.rotateX(-Math.PI / 2);
  shore.translate(0, y - 0.035, 0);
  shore.computeVertexNormals();

  return { water: geometry, shore };
}

export type RiverGeometry = {
  water: THREE.BufferGeometry;
  bank: THREE.BufferGeometry;
};

/** A ribbon following a Catmull-Rom centre line. */
export function makeRiver(
  points: Array<[number, number]>,
  width = 1.2,
  y = 0.085,
): RiverGeometry {
  const curve = new THREE.CatmullRomCurve3(
    points.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    false,
    'catmullrom',
    0.35,
  );
  const segments = 110;
  const water = ribbon(curve, segments, () => width, y);
  const bank = ribbon(curve, segments, () => width + 0.7, y - 0.03);
  return { water, bank };
}

function ribbon(
  curve: THREE.CatmullRomCurve3,
  segments: number,
  widthAt: (t: number) => number,
  y: number,
) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const point = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t);
    const nx = -tangent.z;
    const nz = tangent.x;
    const half = widthAt(t) / 2;
    positions.push(point.x + nx * half, y, point.z + nz * half);
    positions.push(point.x - nx * half, y, point.z - nz * half);
    uvs.push(0, t * 24);
    uvs.push(1, t * 24);
    if (i < segments) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Circular park lake. */
export function makeLake(
  x: number,
  z: number,
  radiusX: number,
  radiusZ: number,
  y = 0.085,
): WaterGeometry {
  const shape = new THREE.Shape();
  shape.absellipse(0, 0, radiusX, radiusZ, 0, Math.PI * 2, false, 0);
  const water = new THREE.ShapeGeometry(shape, 34);
  water.rotateX(-Math.PI / 2);
  water.translate(x, y, z);
  water.computeVertexNormals();

  const shoreShape = new THREE.Shape();
  shoreShape.absellipse(
    0,
    0,
    radiusX + 0.28,
    radiusZ + 0.28,
    0,
    Math.PI * 2,
    false,
    0,
  );
  const hole = new THREE.Path();
  hole.absellipse(0, 0, radiusX, radiusZ, 0, Math.PI * 2, true, 0);
  shoreShape.holes.push(hole);
  const shore = new THREE.ShapeGeometry(shoreShape, 34);
  shore.rotateX(-Math.PI / 2);
  shore.translate(x, y - 0.03, z);
  shore.computeVertexNormals();
  return { water, shore };
}

/** Large harbour basin with clipped/tapered ends so it reads as water, not a platform. */
export function makeHarbour(
  x: number,
  z: number,
  width: number,
  depth: number,
) {
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-halfWidth, -halfDepth);
  shape.lineTo(halfWidth, -halfDepth);
  shape.lineTo(halfWidth, -halfDepth * 0.2);
  shape.lineTo(halfWidth * 0.86, halfDepth * 0.62);
  shape.lineTo(halfWidth * 0.52, halfDepth);
  shape.lineTo(-halfWidth * 0.6, halfDepth);
  shape.lineTo(-halfWidth * 0.9, halfDepth * 0.42);
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(x, 0.07, z);
  geometry.computeVertexNormals();
  return geometry;
}

export type WaterMaterialOptions = {
  colour?: string;
  opacity?: number;
  ripple?: THREE.Texture | null;
};

export function createWaterMaterial(options: WaterMaterialOptions = {}) {
  const material = new THREE.MeshStandardMaterial({
    color: options.colour ?? '#63b7b2',
    roughness: 0.26,
    metalness: 0.06,
    transparent: true,
    opacity: options.opacity ?? 0.92,
    envMapIntensity: 1.15,
    side: THREE.DoubleSide,
  });
  if (options.ripple) {
    material.normalMap = options.ripple;
    material.normalScale = new THREE.Vector2(0.28, 0.28);
  }
  return material;
}

/** Instanced lotus pads and blossoms. */
export function lotusLeafGeometry() {
  const geometry = new THREE.CircleGeometry(0.085, 9, 0.24, Math.PI * 2 - 0.48);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

export function lotusFlowerGeometry() {
  const petals: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2;
    const petal = new THREE.SphereGeometry(0.04, 5, 4);
    petal.scale(1, 1.7, 0.42);
    petal.translate(0, 0.025, 0.045);
    petal.rotateY(angle);
    petals.push(petal);
  }
  const centre = new THREE.SphereGeometry(0.028, 6, 4);
  centre.translate(0, 0.06, 0);
  petals.push(centre);
  const merged = mergeGeometries(petals, false);
  for (const petal of petals) petal.dispose();
  return merged ?? new THREE.BufferGeometry();
}
