import { chromium } from '@playwright/test';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
for (const [name, url] of [
  ['pagodas4','/?district=kaohsiung-council-04&focus=dragon-tiger-pagodas'],
  ['park4','/?district=kaohsiung-council-04&focus=metropolitan-park'],
  ['overview4','/?district=kaohsiung-council-04']
]) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('http://127.0.0.1:4321' + url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="city-explorer"][data-hydrated="true"]', { timeout: 30000 });
  await page.waitForTimeout(2200);
  console.log(name, errors.slice(0,2));
  await page.screenshot({ path: 'reports/visual/debug-' + name + '.png', timeout: 120000 });
  await context.close();
}
await browser.close();
