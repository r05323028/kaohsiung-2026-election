const fs = require('fs');
let s = fs.readFileSync('src/city/layout.ts', 'utf8');
const needle = `  // Meadow patches, deterministic and sparse.
  const random = seededRandom(913);
  for (let i = 0; i < 16; i += 1) {
    const x = -16 + random() * 32;
    const z = -14 + random() * 26;
    if (x < -2 && z < -1.2 && z > -10.2) continue;
    if (x > 6 && x < 10) continue;
    if (z > 7) continue;
    b.sphere(1.1 + random() * 1.4, x, 0.065, z, i % 2 === 0 ? 'grassWarm' : 'grassDark', 8, 6, [1, 0.04, 1]);
  }`;
if (!s.includes(needle)) throw new Error('patch needle missing');
s = s.replace(needle, `  // Soft meadow patches, deterministic and sparse. Twenty-four sides keep
  // the rims curved instead of reading as large flat polygons.
  const random = seededRandom(913);
  for (let i = 0; i < 18; i += 1) {
    const x = -16 + random() * 32;
    const z = -14 + random() * 26;
    if (x < -2 && z < -1.2 && z > -10.2) continue;
    if (x > 6 && x < 10) continue;
    if (x > 9.5 && z < -1.5) continue;
    if (Math.abs(x - 8) < 1.9) continue;
    if (z > 7) continue;
    b.sphere(0.55 + random() * 0.85, x, 0.072, z, i % 2 === 0 ? 'grassWarm' : 'grassDark', 24, 14, [1, 0.025, 1]);
  }`);
fs.writeFileSync('src/city/layout.ts', s);
console.log('patched ground');
