import * as THREE from 'three';

/**
 * Authored (code-generated) hero-landmark geometry. These shapes are the
 * version-controlled source for the seven Kaohsiung landmark models: no
 * external 3D authoring package is required to reproduce the miniature set.
 */

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

/** Broad, undulating Weiwuying roof. Unit radius in x and 0.78 in z. */
export function makeFlowingRoofGeometry(): THREE.BufferGeometry {
  const segments = 64;
  const rings = 10;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let ring = 0; ring <= rings; ring += 1) {
    const radius = (ring / rings) * 0.99;
    for (let segment = 0; segment < segments; segment += 1) {
      const angle = (segment / segments) * Math.PI * 2;
      const wave =
        0.1 * Math.sin(angle * 3 + radius * 2.4) * radius * radius +
        0.03 * Math.cos(angle * 5 + 0.6) * radius;
      const lift = 0.26 + radius * radius * 0.2 + wave;
      positions.push(
        Math.cos(angle) * radius,
        lift,
        Math.sin(angle) * radius * 0.78,
      );
    }
  }
  for (let ring = 0; ring < rings; ring += 1) {
    for (let segment = 0; segment < segments; segment += 1) {
      const next = (segment + 1) % segments;
      const a = ring * segments + segment;
      const b = ring * segments + next;
      const c = (ring + 1) * segments + segment;
      const d = (ring + 1) * segments + next;
      indices.push(a, c, b, b, c, d);
    }
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

/** Rim curve matching the flowing roof edge, for a metal fascia. */
export function makeFlowingRoofRimCurve(): THREE.CatmullRomCurve3 {
  const points: THREE.Vector3[] = [];
  for (let index = 0; index < 64; index += 1) {
    const angle = (index / 64) * Math.PI * 2;
    points.push(
      new THREE.Vector3(
        Math.cos(angle),
        0.46 +
          0.1 * Math.sin(angle * 3 + 2.4) +
          0.03 * Math.cos(angle * 5 + 0.6),
        Math.sin(angle) * 0.78,
      ),
    );
  }
  return new THREE.CatmullRomCurve3(points, true, 'centripetal');
}

/** Open stadium bowl profile, revolved around y and flattened in z. */
export function makeStadiumBowlGeometry(): THREE.BufferGeometry {
  const profile = [
    new THREE.Vector2(0.52, 0.07),
    new THREE.Vector2(0.6, 0.1),
    new THREE.Vector2(0.64, 0.2),
    new THREE.Vector2(0.73, 0.31),
    new THREE.Vector2(0.88, 0.4),
    new THREE.Vector2(0.99, 0.48),
    new THREE.Vector2(1.02, 0.52),
  ];
  const geometry = new THREE.LatheGeometry(profile, 64);
  geometry.scale(1, 1, 0.72);
  geometry.computeVertexNormals();
  return geometry;
}

/** Asymmetric sweeping stadium canopy, open on the south-west side. */
export const STADIUM_ROOF_START = -Math.PI * 0.32;
export const STADIUM_ROOF_SWEEP = Math.PI * 1.5;
const STADIUM_SEGMENTS = 60;

function stadiumRoofAngles(): number[] {
  return Array.from(
    { length: STADIUM_SEGMENTS + 1 },
    (_, index) =>
      STADIUM_ROOF_START + (index / STADIUM_SEGMENTS) * STADIUM_ROOF_SWEEP,
  );
}

function stadiumInnerRadius(angle: number): number {
  return 0.46 + 0.035 * Math.sin(angle * 2.1);
}

function stadiumOuterRadius(angle: number): number {
  return 1.07 - 0.06 * Math.sin(angle * 1.7 + 0.5);
}

function stadiumInnerLift(angle: number): number {
  return 0.44 + 0.07 * Math.sin(angle * 1.4);
}

function stadiumOuterLift(angle: number): number {
  return 0.57 + 0.13 * (0.5 + 0.5 * Math.sin(angle - 0.6));
}

export function makeStadiumRoofGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const angle of stadiumRoofAngles()) {
    const radiusIn = stadiumInnerRadius(angle);
    const radiusOut = stadiumOuterRadius(angle);
    positions.push(
      Math.cos(angle) * radiusIn,
      stadiumInnerLift(angle),
      Math.sin(angle) * radiusIn * 0.72,
      Math.cos(angle) * radiusOut,
      stadiumOuterLift(angle),
      Math.sin(angle) * radiusOut * 0.72,
    );
  }
  for (let index = 0; index < STADIUM_SEGMENTS; index += 1) {
    const a = index * 2;
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
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

function stadiumRimCurve(
  radiusAt: (angle: number) => number,
  liftAt: (angle: number) => number,
): THREE.CatmullRomCurve3 {
  return new THREE.CatmullRomCurve3(
    stadiumRoofAngles().map((angle) => {
      const radius = radiusAt(angle);
      return new THREE.Vector3(
        Math.cos(angle) * radius,
        liftAt(angle),
        Math.sin(angle) * radius * 0.72,
      );
    }),
    false,
    'centripetal',
  );
}

/** Outer fascia curve for the stadium canopy. */
export function makeStadiumRoofRimCurve(): THREE.CatmullRomCurve3 {
  return stadiumRimCurve(stadiumOuterRadius, stadiumOuterLift);
}

/** Inner fascia curve for the stadium canopy. */
export function makeStadiumRoofInnerRimCurve(): THREE.CatmullRomCurve3 {
  return stadiumRimCurve(stadiumInnerRadius, stadiumInnerLift);
}

/**
 * Flared square pagoda roof: 1 x 1 footprint, 1 unit high. The corners lift
 * slightly so the silhouette reads as a traditional upturned eave.
 */
export function makePagodaRoofGeometry(): THREE.BufferGeometry {
  const rings = 7;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let ring = 0; ring <= rings; ring += 1) {
    const t = ring / rings;
    const half = 0.72 * (1 - t) + 0.09;
    const lift = t ** 0.72 * 0.78;
    for (let corner = 0; corner < 4; corner += 1) {
      const angle = (corner / 4) * Math.PI * 2;
      const cornerX = Math.cos(angle) * half;
      const cornerZ = Math.sin(angle) * half;
      const upturn = (1 - t) * (1 - t) * 0.12;
      positions.push(cornerX, lift + upturn, cornerZ);
    }
  }
  for (let ring = 0; ring < rings; ring += 1) {
    for (let corner = 0; corner < 4; corner += 1) {
      const next = (corner + 1) % 4;
      const a = ring * 4 + corner;
      const b = ring * 4 + next;
      const c = (ring + 1) * 4 + corner;
      const d = (ring + 1) * 4 + next;
      indices.push(a, c, b, b, c, d);
    }
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

/** Barrel-vault station roof: length 1 along x, radius 1 in y/z. */
export function makeArchRoofGeometry(): THREE.BufferGeometry {
  const segments = 24;
  const length = 1;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let index = 0; index <= segments; index += 1) {
    const angle = (index / segments) * Math.PI;
    const y = Math.sin(angle);
    const z = Math.cos(angle);
    positions.push(-length / 2, y, z, length / 2, y, z);
  }
  for (let index = 0; index < segments; index += 1) {
    const a = index * 2;
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
