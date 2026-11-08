import { chromium } from '@playwright/test';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.goto('http://127.0.0.1:4321/?district=kaohsiung-council-04&focus=lotus-pond', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid="city-explorer"][data-hydrated="true"]', { timeout: 30000 });
for (const wait of [3000, 3000, 5000, 8000]) {
  await page.waitForTimeout(wait);
  console.log(await page.evaluate(() => ({ zoom: window.__cityCamera?.zoom?.toFixed(3), enabled: window.__cityControls?.enabled, ticks: document.body.dataset.cameraTick, t: Math.round(performance.now()) })));
}
await page.screenshot({ path: 'reports/visual/debug-focus-lotus4.png', timeout: 120000 });
await browser.close();
