import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const out = 'reports/visual/hud-geo/after';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader'],
});
const page = await browser.newPage({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 1,
});
async function shot(name, url, wait = 5000) {
  await page.goto('http://127.0.0.1:4321' + url, { waitUntil: 'networkidle' });
  await page.locator('[data-testid="city-explorer"][data-hydrated="true"]').waitFor({ timeout: 30000 });
  await page.waitForTimeout(wait);
  await page.screenshot({ path: out + '/' + name + '.png' });
  const focus = await page.locator('[data-testid="city-explorer"]').getAttribute('data-scene-focus');
  const brand = await page.locator('.city-brand__title').innerText();
  const nav = await page.locator('.city-nav--desktop a').count();
  console.log(name, JSON.stringify({ focus, brand, nav }));
}
await shot('01-citywide', '/');
await shot('02-zuoying', '/?admin=E03', 6000);
await shot('03-nanzih', '/?admin=E04', 6000);
await shot('04-qijin', '/?admin=E10', 6000);
await shot('05-taoyuan', '/?admin=E37', 6000);
await shot('06-debug-zuoying', '/?debug=boundaries&admin=E03', 6500);
await shot('07-candidate-focus', '/?candidate=kaohsiung-council-04-712cf4dd', 7000);

const mobile = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});
await mobile.goto('http://127.0.0.1:4321/', { waitUntil: 'networkidle' });
await mobile.locator('[data-testid="city-explorer"][data-hydrated="true"]').waitFor({ timeout: 30000 });
await mobile.waitForTimeout(1800);
await mobile.screenshot({ path: out + '/08-mobile-citywide.png' });
const menuButton = mobile.getByRole('button', { name: '開啟網站選單' });
const menuBox = await menuButton.boundingBox();
await menuButton.click();
await mobile.waitForTimeout(300);
const menuVisible = await mobile.locator('#city-mobile-nav').isVisible();
const menuLinks = await mobile.locator('#city-mobile-nav nav a').count();
const active = await mobile.locator('#city-mobile-nav nav a[aria-current="page"]').innerText();
await mobile.screenshot({ path: out + '/09-mobile-menu.png' });
await mobile.keyboard.press('Escape');
await mobile.waitForTimeout(200);
const menuClosed = !(await mobile.locator('#city-mobile-nav').isVisible());
const restored = await menuButton.evaluate((el) => el === document.activeElement);
console.log('mobile-menu', JSON.stringify({ menuBox, menuVisible, menuLinks, active, menuClosed, restored }));

await mobile.goto('http://127.0.0.1:4321/?admin=E03', { waitUntil: 'networkidle' });
await mobile.locator('[data-testid="city-explorer"][data-hydrated="true"]').waitFor({ timeout: 30000 });
await mobile.waitForTimeout(2400);
await mobile.screenshot({ path: out + '/10-mobile-zuoying.png' });

await browser.close();
