import type { Page } from '@playwright/test';

const DISTRICT_LABEL = '.hex-district-label';
const ADMIN_CARD = '.city-admin-card';

/**
 * Return to the city overview, where the 38 district labels are interactive.
 * The floating tray bar was removed, so navigation now goes through the map
 * (admin card back button) or Escape.
 */
export async function returnToWorld(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if ((await page.locator(DISTRICT_LABEL).count()) > 0) return;
    const backToWorld = page
      .locator(ADMIN_CARD)
      .getByRole('button', { name: '回到全市' });
    if (await backToWorld.isVisible().catch(() => false)) {
      await backToWorld.click();
    } else {
      await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(700);
  }
}

/** Focus an administrative district by clicking its label on the map. */
export async function focusAdmin(page: Page, name: string): Promise<void> {
  await returnToWorld(page);
  const label = page.locator(DISTRICT_LABEL, { hasText: name }).first();
  await label.waitFor({ state: 'visible', timeout: 30_000 });
  const box = await label.boundingBox();
  if (!box) throw new Error(`${name} district label is not visible`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.locator(ADMIN_CARD).waitFor({ state: 'visible', timeout: 30_000 });
}
