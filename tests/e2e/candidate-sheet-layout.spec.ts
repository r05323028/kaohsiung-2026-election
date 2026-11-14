import { expect, type Page, test } from '@playwright/test';

const HEADER_SURFACE = '.global-header__surface';
const SHEET_SURFACE = '#city-people-tray';
const SHEET_SCROLL = '.candidate-sheet__scroll';

type Box = { x: number; y: number; width: number; height: number };

async function openExplorer(page: Page, path = '/') {
  await page.goto(path);
  await expect(page.getByTestId('city-explorer')).toHaveAttribute(
    'data-hydrated',
    'true',
  );
  await page.evaluate(() =>
    document.querySelector('astro-dev-toolbar')?.remove(),
  );
}

async function openSheet(page: Page, path = '/') {
  await openExplorer(page, path);
  await page.locator('[aria-controls="city-people-tray"]').click();
  const surface = page.locator(SHEET_SURFACE);
  await expect(surface).toBeVisible();
  await settleSheet(page);
  return surface;
}

/** Wait for the rise animation so measurements are not taken mid-transform. */
async function settleSheet(page: Page) {
  await page
    .locator(SHEET_SURFACE)
    .evaluate((element) =>
      Promise.all(
        element
          .getAnimations({ subtree: true })
          .map((animation) => animation.finished.catch(() => undefined)),
      ),
    );
}

async function boxOf(page: Page, selector: string): Promise<Box> {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`missing bounding box for ${selector}`);
  return box;
}

async function expectSheetBelowNavbar(page: Page) {
  const navbar = await boxOf(page, HEADER_SURFACE);
  const surface = await boxOf(page, SHEET_SURFACE);
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('missing viewport');

  expect(
    surface.y,
    `sheet top ${surface.y} must clear navbar bottom ${navbar.y + navbar.height}`,
  ).toBeGreaterThanOrEqual(navbar.y + navbar.height);
  expect(surface.y).toBeLessThan(navbar.y + navbar.height + 32);
  expect(surface.y).toBeGreaterThanOrEqual(0);
  expect(surface.y + surface.height).toBeLessThanOrEqual(viewport.height + 0.5);
  expect(surface.x).toBeGreaterThanOrEqual(-0.5);
  expect(surface.x + surface.width).toBeLessThanOrEqual(viewport.width + 0.5);

  // The navbar must still paint above the sheet dialog: no dimming layer or
  // sheet surface may cover the brand or the search field.
  const paintOrder = await page.evaluate(() => {
    const header = document.querySelector('.global-header__surface');
    const sheet = document.querySelector('#city-people-tray');
    if (!header || !sheet) throw new Error('header or sheet missing');
    const headerRect = header.getBoundingClientRect();
    const points: Array<[number, number]> = [
      [headerRect.left + 12, headerRect.top + headerRect.height / 2],
      [headerRect.right - 12, headerRect.top + headerRect.height / 2],
    ];
    return points.map(([x, y]) => {
      const element = document.elementFromPoint(x, y);
      return {
        header: Boolean(element?.closest('[data-testid="global-header"]')),
        sheet: Boolean(element?.closest('#city-people-tray')),
      };
    });
  });
  for (const point of paintOrder) {
    expect(point.header).toBe(true);
    expect(point.sheet).toBe(false);
  }

  await expect(page.locator('.candidate-sheet__close')).toBeVisible();
  await expect(page.locator('.candidate-sheet__drag-indicator')).toBeVisible();

  const close = await boxOf(page, '.candidate-sheet__close');
  expect(close.y).toBeGreaterThanOrEqual(surface.y);
  expect(close.y + close.height).toBeLessThanOrEqual(viewport.height + 0.5);

  const sheetHeader = await boxOf(page, '.candidate-sheet__header');
  expect(sheetHeader.y).toBeGreaterThanOrEqual(surface.y - 0.5);
  expect(sheetHeader.y + sheetHeader.height).toBeLessThanOrEqual(
    surface.y + surface.height + 0.5,
  );

  return { navbar, surface, close, sheetHeader };
}

test.describe('candidate sheet below the global navbar', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('desktop expanded sheet clears the navbar and renders the focused roster', async ({
    page,
  }) => {
    const surface = await openSheet(page, '/?admin=E03');
    await expectSheetBelowNavbar(page);

    await expect(surface.locator('.candidate-sheet__group')).toHaveCount(2);
    await expect(surface.locator('.candidate-sheet__card')).toHaveCount(17);

    const scroller = await page.evaluate((selector) => {
      const scroll = document.querySelector(selector);
      if (!scroll) throw new Error('missing sheet scroller');
      return {
        overflowY: getComputedStyle(scroll).overflowY,
        clientHeight: scroll.clientHeight,
        scrollHeight: scroll.scrollHeight,
        pageScrollY: window.scrollY,
      };
    }, SHEET_SCROLL);
    expect(scroller.overflowY).toBe('auto');
    expect(scroller.scrollHeight).toBeGreaterThanOrEqual(scroller.clientHeight);
    expect(scroller.pageScrollY).toBe(0);

    const headerBefore = await boxOf(page, '.candidate-sheet__header');

    // Every constituency group must be reachable without moving the page.
    await page.addStyleTag({
      content: 'html { scroll-behavior: auto !important; }',
    });
    const reach = await page.evaluate((selector) => {
      const scroll = document.querySelector(selector);
      if (!scroll) throw new Error('missing sheet scroller');
      const scrollerRect = scroll.getBoundingClientRect();
      const groups = [...scroll.querySelectorAll('.candidate-sheet__group')];
      const unreachable: string[] = [];
      for (const group of groups) {
        group.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        const heading = group.querySelector('.candidate-sheet__group-heading');
        if (!heading) {
          unreachable.push('missing-heading');
          continue;
        }
        const rect = heading.getBoundingClientRect();
        const visible =
          rect.top >= scrollerRect.top - 1 &&
          rect.bottom <= scrollerRect.bottom + 1;
        if (!visible) {
          unreachable.push(group.getAttribute('data-constituency-id') ?? '?');
        }
      }
      const last = groups.at(-1);
      return {
        count: groups.length,
        unreachable,
        scrollTop: scroll.scrollTop,
        pageScrollY: window.scrollY,
        lastGroup: last?.getAttribute('data-constituency-id') ?? null,
      };
    }, SHEET_SCROLL);

    expect(reach.count).toBe(2);
    expect(reach.unreachable).toEqual([]);
    expect(reach.lastGroup).toBeTruthy();
    expect(reach.pageScrollY).toBe(0);

    // The sheet header is a fixed row: scrolling the roster leaves it in place.
    const headerAfter = await boxOf(page, '.candidate-sheet__header');
    expect(Math.abs(headerAfter.y - headerBefore.y)).toBeLessThanOrEqual(0.5);
    await expectSheetBelowNavbar(page);
  });

  test('desktop drag gestures still open and close the sheet', async ({
    page,
  }) => {
    await openExplorer(page);

    const handle = await boxOf(page, '.candidate-sheet__handle');
    const handleX = handle.x + handle.width / 2;
    const handleY = handle.y + handle.height / 2;
    await page.mouse.move(handleX, handleY);
    await page.mouse.down();
    await page.mouse.move(handleX, handleY - 80, { steps: 8 });
    await page.mouse.up();

    await expect(page.locator(SHEET_SURFACE)).toBeVisible();
    await settleSheet(page);
    await expectSheetBelowNavbar(page);

    const header = await boxOf(page, '.candidate-sheet__header');
    const headerX = header.x + header.width / 2;
    const headerY = header.y + header.height / 2;
    await page.mouse.move(headerX, headerY);
    await page.mouse.down();
    await page.mouse.move(headerX, headerY + 120, { steps: 8 });
    await page.mouse.up();

    await expect(page.locator(SHEET_SURFACE)).toBeHidden();
    await expect(page.locator('.candidate-sheet__handle')).toBeVisible();
  });

  test('desktop sheet survives viewing a candidate profile and reopening', async ({
    page,
  }) => {
    const surface = await openSheet(page);

    await surface.locator('.candidate-sheet__card').first().click();
    await expect(page.locator('.profile-panel.is-open')).toBeVisible();
    await expect(surface).toBeHidden();

    await page.locator('.profile-panel.is-open .profile-panel__close').click();
    await expect(page.locator('.profile-panel.is-open')).toBeHidden();
    await expect(page.locator('.candidate-sheet__handle')).toBeVisible();

    await page.locator('[aria-controls="city-people-tray"]').click();
    await expect(surface).toBeVisible();
    await settleSheet(page);
    await expectSheetBelowNavbar(page);
  });

  test('desktop sheet tracks viewport resizing', async ({ page }) => {
    await openSheet(page);
    await expectSheetBelowNavbar(page);

    await page.setViewportSize({ width: 1024, height: 640 });
    await expect
      .poll(async () => {
        const surface = await boxOf(page, SHEET_SURFACE);
        return Math.round(surface.y + surface.height);
      })
      .toBeLessThanOrEqual(640);

    const layout = await expectSheetBelowNavbar(page);
    expect(layout.surface.y).toBeLessThanOrEqual(640 - 200);

    await page.setViewportSize({ width: 1280, height: 1024 });
    await expectSheetBelowNavbar(page);
  });
});

test.describe('candidate sheet below the global navbar on mobile viewports', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('mobile expanded sheet keeps its header and close button reachable', async ({
    page,
  }) => {
    const surface = await openSheet(page, '/?admin=E03');
    await expectSheetBelowNavbar(page);

    const closeButton = await boxOf(page, '.candidate-sheet__close');
    expect(closeButton.width).toBeGreaterThanOrEqual(44);
    expect(closeButton.height).toBeGreaterThanOrEqual(44);

    const handle = await boxOf(page, '.candidate-sheet__drag-indicator');
    const sheet = await boxOf(page, SHEET_SURFACE);
    expect(handle.y).toBeGreaterThanOrEqual(sheet.y);
    expect(handle.y + handle.height).toBeLessThanOrEqual(sheet.y + 96);

    const scrollIsIndependent = await page.evaluate((selector) => {
      const scroll = document.querySelector(selector);
      if (!scroll) throw new Error('missing sheet scroller');
      scroll.scrollTop = scroll.scrollHeight;
      return {
        scrollTop: scroll.scrollTop,
        pageScrollY: window.scrollY,
        documentScrollTop: document.scrollingElement?.scrollTop ?? 0,
        overflowY: getComputedStyle(scroll).overflowY,
      };
    }, SHEET_SCROLL);
    expect(scrollIsIndependent.overflowY).toBe('auto');
    expect(scrollIsIndependent.scrollTop).toBeGreaterThan(0);
    expect(scrollIsIndependent.pageScrollY).toBe(0);
    expect(scrollIsIndependent.documentScrollTop).toBe(0);

    const closeStillVisible = await boxOf(page, '.candidate-sheet__close');
    expect(Math.abs(closeStillVisible.y - closeButton.y)).toBeLessThanOrEqual(
      1,
    );
    await expect(
      surface.locator('.candidate-sheet__group').last(),
    ).toBeVisible();
  });

  test('mobile sheet keeps navbar clearance after closing the dialog', async ({
    page,
  }) => {
    await openSheet(page);
    await page.locator('.candidate-sheet__close').click();
    await expect(page.locator(SHEET_SURFACE)).toBeHidden();
    await expect(page.locator('.candidate-sheet__handle')).toBeVisible();

    await page.locator('[aria-controls="city-people-tray"]').click();
    await expect(page.locator(SHEET_SURFACE)).toBeVisible();
    await settleSheet(page);
    await expectSheetBelowNavbar(page);
  });
});
