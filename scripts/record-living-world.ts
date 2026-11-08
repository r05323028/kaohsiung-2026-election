/**
 * Record a short living-world walkthrough against a running preview.
 *
 * Usage:
 *   CAPTURE_BASE_URL=http://127.0.0.1:4323 npx tsx scripts/record-living-world.ts
 *
 * Headless Chromium uses SwiftShader. Motion is slow but the interaction
 * sequence, graph walking and follow camera are real. The recording is
 * behavioural evidence for a fictional simulation, not a campaign itinerary.
 */
import { mkdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const baseURL = process.env.CAPTURE_BASE_URL ?? 'http://127.0.0.1:4321';
const outDir = join(process.cwd(), 'reports', 'visual', 'living-world');
mkdirSync(outDir, { recursive: true });

const COUNCIL = 'kaohsiung-council-04-23bd0041';

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const context = await browser.newContext({
  viewport: { width: 1024, height: 640 },
  reducedMotion: 'no-preference',
  recordVideo: {
    dir: join(process.cwd(), 'tmp', 'living-world-video'),
    size: { width: 1024, height: 640 },
  },
});
const page = context.pages()[0] ?? (await context.newPage());
const video = page.video();

await page.goto(
  `${baseURL}/?district=kaohsiung-council-04&candidate=${COUNCIL}`,
  { waitUntil: 'domcontentloaded' },
);
await page
  .locator('[data-testid="city-explorer"][data-hydrated="true"]')
  .waitFor({ timeout: 30_000 });
await page.locator('canvas').waitFor({ timeout: 30_000 });
await page.waitForTimeout(8_000);

// Let the selected council-04 actor walk and follow with the camera.
await page.evaluate(() => {
  // SAFETY: CityScene installs this test bridge after the canvas mounts.
  const world = (
    window as Window & {
      __kaohsiungWorld?: { advance: (seconds: number) => void };
    }
  ).__kaohsiungWorld;
  world?.advance(420);
});
await page.waitForTimeout(6_000);

// Close the profile and show the world-to-hero streaming transition.
await page.keyboard.press('Escape');
await page.waitForTimeout(2_000);
await page.locator('.city-zones button').filter({ hasText: '全城' }).click();
await page.waitForTimeout(4_000);
await page.locator('.city-zones button').filter({ hasText: '左營' }).click();
await page.waitForTimeout(6_000);

// Re-open the same actor after the scene switch to show persistence.
await page.locator('#candidate-search').fill('李雅芬');
await page.locator('.city-search__results button').first().click();
await page.waitForTimeout(6_000);
await page.evaluate(() => {
  const world = (
    window as Window & {
      __kaohsiungWorld?: { advance: (seconds: number) => void };
    }
  ).__kaohsiungWorld;
  world?.advance(120);
});
await page.waitForTimeout(5_000);

await context.close();
await browser.close();

if (!video) throw new Error('Playwright did not record a video');
const recorded = await video.path();
const target = join(outDir, 'walkthrough.webm');
rmSync(target, { force: true });
renameSync(recorded, target);
console.log(`Wrote ${target}`);
