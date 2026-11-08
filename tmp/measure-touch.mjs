import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
const page = await context.newPage();
await page.goto('http://127.0.0.1:4321/?district=kaohsiung-council-04', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid="city-explorer"][data-hydrated="true"]');
await page.waitForTimeout(1500);
for (const sel of ['.city-search', '.city-icon-button', '.city-dock__toggle', '.city-zones button', '.city-dock', '.city-brand', '.city-brand__title']) {
  const box = await page.locator(sel).first().boundingBox();
  console.log(sel, box && { w: Math.round(box.width), h: Math.round(box.height) });
}
await page.locator('[aria-controls="city-people-tray"]').click();
await page.waitForTimeout(300);
for (const sel of ['.city-tray__close', '.city-tabs button', '.city-district', '.city-candidate']) {
  const box = await page.locator(sel).first().boundingBox();
  console.log('tray', sel, box && { w: Math.round(box.width), h: Math.round(box.height) });
}
const focus = await page.evaluate(() => { const el = document.querySelector('.city-search input'); el?.focus(); const s = getComputedStyle(el); return { outline: s.outline, boxShadow: getComputedStyle(el.parentElement).boxShadow }; });
console.log('search focus', focus);
await browser.close();
