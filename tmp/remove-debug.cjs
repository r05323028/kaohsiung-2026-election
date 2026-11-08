const fs = require('fs');
let s = fs.readFileSync('src/components/CityScene.tsx', 'utf8');
s = s.replace(
  /  useEffect\(\(\) => \{\n    const debugWindow = window as unknown as \{\n      __cityCamera\?: THREE\.Camera;\n      __cityControls\?: OrbitControlsImpl \| null;\n    \};\n    debugWindow\.__cityCamera = camera;\n    debugWindow\.__cityControls = controls\.current;\n  \}, \[camera, controlsReady\]\);\n/,
  '',
);
s = s.replace(
  /    document\.body\.dataset\.cameraFocus = focusKey;\n    document\.body\.dataset\.cameraZoom = endZoom\.toFixed\(2\);\n    document\.body\.dataset\.cameraControls = 'ready';\n    console\.info\('\[city camera\]', focusKey, endZoom, size\.width, size\.height\);\n/,
  '',
);
fs.writeFileSync('src/components/CityScene.tsx', s);
console.log(s.includes('__cityCamera'), s.includes('[city camera]'));
