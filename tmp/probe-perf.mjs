import { chromium } from '@playwright/test';
const b=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
for (const path of ['/?perf=1','/?district=kaohsiung-council-04&perf=1']) {
 const c=await b.newContext({viewport:{width:1600,height:1000},reducedMotion:'reduce'});
 const p=await c.newPage();
 await p.goto('http://127.0.0.1:4322'+path,{waitUntil:'domcontentloaded'});
 await p.locator('[data-testid="city-explorer"][data-hydrated="true"]').waitFor({timeout:30000});
 await p.locator('canvas').waitFor({timeout:30000});
 await p.waitForTimeout(3500);
 console.log(path, await p.locator('[data-testid="city-explorer"]').getAttribute('data-scene-focus'), await p.evaluate(()=>window.__cityDiagnostics));
 await p.screenshot({path:'tmp/probe-'+path.replace(/[^a-z0-9]/g,'_')+'.png'});
 await c.close();
}
await b.close();
