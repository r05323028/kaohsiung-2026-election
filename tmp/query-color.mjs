import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();
await page.goto('http://127.0.0.1:4321/?district=kaohsiung-council-04', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid="city-explorer"][data-hydrated="true"]', { timeout: 30000 });
await page.waitForTimeout(2000);
console.log(JSON.stringify(await page.evaluate(() => {
  const mesh = window.__worldMassing;
  return { has: !!mesh, count: mesh?.count, color: mesh?.material?.color?.getHexString?.(), instanceColor: mesh?.instanceColor ? Array.from(mesh.instanceColor.array.slice(0, 18)) : null, sampleMatrix: Array.from(mesh?.instanceMatrix?.array.slice(0, 16) ?? []) };
}), null, 2));
await browser.close();
