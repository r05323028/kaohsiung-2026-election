import { expect, type Page, test } from '@playwright/test';
import { rosterGroupCount, rosterTotal } from './official-roster';

test('mobile layout exposes touch-friendly candidate navigation and bottom-sheet profile', {
  tag: '@critical',
}, async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('city-explorer')).toHaveAttribute(
    'data-hydrated',
    'true',
  );
  await page.locator('[aria-controls="city-people-tray"]').click();
  await expect(page.getByRole('heading', { name: '所有候選人' })).toBeVisible();
  const candidateSheet = page.locator('#city-people-tray');
  await expect(candidateSheet.locator('.candidate-sheet__group')).toHaveCount(
    rosterGroupCount,
  );
  await expect(candidateSheet.locator('.candidate-sheet__card')).toHaveCount(
    rosterTotal,
  );
  const badge = candidateSheet.locator('.candidate-sheet__ballot').first();
  await expect(badge).toBeVisible();
  await expect(badge.locator('.candidate-sheet__ballot-number')).toHaveText(
    /^\d{1,2}$/,
  );
  await expect(badge.locator('.candidate-sheet__ballot-label')).toHaveText(
    '號次',
  );
  const badgeFit = await badge.evaluate((element) => {
    const copy = element.parentElement;
    const card = element.closest('.candidate-sheet__card');
    if (!copy || !card) throw new Error('candidate card is missing');
    const badgeRect = element.getBoundingClientRect();
    const copyRect = copy.getBoundingClientRect();
    return {
      width: badgeRect.width,
      copyWidth: copyRect.width,
      cardScrollWidth: card.scrollWidth,
      cardClientWidth: card.clientWidth,
    };
  });
  expect(badgeFit.width).toBeLessThan(badgeFit.copyWidth - 2);
  expect(badgeFit.cardScrollWidth).toBeLessThanOrEqual(
    badgeFit.cardClientWidth + 1,
  );
  await page.locator('.candidate-sheet__card').first().click();
  await expect(page.locator('.profile-panel.is-open')).toBeVisible();
  await expect(page.locator('.profile-panel.is-open')).toContainText(
    '官方資料',
  );
});

test('mobile avatar preview stays within the touch viewport', async ({
  page,
}) => {
  await page.goto('/avatar-preview/');
  const preview = page.getByTestId('avatar-preview-app');
  await expect(preview).toHaveAttribute('data-hydrated', 'true');
  const canvas = preview.getByTestId('avatar-preview-canvas');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  expect(box?.width ?? 0).toBeLessThanOrEqual(393);
  await expect(preview.locator('select option')).toHaveCount(5);
  await expect(preview).toContainText('validated');
});

test('mobile essential controls meet a 44px touch target at 390x844', {
  tag: '@critical',
}, async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByTestId('city-explorer')).toHaveAttribute(
    'data-hydrated',
    'true',
  );
  await page.waitForTimeout(250);
  await page
    .evaluate(() => document.querySelector('astro-dev-toolbar')?.remove())
    .catch(() => undefined);

  const measure = async (selector: string) =>
    page.locator(selector).evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect();
        const html = element as HTMLElement;
        return {
          label:
            html.getAttribute('aria-label') ??
            html.textContent?.trim().slice(0, 20) ??
            html.tagName,
          width: rect.width,
          height: rect.height,
        };
      }),
    );

  const assertTargets = (
    targets: Array<{ label: string; width: number; height: number }>,
    group: string,
  ) => {
    expect(targets.length, group).toBeGreaterThan(0);
    for (const target of targets) {
      expect(
        target.width,
        `${group}: ${target.label} width`,
      ).toBeGreaterThanOrEqual(44);
      expect(
        target.height,
        `${group}: ${target.label} height`,
      ).toBeGreaterThanOrEqual(44);
    }
  };

  assertTargets(
    await measure(
      '.global-header__search input, .global-header__settings-button, .candidate-sheet__handle',
    ),
    'top controls',
  );

  await page.evaluate(() =>
    document.querySelector('astro-dev-toolbar')?.remove(),
  );
  const zuoyingLabel = page
    .locator('.hex-district-label', { hasText: '左營' })
    .first();
  const zuoyingBox = await zuoyingLabel.boundingBox();
  if (!zuoyingBox) throw new Error('左營 district label is not visible');
  await page.mouse.click(
    zuoyingBox.x + zuoyingBox.width / 2,
    zuoyingBox.y + zuoyingBox.height / 2,
  );
  const adminCard = page.locator('.city-admin-card');
  await expect(adminCard).toBeVisible();
  assertTargets(
    await measure('.city-admin-card .city-landmark-card__actions button'),
    'admin card',
  );
  await adminCard.getByRole('button', { name: '回到全市' }).click();
  await expect(adminCard).toBeHidden();

  // Returning from an admin focus re-renders the scene with the citywide
  // actor scope. The collapsed trigger keeps the complete official roster.
  const explorer = page.getByTestId('city-explorer');
  await expect(explorer).toHaveAttribute('data-candidate-scope', 'citywide');
  await expect(explorer).toHaveAttribute('data-candidate-count', '5');
  await expect(explorer).toHaveAttribute(
    'data-scene-focus',
    /^world-overview-/,
  );
  const peopleTrigger = page.locator('[aria-controls="city-people-tray"]');
  await expect(peopleTrigger).toContainText(`${rosterTotal} 位`);
  await peopleTrigger.click();
  const peopleTray = page.locator('#city-people-tray');
  await expect(peopleTray).toBeVisible();
  // Wait for the rise animation: mid-flight composited transforms report
  // sub-pixel sizes and would make the exact 44px assertion flaky.
  await peopleTray.evaluate((element) =>
    Promise.all(
      element
        .getAnimations({ subtree: true })
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  );
  assertTargets(
    await measure(
      '#city-people-tray .candidate-sheet__close, #city-people-tray .city-candidate',
    ),
    'people tray',
  );

  await peopleTray.locator('.city-candidate').first().click();
  const profile = page.locator('.profile-panel.is-open');
  await expect(profile).toBeVisible();
  await expect(profile.locator('.profile-tabs__list [role="tab"]')).toHaveCount(
    6,
    {
      timeout: 15_000,
    },
  );
  assertTargets(
    await measure(
      '.profile-panel.is-open .profile-panel__close, .profile-panel.is-open .profile-tabs__list .tab-button',
    ),
    'profile panel',
  );
  await profile.locator('.profile-panel__close').click();
  await expect(profile).toBeHidden();

  await page.getByRole('button', { name: '顯示與體驗設定' }).click();
  await expect(page.locator('.city-settings')).toBeVisible();
  assertTargets(
    await measure(
      '.city-settings__head button, .city-settings__quality button, .city-settings__toggle, .city-settings__reset',
    ),
    'settings',
  );
  await page.getByRole('button', { name: '關閉設定' }).click();

  await page.getByLabel('搜尋人物').fill('林');
  await expect(page.locator('.global-header__search-clear')).toBeVisible();
  assertTargets(await measure('.global-header__search-clear'), 'search clear');
  await page.getByRole('button', { name: '清除搜尋' }).click();

  await page.goto('/?district=kaohsiung-council-04&focus=lotus-pond');
  await expect(page.getByTestId('city-explorer')).toHaveAttribute(
    'data-hydrated',
    'true',
  );
  await expect(page.locator('[data-testid="city-explorer"]')).toHaveAttribute(
    'data-scene-focus',
    /^scope-/,
    { timeout: 20_000 },
  );
  await expect(page.locator('.city-landmark-card')).toHaveCount(0);
  await expect(page.getByTestId('scene-frame').locator('canvas')).toBeVisible();
});

test('mobile constituency coverage fits the viewport and links to admin focus', async ({
  page,
}) => {
  await page.goto('/districts/kaohsiung-council-04/');
  const coverage = page.getByTestId('constituency-coverage');
  await expect(coverage).toBeVisible();
  const sectionBox = await coverage.boundingBox();
  const viewport = page.viewportSize();
  expect(sectionBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect((sectionBox?.x ?? 0) + (sectionBox?.width ?? 0)).toBeLessThanOrEqual(
    viewport?.width ?? 0,
  );

  const chip = coverage.getByRole('link', { name: '左營區', exact: true });
  const chipBox = await chip.boundingBox();
  expect(chipBox?.height ?? 0).toBeGreaterThanOrEqual(43.5);
  await chip.click();
  await expect(page).toHaveURL(/district=kaohsiung-council-04/);
  await expect(page).toHaveURL(/admin=E03/);
  await expect(page.getByTestId('city-explorer')).toHaveAttribute(
    'data-hydrated',
    'true',
  );
  await expect(page.locator('.city-admin-card')).toContainText('左營區');
  await expect(page.locator('.city-admin-card')).toContainText('第4選舉區');
});

test('mobile administrative district card stays compact and wraps cleanly', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?admin=E03');
  await expect(page.getByTestId('city-explorer')).toHaveAttribute(
    'data-hydrated',
    'true',
  );

  const card = page.locator('.city-admin-card');
  await expect(card).toBeVisible();
  await expect(
    card.getByRole('heading', { name: '左營區', level: 2 }),
  ).toBeVisible();
  await expect(card).not.toContainText('藝術化示意');

  const geometry = await card.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      bottom: rect.bottom,
      right: rect.right,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      rows: element.querySelectorAll('.city-admin-card__constituencies li')
        .length,
    };
  });
  expect(geometry.right).toBeLessThanOrEqual(390);
  expect(geometry.bottom).toBeLessThanOrEqual(844);
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
  expect(geometry.rows).toBeGreaterThan(0);
});

test('mobile profile panel keeps the official ballot number visible', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('city-explorer')).toHaveAttribute(
    'data-hydrated',
    'true',
  );
  await page.locator('[aria-controls="city-people-tray"]').click();
  await page.getByRole('button', { name: /張靜/ }).first().click();
  const panel = page.locator('.profile-panel.is-open');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('選票號次');
  await expect(panel).toContainText('1 號');
});

test('mobile roster sheet opens fully below the fixed masthead', async ({
  page,
}) => {
  await page.goto('/?admin=E03');
  await expect(page.getByTestId('city-explorer')).toHaveAttribute(
    'data-hydrated',
    'true',
  );
  await page.locator('[aria-controls="city-people-tray"]').click();

  const sheet = page.locator('#city-people-tray');
  await expect(sheet).toBeVisible();
  await sheet.evaluate((element) =>
    Promise.all(
      element
        .getAnimations({ subtree: true })
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  );

  const navbarBox = await page.locator('.global-header__surface').boundingBox();
  const sheetBox = await sheet.boundingBox();
  const viewport = page.viewportSize();
  if (!navbarBox || !sheetBox || !viewport) {
    throw new Error('missing layout boxes');
  }

  expect(sheetBox.y).toBeGreaterThanOrEqual(navbarBox.y + navbarBox.height);
  expect(sheetBox.y).toBeLessThan(navbarBox.y + navbarBox.height + 32);
  expect(sheetBox.y + sheetBox.height).toBeLessThanOrEqual(
    viewport.height + 0.5,
  );

  await expect(
    sheet.getByRole('heading', { name: '所有候選人' }),
  ).toBeVisible();
  const closeBox = await page.locator('.candidate-sheet__close').boundingBox();
  expect(closeBox?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(closeBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(closeBox?.y ?? 0).toBeGreaterThanOrEqual(sheetBox.y);

  const roster = await sheet.evaluate((element) => {
    const scroller = element.querySelector('.candidate-sheet__scroll');
    if (!(scroller instanceof HTMLElement)) {
      throw new Error('missing roster scroller');
    }
    scroller.scrollTop = scroller.scrollHeight;
    return {
      scrollTop: scroller.scrollTop,
      pageScrollY: window.scrollY,
      groups: element.querySelectorAll('.candidate-sheet__group').length,
    };
  });
  expect(roster.groups).toBe(rosterGroupCount);
  expect(roster.scrollTop).toBeGreaterThan(0);
  expect(roster.pageScrollY).toBe(0);
  await expect(sheet.locator('.candidate-sheet__group').last()).toBeVisible();
});

type MobileWorldWindow = Window & {
  __kaohsiungCandidateVisibility?: () => {
    scope: 'citywide' | 'admin-district' | 'constituency';
    count: number;
    slugs: string[];
  };
  __kaohsiungActorScreenPosition?: (
    slug: string,
  ) => { x: number; y: number } | null;
  __kaohsiungWorld?: {
    actors: () => {
      slug: string;
      displayName?: string;
      role: 'mayor' | 'council' | 'indigenous' | 'demo';
    }[];
  };
};

async function openMobileCity(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByTestId('city-explorer')).toHaveAttribute(
    'data-hydrated',
    'true',
    { timeout: 30_000 },
  );
  await page.waitForFunction(
    () =>
      typeof (window as MobileWorldWindow).__kaohsiungCandidateVisibility ===
      'function',
    undefined,
    { timeout: 30_000 },
  );
  await page.waitForTimeout(1800);
}

async function settleAnimations(locator: ReturnType<Page['locator']>) {
  await locator.evaluate((element) =>
    Promise.all(
      element
        .getAnimations({ subtree: true })
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  );
}

for (const viewport of [
  { width: 375, height: 667 },
  { width: 393, height: 852 },
]) {
  test(
    'mobile district summary stays compact until details are requested at ' +
      viewport.width +
      'x' +
      viewport.height,
    async ({ page }) => {
      test.setTimeout(90_000);
      await page.setViewportSize(viewport);
      await page.goto('/?admin=E03');
      const explorer = page.getByTestId('city-explorer');
      await expect(explorer).toHaveAttribute('data-hydrated', 'true');
      await expect(explorer).toHaveAttribute('data-admin-details', 'false');

      const card = page.locator('.city-admin-card');
      const handle = page.locator('.candidate-sheet__handle');
      const details = card.locator('.city-admin-card__details');
      const toggle = card.getByRole('button', { name: '查看完整資訊' });
      const backToCity = card.getByRole('button', { name: '回到全市' });
      const close = card.locator('.city-admin-card__close');
      const scrim = page.locator('.city-admin-card__scrim');

      await expect(card).toBeVisible();
      await expect(card).toHaveAttribute('data-expanded', 'false');
      await expect(
        card.getByRole('heading', { name: '左營區', level: 2 }),
      ).toBeVisible();
      await expect(
        card.locator('.city-admin-card__compact-coverage'),
      ).toContainText('第4選舉區');
      await expect(details).toBeHidden();
      await expect(card.locator('.city-admin-card__neighbors')).toBeHidden();
      await expect(close).toBeHidden();
      await expect(scrim).toHaveCount(0);
      await expect(handle).toBeVisible();
      await expect(toggle).toBeVisible();
      await expect(backToCity).toBeVisible();

      const compactLayout = await page.evaluate(() => {
        const cardElement = document.querySelector('.city-admin-card');
        const handleElement = document.querySelector(
          '.candidate-sheet__handle',
        );
        if (!cardElement || !handleElement) {
          throw new Error('missing compact layout elements');
        }
        const cardBox = cardElement.getBoundingClientRect();
        const handleBox = handleElement.getBoundingClientRect();
        return {
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          card: {
            top: cardBox.top,
            right: cardBox.right,
            bottom: cardBox.bottom,
            height: cardBox.height,
            scrollWidth: cardElement.scrollWidth,
            clientWidth: cardElement.clientWidth,
          },
          handleTop: handleBox.top,
        };
      });
      expect(compactLayout.card.right).toBeLessThanOrEqual(
        compactLayout.viewportWidth,
      );
      expect(compactLayout.card.scrollWidth).toBeLessThanOrEqual(
        compactLayout.card.clientWidth + 1,
      );
      expect(compactLayout.card.height).toBeLessThan(
        compactLayout.viewportHeight * 0.3,
      );
      expect(compactLayout.card.bottom).toBeLessThan(
        compactLayout.handleTop - 24,
      );

      for (const action of [toggle, backToCity]) {
        const box = await action.boundingBox();
        expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      }

      await toggle.click();
      await expect(explorer).toHaveAttribute('data-admin-details', 'true');
      await expect(card).toHaveAttribute('data-expanded', 'true');
      await expect(details).toBeVisible();
      await expect(
        card.getByRole('heading', { name: '相鄰行政區', level: 3 }),
      ).toBeVisible();
      await expect(
        card.locator('.city-admin-card__constituencies li').first(),
      ).toBeVisible();
      await expect(close).toBeVisible();
      await expect(handle).toBeHidden();
      await expect(scrim).toBeVisible();
      await settleAnimations(card);
      const closeBox = await close.boundingBox();
      expect(closeBox?.width ?? 0).toBeGreaterThanOrEqual(44);
      expect(closeBox?.height ?? 0).toBeGreaterThanOrEqual(44);

      await close.click();
      await expect(explorer).toHaveAttribute('data-admin-details', 'false');
      await expect(card).toHaveAttribute('data-expanded', 'false');
      await expect(details).toBeHidden();
      await expect(handle).toBeVisible();
      await expect(toggle).toBeFocused();

      await toggle.click();
      await expect(card).toHaveAttribute('data-expanded', 'true');
      await page.keyboard.press('Escape');
      await expect(explorer).toHaveAttribute('data-admin-details', 'false');
      await expect(card).toHaveAttribute('data-expanded', 'false');
      await expect(handle).toBeVisible();

      await toggle.click();
      await settleAnimations(card);
      await page.mouse.click(4, 180);
      await expect(explorer).toHaveAttribute('data-admin-details', 'false');
      await expect(card).toHaveAttribute('data-expanded', 'false');
      await expect(scrim).toHaveCount(0);
      await expect(handle).toBeVisible();

      await backToCity.click();
      await expect(card).toBeHidden();
      await expect(page).not.toHaveURL(/admin=E03/);
      await expect(page).not.toHaveURL(/district=/);
      await expect(explorer).toHaveAttribute(
        'data-candidate-scope',
        'citywide',
      );
      await expect(explorer).toHaveAttribute('data-candidate-count', '5');
      await expect(explorer).toHaveAttribute(
        'data-scene-focus',
        /^world-overview-/,
      );
      await expect(handle).toBeVisible();
      await expect(page.locator('.city-admin-card__scrim')).toHaveCount(0);
    },
  );
}

test('mobile compact district card leaves visible actors directly tappable', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 375, height: 667 });
  await openMobileCity(page, '/?admin=E03');

  const explorer = page.getByTestId('city-explorer');
  await expect(explorer).toHaveAttribute(
    'data-candidate-scope',
    'admin-district',
  );
  await expect(explorer).toHaveAttribute('data-candidate-count', '17');

  const target = await page.evaluate(() => {
    const bridge = window as MobileWorldWindow;
    const visibility = bridge.__kaohsiungCandidateVisibility?.();
    const actors = bridge.__kaohsiungWorld?.actors() ?? [];
    const cardElement = document.querySelector('.city-admin-card');
    const handleElement = document.querySelector('.candidate-sheet__handle');
    const headerElement = document.querySelector('.global-header__surface');
    if (!visibility || !cardElement || !handleElement || !headerElement) {
      throw new Error('missing actor or HUD geometry');
    }
    const card = cardElement.getBoundingClientRect();
    const handle = handleElement.getBoundingClientRect();
    const header = headerElement.getBoundingClientRect();
    const visible = new Set(visibility.slugs);
    const basePoints = actors
      .filter((actor) => visible.has(actor.slug) && actor.displayName)
      .flatMap((actor) => {
        const screen = bridge.__kaohsiungActorScreenPosition?.(actor.slug);
        if (!screen) return [];
        return [
          {
            slug: actor.slug,
            name: actor.displayName ?? '',
            x: screen.x,
            y: screen.y,
          },
        ];
      })
      .filter(
        (point) =>
          point.x > 12 &&
          point.x < window.innerWidth - 12 &&
          point.y > header.bottom + 12 &&
          point.y < handle.top - 12 &&
          !(
            point.x > card.left - 8 &&
            point.x < card.right + 8 &&
            point.y > card.top - 8 &&
            point.y < card.bottom + 8
          ),
      );
    const points = basePoints
      .map((point) => ({
        ...point,
        clearance: Math.min(
          ...basePoints
            .filter((other) => other.slug !== point.slug)
            .map((other) => Math.hypot(other.x - point.x, other.y - point.y)),
          Number.POSITIVE_INFINITY,
        ),
      }))
      .sort((left, right) => right.clearance - left.clearance);
    const chosen = points[0];
    if (!chosen) throw new Error('no tappable actor outside the card');
    return chosen;
  });

  await page.mouse.click(target.x, target.y);
  const profile = page.locator('.profile-panel.is-open');
  await expect(profile).toBeVisible({ timeout: 20_000 });
  await expect(profile.locator('h2')).toHaveText(target.name);
  await expect(page.getByTestId('scene-frame').locator('canvas')).toBeVisible();

  await profile.locator('[aria-label="關閉人物資料"]').click();
  await expect(profile).toHaveCount(0);
  const card = page.locator('.city-admin-card');
  await expect(card).toBeVisible();
  await expect(
    card.getByRole('heading', { name: '左營區', level: 2 }),
  ).toBeVisible();
  await expect(card).toHaveAttribute('data-expanded', 'false');
  await expect(page.locator('.candidate-sheet__handle')).toBeVisible();
  await expect(explorer).toHaveAttribute(
    'data-candidate-scope',
    'admin-district',
  );
  await expect(explorer).toHaveAttribute('data-candidate-count', '17');
});

test('mobile district details close cleanly across constituency and district switches', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto('/?admin=E03');
  const explorer = page.getByTestId('city-explorer');
  await expect(explorer).toHaveAttribute('data-hydrated', 'true');

  const card = page.locator('.city-admin-card');
  const handle = page.locator('.candidate-sheet__handle');
  await card.getByRole('button', { name: '查看完整資訊' }).click();
  await expect(card).toHaveAttribute('data-expanded', 'true');
  await expect(page.locator('.city-admin-card__scrim')).toBeVisible();

  await card.locator('.city-admin-card__constituencies button').first().click();
  await expect(card).toHaveCount(0);
  await expect(page.locator('.city-admin-card__scrim')).toHaveCount(0);
  await expect(explorer).toHaveAttribute('data-admin-details', 'false');
  await expect(page.getByTestId('city-coverage-card')).toBeVisible();
  await expect(page).toHaveURL(/district=kaohsiung-council-04/);
  await expect(page).not.toHaveURL(/admin=/);
  await expect(handle).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('city-coverage-card')).toHaveCount(0);
  await expect(page).not.toHaveURL(/district=/);
  await expect(explorer).toHaveAttribute('data-candidate-scope', 'citywide');

  await page.waitForTimeout(1600);
  const nanziLabel = page
    .locator('.hex-district-label', { hasText: '楠梓' })
    .first();
  await expect(nanziLabel).toBeVisible();
  const nanziBox = await nanziLabel.boundingBox();
  if (!nanziBox) throw new Error('楠梓 district label is not visible');
  await page.mouse.click(
    nanziBox.x + nanziBox.width / 2,
    nanziBox.y + nanziBox.height / 2,
  );
  await expect(card).toBeVisible();
  await expect(
    card.getByRole('heading', { name: '楠梓區', level: 2 }),
  ).toBeVisible();
  await expect(card).toHaveAttribute('data-expanded', 'false');
  await expect(card.locator('.city-admin-card__details')).toBeHidden();
  await expect(page.locator('.city-admin-card__scrim')).toHaveCount(0);
  await card.getByRole('button', { name: '回到全市' }).click();
  await expect(card).toHaveCount(0);
  await expect(explorer).toHaveAttribute('data-candidate-scope', 'citywide');
});

for (const width of [375, 390]) {
  test(`family graph keeps long labels readable at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/candidates/kaohsiung-council-09-07bd8300/');
    const profile = page.getByTestId('profile-tabs');
    await expect(profile).toHaveAttribute('data-hydrated', 'true', {
      timeout: 30_000,
    });
    await profile
      .getByRole('tab', { name: '家族政商關係', exact: true })
      .click();

    const graph = profile.getByTestId('political-family-graph');
    const longLabel = graph.getByTestId(
      'family-relationship-family-relation-37bf4372028f',
    );
    await expect(longLabel).toBeVisible();
    await expect(longLabel).toContainText(
      '外祖父（報導並用「祖父」與「外孫女」兩種稱謂）',
    );
    await expect(longLabel).toHaveAttribute('data-label-lines', /^[2-9]\d*$/);

    const geometry = await graph.evaluate((element) => {
      const canvas = element.querySelector('.political-family-canvas');
      const svg = element.querySelector('.political-family-svg');
      const pageWrap = document.querySelector('.page-wrap');
      if (!canvas || !svg || !pageWrap)
        throw new Error('family graph canvas is missing');
      const labels = [
        ...element.querySelectorAll<HTMLElement>(
          '[data-family-edge-label="true"]',
        ),
      ];
      const nodes = [
        ...element.querySelectorAll<HTMLElement>('[data-family-node="true"]'),
      ];
      const rect = (value: Element) => {
        const box = value.getBoundingClientRect();
        return {
          left: box.left,
          top: box.top,
          right: box.right,
          bottom: box.bottom,
        };
      };
      const overlaps = (
        first: ReturnType<typeof rect>,
        second: ReturnType<typeof rect>,
      ) =>
        first.left < second.right &&
        first.right > second.left &&
        first.top < second.bottom &&
        first.bottom > second.top;
      const canvasRect = rect(canvas);
      const svgRect = rect(svg);
      const labelRects = labels.map(rect);
      const nodeRects = nodes.map(rect);
      return {
        labelCount: labels.length,
        allTextFits: labels.every(
          (label) =>
            label.scrollWidth <= label.clientWidth + 1 &&
            label.scrollHeight <= label.clientHeight + 1,
        ),
        labelsInsideCanvas: labelRects.every(
          (label) =>
            label.left >= canvasRect.left - 1 &&
            label.right <= canvasRect.right + 1 &&
            label.top >= canvasRect.top - 1 &&
            label.bottom <= canvasRect.bottom + 1,
        ),
        labelsInsideSvg: labelRects.every(
          (label) =>
            label.left >= svgRect.left - 1 &&
            label.right <= svgRect.right + 1 &&
            label.top >= svgRect.top - 1 &&
            label.bottom <= svgRect.bottom + 1,
        ),
        labelNodeOverlapCount: labelRects.reduce(
          (count, label) =>
            count + nodeRects.filter((node) => overlaps(label, node)).length,
          0,
        ),
        labelLabelOverlapCount: labelRects.reduce(
          (count, label, index) =>
            count +
            labelRects
              .slice(index + 1)
              .filter((other) => overlaps(label, other)).length,
          0,
        ),
        canvasWidth: canvasRect.right - canvasRect.left,
        pageWrapWidth: pageWrap.getBoundingClientRect().width,
      };
    });
    expect(geometry.canvasWidth).toBeGreaterThan(0);
    expect(geometry.canvasWidth).toBeLessThanOrEqual(width + 2);
    expect(
      Math.abs(geometry.canvasWidth - geometry.pageWrapWidth),
    ).toBeLessThanOrEqual(2);
    expect(geometry.labelCount).toBeGreaterThan(0);
    expect(geometry.allTextFits).toBe(true);
    expect(geometry.labelsInsideCanvas).toBe(true);
    expect(geometry.labelsInsideSvg).toBe(true);
    expect(geometry.labelNodeOverlapCount).toBe(0);
    expect(geometry.labelLabelOverlapCount).toBe(0);

    await graph.scrollIntoViewIfNeeded();
    const svgBox = await graph.locator('.political-family-svg').boundingBox();
    if (!svgBox) throw new Error('family graph svg is missing');
    await page.mouse.move(svgBox.x + 4, svgBox.y + 4);
    await page.mouse.down();
    await page.mouse.move(
      svgBox.x + Math.min(svgBox.width - 4, 32),
      svgBox.y + Math.min(svgBox.height - 4, 32),
      { steps: 4 },
    );
    await page.mouse.up();

    const afterPan = await graph.evaluate((element) => {
      const canvas = element.querySelector('.political-family-canvas');
      const svg = element.querySelector('.political-family-svg');
      if (!canvas || !svg) throw new Error('family graph canvas is missing');
      const labels = [
        ...element.querySelectorAll<HTMLElement>(
          '[data-family-edge-label="true"]',
        ),
      ];
      const nodes = [
        ...element.querySelectorAll<HTMLElement>('[data-family-node="true"]'),
      ];
      const rect = (value: Element) => value.getBoundingClientRect();
      const overlaps = (first: DOMRect, second: DOMRect) =>
        first.left < second.right &&
        first.right > second.left &&
        first.top < second.bottom &&
        first.bottom > second.top;
      const canvasRect = rect(canvas);
      const svgRect = rect(svg);
      return {
        allTextFits: labels.every(
          (label) =>
            label.scrollWidth <= label.clientWidth + 1 &&
            label.scrollHeight <= label.clientHeight + 1,
        ),
        labelsInsideCanvas: labels.every((label) => {
          const box = rect(label);
          return (
            box.left >= canvasRect.left - 1 &&
            box.right <= canvasRect.right + 1 &&
            box.top >= canvasRect.top - 1 &&
            box.bottom <= canvasRect.bottom + 1
          );
        }),
        labelsInsideSvg: labels.every((label) => {
          const box = rect(label);
          return (
            box.left >= svgRect.left - 1 &&
            box.right <= svgRect.right + 1 &&
            box.top >= svgRect.top - 1 &&
            box.bottom <= svgRect.bottom + 1
          );
        }),
        labelNodeOverlapCount: labels.reduce(
          (count, label) =>
            count +
            nodes.filter((node) => overlaps(rect(label), rect(node))).length,
          0,
        ),
      };
    });
    expect(afterPan.allTextFits).toBe(true);
    expect(afterPan.labelsInsideCanvas).toBe(true);
    expect(afterPan.labelsInsideSvg).toBe(true);
    expect(afterPan.labelNodeOverlapCount).toBe(0);

    await graph.screenshot({
      path: `.cache/reports/family-graph-mobile-${width}.png`,
    });
  });
}

test('mobile roster keeps every constituency reachable and opens an off-screen profile', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto('/?admin=E03');
  const explorer = page.getByTestId('city-explorer');
  await expect(explorer).toHaveAttribute('data-hydrated', 'true');
  await page.locator('[aria-controls="city-people-tray"]').click();

  const sheet = page.locator('#city-people-tray');
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('.candidate-sheet__group')).toHaveCount(
    rosterGroupCount,
  );
  await expect(sheet.locator('.candidate-sheet__card')).toHaveCount(
    rosterTotal,
  );

  const otherGroup = sheet.locator(
    '[data-constituency-id="district-kaohsiung-council-01"]',
  );
  await expect(otherGroup).toHaveCount(1);
  const otherCandidate = otherGroup.locator('.candidate-sheet__card').first();
  await otherCandidate.scrollIntoViewIfNeeded();
  const name = (await otherCandidate.locator('strong').textContent())?.trim();
  expect(name).toBeTruthy();
  await otherCandidate.click();

  const profile = page.locator('.profile-panel.is-open');
  await expect(profile).toBeVisible({ timeout: 20_000 });
  await expect(profile.locator('h2')).toHaveText(name ?? '');
  await expect(page).toHaveURL(/candidate=/);
  await expect(page).not.toHaveURL(/admin=/);
  await expect(page.getByTestId('scene-frame').locator('canvas')).toBeVisible();

  await profile.locator('[aria-label="關閉人物資料"]').click();
  await expect(profile).toHaveCount(0);
  const card = page.locator('.city-admin-card');
  await expect(card).toBeVisible();
  await expect(
    card.getByRole('heading', { name: '左營區', level: 2 }),
  ).toBeVisible();
  await expect(card).toHaveAttribute('data-expanded', 'false');
  await expect(page).toHaveURL(/admin=E03/);
  await expect(page.locator('.candidate-sheet__handle')).toBeVisible();
});
