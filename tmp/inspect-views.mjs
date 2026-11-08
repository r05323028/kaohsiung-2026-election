import { chromium } from '@playwright/test';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const shots = [
  ['02-lotus-pond','/?district=kaohsiung-council-04&focus=lotus-pond',1600,1000],
  ['03-dragon-tiger-pagodas','/?district=kaohsiung-council-04&focus=dragon-tiger-pagodas',1600,1000],
  ['04-zuoying-neighborhood','/?district=kaohsiung-council-04&focus=zuoying-old-street',1600,1000],
  ['09-mobile','/?district=kaohsiung-council-04',390,844]
];
for (const [name, url, width, height] of shots) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: name === '09-mobile' ? 2 : 1 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('http://127.0.0.1:4321' + url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="city-explorer"][data-hydrated="true"]', { timeout: 30000 });
  await page.waitForTimeout(4000);
  console.log(name, 'errors', errors.slice(0,4));
  await page.screenshot({ path: 'reports/visual/debug-' + name + '.png', timeout: 120000 });
  await page.close();
}
await browser.close();