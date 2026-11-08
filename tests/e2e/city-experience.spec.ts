import { expect, test } from '@playwright/test';

test.describe('immersive city exploration', () => {
  test('Escape closes settings and progressive-disclosure trays', async ({
    page,
  }) => {
    await page.goto('/');
    const explorer = page.locator(
      '[data-testid="city-explorer"][data-hydrated="true"]',
    );
    await expect(explorer).toBeVisible();

    await page.getByRole('button', { name: '顯示與體驗設定' }).click();
    const settings = page.locator('section[aria-label="顯示與體驗設定"]');
    await expect(settings).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(settings).toBeHidden();

    const districtToggle = page.locator('[aria-controls="city-district-tray"]');
    await districtToggle.click();
    await expect(page.locator('#city-district-tray')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#city-district-tray')).toBeHidden();

    const peopleToggle = page.locator('[aria-controls="city-people-tray"]');
    await peopleToggle.click();
    await expect(page.locator('#city-people-tray')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#city-people-tray')).toBeHidden();
  });

  test('landmark URL focus is dismissible and restores a city view', async ({
    page,
  }) => {
    await page.goto(
      '/?district=kaohsiung-council-04&focus=dragon-tiger-pagodas',
    );
    const explorer = page.locator(
      '[data-testid="city-explorer"][data-hydrated="true"]',
    );
    await expect(explorer).toBeVisible();
    await expect(explorer).toHaveAttribute(
      'data-scene-focus',
      'landmark-dragon-tiger-pagodas',
      { timeout: 15_000 },
    );

    const card = page.locator('.city-landmark-card');
    await expect(card.getByRole('heading', { name: '龍虎塔' })).toBeVisible();
    await expect(card).toContainText('藝術化重建');
    await card.getByRole('button', { name: '返回城市' }).click();
    await expect(card).toBeHidden();
    await expect(explorer).toHaveAttribute('data-scene-focus', /^zone-/);
  });

  test('candidate overlay closes with Escape and clears the URL selection', async ({
    page,
  }) => {
    await page.goto(
      '/?district=kaohsiung-council-04&candidate=kaohsiung-council-04-712cf4dd',
    );
    const explorer = page.locator(
      '[data-testid="city-explorer"][data-hydrated="true"]',
    );
    await expect(explorer).toBeVisible();
    const panel = page.locator('.profile-panel.is-open');
    await expect(panel).toBeVisible({ timeout: 15_000 });
    await expect(panel).toContainText('黃文志');
    await expect(explorer).toHaveAttribute(
      'data-scene-focus',
      'candidate-kaohsiung-council-04-712cf4dd',
      { timeout: 15_000 },
    );

    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(page).not.toHaveURL(/candidate=/);
  });
});

test('candidate profile moves focus in and restores it on close', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.locator('[data-testid="city-explorer"][data-hydrated="true"]'),
  ).toBeVisible();

  const peopleToggle = page.locator('[aria-controls="city-people-tray"]');
  await peopleToggle.click();
  await page
    .locator('#city-people-tray')
    .getByRole('button', { name: /林海星/ })
    .first()
    .click();

  const close = page.getByRole('button', { name: '關閉人物資料' });
  await expect(close).toBeVisible({ timeout: 15_000 });
  await expect(close).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(page.locator('.profile-panel.is-open')).toBeHidden();
  await expect(peopleToggle).toBeFocused();
});
