import { chromium } from '@playwright/test';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, reducedMotion: 'reduce' });
const page = await context.newPage();
await page.goto('http://127.0.0.1:4321/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid="city-explorer"][data-hydrated="true"]');
await page.getByLabel('搜尋人物').fill('林海星');
await page.waitForTimeout(500);
const out = await page.evaluate(() => {
  const results = document.querySelector('.city-search__results');
  if (!results) return { results: null, inputs: document.querySelectorAll('#candidate-search').length };
  const buttons = [...results.querySelectorAll('button')].map(b => ({ text: b.textContent?.trim().slice(0,60), name: b.getAttribute('aria-label'), rect: (()=>{const r=b.getBoundingClientRect();return [r.left,r.top,r.width,r.height].map(Math.round);})(), display: getComputedStyle(b).display, vis: getComputedStyle(b).visibility }));
  const r = results.getBoundingClientRect();
  return { count: results.textContent?.trim().slice(0,100), rect: [r.left,r.top,r.width,r.height].map(Math.round), display: getComputedStyle(results).display, overflow: getComputedStyle(results).overflow, z: getComputedStyle(results).zIndex, buttons };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
