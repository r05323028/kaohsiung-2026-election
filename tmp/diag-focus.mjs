import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const BASE='http://127.0.0.1:4321';
const out='tmp/diag-focus';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader']});
const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});
const errors=[]; page.on('console',m=>{if(m.type()==='error') errors.push(m.text())}); page.on('pageerror',e=>errors.push('pageerror: '+e.message));
async function open(url,wait=6500){await page.goto(BASE+url,{waitUntil:'networkidle'});await page.locator('[data-testid="city-explorer"][data-hydrated="true"]').waitFor({timeout:30000});await page.locator('canvas').waitFor({timeout:30000});await page.waitForTimeout(wait);}
async function state(){return page.evaluate(()=>{const w=window.__kaohsiungWorld; const a=w?.actors?.().find(x=>x.slug==='hong-fang-long-2026'); const c=w?.camera?.(); return {cam:c,actor:a?{pos:a.position,district:a.currentAdminId,behavior:a.behavior,heading:a.heading,state:a.state,elapsed:a.elapsedSeconds}:null,focus:document.querySelector('[data-testid="city-explorer"]')?.getAttribute('data-scene-focus'),profile:!!document.querySelector('[data-testid="profile-panel"]'),body:document.body.className};});}
async function shot(name){await page.screenshot({path:out+'/'+name+'.png'});console.log(name,JSON.stringify(await state()));}
await open('/?candidate=hong-fang-long-2026');
await shot('01-mayor-direct');
await open('/?admin=E03');
const before=await state(); console.log('council-before',JSON.stringify(before));
await open('/?candidate=kaohsiung-council-04-23bd0041');
await shot('02-council-direct');
await open('/');
await page.evaluate(()=>window.__kaohsiungWorld?.advance?.(900));
await page.waitForTimeout(1500);
await page.locator('#candidate-search').fill('洪方隆');
await page.waitForTimeout(600);
const matches=await page.locator('.city-search__results .city-candidate').count(); console.log('matches',matches);
await page.locator('.city-search__results .city-candidate').first().click();
await page.waitForTimeout(6500);
await shot('03-mayor-after-900s');
console.log('errors',JSON.stringify(errors));
await browser.close();
