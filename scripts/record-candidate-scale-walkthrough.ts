/**
 * Record candidate-focus and architectural-scale walkthrough videos.
 *
 * Usage:
 *   npx tsx scripts/record-candidate-scale-walkthrough.ts
 *
 * Headless Chromium uses SwiftShader. This records interaction continuity and
 * layout, not hardware-GPU frame rate.
 */
import { mkdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { type BrowserContext, chromium, type Page } from '@playwright/test';
import { focusAdmin } from './lib/city-ui';

const baseURL = process.env.CAPTURE_BASE_URL ?? 'http://127.0.0.1:4321';
const outDir = join(
  process.cwd(),
  'reports',
  'visual',
  'candidate-scale',
  'after',
);
mkdirSync(outDir, { recursive: true });

type CameraView = {
  position: [number, number, number];
  target?: [number, number, number];
  zoom: number;
};

type WorldBridge = {
  advance: (seconds: number) => void;
  actors: () => Array<{
    slug: string;
    displayName: string;
    currentAdminId: string;
    behavior: string;
    position: { x: number; z: number };
  }>;
  camera?: () => CameraView;
  heroVisible?: () => boolean;
};

const browser = await chromium.launch({
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
  ],
});

async function ready(page: Page, url: string, delay = 5_000) {
  await page.goto(baseURL + url, { waitUntil: 'domcontentloaded' });
  await page
    .locator('[data-testid="city-explorer"][data-hydrated="true"]')
    .waitFor({ timeout: 45_000 });
  await page.locator('canvas').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(delay);
}

async function camera(page: Page) {
  return page.evaluate(() => {
    const world = (window as Window & { __kaohsiungWorld?: WorldBridge })
      .__kaohsiungWorld;
    return world?.camera?.();
  });
}

async function heroVisible(page: Page) {
  return page.evaluate(() => {
    const world = (window as Window & { __kaohsiungWorld?: WorldBridge })
      .__kaohsiungWorld;
    return world?.heroVisible?.();
  });
}

async function actorScale(page: Page, slug: string) {
  return page.evaluate((id) => {
    const bridge = window as Window & {
      __kaohsiungActorScale?: (slug: string) => number | null;
    };
    return bridge.__kaohsiungActorScale?.(id) ?? null;
  }, slug);
}

async function waitForCameraSettled(page: Page) {
  let previous: CameraView | null = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const current = await camera(page);
    if (!current) continue;
    if (
      previous &&
      Math.abs(current.zoom - previous.zoom) < 0.002 &&
      Math.hypot(
        current.position[0] - previous.position[0],
        current.position[2] - previous.position[2],
      ) < 0.002 &&
      current.target &&
      previous.target &&
      Math.hypot(
        current.target[0] - previous.target[0],
        current.target[2] - previous.target[2],
      ) < 0.002
    ) {
      return current;
    }
    previous = current;
    await page.waitForTimeout(300);
  }
  throw new Error('camera did not settle');
}

async function waitForFollowTarget(page: Page, slug: string) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const state = await page.evaluate((id) => {
      const world = (window as Window & { __kaohsiungWorld?: WorldBridge })
        .__kaohsiungWorld;
      const actor = world?.actors().find((item) => item.slug === id);
      return { actor, view: world?.camera?.() };
    }, slug);
    const target = state.view?.target;
    if (
      state.actor &&
      target &&
      Math.hypot(
        target[0] - state.actor.position.x,
        target[2] - state.actor.position.z,
      ) < 0.35
    ) {
      return;
    }
    await page.waitForTimeout(300);
  }
  throw new Error('camera did not follow candidate');
}

async function selectCandidate(page: Page, name: string, slug: string) {
  await waitForCameraSettled(page);
  await page.locator('#candidate-search').fill(name);
  const result = page.locator('.city-search__results .city-candidate').first();
  await result.waitFor({ state: 'visible', timeout: 20_000 });
  await result.click();
  await page.waitForTimeout(1_500);
  await waitForFollowTarget(page, slug);
  await page.waitForTimeout(1_200);
}

async function dragCanvas(page: Page, dx: number, dy: number) {
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('canvas has no bounding box');
  const x = box.x + box.width * 0.5;
  const y = box.y + box.height * 0.55;
  await page.mouse.move(x, y);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(x + dx, y + dy, { steps: 16 });
  await page.mouse.up({ button: 'left' });
  await page.waitForTimeout(1_000);
}

async function saveVideo(context: BrowserContext, page: Page, name: string) {
  const video = page.video();
  if (!video) throw new Error('Playwright did not record a video');
  await context.close();
  const recorded = await video.path();
  const target = join(outDir, name);
  rmSync(target, { force: true });
  renameSync(recorded, target);
  console.log('Wrote', target);
}

const desktopContext = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  reducedMotion: 'no-preference',
  recordVideo: {
    dir: join(process.cwd(), 'tmp', 'candidate-scale-desktop-video'),
    size: { width: 1600, height: 1000 },
  },
});
const desktop = desktopContext.pages()[0] ?? (await desktopContext.newPage());
await ready(desktop, '/');
await waitForCameraSettled(desktop);
const citywide = await camera(desktop);
await dragCanvas(desktop, 160, 80);
await desktop.waitForTimeout(900);

await desktop.waitForTimeout(800);
await focusAdmin(desktop, '左營');
await desktop.waitForTimeout(8_000);
await waitForCameraSettled(desktop);
const zuoying = await camera(desktop);
await dragCanvas(desktop, 620, 280);
await desktop.waitForTimeout(1_800);
const pannedAway = {
  camera: await camera(desktop),
  heroVisible: await heroVisible(desktop),
};
await dragCanvas(desktop, -620, -280);
await desktop.waitForTimeout(1_800);
const pannedBack = {
  camera: await camera(desktop),
  heroVisible: await heroVisible(desktop),
};

const beforeMayor = await camera(desktop);
const normalScale = await actorScale(desktop, 'kaohsiung-council-04-23bd0041');
await selectCandidate(desktop, '洪方隆', 'hong-fang-long-2026');
const mayorInHero = await camera(desktop);
const mayorState = {
  heroVisible: await heroVisible(desktop),
  mayorScale: await actorScale(desktop, 'hong-fang-long-2026'),
  councilScale: await actorScale(desktop, 'kaohsiung-council-04-23bd0041'),
  normalScale,
};
await desktop
  .locator('[data-testid="profile-panel"]')
  .waitFor({ state: 'visible' });
await desktop.waitForTimeout(1_200);
await desktop.getByRole('button', { name: '關閉人物資料' }).click();
await desktop.waitForTimeout(1_800);

await ready(desktop, '/?focus=zuoying-old-street', 6_000);
await waitForCameraSettled(desktop);
const oldStreet = await camera(desktop);
await desktop.waitForTimeout(1_800);

await ready(desktop, '/?focus=dragon-tiger-pagodas', 6_000);
await waitForCameraSettled(desktop);
const pagodas = await camera(desktop);
await desktop.waitForTimeout(1_500);

await ready(desktop, '/?admin=E03', 6_000);
await waitForCameraSettled(desktop);
await desktop.evaluate(() => {
  const world = (window as Window & { __kaohsiungWorld?: WorldBridge })
    .__kaohsiungWorld;
  world?.advance(7_200);
});
await desktop.waitForTimeout(1_000);
await selectCandidate(desktop, '賴瑞隆', 'lai-rui-long-2026');
const outsideActor = await desktop.evaluate(() => {
  const world = (window as Window & { __kaohsiungWorld?: WorldBridge })
    .__kaohsiungWorld;
  return world?.actors().find((item) => item.slug === 'lai-rui-long-2026');
});
await desktop
  .locator('[data-testid="profile-panel"]')
  .waitFor({ state: 'visible' });
await desktop.waitForTimeout(2_500);
const outsideHero = {
  camera: await camera(desktop),
  heroVisible: await heroVisible(desktop),
  actor: outsideActor,
};

console.log(
  'desktop',
  JSON.stringify({
    brand: await desktop.locator('.brand-lockup__title').first().textContent(),
    citywide,
    zuoying,
    pannedAway,
    pannedBack,
    beforeMayor,
    mayorInHero,
    ...mayorState,
    oldStreet,
    pagodas,
    outsideHero,
  }),
);
await saveVideo(desktopContext, desktop, 'walkthrough-desktop.webm');

const mobileContext = await browser.newContext({
  viewport: { width: 390, height: 844 },
  reducedMotion: 'no-preference',
  isMobile: true,
  hasTouch: true,
  recordVideo: {
    dir: join(process.cwd(), 'tmp', 'candidate-scale-mobile-video'),
    size: { width: 390, height: 844 },
  },
});
const mobile = mobileContext.pages()[0] ?? (await mobileContext.newPage());
await ready(mobile, '/?admin=E03', 7_000);
await waitForCameraSettled(mobile);
const mobileBefore = await camera(mobile);
await selectCandidate(mobile, '洪方隆', 'hong-fang-long-2026');
const mobileAfter = await camera(mobile);
await mobile
  .locator('[data-testid="profile-panel"]')
  .waitFor({ state: 'visible' });
await mobile.waitForTimeout(2_000);
console.log(
  'mobile',
  JSON.stringify({
    brand: await mobile.locator('.brand-lockup__title').first().textContent(),
    before: mobileBefore,
    after: mobileAfter,
    heroVisible: await heroVisible(mobile),
    scale: await actorScale(mobile, 'hong-fang-long-2026'),
  }),
);
await saveVideo(mobileContext, mobile, 'walkthrough-mobile.webm');

await browser.close();
