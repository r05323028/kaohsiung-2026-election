import { chromium } from '@playwright/test';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const views = [
  ['park10','/?district=kaohsiung-council-04&focus=metropolitan-park',1600,1000,1],
  ['candidate10','/?district=kaohsiung-council-04&candidate=kaohsiung-council-04-712cf4dd',1600,1000,1]
];
for (const [name, url, w, h, dpr] of views) {
  const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4321' + url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="city-explorer"][data-hydrated="true"]', { timeout: 30000 });
  await page.waitForTimeout(1600);
  console.log(name, await page.locator('body').getAttribute('data-scene-focus'), await page.locator('.profile-panel').count());
  await page.screenshot({ path: 'reports/visual/debug-' + name + '.png', timeout: 120000 });
  await context.close();
}
await browser.close();
