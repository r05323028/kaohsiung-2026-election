import { expect, test } from '@playwright/test';

test('mobile layout exposes touch-friendly candidate navigation and bottom-sheet profile', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('city-explorer')).toHaveAttribute(
    'data-hydrated',
    'true',
  );
  await page.locator('[aria-controls="city-people-tray"]').click();
  await expect(
    page.getByRole('heading', { name: '不用 3D 也能選擇人物' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: /林海星/ })
    .first()
    .click();
  await expect(page.locator('.profile-panel.is-open')).toBeVisible();
  await expect(page.locator('.profile-panel.is-open')).toContainText(
    '虛構示範人物',
  );
});

test('mobile avatar preview stays within the touch viewport', async ({
  page,
}) => {
  await page.goto('/avatar-preview/');
  const preview = page.getByTestId('avatar-preview-app');
  await expect(preview).toHaveAttribute('data-hydrated', 'true');
  const canvas = preview.getByTestId('avatar-preview-canvas');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  expect(box?.width ?? 0).toBeLessThanOrEqual(393);
  await expect(preview.locator('select option')).toHaveCount(5);
  await expect(preview).toContainText('validated');
});

test('mobile essential controls meet a 44px touch target at 390x844', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByTestId('city-explorer')).toHaveAttribute(
    'data-hydrated',
    'true',
  );
  await page.waitForTimeout(250);
  await page
    .evaluate(() => document.querySelector('astro-dev-toolbar')?.remove())
    .catch(() => undefined);

  const measure = async (selector: string) =>
    page.locator(selector).evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect();
        const html = element as HTMLElement;
        return {
          label:
            html.getAttribute('aria-label') ??
            html.textContent?.trim().slice(0, 20) ??
            html.tagName,
          width: rect.width,
          height: rect.height,
        };
      }),
    );

  const assertTargets = (
    targets: Array<{ label: string; width: number; height: number }>,
    group: string,
  ) => {
    expect(targets.length, group).toBeGreaterThan(0);
    for (const target of targets) {
      expect(
        target.width,
        `${group}: ${target.label} width`,
      ).toBeGreaterThanOrEqual(44);
      expect(
        target.height,
        `${group}: ${target.label} height`,
      ).toBeGreaterThanOrEqual(44);
    }
  };

  assertTargets(
    await measure(
      '.city-search input, .city-icon-button, .city-zones button, .city-dock__toggle',
    ),
    'top controls',
  );

  await page.evaluate(() =>
    document.querySelector('astro-dev-toolbar')?.remove(),
  );
  const districtToggle = page.locator('[aria-controls="city-district-tray"]');
  await districtToggle.click();
  const districtTray = page.locator('#city-district-tray');
  await expect(districtTray).toBeVisible();
  await expect(districtTray.locator('.city-tray__head')).toBeInViewport();
  expect(await districtTray.evaluate((element) => element.scrollTop)).toBe(0);
  assertTargets(
    await measure(
      '#city-district-tray .city-tray__close, #city-district-tray .city-tabs button, #city-district-tray .city-district',
    ),
    'district tray',
  );

  await districtToggle.click();
  await expect(districtTray).toBeHidden();

  const adminToggle = page.locator('[aria-controls="city-admin-tray"]');
  await adminToggle.click();
  const adminTray = page.locator('#city-admin-tray');
  await expect(adminTray).toBeVisible();
  await expect(adminTray.locator('.city-admin-chip')).toHaveCount(38);
  assertTargets(
    await measure(
      '#city-admin-tray .city-tray__close, #city-admin-tray .city-admin-chip',
    ),
    'admin tray',
  );
  await adminTray
    .locator('.city-admin-chip')
    .filter({ hasText: '左營' })
    .click();
  const adminCard = page.locator('.city-admin-card');
  await expect(adminCard).toBeVisible();
  assertTargets(
    await measure('.city-admin-card .city-landmark-card__actions button'),
    'admin card',
  );
  await adminCard.getByRole('button', { name: '回到全市' }).click();
  await expect(adminCard).toBeHidden();

  await page.locator('[aria-controls="city-people-tray"]').click();
  const peopleTray = page.locator('#city-people-tray');
  await expect(peopleTray).toBeVisible();
  assertTargets(
    await measure(
      '#city-people-tray .city-tray__close, #city-people-tray .city-candidate',
    ),
    'people tray',
  );

  await peopleTray.locator('.city-candidate').first().click();
  const profile = page.locator('.profile-panel.is-open');
  await expect(profile).toBeVisible();
  await expect(profile.locator('.tab-button')).toHaveCount(6, {
    timeout: 15_000,
  });
  assertTargets(
    await measure(
      '.profile-panel.is-open .profile-panel__close, .profile-panel.is-open .tab-button',
    ),
    'profile panel',
  );
  await profile.locator('.profile-panel__close').click();
  await expect(profile).toBeHidden();

  await page.getByRole('button', { name: '顯示與體驗設定' }).click();
  await expect(page.locator('.city-settings')).toBeVisible();
  assertTargets(
    await measure(
      '.city-settings__head button, .city-settings__quality button, .city-settings__toggle, .city-settings__reset',
    ),
    'settings',
  );
  await page.getByRole('button', { name: '關閉設定' }).click();

  await page.getByLabel('搜尋人物').fill('林');
  await expect(page.locator('.city-search__clear')).toBeVisible();
  assertTargets(await measure('.city-search__clear'), 'search clear');
  await page.getByRole('button', { name: '清除搜尋' }).click();

  await page.goto('/?district=kaohsiung-council-04&focus=lotus-pond');
  await expect(page.getByTestId('city-explorer')).toHaveAttribute(
    'data-hydrated',
    'true',
  );
  await expect(page.locator('.city-landmark-card')).toBeVisible();
  assertTargets(
    await measure('.city-landmark-card__actions button'),
    'landmark card',
  );
});
