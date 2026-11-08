/**
 * Measure interaction frame pacing on the refined explorer.
 *
 * Usage:
 *   npx tsx scripts/measure-refine-interactions.ts
 *
 * Headless Chromium uses SwiftShader here, so these frame intervals are a
 * software-rendering lower bound, not hardware-GPU performance.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus, platform, release, totalmem } from 'node:os';
import { join } from 'node:path';
import { chromium, type Page } from '@playwright/test';

const baseURL = process.env.CAPTURE_BASE_URL ?? 'http://127.0.0.1:4321';
const outDir = join(process.cwd(), 'reports', 'performance');
mkdirSync(outDir, { recursive: true });

type FrameSummary = {
  frames: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  estimatedFps: number;
};

type CameraView = {
  position: [number, number, number];
  target?: [number, number, number];
  zoom: number;
};

function summarize(samples: number[]): FrameSummary {
  const sorted = [...samples]
    .filter((value) => value > 0)
    .sort((a, b) => a - b);
  const at = (fraction: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ??
    0;
  const mean =
    sorted.reduce((total, value) => total + value, 0) / sorted.length;
  return {
    frames: sorted.length,
    p50Ms: Math.round(at(0.5) * 10) / 10,
    p95Ms: Math.round(at(0.95) * 10) / 10,
    maxMs: Math.round((sorted.at(-1) ?? 0) * 10) / 10,
    estimatedFps: Math.round((1000 / mean) * 10) / 10,
  };
}

async function camera(page: Page): Promise<CameraView> {
  return (await page.evaluate(() => {
    // SAFETY: camera() is installed by CityScene and returns CameraView.
    const world = (
      window as unknown as {
        __kaohsiungWorld?: { camera?: () => CameraView };
      }
    ).__kaohsiungWorld;
    return world?.camera?.();
  })) as CameraView;
}

async function startFrames(page: Page) {
  await page.evaluate(`
    (() => {
      window.__frameSamples = [];
      let last = performance.now();
      const tick = (now) => {
        window.__frameSamples.push(now - last);
        last = now;
        window.__frameHandle = requestAnimationFrame(tick);
      };
      window.__frameHandle = requestAnimationFrame(tick);
    })()
  `);
}

async function stopFrames(page: Page): Promise<FrameSummary> {
  const samples = (await page.evaluate(`
    (() => {
      if (window.__frameHandle) cancelAnimationFrame(window.__frameHandle);
      return window.__frameSamples ?? [];
    })()
  `)) as number[];
  return summarize(samples);
}

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({
  viewport: { width: 1600, height: 1000 },
  reducedMotion: 'no-preference',
});
await page.goto(`${baseURL}/?admin=E03`, { waitUntil: 'domcontentloaded' });
await page
  .locator('[data-testid="city-explorer"][data-hydrated="true"]')
  .waitFor({ timeout: 45_000 });
await page.locator('canvas').waitFor({ timeout: 30_000 });
await page.waitForTimeout(7_000);

const settled = await camera(page);
await startFrames(page);
await page.waitForTimeout(2_000);
const idle = await stopFrames(page);

const box = await page.locator('canvas').boundingBox();
if (!box) throw new Error('canvas has no bounding box');
const x = box.x + box.width * 0.5;
const y = box.y + box.height * 0.55;
await startFrames(page);
await page.mouse.move(x, y);
await page.mouse.down({ button: 'left' });
await page.mouse.move(x + 210, y + 120, { steps: 18 });
await page.mouse.up({ button: 'left' });
await page.waitForTimeout(900);
const drag = await stopFrames(page);
const afterDrag = await camera(page);

await page.locator('#candidate-search').fill('張靜');
await page.waitForTimeout(500);
await startFrames(page);
await page.locator('.city-search__results .city-candidate').first().click();
await page.waitForTimeout(3_000);
const selection = await stopFrames(page);
const afterSelection = await camera(page);

await page
  .locator('[data-testid="profile-panel"]')
  .waitFor({ state: 'visible' });
await startFrames(page);
await page.getByRole('button', { name: '關閉人物資料' }).click();
await page.waitForTimeout(2_000);
const close = await stopFrames(page);
const afterClose = await camera(page);

const environment = await page.evaluate(() => {
  const offscreen = document.createElement('canvas');
  const gl = offscreen.getContext('webgl2') ?? offscreen.getContext('webgl');
  const info = gl?.getExtension('WEBGL_debug_renderer_info');
  return {
    userAgent: navigator.userAgent,
    renderer:
      gl?.getParameter(info?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER) ??
      'unknown',
    vendor:
      gl?.getParameter(info?.UNMASKED_VENDOR_WEBGL ?? gl.VENDOR) ?? 'unknown',
  };
});

const report = {
  label: 'refine-interactions',
  baseURL,
  measuredAt: new Date().toISOString(),
  host: {
    platform: platform(),
    release: release(),
    cpu: cpus()[0]?.model ?? 'unknown',
    logicalCores: cpus().length,
    totalMemoryBytes: totalmem(),
  },
  caveat:
    'Headless Chromium renders WebGL in software (SwiftShader) in this environment. Frame intervals are a lower-bound smoke measurement, not target-hardware performance.',
  viewport: { width: 1600, height: 1000 },
  environment,
  camera: { settled, afterDrag, afterSelection, afterClose },
  frames: { idle, drag, selection, close },
};

writeFileSync(
  join(outDir, 'refine-interactions.json'),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
await browser.close();
