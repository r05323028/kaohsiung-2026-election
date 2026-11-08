import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();
await page.goto('http://127.0.0.1:4321/?district=kaohsiung-council-04', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid="city-explorer"][data-hydrated="true"]', { timeout: 30000 });
await page.waitForTimeout(2500);
console.log(JSON.stringify(await page.evaluate(() => {
  const data = window.__worldMassingData ?? [];
  const rows = data.map((item, i) => {
    const e = item.matrix.elements;
    return { i, x: e[12], y: e[13], z: e[14], sx: Math.hypot(e[0],e[1],e[2]), sy: Math.hypot(e[4],e[5],e[6]), sz: Math.hypot(e[8],e[9],e[10]) };
  });
  rows.sort((a,b) => Math.max(b.sx,b.sy,b.sz) - Math.max(a.sx,a.sy,a.sz));
  return rows.slice(0, 12);
}), null, 2));
await browser.close();
