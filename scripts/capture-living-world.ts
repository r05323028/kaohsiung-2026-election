/**
 * Capture living-world behavioural evidence from a running dev or preview server.
 *
 * Usage:
 *   CAPTURE_BASE_URL=http://127.0.0.1:4323 npx tsx scripts/capture-living-world.ts
 *
 * Headless Chromium in this environment uses SwiftShader. Screenshots prove
 * visible state and route placement, not hardware-GPU frame rate.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Browser, chromium, type Page } from '@playwright/test';

const baseURL = process.env.CAPTURE_BASE_URL ?? 'http://127.0.0.1:4321';
const label = process.argv.includes('--label')
  ? (process.argv[process.argv.indexOf('--label') + 1] ?? 'living-world')
  : 'living-world';
const outDir = join(process.cwd(), 'reports', 'visual', label);
mkdirSync(outDir, { recursive: true });

const COUNCIL = 'kaohsiung-council-04-23bd0041';
const MAYOR = 'zhang-jing-2026';

type Actor = {
  slug: string;
  displayName: string;
  role: string;
  currentAdminId: string | null;
  currentAdminName: string | null;
  allowedAdminIds: string[];
  position: { x: number; z: number };
  behavior: string;
  state: string;
  heading: number;
  routeValid: boolean;
  routeWarnings: string[];
  districtTransitions: number;
  territoryRejections: number;
  followingUser: boolean;
  note: string;
};

type BridgeState = {
  actors: Actor[];
  stats: Record<string, unknown>;
  camera: { position: [number, number, number]; zoom: number };
};

type Shot = {
  name: string;
  path: string;
  viewport: { width: number; height: number };
  note: string;
  action?: (page: Page) => Promise<unknown>;
};

async function bridgeState(page: Page): Promise<BridgeState> {
  return page.evaluate(() => {
    // SAFETY: CityScene installs this test bridge after the canvas mounts.
    const world = (
      window as Window & {
        __kaohsiungWorld?: {
          actors: () => Actor[];
          stats: () => Record<string, unknown>;
          camera: () => BridgeState['camera'];
        };
      }
    ).__kaohsiungWorld;
    if (!world) throw new Error('world bridge not ready');
    return {
      actors: world.actors(),
      stats: world.stats(),
      camera: world.camera(),
    };
  });
}

async function advance(page: Page, seconds: number) {
  await page.evaluate((amount) => {
    // SAFETY: CityScene installs this test bridge after the canvas mounts.
    const world = (
      window as Window & {
        __kaohsiungWorld?: { advance: (value: number) => void };
      }
    ).__kaohsiungWorld;
    world?.advance(amount);
  }, seconds);
  await page.waitForTimeout(80);
}

async function openPage(
  browser: Browser,
  path: string,
  viewport: { width: number; height: number },
) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: viewport.width < 600 ? 2 : 1,
    reducedMotion: 'no-preference',
  });
  const page = await context.newPage();
  await page.goto(`${baseURL}${path}`, { waitUntil: 'domcontentloaded' });
  await page
    .locator('[data-testid="city-explorer"][data-hydrated="true"]')
    .waitFor({ timeout: 30_000 });
  await page.locator('canvas').waitFor({ timeout: 30_000 });
  await page.waitForFunction(
    () => Boolean((window as { __kaohsiungWorld?: unknown }).__kaohsiungWorld),
    { timeout: 30_000 },
  );
  await page.waitForTimeout(2_500);
  return { context, page };
}

async function councilShot(page: Page) {
  const visited = new Set<string>();
  for (let round = 0; round < 80; round += 1) {
    const state = await bridgeState(page);
    const actor = state.actors.find((item) => item.slug === COUNCIL);
    if (!actor) throw new Error('council actor missing');
    if (actor.currentAdminId) visited.add(actor.currentAdminId);
    if (actor.behavior === 'walking' && actor.currentAdminId === 'E03') {
      await page.waitForTimeout(1_200);
      return { actor, visited: [...visited], state };
    }
    await advance(page, 6);
  }
  throw new Error('council actor did not reach a walking state in 左營');
}

async function crossingShot(page: Page) {
  const visited = new Set<string>();
  for (let round = 0; round < 100; round += 1) {
    const state = await bridgeState(page);
    const actor = state.actors.find((item) => item.slug === COUNCIL);
    if (!actor) throw new Error('council actor missing');
    if (actor.currentAdminId) visited.add(actor.currentAdminId);
    if (actor.currentAdminId === 'E04' && actor.districtTransitions > 0) {
      await page.waitForTimeout(1_200);
      return { actor, visited: [...visited], state };
    }
    await advance(page, 8);
  }
  throw new Error('council actor did not cross into 楠梓');
}

async function boundaryAudit(page: Page) {
  const visited = new Set<string>();
  let actor: Actor | null = null;
  for (let round = 0; round < 90; round += 1) {
    const state = await bridgeState(page);
    actor = state.actors.find((item) => item.slug === COUNCIL) ?? null;
    if (!actor) throw new Error('council actor missing');
    if (actor.currentAdminId) visited.add(actor.currentAdminId);
    await advance(page, 20);
  }
  const finalState = await bridgeState(page);
  const finalActor = finalState.actors.find((item) => item.slug === COUNCIL);
  if (!finalActor) throw new Error('council actor missing after audit');
  const unauthorized = [...visited].filter(
    (id) => id !== 'E03' && id !== 'E04',
  );
  if (unauthorized.length > 0) {
    throw new Error(
      `council actor entered unauthorized districts: ${unauthorized.join(',')}`,
    );
  }
  await page.waitForTimeout(1_200);
  return {
    actor: finalActor,
    visited: [...visited],
    unauthorized,
    territoryRejections: finalActor.territoryRejections,
    elapsedSeconds: finalState.stats.elapsedSeconds,
  };
}

async function mayorShot(page: Page) {
  const visited = new Set<string>();
  for (let round = 0; round < 300; round += 1) {
    const state = await bridgeState(page);
    const actor = state.actors.find((item) => item.slug === MAYOR);
    if (!actor) throw new Error('mayor actor missing');
    if (actor.currentAdminId) visited.add(actor.currentAdminId);
    if (actor.currentAdminId === 'E19') {
      await page.waitForTimeout(1_200);
      return { actor, visited: [...visited], state };
    }
    await advance(page, 20);
  }
  throw new Error('mayor actor did not reach 岡山');
}

async function pauseAndResume(page: Page) {
  let pausedActor: Actor | null = null;
  for (let round = 0; round < 240; round += 1) {
    const state = await bridgeState(page);
    const actor = state.actors.find((item) => item.slug === COUNCIL);
    if (!actor) throw new Error('council actor missing');
    if (
      ['pausing', 'observing', 'turning', 'arriving'].includes(actor.behavior)
    ) {
      pausedActor = { ...actor };
      break;
    }
    await advance(page, 1);
  }
  if (!pausedActor) throw new Error('no pause/turn state observed');
  await page.waitForTimeout(1_000);
  const pausedPath = join(outDir, '05a-council-stop-and-turn.png');
  await page.screenshot({
    path: pausedPath,
    fullPage: false,
    timeout: 120_000,
  });

  for (let round = 0; round < 120; round += 1) {
    const state = await bridgeState(page);
    const actor = state.actors.find((item) => item.slug === COUNCIL);
    if (actor?.behavior === 'walking') {
      await page.waitForTimeout(1_000);
      const resumedPath = join(outDir, '05b-council-resume.png');
      await page.screenshot({
        path: resumedPath,
        fullPage: false,
        timeout: 120_000,
      });
      return { pausedActor, resumedActor: actor };
    }
    await advance(page, 1);
  }
  throw new Error('actor did not resume walking');
}

async function followCamera(page: Page) {
  let before: BridgeState | null = null;
  for (let round = 0; round < 100; round += 1) {
    const state = await bridgeState(page);
    const actor = state.actors.find((item) => item.slug === COUNCIL);
    if (actor?.behavior === 'walking') {
      before = state;
      break;
    }
    await advance(page, 2);
  }
  if (!before) throw new Error('actor never walked for camera test');
  await page.evaluate(() => {
    // SAFETY: CityScene installs this test bridge after the canvas mounts.
    const world = (
      window as Window & {
        __kaohsiungWorld?: { advance: (value: number) => void };
      }
    ).__kaohsiungWorld;
    world?.advance(20);
  });
  await page.waitForTimeout(2_000);
  const after = await bridgeState(page);
  const beforeActor = before.actors.find((item) => item.slug === COUNCIL);
  const afterActor = after.actors.find((item) => item.slug === COUNCIL);
  if (!beforeActor || !afterActor)
    throw new Error('actor missing around camera test');
  const actorMoved = Math.hypot(
    afterActor.position.x - beforeActor.position.x,
    afterActor.position.z - beforeActor.position.z,
  );
  const cameraMoved = Math.hypot(
    after.camera.position[0] - before.camera.position[0],
    after.camera.position[2] - before.camera.position[2],
  );
  if (actorMoved <= 0.005 || cameraMoved <= 0.001) {
    throw new Error(
      `camera did not follow: actor ${actorMoved}, camera ${cameraMoved}`,
    );
  }
  return { before, after, actorMoved, cameraMoved };
}

async function persistenceAudit(page: Page) {
  const initial = await bridgeState(page);
  const initialActor = initial.actors.find((item) => item.slug === COUNCIL);
  if (!initialActor)
    throw new Error('council actor missing before persistence audit');
  await page.locator('.city-zones button').filter({ hasText: '全城' }).click();
  await page.waitForTimeout(2_500);
  await page.locator('.city-zones button').filter({ hasText: '左營' }).click();
  await page.waitForTimeout(3_000);
  // Re-open the same profile after the district switch to show that the actor
  // survived the scene transition and kept its simulation state.
  await page.locator('#candidate-search').fill(initialActor.displayName);
  await page.locator('.city-search__results button').first().click();
  await page.waitForTimeout(2_000);
  const after = await bridgeState(page);
  const afterActor = after.actors.find((item) => item.slug === COUNCIL);
  if (!afterActor)
    throw new Error('council actor missing after district switch');
  if (afterActor.slug !== initialActor.slug)
    throw new Error('actor identity changed');
  const elapsedDelta =
    Number(after.stats.elapsedSeconds) - Number(initial.stats.elapsedSeconds);
  if (elapsedDelta <= 0)
    throw new Error('simulation did not continue across switch');
  return { initialActor, afterActor, elapsedDelta };
}

const shots: Shot[] = [
  {
    name: '01-council-walking-zuoying',
    path: `/?district=kaohsiung-council-04&candidate=${COUNCIL}`,
    viewport: { width: 1600, height: 1000 },
    note: '議員第4選舉區 candidate walking on the 左營 hero network with follow camera.',
    action: councilShot,
  },
  {
    name: '02-council-crossing-nanzih',
    path: `/?district=kaohsiung-council-04&candidate=${COUNCIL}`,
    viewport: { width: 1600, height: 1000 },
    note: 'The same council-04 candidate after crossing the river bridge into 楠梓 on a validated graph edge.',
    action: crossingShot,
  },
  {
    name: '03-council-boundary-audit',
    path: `/?district=kaohsiung-council-04&candidate=${COUNCIL}`,
    viewport: { width: 1600, height: 1000 },
    note: 'Council-04 after 1,800 simulated seconds: only E03/E04 visited, unauthorized district entries rejected.',
    action: boundaryAudit,
  },
  {
    name: '04-mayor-multi-district',
    path: `/?district=kaohsiung-mayor-2026&candidate=${MAYOR}`,
    viewport: { width: 1600, height: 1000 },
    note: '市長 candidate reaches 岡山 through 左營, 楠梓 and 橋頭 using official gate nodes.',
    action: mayorShot,
  },
  {
    name: '05a-council-stop-and-turn',
    path: `/?district=kaohsiung-council-04&candidate=${COUNCIL}`,
    viewport: { width: 1600, height: 1000 },
    note: 'A council-04 actor paused or turning at a graph node instead of looping continuously.',
    action: async (page) => {
      const result = await pauseAndResume(page);
      return result;
    },
  },
  {
    name: '06-camera-follow',
    path: `/?district=kaohsiung-council-04&candidate=${COUNCIL}`,
    viewport: { width: 1600, height: 1000 },
    note: 'Camera and actor positions before and after 20 simulated seconds of follow mode.',
    action: followCamera,
  },
  {
    name: '07-state-persistence',
    path: `/?district=kaohsiung-council-04&candidate=${COUNCIL}`,
    viewport: { width: 1600, height: 1000 },
    note: 'Same actor identity and continuing simulation after switching to 全城 and back to 左營.',
    action: persistenceAudit,
  },
  {
    name: '08-mobile-candidate-selection',
    path: `/?district=kaohsiung-council-04&candidate=${COUNCIL}`,
    viewport: { width: 390, height: 844 },
    note: 'Mobile candidate selection. The profile panel fills the mobile viewport by design; follow-camera movement is measured through the test bridge and recorded in evidence.',
    action: async (page) => {
      const before = await bridgeState(page);
      const beforeActor = before.actors.find((item) => item.slug === COUNCIL);
      if (!beforeActor) throw new Error('mobile council actor missing');
      await page.evaluate(() => {
        const world = (
          window as Window & {
            __kaohsiungWorld?: { advance: (value: number) => void };
          }
        ).__kaohsiungWorld;
        world?.advance(20);
      });
      await page.waitForTimeout(2_000);
      const after = await bridgeState(page);
      const afterActor = after.actors.find((item) => item.slug === COUNCIL);
      if (!afterActor)
        throw new Error('mobile council actor missing after advance');
      const actorMoved = Math.hypot(
        afterActor.position.x - beforeActor.position.x,
        afterActor.position.z - beforeActor.position.z,
      );
      const cameraMoved = Math.hypot(
        after.camera.position[0] - before.camera.position[0],
        after.camera.position[2] - before.camera.position[2],
      );
      if (actorMoved <= 0.005 || cameraMoved <= 0.001) {
        throw new Error(
          `mobile camera did not follow: actor ${actorMoved}, camera ${cameraMoved}`,
        );
      }
      return {
        actor: afterActor,
        cameraBefore: before.camera,
        cameraAfter: after.camera,
        actorMoved,
        cameraMoved,
      };
    },
  },
  {
    name: '09a-world-overview',
    path: '/',
    viewport: { width: 1600, height: 1000 },
    note: 'Citywide overview before entering the hero scene.',
    action: async (page) => {
      const state = await bridgeState(page);
      return { stats: state.stats };
    },
  },
  {
    name: '09b-hero-zuoying',
    path: '/',
    viewport: { width: 1600, height: 1000 },
    note: 'World-to-hero streaming transition after choosing the 左營 zone.',
    action: async (page) => {
      await page
        .locator('.city-zones button')
        .filter({ hasText: '左營' })
        .click();
      await page.waitForTimeout(10_000);
      const state = await bridgeState(page);
      return { stats: state.stats };
    },
  },
  {
    name: '10-performance-diagnostics',
    path: '/?perf=1',
    viewport: { width: 1600, height: 1000 },
    note: 'SwiftShader diagnostics exported to window; nonrepresentative software rendering, not a physical-GPU lower bound. The HUD is not shown in this build.',
    action: async (page) => {
      await page.waitForTimeout(4_000);
      return page.evaluate(() => {
        const diagnostics = (
          window as {
            __cityDiagnostics?: Record<string, unknown>;
          }
        ).__cityDiagnostics;
        return { diagnostics: diagnostics ?? null };
      });
    },
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
  note: 'Screenshots are behavioural evidence from a fictional simulation. They are not campaign itineraries. FPS shown in the HUD is software-rendered and is not a hardware-GPU target.',
  captures: [] as Array<
    Shot & {
      file: string;
      dataSceneFocus: string;
      evidence: unknown;
      capturedAt: string;
    }
  >,
};

for (const shot of shots) {
  const { context, page } = await openPage(browser, shot.path, shot.viewport);
  let evidence: unknown = null;
  if (shot.action) evidence = await shot.action(page);
  const file = join(outDir, `${shot.name}.png`);
  await page.screenshot({ path: file, fullPage: false, timeout: 120_000 });
  const dataSceneFocus = await page
    .locator('[data-testid="city-explorer"]')
    .getAttribute('data-scene-focus');
  manifest.captures.push({
    ...shot,
    file: `reports/visual/${label}/${shot.name}.png`,
    dataSceneFocus: dataSceneFocus ?? '',
    evidence,
    capturedAt: new Date().toISOString(),
  });
  console.log(`${shot.name} focus=${dataSceneFocus ?? ''}`);
  await context.close();
}

writeFileSync(
  join(outDir, 'manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
console.log(`Wrote ${manifest.captures.length} captures to ${outDir}`);
await browser.close();
