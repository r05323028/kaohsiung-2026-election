const fs = require('fs');
let b = fs.readFileSync('src/city/builder.ts', 'utf8');
const holder = `  merge() {`;
if (!b.includes(holder)) throw new Error('builder merge missing');
b = b.replace(holder, `  /** Copy another builder's parts under an optional uniform scale/translation. */
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

  merge() {`);
fs.writeFileSync('src/city/builder.ts', b);

let m = fs.readFileSync('src/city/materials.ts', 'utf8');
m = m.replace("  metal: standard('#93a0a4', { roughness: 0.46, metalness: 0.55 }),", "  metal: standard('#b7c2c4', { roughness: 0.42, metalness: 0.35 }),");
fs.writeFileSync('src/city/materials.ts', m);

let l = fs.readFileSync('src/city/layout.ts', 'utf8');
l = l.replace(`  // Meadow mounds.
  b.sphere(2.1, 11.4, 0.06, -4.0, 'grassDark', 10, 8, [1, 0.16, 1]);
  b.sphere(1.7, 14.6, 0.06, -8.0, 'grassWarm', 9, 8, [1, 0.18, 1]);
  b.sphere(1.2, 10.4, 0.07, -10.2, 'grassDark', 8, 7, [1, 0.2, 1]);`, `  // Gentle meadow swells. High segment counts keep the silhouettes smooth
  // at close range instead of reading as flat polygonal patches.
  b.sphere(2.1, 11.4, 0.06, -4.0, 'grassDark', 32, 20, [1, 0.08, 1]);
  b.sphere(1.65, 14.6, 0.06, -8.0, 'grassWarm', 28, 18, [1, 0.07, 1]);
  b.sphere(1.15, 10.4, 0.07, -10.2, 'grassDark', 24, 16, [1, 0.06, 1]);
  // Flowering beds add warm colour between the paths.
  for (const [fx, fz, key] of [
    [12.0, -4.7, 'coral'],
    [14.4, -6.7, 'gold'],
    [11.4, -8.5, 'coral'],
    [14.8, -5.3, 'plasterWhite'],
  ] as Array<[number, number, Parameters<CityBuilder['sphere']>[4]]>) {
    b.sphere(0.24, fx, 0.075, fz, key, 16, 10, [1.4, 0.06, 1]);
    b.sphere(0.12, fx + 0.22, 0.09, fz - 0.12, 'foliage', 12, 8, [1, 0.5, 1]);
  }`);
l = l.replace("      target: [12.8, 0.6, -6.5],\n      offset: [11, 11, 11],\n      radius: 8.0,", "      target: [11.9, 0.5, -7.0],\n      offset: [11, 11, 11],\n      radius: 7.2,");
l = l.replace("      radiusX: 3.6,\n      radiusZ: 4.4,\n      count: 58,", "      radiusX: 3.6,\n      radiusZ: 4.4,\n      count: 56,");
l = l.replace("        if (Math.hypot((x - 12.5) / 1.7, (z + 6.4) / 1.15) < 1) return true;", "        if (Math.hypot((x - 11.6) / 2.35, (z + 7.4) / 1.85) < 1) return true;");
fs.writeFileSync('src/city/layout.ts', l);

let s = fs.readFileSync('src/components/CityScene.tsx', 'utf8');
s = s.replace("  const lake = useMemo(() => makeLake(12.5, -6.4, 1.35, 1.05, 0.095), []);", "  const lake = useMemo(() => makeLake(11.6, -7.4, 1.55, 1.15, 0.095), []);");
fs.writeFileSync('src/components/CityScene.tsx', s);

console.log('patched park/materials/lake');
