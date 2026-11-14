import { expect, type Page, test } from '@playwright/test';

type SceneInfo = {
  district: string | null;
  landmarks: string[];
  zuoying: boolean;
  nanzih: boolean;
};

type HexInfo = {
  tiles: number;
  landmarks: number;
  roadNodes: number;
  roadEdges: number;
  connectors: number;
};

type ActorMarker = {
  uuid: string;
  count: number;
};

type SceneBridge = {
  scene: () => SceneInfo;
  hex: () => HexInfo;
  hoveredLandmark: () => string | null;
};

async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByTestId('city-explorer')).toHaveAttribute(
    'data-hydrated',
    'true',
    { timeout: 30_000 },
  );
  await page.waitForFunction(() =>
    Boolean(
      (window as unknown as { __kaohsiungWorld?: SceneBridge }).__kaohsiungWorld
        ?.hex,
    ),
  );
}

async function scene(page: Page): Promise<SceneInfo> {
  return page.evaluate(() => {
    const world = (window as unknown as { __kaohsiungWorld?: SceneBridge })
      .__kaohsiungWorld;
    return world!.scene();
  });
}

async function hex(page: Page): Promise<HexInfo> {
  return page.evaluate(() => {
    const world = (window as unknown as { __kaohsiungWorld?: SceneBridge })
      .__kaohsiungWorld;
    return world!.hex();
  });
}

async function actorMarker(page: Page): Promise<ActorMarker | null> {
  return page.evaluate(() => {
    const bridge = window as unknown as {
      __kaohsiungActorMarker?: () => ActorMarker | null;
    };
    return bridge.__kaohsiungActorMarker?.() ?? null;
  });
}

test.describe('hex district integrity', () => {
  test('renders every district as a connected hex tile with decorative landmarks', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await open(page, '/');
    await page.waitForTimeout(1500);

    expect(await hex(page)).toEqual({
      tiles: 40,
      landmarks: 78,
      roadNodes: 480,
      roadEdges: 523,
      connectors: 43,
    });
    expect(await scene(page)).toEqual({
      district: null,
      landmarks: [],
      zuoying: false,
      nanzih: false,
    });
    expect(
      await page.evaluate(() => {
        const world = (window as unknown as { __kaohsiungWorld?: SceneBridge })
          .__kaohsiungWorld;
        return world?.hoveredLandmark() ?? null;
      }),
    ).toBeNull();
    await expect(page.locator('.city-landmark-card')).toHaveCount(0);
    await expect(page.locator('[class*="hover-card"]')).toHaveCount(0);
    await expect(
      page.getByTestId('scene-frame').locator('canvas'),
    ).toBeVisible();
  });

  test('keeps actor markers stable while districts are focused and hovered', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await open(page, '/?admin=E03');
    await page.waitForFunction(
      () =>
        typeof (window as unknown as { __kaohsiungActorMarker?: unknown })
          .__kaohsiungActorMarker === 'function',
      undefined,
      { timeout: 30_000 },
    );
    const before = await actorMarker(page);
    expect(before?.count).toBe(17);
    if (!before) throw new Error('actor marker bridge is unavailable');

    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('city canvas has no bounding box');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(200);

    const backToCity = page.getByRole('button', { name: '回到全市' });
    if (await backToCity.isVisible()) {
      await backToCity.click();
      await expect(page.locator('.city-admin-card')).toBeHidden();
    }
    const nanzihLabel = page
      .locator('.hex-district-label', { hasText: '楠梓' })
      .first();
    const nanzihBox = await nanzihLabel.boundingBox();
    if (!nanzihBox) throw new Error('楠梓 district label is not visible');
    await page.mouse.click(
      nanzihBox.x + nanzihBox.width / 2,
      nanzihBox.y + nanzihBox.height / 2,
    );
    await expect(page.locator('[data-testid="city-explorer"]')).toHaveAttribute(
      'data-scene-focus',
      /^admin-E04-/,
      { timeout: 20_000 },
    );
    await page.waitForTimeout(1200);

    const after = await actorMarker(page);
    expect(after?.uuid).toBe(before.uuid);
    expect(after?.count).toBe(17);
    await expect(page.locator('.city-admin-card')).toContainText('楠梓區');
  });

  test('decorative landmarks never intercept district selection', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await open(page, '/?admin=E03');
    await page.waitForTimeout(2500);
    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('city canvas has no bounding box');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(600);
    await expect(page.locator('.city-admin-card')).toContainText('左營');
    await expect(page.locator('.city-landmark-card')).toHaveCount(0);
    await expect(page.getByTestId('city-explorer')).toHaveAttribute(
      'data-scene-focus',
      /^admin-E03-/,
    );
  });

  test('keeps fictional demo people out of production search and routes', async ({
    page,
  }) => {
    await open(page, '/');
    const search = page.getByLabel('搜尋人物');
    await search.fill('林海星');
    await page.waitForTimeout(800);
    await expect(
      page.locator('.global-header__search-results .city-candidate'),
    ).toHaveCount(0);

    await search.fill('張靜');
    await page.waitForTimeout(800);
    await expect(
      page.locator('.global-header__search-results .city-candidate').filter({
        hasText: '張靜',
      }),
    ).toHaveCount(1);

    const response = await page.goto('/candidates/lin-haixing-demo');
    expect(response?.status()).toBe(404);
  });

  test('labels the electoral district and administrative district separately', async ({
    page,
  }) => {
    await open(page, '/?admin=E03');
    await page.waitForTimeout(2500);
    await expect(page.locator('.city-scene-label__kicker')).toContainText(
      '選舉區',
    );
    await expect(page.locator('.city-scene-label__zone')).toContainText(
      '行政區',
    );
    const card = page.locator('.city-admin-card');
    await expect(
      card.getByRole('heading', { name: '左營區', level: 2 }),
    ).toBeVisible();
    await expect(card.locator('.city-admin-card__english')).toHaveText(
      'Zuoying',
    );
    await expect(card).not.toContainText('ADMIN DISTRICT');
    await expect(
      card.getByRole('heading', { name: '所屬選舉區', level: 3 }),
    ).toBeVisible();
  });
});
