/**
 * Record the refined exploration walkthrough against a running dev server.
 *
 * Usage:
 *   npx tsx scripts/record-refine-walkthrough.ts
 *
 * Headless Chromium uses SwiftShader here, so this records interaction and
 * camera continuity, not hardware-GPU frame rate.
 */
import { mkdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { focusAdmin } from './lib/city-ui';

const baseURL = process.env.CAPTURE_BASE_URL ?? 'http://127.0.0.1:4321';
const outDir = join(process.cwd(), 'reports', 'visual', 'refine', 'after');
mkdirSync(outDir, { recursive: true });

type CameraView = {
  position: [number, number, number];
  target?: [number, number, number];
  zoom: number;
};

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

async function ready(page: import('@playwright/test').Page, url: string) {
  await page.goto(baseURL + url, { waitUntil: 'domcontentloaded' });
  await page
    .locator('[data-testid="city-explorer"][data-hydrated="true"]')
    .waitFor({ timeout: 45_000 });
  await page.locator('canvas').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(4_000);
}

async function camera(
  page: import('@playwright/test').Page,
): Promise<CameraView> {
  return (await page.evaluate(() => {
    const world = (
      window as unknown as {
        __kaohsiungWorld?: { camera?: () => CameraView };
      }
    ).__kaohsiungWorld;
    return world?.camera?.();
  })) as CameraView;
}

async function dragCanvas(
  page: import('@playwright/test').Page,
  dx: number,
  dy: number,
) {
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('canvas has no bounding box');
  const x = box.x + box.width * 0.5;
  const y = box.y + box.height * 0.55;
  await page.mouse.move(x, y);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(x + dx, y + dy, { steps: 14 });
  await page.mouse.up({ button: 'left' });
  await page.waitForTimeout(1_000);
}

async function saveVideo(
  context: import('@playwright/test').BrowserContext,
  page: import('@playwright/test').Page,
  name: string,
) {
  const video = page.video();
  if (!video) throw new Error('Playwright did not record a video');
  await context.close();
  const recorded = await video.path();
  const target = join(outDir, name);
  rmSync(target, { force: true });
  renameSync(recorded, target);
  console.log(`Wrote ${target}`);
}

const desktopContext = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  reducedMotion: 'no-preference',
  recordVideo: {
    dir: join(process.cwd(), 'tmp', 'refine-desktop-video'),
    size: { width: 1600, height: 1000 },
  },
});
const desktop = desktopContext.pages()[0] ?? (await desktopContext.newPage());
await ready(desktop, '/');
await desktop.waitForTimeout(1_500);
const citywide = await camera(desktop);

await dragCanvas(desktop, 190, 105);
const afterCitywideDrag = await camera(desktop);
const box = await desktop.locator('canvas').boundingBox();
if (box) {
  await desktop.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await desktop.mouse.wheel(0, -500);
  await desktop.waitForTimeout(1_200);
}
const afterCitywideZoom = await camera(desktop);

await desktop.waitForTimeout(700);
await focusAdmin(desktop, '左營');
await desktop.waitForTimeout(7_000);
const zuoying = await camera(desktop);

await dragCanvas(desktop, 150, 80);
const manualZuoying = await camera(desktop);

await desktop.locator('#candidate-search').fill('張靜');
await desktop.waitForTimeout(700);
await desktop.locator('.city-search__results .city-candidate').first().click();
await desktop.waitForTimeout(4_500);
const candidate = await camera(desktop);
await desktop
  .locator('[data-testid="profile-panel"]')
  .waitFor({ state: 'visible' });
await desktop.waitForTimeout(700);
const profile = await camera(desktop);
await desktop.getByRole('button', { name: '關閉人物資料' }).click();
await desktop.waitForTimeout(2_000);
const afterClose = await camera(desktop);

await desktop.getByRole('link', { name: '選舉區' }).first().click();
await desktop.waitForTimeout(2_000);
await desktop.getByRole('link', { name: '港都人物誌首頁' }).first().click();
await desktop
  .locator('[data-testid="city-explorer"][data-hydrated="true"]')
  .waitFor({ timeout: 45_000 });
await desktop.waitForTimeout(4_000);

console.log(
  'desktop',
  JSON.stringify({
    brand: await desktop.locator('.brand-lockup__title').first().textContent(),
    nav: await desktop.locator('.topbar__nav--desktop a').count(),
    citywide,
    afterCitywideDrag,
    afterCitywideZoom,
    zuoying,
    manualZuoying,
    candidate,
    profile,
    afterClose,
    restoredPath: new URL(desktop.url()).pathname,
  }),
);
await saveVideo(desktopContext, desktop, 'walkthrough-desktop.webm');

const mobileContext = await browser.newContext({
  viewport: { width: 390, height: 844 },
  reducedMotion: 'no-preference',
  isMobile: true,
  hasTouch: true,
  recordVideo: {
    dir: join(process.cwd(), 'tmp', 'refine-mobile-video'),
    size: { width: 390, height: 844 },
  },
});
const mobile = mobileContext.pages()[0] ?? (await mobileContext.newPage());
await ready(mobile, '/');
const menuButton = mobile.locator('.city-menu-button');
await menuButton.click();
await mobile.waitForTimeout(2_000);
await mobile.keyboard.press('Escape');
await mobile.waitForTimeout(900);

await mobile.waitForTimeout(700);
await focusAdmin(mobile, '左營');
await mobile.waitForTimeout(7_000);
const mobileZuoying = await camera(mobile);

const client = await mobileContext.newCDPSession(mobile);
await client.send('Input.dispatchTouchEvent', {
  type: 'touchStart',
  touchPoints: [{ x: 195, y: 430, id: 1 }],
});
for (let step = 1; step <= 6; step += 1) {
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: 195 + step * 12, y: 430 + step * 7, id: 1 }],
  });
}
await client.send('Input.dispatchTouchEvent', {
  type: 'touchEnd',
  touchPoints: [],
});
await mobile.waitForTimeout(1_200);
const mobilePanned = await camera(mobile);

console.log(
  'mobile',
  JSON.stringify({
    brand: await mobile.locator('.brand-lockup__title').first().textContent(),
    menuExpanded: await menuButton.getAttribute('aria-expanded'),
    focus: await mobile
      .locator('[data-testid="city-explorer"]')
      .getAttribute('data-scene-focus'),
    mobileZuoying,
    mobilePanned,
  }),
);
await saveVideo(mobileContext, mobile, 'walkthrough-mobile.webm');

await browser.close();
