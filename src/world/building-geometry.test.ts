import { describe, expect, it } from 'vitest';
import { buildCityBuildingGeometry } from './building-geometry';
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
});
