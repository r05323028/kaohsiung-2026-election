import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();
await page.goto('http://127.0.0.1:4321/?candidate=kaohsiung-council-04-712cf4dd', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid="city-explorer"][data-hydrated="true"]', { timeout: 30000 });
await page.waitForTimeout(2600);
await page.screenshot({ path: 'reports/visual/debug-candidate-follow3.png', timeout: 120000 });
await browser.close();
