/**
 * Capture per-landmark inspection views for before/after comparison.
 *
 * Usage:
 *   CAPTURE_BASE_URL=http://127.0.0.1:4400 npx tsx scripts/capture-landmark-views.ts --label before
 *
 * Requires AVATAR_PREVIEW=true on the dev server so /avatar-preview/ is served.
 * Every landmark is captured from the same four fixed views, so the pairs are
 * directly comparable without any manual camera work.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page } from '@playwright/test';

const arg = (name: string, fallback: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
};

const label = arg('label', 'after');
const baseURL = process.env.CAPTURE_BASE_URL ?? 'http://127.0.0.1:4400';
const outDir = join(process.cwd(), 'reports', 'visual', 'landmarks', label);
mkdirSync(outDir, { recursive: true });

const FEATURES = [
  'hsrStation',
  'worldGamesStadium',
  'lotusPagodas',
  'weiwuying',
  'pier2',
  'dreamMallFerris',
  'skyTower85',
] as const;
const ONLY = arg('only', '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const SELECTED: readonly (typeof FEATURES)[number][] = ONLY.length
  ? FEATURES.filter((feature) => ONLY.includes(feature))
  : FEATURES;
const VIEWS = ['three-quarter', 'front', 'side', 'top'] as const;
const VIEW_LABEL: Record<(typeof VIEWS)[number], string> = {
  'three-quarter': '三視',
  front: '前視',
  side: '側視',
  top: '俯視',
};

async function settle(page: Page, delay = 900) {
  await page.waitForTimeout(delay);
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
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 1,
  reducedMotion: 'reduce',
});
const page = await context.newPage();
page.on('console', (message) => {
  if (message.type() === 'error') console.log('console:', message.text());
});

await page.goto(baseURL + '/avatar-preview/', { waitUntil: 'domcontentloaded' });
const inspector = page.locator('[data-testid="asset-inspector"]');
await inspector.waitFor({ timeout: 90_000 });
await page.locator('[data-testid="asset-inspector-canvas"] canvas').waitFor({
  timeout: 90_000,
});
await settle(page, 2500);

const landmarkSelect = inspector
  .locator('label')
  .filter({ has: page.locator('option', { hasText: '高雄85大樓' }) })
  .locator('select');
const canvas = page.locator('[data-testid="asset-inspector-canvas"]');

for (const feature of SELECTED) {
  await landmarkSelect.selectOption(feature);
  await settle(page, 900);
  for (const view of VIEWS) {
    await inspector
      .locator('fieldset button', { hasText: VIEW_LABEL[view] })
      .first()
      .click();
    await settle(page, 700);
    const file = join(outDir, `${feature}-${view}.png`);
    await canvas.screenshot({ path: file, timeout: 60_000 });
    console.log(feature, view, '->', file);
  }
}

writeFileSync(
  join(outDir, 'manifest.json'),
  JSON.stringify(
    {
      label,
      baseURL,
      generatedAt: new Date().toISOString(),
      renderer: 'Playwright Chromium + SwiftShader (software WebGL)',
      features: FEATURES,
      views: VIEWS,
    },
    null,
    2,
  ) + '\n',
);
await context.close();
await browser.close();
console.log('wrote', outDir);
