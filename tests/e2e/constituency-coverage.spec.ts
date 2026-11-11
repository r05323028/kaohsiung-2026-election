import { expect, test } from '@playwright/test';

test('district 4 page shows Zuoying and Nanzih coverage', async ({ page }) => {
  await page.goto('/districts/kaohsiung-council-04/');
  const coverage = page.getByTestId('constituency-coverage');
  await expect(coverage).toBeVisible();
  await expect(coverage).toHaveAttribute('data-constituency-number', '4');
  await expect(coverage).toHaveAttribute('data-coverage-kind', 'geographic');
  await expect(coverage).toContainText('第4選舉區・地理選區');
  await expect(coverage.getByTestId('coverage-summary')).toContainText(
    '涵蓋 2 個行政區：左營區、楠梓區',
  );
  await expect(
    coverage.getByRole('link', { name: '左營區', exact: true }),
  ).toHaveAttribute('href', /district=kaohsiung-council-04&admin=E03/);
  await expect(
    coverage.getByRole('link', { name: '楠梓區', exact: true }),
  ).toHaveAttribute('href', /admin=E04/);
  await expect(
    coverage.getByRole('link', { name: /中選會 115 年選舉區劃分公告/ }),
  ).toBeVisible();
});

test('district index exposes all 15 constituency coverage layers', async ({
  page,
}) => {
  await page.goto('/districts/');
  const sections = page.getByTestId('constituency-coverage');
  await expect(sections).toHaveCount(15);
  const numbers = await sections.evaluateAll((nodes) =>
    nodes.map((node) => Number(node.getAttribute('data-constituency-number'))),
  );
  expect([...numbers].sort((a, b) => a - b)).toEqual(
    Array.from({ length: 15 }, (_, index) => index + 1),
  );
  const kinds = await sections.evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('data-coverage-kind')),
  );
  expect(kinds.filter((kind) => kind === 'geographic')).toHaveLength(11);
  expect(kinds.filter((kind) => kind === 'citywide-indigenous')).toHaveLength(
    1,
  );
  expect(
    kinds.filter((kind) => kind === 'indigenous-eligible-districts'),
  ).toHaveLength(3);
});

test('indigenous constituencies are labelled distinctly', async ({ page }) => {
  await page.goto('/districts/kaohsiung-indigenous-flat-12/');
  const plains = page.getByTestId('constituency-coverage');
  await expect(plains).toHaveAttribute(
    'data-coverage-kind',
    'citywide-indigenous',
  );
  await expect(plains).toContainText('平地原住民選舉區');
  await expect(plains).toContainText('全市 38 個行政區');
  await expect(plains).toContainText('不以行政區邊界界定');
  await expect(plains.locator('a.constituency-coverage__chip')).toHaveCount(38);

  await page.goto('/districts/kaohsiung-indigenous-mountain-13/');
  const mountain = page.getByTestId('constituency-coverage');
  await expect(mountain).toHaveAttribute(
    'data-coverage-kind',
    'indigenous-eligible-districts',
  );
  await expect(mountain).toContainText('山地原住民選舉區');
  await expect(mountain).toContainText('設籍範圍 14 個行政區');
  await expect(mountain).not.toContainText('全市 38 個行政區');
  await expect(mountain.locator('a.constituency-coverage__chip')).toHaveCount(
    14,
  );
});

test('coverage chip focuses a district without changing the constituency', async ({
  page,
}) => {
  await page.goto('/districts/kaohsiung-council-04/');
  await page
    .getByTestId('constituency-coverage')
    .getByRole('link', { name: '左營區', exact: true })
    .click();
  await expect(page).toHaveURL(/district=kaohsiung-council-04/);
  await expect(page).toHaveURL(/admin=E03/);
  await expect(page.getByTestId('city-explorer')).toHaveAttribute(
    'data-hydrated',
    'true',
  );
  await expect(page.locator('.city-admin-card')).toContainText('左營區');
  await expect(page.locator('.city-admin-card')).toContainText('第4選舉區');
  await expect(page.locator('#scene-heading')).toContainText('第4選舉區');
});
