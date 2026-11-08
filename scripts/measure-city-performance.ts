/**
 * Measure the unified Kaohsiung renderer in a real browser.
 *
 * Usage:
 *   npx tsx scripts/measure-city-performance.ts --label unified-world
 *   CAPTURE_BASE_URL=http://127.0.0.1:4322 npx tsx scripts/measure-city-performance.ts
 *
 * Requires a running dev or preview server. Headless Chromium on macOS uses
 * SwiftShader (software WebGL) unless a GPU-enabled browser is selected, so the
 * output records the renderer string and must not be presented as representative
 * physical-GPU performance.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus, platform, release, totalmem } from 'node:os';
import { join } from 'node:path';
import { chromium, type Page } from '@playwright/test';

const label = process.argv.includes('--label')
  ? (process.argv[process.argv.indexOf('--label') + 1] ?? 'perf')
  : 'perf';
const baseURL = process.env.CAPTURE_BASE_URL ?? 'http://127.0.0.1:4321';
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

async function collectDiagnostics(page: Page) {
  await page.waitForFunction(
    () =>
      Boolean(
        (window as { __cityDiagnostics?: Diagnostics }).__cityDiagnostics,
      ),
    { timeout: 45_000 },
  );
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
  return samples;
}

async function profile(
  viewport: { width: number; height: number },
  scenario: (typeof scenarios)[number],
) {
  const context = await chromium.launchPersistentContext('', {
    headless: true,
    viewport,
    reducedMotion: 'reduce',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(`${baseURL}${scenario.path}`, {
    waitUntil: 'domcontentloaded',
  });
  await page
    .locator('[data-testid="city-explorer"][data-hydrated="true"]')
    .waitFor({ timeout: 30_000 });
  await page.locator('canvas').waitFor({ timeout: 30_000 });

  // Portrait entry is zone-first; explicitly choose 全城 so the mobile
  // citywide measurement is the citywide view rather than the hero.
  if (scenario.id === 'world-overview' && viewport.width < 600) {
    await page
      .locator('.city-dock__bar .city-zones button')
      .filter({ hasText: '全城' })
      .click();
    await page.waitForTimeout(1_200);
  }

  const environment = await page.evaluate(() => {
    const offscreen = document.createElement('canvas');
    const gl = offscreen.getContext('webgl2') ?? offscreen.getContext('webgl');
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    return {
      userAgent: navigator.userAgent,
      hardwareConcurrency: navigator.hardwareConcurrency,
      renderer:
        gl?.getParameter(info?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER) ??
        'unknown',
      vendor:
        gl?.getParameter(info?.UNMASKED_VENDOR_WEBGL ?? gl.VENDOR) ?? 'unknown',
    };
  });

  const samples = await collectDiagnostics(page);
  await context.close();

  const average = (
    key: keyof Pick<Diagnostics, 'fps' | 'drawCalls' | 'triangles'>,
  ) =>
    Math.round(
      (samples.reduce((total, sample) => total + sample[key], 0) /
        samples.length) *
        10,
    ) / 10;
  const minimumFps = Math.min(...samples.map((sample) => sample.fps));

  return {
    scenario: scenario.id,
    path: scenario.path,
    viewport,
    environment,
    samples,
    summary: {
      averageFps: average('fps'),
      minimumFps,
      lowFps: minimumFps,
      sampleCount: samples.length,
      averageDrawCalls: average('drawCalls'),
      averageTriangles: average('triangles'),
      geometries: samples.at(-1)?.geometries ?? 0,
      textures: samples.at(-1)?.textures ?? 0,
      programs: samples.at(-1)?.programs ?? 0,
      dpr: samples.at(-1)?.dpr ?? 1,
      lowFpsDefinition: 'minimum of all collected samples; not a percentile',
    },
  };
}

const profiles = [];
for (const scenario of scenarios) {
  for (const viewport of [
    { width: 1600, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    profiles.push(await profile(viewport, scenario));
  }
}

const report = {
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
    'Headless Chromium renders WebGL in software (SwiftShader) in this environment. FPS is a lower-bound smoke measurement, not target-hardware performance. lowFps is the minimum of five samples, not a percentile.',
  profiles,
};
writeFileSync(join(outDir, `${label}.json`), JSON.stringify(report, null, 2));
console.log(
  JSON.stringify(
    {
      label,
      host: report.host,
      profiles: profiles.map((profile) => ({
        scenario: profile.scenario,
        viewport: profile.viewport,
        summary: profile.summary,
        renderer: profile.environment.renderer,
      })),
    },
    null,
    2,
  ),
);
