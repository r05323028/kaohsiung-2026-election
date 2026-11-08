import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true, args:['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport:{width:1600,height:1000}, reducedMotion:'reduce' });
const page = await context.newPage();
await page.goto('http://127.0.0.1:4321/?district=kaohsiung-mayor-2026&candidate=zhang-jing-2026', { waitUntil:'domcontentloaded' });
await page.locator('[data-testid="city-explorer"][data-hydrated="true"]').waitFor({timeout:30000});
await page.locator('canvas').waitFor({timeout:30000});
await page.waitForTimeout(2500);
console.log(await page.evaluate(() => {
  const g = window.__heroGroup;
  const cam = window.__cityCamera;
  g.updateMatrixWorld(true);
  const world = g.getWorldPosition(g.position.clone());
  const p = world.clone().project(cam);
  const childTypes = g.children.slice(0,5).map(c=>({type:c.type, name:c.name, visible:c.visible, geom:c.geometry?.type, mat:c.material?.type}));
  return JSON.stringify({ cam: {pos:cam.position.toArray(), zoom:cam.zoom, near:cam.near, far:cam.far}, world: world.toArray(), ndc: p.toArray(), children: childTypes });
}));
await browser.close();
