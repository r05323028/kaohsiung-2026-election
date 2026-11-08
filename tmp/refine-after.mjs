import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const BASE = 'http://127.0.0.1:4321';
const out = 'reports/visual/refine/after';
await fs.mkdir(out, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader'],
});
const page = await browser.newPage({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 1,
});

async function open(url, wait = 6000) {
  await page.goto(BASE + url, { waitUntil: 'networkidle' });
  await page.locator('[data-testid="city-explorer"][data-hydrated="true"]').waitFor({ timeout: 30000 });
  await page.locator('canvas').waitFor({ timeout: 30000 });
  await page.waitForTimeout(wait);
}

async function camera() {
  return page.evaluate(() => window.__kaohsiungWorld?.camera?.() ?? null);
}

async function shot(name) {
  await page.screenshot({ path: out + '/' + name + '.png' });
  console.log(name, JSON.stringify({ camera: await camera(), focus: await page.locator('[data-testid="city-explorer"]').getAttribute('data-scene-focus') }));
}

await open('/');
await shot('01-citywide');
await open('/?admin=E03');
await shot('02-zuoying');
await open('/?admin=E04');
await shot('03-nanzih');
await open('/?focus=dragon-tiger-pagodas');
await shot('04-dragon-tiger-pagodas');
await open('/?focus=metropolitan-park');
await shot('05-nanzih-landmark');
await open('/?focus=harbor-front');
await shot('06-harbour');

async function selectMayor() {
  await page.locator('#candidate-search').fill('張靜');
  await page.waitForTimeout(700);
  const matches = await page.locator('.city-search__results .city-candidate').count();
  if (matches === 0) throw new Error('candidate search returned no result');
  await page.locator('.city-search__results .city-candidate').first().click();
  await page.waitForTimeout(6000);
}

await open('/?admin=E03');
const before = await camera();
await shot('07-candidate-before');
await selectMayor();
const after = await camera();
await shot('08-candidate-after');
console.log('candidate-zoom-change', JSON.stringify({ before, after }));
await page.locator('[data-testid="profile-panel"]').waitFor({ state: 'visible' });
await shot('09-candidate-profile');
await page.getByRole('button', { name: '關閉人物資料' }).click();
await page.waitForTimeout(4500);
await shot('10-candidate-closed');
console.log('candidate-close', JSON.stringify({ before, restored: await camera() }));

// Selecting from citywide must not force a different scale either.
await open('/');
const citywideBefore = await camera();
await selectMayor();
await shot('10b-citywide-candidate');
console.log('citywide-candidate-zoom', JSON.stringify({ citywideBefore, after: await camera() }));

// Drag behaviour from a focused district.
await open('/?admin=E03');
const dragBefore = await camera();
const box = await page.locator('canvas').boundingBox();
if (box) {
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.55);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(box.x + box.width * 0.55 + 220, box.y + box.height * 0.55 + 120, { steps: 12 });
  await page.mouse.up({ button: 'left' });
  await page.waitForTimeout(1000);
}
const dragAfter = await camera();
await shot('11-after-drag');
console.log('drag-camera', JSON.stringify({ dragBefore, dragAfter }));

const wheelBefore = await camera();
if (box) {
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.wheel(0, -600);
  await page.waitForTimeout(1400);
}
const wheelAfter = await camera();
await shot('12-after-wheel');
console.log('wheel-camera', JSON.stringify({ wheelBefore, wheelAfter }));

await page.goto(BASE + '/districts/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.screenshot({ path: out + '/13-info-appbar.png' });
console.log('info-header', JSON.stringify({
  brand: await page.locator('.brand-lockup__title').innerText(),
  subtitle: await page.locator('.brand-lockup__subtitle').innerText(),
  nav: await page.locator('.topbar__nav--desktop a').allInnerTexts(),
  active: await page.locator('.topbar__nav--desktop a[aria-current="page"]').innerText(),
}));

const mobile = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});
await mobile.goto(BASE + '/', { waitUntil: 'networkidle' });
await mobile.locator('[data-testid="city-explorer"][data-hydrated="true"]').waitFor({ timeout: 30000 });
await mobile.waitForTimeout(6500);
await mobile.screenshot({ path: out + '/14-mobile-explorer.png' });
await mobile.locator('.city-menu-button').click();
await mobile.waitForTimeout(600);
await mobile.screenshot({ path: out + '/15-mobile-menu.png' });
console.log('mobile-menu', JSON.stringify({
  expanded: await mobile.locator('.city-menu-button').getAttribute('aria-expanded'),
  links: await mobile.locator('.city-mobile-menu a').allInnerTexts(),
}));

await mobile.goto(BASE + '/districts/', { waitUntil: 'networkidle' });
await mobile.waitForTimeout(1000);
await mobile.screenshot({ path: out + '/16-mobile-info.png' });
await mobile.locator('.topbar-menu summary').click();
await mobile.waitForTimeout(400);
await mobile.screenshot({ path: out + '/17-mobile-info-menu.png' });
console.log('mobile-info-menu', JSON.stringify({
  links: await mobile.locator('.topbar-menu__nav a').allInnerTexts(),
  open: await mobile.locator('.topbar-menu').getAttribute('open'),
}));

await browser.close();
