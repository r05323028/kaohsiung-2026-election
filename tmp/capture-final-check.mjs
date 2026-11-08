import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true, args:['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport:{width:1600,height:1000}, reducedMotion:'reduce' });
const page = await context.newPage();
async function shot(url, name, advance) {
  await page.goto('http://127.0.0.1:4321' + url, { waitUntil:'domcontentloaded' });
  await page.locator('[data-testid="city-explorer"][data-hydrated="true"]').waitFor({timeout:30000});
  await page.locator('canvas').waitFor({timeout:30000});
  if (advance) await page.evaluate((s) => window.__kaohsiungWorld?.advance(s), advance);
  await page.waitForTimeout(6000);
  await page.screenshot({path:'tmp/' + name, timeout:120000});
  console.log(name, await page.locator('.city-app').getAttribute('data-scene-focus'));
}
await shot('/?district=kaohsiung-mayor-2026&candidate=zhang-jing-2026', 'final-mayor.png', 900);
await shot('/?district=kaohsiung-council-04&candidate=kaohsiung-council-04-712cf4dd', 'final-council.png', 360);
await shot('/', 'final-overview.png', 0);
await browser.close();
