import { chromium } from 'playwright';
const browser = await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page = await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,reducedMotion:'reduce'});
await page.goto('http://127.0.0.1:4321/');
await page.waitForSelector('[data-testid="city-explorer"][data-hydrated="true"]');
await page.waitForTimeout(1800);
await page.evaluate(() => document.querySelector('astro-dev-toolbar')?.remove());
await page.locator('[aria-controls="city-people-tray"]').click();
await page.locator('#city-people-tray .city-candidate').first().click();
await page.waitForSelector('.profile-panel.is-open .tab-button');
await page.waitForTimeout(250);
await page.screenshot({path:'tmp/mobile-profile-panel.png'});
const profileMetrics = await page.evaluate(() => ({
  scrollWidth: document.documentElement.scrollWidth,
  innerWidth: window.innerWidth,
  close: (() => { const e=document.querySelector('.profile-panel__close'); const r=e.getBoundingClientRect(); return {w:r.width,h:r.height}; })(),
  tabs: [...document.querySelectorAll('.profile-panel .tab-button')].map(e=>{const r=e.getBoundingClientRect();return {t:e.textContent.trim(),w:r.width,h:r.height};}),
}));
console.log('profile', JSON.stringify(profileMetrics));
await page.locator('.profile-panel__close').click();
await page.getByRole('button',{name:'顯示與體驗設定'}).click();
await page.waitForTimeout(200);
await page.screenshot({path:'tmp/mobile-settings-panel.png'});
const settingsMetrics = await page.evaluate(() => ({
  close: (() => { const e=document.querySelector('.city-settings__head button'); const r=e.getBoundingClientRect(); return {w:r.width,h:r.height}; })(),
  quality: [...document.querySelectorAll('.city-settings__quality button')].map(e=>{const r=e.getBoundingClientRect();return {w:r.width,h:r.height};}),
  toggle: (() => { const e=document.querySelector('.city-settings__toggle'); const r=e.getBoundingClientRect(); return {w:r.width,h:r.height}; })(),
  reset: (() => { const e=document.querySelector('.city-settings__reset'); const r=e.getBoundingClientRect(); return {w:r.width,h:r.height}; })(),
}));
console.log('settings', JSON.stringify(settingsMetrics));
await page.getByRole('button',{name:'關閉設定'}).click();
await page.getByLabel('搜尋人物').fill('林');
await page.waitForTimeout(150);
await page.screenshot({path:'tmp/mobile-search-clear.png'});
const searchMetrics = await page.evaluate(() => ({
  scrollWidth: document.documentElement.scrollWidth,
  innerWidth: window.innerWidth,
  clear: (() => { const e=document.querySelector('.city-search__clear'); const r=e.getBoundingClientRect(); return {w:r.width,h:r.height}; })(),
  topbar: (() => { const e=document.querySelector('.city-topbar'); const r=e.getBoundingClientRect(); return {w:r.width,h:r.height}; })(),
}));
console.log('search', JSON.stringify(searchMetrics));
await browser.close();
