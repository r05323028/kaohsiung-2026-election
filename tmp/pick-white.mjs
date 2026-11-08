import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();
await page.goto('http://127.0.0.1:4321/?district=kaohsiung-council-04', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid="city-explorer"][data-hydrated="true"]', { timeout: 30000 });
await page.waitForTimeout(2500);
for (const [x,y] of [[940,470],[940,430],[900,480],[960,480]]) {
  console.log(x,y, JSON.stringify(await page.evaluate(([px,py]) => window.__worldPick?.(px,py), [x,y]), null, 2));
}
await browser.close();
