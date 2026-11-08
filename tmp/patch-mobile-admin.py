
from pathlib import Path
p = Path('tests/e2e/mobile.spec.ts')
s = p.read_text()
needle = """  await districtToggle.click();
  await expect(districtTray).toBeHidden();
  await page.locator('[aria-controls="city-people-tray"]').click();"""
replacement = """  await districtToggle.click();
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

  await page.locator('[aria-controls="city-people-tray"]').click();"""
if needle not in s:
    raise SystemExit('needle not found')
s = s.replace(needle, replacement)
p.write_text(s)
print('mobile admin touch measurement added')
