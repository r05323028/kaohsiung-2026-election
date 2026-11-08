import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const BASE='http://127.0.0.1:4321'; const out='tmp/diag-focus'; await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader']});
const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});
async function open(url,wait=6000){await page.goto(BASE+url,{waitUntil:'networkidle'});await page.locator('[data-testid="city-explorer"][data-hydrated="true"]').waitFor({timeout:30000});await page.locator('canvas').waitFor({timeout:30000});await page.waitForTimeout(wait);}
async function st(){return page.evaluate(()=>{const w=window.__kaohsiungWorld;const a=w?.actors?.().find(x=>x.slug==='hong-fang-long-2026');const c=w?.camera?.();return {cam:c,actor:a?{pos:a.position,district:a.currentAdminId,behavior:a.behavior,state:a.state}:null,focus:document.querySelector('[data-testid="city-explorer"]')?.getAttribute('data-scene-focus'),profile:!!document.querySelector('[data-testid="profile-panel"]')};});}
async function shot(n){await page.screenshot({path:out+'/'+n+'.png'});console.log(n,JSON.stringify(await st()));}
await open('/?admin=E03');
await shot('04-before-mayor-from-zuoying');
await page.locator('#candidate-search').fill('洪方隆'); await page.waitForTimeout(600);
await page.locator('.city-search__results .city-candidate').first().click(); await page.waitForTimeout(7000);
await shot('05-mayor-from-zuoying');
await page.getByRole('button',{name:'關閉人物資料'}).click(); await page.waitForTimeout(5000);
await shot('06-mayor-closed');
await open('/?admin=E03');
await page.locator('#candidate-search').fill('李雅芬'); await page.waitForTimeout(600);
await page.locator('.city-search__results .city-candidate').first().click(); await page.waitForTimeout(7000);
await shot('07-council-from-zuoying');
await browser.close();
