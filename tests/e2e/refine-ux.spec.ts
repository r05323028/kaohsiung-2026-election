import { expect, test } from '@playwright/test';

type CameraView = {
  position: [number, number, number];
  target?: [number, number, number];
  zoom: number;
};

async function hydrated(page: import('@playwright/test').Page) {
  await expect(
    page.locator('[data-testid="city-explorer"][data-hydrated="true"]'),
  ).toBeVisible({ timeout: 20_000 });
}

async function camera(
  page: import('@playwright/test').Page,
): Promise<CameraView> {
  await page.waitForFunction(
    () =>
      Boolean(
        (
          window as unknown as {
            __kaohsiungWorld?: { camera?: () => CameraView };
          }
        ).__kaohsiungWorld?.camera?.().position,
      ),
    undefined,
    { timeout: 20_000 },
  );
  return (await page.evaluate(() => {
    const world = (
      window as unknown as {
        __kaohsiungWorld?: { camera?: () => CameraView };
      }
    ).__kaohsiungWorld;
    return world?.camera?.();
  })) as CameraView;
}

function distance(a: [number, number, number], b: [number, number, number]) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

async function waitForCameraSettled(page: import('@playwright/test').Page) {
  let previous: CameraView | null = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const current = await camera(page);
    if (
      previous &&
      Math.abs(current.zoom - previous.zoom) < 0.002 &&
      distance(current.position, previous.position) < 0.002 &&
      current.target &&
      previous.target &&
      distance(current.target, previous.target) < 0.002
    ) {
      return current;
    }
    previous = current;
    await page.waitForTimeout(350);
  }
  throw new Error('camera did not settle');
}

async function waitForZoomStable(page: import('@playwright/test').Page) {
  let previous: number | null = null;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const current = (await camera(page)).zoom;
    if (previous !== null && Math.abs(current - previous) < 0.002) return;
    previous = current;
    await page.waitForTimeout(350);
  }
  throw new Error('camera zoom did not settle');
}

function closeEnough(a: number[] = [], b: number[] = [], tolerance = 0.05) {
  expect(a).toHaveLength(b.length);
  for (let i = 0; i < a.length; i += 1) {
    expect(Math.abs((a[i] ?? 0) - (b[i] ?? 0))).toBeLessThan(tolerance);
  }
}

async function selectMayor(page: import('@playwright/test').Page) {
  await page.locator('#candidate-search').fill('張靜');
  const result = page
    .locator('.global-header__search-results .city-candidate')
    .first();
  await expect(result).toBeVisible();
  await result.click();
  await expect(page.locator('[data-testid="city-explorer"]')).toHaveAttribute(
    'data-scene-focus',
    'candidate-zhang-jing-2026',
    { timeout: 20_000 },
  );
  await page.waitForTimeout(1600);
  await waitForZoomStable(page);
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
  await page.mouse.move(x + dx, y + dy, { steps: 12 });
  await page.mouse.up({ button: 'left' });
  await page.waitForTimeout(900);
}

test.describe('refined living-city exploration', () => {
  test('candidate selection keeps scale, profile does not reset it, and close restores the view', async ({
    page,
  }) => {
    await page.goto('/?admin=E03');
    await hydrated(page);
    await waitForCameraSettled(page);
    const before = await camera(page);

    await selectMayor(page);
    const after = await camera(page);

    expect(after.zoom).toBeCloseTo(before.zoom, 3);
    const beforeTarget = before.target;
    const afterTarget = after.target;
    if (!beforeTarget || !afterTarget) throw new Error('camera target missing');
    const moved = Math.hypot(
      afterTarget[0] - beforeTarget[0],
      afterTarget[2] - beforeTarget[2],
    );
    expect(moved).toBeGreaterThan(1);

    await expect(page.locator('[data-testid="profile-panel"]')).toBeVisible();
    await page.waitForTimeout(900);
    const withProfile = await camera(page);
    expect(withProfile.zoom).toBeCloseTo(after.zoom, 3);
    closeEnough(withProfile.position, after.position);

    await page.getByRole('button', { name: '關閉人物資料' }).click();
    await expect(page.locator('[data-testid="city-explorer"]')).toHaveAttribute(
      'data-scene-focus',
      'admin-E03-0',
      { timeout: 20_000 },
    );
    await waitForCameraSettled(page);
    const restored = await camera(page);
    expect(restored.zoom).toBeCloseTo(before.zoom, 3);
    closeEnough(restored.position, before.position);
    closeEnough(restored.target, before.target);
  });

  test('citywide candidate selection does not force a new zoom level', async ({
    page,
  }) => {
    await page.goto('/');
    await hydrated(page);
    await waitForCameraSettled(page);
    const before = await camera(page);
    await selectMayor(page);
    const after = await camera(page);
    expect(after.zoom).toBeCloseTo(before.zoom, 3);
  });

  test('manual camera control stops follow and close does not yank the view back', async ({
    page,
  }) => {
    await page.goto('/?admin=E03');
    await hydrated(page);
    await waitForCameraSettled(page);
    await selectMayor(page);

    await dragCanvas(page, 170, 90);
    const manual = await camera(page);
    const following = await page.evaluate(() => {
      const world = (
        window as unknown as {
          __kaohsiungWorld?: {
            actors: () => Array<{ slug: string; followingUser: boolean }>;
          };
        }
      ).__kaohsiungWorld;
      const actor = world
        ?.actors()
        .find((item: { slug: string }) => item.slug === 'zhang-jing-2026');
      return actor?.followingUser;
    });
    expect(following).toBe(false);

    await page.getByRole('button', { name: '關閉人物資料' }).click();
    await expect(page.locator('[data-testid="city-explorer"]')).toHaveAttribute(
      'data-scene-focus',
      'admin-E03-0',
      { timeout: 20_000 },
    );
    await page.waitForTimeout(1200);
    const afterClose = await camera(page);
    expect(afterClose.zoom).toBeCloseTo(manual.zoom, 3);
    closeEnough(afterClose.position, manual.position, 0.3);
    closeEnough(afterClose.target, manual.target, 0.3);
  });

  test('mouse drag pans without rotating or selecting; wheel zooms', async ({
    page,
  }) => {
    await page.goto('/?admin=E03');
    await hydrated(page);
    await page.waitForTimeout(1200);
    const before = await camera(page);
    await dragCanvas(page, 210, 110);
    const after = await camera(page);

    expect(after.zoom).toBeCloseTo(before.zoom, 3);
    const beforeTarget = before.target;
    const afterTarget = after.target;
    if (!beforeTarget || !afterTarget) throw new Error('camera target missing');
    const beforeOffset = [
      before.position[0] - beforeTarget[0],
      before.position[1] - beforeTarget[1],
      before.position[2] - beforeTarget[2],
    ];
    const afterOffset = [
      after.position[0] - afterTarget[0],
      after.position[1] - afterTarget[1],
      after.position[2] - afterTarget[2],
    ];
    closeEnough(afterOffset, beforeOffset, 0.02);
    expect(
      Math.hypot(
        afterTarget[0] - beforeTarget[0],
        afterTarget[2] - beforeTarget[2],
      ),
    ).toBeGreaterThan(1);
    await expect(page.locator('[data-testid="profile-panel"]')).toBeHidden();

    const box = await page.locator('canvas').boundingBox();
    if (!box) throw new Error('canvas has no bounding box');
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await page.mouse.wheel(0, -500);
    await page.waitForTimeout(1000);
    const zoomed = await camera(page);
    expect(zoomed.zoom).toBeGreaterThan(after.zoom);
  });

  test('mobile touch pans and pinches the map', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await page.goto('/');
    await hydrated(page);
    await page.waitForTimeout(4_000);
    await waitForCameraSettled(page);
    const client = await context.newCDPSession(page);
    const before = await camera(page);

    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: 195, y: 430, id: 1 }],
    });
    for (let step = 1; step <= 6; step += 1) {
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: 195 + step * 10, y: 430 + step * 8, id: 1 }],
      });
    }
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await page.waitForTimeout(900);
    const panned = await camera(page);
    const pannedTarget = panned.target;
    const beforeTarget = before.target;
    if (!pannedTarget || !beforeTarget)
      throw new Error('camera target missing');
    expect(panned.zoom).toBeCloseTo(before.zoom, 3);
    expect(
      Math.hypot(
        pannedTarget[0] - beforeTarget[0],
        pannedTarget[2] - beforeTarget[2],
      ),
    ).toBeGreaterThan(0.5);

    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { x: 145, y: 430, id: 1 },
        { x: 245, y: 430, id: 2 },
      ],
    });
    for (let step = 1; step <= 6; step += 1) {
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [
          { x: 145 - step * 7, y: 430, id: 1 },
          { x: 245 + step * 7, y: 430, id: 2 },
        ],
      });
    }
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await page.waitForTimeout(900);
    const pinched = await camera(page);
    expect(pinched.zoom).toBeGreaterThan(panned.zoom);

    await context.close();
  });

  test('explorer and informational pages share one brand and navigation system', async ({
    page,
  }) => {
    await page.goto('/');
    await hydrated(page);
    const header = page.getByTestId('global-header');
    await expect(header).toBeVisible();
    await expect(header.locator('.brand-lockup__title')).toHaveText(
      '港都人物誌',
    );
    await expect(header.locator('.brand-lockup__subtitle')).toHaveText(
      'KAOHSIUNG CIVIC STORIES',
    );
    await expect(header.locator('.brand-lockup img')).toHaveAttribute(
      'src',
      /harbor-mark\.svg$/,
    );
    const nav = header.locator('nav[aria-label="主要網站導覽"]');
    await expect(nav.locator('a')).toHaveCount(4);
    await expect(nav.locator('a[aria-current="page"]')).toHaveText('城市探索');

    await page.goto('/districts/');
    await expect(header).toBeVisible();
    await expect(header.locator('.brand-lockup__title')).toHaveText(
      '港都人物誌',
    );
    await expect(header.locator('.brand-lockup img')).toHaveAttribute(
      'src',
      /harbor-mark\.svg$/,
    );
    await expect(nav.locator('a')).toHaveCount(4);
    await expect(nav.locator('a[aria-current="page"]')).toHaveText('選舉區');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(header).toBeVisible();
    const menuButton = page.locator('.global-header__menu-button');
    await expect(menuButton).toBeVisible();
    await expect(nav).toBeHidden();
    await menuButton.click();
    const mobileNav = page.locator('#global-mobile-nav');
    await expect(mobileNav).toBeVisible();
    await expect(mobileNav.locator('nav a')).toHaveCount(4);
    await expect(mobileNav.locator('nav a[aria-current="page"]')).toContainText(
      '選舉區',
    );
  });
});
