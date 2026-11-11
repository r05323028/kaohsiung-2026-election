import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

type WorldBridge = {
  scene?: () => unknown;
  heroVisible?: () => boolean;
  hoveredLandmark?: () => string | null;
  camera?: () => unknown;
};

const baseURL = process.env.CAPTURE_BASE_URL ?? 'http://127.0.0.1:4321';
const outDir = join(
  process.cwd(),
  'reports',
  'visual',
  'district-integrity',
  'after',
);
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
  ],
});
const context = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 1,
  reducedMotion: 'reduce',
});
const page = await context.newPage();
const errors: string[] = [];
page.on('pageerror', (error) => errors.push(error.message));

async function open(url: string) {
  await page.goto(baseURL + url, { waitUntil: 'networkidle' });
  await page.waitForSelector(
    '[data-testid="city-explorer"][data-hydrated="true"]',
    { timeout: 30_000 },
  );
  await page.waitForFunction(
    () =>
      Boolean(
        (window as Window & { __kaohsiungWorld?: WorldBridge }).__kaohsiungWorld
          ?.scene,
      ),
    { timeout: 30_000 },
  );
  await page.waitForTimeout(7000);
}

async function snapshot(name: string) {
  await page.screenshot({ path: join(outDir, name) });
}

async function state() {
  return page.evaluate(() => ({
    scene: (
      window as Window & { __kaohsiungWorld?: WorldBridge }
    ).__kaohsiungWorld?.scene?.(),
    heroVisible: (
      window as Window & { __kaohsiungWorld?: WorldBridge }
    ).__kaohsiungWorld?.heroVisible?.(),
    camera: (
      window as Window & { __kaohsiungWorld?: WorldBridge }
    ).__kaohsiungWorld?.camera?.(),
    hoveredLandmark: (
      window as Window & { __kaohsiungWorld?: WorldBridge }
    ).__kaohsiungWorld?.hoveredLandmark?.(),
    hoverCards: document.querySelectorAll('.city-hover-card').length,
    districtHeading:
      document.querySelector('#scene-heading')?.textContent ?? null,
  }));
}

await open('/?admin=E03');
const zuoying = await state();
await snapshot('01-zuoying.png');

const canvas = page.locator('canvas').first();
const box = await canvas.boundingBox();
if (!box) throw new Error('city canvas has no bounding box');
let hoveredLandmark: string | null = null;
for (let row = 1; row < 8 && !hoveredLandmark; row += 1) {
  for (let column = 1; column < 10 && !hoveredLandmark; column += 1) {
    await page.mouse.move(
      box.x + (box.width * column) / 10,
      box.y + (box.height * row) / 8,
    );
    await page.waitForTimeout(50);
    hoveredLandmark = await page.evaluate(() => {
      return (
        (
          window as Window & { __kaohsiungWorld?: WorldBridge }
        ).__kaohsiungWorld?.hoveredLandmark?.() ?? null
      );
    });
  }
}
if (!hoveredLandmark) throw new Error('no landmark hovered');
await page.waitForTimeout(500);
const hoverState = await state();
await snapshot('02-hover-no-oval.png');

await open('/?admin=E04');
const nanzih = await state();
await snapshot('03-nanzih.png');

await open('/?perf=1');
const overview = await state();
await snapshot('04-overview.png');

await open('/?admin=E03');
await page.getByLabel('搜尋人物').fill('林海星');
await page.waitForTimeout(900);
const demoSearch = {
  resultButtons: await page.getByRole('button', { name: /林海星/ }).count(),
  emptyText: await page
    .locator('.city-search__empty')
    .textContent()
    .catch(() => null),
};
await snapshot('05-demo-search.png');

await page.getByLabel('搜尋人物').fill('張靜');
await page.waitForTimeout(900);
const officialSearch = {
  resultButtons: await page.getByRole('button', { name: /張靜/ }).count(),
};
await snapshot('06-official-search.png');

const mobile = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  reducedMotion: 'reduce',
});
const mobilePage = await mobile.newPage();
await mobilePage.goto(`${baseURL}/?admin=E03`, { waitUntil: 'networkidle' });
await mobilePage.waitForSelector(
  '[data-testid="city-explorer"][data-hydrated="true"]',
  { timeout: 30_000 },
);
await mobilePage.waitForFunction(
  () =>
    Boolean(
      (window as Window & { __kaohsiungWorld?: WorldBridge }).__kaohsiungWorld
        ?.scene,
    ),
  { timeout: 30_000 },
);
await mobilePage.waitForTimeout(7000);
await mobilePage.screenshot({ path: join(outDir, '07-mobile-zuoying.png') });
const mobileState = await mobilePage.evaluate(() => ({
  scene: (
    window as Window & { __kaohsiungWorld?: WorldBridge }
  ).__kaohsiungWorld?.scene?.(),
  camera: (
    window as Window & { __kaohsiungWorld?: WorldBridge }
  ).__kaohsiungWorld?.camera?.(),
}));

const manifest = {
  capturedAt: new Date().toISOString(),
  baseURL,
  renderer: 'ANGLE SwiftShader (software WebGL); not physical-GPU evidence',
  viewport: {
    desktop: { width: 1600, height: 1000 },
    mobile: { width: 390, height: 844 },
  },
  screenshots: [
    '01-zuoying.png',
    '02-hover-no-oval.png',
    '03-nanzih.png',
    '04-overview.png',
    '05-demo-search.png',
    '06-official-search.png',
    '07-mobile-zuoying.png',
  ],
  checks: {
    zuoying,
    hoverState,
    nanzih,
    overview,
    demoSearch,
    officialSearch,
    mobileState,
  },
  pageErrors: errors,
};
writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify(manifest, null, 2));

await mobile.close();
await context.close();
await browser.close();
