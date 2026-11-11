import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus, platform, release, totalmem } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const baseURL = process.env.CAPTURE_BASE_URL ?? 'http://127.0.0.1:4321';
const outDir = join(process.cwd(), 'reports', 'performance');
mkdirSync(outDir, { recursive: true });

type Diagnostics = {
  fps: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  sampledAt: string;
};

const scenarios = [
  { id: 'world-overview', path: '/?perf=1' },
  { id: 'hero-zuoying', path: '/?admin=E03&perf=1' },
  { id: 'hero-nanzih', path: '/?admin=E04&perf=1' },
] as const;

const profiles = [];
for (const scenario of scenarios) {
  const context = await chromium.launchPersistentContext('', {
    headless: true,
    viewport: { width: 1600, height: 1000 },
    reducedMotion: 'reduce',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(baseURL + scenario.path, { waitUntil: 'domcontentloaded' });
  await page
    .locator('[data-testid="city-explorer"][data-hydrated="true"]')
    .waitFor({ timeout: 30_000 });
  await page.locator('canvas').waitFor({ timeout: 30_000 });
  await page.waitForFunction(
    () =>
      Boolean(
        (window as { __cityDiagnostics?: Diagnostics }).__cityDiagnostics,
      ),
    { timeout: 45_000 },
  );
  await page.waitForTimeout(7_000);
  const samples: Diagnostics[] = [];
  let previous = '';
  while (samples.length < 5) {
    await page.waitForTimeout(1_100);
    const sample = await page.evaluate(
      () => (window as { __cityDiagnostics?: Diagnostics }).__cityDiagnostics,
    );
    if (!sample || sample.sampledAt === previous) continue;
    previous = sample.sampledAt;
    samples.push(sample);
  }
  const environment = await page.evaluate(() => {
    const offscreen = document.createElement('canvas');
    const gl = offscreen.getContext('webgl2') ?? offscreen.getContext('webgl');
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    return {
      renderer:
        gl?.getParameter(info?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER) ??
        'unknown',
    };
  });
  const average = (key: 'fps' | 'drawCalls' | 'triangles') =>
    Math.round(
      (samples.reduce((total, sample) => total + sample[key], 0) /
        samples.length) *
        10,
    ) / 10;
  profiles.push({
    scenario: scenario.id,
    path: scenario.path,
    environment,
    samples,
    summary: {
      averageFps: average('fps'),
      lowFps: Math.min(...samples.map((sample) => sample.fps)),
      averageDrawCalls: average('drawCalls'),
      averageTriangles: average('triangles'),
      geometries: samples.at(-1)?.geometries ?? 0,
    },
  });
  await context.close();
}

const report = {
  label: 'district-integrity',
  measuredAt: new Date().toISOString(),
  host: {
    platform: platform(),
    release: release(),
    cpu: cpus()[0]?.model ?? 'unknown',
    logicalCores: cpus().length,
    totalMemoryBytes: totalmem(),
  },
  caveat:
    'Headless Chromium renders WebGL in software (SwiftShader) in this environment. FPS is a lower-bound smoke measurement, not target-hardware performance.',
  profiles,
};
writeFileSync(
  join(outDir, 'district-integrity.json'),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
