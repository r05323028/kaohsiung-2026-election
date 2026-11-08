const fs = require('fs');
let layout = fs.readFileSync('src/city/layout.ts', 'utf8');
layout = layout.replace(
  "  overview: {\n    target: [0, 0.2, 1.0] as [number, number, number],\n    offset: [16, 22, 21] as [number, number, number],\n    radius: 18.5,\n  },",
  "  overview: {\n    target: [0, 0.2, 1.0] as [number, number, number],\n    offset: [16, 22, 21] as [number, number, number],\n    radius: 17.2,\n  },",
);
layout = layout.replace(
  "      target: [11.9, 0.5, -7.0],\n      radius: 7.2,",
  "      target: [11.8, 0.4, -7.6],\n      radius: 6.1,",
);
layout = layout.replace(
  "      count: 56,\n      seed: 701,",
  "      count: 46,\n      seed: 701,",
);
layout = layout.replace(
  "        if (Math.hypot((x - 11.6) / 2.35, (z + 7.4) / 1.85) < 1) return true;",
  "        if (Math.hypot((x - 11.6) / 3.4, (z + 7.4) / 2.75) < 1) return true;",
);
// Move the playground clear of the lake and onto the eastern lawn.
layout = layout.replaceAll('11.6, 0.11, -8.6', '14.5, 0.11, -10.2');
layout = layout.replaceAll('11.2, 0.35, -8.8', '14.1, 0.35, -10.4');
layout = layout.replaceAll('11.8, 0.35, -8.8', '14.7, 0.35, -10.4');
layout = layout.replaceAll('11.5, 0.58, -8.8', '14.4, 0.58, -10.4');
layout = layout.replaceAll('11.5, 0.32, -8.8', '14.4, 0.32, -10.4');
layout = layout.replaceAll('12.3, 0.18, -8.4', '15.0, 0.18, -9.9');
layout = layout.replaceAll('12.3, 0.27, -8.4', '15.0, 0.27, -9.9');
// A small timber deck at the lake's southern edge.
layout = layout.replace(
  "  // Small lake is added as water geometry; shore planting sits here.\n  bench(b, 11.1, -5.2, Math.PI / 2);",
  "  // Small lake is added as water geometry; a timber deck and benches face it.\n  boardwalk({ x1: 10.2, z1: -6.15, x2: 13.1, z2: -6.15, width: 0.36, detail });\n  bench(b, 11.1, -5.2, Math.PI / 2);",
);
fs.writeFileSync('src/city/layout.ts', layout);

let scene = fs.readFileSync('src/components/CityScene.tsx', 'utf8');
scene = scene.replace(
  "  const lake = useMemo(() => makeLake(11.6, -7.4, 1.55, 1.15, 0.095), []);",
  "  const lake = useMemo(() => makeLake(11.6, -7.4, 1.9, 1.25, 0.095), []);",
);
scene = scene.replace(
  "    const portraitBoost = size.height > size.width * 1.15 ? 1.2 : 1;",
  "    const portraitBoost =\n      size.height > size.width * 1.15\n        ? focusRadius > 12\n          ? 1.58\n          : 1.1\n        : 1;",
);
fs.writeFileSync('src/components/CityScene.tsx', scene);

let land = fs.readFileSync('src/city/landmarks.ts', 'utf8');
land = land.replace(
  "  b.addBuilder(head, { scale: 1.38, x, y: 0.05, z });",
  "  b.addBuilder(head, { scale: 1.6, x, y: 0.04, z: z + 0.36 });",
);
fs.writeFileSync('src/city/landmarks.ts', land);
console.log('visual pass patched');
