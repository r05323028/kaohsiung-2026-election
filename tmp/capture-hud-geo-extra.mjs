import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const out='reports/visual/hud-geo/after';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader']});
const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});
const slug='kaohsiung-council-04-23bd0041';
await page.goto('http://127.0.0.1:4321/?district=kaohsiung-council-04&candidate='+slug,{waitUntil:'domcontentloaded'});
await page.locator('[data-testid="city-explorer"][data-hydrated="true"]').waitFor({timeout:45000});
await page.locator('[data-testid="scene-frame"] canvas').waitFor({timeout:45000});
await page.waitForTimeout(7000);
await page.screenshot({path:out+'/07-candidate-focus.png'});
console.log('focus',await page.locator('[data-testid="city-explorer"]').getAttribute('data-scene-focus'));
let current=await page.evaluate((s)=>{
  const w=window;
  const actor=w.__kaohsiungWorld?.actors().find((a)=>a.slug===s);
  return actor?.currentAdminId;
},slug);
console.log('start district',current);
for(let i=0;i<24 && current!=='E04';i++){
  await page.evaluate(()=>window.__kaohsiungWorld?.advance(300));
  await page.waitForTimeout(80);
  current=await page.evaluate((s)=>window.__kaohsiungWorld?.actors().find((a)=>a.slug===s)?.currentAdminId,slug);
}
await page.waitForTimeout(3000);
await page.screenshot({path:out+'/11-council-crossing-nanzih.png'});
const evidence=await page.evaluate((s)=>{
  const a=window.__kaohsiungWorld?.actors().find((x)=>x.slug===s);
  const c=window.__kaohsiungWorld?.camera();
  return {currentAdminId:a?.currentAdminId,behavior:a?.behavior,position:a?.position,districtTransitions:a?.districtTransitions,blockedTransitions:a?.blockedTransitions,camera:c};
},slug);
console.log('crossing',JSON.stringify(evidence));
await browser.close();