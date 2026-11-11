/**
 * Capture candidate-focus and architectural-scale evidence.
 *
 * Usage:
 *   npx tsx scripts/capture-candidate-scale.ts
 *
 * Headless Chromium runs on SwiftShader. These are behavioural and visual
 * captures, not hardware-GPU performance proof.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page } from '@playwright/test';

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
    role: string;
    currentAdminId: string;
    behavior: string;
    position: { x: number; z: number };
  }>;
  camera?: () => CameraView;
  heroVisible?: () => boolean;
};

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader'],
});

async function ready(page: Page, url: string, delay = 5_000) {
  await page.goto(baseURL + url, { waitUntil: 'domcontentloaded' });
  await page
    .locator('[data-testid="city-explorer"][data-hydrated="true"]')
    .waitFor({ timeout: 45_000 });
  await page.locator('canvas').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(delay);
}

async function waitForCameraSettled(page: Page) {
  let previous: CameraView | null = null;
  for (let attempt = 0; attempt < 30; attempt += 1) {
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
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const state = await page.evaluate((id) => {
      const world = (window as Window & { __kaohsiungWorld?: WorldBridge })
        .__kaohsiungWorld;
      const actor = world?.actors().find((item) => item.slug === id);
      const view = world?.camera?.();
      return { actor, view };
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
  throw new Error(`camera did not follow ${slug}`);
}

async function shot(page: Page, name: string) {
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(outDir, name), fullPage: false });
  console.log('wrote', name);
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

async function selectCandidate(page: Page, name: string, slug: string) {
  await waitForCameraSettled(page);
  await page.locator('#candidate-search').fill(name);
  const result = page.locator('.city-search__results .city-candidate').first();
  await result.waitFor({ state: 'visible', timeout: 20_000 });
  await result.click();
  await page.waitForTimeout(1_500);
  await waitForFollowTarget(page, slug);
  await waitForCameraSettled(page);
  const focus = await page
    .locator('[data-testid="city-explorer"]')
    .getAttribute('data-scene-focus');
  if (focus !== `candidate-${slug}`) {
    throw new Error(`expected candidate-${slug}, got ${focus}`);
  }
}

async function desktop() {
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
  });
  const page = context.pages()[0] ?? (await context.newPage());

  await ready(page, '/');
  await waitForCameraSettled(page);
  await shot(page, '01-citywide.png');
  console.log('citywide', JSON.stringify(await camera(page)));

  await ready(page, '/?admin=E03');
  await waitForCameraSettled(page);
  await shot(page, '02-zuoying.png');
  console.log('zuoying', JSON.stringify(await camera(page)));

  await ready(page, '/?admin=E04');
  await waitForCameraSettled(page);
  await shot(page, '03-nanzih.png');
  console.log('nanzih', JSON.stringify(await camera(page)));

  await ready(page, '/?focus=dragon-tiger-pagodas');
  await waitForCameraSettled(page);
  await shot(page, '04-dragon-tiger-pagodas.png');
  console.log('pagodas', JSON.stringify(await camera(page)));

  await ready(page, '/?focus=zuoying-old-street');
  await waitForCameraSettled(page);
  await shot(page, '05-zuoying-old-street.png');
  console.log('old-street', JSON.stringify(await camera(page)));

  await ready(page, '/?admin=E03');
  await waitForCameraSettled(page);
  const beforeMayor = await camera(page);
  const normalScale = await actorScale(page, 'kaohsiung-council-04-23bd0041');
  await selectCandidate(page, '洪方隆', 'hong-fang-long-2026');
  const afterMayor = await camera(page);
  console.log(
    'mayor-in-hero',
    JSON.stringify({
      before: beforeMayor,
      after: afterMayor,
      heroVisible: await heroVisible(page),
      mayorScale: await actorScale(page, 'hong-fang-long-2026'),
      councilScale: await actorScale(page, 'kaohsiung-council-04-23bd0041'),
      normalScale,
    }),
  );
  await shot(page, '06-mayor-in-hero.png');

  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('canvas has no bounding box');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 30; i += 1) {
    await page.mouse.wheel(0, -700);
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(900);
  console.log(
    'selected-close',
    JSON.stringify({
      camera: await camera(page),
      mayorScale: await actorScale(page, 'hong-fang-long-2026'),
    }),
  );
  await shot(page, '07-selected-avatar-close.png');

  await ready(page, '/?admin=E03');
  await waitForCameraSettled(page);
  const beforeOutside = await camera(page);
  await page.evaluate(() => {
    const world = (window as Window & { __kaohsiungWorld?: WorldBridge })
      .__kaohsiungWorld;
    world?.advance(7_200);
  });
  await page.waitForTimeout(1_000);
  await selectCandidate(page, '賴瑞隆', 'lai-rui-long-2026');
  const actor = await page.evaluate(() => {
    const world = (window as Window & { __kaohsiungWorld?: WorldBridge })
      .__kaohsiungWorld;
    return world?.actors().find((item) => item.slug === 'lai-rui-long-2026');
  });
  console.log(
    'mayor-outside-hero',
    JSON.stringify({
      before: beforeOutside,
      after: await camera(page),
      heroVisible: await heroVisible(page),
      actor,
    }),
  );
  await shot(page, '08-mayor-outside-hero.png');

  await ready(page, '/', 4_000);
  await waitForCameraSettled(page);
  const beforeCitywide = await camera(page);
  await selectCandidate(page, '張靜', 'zhang-jing-2026');
  console.log(
    'citywide-candidate',
    JSON.stringify({
      before: beforeCitywide,
      after: await camera(page),
      heroVisible: await heroVisible(page),
    }),
  );
  await shot(page, '09-citywide-candidate.png');

  await context.close();
}

async function mobile() {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  const page = context.pages()[0] ?? (await context.newPage());
  await ready(page, '/', 5_000);
  await shot(page, '10-mobile-citywide.png');
  console.log('mobile-citywide', JSON.stringify(await camera(page)));

  await ready(page, '/?admin=E03', 5_000);
  await selectCandidate(page, '洪方隆', 'hong-fang-long-2026');
  console.log(
    'mobile-mayor',
    JSON.stringify({
      camera: await camera(page),
      heroVisible: await heroVisible(page),
      scale: await actorScale(page, 'hong-fang-long-2026'),
    }),
  );
  await shot(page, '11-mobile-mayor-focus.png');
  await context.close();
}

await desktop();
await mobile();
await browser.close();
