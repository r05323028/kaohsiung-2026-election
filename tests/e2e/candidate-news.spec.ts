import { expect, type Page, test } from '@playwright/test';

/**
 * Published news coverage on candidate profiles. Only independently verified,
 * editorially approved articles appear, always with publisher, date and a link
 * to the original source. No sentiment, tone or favourability control exists.
 */
async function openNewsTab(page: Page, slug: string) {
  await page.goto(`/candidates/${slug}/`);
  await expect(page.getByTestId('profile-tabs')).toHaveAttribute(
    'data-hydrated',
    'true',
    { timeout: 30_000 },
  );
  await page.getByRole('tab', { name: '相關新聞' }).click();
  const section = page.locator('[data-profile-section="news"]');
  await expect(section).toBeVisible();
  return section;
}

test.describe('candidate published news', () => {
  test('lists verified coverage with publisher, date and source link', async ({
    page,
  }) => {
    const section = await openNewsTab(page, 'ke-zhi-en-2026');
    await expect(section.getByTestId('news-filters')).toBeVisible();

    const cards = section.locator('article.content-card');
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeGreaterThan(5);

    const firstLink = cards.first().locator('h4 a');
    await expect(firstLink).toHaveAttribute('href', /^https:\/\//);
    await expect(firstLink).toHaveAttribute('target', '_blank');
    await expect(
      cards.first().locator('.content-card__meta span').first(),
    ).toHaveText(/^\d{4}-\d{2}-\d{2}$/);

    const body = await section.innerText();
    expect(body).not.toMatch(/好感度|聲量|正負面|情緒|sentiment/i);
  });

  test('filters by publisher without dropping the source link', async ({
    page,
  }) => {
    const section = await openNewsTab(page, 'ke-zhi-en-2026');
    const publisherSelect = section
      .getByTestId('news-filters')
      .locator('select')
      .first();
    const options = await publisherSelect
      .locator('option')
      .evaluateAll((nodes) =>
        nodes.map((node) => (node as HTMLOptionElement).value),
      );
    expect(options.length).toBeGreaterThan(1);

    const before = await section.locator('article.content-card').count();
    await publisherSelect.selectOption(options[1] ?? 'all');
    const after = await section.locator('article.content-card').count();
    expect(after).toBeGreaterThan(0);
    expect(after).toBeLessThanOrEqual(before);

    const hrefs = await section
      .locator('article.content-card h4 a')
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute('href') ?? ''),
      );
    for (const href of hrefs) expect(href).toMatch(/^https:\/\//);
  });

  test('shows the neutral empty state for a candidate without coverage', async ({
    page,
  }) => {
    const section = await openNewsTab(page, 'kaohsiung-council-01-ee1634c3');
    await expect(section).toContainText('相關新聞：暫無公開新聞資料');
    await expect(section.getByTestId('news-filters')).toHaveCount(0);
  });
});
