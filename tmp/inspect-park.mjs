import { chromium } from '@playwright/test';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, reducedMotion: 'reduce' });
const page = await context.newPage();
await page.goto('http://127.0.0.1:4321/?district=kaohsiung-council-04&focus=metropolitan-park', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid="city-explorer"][data-hydrated="true"]');
await page.waitForTimeout(1500);
const out = await page.evaluate(() => {
  const cam = window.__cityCamera;
  if (!cam) return { error: 'no cam' };
  const THREE = window.__THREE;
  const pts = [[11.6,0.1,-7.4],[12.5,-7.4],[10.6,-7.4],[11.6,-6.2],[11.6,-8.6],[8,0,2],[13,0,-6],[15,0,-10]];
  return {
    cam: [cam.position.x,cam.position.y,cam.position.z].map(v=>+v.toFixed(2)),
    zoom: cam.zoom,
    project: pts.map(p => {
      const v = { x: p[0], y: p[1], z: p[2] };
      const vec = new (window.__THREE?.Vector3 ?? Object)();
      return null;
    }),
    body: { ...document.body.dataset },
  };
});
console.log(JSON.stringify(out));
await browser.close();
