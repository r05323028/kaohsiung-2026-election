import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true, args:['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport:{width:1600,height:1000}, reducedMotion:'reduce' });
const page = await context.newPage();
await page.goto('http://127.0.0.1:4321/?district=kaohsiung-mayor-2026&candidate=zhang-jing-2026', { waitUntil:'domcontentloaded' });
await page.locator('[data-testid="city-explorer"][data-hydrated="true"]').waitFor({timeout:30000});
await page.locator('canvas').waitFor({timeout:30000});
await page.waitForTimeout(2500);
console.log(await page.evaluate(() => {
  const g = window.__heroGroup;
  const scene = window.__cityScene;
  return JSON.stringify({ sameScene: g?.parent === scene, heroParentChildren: g?.parent?.children?.length, citySceneChildren: scene?.children?.length, heroInCityScene: scene?.children?.includes(g), citySceneHasHero: scene?.children?.some(c=>c===g), sceneUuid: scene?.uuid, heroParentUuid: g?.parent?.uuid, camUuid: window.__cityCamera?.uuid, glUuid: window.__cityGL?.domElement?.uuid });
}));
await browser.close();
