import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
async function shot(path, viewport, action, out) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: viewport.width < 500 ? 2 : 1, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4321' + path, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-testid="city-explorer"][data-hydrated="true"]').waitFor({ timeout: 30000 });
  await page.locator('canvas').waitFor({ timeout: 30000 });
  await page.waitForTimeout(1800);
  if (action) await action(page);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: out, timeout: 120000 });
  console.log(out, await page.locator('[data-testid="city-explorer"]').getAttribute('data-scene-focus'));
  await context.close();
}
await shot('/', { width: 390, height: 844 }, async (page) => {
  await page.locator('.city-dock__bar .city-zones button').filter({ hasText: '全城' }).click();
}, 'tmp/massing-mobile-world.png');
await shot('/', { width: 1600, height: 1000 }, async (page) => {
  await page.locator('[aria-controls="city-admin-tray"]').click();
  await page.locator('#city-admin-tray .city-admin-chip').filter({ hasText: '左營' }).first().click();
  await page.locator('.city-admin-card').waitFor({ state: 'visible' });
}, 'tmp/massing-zuoying.png');
await shot('/?district=kaohsiung-mayor-2026&candidate=zhang-jing-2026', { width: 1600, height: 1000 }, async (page) => {
  await page.evaluate(() => {
    const world = window.__kaohsiungWorld;
    world?.advance(900);
  });
}, 'tmp/massing-mayor.png');
await browser.close();
