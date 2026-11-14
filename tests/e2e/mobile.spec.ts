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
  await expect(page.getByRole('heading', { name: '所有候選人' })).toBeVisible();
  const candidateSheet = page.locator('#city-people-tray');
  await expect(candidateSheet.locator('.candidate-sheet__group')).toHaveCount(
    16,
  );
  await expect(candidateSheet.locator('.candidate-sheet__card')).toHaveCount(
    106,
  );
  await page.getByRole('button', { name: /張靜/ }).first().click();
  await expect(page.locator('.profile-panel.is-open')).toBeVisible();
  await expect(page.locator('.profile-panel.is-open')).toContainText(
    '官方資料',
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
  test.setTimeout(90_000);
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
      '.global-header__search input, .global-header__settings-button, .candidate-sheet__handle',
    ),
    'top controls',
  );

  await page.evaluate(() =>
    document.querySelector('astro-dev-toolbar')?.remove(),
  );
  const zuoyingLabel = page
    .locator('.hex-district-label', { hasText: '左營' })
    .first();
  const zuoyingBox = await zuoyingLabel.boundingBox();
  if (!zuoyingBox) throw new Error('左營 district label is not visible');
  await page.mouse.click(
    zuoyingBox.x + zuoyingBox.width / 2,
    zuoyingBox.y + zuoyingBox.height / 2,
  );
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
      '#city-people-tray .candidate-sheet__close, #city-people-tray .city-candidate',
    ),
    'people tray',
  );

  await peopleTray.locator('.city-candidate').first().click();
  const profile = page.locator('.profile-panel.is-open');
  await expect(profile).toBeVisible();
  await expect(profile.locator('.profile-tabs__list [role="tab"]')).toHaveCount(
    5,
    {
      timeout: 15_000,
    },
  );
  assertTargets(
    await measure(
      '.profile-panel.is-open .profile-panel__close, .profile-panel.is-open .profile-tabs__list .tab-button',
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
  await expect(page.locator('.global-header__search-clear')).toBeVisible();
  assertTargets(await measure('.global-header__search-clear'), 'search clear');
  await page.getByRole('button', { name: '清除搜尋' }).click();

  await page.goto('/?district=kaohsiung-council-04&focus=lotus-pond');
  await expect(page.getByTestId('city-explorer')).toHaveAttribute(
    'data-hydrated',
    'true',
  );
  await expect(page.locator('[data-testid="city-explorer"]')).toHaveAttribute(
    'data-scene-focus',
    /^scope-/,
    { timeout: 20_000 },
  );
  await expect(page.locator('.city-landmark-card')).toHaveCount(0);
  await expect(page.getByTestId('scene-frame').locator('canvas')).toBeVisible();
});

test('mobile constituency coverage fits the viewport and links to admin focus', async ({
  page,
}) => {
  await page.goto('/districts/kaohsiung-council-04/');
  const coverage = page.getByTestId('constituency-coverage');
  await expect(coverage).toBeVisible();
  const sectionBox = await coverage.boundingBox();
  const viewport = page.viewportSize();
  expect(sectionBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect((sectionBox?.x ?? 0) + (sectionBox?.width ?? 0)).toBeLessThanOrEqual(
    viewport?.width ?? 0,
  );

  const chip = coverage.getByRole('link', { name: '左營區', exact: true });
  const chipBox = await chip.boundingBox();
  expect(chipBox?.height ?? 0).toBeGreaterThanOrEqual(43.5);
  await chip.click();
  await expect(page).toHaveURL(/district=kaohsiung-council-04/);
  await expect(page).toHaveURL(/admin=E03/);
  await expect(page.getByTestId('city-explorer')).toHaveAttribute(
    'data-hydrated',
    'true',
  );
  await expect(page.locator('.city-admin-card')).toContainText('左營區');
  await expect(page.locator('.city-admin-card')).toContainText('第4選舉區');
});

test('mobile administrative district card stays compact and wraps cleanly', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?admin=E03');
  await expect(page.getByTestId('city-explorer')).toHaveAttribute(
    'data-hydrated',
    'true',
  );

  const card = page.locator('.city-admin-card');
  await expect(card).toBeVisible();
  await expect(
    card.getByRole('heading', { name: '左營區', level: 2 }),
  ).toBeVisible();
  await expect(card).not.toContainText('藝術化示意');

  const geometry = await card.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      bottom: rect.bottom,
      right: rect.right,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      rows: element.querySelectorAll('.city-admin-card__constituencies li')
        .length,
    };
  });
  expect(geometry.right).toBeLessThanOrEqual(390);
  expect(geometry.bottom).toBeLessThanOrEqual(844);
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
  expect(geometry.rows).toBeGreaterThan(0);
});

test('mobile profile panel keeps the official ballot number visible', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('city-explorer')).toHaveAttribute(
    'data-hydrated',
    'true',
  );
  await page.locator('[aria-controls="city-people-tray"]').click();
  await page.getByRole('button', { name: /張靜/ }).first().click();
  const panel = page.locator('.profile-panel.is-open');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('選票號次');
  await expect(panel).toContainText('1 號');
});
