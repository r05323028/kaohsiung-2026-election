const fs = require('fs');
let scene = fs.readFileSync('src/components/CityScene.tsx', 'utf8');
scene = scene.replace(
  "    const endPosition = target\n      .clone()\n      .add(CAMERA_DIRECTION.clone().multiplyScalar(distance));",
  "    const portrait = size.height > size.width * 1.15;\n    // A steeper portrait view turns the wide diorama into a legible map\n    // instead of a thin strip floating in empty sky.\n    const direction =\n      portrait && focusRadius > 12\n        ? new THREE.Vector3(0.62, 2.6, 0.62).normalize()\n        : CAMERA_DIRECTION;\n    const endPosition = target\n      .clone()\n      .add(direction.clone().multiplyScalar(distance));",
);
scene = scene.replace(
  "    const portraitBoost =\n      size.height > size.width * 1.15\n        ? focusRadius > 12\n          ? 1.58\n          : 1.1\n        : 1;",
  "    const portraitBoost = portrait ? (focusRadius > 12 ? 1.42 : 1.1) : 1;",
);
fs.writeFileSync('src/components/CityScene.tsx', scene);

let land = fs.readFileSync('src/city/landmarks.ts', 'utf8');
land = land.replace(
  "  b.addBuilder(head, { scale: 1.6, x, y: 0.04, z: z + 0.36 });",
  "  b.addBuilder(head, { scale: 2.0, x, y: 0.04, z: z + 0.52 });",
);
// Frame each mouth as a painted portal.
land = land.replace(
  "  f.box(0.36, 0.3, 0.26, 0, 0.46, 0.9, 'ink');\n  f.roundedBox(0.4, 0.08, 0.3, 0.03, 0, 0.33, 0.9, 'tealDeep');",
  "  f.box(0.36, 0.3, 0.26, 0, 0.46, 0.9, 'ink');\n  f.box(0.46, 0.045, 0.06, 0, 0.64, 1.04, 'gold');\n  f.box(0.46, 0.045, 0.06, 0, 0.29, 1.04, 'gold');\n  for (const side of [-1, 1]) {\n    f.box(0.045, 0.36, 0.06, side * 0.23, 0.46, 1.04, 'templeRed');\n  }\n  f.roundedBox(0.4, 0.08, 0.3, 0.03, 0, 0.33, 0.9, 'tealDeep');",
);
land = land.replace(
  "  f.box(0.34, 0.28, 0.24, 0, 0.44, 0.9, 'ink');\n  f.roundedBox(0.36, 0.1, 0.28, 0.04, 0, 0.31, 0.9, 'cream');",
  "  f.box(0.34, 0.28, 0.24, 0, 0.44, 0.9, 'ink');\n  f.box(0.44, 0.045, 0.06, 0, 0.61, 1.04, 'gold');\n  f.box(0.44, 0.045, 0.06, 0, 0.28, 1.04, 'gold');\n  for (const side of [-1, 1]) {\n    f.box(0.045, 0.34, 0.06, side * 0.22, 0.45, 1.04, 'templeRed');\n  }\n  f.roundedBox(0.36, 0.1, 0.28, 0.04, 0, 0.31, 0.9, 'cream');",
);
fs.writeFileSync('src/city/landmarks.ts', land);

let layout = fs.readFileSync('src/city/layout.ts', 'utf8');
layout = layout.replace(
  "      centerX: -8.5,\n      centerZ: -0.9,\n      radiusX: 6.2,\n      radiusZ: 0.35,\n      count: 12,\n      seed: 811,\n      kinds: ['palm', 'broadleaf'],\n    }),",
  "      centerX: -8.5,\n      centerZ: -0.9,\n      radiusX: 6.2,\n      radiusZ: 0.35,\n      count: 12,\n      seed: 811,\n      kinds: ['palm', 'broadleaf'],\n      avoid: (x, z) => x > -8.4 && x < -3.8 && z > -2.3 && z < 0.4,\n    }),",
);
fs.writeFileSync('src/city/layout.ts', layout);
console.log('pagoda/mobile patch applied');
