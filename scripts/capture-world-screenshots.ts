/**
 * Capture deterministic unified-world screenshots from a running preview.
 *
 * Usage:
 *   CAPTURE_BASE_URL=http://127.0.0.1:4322 npx tsx scripts/capture-world-screenshots.ts
 *   CAPTURE_BASE_URL=http://127.0.0.1:4322 npx tsx scripts/capture-world-screenshots.ts --label final
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page } from '@playwright/test';
import { focusAdmin, returnToWorld } from './lib/city-ui';

const baseURL = process.env.CAPTURE_BASE_URL ?? 'http://127.0.0.1:4321';
const label = process.argv.includes('--label')
  ? (process.argv[process.argv.indexOf('--label') + 1] ?? 'world')
  : 'world';
const outDir = join(process.cwd(), 'reports', 'visual', label);
mkdirSync(outDir, { recursive: true });

type Shot = {
  name: string;
  path: string;
  viewport: { width: number; height: number };
  action?: (page: Page) => Promise<void>;
  note: string;
};

async function openPage(page: Page, path: string) {
  await page.goto(`${baseURL}${path}`, { waitUntil: 'domcontentloaded' });
  await page
    .locator('[data-testid="city-explorer"][data-hydrated="true"]')
    .waitFor({ timeout: 30_000 });
  await page.locator('canvas').waitFor({ timeout: 30_000 });
  await settle(page);
}

async function settle(page: Page, delay = 3000) {
  await page.waitForTimeout(delay);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

async function selectAdmin(page: Page, name: string) {
  await settle(page, 1500);
  await focusAdmin(page, name);
  await settle(page, name === '左營' ? 10_000 : 3000);
}

const shots: Shot[] = [
  {
    name: '01-kaohsiung-overview',
    path: '/',
    viewport: { width: 1600, height: 1000 },
    note: 'Desktop citywide overview with all 38 districts, labels and low-detail massing.',
  },
  {
    name: '03-admin-zuoying',
    path: '/',
    viewport: { width: 1600, height: 1000 },
    action: (page) => selectAdmin(page, '左營'),
    note: '左營 district focus with context card and hero streaming.',
  },
  {
    name: '04-admin-taoyuan',
    path: '/',
    viewport: { width: 1600, height: 1000 },
    action: (page) => selectAdmin(page, '桃源'),
    note: 'Mountain district focus (桃源) with low-poly relief and context card.',
  },
  {
    name: '05-admin-qijin',
    path: '/',
    viewport: { width: 1600, height: 1000 },
    action: (page) => selectAdmin(page, '旗津'),
    note: '旗津 main-island focus; remote territories are excluded from walkable bounds.',
  },
  {
    name: '06-council-04-follow',
    path: '/?district=kaohsiung-council-04&candidate=kaohsiung-council-04-712cf4dd',
    viewport: { width: 1600, height: 1000 },
    action: async (page) => {
      await page.evaluate(() => {
        // SAFETY: CityScene installs this test bridge after the canvas mounts.
        const world = (
          window as Window & {
            __kaohsiungWorld?: { advance: (seconds: number) => void };
          }
        ).__kaohsiungWorld;
        world?.advance(360);
      });
      await settle(page, 12_000);
    },
    note: '議員第4選舉區 黃文志 followed after 360 simulated seconds; remains in 左營/楠梓.',
  },
  {
    name: '07-mayoral-follow',
    path: '/?district=kaohsiung-mayor-2026&candidate=zhang-jing-2026',
    viewport: { width: 1600, height: 1000 },
    action: async (page) => {
      await page.evaluate(() => {
        // SAFETY: CityScene installs this test bridge after the canvas mounts.
        const world = (
          window as Window & {
            __kaohsiungWorld?: { advance: (seconds: number) => void };
          }
        ).__kaohsiungWorld;
        world?.advance(900);
      });
      await settle(page, 12_000);
    },
    note: '市長 candidate 張靜 followed after 900 simulated seconds on the multi-district corridor.',
  },
  {
    name: '08-mobile-zone',
    path: '/',
    viewport: { width: 390, height: 844 },
    action: async (page) => {
      await settle(page, 10_000);
    },
    note: 'Mobile default zone-first entry (左營) with compact dock and 44px controls.',
  },
  {
    name: '09-mobile-world',
    path: '/',
    viewport: { width: 390, height: 844 },
    action: async (page) => {
      await returnToWorld(page);
      await settle(page, 3000);
    },
    note: 'Mobile citywide overview after choosing 全城.',
  },
];

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const manifest = {
  label,
  baseURL,
  generatedAt: new Date().toISOString(),
  renderer: 'Playwright Chromium + SwiftShader (software WebGL)',
  reducedMotion: 'reduce',
  captures: [] as Array<
    Shot & { file: string; dataSceneFocus: string; capturedAt: string }
  >,
};

for (const shot of shots) {
  const context = await browser.newContext({
    viewport: shot.viewport,
    deviceScaleFactor: shot.viewport.width < 600 ? 2 : 1,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  await openPage(page, shot.path);
  if (shot.action) await shot.action(page);
  const file = join(outDir, `${shot.name}.png`);
  await page.screenshot({ path: file, fullPage: false, timeout: 120_000 });
  const dataSceneFocus = await page
    .locator('[data-testid="city-explorer"]')
    .getAttribute('data-scene-focus');
  manifest.captures.push({
    ...shot,
    file: `reports/visual/${label}/${shot.name}.png`,
    dataSceneFocus: dataSceneFocus ?? '',
    capturedAt: new Date().toISOString(),
  });
  console.log(
    `${shot.name} ${shot.viewport.width}x${shot.viewport.height} focus=${dataSceneFocus ?? ''}`,
  );
  await context.close();
}

writeFileSync(
  join(outDir, 'manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
console.log(`Wrote ${manifest.captures.length} captures to ${outDir}`);
await browser.close();
