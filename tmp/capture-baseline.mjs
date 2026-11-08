import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const outDir = 'reports/visual/hud-geo/before';
await fs.mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
const shots = [
  ['01-citywide', '/', 1800],
  ['02-zuoying', '/?admin=E03', 2200],
  ['03-nanzih', '/?admin=E04', 2200],
  ['04-qijin', '/?admin=E08', 2200],
];
for (const [name, url, wait] of shots) {
  await page.goto('http://127.0.0.1:4321' + url, { waitUntil: 'networkidle' });
  await page.locator('[data-testid="city-explorer"][data-hydrated="true"]').waitFor({ timeout: 30000 });
  await page.waitForTimeout(wait);
  await page.screenshot({ path: outDir + '/' + name + '.png' });
  console.log(name, await page.locator('[data-testid="city-explorer"]').getAttribute('data-scene-focus'));
}
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
for (const [name, url, wait] of [['05-mobile-citywide','/',1800],['06-mobile-zuoying','/?admin=E03',2200]]) {
  await mobile.goto('http://127.0.0.1:4321' + url, { waitUntil: 'networkidle' });
  await mobile.locator('[data-testid="city-explorer"][data-hydrated="true"]').waitFor({ timeout: 30000 });
  await mobile.waitForTimeout(wait);
  await mobile.screenshot({ path: outDir + '/' + name + '.png' });
}
await browser.close();
