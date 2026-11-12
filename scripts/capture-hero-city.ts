/**
 * City-scale verification shots for the hero landmarks.
 * Usage: CAPTURE_BASE_URL=http://127.0.0.1:4400 npx tsx scripts/capture-hero-city.ts --label after
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page } from '@playwright/test';

const label = process.argv.includes('--label')
  ? (process.argv[process.argv.indexOf('--label') + 1] ?? 'capture')
  : 'capture';
const baseURL = process.env.CAPTURE_BASE_URL ?? 'http://127.0.0.1:4321';
const outDir = join(process.cwd(), 'reports', 'visual', 'landmarks', label + '-city');
mkdirSync(outDir, { recursive: true });

const shots = [
  { name: 'E03-zuoying', admin: 'E03' },
  { name: 'E08-lingya-85tower', admin: 'E08' },
  { name: 'E09-qianzhen-dreammall', admin: 'E09' },
  { name: 'E12-fengshan-weiwuying', admin: 'E12' },
];

async function settle(page: Page) {
  await page.waitForLoadState('networkidle');
  await page
    .locator('[data-testid="city-explorer"][data-hydrated="true"]')
    .waitFor({ timeout: 60_000 });
  await page.locator('canvas').waitFor({ timeout: 60_000 });
  await page.waitForTimeout(3000);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  for (const shot of shots) {
    const context = await browser.newContext({
      viewport: { width: 1600, height: 1000 },
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    await page.goto(baseURL + '/?admin=' + shot.admin, {
      waitUntil: 'domcontentloaded',
    });
    await settle(page);
    const file = join(outDir, shot.name + '.png');
    await page.screenshot({ path: file, timeout: 120_000 });
    console.log('captured', shot.name, '->', file);
    await context.close();
  }
} finally {
  await browser.close();
}
