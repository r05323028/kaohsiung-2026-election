import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true, args:['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport:{width:1600,height:1000}, reducedMotion:'reduce' });
const page = await context.newPage();
await page.goto('http://127.0.0.1:4321/?district=kaohsiung-mayor-2026&candidate=zhang-jing-2026', { waitUntil:'domcontentloaded' });
await page.locator('[data-testid="city-explorer"][data-hydrated="true"]').waitFor({timeout:30000});
await page.locator('canvas').waitFor({timeout:30000});
await page.waitForTimeout(2500);
const before = await page.evaluate(() => ({ frame: window.__cityGL.info.render.frame, calls: window.__cityGL.info.render.calls }));
await page.waitForTimeout(1500);
const after = await page.evaluate(() => ({ frame: window.__cityGL.info.render.frame, calls: window.__cityGL.info.render.calls }));
console.log(JSON.stringify({before, after}));
// manually render and screenshot
await page.evaluate(() => { const g=window.__heroGroup; g.parent.updateMatrixWorld(true); window.__cityGL.render(window.__cityScene, window.__cityCamera); });
await page.screenshot({path:'tmp/massing-mayor3.png', timeout:120000});
await browser.close();
