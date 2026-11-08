import { chromium } from '@playwright/test';

const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

async function shot(page, url, file, viewport) {
  await page.setViewportSize(viewport);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="city-explorer"][data-hydrated="true"]', { timeout: 30000 });
  await page.waitForSelector('canvas', { timeout: 30000 });
  await page.waitForTimeout(2600);
  await page.screenshot({ path: file, timeout: 120000 });
  console.log('shot', file);
}

const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();
page.on('console', (msg) => { if (msg.type() === 'error') console.log('CONSOLE ERROR', msg.text()); });
page.on('pageerror', (err) => console.log('PAGE ERROR', err.message));

await shot(page, 'http://127.0.0.1:4321/?district=kaohsiung-council-04', 'reports/visual/debug-world-overview.png', { width: 1600, height: 1000 });
console.log('focus', await page.locator('[data-testid="city-explorer"]').getAttribute('data-scene-focus'));
console.log('stats', await page.evaluate(() => window.__kaohsiungWorld?.stats?.()));
console.log('actors', await page.evaluate(() => window.__kaohsiungWorld?.actors?.().slice(0, 3)));

await page.locator('[aria-controls="city-admin-tray"]').click();
await page.waitForTimeout(500);
await page.screenshot({ path: 'reports/visual/debug-admin-tray.png', timeout: 120000 });
console.log('admin tray shot');
await page.locator('#city-admin-tray .city-admin-chip').filter({ hasText: '左營' }).first().click();
await page.waitForTimeout(2600);
console.log('focus after admin', await page.locator('[data-testid="city-explorer"]').getAttribute('data-scene-focus'));
await page.screenshot({ path: 'reports/visual/debug-admin-zuoying.png', timeout: 120000 });

await page.goto('http://127.0.0.1:4321/?candidate=kaohsiung-council-04-712cf4dd', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid="city-explorer"][data-hydrated="true"]', { timeout: 30000 });
await page.waitForTimeout(3000);
console.log('focus candidate', await page.locator('[data-testid="city-explorer"]').getAttribute('data-scene-focus'));
await page.screenshot({ path: 'reports/visual/debug-world-candidate.png', timeout: 120000 });

await page.setViewportSize({ width: 390, height: 844 });
await page.goto('http://127.0.0.1:4321/?district=kaohsiung-council-04', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid="city-explorer"][data-hydrated="true"]', { timeout: 30000 });
await page.waitForTimeout(2600);
console.log('focus mobile', await page.locator('[data-testid="city-explorer"]').getAttribute('data-scene-focus'));
await page.screenshot({ path: 'reports/visual/debug-world-mobile.png', timeout: 120000 });

await browser.close();
