/**
 * Capture the architectural before/after evidence from a running dev server.
 *
 * Usage:
 *   CAPTURE_BASE_URL=http://127.0.0.1:4323 npx tsx scripts/capture-architecture.ts --label after
 *
 * For the "before" set, disable <HexBuildings> in src/components/HexWorldLayer.tsx
 * and run again with --label before. Camera moves are deterministic so the pairs
 * are directly comparable.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page } from '@playwright/test';
import { focusAdmin } from './lib/city-ui';

const label = process.argv.includes('--label')
  ? (process.argv[process.argv.indexOf('--label') + 1] ?? 'after')
  : 'after';
const baseURL = process.env.CAPTURE_BASE_URL ?? 'http://127.0.0.1:4323';
const outDir = join(process.cwd(), 'reports', 'visual', 'architecture', label);
mkdirSync(outDir, { recursive: true });

async function settle(page: Page, delay = 3200) {
  await page.waitForTimeout(delay);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

async function open(page: Page, path = '/') {
  await page.goto(baseURL + path, { waitUntil: 'domcontentloaded' });
  await page
    .locator('[data-testid="city-explorer"][data-hydrated="true"]')
    .waitFor({ timeout: 60_000 });
  await page.locator('canvas').waitFor({ timeout: 60_000 });
  await settle(page, 3500);
}

async function selectDistrict(page: Page, name: string) {
  await page.waitForTimeout(500);
  await focusAdmin(page, name);
  await page.waitForTimeout(3500);
  await page.evaluate(() => {
    for (const card of document.querySelectorAll('.city-admin-card')) {
      card.setAttribute('style', 'display:none');
    }
  });
  await settle(page, 400);
}

async function zoom(page: Page, steps: number) {
  await page.mouse.move(760, 420);
  for (let index = 0; index < steps; index += 1) {
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(320);
  }
  await settle(page, 1800);
}

async function shot(page: Page, name: string) {
  const file = join(outDir, name + '.png');
  await page.screenshot({ path: file, timeout: 120_000 });
  console.log(name, '->', file);
}

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  reducedMotion: 'reduce',
});
const page = await context.newPage();
await open(page);
await shot(page, '01-world');

await selectDistrict(page, '左營');
await shot(page, '02-zuoying');
await zoom(page, 18);
await page.mouse.move(820, 380);
await page.mouse.down();
await page.mouse.move(440, 640, { steps: 20 });
await page.mouse.up();
await settle(page, 1600);
await shot(page, '03-zuoying-detail');

await open(page);
await selectDistrict(page, '楠梓');
await shot(page, '04-nanzih');
await zoom(page, 18);
await shot(page, '05-nanzih-detail');
await context.close();

const mobile = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  reducedMotion: 'reduce',
});
const mobilePage = await mobile.newPage();
await open(mobilePage);
await settle(mobilePage, 5000);
await shot(mobilePage, '06-mobile');
await mobile.close();

writeFileSync(
  join(outDir, 'manifest.json'),
  JSON.stringify(
    {
      label,
      baseURL,
      generatedAt: new Date().toISOString(),
      renderer: 'Playwright Chromium + SwiftShader (software WebGL)',
      reducedMotion: 'reduce',
      captures: [
        '01-world',
        '02-zuoying',
        '03-zuoying-detail',
        '04-nanzih',
        '05-nanzih-detail',
        '06-mobile',
      ],
    },
    null,
    2,
  ) + '\n',
);
await browser.close();
console.log('wrote', outDir);
