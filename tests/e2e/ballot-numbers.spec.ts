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
    '官方正式公告號次',
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
  const ballotBadges = page.locator('.candidate-sheet__ballot');
  await expect(ballotBadges.first()).toBeVisible();
  const firstBadge = ballotBadges.first();
  await expect(
    firstBadge.locator('.candidate-sheet__ballot-number'),
  ).toHaveText(/^\d{1,2}$/);
  await expect(firstBadge.locator('.candidate-sheet__ballot-label')).toHaveText(
    '號次',
  );

  const badgeLayout = await firstBadge.evaluate((element) => {
    const copy = element.parentElement;
    const card = element.closest('.candidate-sheet__card');
    const number = element.querySelector('.candidate-sheet__ballot-number');
    const label = element.querySelector('.candidate-sheet__ballot-label');
    if (!copy || !card || !number || !label) {
      throw new Error('candidate ballot badge is missing its layout elements');
    }
    const badgeRect = element.getBoundingClientRect();
    const copyRect = copy.getBoundingClientRect();
    const numberRect = number.getBoundingClientRect();
    const labelRect = label.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      display: style.display,
      justifySelf: style.justifySelf,
      width: badgeRect.width,
      copyWidth: copyRect.width,
      numberRight: numberRect.right,
      labelLeft: labelRect.left,
      numberTop: numberRect.top,
      labelTop: labelRect.top,
      cardScrollWidth: card.scrollWidth,
      cardClientWidth: card.clientWidth,
    };
  });
  // Grid items are blockified, so inline-flex computes to flex while the
  // fit-content width keeps the badge from stretching across the copy column.
  expect(badgeLayout.display).toMatch(/^(inline-)?flex$/);
  expect(badgeLayout.justifySelf).toBe('start');
  expect(badgeLayout.width).toBeLessThan(badgeLayout.copyWidth - 4);
  expect(Math.abs(badgeLayout.numberTop - badgeLayout.labelTop)).toBeLessThan(
    0.6,
  );
  expect(badgeLayout.labelLeft).toBeLessThanOrEqual(
    badgeLayout.numberRight + 0.5,
  );
  expect(badgeLayout.labelLeft).toBeGreaterThanOrEqual(
    badgeLayout.numberRight - 6,
  );
  expect(badgeLayout.cardScrollWidth).toBeLessThanOrEqual(
    badgeLayout.cardClientWidth + 1,
  );
  await expect(
    page.locator('.candidate-sheet__card .candidate-list__ballot'),
  ).toHaveCount(0);

  await page.getByLabel('搜尋人物').fill('柯志恩');
  const result = page.getByRole('link', { name: /柯志恩/ }).first();
  await expect(result).toBeVisible();
  await expect(result).toContainText('3 號');
});
