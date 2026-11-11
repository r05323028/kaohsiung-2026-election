import { expect, type Page, test } from '@playwright/test';

type WorldActor = {
  electoralDistrictSlug: string;
  role: 'mayor' | 'council' | 'indigenous' | 'demo';
  currentAdminId: string | null;
  currentAdminName: string | null;
  spawnAdminId: string | null;
  position: { x: number; z: number };
};

type WorldBridge = {
  advance: (seconds: number) => void;
  actors: () => WorldActor[];
  stats: () => {
    invalidRoutes: number;
    idle: number;
    actors: number;
    elapsedSeconds: number;
  };
};

type WorldWindow = Window & { __kaohsiungWorld?: WorldBridge };

test.use({ reducedMotion: 'reduce' });

async function explorer(page: Page) {
  const locator = page.locator(
    '[data-testid="city-explorer"][data-hydrated="true"]',
  );
  await expect(locator).toBeVisible({ timeout: 30_000 });
  return locator;
}

async function waitForWorld(page: Page) {
  await page.waitForFunction(() =>
    Boolean((window as WorldWindow).__kaohsiungWorld),
  );
}

test.describe('unified Kaohsiung world', () => {
  test('administrative district focus shows geography and returns to the city', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto('/?district=kaohsiung-council-04');
    const shell = await explorer(page);

    await page.locator('[aria-controls="city-admin-tray"]').click();
    const tray = page.locator('#city-admin-tray');
    await expect(tray).toBeVisible();
    await expect(tray.locator('.city-admin-chip')).toHaveCount(38);

    await tray.locator('.city-admin-chip').filter({ hasText: '左營' }).click();

    const card = page.locator('.city-admin-card');
    await expect(card).toBeVisible();
    await expect(card.getByRole('heading', { name: '左營區' })).toBeVisible();
    await expect(card).toContainText('22.6 km²');
    await expect(card).toContainText('相鄰行政區');
    await expect(card).toContainText('楠梓');
    await expect(card).toContainText('藝術化示意');

    await card.getByRole('button', { name: '回到全市' }).click();
    await expect(card).toBeHidden();
    await expect(page.locator('.city-scene-label__zone')).toContainText(
      '高雄市 38 行政區・六角迷你城市',
    );
    await expect(shell).toHaveAttribute('data-scene-focus', /^world-overview-/);
  });

  test('every one of the 38 administrative districts can be focused', async ({
    page,
  }) => {
    test.setTimeout(900_000);
    await page.goto('/?district=kaohsiung-council-04');
    await explorer(page);

    const toggle = page.locator('[aria-controls="city-admin-tray"]');
    const card = page.locator('.city-admin-card');
    await toggle.click();
    const chips = page.locator('#city-admin-tray .city-admin-chip');
    await expect(chips).toHaveCount(38);
    const names = await chips.locator('strong').allInnerTexts();

    for (let index = 0; index < names.length; index += 1) {
      if (!(await page.locator('#city-admin-tray').isVisible())) {
        await toggle.click();
        await expect(page.locator('#city-admin-tray')).toBeVisible();
      }
      await chips.nth(index).click();
      await expect(card.locator('h2')).toHaveText(`${names[index]}區`, {
        timeout: 30_000,
      });
      await expect(card).toBeVisible();
    }

    await expect(card).toContainText('藝術化示意');
  });

  test('council-04 simulation stays inside Zuoying and Nanzih while following', async ({
    page,
  }) => {
    await page.goto(
      '/?district=kaohsiung-council-04&candidate=kaohsiung-council-04-712cf4dd',
    );
    const shell = await explorer(page);
    await expect(shell).toHaveAttribute(
      'data-scene-focus',
      'candidate-kaohsiung-council-04-712cf4dd',
      { timeout: 15_000 },
    );
    await expect(page.locator('.profile-panel')).toBeVisible();
    await waitForWorld(page);

    const result = await page.evaluate(() => {
      const world = (window as WorldWindow).__kaohsiungWorld as WorldBridge;
      world.advance(1800);
      const actors = world
        .actors()
        .filter(
          (actor) => actor.electoralDistrictSlug === 'kaohsiung-council-04',
        );
      return {
        count: actors.length,
        ids: [...new Set(actors.map((actor) => actor.currentAdminId))],
        names: [...new Set(actors.map((actor) => actor.currentAdminName))],
        invalidRoutes: world.stats().invalidRoutes,
      };
    });

    expect(result.count).toBe(12);
    expect(result.ids.sort()).toEqual(['E03', 'E04']);
    expect(result.names.sort()).toEqual(['左營區', '楠梓區']);
    expect(result.invalidRoutes).toBe(0);
  });

  test('simulation persists when the profile closes and another district is focused', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.goto(
      '/?district=kaohsiung-council-04&candidate=kaohsiung-council-04-712cf4dd',
    );
    await explorer(page);
    await expect(page.locator('.profile-panel')).toBeVisible();
    await waitForWorld(page);

    const before = await page.evaluate(() => {
      const world = (window as WorldWindow).__kaohsiungWorld as WorldBridge;
      world.advance(60);
      const actors = world.actors();
      return {
        count: actors.length,
        unique: new Set(actors.map((actor) => actor.electoralDistrictSlug))
          .size,
        elapsedSeconds: world.stats().elapsedSeconds,
        selectedSpawn: actors.find(
          (actor) => actor.electoralDistrictSlug === 'kaohsiung-council-04',
        )?.spawnAdminId,
      };
    });

    await page.getByRole('button', { name: '關閉人物資料' }).click();
    await expect(page.locator('.profile-panel')).toBeHidden();
    await page.waitForTimeout(300);
    await page.locator('[aria-controls="city-admin-tray"]').click();
    await page
      .locator('#city-admin-tray .city-admin-chip')
      .filter({ hasText: '楠梓' })
      .click();
    await expect(page.locator('[data-testid="city-explorer"]')).toHaveAttribute(
      'data-scene-focus',
      /^admin-E04-/,
      { timeout: 15_000 },
    );

    const after = await page.evaluate(() => {
      const world = (window as WorldWindow).__kaohsiungWorld as WorldBridge;
      world.advance(60);
      const actors = world.actors();
      return {
        count: actors.length,
        unique: new Set(actors.map((actor) => actor.electoralDistrictSlug))
          .size,
        elapsedSeconds: world.stats().elapsedSeconds,
        selectedSpawn: actors.find(
          (actor) => actor.electoralDistrictSlug === 'kaohsiung-council-04',
        )?.spawnAdminId,
        invalidRoutes: world.stats().invalidRoutes,
      };
    });

    expect(before.count).toBe(106);
    expect(after.count).toBe(106);
    expect(after.unique).toBe(before.unique);
    expect(after.elapsedSeconds).toBeGreaterThan(before.elapsedSeconds);
    expect(after.selectedSpawn).toBe(before.selectedSpawn);
    expect(after.invalidRoutes).toBe(0);
  });

  test('mayoral simulation crosses several administrative districts', async ({
    page,
  }) => {
    await page.goto('/?district=kaohsiung-mayor-2026');
    await explorer(page);
    await waitForWorld(page);

    const result = await page.evaluate(() => {
      const world = (window as WorldWindow).__kaohsiungWorld as WorldBridge;
      world.advance(900);
      const mayors = world.actors().filter((actor) => actor.role === 'mayor');
      return {
        count: mayors.length,
        districts: [
          ...new Set(
            mayors
              .map((actor) => actor.currentAdminName)
              .filter((name): name is string => Boolean(name)),
          ),
        ],
        invalidRoutes: world.stats().invalidRoutes,
      };
    });

    expect(result.count).toBeGreaterThan(0);
    expect(result.districts.length).toBeGreaterThanOrEqual(2);
    expect(result.invalidRoutes).toBe(0);
  });
});
