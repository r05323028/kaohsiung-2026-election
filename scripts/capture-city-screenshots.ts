/**
 * Deterministic screenshot capture for the immersive city explorer.
 *
 * Usage:
 *   npx tsx scripts/capture-city-screenshots.ts --label baseline
 *   npx tsx scripts/capture-city-screenshots.ts --label after
 *
 * Requires a running dev/preview server (default http://127.0.0.1:4321).
 * The script writes PNGs into reports/visual/<label>/ and a JSON manifest with
 * the viewport, URL, and camera query used for each shot.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page } from '@playwright/test';

const label = process.argv.includes('--label')
  ? (process.argv[process.argv.indexOf('--label') + 1] ?? 'capture')
  : 'capture';
const baseURL = process.env.CAPTURE_BASE_URL ?? 'http://127.0.0.1:4321';
const outDir = join(process.cwd(), 'reports', 'visual', label);
mkdirSync(outDir, { recursive: true });

type Shot = {
  name: string;
  url: string;
  viewport: { width: number; height: number };
  camera?: string;
  deviceScaleFactor?: number;
};

const shots: Shot[] = [
  {
    name: '01-district-overview',
    url: '/?district=kaohsiung-council-04',
    viewport: { width: 1600, height: 1000 },
    camera: 'overview',
  },
  {
    name: '02-lotus-pond',
    url: '/?district=kaohsiung-council-04&focus=lotus-pond',
    viewport: { width: 1600, height: 1000 },
    camera: 'lotus-pond',
  },
  {
    name: '03-dragon-tiger-pagodas',
    url: '/?district=kaohsiung-council-04&focus=dragon-tiger-pagodas',
    viewport: { width: 1600, height: 1000 },
    camera: 'dragon-tiger-pagodas',
  },
  {
    name: '04-zuoying-neighborhood',
    url: '/?district=kaohsiung-council-04&focus=zuoying-old-street',
    viewport: { width: 1600, height: 1000 },
    camera: 'zuoying-old-street',
  },
  {
    name: '05-houjing-river',
    url: '/?district=kaohsiung-council-04&focus=houjing-river',
    viewport: { width: 1600, height: 1000 },
    camera: 'houjing-river',
  },
  {
    name: '06-metropolitan-park',
    url: '/?district=kaohsiung-council-04&focus=metropolitan-park',
    viewport: { width: 1600, height: 1000 },
    camera: 'metropolitan-park',
  },
  {
    name: '07-nanzih-neighborhood',
    url: '/?district=kaohsiung-council-04&focus=nanzih-neighborhood',
    viewport: { width: 1600, height: 1000 },
    camera: 'nanzih-neighborhood',
  },
  {
    name: '08-candidate-selection',
    url: '/?district=kaohsiung-council-04&candidate=kaohsiung-council-04-712cf4dd',
    viewport: { width: 1600, height: 1000 },
    camera: 'candidate',
  },
  {
    name: '09-mobile',
    url: '/?district=kaohsiung-council-04',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    camera: 'overview',
  },
];

async function settle(page: Page) {
  await page.waitForLoadState('networkidle');
  await page
    .locator('[data-testid="city-explorer"][data-hydrated="true"]')
    .waitFor({ timeout: 30_000 });
  await page.locator('canvas').waitFor({ timeout: 30_000 });
  // Reduced motion makes the camera snap, so captures are deterministic even
  // on software WebGL. Still allow the lazy chunk to compile shaders.
  await page.waitForTimeout(2200);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

const manifest: Array<Shot & { file: string }> = [];

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  for (const shot of shots) {
    const context = await browser.newContext({
      viewport: shot.viewport,
      deviceScaleFactor: shot.deviceScaleFactor ?? 1,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const response = await page.goto(`${baseURL}${shot.url}`, {
      waitUntil: 'domcontentloaded',
    });
    if (!response?.ok()) {
      console.warn(`skip ${shot.name}: HTTP ${response?.status()}`);
      await context.close();
      continue;
    }
    await settle(page);
    const file = join(outDir, `${shot.name}.png`);
    await page.screenshot({ path: file, timeout: 120_000 });
    manifest.push({ ...shot, file });
    console.log(`captured ${shot.name} -> ${file}`);
    await context.close();
  }
} finally {
  await browser.close();
}

writeFileSync(
  join(outDir, 'manifest.json'),
  JSON.stringify(
    { label, baseURL, capturedAt: new Date().toISOString(), shots: manifest },
    null,
    2,
  ),
);
console.log(`wrote ${manifest.length} shots to ${outDir}`);
