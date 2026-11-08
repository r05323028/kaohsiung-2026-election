import { chromium } from '@playwright/test';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const shots = [
  ['overview3','/?district=kaohsiung-council-04'],
  ['pagodas3','/?district=kaohsiung-council-04&focus=dragon-tiger-pagodas'],
  ['park3','/?district=kaohsiung-council-04&focus=metropolitan-park'],
  ['river3','/?district=kaohsiung-council-04&focus=houjing-river'],
  ['street3','/?district=kaohsiung-council-04&focus=zuoying-old-street']
];
for (const [name, url] of shots) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.on('pageerror', e => console.log('[pageerror]', name, e.message));
  await page.goto('http://127.0.0.1:4321' + url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="city-explorer"][data-hydrated="true"]', { timeout: 30000 });
  await page.waitForTimeout(2500);
  console.log(name, await page.evaluate(() => ({ zoom: window.__cityCamera?.zoom, focus: document.body.dataset.cameraFocus })));
  await page.screenshot({ path: 'reports/visual/debug-' + name + '.png', timeout: 120000 });
  await context.close();
}
await browser.close();
