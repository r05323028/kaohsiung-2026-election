/**
 * Measure the hex-city renderer's runtime cost: frame-time distribution, main
 * thread time per frame, and the draw-call split between the shadow pass and
 * the main pass.
 *
 * Usage:
 *   CAPTURE_BASE_URL=http://127.0.0.1:4400 npx tsx scripts/measure-runtime-performance.ts --label runtime-after
 *   ... --label idle --idle-seconds 120    # adds a long idle scenario
 *
 * Requires a production preview/dev server with ?perf=1 diagnostics. Headless
 * Chromium on macOS renders WebGL in software (SwiftShader): draw calls,
 * triangles and JS time are representative, absolute frame times are not.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus, platform, release, totalmem } from 'node:os';
import { join } from 'node:path';
import { type BrowserContext, chromium, type Page } from '@playwright/test';
import { returnToWorld } from './lib/city-ui';

const label = process.argv.includes('--label')
  ? (process.argv[process.argv.indexOf('--label') + 1] ?? 'runtime')
  : 'runtime';
const idleSeconds = Number(
  process.argv.includes('--idle-seconds')
    ? process.argv[process.argv.indexOf('--idle-seconds') + 1]
    : 0,
);
const baseURL = process.env.CAPTURE_BASE_URL ?? 'http://127.0.0.1:4400';
const outDir = join(process.cwd(), '.cache', 'reports', 'performance');
mkdirSync(outDir, { recursive: true });

const SAMPLE_MS = 8000;

type Scenario = {
  id: string;
  path: string;
  viewport: { width: number; height: number };
  device: 'desktop' | 'mobile';
  /** Extra interaction run after settle, before the sampling window. */
  interact?: 'zoom-in' | 'district-then-back';
};

const scenarios: Scenario[] = [
  {
    id: 'overview-desktop',
    path: '/?perf=1',
    viewport: { width: 1600, height: 1000 },
    device: 'desktop',
  },
  {
    id: 'overview-mobile',
    path: '/?perf=1',
    viewport: { width: 390, height: 844 },
    device: 'mobile',
  },
  {
    id: 'zuoying-desktop',
    path: '/?district=kaohsiung-council-04&perf=1',
    viewport: { width: 1600, height: 1000 },
    device: 'desktop',
  },
  {
    id: 'nanzih-desktop',
    path: '/?district=kaohsiung-council-07&perf=1',
    viewport: { width: 1600, height: 1000 },
    device: 'desktop',
  },
  {
    id: 'zuoying-mobile',
    path: '/?district=kaohsiung-council-04&perf=1',
    viewport: { width: 390, height: 844 },
    device: 'mobile',
  },
  {
    id: 'closeup-desktop',
    path: '/?perf=1',
    viewport: { width: 1600, height: 1000 },
    device: 'desktop',
    interact: 'zoom-in',
  },
  {
    id: 'profile-open-desktop',
    path: '/?candidate=zhang-jing-2026&perf=1',
    viewport: { width: 1600, height: 1000 },
    device: 'desktop',
  },
  {
    id: 'profile-open-mobile',
    path: '/?candidate=zhang-jing-2026&perf=1',
    viewport: { width: 390, height: 844 },
    device: 'mobile',
  },
  {
    id: 'overview-return-desktop',
    path: '/?district=kaohsiung-council-04&perf=1',
    viewport: { width: 1600, height: 1000 },
    device: 'desktop',
    interact: 'district-then-back',
  },
];

/**
 * Browser-side probe installed before any page script runs.
 *
 * Kept as source text on purpose: Playwright serialises an init *function* by
 * its compiled source, and the esbuild transform used by tsx injects `__name`
 * helpers that do not exist in the page, so the patch would silently never
 * apply. A plain string is passed through untouched.
 */
const INSTRUMENT = `
(() => {
  const state = { calls: 0, tris: 0, shadowCalls: 0, shadowTris: 0, mode: 'main', frames: [], longTasks: [] };
  window.__cityRuntime = state;
  const countTriangles = (args) => {
    switch (args.length) {
      case 3: return Math.floor(Number(args[1]) / 3);
      case 4: return Math.floor(Number(args[2]) / 3);
      case 5: return Math.floor(Number(args[1]) / 3) * Number(args[4]);
      default: return Math.floor(Number(args[2]) / 3) * Number(args[3]);
    }
  };
  const protos = [
    window.WebGL2RenderingContext && window.WebGL2RenderingContext.prototype,
    window.WebGLRenderingContext && window.WebGLRenderingContext.prototype,
  ];
  for (const proto of protos) {
    if (!proto) continue;
    for (const name of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
      const original = proto[name];
      if (!original) continue;
      proto[name] = function (...args) {
        const tris = countTriangles(args);
        if (state.mode === 'shadow') { state.shadowCalls += 1; state.shadowTris += tris; }
        else { state.calls += 1; state.tris += tris; }
        return original.apply(this, args);
      };
    }
    const bindFramebuffer = proto.bindFramebuffer;
    if (!bindFramebuffer) continue;
    proto.bindFramebuffer = function (...args) {
      state.mode = args[1] ? 'shadow' : 'main';
      return bindFramebuffer.apply(this, args);
    };
  }
  const raf = window.requestAnimationFrame;
  window.requestAnimationFrame = function (callback) {
    return raf.call(window, (timestamp) => {
      state.calls = 0;
      state.tris = 0;
      state.shadowCalls = 0;
      state.shadowTris = 0;
      state.mode = 'main';
      const start = performance.now();
      callback(timestamp);
      const cpuMs = performance.now() - start;
      if (state.calls + state.shadowCalls > 0) {
        state.frames.push({ t: timestamp, calls: state.calls, tris: state.tris, shadowCalls: state.shadowCalls, shadowTris: state.shadowTris, cpuMs: Math.round(cpuMs * 100) / 100 });
        if (state.frames.length > 4000) state.frames.shift();
      }
    });
  };
  if ('PerformanceObserver' in window) {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) state.longTasks.push(Math.round(entry.duration));
    }).observe({ type: 'longtask', buffered: true });
  }
})();
`;

type RuntimeDump = {
  frames: number[];
  cpuMs: number[];
  calls: number[];
  shadowCalls: number[];
  tris: number[];
  shadowTris: number[];
  diagnostics: unknown;
  heap: { used: number; total: number } | null;
  longTasks: number[];
  navigation: Record<string, number>;
  renderer: string;
};

async function readRuntime(page: Page): Promise<RuntimeDump> {
  return page.evaluate(() => {
    type State = {
      frames: Array<{
        t: number;
        calls: number;
        tris: number;
        shadowCalls: number;
        shadowTris: number;
        cpuMs: number;
      }>;
      longTasks: number[];
    };
    // SAFETY: same private probe slot written by the init script above.
    const host = window as unknown as {
      __cityRuntime?: State;
      __cityDiagnostics?: unknown;
    };
    const frames = (host.__cityRuntime?.frames ?? []).filter(
      (frame) => frame.calls + frame.shadowCalls > 5,
    );
    const deltas: number[] = [];
    for (let index = 1; index < frames.length; index += 1) {
      deltas.push(frames[index]!.t - frames[index - 1]!.t);
    }
    const nav = performance.getEntriesByType('navigation')[0] as
      | PerformanceNavigationTiming
      | undefined;
    const paint = performance.getEntriesByType('paint');
    const fcp = paint.find((entry) => entry.name === 'first-contentful-paint');
    const canvas = document.querySelector('canvas');
    const gl =
      (canvas?.getContext('webgl2') as WebGL2RenderingContext | null) ??
      (canvas?.getContext('webgl') as WebGLRenderingContext | null);
    const extension = gl?.getExtension('WEBGL_debug_renderer_info');
    // SAFETY: performance.memory is a Chrome-only extension, absent from lib.dom.
    const memory = (
      performance as unknown as {
        memory?: { usedJSHeapSize: number; totalJSHeapSize: number };
      }
    ).memory;
    return {
      frames: deltas,
      cpuMs: frames.map((frame) => frame.cpuMs),
      calls: frames.map((frame) => frame.calls),
      shadowCalls: frames.map((frame) => frame.shadowCalls),
      tris: frames.map((frame) => frame.tris),
      shadowTris: frames.map((frame) => frame.shadowTris),
      diagnostics: host.__cityDiagnostics ?? null,
      heap: memory
        ? {
            used: Math.round(memory.usedJSHeapSize / 1048576),
            total: Math.round(memory.totalJSHeapSize / 1048576),
          }
        : null,
      longTasks: host.__cityRuntime?.longTasks ?? [],
      navigation: {
        domContentLoaded: Math.round(nav?.domContentLoadedEventEnd ?? 0),
        load: Math.round(nav?.loadEventEnd ?? 0),
        transfer: nav?.transferSize ?? 0,
        decoded: nav?.decodedBodySize ?? 0,
        fcp: Math.round(fcp?.startTime ?? 0),
      },
      renderer: extension
        ? String(gl!.getParameter(extension.UNMASKED_RENDERER_WEBGL))
        : 'unknown',
    };
  });
}

function percentile(values: number[], q: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * q));
  return Math.round(sorted[index]! * 100) / 100;
}

function summarise(dump: RuntimeDump) {
  const fraction = (threshold: number) =>
    dump.frames.length === 0
      ? 0
      : Math.round(
          (dump.frames.filter((value) => value > threshold).length /
            dump.frames.length) *
            1000,
        ) / 10;
  return {
    frameMs: {
      samples: dump.frames.length,
      p50: percentile(dump.frames, 0.5),
      p95: percentile(dump.frames, 0.95),
      p99: percentile(dump.frames, 0.99),
      max: percentile(dump.frames, 1),
    },
    longFramesPct: {
      over33: fraction(33.4),
      over50: fraction(50),
      over100: fraction(100),
    },
    mainThreadMs: {
      p50: percentile(dump.cpuMs, 0.5),
      p95: percentile(dump.cpuMs, 0.95),
      max: percentile(dump.cpuMs, 1),
    },
    drawCalls: {
      mainP50: percentile(dump.calls, 0.5),
      mainMax: percentile(dump.calls, 1),
      shadowP50: percentile(dump.shadowCalls, 0.5),
    },
    triangles: {
      mainP50: percentile(dump.tris, 0.5),
      shadowP50: percentile(dump.shadowTris, 0.5),
    },
    diagnostics: dump.diagnostics,
    heapMB: dump.heap,
    longTasks: {
      count: dump.longTasks.length,
      totalMs: dump.longTasks.reduce((sum, value) => sum + value, 0),
      maxMs: dump.longTasks.length ? Math.max(...dump.longTasks) : 0,
    },
    navigation: dump.navigation,
    renderer: dump.renderer,
  };
}

async function runScenario(
  context: BrowserContext,
  scenario: Scenario,
): Promise<unknown> {
  const page = await context.newPage();
  await page.goto(baseURL + scenario.path, {
    waitUntil: 'load',
    timeout: 120_000,
  });
  await page
    .waitForFunction(
      () =>
        Boolean((window as { __cityDiagnostics?: unknown }).__cityDiagnostics),
      {
        timeout: 180_000,
      },
    )
    .catch(() => undefined);
  await page.waitForTimeout(4000);

  if (scenario.interact === 'zoom-in') {
    await page.mouse.move(
      scenario.viewport.width / 2,
      scenario.viewport.height / 2,
    );
    for (let step = 0; step < 6; step += 1) {
      await page.mouse.wheel(0, -600);
      await page.waitForTimeout(400);
    }
    await page.waitForTimeout(2500);
  }
  if (scenario.interact === 'district-then-back') {
    // The scenario opens already focused on a district; reuse the project's
    // proven return-to-overview interaction instead of a text guess.
    await returnToWorld(page);
    await page.waitForTimeout(2000);
  }

  await page.evaluate(() => {
    // SAFETY: private probe slot written by the init script above.
    const host = window as unknown as {
      __cityRuntime?: { frames: unknown[]; longTasks: number[] };
    };
    if (host.__cityRuntime) {
      host.__cityRuntime.frames.length = 0;
      host.__cityRuntime.longTasks.length = 0;
    }
  });
  await page.waitForTimeout(SAMPLE_MS);
  const dump = await readRuntime(page);
  await page.close();
  return {
    scenario: scenario.id,
    path: scenario.path,
    device: scenario.device,
    viewport: scenario.viewport,
    summary: summarise(dump),
  };
}

const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--enable-precise-memory-info'],
});
const results: unknown[] = [];
const queue: Scenario[] = [...scenarios];
if (idleSeconds > 0) {
  queue.push({
    id: `idle-${idleSeconds}s-desktop`,
    path: '/?perf=1',
    viewport: { width: 1600, height: 1000 },
    device: 'desktop',
  });
}

for (const scenario of queue) {
  const isIdle = scenario.id.startsWith('idle-');
  const context = await browser.newContext({
    viewport: scenario.viewport,
    reducedMotion: 'reduce',
    deviceScaleFactor: 1,
  });
  await context.addInitScript({ content: INSTRUMENT });
  if (isIdle) {
    const idleContext = context;
    const page = await idleContext.newPage();
    await page.goto(baseURL + scenario.path, {
      waitUntil: 'load',
      timeout: 120_000,
    });
    await page
      .waitForFunction(
        () =>
          Boolean(
            (window as { __cityDiagnostics?: unknown }).__cityDiagnostics,
          ),
        {
          timeout: 180_000,
        },
      )
      .catch(() => undefined);
    await page.waitForTimeout(6000);
    await page.evaluate(() => {
      // SAFETY: private probe slot written by the init script above.
      const host = window as unknown as {
        __cityRuntime?: { frames: unknown[]; longTasks: number[] };
      };
      if (host.__cityRuntime) {
        host.__cityRuntime.frames.length = 0;
        host.__cityRuntime.longTasks.length = 0;
      }
    });
    await page.waitForTimeout(idleSeconds * 1000);
    const dump = await readRuntime(page);
    results.push({
      scenario: scenario.id,
      path: scenario.path,
      device: scenario.device,
      viewport: scenario.viewport,
      summary: summarise(dump),
    });
    await context.close();
    continue;
  }
  results.push(await runScenario(context, scenario));
  await context.close();
}
await browser.close();

const output = {
  label,
  baseURL,
  measuredAt: new Date().toISOString(),
  sampleWindowMs: SAMPLE_MS,
  host: {
    platform: platform(),
    release: release(),
    cpu: cpus()[0]?.model ?? 'unknown',
    logicalCores: cpus().length,
    totalMemoryBytes: totalmem(),
  },
  caveat:
    'Headless Chromium in this environment renders WebGL in software (SwiftShader). Draw calls, triangles and main-thread JS time are meaningful; absolute frame times are a lower bound, not target-hardware performance.',
  results,
};
writeFileSync(
  join(outDir, `${label}.json`),
  JSON.stringify(output, null, 2) + '\n',
);
console.log('wrote', join(outDir, `${label}.json`));
