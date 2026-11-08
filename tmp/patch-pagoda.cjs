const fs = require('fs');
const file = 'src/city/landmarks.ts';
let s = fs.readFileSync(file, 'utf8');
s = s.replace("import { type CityBuilder, type DetailLevel, frame } from './builder';", "import { CityBuilder, type DetailLevel, frame } from './builder';");
const headNeedle = `  // The sculpted head doubles as the ground-floor entrance.
  if (kind === 'dragon') dragonHead(b, x, z, detail);
  else tigerHead(b, x, z, detail);`;
if (!s.includes(headNeedle)) throw new Error('head needle missing');
s = s.replace(headNeedle, `  // The sculpted head doubles as the ground-floor entrance. Build it in a
  // scratch builder so it can be scaled as one hero asset without hand-tuning
  // every facial feature.
  const head = new CityBuilder();
  if (kind === 'dragon') dragonHead(head, 0, 0, detail);
  else tigerHead(head, 0, 0, detail);
  b.addBuilder(head, { scale: 1.38, x, y: 0.05, z });`);

s = s.replace("  let y = 1.02;", "  let y = 1.24;");
s = s.replace("    const radius = 0.38 - i * 0.013;\n    const bodyH = 0.3;", "    const radius = 0.31 - i * 0.011;\n    const bodyH = 0.21;");
s = s.replace("    f.cylinder(radius + 0.1, radius + 0.1, 0.035, 8, 0, y + bodyH + 0.02, 0, 'stone');\n    ring(b, x, y + bodyH + 0.12, z, (radius + 0.1) * 0.98, 'templeRed', 0.011);", "    f.cylinder(radius + 0.065, radius + 0.065, 0.028, 8, 0, y + bodyH + 0.014, 0, 'stone');\n    ring(b, x, y + bodyH + 0.09, z, (radius + 0.065) * 0.98, 'templeRed', 0.009);");
s = s.replace("      f.box(0.018, 0.2, 0.018, Math.cos(angle) * (radius + 0.1) * 0.98, y + bodyH + 0.12, Math.sin(angle) * (radius + 0.1) * 0.98, 'templeRed');", "      f.box(0.016, 0.15, 0.016, Math.cos(angle) * (radius + 0.065) * 0.98, y + bodyH + 0.085, Math.sin(angle) * (radius + 0.065) * 0.98, 'templeRed');");
s = s.replace("    f.eave(radius + 0.2, 0.085, 0, y + bodyH + 0.05, 0, 'roofTeal', 0.07);", "    f.eave(radius + 0.13, 0.055, 0, y + bodyH + 0.03, 0, 'roofTeal', 0.03);");
s = s.replace("        f.box(0.02, 0.02, radius + 0.18, Math.cos(angle) * (radius + 0.1), y + bodyH + 0.1, Math.sin(angle) * (radius + 0.1), 'roofTeal', angle);", "        f.box(0.015, 0.015, radius + 0.11, Math.cos(angle) * (radius + 0.05), y + bodyH + 0.055, Math.sin(angle) * (radius + 0.05), 'roofTeal', angle);");
s = s.replace("    y += bodyH + 0.17;", "    y += bodyH + 0.075;");
s = s.replace(`  f.eave(0.5, 0.11, 0, y + 0.06, 0, 'roofTeal', 0.1);
  f.cylinder(0.42, 0.47, 0.1, 8, 0, y + 0.17, 0, 'roofTeal');
  f.cone(0.36, 0.3, 8, 0, y + 0.36, 0, 'roofTeal');
  f.cylinder(0.12, 0.16, 0.06, 8, 0, y + 0.54, 0, 'gold');
  f.sphere(0.085, 0, y + 0.63, 0, 'gold', [1, 1, 1], 8);
  f.cylinder(0.018, 0.03, 0.2, 5, 0, y + 0.77, 0, 'gold');
  f.sphere(0.035, 0, y + 0.9, 0, 'gold', [1, 1, 1], 6);`, `  f.eave(0.38, 0.09, 0, y + 0.05, 0, 'roofTeal', 0.07);
  f.cylinder(0.32, 0.36, 0.09, 8, 0, y + 0.14, 0, 'roofTeal');
  f.cone(0.28, 0.26, 8, 0, y + 0.31, 0, 'roofTeal');
  f.cylinder(0.1, 0.13, 0.05, 8, 0, y + 0.47, 0, 'gold');
  f.sphere(0.07, 0, y + 0.55, 0, 'gold', [1, 1, 1], 8);
  f.cylinder(0.016, 0.026, 0.16, 5, 0, y + 0.67, 0, 'gold');
  f.sphere(0.028, 0, y + 0.78, 0, 'gold', [1, 1, 1], 6);`);
s = s.replace("      f.sphere(0.03, Math.cos(angle) * 0.56, y + 0.02, Math.sin(angle) * 0.56, 'gold', [1, 1, 1], 5);", "      f.sphere(0.026, Math.cos(angle) * 0.42, y + 0.02, Math.sin(angle) * 0.42, 'gold', [1, 1, 1], 5);");
fs.writeFileSync(file, s);
console.log('pagoda patched');
