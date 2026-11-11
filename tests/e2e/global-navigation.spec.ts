import { expect, type Page, test } from '@playwright/test';

// Header screenshot baselines are captured headlessly; headed Chromium uses
// different font rasterisation and GPU antialiasing, so force this spec headless.
test.use({ headless: true });

const HEADER = '[data-testid="global-header"]';
const DESKTOP_NAV = '.global-header__nav';
const NAV_LABELS = ['城市探索', '選舉區'];

const ROUTES = [
  { path: '/', active: '城市探索', current: 'page' },
  { path: '/districts/', active: '選舉區', current: 'page' },
  {
    path: '/districts/kaohsiung-council-04/',
    active: '選舉區',
    current: 'location',
  },
  {
    path: '/candidates/zhang-jing-2026/',
    active: '選舉區',
    current: 'location',
  },
] as const;

const VISUAL_ROUTES = [
  { name: 'explorer', path: '/' },
  { name: 'districts', path: '/districts/' },
  { name: 'district-detail', path: '/districts/kaohsiung-council-04/' },
  { name: 'candidate-profile', path: '/candidates/zhang-jing-2026/' },
] as const;

async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator(HEADER)).toHaveAttribute('data-hydrated', 'true');
  await page.evaluate(async () => {
    await document.fonts.ready;
    document.querySelector('astro-dev-toolbar')?.remove();
  });
}

async function stabilizeVisual(page: Page) {
  await page.addStyleTag({
    content: `
      html, body { background: #fff9f0 !important; }
      .city-stage, .city-vignette, .city-scene-label, .city-loading,
      .site-footer { display: none !important; }
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
      }
    `,
  });
  await page.waitForTimeout(100);
}

async function boxFor(page: Page, selector: string) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`missing bounding box for ${selector}`);
  return box;
}

async function measureHeader(page: Page) {
  const navLinks = await page.locator(`${DESKTOP_NAV} a`).evaluateAll((items) =>
    items.map((item) => {
      const rect = item.getBoundingClientRect();
      const style = getComputedStyle(item);
      return {
        text: item.textContent?.trim() ?? '',
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        padding: style.padding,
        borderRadius: style.borderRadius,
      };
    }),
  );

  return {
    header: await boxFor(page, HEADER),
    surface: await boxFor(page, '.global-header__surface'),
    brand: await boxFor(page, '.global-header__brand'),
    mark: await boxFor(page, '.brand-lockup__mark'),
    nav: await boxFor(page, DESKTOP_NAV),
    search: await boxFor(page, '.global-header__search'),
    settings: await boxFor(page, '.global-header__settings-slot'),
    navLinks,
  };
}

function expectSameBox(
  actual: { x: number; y: number; width: number; height: number },
  expected: { x: number; y: number; width: number; height: number },
  label: string,
) {
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    expect(
      Math.abs(actual[key] - expected[key]),
      `${label} ${key}: ${actual[key]} vs ${expected[key]}`,
    ).toBeLessThanOrEqual(1);
  }
}

test.describe('shared global navigation', () => {
  test('keeps identical header geometry and typography on every route', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, ROUTES[0].path);
    const baseline = await measureHeader(page);

    for (const route of ROUTES.slice(1)) {
      await open(page, route.path);
      const current = await measureHeader(page);

      expectSameBox(current.header, baseline.header, `${route.path} header`);
      expectSameBox(current.surface, baseline.surface, `${route.path} surface`);
      expectSameBox(current.brand, baseline.brand, `${route.path} brand`);
      expectSameBox(current.mark, baseline.mark, `${route.path} mark`);
      expectSameBox(current.nav, baseline.nav, `${route.path} nav`);
      expectSameBox(current.search, baseline.search, `${route.path} search`);
      expectSameBox(
        current.settings,
        baseline.settings,
        `${route.path} settings`,
      );
      expect(current.navLinks).toEqual(baseline.navLinks);
    }
  });

  test('marks exactly one current destination for every route', async ({
    page,
  }) => {
    for (const route of ROUTES) {
      await open(page, route.path);
      const nav = page.locator(DESKTOP_NAV);
      await expect(nav.locator('a')).toHaveText(NAV_LABELS);
      await expect(nav.locator('a[aria-current]')).toHaveCount(1);
      await expect(
        nav.locator(`a[aria-current="${route.current}"]`),
      ).toHaveText(route.active);
    }
  });

  test('keeps candidate search available on content pages', async ({
    page,
  }) => {
    await open(page, '/districts/');
    const input = page.locator('#candidate-search');
    await expect(input).toBeVisible();
    const inputBox = await input.boundingBox();
    expect(inputBox?.height ?? 0).toBeGreaterThanOrEqual(44);

    await input.fill('張靜');
    const result = page
      .locator('.global-header__search-results .city-candidate')
      .first();
    await expect(result).toBeVisible();
    await expect(result).toHaveAttribute(
      'href',
      /\/candidates\/zhang-jing-2026\/$/,
    );
    await result.click();
    await expect(page).toHaveURL(/\/candidates\/zhang-jing-2026\/$/);
  });

  test('floats over the explorer without covering the map interaction area', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, '/');
    const header = await boxFor(page, HEADER);
    expect(header.height).toBeLessThan(900 * 0.15);

    const point = { x: 720, y: header.y + header.height + 24 };
    const hitsHeader = await page.evaluate(
      ({ x, y }) =>
        Boolean(
          document
            .elementFromPoint(x, y)
            ?.closest('[data-testid="global-header"]'),
        ),
      point,
    );
    expect(hitsHeader).toBe(false);
  });

  test('leaves clear space between the fixed header and page content', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const route of [
      '/districts/',
      '/districts/kaohsiung-council-04/',
      '/candidates/zhang-jing-2026/',
    ]) {
      await open(page, route);
      const header = await boxFor(page, '.global-header__surface');
      const heading = await boxFor(page, 'main h1');
      expect(
        heading.y,
        `${route} content must clear the header`,
      ).toBeGreaterThanOrEqual(header.y + header.height + 8);
    }
  });

  test('uses one responsive navigation at mobile and tablet widths', async ({
    page,
  }) => {
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      await open(page, '/districts/');

      const header = await boxFor(page, HEADER);
      expect(header.x).toBeGreaterThanOrEqual(0);
      expect(header.x + header.width).toBeLessThanOrEqual(width + 1);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width + 1);

      const nav = page.locator(DESKTOP_NAV);
      const menuButton = page.locator('.global-header__menu-button');
      await expect(nav).toBeHidden();
      await expect(menuButton).toBeVisible();
      await expect(menuButton).toHaveAttribute('aria-label', '開啟網站選單');

      for (const target of [
        { selector: '.global-header__brand', label: 'brand' },
        { selector: '.global-header__search input', label: 'search' },
        { selector: '.global-header__menu-button', label: 'menu' },
      ]) {
        const targetBox = await boxFor(page, target.selector);
        expect(
          targetBox.width,
          `${width}px ${target.label} width`,
        ).toBeGreaterThanOrEqual(44);
        expect(
          targetBox.height,
          `${width}px ${target.label} height`,
        ).toBeGreaterThanOrEqual(44);
      }

      await menuButton.click();
      const menu = page.locator('#global-mobile-nav');
      await expect(menu).toBeVisible();
      const menuBox = await boxFor(page, '#global-mobile-nav');
      expect(menuBox.x).toBeGreaterThanOrEqual(0);
      expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(width + 1);
      await expect(menu.locator('nav a')).toHaveCount(2);
      await expect(menu.locator('nav a[aria-current="page"]')).toContainText(
        '選舉區',
      );

      await page.keyboard.press('Escape');
      await expect(menu).toBeHidden();
      await expect(menuButton).toBeFocused();
    }
  });
});

test.describe('global header visual regression', () => {
  test.skip(
    process.platform !== 'darwin',
    'Header baselines are macOS-specific because the site uses platform CJK fonts.',
  );

  for (const route of VISUAL_ROUTES) {
    test(`desktop ${route.name}`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await open(page, route.path);
      await stabilizeVisual(page);
      await expect(page.locator(HEADER)).toHaveScreenshot(
        `global-header-${route.name}-desktop.png`,
        {
          animations: 'disabled',
          caret: 'hide',
          maxDiffPixelRatio: 0.002,
        },
      );
    });
  }

  for (const route of VISUAL_ROUTES.slice(0, 3)) {
    test(`mobile ${route.name}`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await open(page, route.path);
      await stabilizeVisual(page);
      await expect(page.locator(HEADER)).toHaveScreenshot(
        `global-header-${route.name}-mobile.png`,
        {
          animations: 'disabled',
          caret: 'hide',
          maxDiffPixelRatio: 0.002,
        },
      );
    });
  }
});
