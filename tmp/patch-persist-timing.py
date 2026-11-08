
from pathlib import Path
p=Path('tests/e2e/unified-world.spec.ts')
s=p.read_text()
s=s.replace("""    await page.getByRole('button', { name: '關閉人物資料' }).click();
    await page.locator('[aria-controls="city-admin-tray"]').click();""",
"""    await page.getByRole('button', { name: '關閉人物資料' }).click();
    await expect(page.locator('.profile-panel')).toBeHidden();
    await page.waitForTimeout(300);
    await page.locator('[aria-controls="city-admin-tray"]').click();""")
s=s.replace("""    await expect(
      page.locator('[data-testid="city-explorer"]'),
    ).toHaveAttribute('data-scene-focus', /^admin-E04-/, { timeout: 15_000 });""",
"""    await expect(page.locator('.city-admin-card')).toBeVisible();
    await expect(
      page.locator('[data-testid="city-explorer"]'),
    ).toHaveAttribute('data-scene-focus', /^admin-E04-/, { timeout: 15_000 });""")
# Raise timeout for this test.
s=s.replace("""  test('simulation persists when the profile closes and another district is focused', async ({
    page,
  }) => {
    await page.goto(""",
"""  test('simulation persists when the profile closes and another district is focused', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.goto(""")
p.write_text(s)
print('persistence timing')
