import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, reducedMotion: 'reduce' });
const page = await context.newPage();
await page.goto('http://127.0.0.1:4322/?district=kaohsiung-council-04&focus=metropolitan-park', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid="city-explorer"][data-hydrated="true"]');
await page.locator('canvas').waitFor();
await page.waitForTimeout(2300);
const out = await page.evaluate(() => {
  const w = window;
  const scene = w.__cityScene;
  const camera = w.__cityCamera;
  const THREE = w.__cityTHREE;
  if (!scene || !camera || !THREE) return { error: 'missing debug globals' };
  const pick = (x, y) => {
    const rc = new THREE.Raycaster();
    rc.setFromCamera(new THREE.Vector2((x / 1600) * 2 - 1, -(y / 1000) * 2 + 1), camera);
    return rc.intersectObjects(scene.children, true).slice(0, 8).map((h) => ({
      name: h.object.name || null,
      type: h.object.type,
      geometry: h.object.geometry?.type || null,
      material: h.object.material?.type || null,
      color: h.object.material?.color ? '#' + h.object.material.color.getHexString() : null,
      point: h.point.toArray().map((n) => Math.round(n * 100) / 100),
      distance: Math.round(h.distance * 100) / 100,
    }));
  };
  const points = {};
  for (const [x,y] of [[700,500],[760,470],[650,520],[900,470],[1000,560],[700,600]]) points[x+','+y] = pick(x,y);
  const sceneObjects = [];
  scene.traverse((o) => {
    if (o.isMesh && o !== scene) {
      const p = new THREE.Vector3(); o.getWorldPosition(p);
      if (p.x > 8 && p.x < 15 && p.z > -11 && p.z < -4 && p.y > 0.05) {
        sceneObjects.push({
          name: o.name || null, type: o.type, geometry: o.geometry?.type || null,
          color: o.material?.color ? '#' + o.material.color.getHexString() : null,
          material: o.material?.type || null,
          position: p.toArray().map((n) => Math.round(n * 100) / 100),
          scale: o.getWorldScale(new THREE.Vector3()).toArray().map((n) => Math.round(n * 100) / 100),
        });
      }
    }
  });
  return { points, sceneObjects };
});
console.log(JSON.stringify(out, null, 2));
await browser.close();
