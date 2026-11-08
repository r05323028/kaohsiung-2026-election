import { chromium } from '@playwright/test';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.goto('http://127.0.0.1:4321/?district=kaohsiung-council-04&focus=lotus-pond', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid="city-explorer"][data-hydrated="true"]', { timeout: 30000 });
await page.waitForTimeout(4000);
const data = await page.evaluate(() => {
  const c = window.__cityCamera;
  const ctrl = window.__cityControls;
  return c ? {
    type: c.type,
    zoom: c.zoom,
    pos: c.position.toArray(),
    near: c.near,
    far: c.far,
    left: c.left, right: c.right, top: c.top, bottom: c.bottom,
    target: ctrl ? ctrl.target.toArray() : null,
    enabled: ctrl ? ctrl.enabled : null,
    bodyZoom: document.body.dataset.cameraZoom,
  } : null;
});
console.log(JSON.stringify(data, null, 2));
await browser.close();
