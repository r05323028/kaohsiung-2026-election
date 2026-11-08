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
  const chain = [];
  let o = g;
  while (o) { chain.push({type:o.type, name:o.name, visible:o.visible, pos:o.position.toArray(), scale:o.scale.toArray(), children:o.children.length}); o=o.parent; }
  g.updateMatrixWorld(true);
  const c = g.children[0];
  c.geometry.computeBoundingSphere();
  const center = c.geometry.boundingSphere.center.clone().applyMatrix4(c.matrixWorld);
  return JSON.stringify({ chain, c: { type:c.type, visible:c.visible, frustumCulled:c.frustumCulled, pos:c.position.toArray(), scale:c.scale.toArray(), worldCenter:center.toArray(), sphereRadius:c.geometry.boundingSphere.radius, matColor:c.material?.color?.getHexString?.() } });
}));
await browser.close();
