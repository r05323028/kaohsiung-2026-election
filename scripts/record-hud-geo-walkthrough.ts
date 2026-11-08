/**
 * Record HUD and geographic-continuity walkthroughs against a running dev server.
 *
 * Usage:
 *   npx tsx scripts/record-hud-geo-walkthrough.ts
 *
 * Headless Chromium uses SwiftShader here, so this records layout and camera
 * behaviour, not hardware-GPU frame rate.
 */
import { mkdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const baseURL = process.env.CAPTURE_BASE_URL ?? 'http://127.0.0.1:4321';
const outDir = join(process.cwd(), 'reports', 'visual', 'hud-geo', 'after');
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

async function ready(page: import('@playwright/test').Page, url: string) {
  await page.goto(baseURL + url, { waitUntil: 'domcontentloaded' });
  await page
    .locator('[data-testid="city-explorer"][data-hydrated="true"]')
    .waitFor({ timeout: 45_000 });
  await page.locator('canvas').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(3_000);
}

async function saveVideo(
  context: import('@playwright/test').BrowserContext,
  page: import('@playwright/test').Page,
  name: string,
) {
  const video = page.video();
  if (!video) throw new Error('Playwright did not record a video');
  await context.close();
  const recorded = await video.path();
  const target = join(outDir, name);
  rmSync(target, { force: true });
  renameSync(recorded, target);
  console.log(`Wrote ${target}`);
}

const desktopContext = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  reducedMotion: 'no-preference',
  recordVideo: {
    dir: join(process.cwd(), 'tmp', 'hud-geo-desktop-video'),
    size: { width: 1600, height: 1000 },
  },
});
const desktop = desktopContext.pages()[0] ?? (await desktopContext.newPage());
await ready(desktop, '/');
await desktop.waitForTimeout(2_000);

for (const district of ['左營', '楠梓']) {
  await desktop.locator('[aria-controls="city-admin-tray"]').click();
  await desktop.locator('#city-admin-tray').waitFor({ state: 'visible' });
  await desktop.waitForTimeout(800);
  await desktop
    .locator('#city-admin-tray .city-admin-chip')
    .filter({ hasText: district })
    .first()
    .click();
  await desktop.waitForTimeout(8_000);
}

await ready(desktop, '/?debug=boundaries&admin=E03');
await desktop.waitForTimeout(5_000);
console.log(
  'desktop',
  JSON.stringify({
    brand: await desktop.locator('.city-brand__title').textContent(),
    nav: await desktop.locator('.city-nav--desktop a').count(),
    debugLabels: await desktop.locator('.world-debug-label').count(),
  }),
);
await saveVideo(desktopContext, desktop, 'walkthrough-desktop.webm');

const mobileContext = await browser.newContext({
  viewport: { width: 390, height: 844 },
  reducedMotion: 'no-preference',
  isMobile: true,
  hasTouch: true,
  recordVideo: {
    dir: join(process.cwd(), 'tmp', 'hud-geo-mobile-video'),
    size: { width: 390, height: 844 },
  },
});
const mobile = mobileContext.pages()[0] ?? (await mobileContext.newPage());
await ready(mobile, '/');
const menuButton = mobile.getByRole('button', { name: '開啟網站選單' });
await menuButton.click();
await mobile.waitForTimeout(2_500);
await mobile.keyboard.press('Escape');
await mobile.waitForTimeout(1_000);
await ready(mobile, '/?admin=E03');
await mobile.waitForTimeout(5_000);
console.log(
  'mobile',
  JSON.stringify({
    brand: await mobile.locator('.city-brand__title').textContent(),
    focus: await mobile
      .locator('[data-testid="city-explorer"]')
      .getAttribute('data-scene-focus'),
  }),
);
await saveVideo(mobileContext, mobile, 'walkthrough-mobile.webm');

await browser.close();
