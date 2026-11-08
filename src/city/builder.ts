import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MATERIALS, type MaterialKey } from './materials';

export type DetailLevel = 'high' | 'medium' | 'low';

/**
 * Accumulates many small geometries into a handful of material buckets, then
 * merges each bucket into one BufferGeometry. The city therefore renders with
 * one mesh per material instead of thousands of individual meshes.
 */
export class CityBuilder {
  private readonly buckets = new Map<MaterialKey, THREE.BufferGeometry[]>();

  add(geometry: THREE.BufferGeometry, key: MaterialKey) {
    const bucket = this.buckets.get(key);
    if (bucket) bucket.push(geometry);
    else this.buckets.set(key, [geometry]);
    return this;
  }

  box(
    width: number,
    height: number,
    depth: number,
    x: number,
    y: number,
    z: number,
    key: MaterialKey,
    rotY = 0,
    rotX = 0,
    rotZ = 0,
  ) {
    const geometry = new THREE.BoxGeometry(width, height, depth);
    if (rotX) geometry.rotateX(rotX);
    if (rotZ) geometry.rotateZ(rotZ);
    if (rotY) geometry.rotateY(rotY);
    geometry.translate(x, y, z);
    return this.add(geometry, key);
  }

  roundedBox(
    width: number,
    height: number,
    depth: number,
    radius: number,
    x: number,
    y: number,
    z: number,
    key: MaterialKey,
    rotY = 0,
  ) {
    const geometry = new THREE.BoxGeometry(width, height, depth, 2, 2, 2);
    const position = geometry.getAttribute('position') as THREE.BufferAttribute;
    // Soften edges by pulling corner vertices toward a rounded shell.
    const hw = width / 2;
    const hh = height / 2;
    const hd = depth / 2;
    for (let i = 0; i < position.count; i += 1) {
      const px = position.getX(i);
      const py = position.getY(i);
      const pz = position.getZ(i);
      const sx = Math.sign(px) || 1;
      const sy = Math.sign(py) || 1;
      const sz = Math.sign(pz) || 1;
      const ox = Math.max(Math.abs(px) - (hw - radius), 0) * sx;
      const oy = Math.max(Math.abs(py) - (hh - radius), 0) * sy;
      const oz = Math.max(Math.abs(pz) - (hd - radius), 0) * sz;
      const length = Math.hypot(ox, oy, oz) || 1;
      position.setXYZ(
        i,
        px - (ox / length) * radius * 0.55,
        py - (oy / length) * radius * 0.55,
        pz - (oz / length) * radius * 0.55,
      );
    }
    geometry.computeVertexNormals();
    if (rotY) geometry.rotateY(rotY);
    geometry.translate(x, y, z);
    return this.add(geometry, key);
  }

  cylinder(
    radiusTop: number,
    radiusBottom: number,
    height: number,
    segments: number,
    x: number,
    y: number,
    z: number,
    key: MaterialKey,
    rotY = 0,
    openEnded = false,
  ) {
    const geometry = new THREE.CylinderGeometry(
      radiusTop,
      radiusBottom,
      height,
      segments,
      1,
      openEnded,
    );
    if (rotY) geometry.rotateY(rotY);
    geometry.translate(x, y, z);
    return this.add(geometry, key);
  }

  cone(
    radius: number,
    height: number,
    segments: number,
    x: number,
    y: number,
    z: number,
    key: MaterialKey,
    rotY = 0,
  ) {
    const geometry = new THREE.ConeGeometry(radius, height, segments);
    if (rotY) geometry.rotateY(rotY);
    geometry.translate(x, y, z);
    return this.add(geometry, key);
  }

  sphere(
    radius: number,
    x: number,
    y: number,
    z: number,
    key: MaterialKey,
    widthSegments = 8,
    heightSegments = 6,
    scale: [number, number, number] = [1, 1, 1],
  ) {
    const geometry = new THREE.SphereGeometry(
      radius,
      widthSegments,
      heightSegments,
    );
    geometry.scale(...scale);
    geometry.translate(x, y, z);
    return this.add(geometry, key);
  }

  /** Gable roof, ridge running along local X. */
  gableRoof(
    width: number,
    depth: number,
    height: number,
    x: number,
    y: number,
    z: number,
    key: MaterialKey,
    rotY = 0,
    overhang = 0.12,
  ) {
    const hw = width / 2 + overhang;
    const hd = depth / 2 + overhang;
    const ridge = hw * 0.98;
    const vertices = new Float32Array([
      // south slope
      -hw,
      0,
      hd,
      hw,
      0,
      hd,
      ridge,
      height,
      0,
      -hw,
      0,
      hd,
      ridge,
      height,
      0,
      -ridge,
      height,
      0,
      // north slope
      hw,
      0,
      -hd,
      -hw,
      0,
      -hd,
      -ridge,
      height,
      0,
      hw,
      0,
      -hd,
      -ridge,
      height,
      0,
      ridge,
      height,
      0,
      // east gable
      hw,
      0,
      hd,
      hw,
      0,
      -hd,
      ridge,
      height,
      0,
      // west gable
      -hw,
      0,
      -hd,
      -hw,
      0,
      hd,
      -ridge,
      height,
      0,
    ]);
    const uvs = new Float32Array([
      0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0,
      0, 1, 0, 0.5, 1, 0, 0, 1, 0, 0.5, 1,
    ]);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.computeVertexNormals();
    if (rotY) geometry.rotateY(rotY);
    geometry.translate(x, y, z);
    return this.add(geometry, key);
  }

  /** Hip roof, ridge running along local X. */
  hipRoof(
    width: number,
    depth: number,
    height: number,
    x: number,
    y: number,
    z: number,
    key: MaterialKey,
    rotY = 0,
    overhang = 0.14,
    ridgeRatio = 0.45,
  ) {
    const hw = width / 2 + overhang;
    const hd = depth / 2 + overhang;
    const ridge = hw * ridgeRatio;
    const vertices = new Float32Array([
      // south
      -hw,
      0,
      hd,
      hw,
      0,
      hd,
      ridge,
      height,
      0,
      -hw,
      0,
      hd,
      ridge,
      height,
      0,
      -ridge,
      height,
      0,
      // north
      hw,
      0,
      -hd,
      -hw,
      0,
      -hd,
      -ridge,
      height,
      0,
      hw,
      0,
      -hd,
      -ridge,
      height,
      0,
      ridge,
      height,
      0,
      // east
      hw,
      0,
      hd,
      hw,
      0,
      -hd,
      ridge,
      height,
      0,
      // west
      -hw,
      0,
      -hd,
      -hw,
      0,
      hd,
      -ridge,
      height,
      0,
    ]);
    const uvs = new Float32Array(24);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.computeVertexNormals();
    if (rotY) geometry.rotateY(rotY);
    geometry.translate(x, y, z);
    return this.add(geometry, key);
  }

  /** Flared octagonal eave used by pagodas and temple pavilions. */
  eave(
    radius: number,
    height: number,
    x: number,
    y: number,
    z: number,
    key: MaterialKey,
    rotY = 0,
    lift = 0.13,
  ) {
    const geometry = new THREE.CylinderGeometry(
      radius * 0.78,
      radius,
      height,
      8,
      1,
      true,
    );
    if (rotY) geometry.rotateY(rotY);
    geometry.translate(x, y, z);
    this.add(geometry, key);
    // Upturned corners read as traditional eaves even at miniature scale.
    for (let i = 0; i < 8; i += 1) {
      const angle = (i / 8) * Math.PI * 2 + Math.PI / 8 + rotY;
      const cx = x + Math.cos(angle) * radius * 0.97;
      const cz = z + Math.sin(angle) * radius * 0.97;
      const corner = new THREE.BoxGeometry(0.16, 0.05, 0.05);
      corner.rotateZ(-0.45);
      corner.rotateY(-angle);
      corner.translate(cx, y + lift, cz);
      this.add(corner, key);
    }
    return this;
  }

  /** Add a planar polygon (x,z points) at a given height. */
  slab(
    points: Array<[number, number]>,
    y: number,
    key: MaterialKey,
    thickness = 0.08,
    uvScale = 0.25,
  ) {
    const shape = new THREE.Shape();
    points.forEach(([px, pz], index) => {
      if (index === 0) {
        shape.moveTo(px, pz);
      } else {
        shape.lineTo(px, pz);
      }
    });
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: thickness,
      bevelEnabled: false,
      curveSegments: 1,
    });
    geometry.rotateX(Math.PI / 2);
    geometry.translate(0, y + thickness, 0);
    const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i += 1) {
      uv.setXY(i, uv.getX(i) * uvScale, uv.getY(i) * uvScale);
    }
    return this.add(geometry, key);
  }

  /** Copy another builder's parts under an optional uniform scale/translation. */
  addBuilder(
    other: CityBuilder,
    transform: { scale?: number; x?: number; y?: number; z?: number } = {},
  ) {
    const { scale = 1, x = 0, y = 0, z = 0 } = transform;
    for (const [key, geometries] of other.buckets) {
      for (const geometry of geometries) {
        const clone = geometry.clone();
        if (scale !== 1) clone.scale(scale, scale, scale);
        if (x !== 0 || y !== 0 || z !== 0) clone.translate(x, y, z);
        this.add(clone, key);
      }
    }
    return this;
  }

  merge() {
    const parts: Array<{ key: MaterialKey; geometry: THREE.BufferGeometry }> =
      [];
    for (const [key, geometries] of this.buckets) {
      // mergeGeometries requires every input to expose the same attribute set
      // and to either all have an index or none have one. Procedural pieces mix
      // indexed primitives with non-indexed custom roofs, so normalise first.
      for (const geometry of geometries) {
        const position = geometry.getAttribute('position');
        if (!position) continue;
        if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
        if (!geometry.getAttribute('uv')) {
          geometry.setAttribute(
            'uv',
            new THREE.BufferAttribute(new Float32Array(position.count * 2), 2),
          );
        }
        for (const name of Object.keys(geometry.attributes)) {
          if (name !== 'position' && name !== 'normal' && name !== 'uv') {
            geometry.deleteAttribute(name);
          }
        }
        if (!geometry.index) {
          const index =
            position.count > 65_535
              ? new Uint32Array(position.count)
              : new Uint16Array(position.count);
          for (let i = 0; i < index.length; i += 1) index[i] = i;
          geometry.setIndex(new THREE.BufferAttribute(index, 1));
        }
      }
      const merged = mergeGeometries(geometries, false);
      if (!merged) {
        console.warn(`[city] failed to merge material bucket ${key}`);
        continue;
      }
      merged.computeBoundingSphere();
      parts.push({ key, geometry: merged });
      geometries.forEach((geometry) => {
        geometry.dispose();
      });
    }
    this.buckets.clear();
    return parts;
  }
}

/** Local coordinate frame: write architecture in comfortable local space. */
export class Frame {
  private readonly cos: number;
  private readonly sin: number;

  constructor(
    private readonly builder: CityBuilder,
    readonly x: number,
    readonly z: number,
    readonly rotY: number,
  ) {
    this.cos = Math.cos(rotY);
    this.sin = Math.sin(rotY);
  }

  private world(localX: number, localZ: number): [number, number] {
    return [
      this.x + localX * this.cos + localZ * this.sin,
      this.z - localX * this.sin + localZ * this.cos,
    ];
  }

  box(
    width: number,
    height: number,
    depth: number,
    localX: number,
    y: number,
    localZ: number,
    key: MaterialKey,
    localRotY = 0,
    localRotX = 0,
    localRotZ = 0,
  ) {
    const [x, z] = this.world(localX, localZ);
    this.builder.box(
      width,
      height,
      depth,
      x,
      y,
      z,
      key,
      this.rotY + localRotY,
      localRotX,
      localRotZ,
    );
    return this;
  }

  cylinder(
    radiusTop: number,
    radiusBottom: number,
    height: number,
    segments: number,
    localX: number,
    y: number,
    localZ: number,
    key: MaterialKey,
    localRotY = 0,
  ) {
    const [x, z] = this.world(localX, localZ);
    this.builder.cylinder(
      radiusTop,
      radiusBottom,
      height,
      segments,
      x,
      y,
      z,
      key,
      this.rotY + localRotY,
    );
    return this;
  }

  cone(
    radius: number,
    height: number,
    segments: number,
    localX: number,
    y: number,
    localZ: number,
    key: MaterialKey,
    localRotY = 0,
  ) {
    const [x, z] = this.world(localX, localZ);
    this.builder.cone(
      radius,
      height,
      segments,
      x,
      y,
      z,
      key,
      this.rotY + localRotY,
    );
    return this;
  }

  sphere(
    radius: number,
    localX: number,
    y: number,
    localZ: number,
    key: MaterialKey,
    scale: [number, number, number] = [1, 1, 1],
    segments = 8,
  ) {
    const [x, z] = this.world(localX, localZ);
    this.builder.sphere(radius, x, y, z, key, segments, 6, scale);
    return this;
  }

  roundedBox(
    width: number,
    height: number,
    depth: number,
    radius: number,
    localX: number,
    y: number,
    localZ: number,
    key: MaterialKey,
    localRotY = 0,
  ) {
    const [x, z] = this.world(localX, localZ);
    this.builder.roundedBox(
      width,
      height,
      depth,
      radius,
      x,
      y,
      z,
      key,
      this.rotY + localRotY,
    );
    return this;
  }

  gableRoof(
    width: number,
    depth: number,
    height: number,
    localX: number,
    y: number,
    localZ: number,
    key: MaterialKey,
    overhang = 0.12,
  ) {
    const [x, z] = this.world(localX, localZ);
    this.builder.gableRoof(
      width,
      depth,
      height,
      x,
      y,
      z,
      key,
      this.rotY,
      overhang,
    );
    return this;
  }

  hipRoof(
    width: number,
    depth: number,
    height: number,
    localX: number,
    y: number,
    localZ: number,
    key: MaterialKey,
    overhang = 0.14,
  ) {
    const [x, z] = this.world(localX, localZ);
    this.builder.hipRoof(
      width,
      depth,
      height,
      x,
      y,
      z,
      key,
      this.rotY,
      overhang,
    );
    return this;
  }

  eave(
    radius: number,
    height: number,
    localX: number,
    y: number,
    localZ: number,
    key: MaterialKey,
    lift = 0.13,
  ) {
    const [x, z] = this.world(localX, localZ);
    this.builder.eave(radius, height, x, y, z, key, this.rotY, lift);
    return this;
  }
}

export function frame(builder: CityBuilder, x: number, z: number, rotY = 0) {
  return new Frame(builder, x, z, rotY);
}

/** Deterministic pseudo-random utility so the city is stable across builds. */
export function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

export function pick<T>(random: () => number, items: readonly T[]): T {
  return items[Math.floor(random() * items.length) % items.length] as T;
}

export function materialFor(key: MaterialKey) {
  return MATERIALS[key];
}
