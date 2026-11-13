import { expect, test } from '@playwright/test';

async function hydrated(page: import('@playwright/test').Page) {
  await expect(
    page.locator('[data-testid="city-explorer"][data-hydrated="true"]'),
  ).toBeVisible({ timeout: 20_000 });
}

test.describe('city HUD and authoritative geography', () => {
  test('restores the 港都人物誌 brand and desktop site navigation', async ({
    page,
  }) => {
    await page.goto('/');
    await hydrated(page);

    const brand = page.getByRole('link', { name: '港都人物誌首頁' });
    await expect(brand).toBeVisible();
    await expect(brand).toHaveAttribute('href', '/');
    await expect(brand.locator('.brand-lockup__title')).toHaveText(
      '港都人物誌',
    );

    const nav = page.getByRole('navigation', { name: '主要網站導覽' });
    await expect(nav).toBeVisible();
    await expect(nav.locator('a')).toHaveCount(2);
    await expect(nav.getByRole('link', { name: '城市探索' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(nav.getByRole('link', { name: '選舉區' })).toHaveAttribute(
      'href',
      '/districts/',
    );
  });

  test('frames hexagonal district platforms at different zooms', async ({
    page,
  }) => {
    await page.goto('/?admin=E03');
    await hydrated(page);
    const explorer = page.locator('[data-testid="city-explorer"]');
    await expect(explorer).toHaveAttribute('data-scene-focus', 'admin-E03-0', {
      timeout: 20_000,
    });
    await expect(page.locator('.city-admin-card')).toContainText('左營區');
    await expect(
      page.locator('[data-testid="scene-frame"] canvas'),
    ).toBeVisible();

    await page.goto('/?admin=E04');
    await hydrated(page);
    await expect(explorer).toHaveAttribute('data-scene-focus', 'admin-E04-0', {
      timeout: 20_000,
    });
    await expect(page.locator('.city-admin-card')).toContainText('楠梓區');

    await page.goto('/?admin=E37');
    await hydrated(page);
    await expect(explorer).toHaveAttribute('data-scene-focus', 'admin-E37-0', {
      timeout: 20_000,
    });
    await expect(page.locator('.city-admin-card')).toContainText('桃源區');
    await expect(
      page.locator('[data-testid="scene-frame"] canvas'),
    ).toBeVisible();
  });

  test('overview exposes the complete hex world and every district', async ({
    page,
  }) => {
    await page.goto('/');
    await hydrated(page);
    await page.waitForFunction(() =>
      Boolean(
        (
          window as unknown as {
            __kaohsiungWorld?: { hex?: () => { tiles: number } };
          }
        ).__kaohsiungWorld?.hex,
      ),
    );
    const hex = await page.evaluate(() => {
      const world = (
        window as unknown as {
          __kaohsiungWorld?: {
            hex: () => {
              tiles: number;
              roadNodes: number;
              roadEdges: number;
              connectors: number;
            };
          };
        }
      ).__kaohsiungWorld!;
      return world.hex();
    });
    expect(hex.tiles).toBe(40);
    expect(hex.roadNodes).toBe(480);
    expect(hex.roadEdges).toBe(523);
    expect(hex.connectors).toBe(43);
    await expect(page.locator('[data-testid="city-explorer"]')).toHaveAttribute(
      'data-scene-focus',
      /^world-overview-/,
    );
    await expect(page.locator('.hex-district-label')).toHaveCount(38);
  });

  test('mobile menu is touch-sized, closes with Escape, and restores focus', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await hydrated(page);

    const brand = page.getByRole('link', { name: '港都人物誌首頁' });
    await expect(brand).toBeVisible();
    const menuButton = page.getByRole('button', { name: '開啟網站選單' });
    await expect(menuButton).toBeVisible();
    const box = await menuButton.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

    await menuButton.click();
    const menu = page.locator('#global-mobile-nav');
    await expect(menu).toBeVisible();
    await expect(
      menu.getByRole('navigation', { name: '網站頁面' }),
    ).toBeVisible();
    await expect(menu.locator('nav a')).toHaveCount(2);
    await expect(menu.locator('nav a[aria-current="page"]')).toContainText(
      '城市探索',
    );

    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(menuButton).toBeFocused();
    await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
  });
});
