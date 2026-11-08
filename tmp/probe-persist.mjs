import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();
page.on('console', m => { if (m.type()==='error') console.log('ERR', m.text()); });
page.on('pageerror', e => console.log('PAGEERR', e.message));
await page.goto('http://127.0.0.1:4321/?district=kaohsiung-council-04&candidate=kaohsiung-council-04-712cf4dd');
await page.waitForSelector('[data-testid="city-explorer"][data-hydrated="true"]');
await page.waitForTimeout(3000);
console.log('focus before', await page.locator('[data-testid="city-explorer"]').getAttribute('data-scene-focus'));
await page.getByRole('button', { name: '關閉人物資料' }).click();
await page.waitForTimeout(300);
console.log('focus closed', await page.locator('[data-testid="city-explorer"]').getAttribute('data-scene-focus'));
await page.locator('[aria-controls="city-admin-tray"]').click();
await page.waitForTimeout(300);
console.log('tray visible', await page.locator('#city-admin-tray').isVisible());
await page.locator('#city-admin-tray .city-admin-chip').filter({ hasText: '楠梓' }).click();
for (let i=0;i<10;i++) {
  await page.waitForTimeout(500);
  console.log(i, 'focus', JSON.stringify(await page.locator('[data-testid="city-explorer"]').getAttribute('data-scene-focus')), 'admin', await page.locator('.city-admin-card h2').count() ? await page.locator('.city-admin-card h2').innerText() : '-');
}
console.log('html attr', await page.locator('[data-testid="city-explorer"]').evaluate(e => e.getAttribute('data-scene-focus')));
await browser.close();
