import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();
const shots = [
  ['world-overview', '/', 3200],
  ['world-mayor', '/?district=kaohsiung-mayor-2026&candidate=zhang-jing-2026', 4200],
  ['world-council', '/?district=kaohsiung-council-04&candidate=kaohsiung-council-04-712cf4dd', 3600],
];
for (const [name, url, wait] of shots) {
  await page.goto('http://127.0.0.1:4321' + url);
  await page.waitForSelector('[data-testid="city-explorer"][data-hydrated="true"]', { timeout: 60000 });
  await page.waitForTimeout(wait);
  const focus = await page.locator('[data-testid="city-explorer"]').getAttribute('data-scene-focus');
  console.log(name, focus);
  await page.screenshot({ path: 'reports/visual/debug-' + name + '.png', timeout: 120000 });
}
await browser.close();
