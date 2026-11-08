import { chromium } from 'playwright';
const browser = await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page = await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,reducedMotion:'reduce'});
await page.goto('http://127.0.0.1:4321/');
await page.waitForSelector('[data-testid="city-explorer"][data-hydrated="true"]');
await page.waitForTimeout(1800);
await page.evaluate(() => document.querySelector('astro-dev-toolbar')?.remove());
await page.locator('[aria-controls="city-district-tray"]').click();
await page.waitForTimeout(250);
console.log('DISTRICT', await page.evaluate(() => {
  const pick = s => { const el=document.querySelector(s); if(!el) return null; const r=el.getBoundingClientRect(); const c=getComputedStyle(el); return {h:Math.round(r.height),w:Math.round(r.width),top:Math.round(r.top),bottom:Math.round(r.bottom),scrollH:el.scrollHeight,clientH:el.clientHeight,overflowY:c.overflowY,maxH:c.maxHeight}; };
  return {dock:pick('.city-dock'),tray:pick('#city-district-tray'),tabs:pick('.city-tray .city-tabs'),districts:pick('.city-tray .city-districts'),buttons:[...document.querySelectorAll('#city-district-tray .city-district')].map(e=>{const r=e.getBoundingClientRect();return {t:e.textContent.trim().slice(0,12),h:Math.round(r.height),top:Math.round(r.top),bottom:Math.round(r.bottom)}})};
}));
await page.locator('[aria-controls="city-district-tray"]').click();
await page.locator('[aria-controls="city-people-tray"]').click();
await page.waitForTimeout(250);
console.log('PEOPLE', await page.evaluate(() => {
  const pick = s => { const el=document.querySelector(s); if(!el) return null; const r=el.getBoundingClientRect(); const c=getComputedStyle(el); return {h:Math.round(r.height),top:Math.round(r.top),bottom:Math.round(r.bottom),scrollH:el.scrollHeight,clientH:el.clientHeight,overflowY:c.overflowY,maxH:c.maxHeight}; };
  return {dock:pick('.city-dock'),tray:pick('#city-people-tray'),list:pick('.city-people-list'),rows:[...document.querySelectorAll('#city-people-tray .city-candidate')].slice(0,5).map(e=>{const r=e.getBoundingClientRect();return {h:Math.round(r.height),top:Math.round(r.top),bottom:Math.round(r.bottom)}})};
}));
await browser.close();
