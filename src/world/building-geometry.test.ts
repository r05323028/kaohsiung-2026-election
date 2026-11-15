import type * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  buildCityBuildingGeometry,
  validateCityBuildingGeometry,
} from './building-geometry';
import { generateCityBuildings } from './buildings';

const specs = generateCityBuildings();
const city = buildCityBuildingGeometry(specs);

describe('city building geometry', () => {
  it('merges all buildings into three shared buckets', () => {
    expect(city.stats.buildings).toBe(specs.length);
    expect(Object.keys(city.buckets).sort()).toEqual([
      'glass',
      'metal',
      'wall',
    ]);
    for (const bucket of Object.values(city.buckets)) {
      expect(bucket.geometry.attributes.position!.count).toBeGreaterThan(0);
      expect(bucket.lowIndexCount).toBeGreaterThan(0);
      expect(bucket.lowIndexCount).toBeLessThan(bucket.mediumIndexCount);
      expect(bucket.mediumIndexCount).toBeLessThanOrEqual(
        bucket.highIndexCount,
      );
      expect(bucket.highIndexCount).toBe(bucket.geometry.index!.count);
      for (const count of [
        bucket.lowIndexCount,
        bucket.mediumIndexCount,
        bucket.highIndexCount,
      ]) {
        expect(count % 3, 'triangles are whole').toBe(0);
      }
    }
  });

  it('reports triangle counts consistent with the index buffers', () => {
    const total = (key: 'lowTriangles' | 'mediumTriangles' | 'highTriangles') =>
      city.stats[key];
    const sum = (
      key: 'lowIndexCount' | 'mediumIndexCount' | 'highIndexCount',
    ) =>
      Object.values(city.buckets).reduce(
        (count, bucket) => count + bucket[key],
        0,
      ) / 3;
    expect(total('lowTriangles')).toBe(sum('lowIndexCount'));
    expect(total('mediumTriangles')).toBe(sum('mediumIndexCount'));
    expect(total('highTriangles')).toBe(sum('highIndexCount'));
    expect(total('lowTriangles')).toBeLessThan(total('mediumTriangles'));
    expect(total('mediumTriangles')).toBeLessThan(total('highTriangles'));
  });

  it('writes finite, in-range vertex data inside the world bounds', {
    timeout: 20_000,
  }, () => {
    for (const bucket of Object.values(city.buckets)) {
      const position = bucket.geometry.attributes.position!;
      const normal = bucket.geometry.attributes.normal!;
      const color = bucket.geometry.attributes.color!;
      expect(normal.count).toBe(position.count);
      expect(color.count).toBe(position.count);
      for (let index = 0; index < position.count; index += 1) {
        const x = position.getX(index);
        const y = position.getY(index);
        const z = position.getZ(index);
        expect(Number.isFinite(x + y + z), 'finite position').toBe(true);
        expect(Math.abs(x)).toBeLessThan(50);
        expect(Math.abs(z)).toBeLessThan(50);
        expect(y).toBeGreaterThan(0.3);
        expect(y).toBeLessThan(2);
        expect(normal.getX(index)).toBeGreaterThanOrEqual(-1.001);
        expect(color.getX(index)).toBeGreaterThanOrEqual(0);
        expect(color.getX(index)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('bounds the merged city so frustum culling and shadows match', () => {
    expect(
      Object.values(city.buckets).some(
        (bucket) => bucket.highIndexCount > bucket.mediumIndexCount,
      ),
    ).toBe(true);
    for (const bucket of Object.values(city.buckets)) {
      expect(bucket.geometry.boundingSphere).not.toBeNull();
      const sphere = bucket.geometry.boundingSphere!;
      expect(sphere.radius).toBeGreaterThan(1);
      expect(sphere.radius).toBeLessThan(50);
    }
  });

  it('keeps pitched roofs and tank caps outward-facing', () => {
    const sawtooth = specs.find((spec) => spec.roof === 'sawtooth');
    const flat = specs.find((spec) => spec.roof === 'flat');
    expect(sawtooth).toBeDefined();
    expect(flat).toBeDefined();
    if (!sawtooth || !flat) return;

    const sawtoothSpec = { ...sawtooth, waterTank: false, variant: 1 };
    const sawtoothCity = buildCityBuildingGeometry([sawtoothSpec]);
    const metal = sawtoothCity.buckets.metal.geometry;
    const positions = metal.getAttribute('position');
    const normals = metal.getAttribute('normal');
    const index = metal.getIndex();
    const roofBaseY = sawtoothSpec.baseY + sawtoothSpec.bodyHeight;
    let hasOutwardShedRoof = false;
    for (let offset = 0; offset < index!.count; offset += 3) {
      const a = index!.getX(offset);
      const b = index!.getX(offset + 1);
      const c = index!.getX(offset + 2);
      const ys = [a, b, c].map((vertex) => positions.getY(vertex));
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      if (
        minY >= roofBaseY - 0.002 &&
        maxY <= roofBaseY + sawtoothSpec.roofHeight + 0.002 &&
        maxY - minY > sawtoothSpec.roofHeight * 0.5 &&
        normals.getY(a) > 0.1
      ) {
        hasOutwardShedRoof = true;
        break;
      }
    }
    expect(hasOutwardShedRoof).toBe(true);

    const tankSpec = {
      ...flat,
      waterTank: true,
      variant: 1,
    };
    const tankCity = buildCityBuildingGeometry([tankSpec]);
    const tankGeometry = tankCity.buckets.metal.geometry;
    const tankPositions = tankGeometry.getAttribute('position');
    const tankNormals = tankGeometry.getAttribute('normal');
    const tankIndex = tankGeometry.getIndex();
    const tankTopY = tankSpec.baseY + tankSpec.bodyHeight + 0.018 + 0.115;
    let hasUpwardTankCap = false;
    for (let offset = 0; offset < tankIndex!.count; offset += 3) {
      const a = tankIndex!.getX(offset);
      const b = tankIndex!.getX(offset + 1);
      const c = tankIndex!.getX(offset + 2);
      if (
        [a, b, c].every(
          (vertex) => Math.abs(tankPositions.getY(vertex) - tankTopY) < 0.001,
        ) &&
        tankNormals.getY(a) > 0.9
      ) {
        hasUpwardTankCap = true;
        break;
      }
    }
    expect(hasUpwardTankCap).toBe(true);
  });

  it('reports malformed indices, non-finite positions, and degenerate triangles', () => {
    const cloneWithWall = (geometry: THREE.BufferGeometry) => ({
      ...city,
      buckets: {
        ...city.buckets,
        wall: { ...city.buckets.wall, geometry },
      },
    });

    const nonFinite = city.buckets.wall.geometry.clone();
    const nonFinitePositions = nonFinite.getAttribute('position');
    nonFinitePositions.setX(0, Number.NaN);
    expect(validateCityBuildingGeometry(cloneWithWall(nonFinite))).toContain(
      'wall: non-finite vertex coordinate',
    );

    const outOfRange = city.buckets.wall.geometry.clone();
    const positionCount = outOfRange.getAttribute('position').count;
    outOfRange.setIndex([0, 1, positionCount]);
    expect(validateCityBuildingGeometry(cloneWithWall(outOfRange))).toContain(
      'wall: index points outside the position buffer',
    );

    const degenerate = city.buckets.wall.geometry.clone();
    degenerate.setIndex([0, 0, 0]);
    expect(validateCityBuildingGeometry(cloneWithWall(degenerate))).toEqual(
      expect.arrayContaining([
        expect.stringContaining('wall: degenerate triangle'),
      ]),
    );
  });
});
