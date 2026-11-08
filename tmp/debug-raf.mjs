import { chromium } from '@playwright/test';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.goto('http://127.0.0.1:4321/?district=kaohsiung-council-04&focus=lotus-pond', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid="city-explorer"][data-hydrated="true"]', { timeout: 30000 });
const raf = await page.evaluate(() => new Promise(resolve => {
  let frames = 0;
  const start = performance.now();
  function tick() {
    frames += 1;
    if (performance.now() - start < 600) requestAnimationFrame(tick);
    else resolve({ frames, elapsed: Math.round(performance.now() - start), visibility: document.visibilityState });
  }
  requestAnimationFrame(tick);
}));
console.log('raf', raf);
await page.waitForTimeout(2500);
console.log(await page.evaluate(() => ({ zoom: window.__cityCamera?.zoom, enabled: window.__cityControls?.enabled, tick: document.body.dataset.cameraTick })));
await browser.close();
