import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true, args:['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport:{width:1600,height:1000}, reducedMotion:'reduce' });
const page = await context.newPage();
await page.goto('http://127.0.0.1:4321/?district=kaohsiung-mayor-2026&candidate=zhang-jing-2026', { waitUntil:'domcontentloaded' });
await page.locator('[data-testid="city-explorer"][data-hydrated="true"]').waitFor({timeout:30000});
await page.locator('canvas').waitFor({timeout:30000});
await page.waitForTimeout(2500);
console.log(await page.evaluate(() => {
  const st = window.__r3fState;
  return JSON.stringify({ frameloop: st?.frameloop, cameraSame: st?.camera === window.__cityCamera, sceneSame: st?.scene === window.__cityScene, camZoom: st?.camera?.zoom, proj: st?.camera?.projectionMatrix?.elements?.slice(0,4) });
}));
await page.evaluate(() => { window.__r3fState?.invalidate(); });
await page.waitForTimeout(1200);
await page.screenshot({path:'tmp/massing-mayor4.png', timeout:120000});
await browser.close();
