import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();
await page.goto('http://127.0.0.1:4321/?district=kaohsiung-council-04', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid="city-explorer"][data-hydrated="true"]', { timeout: 30000 });
await page.waitForTimeout(2500);
console.log(JSON.stringify(await page.evaluate(() => {
  const scene = window.__worldScene;
  const out = [];
  if (!scene) return out;
  scene.updateMatrixWorld(true);
  scene.traverse((obj) => {
    if (!obj.isMesh || obj.isInstancedMesh) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    const mat = mats[0];
    if (!mat) return;
    obj.geometry.computeBoundingBox();
    const bb = obj.geometry.boundingBox;
    if (!bb) return;
    const box = bb.clone().applyMatrix4(obj.matrixWorld);
    const sx = box.max.x - box.min.x, sy = box.max.y - box.min.y, sz = box.max.z - box.min.z;
    if (Math.max(sx,sy,sz) < 0.6) return;
    out.push({ color: mat.color?.getHexString?.(), mat: mat.type, size: [sx,sy,sz], center: [(box.min.x+box.max.x)/2,(box.min.y+box.max.y)/2,(box.min.z+box.max.z)/2], geomType: obj.geometry.type, verts: obj.geometry.attributes.position?.count, parent: obj.parent?.type, name: obj.name });
  });
  return out.sort((a,b) => Math.max(...b.size) - Math.max(...a.size)).slice(0, 30);
}), null, 2));
await browser.close();
