import * as THREE from 'three';

/**
 * Authored landmark geometry kit.
 *
 * Every hero landmark in the miniature city is built from these parametric
 * builders instead of ad-hoc primitives. The kit enforces the three rules the
 * old models broke:
 *
 * 1. One coordinate system. Y is up, the ground plane is y = 0, +Z faces the
 *    viewer, and every builder is centred on its own origin.
 * 2. Real thickness. Roofs are shells with a measurable underside and a rim,
 *    never zero-thickness sheets.
 * 3. Connected structure. Builders expose the exact curves and heights their
 *    supports must reach (see strutTransform), so columns and struts can be
 *    placed on the surface instead of floating near it.
 *
 * All geometry is deterministic and unit-testable in Node, which is why the
 * project keeps authored geometry in code rather than shipping binary GLB
 * files: the repository has no 3D authoring dependency, the models are small,
 * and invariants (contact, thickness, symmetry) can be asserted in CI.
 */

export type Vec3 = [number, number, number];

export interface StrutTransform {
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
}

export interface BoxSpec {
  position: Vec3;
  scale: Vec3;
  rotation?: Vec3;
}

export interface StrutSpec {
  from: Vec3;
  to: Vec3;
  width: number;
  depth?: number;
}

const UP = new THREE.Vector3(0, 1, 0);

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const smoothstep = (edge0: number, edge1: number, value: number): number => {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

/** Gaussian bump used to sculpt soft folds into roof shells. */
export const bump = (value: number, center: number, width: number): number => {
  const t = (value - center) / width;
  return Math.exp(-t * t);
};

/**
 * Transform for a square-section member spanning from -> to. The returned
 * scale is in world units, so a unit box geometry renders as a real strut and
 * both endpoints are guaranteed to be touched.
 */
export function strutTransform(
  from: Vec3,
  to: Vec3,
  width: number,
  depth = width,
): StrutTransform {
  const start = new THREE.Vector3(from[0], from[1], from[2]);
  const end = new THREE.Vector3(to[0], to[1], to[2]);
  const delta = end.clone().sub(start);
  const length = Math.max(delta.length(), 1e-5);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    UP,
    delta.clone().divideScalar(length),
  );
  const euler = new THREE.Euler().setFromQuaternion(quaternion, 'XYZ');
  return {
    position: [
      (start.x + end.x) / 2,
      (start.y + end.y) / 2,
      (start.z + end.z) / 2,
    ],
    rotation: [euler.x, euler.y, euler.z],
    scale: [width, length, depth],
  };
}

function mergeGeometries(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let offset = 0;

  for (const part of parts) {
    const position = part.getAttribute('position');
    const normal = part.getAttribute('normal');
    const uv = part.getAttribute('uv');
    const index = part.getIndex();
    for (let vertex = 0; vertex < position.count; vertex += 1) {
      positions.push(
        position.getX(vertex),
        position.getY(vertex),
        position.getZ(vertex),
      );
      normals.push(
        normal.getX(vertex),
        normal.getY(vertex),
        normal.getZ(vertex),
      );
      uvs.push(uv ? uv.getX(vertex) : 0, uv ? uv.getY(vertex) : 0);
    }
    if (index) {
      for (let i = 0; i < index.count; i += 1) {
        indices.push(index.getX(i) + offset);
      }
    } else {
      for (let i = 0; i < position.count; i += 1) indices.push(i + offset);
    }
    offset += position.count;
    part.dispose();
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

/** One mesh for a whole cluster of boxes (mullions, sleepers, truss chords). */
export function makeBoxClusterGeometry(boxes: BoxSpec[]): THREE.BufferGeometry {
  const parts = boxes.map(({ position, scale, rotation }) => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(position[0], position[1], position[2]),
      new THREE.Quaternion().setFromEuler(
        new THREE.Euler(...(rotation ?? [0, 0, 0])),
      ),
      new THREE.Vector3(scale[0], scale[1], scale[2]),
    );
    geometry.applyMatrix4(matrix);
    return geometry;
  });
  return mergeGeometries(parts);
}

/** One mesh for a whole frame of connecting members. */
export function makeStrutGeometry(struts: StrutSpec[]): THREE.BufferGeometry {
  return makeBoxClusterGeometry(
    struts.map(({ from, to, width, depth }) => {
      const transform = strutTransform(from, to, width, depth ?? width);
      return {
        position: transform.position,
        scale: transform.scale,
        rotation: transform.rotation,
      };
    }),
  );
}

/**
 * Polar superellipse radius. exponent 2 is an ellipse, 8 is a rounded
 * rectangle. Used for roof plans that are rectangles with soft corners.
 */
export function superellipseRadius(angle: number, exponent: number): number {
  const c = Math.abs(Math.cos(angle));
  const s = Math.abs(Math.sin(angle));
  return 1 / (c ** exponent + s ** exponent) ** (1 / exponent);
}

export interface RadialShellOptions {
  radiusX: number;
  radiusZ: number;
  /** Multiplier applied to the base ellipse at a given angle. */
  radiusAt?: (angle: number) => number;
  heightAt: (x: number, z: number) => number;
  thickness: number;
  segments?: number;
  rings?: number;
  /** Triangles whose centroid falls inside an opening are omitted. */
  holeAt?: (x: number, z: number) => boolean;
}

/**
 * Closed thin-shell roof: a smooth height field swept over a polar plan, with a
 * real underside and a rim band of the given thickness. Because the plan is
 * polar the silhouette stays smooth at any zoom (no stair-stepped edges).
 */
export function makeRadialShellGeometry({
  radiusX,
  radiusZ,
  radiusAt = () => 1,
  heightAt,
  thickness,
  segments = 72,
  rings = 14,
  holeAt,
}: RadialShellOptions): THREE.BufferGeometry {
  const positions: number[] = [];
  const triangles: {
    index: [number, number, number];
    cx: number;
    cz: number;
  }[] = [];

  const point = (ring: number, segment: number): Vec3 => {
    const angle = (segment / segments) * Math.PI * 2;
    const t = ring / rings;
    const radius = radiusAt(angle) * t;
    const x = Math.cos(angle) * radius * radiusX;
    const z = Math.sin(angle) * radius * radiusZ;
    return [x, heightAt(x, z), z];
  };

  const addSurface = (offset: number, flip: boolean) => {
    const centre = positions.length / 3;
    positions.push(0, heightAt(0, 0) + offset, 0);
    const start = positions.length / 3;
    for (let ring = 1; ring <= rings; ring += 1) {
      for (let segment = 0; segment < segments; segment += 1) {
        const [x, y, z] = point(ring, segment);
        positions.push(x, y + offset, z);
      }
    }
    const emit = (a: number, b: number, c: number) => {
      const cx =
        ((positions[a * 3] ?? 0) +
          (positions[b * 3] ?? 0) +
          (positions[c * 3] ?? 0)) /
        3;
      const cz =
        ((positions[a * 3 + 2] ?? 0) +
          (positions[b * 3 + 2] ?? 0) +
          (positions[c * 3 + 2] ?? 0)) /
        3;
      triangles.push({
        index: flip ? [a, c, b] : [a, b, c],
        cx,
        cz,
      });
    };
    for (let segment = 0; segment < segments; segment += 1) {
      const next = (segment + 1) % segments;
      emit(centre, start + next, start + segment);
    }
    for (let ring = 1; ring < rings; ring += 1) {
      const inner = start + (ring - 1) * segments;
      const outer = start + ring * segments;
      for (let segment = 0; segment < segments; segment += 1) {
        const next = (segment + 1) % segments;
        emit(inner + segment, outer + next, outer + segment);
        emit(inner + segment, inner + next, outer + next);
      }
    }
  };

  addSurface(0, false);
  addSurface(-thickness, true);

  const indices: number[] = [];
  for (const triangle of triangles) {
    if (holeAt && holeAt(triangle.cx, triangle.cz)) continue;
    indices.push(...triangle.index);
  }

  // Rim band: its own vertices keep the edge crisp instead of smoothing it.
  for (let segment = 0; segment < segments; segment += 1) {
    const next = (segment + 1) % segments;
    const [ax, ay, az] = point(rings, segment);
    const [bx, by, bz] = point(rings, next);
    const base = positions.length / 3;
    positions.push(
      ax,
      ay,
      az,
      bx,
      by,
      bz,
      bx,
      by - thickness,
      bz,
      ax,
      ay - thickness,
      az,
    );
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/* ------------------------------------------------------------------ */
/* Weiwuying: one continuous folded shell over a glazed podium         */
/* ------------------------------------------------------------------ */

export const WEIWUYING_ROOF = {
  radiusX: 1.02,
  radiusZ: 0.8,
  thickness: 0.028,
  deck: 0.3,
} as const;

/** Signature plan of the National Kaohsiung Center for the Arts. */
export function weiwuyingRadiusAt(angle: number): number {
  return (
    superellipseRadius(angle, 3.1) *
    (1 + 0.035 * Math.sin(2 * angle + 0.9) + 0.018 * Math.cos(3 * angle - 0.4))
  );
}

/**
 * Height field of the Weiwuying roof: a broad near-flat plateau with soft
 * saddles, a deep sweep on the south side and corners that fall away.
 */
export function weiwuyingRoofHeight(x: number, z: number): number {
  const u = x / WEIWUYING_ROOF.radiusX;
  const v = z / WEIWUYING_ROOF.radiusZ;
  const radius = Math.min(1, Math.hypot(u, v));
  const plateau = 0.21 * (1 - smoothstep(0.12, 0.9, radius));
  const saddleA = 0.065 * bump(u, -0.34, 0.34) * bump(v, 0.04, 0.42);
  const saddleB = -0.08 * bump(u, 0.36, 0.3) * bump(v, -0.12, 0.46);
  const lift = 0.05 * bump(u, -0.02, 0.55) * bump(v, 0.52, 0.32);
  const sweep = -0.075 * smoothstep(0.0, 1.0, v);
  const cornerDrop = -0.06 * u * u * v * v;
  const rim = -0.05 * smoothstep(0.78, 1, radius);
  return 0.555 + plateau + saddleA + saddleB + lift + sweep + cornerDrop + rim;
}

/** Exact underside of the roof at a plan position: where columns must end. */
export function weiwuyingRoofUnderside(x: number, z: number): number {
  return weiwuyingRoofHeight(x, z) - WEIWUYING_ROOF.thickness;
}

/** Two light wells recessed into the roof deck, as in the real building. */
export const WEIWUYING_WELLS = [
  { x: -0.22, z: 0.05, width: 0.3, depth: 0.22 },
  { x: 0.29, z: -0.07, width: 0.22, depth: 0.18 },
] as const;

/** True inside one of the two courtyards cut through the roof shell. */
export function isInsideWeiwuyingWell(x: number, z: number): boolean {
  return WEIWUYING_WELLS.some(
    (well) =>
      Math.abs(x - well.x) <= well.width / 2 &&
      Math.abs(z - well.z) <= well.depth / 2,
  );
}

/* ------------------------------------------------------------------ */
/* HSR Zuoying: long cantilevered canopy on splayed steel struts       */
/* ------------------------------------------------------------------ */

export const HSR_CANOPY = {
  radiusX: 0.82,
  radiusZ: 0.44,
  thickness: 0.05,
} as const;

/** Gently cambered station canopy, higher at the public entrance side. */
export function hsrCanopyHeight(x: number, z: number): number {
  const u = x / HSR_CANOPY.radiusX;
  const camber = 0.022 * (1 - u * u);
  const tilt = 0.018 * (z / HSR_CANOPY.radiusZ);
  return 0.63 + camber + tilt;
}

export function hsrCanopyUnderside(x: number, z: number): number {
  return hsrCanopyHeight(x, z) - HSR_CANOPY.thickness;
}

/* ------------------------------------------------------------------ */
/* World Games Stadium: spiral ribbon roof with a structural truss      */
/* ------------------------------------------------------------------ */

export const STADIUM_ROOF_START = -Math.PI * 0.34;
export const STADIUM_ROOF_SWEEP = Math.PI * 1.52;
export const STADIUM_SEGMENTS = 72;
export const STADIUM_SQUASH_Z = 0.72;

export function stadiumRoofProgress(angle: number): number {
  return clamp01((angle - STADIUM_ROOF_START) / STADIUM_ROOF_SWEEP);
}

export function stadiumRoofInnerRadius(angle: number): number {
  return 0.52 + 0.03 * Math.sin(angle * 2.1 + 0.4);
}

export function stadiumRoofOuterRadius(angle: number): number {
  return 1.06 - 0.05 * Math.sin(angle * 1.7 + 0.5);
}

export function stadiumRoofInnerLift(angle: number): number {
  return 0.58 + 0.24 * stadiumRoofProgress(angle) ** 1.35;
}

export function stadiumRoofOuterLift(angle: number): number {
  return stadiumRoofInnerLift(angle) - 0.09;
}

export interface RibbonRoofOptions {
  startAngle: number;
  sweep: number;
  segments: number;
  thickness: number;
  innerRadius: (angle: number) => number;
  outerRadius: (angle: number) => number;
  innerLift: (angle: number) => number;
  outerLift: (angle: number) => number;
  squashZ?: number;
}

/**
 * Closed cross-section ribbon swept along an arc. The four rings (inner top,
 * outer top, outer underside, inner underside) form a watertight band with a
 * real fascia, and both open ends are capped.
 */
export function makeRibbonRoofGeometry({
  startAngle,
  sweep,
  segments,
  thickness,
  innerRadius,
  outerRadius,
  innerLift,
  outerLift,
  squashZ = 1,
}: RibbonRoofOptions): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const ringCount = 4;

  for (let segment = 0; segment <= segments; segment += 1) {
    const angle = startAngle + (segment / segments) * sweep;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const inner = innerRadius(angle);
    const outer = outerRadius(angle);
    const liftIn = innerLift(angle);
    const liftOut = outerLift(angle);
    positions.push(
      cos * inner,
      liftIn,
      sin * inner * squashZ,
      cos * outer,
      liftOut,
      sin * outer * squashZ,
      cos * outer,
      liftOut - thickness,
      sin * outer * squashZ,
      cos * inner,
      liftIn - thickness,
      sin * inner * squashZ,
    );
  }

  for (let segment = 0; segment < segments; segment += 1) {
    const current = segment * ringCount;
    const next = (segment + 1) * ringCount;
    for (let ring = 0; ring < ringCount; ring += 1) {
      const a = current + ring;
      const b = current + ((ring + 1) % ringCount);
      const c = next + ring;
      const d = next + ((ring + 1) % ringCount);
      indices.push(a, c, b, b, c, d);
    }
  }

  // End caps.
  for (const segment of [0, segments]) {
    const base = segment * ringCount;
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Exact ribbon point, used to land truss columns on the canopy. */
export function stadiumRibbonPoint(
  angle: number,
  radiusAt: (angle: number) => number,
  liftAt: (angle: number) => number,
): Vec3 {
  const radius = radiusAt(angle);
  return [
    Math.cos(angle) * radius,
    liftAt(angle),
    Math.sin(angle) * radius * STADIUM_SQUASH_Z,
  ];
}

/** Stepped seating bowl: lathe profile with three terraces. */
export function makeStadiumBowlGeometry(): THREE.BufferGeometry {
  const profile = [
    new THREE.Vector2(0.42, 0.06),
    new THREE.Vector2(0.46, 0.1),
    new THREE.Vector2(0.55, 0.1),
    new THREE.Vector2(0.58, 0.16),
    new THREE.Vector2(0.67, 0.16),
    new THREE.Vector2(0.7, 0.22),
    new THREE.Vector2(0.8, 0.22),
    new THREE.Vector2(0.83, 0.3),
    new THREE.Vector2(0.94, 0.3),
    new THREE.Vector2(0.97, 0.38),
    new THREE.Vector2(0.99, 0.4),
  ];
  const geometry = new THREE.LatheGeometry(profile, 72);
  geometry.scale(1, 1, STADIUM_SQUASH_Z);
  geometry.computeVertexNormals();
  return geometry;
}

/* ------------------------------------------------------------------ */
/* Pagoda tier roofs: hipped tiles with upturned eaves                 */
/* ------------------------------------------------------------------ */

export interface PagodaTierRoofOptions {
  halfWidth: number;
  halfDepth?: number;
  rise: number;
  upturn: number;
  thickness: number;
  segments?: number;
  rings?: number;
}

/**
 * Square hipped roof with concave slopes and lifted corners. The eave ring is
 * the lowest point at mid-edge and the highest at the corners, which is what
 * makes a pagoda read as a pagoda.
 */
export function makePagodaTierRoofGeometry({
  halfWidth,
  halfDepth = halfWidth,
  rise,
  upturn,
  thickness,
  segments = 32,
  rings = 5,
}: PagodaTierRoofOptions): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];

  const ringPoint = (ring: number, segment: number): Vec3 => {
    const angle = (segment / segments) * Math.PI * 2;
    const t = ring / rings;
    const shrink = 0.12 + 0.88 * t;
    const flare = 1 + 0.06 * t * t;
    const half = halfWidth * shrink * flare;
    const halfZ = halfDepth * shrink * flare;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const max = Math.max(Math.abs(cos), Math.abs(sin));
    const corner = (Math.min(Math.abs(cos), Math.abs(sin)) / Math.SQRT1_2) ** 4;
    const y = rise * (1 - t) ** 1.55 + upturn * corner * t;
    return [(cos / max) * half, y, (sin / max) * halfZ];
  };

  const topStart = positions.length / 3;
  for (let ring = 0; ring <= rings; ring += 1) {
    for (let segment = 0; segment < segments; segment += 1) {
      positions.push(...ringPoint(ring, segment));
    }
  }
  for (let ring = 0; ring < rings; ring += 1) {
    const inner = topStart + ring * segments;
    const outer = topStart + (ring + 1) * segments;
    for (let segment = 0; segment < segments; segment += 1) {
      const next = (segment + 1) % segments;
      indices.push(inner + segment, outer + segment, outer + next);
      indices.push(inner + segment, outer + next, inner + next);
    }
  }

  const bottomStart = positions.length / 3;
  for (let ring = 0; ring <= rings; ring += 1) {
    for (let segment = 0; segment < segments; segment += 1) {
      const [x, y, z] = ringPoint(ring, segment);
      positions.push(x, y - thickness, z);
    }
  }
  for (let ring = 0; ring < rings; ring += 1) {
    const inner = bottomStart + ring * segments;
    const outer = bottomStart + (ring + 1) * segments;
    for (let segment = 0; segment < segments; segment += 1) {
      const next = (segment + 1) % segments;
      indices.push(inner + segment, outer + next, outer + segment);
      indices.push(inner + segment, inner + next, outer + next);
    }
  }

  // Eave fascia.
  for (let segment = 0; segment < segments; segment += 1) {
    const next = (segment + 1) % segments;
    const [ax, ay, az] = ringPoint(rings, segment);
    const [bx, by, bz] = ringPoint(rings, next);
    const base = positions.length / 3;
    positions.push(
      ax,
      ay,
      az,
      bx,
      by,
      bz,
      bx,
      by - thickness,
      bz,
      ax,
      ay - thickness,
      az,
    );
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  // Top and underside caps (hidden by the finial and the tier body).
  const topCap = positions.length / 3;
  const topRing = ringPoint(0, 0);
  positions.push(
    -topRing[0],
    rise,
    -topRing[2],
    topRing[0],
    rise,
    -topRing[2],
    topRing[0],
    rise,
    topRing[2],
    -topRing[0],
    rise,
    topRing[2],
  );
  indices.push(topCap, topCap + 2, topCap + 1, topCap, topCap + 3, topCap + 2);
  const bottomCap = positions.length / 3;
  positions.push(
    -topRing[0],
    rise - thickness,
    -topRing[2],
    topRing[0],
    rise - thickness,
    -topRing[2],
    topRing[0],
    rise - thickness,
    topRing[2],
    -topRing[0],
    rise - thickness,
    topRing[2],
  );
  indices.push(
    bottomCap,
    bottomCap + 1,
    bottomCap + 2,
    bottomCap,
    bottomCap + 2,
    bottomCap + 3,
  );

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/* ------------------------------------------------------------------ */
/* Sky Tower 85: flared crown with a V notch                           */
/* ------------------------------------------------------------------ */

export interface FlaredCrownOptions {
  baseRadius: number;
  topRadius: number;
  height: number;
  notch: number;
  sides?: number;
  rings?: number;
}

export function makeFlaredCrownGeometry({
  baseRadius,
  topRadius,
  height,
  notch,
  sides = 32,
  rings = 4,
}: FlaredCrownOptions): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];

  const point = (ring: number, side: number): Vec3 => {
    const angle = (side / sides) * Math.PI * 2;
    const t = ring / rings;
    const radius = baseRadius + (topRadius - baseRadius) * t ** 0.85;
    const y =
      height * t -
      notch * smoothstep(0.55, 1, t) * Math.abs(Math.sin(angle)) ** 6;
    return [Math.cos(angle) * radius, y, Math.sin(angle) * radius];
  };

  for (let ring = 0; ring <= rings; ring += 1) {
    for (let side = 0; side < sides; side += 1) {
      positions.push(...point(ring, side));
    }
  }
  for (let ring = 0; ring < rings; ring += 1) {
    const inner = ring * sides;
    const outer = (ring + 1) * sides;
    for (let side = 0; side < sides; side += 1) {
      const next = (side + 1) % sides;
      indices.push(inner + side, outer + side, outer + next);
      indices.push(inner + side, outer + next, inner + next);
    }
  }

  // Top funnel closing the crown, with the notch carried through.
  const peak = positions.length / 3;
  positions.push(0, height, 0);
  const topRing = rings * sides;
  for (let side = 0; side < sides; side += 1) {
    const next = (side + 1) % sides;
    indices.push(peak, topRing + next, topRing + side);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/* ------------------------------------------------------------------ */
/* Small shared parts                                                  */
/* ------------------------------------------------------------------ */

/** Low warehouse gable roof: 1 x 1 footprint, 1 unit high, centred at origin. */
export function makeGableRoofGeometry(): THREE.BufferGeometry {
  const h = 1;
  const positions = [
    -0.5,
    0,
    -0.5,
    0.5,
    0,
    -0.5,
    0.5,
    h,
    0,
    -0.5,
    h,
    0,
    -0.5,
    0,
    0.5,
    0.5,
    0,
    0.5,
    0.5,
    h,
    0,
    -0.5,
    h,
    0,
  ];
  const index = [
    0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 3, 7, 0, 7, 4, 1, 5, 6, 1, 6, 2,
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

/** Curved curtain wall with a sweeping top edge (Dream Mall facade). */
export function makeCurvedFacadeGeometry({
  radius,
  heightAt,
  thetaStart,
  thetaLength,
  segments = 48,
  squashZ = 1,
}: {
  radius: number;
  heightAt: (angle: number) => number;
  thetaStart: number;
  thetaLength: number;
  segments?: number;
  squashZ?: number;
}): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let segment = 0; segment <= segments; segment += 1) {
    const angle = thetaStart + (segment / segments) * thetaLength;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius * squashZ;
    positions.push(x, 0, z, x, heightAt(angle), z);
  }
  for (let segment = 0; segment < segments; segment += 1) {
    const a = segment * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Points along the top edge of a curved facade, for a fascia tube. */
export function makeCurvedFacadeTopCurve({
  radius,
  heightAt,
  thetaStart,
  thetaLength,
  segments = 48,
  squashZ = 1,
}: {
  radius: number;
  heightAt: (angle: number) => number;
  thetaStart: number;
  thetaLength: number;
  segments?: number;
  squashZ?: number;
}): THREE.CatmullRomCurve3 {
  const points: THREE.Vector3[] = [];
  for (let segment = 0; segment <= segments; segment += 1) {
    const angle = thetaStart + (segment / segments) * thetaLength;
    points.push(
      new THREE.Vector3(
        Math.cos(angle) * radius,
        heightAt(angle),
        Math.sin(angle) * radius * squashZ,
      ),
    );
  }
  return new THREE.CatmullRomCurve3(points, false, 'centripetal');
}

/* ------------------------------------------------------------------ */
/* Ferris wheel kinematics (pure math, unit-tested)                    */
/* ------------------------------------------------------------------ */

export interface WheelCabinPose {
  x: number;
  y: number;
  /** Rotation about the wheel axle that keeps the cabin upright. */
  counterRotation: number;
}

/**
 * Cabin positions are derived from the wheel radius and angular spacing, so a
 * cabin can never drift off the rim or bunch up. wheelAngle is the current
 * rotation of the wheel about its axle; the counter rotation cancels it and
 * keeps every cabin hanging vertically.
 */
export function wheelCabinPose(
  index: number,
  count: number,
  radius: number,
  wheelAngle: number,
): WheelCabinPose {
  const base = (index / count) * Math.PI * 2;
  return {
    x: Math.cos(base) * radius,
    y: Math.sin(base) * radius,
    counterRotation: -wheelAngle,
  };
}
