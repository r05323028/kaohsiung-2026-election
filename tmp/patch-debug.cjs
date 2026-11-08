const fs = require('fs');
let s = fs.readFileSync('src/components/CityScene.tsx', 'utf8');
const needle = `    const endZoom = Math.max(
      10,
      Math.min(150, (Math.min(size.width, size.height) / (2.15 * focusRadius)) * portraitBoost),
    );`;
if (!s.includes(needle)) throw new Error('needle missing');
s = s.replace(needle, needle + `
    document.body.dataset.cameraFocus = focusKey;
    document.body.dataset.cameraZoom = endZoom.toFixed(2);
    document.body.dataset.cameraControls = 'ready';
    console.info('[city camera]', focusKey, endZoom, size.width, size.height);`);
fs.writeFileSync('src/components/CityScene.tsx', s);

let e = fs.readFileSync('src/components/CityExplorer.tsx', 'utf8');
const needle2 = '      data-testid="city-explorer"';
if (!e.includes(needle2)) throw new Error('needle2 missing');
e = e.replace(needle2, needle2 + '\n      data-scene-focus={sceneFocus.key}');
fs.writeFileSync('src/components/CityExplorer.tsx', e);
console.log('patched');
