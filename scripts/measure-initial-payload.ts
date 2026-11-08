/**
 * Record the homepage's initial network payload in a production preview.
 *
 * Usage:
 *   CAPTURE_BASE_URL=http://127.0.0.1:4322 npx tsx scripts/measure-initial-payload.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const baseURL = process.env.CAPTURE_BASE_URL ?? 'http://127.0.0.1:4321';
const outDir = join(process.cwd(), 'reports', 'performance');
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const context = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  reducedMotion: 'reduce',
});
const page = await context.newPage();
await page.goto(baseURL, { waitUntil: 'networkidle' });
await page
  .locator('[data-testid="city-explorer"][data-hydrated="true"]')
  .waitFor({ timeout: 30_000 });
await page.locator('canvas').waitFor({ timeout: 30_000 });
await page.waitForTimeout(2_500);

const resources = await page.evaluate(() =>
  performance
    .getEntriesByType('resource')
    .map((raw) => {
      const entry = raw as PerformanceResourceTiming;
      return {
        name: entry.name,
        initiatorType: entry.initiatorType,
        transferSize: entry.transferSize,
        decodedBodySize: entry.decodedBodySize,
      };
    })
    .filter((entry) =>
      /[.](js|css|woff2?|glb|png|webp)($|[?])/.test(entry.name),
    ),
);

const sum = (entries: typeof resources, match: RegExp) =>
  entries
    .filter((entry) => match.test(entry.name))
    .reduce(
      (total, entry) => ({
        transfer: total.transfer + entry.transferSize,
        decoded: total.decoded + entry.decodedBodySize,
        requests: total.requests + 1,
      }),
      { transfer: 0, decoded: 0, requests: 0 },
    );

const navigation = await page.evaluate(() => {
  const entry = performance.getEntriesByType(
    'navigation',
  )[0] as PerformanceNavigationTiming;
  return entry
    ? {
        domContentLoaded: Math.round(entry.domContentLoadedEventEnd),
        load: Math.round(entry.loadEventEnd),
        transferSize: entry.transferSize,
        decodedBodySize: entry.decodedBodySize,
      }
    : null;
});

const report = {
  baseURL,
  entry: '/',
  viewport: '1600x1000',
  generatedAt: new Date().toISOString(),
  navigation,
  totals: {
    javascript: sum(resources, /[.]js($|[?])/),
    css: sum(resources, /[.]css($|[?])/),
    fonts: sum(resources, /[.]woff2?($|[?])/),
    images: sum(resources, /[.](png|webp)($|[?])/),
    all: sum(resources, /.*/),
  },
  resources: resources.sort((a, b) => b.transferSize - a.transferSize),
};
writeFileSync(
  join(outDir, 'initial-payload.json'),
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(
  `Initial payload: ${(report.totals.javascript.transfer / 1024).toFixed(0)} KiB JS transfer / ${(report.totals.all.transfer / 1024).toFixed(0)} KiB total transfer (${report.totals.all.requests} requests)`,
);
await browser.close();
