import { chromium } from 'playwright';
const browser = await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page = await browser.newPage({viewport:{width:1280,height:720}});
page.on('console', m => { if (m.text().includes('[close]')||m.text().includes('[focus effect]')) console.log('CONSOLE', m.text()); });
await page.goto('http://127.0.0.1:4321/');
await page.waitForSelector('[data-testid="city-explorer"][data-hydrated="true"]');
await page.locator('[aria-controls="city-people-tray"]').click();
await page.getByRole('button',{name:/林海星/}).first().click();
const close = page.getByRole('button',{name:'關閉人物資料'});
await close.waitFor({state:'visible'});
await page.waitForTimeout(200);
console.log('before esc active', await page.evaluate(()=>document.activeElement?.className));
await page.keyboard.press('Escape');
for (const ms of [0,20,80,200,500,1200]) { await page.waitForTimeout(ms); console.log('after '+ms, await page.evaluate(()=>document.activeElement?.className + ' ' + document.activeElement?.getAttribute('aria-label'))); }
await browser.close();
