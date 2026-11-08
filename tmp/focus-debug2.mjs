import { chromium } from 'playwright';
const browser = await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page = await browser.newPage({viewport:{width:1280,height:720}});
await page.goto('http://127.0.0.1:4321/');
await page.waitForSelector('[data-testid="city-explorer"][data-hydrated="true"]');
const active = async (label) => console.log(label, await page.evaluate(() => ({tag: document.activeElement?.tagName, cls: document.activeElement?.className, label: document.activeElement?.getAttribute('aria-label'), text: document.activeElement?.textContent?.slice(0,50)})));
await page.locator('[aria-controls="city-people-tray"]').click();
await page.getByRole('button',{name:/林海星/}).first().click();
const close = page.getByRole('button',{name:'關閉人物資料'});
await close.waitFor({state:'visible'});
await active('close visible');
console.log('focused close?', await close.evaluate(el=>el===document.activeElement));
await page.keyboard.press('Escape');
await page.locator('.profile-panel.is-open').waitFor({state:'hidden'});
await active('after esc immediate');
for (const ms of [20,60,120,300,700,1500]) { await page.waitForTimeout(ms); await active('after '+ms); }
await browser.close();
