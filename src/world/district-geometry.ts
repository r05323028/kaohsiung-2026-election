import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  pointInWorldDistrict,
  type WorldDistrict,
  type WorldFocus,
} from './geography';
import { lonLatToWorld, type WorldPoint } from './projection';

/** A single triangulated footprint for a district's authoritative rings.
 * Rings are kept as separate shapes, so MultiPolygon components stay
 * disconnected instead of being joined by an invented bridge. */
export type DistrictGeometryStats = {
  id: string;
  ringCount: number;
  triangleCount: number;
  vertexCount: number;
  areaKm2: number;
  bboxAreaKm2: number;
  fillRatio: number;
  valid: boolean;
};

const geometryCache = new Map<string, THREE.BufferGeometry>();

export function ringAreaKm2(ring: WorldPoint[]): number {
  let twice = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const a = ring[index];
    const b = ring[(index + 1) % ring.length];
    if (!a || !b) continue;
    twice += a.x * b.z - b.x * a.z;
  }
  return Math.abs(twice) / 2;
}

export function geometryAreaKm2(geometry: THREE.BufferGeometry): number {
  const position = geometry.getAttribute('position');
  if (!position) return 0;
  const indices = geometry.index;
  const triangleCount = (indices?.count ?? position.count) / 3;
  let area = 0;
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const offset = triangle * 3;
    const ai = indices ? indices.getX(offset) : offset;
    const bi = indices ? indices.getX(offset + 1) : offset + 1;
    const ci = indices ? indices.getX(offset + 2) : offset + 2;
    const ax = position.getX(ai);
    const az = position.getZ(ai);
    const bx = position.getX(bi);
    const bz = position.getZ(bi);
    const cx = position.getX(ci);
    const cz = position.getZ(ci);
    area += Math.abs((bx - ax) * (cz - az) - (cx - ax) * (bz - az)) / 2;
  }
  return area;
}

function shapeGeometry(
  outer: WorldPoint[],
  holes: WorldPoint[][] = [],
): THREE.BufferGeometry | null {
  if (outer.length < 3) return null;
  const shape = new THREE.Shape();
  const first = outer[0];
  if (!first) return null;
  shape.moveTo(first.x, first.z);
  for (let index = 1; index < outer.length; index += 1) {
    const point = outer[index];
    if (point) shape.lineTo(point.x, point.z);
  }
  shape.closePath();
  for (const hole of holes) {
    const path = new THREE.Path();
    const start = hole[0];
    if (!start) continue;
    path.moveTo(start.x, start.z);
    for (let index = 1; index < hole.length; index += 1) {
      const point = hole[index];
      if (point) path.lineTo(point.x, point.z);
    }
    path.closePath();
    shape.holes.push(path);
  }
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(Math.PI / 2);
  return geometry;
}

/** Merge all rings into one mesh. The cache keeps citywide district mesh
 * construction to one pass, while still preserving every ring separately. */
export function districtShapeGeometry(
  district: WorldDistrict,
): THREE.BufferGeometry | null {
  const cached = geometryCache.get(district.id);
  if (cached) return cached;
  const parts: THREE.BufferGeometry[] = [];
  for (const ring of district.worldPolygons) {
    const geometry = shapeGeometry(ring);
    if (geometry) parts.push(geometry);
  }
  if (parts.length === 0) return null;
  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (merged) geometryCache.set(district.id, merged);
  return merged;
}

/** Exposed for geometry tests and future hole-aware district data. */
export function triangulateRings(
  outer: WorldPoint[],
  holes: WorldPoint[][] = [],
): THREE.BufferGeometry | null {
  return shapeGeometry(outer, holes);
}

export function districtGeometryStats(
  district: WorldDistrict,
): DistrictGeometryStats {
  const geometry = districtShapeGeometry(district);
  if (!geometry) {
    return {
      id: district.id,
      ringCount: district.worldPolygons.length,
      triangleCount: 0,
      vertexCount: 0,
      areaKm2: 0,
      bboxAreaKm2: 0,
      fillRatio: 0,
      valid: false,
    };
  }
  const position = geometry.getAttribute('position');
  const areaKm2 = geometryAreaKm2(geometry);
  const bbox = district.worldBbox;
  const bboxAreaKm2 =
    Math.abs(bbox.maxX - bbox.minX) * Math.abs(bbox.maxZ - bbox.minZ);
  return {
    id: district.id,
    ringCount: district.worldPolygons.length,
    triangleCount: Math.round((geometry.index?.count ?? position.count) / 3),
    vertexCount: position.count,
    areaKm2,
    bboxAreaKm2,
    fillRatio: bboxAreaKm2 > 0 ? areaKm2 / bboxAreaKm2 : 0,
    valid:
      district.worldPolygons.length > 0 &&
      district.worldPolygons.every((ring) => {
        const first = ring[0];
        const last = ring[ring.length - 1];
        return (
          ring.length >= 4 &&
          ringAreaKm2(ring) > 0 &&
          Boolean(first && last) &&
          Math.abs((first?.x ?? 0) - (last?.x ?? 0)) < 1e-6 &&
          Math.abs((first?.z ?? 0) - (last?.z ?? 0)) < 1e-6
        );
      }),
  };
}

/** Camera framing derived from the visible polygon, not a rectangular bbox.
 * The target is the bbox centre when it is inside the district; otherwise the
 * authoritative label point is used. */
export function worldDistrictFocus(
  district: WorldDistrict,
  padding = 1.18,
): WorldFocus {
  const box = district.worldBbox;
  const centre = {
    x: (box.minX + box.maxX) / 2,
    z: (box.minZ + box.maxZ) / 2,
  };
  const label = lonLatToWorld(district.labelPoint[0], district.labelPoint[1]);
  const target = pointInWorldDistrict(centre, district) ? centre : label;
  let radius = 1.1;
  for (const ring of district.worldPolygons) {
    for (const point of ring) {
      radius = Math.max(
        radius,
        Math.hypot(point.x - target.x, point.z - target.z),
      );
    }
  }
  return {
    target: [target.x, 0, target.z],
    offset: [0.78, 1.55, 0.95],
    radius: radius * padding,
  };
}

export function worldDistrictOutline(
  district: WorldDistrict,
  y = 0.075,
): THREE.BufferGeometry {
  const positions: number[] = [];
  for (const ring of district.worldPolygons) {
    for (let index = 0; index < ring.length; index += 1) {
      const a = ring[index];
      const b = ring[(index + 1) % ring.length];
      if (!a || !b) continue;
      positions.push(a.x, y, a.z, b.x, y, b.z);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  return geometry;
}
