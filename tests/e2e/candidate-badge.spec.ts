import { expect, type Page, test } from '@playwright/test';

// The selected candidate's name badge is an HTML overlay anchored to the crown
// of the GLB chibi. These specs pin the two regressions that used to ship: the
// badge sat at world y=0.8 (inside the head) and it carried a "模擬移動" label.
test.describe.configure({ timeout: 180_000 });

const MAYOR = 'zhang-jing-2026';
// 左營區 and 楠梓區 share council district 4, so the visible slug has to come
// from the world itself instead of a hardcoded fixture.
const ZUOYING = 'E03';
const NANZI = 'E04';

type WorldWindow = Window & {
  __kaohsiungActorLod?: () => {
    mode: 'detail' | 'overview';
    detailCount: number;
    overviewCount: number;
  };
  __kaohsiungActorScreenPosition?: (
    slug: string,
    anchor?: 'center' | 'head',
  ) => { x: number; y: number } | null;
  __kaohsiungCandidateVisibility?: () => {
    scope: 'citywide' | 'admin-district' | 'constituency';
    count: number;
    slugs: string[];
  };
  __kaohsiungWorld?: { camera: () => { zoom: number } };
};

type BadgeMetrics = {
  /** Screen pixels between the crown of the head and the bottom of the badge. */
  gap: number;
  /** Horizontal distance between the badge centre and the head centre. */
  centerOffset: number;
  text: string;
  childElements: number;
  fontSize: number;
  height: number;
  zoom: number;
};

async function openWorld(page: Page, path: string) {
  const separator = path.includes('?') ? '&' : '?';
  await page.goto(path + separator + 'quality=low');
  await expect(page.getByTestId('city-explorer')).toHaveAttribute(
    'data-hydrated',
    'true',
    { timeout: 30_000 },
  );
  await page.waitForFunction(
    () =>
      typeof (window as WorldWindow).__kaohsiungActorScreenPosition ===
        'function' &&
      typeof (window as WorldWindow).__kaohsiungActorLod === 'function',
    undefined,
    { timeout: 30_000 },
  );
}

async function badgeMetrics(
  page: Page,
  slug: string,
): Promise<BadgeMetrics | null> {
  return page.evaluate((candidate) => {
    const bridge = window as WorldWindow;
    const head = bridge.__kaohsiungActorScreenPosition?.(candidate, 'head');
    if (!head) return null;
    const tag = document.querySelector<HTMLElement>('.actor-name-tag');
    if (!tag) return null;
    const box = tag.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return null;
    return {
      gap: Math.round((head.y - box.bottom) * 100) / 100,
      centerOffset: Math.round((box.left + box.width / 2 - head.x) * 100) / 100,
      text: (tag.textContent ?? '').trim(),
      childElements: tag.childElementCount,
      fontSize: Number.parseFloat(getComputedStyle(tag).fontSize),
      height: Math.round(box.height * 100) / 100,
      zoom: bridge.__kaohsiungWorld?.camera().zoom ?? 0,
    };
  }, slug);
}

async function settleBadge(page: Page, slug: string): Promise<BadgeMetrics> {
  await expect.poll(async () => (await badgeMetrics(page, slug)) !== null, {
    timeout: 30_000,
  });
  // Give the follow camera a few frames to frame the selected character.
  await page.waitForTimeout(600);
  const metrics = await badgeMetrics(page, slug);
  if (!metrics) throw new Error(`badge metrics unavailable for ${slug}`);
  return metrics;
}

async function setZoom(page: Page, deltaY: number) {
  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas is not laid out');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, deltaY);
  await page.waitForTimeout(900);
}

function expectBadgeClearsHead(metrics: BadgeMetrics) {
  // A positive gap means the badge's bottom edge is above the crown.
  expect(metrics.gap).toBeGreaterThanOrEqual(4);
  // The gap is applied in CSS pixels, so it stays small at every zoom level
  // instead of floating away or sinking into the model.
  expect(metrics.gap).toBeLessThanOrEqual(18);
  expect(Math.abs(metrics.centerOffset)).toBeLessThanOrEqual(3);
}

async function firstVisibleSlug(page: Page, admin: string) {
  await openWorld(page, `/?admin=${admin}`);
  await expect
    .poll(
      async () =>
        page.evaluate(
          () =>
            (window as WorldWindow).__kaohsiungCandidateVisibility?.().slugs
              .length ?? 0,
        ),
      { timeout: 30_000 },
    )
    .toBeGreaterThan(0);
  const slug = await page.evaluate(
    () =>
      (window as WorldWindow).__kaohsiungCandidateVisibility?.().slugs[0] ??
      null,
  );
  if (!slug) throw new Error(`no candidate is visible in ${admin}`);
  return slug;
}

test('badge shows only the candidate name', async ({ page }) => {
  await openWorld(page, `/?candidate=${MAYOR}`);
  const badge = page.locator('.actor-name-tag');
  await expect(badge).toBeVisible();

  const name = await page
    .getByTestId('profile-panel')
    .locator('h2')
    .textContent();
  const metrics = await settleBadge(page, MAYOR);
  expect(metrics.text).toBe(name?.trim());
  expect(metrics.text).not.toContain('模擬移動');
  expect(metrics.childElements).toBe(0);
  await expect(badge.locator('small')).toHaveCount(0);
  // Compact pill, not a banner.
  expect(metrics.height).toBeLessThanOrEqual(28);
  expect(metrics.fontSize).toBeLessThanOrEqual(12);
});

test('badge keeps a constant clear gap at every zoom level', async ({
  page,
}) => {
  await openWorld(page, `/?candidate=${MAYOR}`);
  await expect(page.locator('.actor-name-tag')).toBeVisible();

  const overview = await settleBadge(page, MAYOR);
  expectBadgeClearsHead(overview);

  await setZoom(page, -600);
  const zoomedIn = await settleBadge(page, MAYOR);
  expect(zoomedIn.zoom).toBeGreaterThan(overview.zoom);
  expectBadgeClearsHead(zoomedIn);

  await setZoom(page, 900);
  const zoomedOut = await settleBadge(page, MAYOR);
  expect(zoomedOut.zoom).toBeLessThan(zoomedIn.zoom);
  expectBadgeClearsHead(zoomedOut);

  // Same pixel gap in all three views proves the anchor tracks the model,
  // not a fixed world-space height that drifts once the camera zooms.
  expect(Math.abs(zoomedIn.gap - overview.gap)).toBeLessThanOrEqual(2);
  expect(Math.abs(zoomedOut.gap - overview.gap)).toBeLessThanOrEqual(2);
});

test('district focus keeps the badge above the head in 左營區 and 楠梓區', async ({
  page,
}) => {
  for (const admin of [ZUOYING, NANZI]) {
    const slug = await firstVisibleSlug(page, admin);
    await openWorld(page, `/?admin=${admin}&candidate=${slug}`);
    await expect(page.locator('.actor-name-tag')).toBeVisible();
    const metrics = await settleBadge(page, slug);
    expectBadgeClearsHead(metrics);
  }
});

test('badge stays anchored while the character walks', async ({ page }) => {
  await openWorld(page, `/?candidate=${MAYOR}`);
  await expect(page.locator('.actor-name-tag')).toBeVisible();
  await settleBadge(page, MAYOR);

  const samples: BadgeMetrics[] = [];
  for (let index = 0; index < 8; index += 1) {
    await page.waitForTimeout(180);
    const metrics = await badgeMetrics(page, MAYOR);
    if (metrics) samples.push(metrics);
  }
  expect(samples.length).toBeGreaterThanOrEqual(6);

  const gaps = samples.map((sample) => sample.gap);
  const offsets = samples.map((sample) => Math.abs(sample.centerOffset));
  // No drifting into the model and no jitter between frames.
  expect(Math.min(...gaps)).toBeGreaterThanOrEqual(4);
  expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThanOrEqual(2);
  expect(Math.max(...offsets)).toBeLessThanOrEqual(3);
});
