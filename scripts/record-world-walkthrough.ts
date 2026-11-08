/**
 * Record a short unified-world walkthrough against a running preview.
 *
 * Usage:
 *   CAPTURE_BASE_URL=http://127.0.0.1:4322 npx tsx scripts/record-world-walkthrough.ts
 *
 * The headless browser uses SwiftShader, so motion is slow but the interaction
 * sequence and camera/follow behaviour are real.
 */
import { mkdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const baseURL = process.env.CAPTURE_BASE_URL ?? 'http://127.0.0.1:4321';
const outDir = join(process.cwd(), 'reports', 'visual', 'world');
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const context = await browser.newContext({
  viewport: { width: 1024, height: 640 },
  reducedMotion: 'no-preference',
  recordVideo: {
    dir: join(process.cwd(), 'tmp', 'world-video'),
    size: { width: 1024, height: 640 },
  },
});
const page = context.pages()[0] ?? (await context.newPage());
const video = page.video();

await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
await page
  .locator('[data-testid="city-explorer"][data-hydrated="true"]')
  .waitFor({ timeout: 30_000 });
await page.locator('canvas').waitFor({ timeout: 30_000 });
await page.waitForTimeout(4_000);

await page.locator('[aria-controls="city-admin-tray"]').click();
await page.locator('#city-admin-tray').waitFor({ state: 'visible' });
await page.waitForTimeout(2_000);
await page
  .locator('#city-admin-tray .city-admin-chip')
  .filter({ hasText: '左營' })
  .first()
  .click();
await page.waitForTimeout(15_000);

await page.locator('[aria-controls="city-people-tray"]').click();
await page.locator('#city-people-tray').waitFor({ state: 'visible' });
await page.waitForTimeout(1_500);
await page.locator('#city-people-tray .city-candidate').first().click();
await page.locator('.profile-panel').waitFor({ state: 'visible' });
await page.waitForTimeout(13_000);

await page.evaluate(() => {
  // SAFETY: CityScene installs this test bridge after the canvas mounts.
  const world = (
    window as Window & {
      __kaohsiungWorld?: { advance: (seconds: number) => void };
    }
  ).__kaohsiungWorld;
  world?.advance(180);
});
await page.waitForTimeout(7_000);

await page.keyboard.press('Escape');
await page.waitForTimeout(3_000);
await page.locator('[aria-controls="city-admin-tray"]').click();
await page.waitForTimeout(1_500);
await page
  .locator('#city-admin-tray .city-admin-chip')
  .filter({ hasText: '桃源' })
  .first()
  .click();
await page.waitForTimeout(15_000);

await context.close();
await browser.close();

if (!video) throw new Error('Playwright did not record a video');
const recorded = await video.path();
const target = join(outDir, 'walkthrough.webm');
rmSync(target, { force: true });
renameSync(recorded, target);
console.log(`Wrote ${target}`);
