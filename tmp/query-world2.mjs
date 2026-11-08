import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();
await page.goto('http://127.0.0.1:4321/?district=kaohsiung-council-04', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid="city-explorer"][data-hydrated="true"]', { timeout: 30000 });
await page.waitForTimeout(2500);
console.log(JSON.stringify(await page.evaluate(() => {
  const mesh = window.__worldMassing;
  const scene = window.__worldScene;
  const boxes = [];
  if (scene) {
    scene.traverse((obj) => {
      if (!obj.isMesh || obj.geometry?.type !== 'BoxGeometry') return;
      const mat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
      obj.geometry.computeBoundingBox();
      const bb = obj.geometry.boundingBox;
      const size = bb ? [bb.max.x-bb.min.x, bb.max.y-bb.min.y, bb.max.z-bb.min.z] : [0,0,0];
      if (Math.max(...size) > 0.5) boxes.push({ color: mat?.color?.getHexString?.(), pos: obj.position.toArray(), scale: obj.scale.toArray(), size, count: obj.count, mat: mat?.type });
    });
  }
  return { massingCount: mesh?.count, dataLen: window.__worldMassingData?.length, boxes: boxes.slice(0, 30) };
}), null, 2));
await browser.close();
