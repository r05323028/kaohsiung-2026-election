import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();
await page.goto('http://127.0.0.1:4321/?candidate=kaohsiung-council-04-712cf4dd', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid="city-explorer"][data-hydrated="true"]', { timeout: 30000 });
await page.waitForTimeout(2500);
console.log(await page.evaluate(() => {
  const w = window.__kaohsiungWorld;
  const actor = w?.actors?.().find((a) => a.slug === 'kaohsiung-council-04-712cf4dd');
  return { actor, focus: document.querySelector('[data-testid="city-explorer"]')?.getAttribute('data-scene-focus') };
}));
console.log('canvas', await page.evaluate(() => ({ w: innerWidth, h: innerHeight })));
await browser.close();
