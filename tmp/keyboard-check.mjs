import { chromium } from '@playwright/test';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
await page.goto('http://127.0.0.1:4322/?district=kaohsiung-council-04', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid="city-explorer"][data-hydrated="true"]');
await page.waitForSelector('canvas');
const seen = [];
for (let i = 0; i < 14; i += 1) {
  await page.keyboard.press('Tab');
  const info = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el) return null;
    const s = getComputedStyle(el);
    return { tag: el.tagName, text: (el.textContent ?? '').trim().slice(0, 32), label: el.getAttribute('aria-label'), role: el.getAttribute('role'), outline: s.outlineStyle + ' ' + s.outlineWidth + ' ' + s.outlineColor };
  });
  seen.push(info);
}
console.log(JSON.stringify(seen, null, 2));
const overflow = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, bodyOverflow: getComputedStyle(document.body).overflow }));
console.log('desktop overflow', overflow);
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
await mobile.goto('http://127.0.0.1:4322/?district=kaohsiung-council-04', { waitUntil: 'domcontentloaded' });
await mobile.waitForSelector('[data-testid="city-explorer"][data-hydrated="true"]');
await mobile.waitForSelector('canvas');
console.log('mobile overflow', await mobile.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, scrollHeight: document.documentElement.scrollHeight, innerHeight: window.innerHeight })));
await browser.close();
