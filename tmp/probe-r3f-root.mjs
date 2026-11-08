import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true, args:['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport:{width:1600,height:1000}, reducedMotion:'reduce' });
const page = await context.newPage();
await page.goto('http://127.0.0.1:4321/?district=kaohsiung-mayor-2026&candidate=zhang-jing-2026', { waitUntil:'domcontentloaded' });
await page.locator('[data-testid="city-explorer"][data-hydrated="true"]').waitFor({timeout:30000});
await page.locator('canvas').waitFor({timeout:30000});
await page.waitForTimeout(2500);
console.log(await page.evaluate(() => {
  const c = document.querySelector('canvas');
  const keys = Object.keys(c).filter(k=>k.toLowerCase().includes('r3f')||k.toLowerCase().includes('root')||k.startsWith('__'));
  const g = window.__heroGroup;
  const root = c.__r3f?.root;
  let state = null;
  try { state = root?.getState?.() ?? c.__r3f?.store?.getState?.() ?? null; } catch(e) { state = String(e); }
  return JSON.stringify({keys, hasRoot: !!root, state: state ? {frameloop:state.frameloop, camPos:state.camera?.position?.toArray(), camZoom:state.camera?.zoom, sceneSame:state.scene===g?.parent, sceneChildren:state.scene?.children?.length, size:state.size, viewport:state.viewport} : null});
}));
await browser.close();
