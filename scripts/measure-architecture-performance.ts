/**
 * Measure the hex-city renderer before/after an architectural change.
 *
 * Usage:
 *   CAPTURE_BASE_URL=http://127.0.0.1:4323 npx tsx scripts/measure-architecture-performance.ts --label architecture-after
 *
 * Requires a running dev or preview server with the perf diagnostics enabled.
 * Headless Chromium on macOS uses SwiftShader (software WebGL), so the output
 * records the renderer string and must not be presented as physical-GPU data.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus, platform, release, totalmem } from 'node:os';
import { join } from 'node:path';
import { chromium, type Page } from '@playwright/test';

const label = process.argv.includes('--label')
  ? (process.argv[process.argv.indexOf('--label') + 1] ?? 'perf')
  : 'architecture-perf';
const baseURL = process.env.CAPTURE_BASE_URL ?? 'http://127.0.0.1:4323';
const outDir = join(process.cwd(), 'reports', 'performance');
mkdirSync(outDir, { recursive: true });

type Diagnostics = {
  fps: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  programs: number;
  dpr: number;
  viewport: { width: number; height: number };
  sampledAt: string;
};

const scenarios = [
  { id: 'world-overview', path: '/?perf=1' },
  {
    id: 'hero-zuoying-nanzih',
    path: '/?district=kaohsiung-council-04&perf=1',
  },
] as const;

const viewports = [
  { width: 1600, height: 1000, id: 'desktop' },
  { width: 390, height: 844, id: 'mobile' },
] as const;

async function collect(page: Page) {
  return page.evaluate(
    () =>
      (window as { __cityDiagnostics?: Diagnostics }).__cityDiagnostics ?? null,
  );
}

async function sample(page: Page, count = 5) {
  const samples: Diagnostics[] = [];
  for (let index = 0; index < count; index += 1) {
    await page.waitForTimeout(900);
    const diagnostics = await collect(page);
    if (diagnostics) samples.push(diagnostics);
  }
  return samples;
}

const profiles: unknown[] = [];
for (const scenario of scenarios) {
  for (const viewport of viewports) {
    const browser = await chromium.launch();
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    await page.goto(baseURL + scenario.path, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    await page.locator('canvas').waitFor({ timeout: 60_000 });
    await page.waitForFunction(
      () =>
        Boolean(
          (window as { __cityDiagnostics?: Diagnostics }).__cityDiagnostics,
        ),
      { timeout: 60_000 },
    );
    await page.waitForTimeout(2500);
    const samples = await sample(page);
    const environment = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl');
      const extension = gl?.getExtension('WEBGL_debug_renderer_info');
      return {
        userAgent: navigator.userAgent,
        hardwareConcurrency: navigator.hardwareConcurrency,
        renderer: extension
          ? gl!.getParameter(extension.UNMASKED_RENDERER_WEBGL)
          : 'unknown',
        vendor: extension
          ? gl!.getParameter(extension.UNMASKED_VENDOR_WEBGL)
          : 'unknown',
      };
    });
    profiles.push({
      scenario: scenario.id,
      path: scenario.path,
      viewport: { width: viewport.width, height: viewport.height },
      device: viewport.id,
      environment,
      samples,
      summary:
        samples.length > 0
          ? {
              fpsMedian: samples.map((s) => s.fps).sort((a, b) => a - b)[
                Math.floor(samples.length / 2)
              ],
              fpsLow: Math.min(...samples.map((s) => s.fps)),
              drawCalls: samples[0]!.drawCalls,
              triangles: samples[0]!.triangles,
            }
          : null,
    });
    await browser.close();
  }
}

const output = {
  label,
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
    'Headless Chromium in this environment renders WebGL in software (SwiftShader). FPS is a lower-bound smoke measurement, not target-hardware performance.',
  profiles,
};
writeFileSync(
  join(outDir, label + '.json'),
  JSON.stringify(output, null, 2) + '\n',
);
console.log('wrote', join(outDir, label + '.json'));
