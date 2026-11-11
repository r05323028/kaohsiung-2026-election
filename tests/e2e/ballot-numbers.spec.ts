import { expect, test } from '@playwright/test';

test('candidate profile shows the drawn official ballot number', async ({
  page,
}) => {
  await page.goto('/candidates/kaohsiung-council-04-712cf4dd/');
  await expect(page.locator('body')).toContainText('選票號次：1 號');
  await expect(page.locator('body')).not.toContainText('正式號次待公告');

  await page.goto('/candidates/kaohsiung-council-04-7287e742/');
  await expect(page.locator('body')).toContainText('選票號次：12 號');

  // Drawn municipal numbers stay in their own contest.
  await page.goto('/candidates/zhang-jing-2026/');
  await expect(page.locator('body')).toContainText('選票號次：1 號');
});

test('district page lists candidates by numeric ballot number', async ({
  page,
}) => {
  await page.goto('/districts/kaohsiung-council-04/');
  const cards = page.locator('a.candidate-card');
  await expect(cards).toHaveCount(12);
  const numbers = await cards.evaluateAll((nodes) =>
    nodes.map((node) => Number(node.getAttribute('data-ballot-number'))),
  );
  expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  expect(numbers.indexOf(9)).toBeLessThan(numbers.indexOf(10));

  await expect(cards.first()).toContainText('選票號次 1 號');
  await expect(cards.first()).toContainText('黃文志');
  await expect(cards.last()).toContainText('選票號次 12 號');
  await expect(cards.last()).toContainText('尹立');
  await expect(page.locator('.profile-section-heading p')).toContainText(
    '抽定號次',
  );
});

test('city explorer and search expose ballot numbers', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/');
  await expect(page.getByTestId('city-explorer')).toHaveAttribute(
    'data-hydrated',
    'true',
    { timeout: 30_000 },
  );
  await page.locator('[aria-controls=city-people-tray]').click();
  const ballotBadges = page.locator('.candidate-list__ballot');
  await expect(ballotBadges.first()).toBeVisible();
  await expect(ballotBadges.first()).toHaveText(/^\d+ 號$/);

  await page.getByLabel('搜尋人物').fill('柯志恩');
  const result = page.getByRole('link', { name: /柯志恩/ }).first();
  await expect(result).toBeVisible();
  await expect(result).toContainText('3 號');
});
