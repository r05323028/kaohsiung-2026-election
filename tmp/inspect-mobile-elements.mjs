import { chromium } from '@playwright/test';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
const page = await context.newPage();
await page.goto('http://127.0.0.1:4321/?district=kaohsiung-council-04', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid="city-explorer"][data-hydrated="true"]');
await page.waitForTimeout(1500);
const info = await page.evaluate(() => {
  const els = [...document.querySelectorAll('body *')].filter(el => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.height > 10 && r.width > 10 && r.bottom > innerHeight - 120 && cs.position !== 'static' && cs.display !== 'none';
  });
  return els.map(el => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { tag: el.tagName, cls: el.className?.toString().slice(0,80), id: el.id, top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height), z: cs.zIndex, pos: cs.position, transform: cs.transform.slice(0,40), text: el.textContent?.trim().slice(0,40) };
  }).slice(0,40);
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
