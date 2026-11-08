import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();
await page.goto('http://127.0.0.1:4321/?district=kaohsiung-council-04', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid="city-explorer"][data-hydrated="true"]', { timeout: 30000 });
await page.waitForTimeout(2500);
console.log(JSON.stringify(await page.evaluate(() => {
  const mesh = window.__worldMassing;
  const data = window.__worldMassingData;
  const scene = window.__worldScene;
  const out = { massingCount: mesh?.count, dataLen: data?.length, objects: [] };
  if (mesh) out.instanceMatrix = Array.from(mesh.instanceMatrix.array.slice(0, 16));
  if (scene) {
    scene.traverse((obj) => {
      if (!obj.isMesh) return;
      const mat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
      if (!mat) return;
      if (obj.geometry?.type === 'BoxGeometry') {
        obj.geometry.computeBoundingBox();
        const bb = obj.geometry.boundingBox;
        out.objects.push({
          name: obj.name,
          type: obj.geometry.type,
          color: mat.color?.getHexString?.(),
          count: obj.count,
          position: obj.position.toArray(),
          scale: obj.scale.toArray(),
          bbox: bb ? [bb.min.toArray(), bb.max.toArray()] : null,
          materialType: mat.type,
        });
      }
    });
  }
  return out;
}), null, 2));
await browser.close();
