import { chromium } from 'playwright';
const browser = await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page = await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,reducedMotion:'reduce'});
await page.goto('http://127.0.0.1:4321/?district=kaohsiung-council-04');
await page.waitForSelector('[data-testid="city-explorer"][data-hydrated="true"]');
await page.waitForTimeout(2000);
await page.evaluate(() => document.querySelector('astro-dev-toolbar')?.remove());
await page.locator('[aria-controls="city-people-tray"]').click();
await page.waitForTimeout(300);
await page.screenshot({path:'tmp/mobile-people12.png'});
const dims = await page.evaluate(() => {
  const list = document.querySelector('#city-people-tray .city-candidates__list');
  const tray = document.querySelector('#city-people-tray');
  const rows = [...document.querySelectorAll('#city-people-tray .city-candidate')];
  const r = el => { const b=el.getBoundingClientRect(); return {w:Math.round(b.width),h:Math.round(b.height),top:Math.round(b.top),bottom:Math.round(b.bottom)}; };
  return {tray:r(tray), list:r(list), listScroll:list.scrollHeight, listClient:list.clientHeight, rows:rows.slice(0,8).map(r)};
});
console.log(JSON.stringify(dims,null,2));
await browser.close();
