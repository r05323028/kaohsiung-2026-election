import { chromium } from 'playwright';

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const base = 'http://127.0.0.1:4321';

async function shot(name, { width, height, dpr = 1, url }) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: dpr,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  await page.goto(base + url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="city-explorer"][data-hydrated="true"]');
  await page.waitForSelector('canvas');
  await page.waitForTimeout(2400);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.screenshot({ path: `reports/visual/debug-fixes-${name}.png`, timeout: 120000 });
  console.log(name, await page.locator('[data-scene-focus]').getAttribute('data-scene-focus'));
  await context.close();
}

await shot('river', { width: 1600, height: 1000, url: '/?district=kaohsiung-council-04&focus=houjing-river' });
await shot('overview', { width: 1600, height: 1000, url: '/?district=kaohsiung-council-04' });
await shot('mobile', { width: 390, height: 844, dpr: 2, url: '/?district=kaohsiung-council-04' });

const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
const page = await context.newPage();
await page.goto(base + '/?district=kaohsiung-council-04', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid="city-explorer"][data-hydrated="true"]');
await page.locator('[aria-controls="city-people-tray"]').click();
await page.waitForTimeout(500);
await page.screenshot({ path: 'reports/visual/debug-fixes-mobile-tray.png', timeout: 120000 });
await context.close();
await browser.close();
