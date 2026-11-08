import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true, args:['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport:{width:1600,height:1000}, reducedMotion:'reduce' });
const page = await context.newPage();
await page.goto('http://127.0.0.1:4321/?district=kaohsiung-mayor-2026&candidate=zhang-jing-2026', { waitUntil:'domcontentloaded' });
await page.locator('[data-testid="city-explorer"][data-hydrated="true"]').waitFor({timeout:30000});
await page.locator('canvas').waitFor({timeout:30000});
await page.waitForTimeout(2000);
const info = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  const keys = c ? Object.keys(c).filter(k=>k.toLowerCase().includes('r3f')||k.toLowerCase().includes('react')) : [];
  const root = c?.__r3f?.root?.getState?.();
  return { keys, hasRoot: !!root, camera: root ? {zoom: root.camera.zoom, pos: root.camera.position.toArray(), target: root.controls?.target?.toArray()} : null };
});
console.log(JSON.stringify(info));
await browser.close();
