import { chromium } from '@playwright/test';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
const page = await context.newPage();
await page.goto('http://127.0.0.1:4321/?district=kaohsiung-council-04', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid="city-explorer"][data-hydrated="true"]');
await page.waitForTimeout(1200);
for (const pt of [[195, 820], [195, 835], [195, 843], [195, 790], [195, 760]]) {
  const out = await page.evaluate(([x,y]) => {
    const el = document.elementFromPoint(x,y);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { tag: el.tagName, cls: el.className?.toString().slice(0,100), txt: el.textContent?.trim().slice(0,60), rect: [r.left,r.top,r.width,r.height].map(Math.round), bg: cs.backgroundColor, z: cs.zIndex, pos: cs.position };
  }, pt);
  console.log(pt, JSON.stringify(out));
}
await browser.close();
