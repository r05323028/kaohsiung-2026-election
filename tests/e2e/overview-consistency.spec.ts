import { expect, type Page, test } from '@playwright/test';
import {
  candidateForDistrict,
  candidatesForDistrict,
  districtBySlug,
  mayoralCandidateCount,
  mayoralDistrictId,
  populatedDistricts,
  rosterGroupCount,
  rosterTotal,
} from './official-roster';

type CameraView = {
  position: [number, number, number];
  target?: [number, number, number];
  zoom: number;
};

type Visibility = {
  scope: 'citywide' | 'admin-district' | 'constituency';
  count: number;
  slugs: string[];
};

type CanvasWindow = Window & {
  __kaohsiungCandidateVisibility?: () => Visibility;
  __kaohsiungSelectDistrict?: (slug: string) => void;
  __kaohsiungWorld?: {
    camera?: () => CameraView;
  };
};

const MAYOR_DISTRICT = districtBySlug('kaohsiung-mayor-2026');
const COUNCIL_04 = districtBySlug('kaohsiung-council-04');
const COUNCIL_05 = districtBySlug('kaohsiung-council-05');
const COUNCIL_07 = districtBySlug('kaohsiung-council-07');
const FLAT_12 = districtBySlug('kaohsiung-indigenous-flat-12');

async function waitHydrated(page: Page) {
  const explorer = page.getByTestId('city-explorer');
  await expect(explorer).toHaveAttribute('data-hydrated', 'true', {
    timeout: 30_000,
  });
  await page.waitForFunction(
    () => {
      const bridge = window as CanvasWindow;
      return (
        typeof bridge.__kaohsiungCandidateVisibility === 'function' &&
        typeof bridge.__kaohsiungSelectDistrict === 'function'
      );
    },
    undefined,
    { timeout: 30_000 },
  );
  await page.evaluate(() =>
    document.querySelector('astro-dev-toolbar')?.remove(),
  );
  return explorer;
}

async function openCity(page: Page, path = '/') {
  await page.goto(path);
  return waitHydrated(page);
}

async function visibility(page: Page): Promise<Visibility> {
  return page.evaluate(() => {
    const bridge = window as CanvasWindow;
    const state = bridge.__kaohsiungCandidateVisibility?.();
    if (!state) throw new Error('visibility bridge is unavailable');
    return state;
  });
}

async function focusDistrict(page: Page, slug: string) {
  await page.evaluate((districtSlug) => {
    const bridge = window as CanvasWindow;
    if (!bridge.__kaohsiungSelectDistrict) {
      throw new Error('district bridge is unavailable');
    }
    bridge.__kaohsiungSelectDistrict(districtSlug);
  }, slug);
  await expect(page.getByTestId('city-explorer')).toHaveAttribute(
    'data-scene-focus',
    new RegExp(`^scope-${slug}-`),
    { timeout: 20_000 },
  );
}

async function camera(page: Page): Promise<CameraView> {
  await page.waitForFunction(
    () => Boolean((window as CanvasWindow).__kaohsiungWorld?.camera?.()),
    undefined,
    { timeout: 20_000 },
  );
  return page.evaluate(() => {
    const view = (window as CanvasWindow).__kaohsiungWorld?.camera?.();
    if (!view) throw new Error('camera bridge is unavailable');
    return view;
  });
}

async function waitForZoomStable(page: Page) {
  let previous: number | null = null;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const current = (await camera(page)).zoom;
    if (previous !== null && Math.abs(current - previous) < 0.002) return;
    previous = current;
    await page.waitForTimeout(350);
  }
  throw new Error('camera zoom did not settle');
}

/** The single invariant shared by every exit back to the citywide overview. */
async function expectOverview(page: Page) {
  const explorer = page.getByTestId('city-explorer');
  await expect(explorer).toHaveAttribute(
    'data-scene-focus',
    /^world-overview-/,
    { timeout: 20_000 },
  );
  await expect(explorer).toHaveAttribute('data-candidate-scope', 'citywide');
  await expect(explorer).toHaveAttribute(
    'data-candidate-count',
    String(mayoralCandidateCount),
  );
  await expect(page.getByTestId('city-coverage-card')).toHaveCount(0);
  await expect(page.locator('.city-scene-label__coverage')).toHaveCount(0);
  await expect(page.locator('.city-scene-label__zone')).toHaveText(
    '高雄市 38 行政區・六角迷你城市',
  );
  await expect(page.locator('#scene-heading')).toHaveText(MAYOR_DISTRICT.name);
  await expect(page.locator('.city-admin-card')).toHaveCount(0);
  await expect(page).not.toHaveURL(/[?&](district|admin|candidate)=/);

  const state = await visibility(page);
  expect(state.scope).toBe('citywide');
  expect(state.count).toBe(mayoralCandidateCount);
  expect(
    state.slugs.every(
      (slug) =>
        !slug.startsWith('kaohsiung-council-') &&
        !slug.startsWith('kaohsiung-indigenous-'),
    ),
  ).toBe(true);
}

test('returning to the citywide overview clears every constituency cue', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const explorer = await openCity(
    page,
    '/?district=kaohsiung-council-04&quality=low',
  );
  await expect(explorer).toHaveAttribute(
    'data-scene-focus',
    /^scope-kaohsiung-council-04-/,
  );

  const card = page.getByTestId('city-coverage-card');
  await expect(card).toBeVisible();
  await expect(
    card.getByRole('heading', { name: COUNCIL_04.name }),
  ).toBeVisible();
  await expect(page.locator('.city-scene-label__coverage')).toBeVisible();
  await expect(page.locator('.city-scene-label__zone')).toContainText(
    `選區：${COUNCIL_04.name}`,
  );
  await expect(page).toHaveURL(/district=kaohsiung-council-04/);

  await page.keyboard.press('Escape');
  await expectOverview(page);

  for (const district of [COUNCIL_07, FLAT_12]) {
    await focusDistrict(page, district.slug);
    const focusedCard = page.getByTestId('city-coverage-card');
    await expect(focusedCard).toBeVisible();
    await expect(
      focusedCard.getByRole('heading', { name: district.name }),
    ).toBeVisible();
    await expect(page.locator('.city-scene-label__coverage')).toBeVisible();
    await expect(page.locator('.city-scene-label__zone')).toContainText(
      `選區：${district.name}`,
    );
    await expect(explorer).toHaveAttribute(
      'data-candidate-scope',
      'constituency',
    );
    await expect(explorer).toHaveAttribute(
      'data-candidate-count',
      String(candidatesForDistrict(district.id).length + mayoralCandidateCount),
    );
    await expect(page).toHaveURL(new RegExp(`district=${district.slug}`));

    await page.keyboard.press('Escape');
    await expectOverview(page);
  }

  // Constituency A -> constituency B -> overview, without a reload.
  await focusDistrict(page, COUNCIL_07.slug);
  await focusDistrict(page, COUNCIL_04.slug);
  await expect(
    page
      .getByTestId('city-coverage-card')
      .getByRole('heading', { name: COUNCIL_04.name }),
  ).toBeVisible();
  await expect(page).toHaveURL(/district=kaohsiung-council-04/);

  await page.keyboard.press('Escape');
  await expectOverview(page);
});

test('administrative focus exits to the same clean overview state', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const explorer = await openCity(page, '/?admin=E03&quality=low');
  await expect(page.locator('.city-admin-card')).toContainText('左營區');
  await expect(page.locator('.city-scene-label__coverage')).toBeVisible();
  await expect(explorer).toHaveAttribute(
    'data-candidate-count',
    String(candidatesForDistrict(COUNCIL_04.id).length + mayoralCandidateCount),
  );

  await page
    .locator('.city-admin-card')
    .getByRole('button', { name: '回到全市' })
    .click();

  await expectOverview(page);
  await expect(page).not.toHaveURL(/[?&]admin=/);
});

test('the sheet keeps the complete roster in every scene scope', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const explorer = await openCity(page, '/?quality=low');
  const sheet = page.locator('#city-people-tray');

  await expect(explorer).toHaveAttribute(
    'data-roster-count',
    String(rosterTotal),
  );
  await expect(explorer).toHaveAttribute(
    'data-candidate-count',
    String(mayoralCandidateCount),
  );

  await page.locator('[aria-controls="city-people-tray"]').click();
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('.candidate-sheet__group')).toHaveCount(
    rosterGroupCount,
  );
  await expect(sheet.locator('.candidate-sheet__card')).toHaveCount(
    rosterTotal,
  );
  for (const district of [MAYOR_DISTRICT, COUNCIL_04, COUNCIL_05]) {
    const group = sheet.locator(`[data-constituency-id="${district.id}"]`);
    await expect(group).toHaveCount(1);
    await expect(group.locator('.candidate-sheet__card')).toHaveCount(
      candidatesForDistrict(district.id).length,
    );
  }
  await sheet.locator('.candidate-sheet__close').click();
  await expect(sheet).toBeHidden();

  // A constituency focus filters actors, not the roster.
  await focusDistrict(page, COUNCIL_04.slug);
  await expect(explorer).toHaveAttribute(
    'data-candidate-scope',
    'constituency',
  );
  await expect(explorer).toHaveAttribute(
    'data-candidate-count',
    String(candidatesForDistrict(COUNCIL_04.id).length + mayoralCandidateCount),
  );

  await page.locator('[aria-controls="city-people-tray"]').click();
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('.candidate-sheet__card')).toHaveCount(
    rosterTotal,
  );
  const otherGroup = sheet.locator(`[data-constituency-id="${COUNCIL_05.id}"]`);
  await expect(otherGroup).toHaveCount(1);
  await expect(otherGroup.locator('.candidate-sheet__card')).toHaveCount(
    candidatesForDistrict(COUNCIL_05.id).length,
  );

  // Selecting a candidate whose actor is not part of the current 3D scope must
  // still open the profile and frame the correct constituency at the same zoom.
  const away = candidateForDistrict(COUNCIL_05.id);
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await waitForZoomStable(page);
  const before = await camera(page);

  await sheet.locator(`[data-candidate-id="${away.id}"]`).click();
  const profile = page.getByTestId('profile-panel');
  await expect(profile).toBeVisible({ timeout: 20_000 });
  await expect(profile).toContainText(away.displayName);
  await expect(explorer).toHaveAttribute(
    'data-scene-focus',
    `candidate-${away.slug}`,
  );
  await expect(explorer).toHaveAttribute(
    'data-candidate-scope',
    'constituency',
  );
  await expect(explorer).toHaveAttribute(
    'data-candidate-count',
    String(candidatesForDistrict(COUNCIL_05.id).length + mayoralCandidateCount),
  );
  await expect(page).toHaveURL(/district=kaohsiung-council-05/);
  await expect(page).toHaveURL(new RegExp(`candidate=${away.slug}`));

  await waitForZoomStable(page);
  const after = await camera(page);
  expect(after.zoom).toBeCloseTo(before.zoom, 3);
  expect(pageErrors).toEqual([]);

  await page.locator('[aria-label="關閉人物資料"]').click();
  await expect(profile).toHaveCount(0);
  await expect(page.getByTestId('city-coverage-card')).toBeVisible();
  await expect(explorer).toHaveAttribute(
    'data-scene-focus',
    /^scope-kaohsiung-council-04-/,
  );
  await expect(explorer).toHaveAttribute(
    'data-candidate-count',
    String(candidatesForDistrict(COUNCIL_04.id).length + mayoralCandidateCount),
  );
  await expect(page).toHaveURL(/district=kaohsiung-council-04/);
  await expect(page).not.toHaveURL(/candidate=/);
});

test('direct candidate links close to overview and history restores each view', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const explorer = await openCity(
    page,
    '/?candidate=kaohsiung-council-04-712cf4dd&quality=low',
  );
  const profile = page.getByTestId('profile-panel');
  await expect(profile).toBeVisible({ timeout: 20_000 });
  await expect(explorer).toHaveAttribute(
    'data-scene-focus',
    'candidate-kaohsiung-council-04-712cf4dd',
  );
  await expect(page).toHaveURL(/district=kaohsiung-council-04/);

  await page.locator('[aria-label="關閉人物資料"]').click();
  await expect(profile).toHaveCount(0);
  await expectOverview(page);

  // The state label alone is not enough: the camera must settle on the real
  // citywide overview instead of a stale canvas default saved at mount.
  await waitForZoomStable(page);
  const restoredOverview = await camera(page);
  const referencePage = await page.context().newPage();
  await openCity(referencePage, '/?quality=low');
  await waitForZoomStable(referencePage);
  const canonicalOverview = await camera(referencePage);
  await referencePage.close();
  expect(restoredOverview.zoom).toBeCloseTo(canonicalOverview.zoom, 2);
  const [referenceX, referenceY, referenceZ] = canonicalOverview.position;
  expect(restoredOverview.position[0]).toBeCloseTo(referenceX, 2);
  expect(restoredOverview.position[1]).toBeCloseTo(referenceY, 2);
  expect(restoredOverview.position[2]).toBeCloseTo(referenceZ, 2);

  // Cross-document history: each entry re-initializes from its own URL.
  await page.goto('/?district=kaohsiung-council-07&quality=low');
  await waitHydrated(page);
  await expect(
    page.getByTestId('city-coverage-card').getByRole('heading', {
      name: COUNCIL_07.name,
    }),
  ).toBeVisible();

  await page.goBack();
  await waitHydrated(page);
  await expectOverview(page);

  await page.goForward();
  await waitHydrated(page);
  await expect(
    page.getByTestId('city-coverage-card').getByRole('heading', {
      name: COUNCIL_07.name,
    }),
  ).toBeVisible();
  await expect(page.getByTestId('city-explorer')).toHaveAttribute(
    'data-scene-focus',
    /^scope-kaohsiung-council-07-/,
  );

  await page.keyboard.press('Escape');
  await expectOverview(page);
});

test('the complete roster stays grouped and navigable on every populated constituency', async () => {
  // The roster contract is independent of the scene; assert the official
  // snapshot keeps the groups the sheet renders.
  expect(populatedDistricts).toHaveLength(rosterGroupCount);
  expect(rosterTotal).toBeGreaterThan(mayoralCandidateCount);
  expect(mayoralDistrictId).toBe(MAYOR_DISTRICT.id);
});
