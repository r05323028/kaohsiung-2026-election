import { expect, type Page, test } from '@playwright/test';

type Visibility = {
  scope: 'citywide' | 'admin-district' | 'constituency';
  count: number;
  slugs: string[];
};

type ActorPose = {
  x: number;
  z: number;
  heading: number;
  walkPhase: number;
  walking: boolean;
};

type WorldWindow = Window & {
  __kaohsiungCandidateVisibility?: () => Visibility;
  __kaohsiungActorInstance?: (index: number) => string | null;
  __kaohsiungActorScreenPosition?: (
    slug: string,
  ) => { x: number; y: number } | null;
  __kaohsiungActorPose?: (slug: string) => ActorPose | null;
  __kaohsiungSelectDistrict?: (slug: string) => void;
  __kaohsiungActorMarker?: () => { uuid: string; count: number } | null;
  __kaohsiungActorLod?: () => {
    detailCount: number;
    overviewCount: number;
  };
  __kaohsiungWorld?: {
    actors: () => {
      slug: string;
      displayName?: string;
      role: 'mayor' | 'council' | 'indigenous' | 'demo';
      allowedAdminIds: string[];
      currentAdminId: string | null;
      state: 'walking' | 'idle';
      walkPhase: number;
      position: { x: number; z: number };
    }[];
    stats: () => { elapsedSeconds: number };
  };
};

async function openFocus(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByTestId('city-explorer')).toHaveAttribute(
    'data-hydrated',
    'true',
    { timeout: 30_000 },
  );
  await page.waitForFunction(
    () =>
      typeof (window as WorldWindow).__kaohsiungCandidateVisibility ===
      'function',
    undefined,
    { timeout: 30_000 },
  );
  await page.waitForTimeout(1800);
}

async function visibility(page: Page): Promise<Visibility> {
  return page.evaluate(() => {
    const value = (window as WorldWindow).__kaohsiungCandidateVisibility?.();
    if (!value) throw new Error('visibility bridge is unavailable');
    return value;
  });
}

async function actorScreenPosition(
  page: Page,
  slug: string,
): Promise<{ x: number; y: number } | null> {
  return page.evaluate(async (actorSlug) => {
    const bridge = window as WorldWindow;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (typeof bridge.__kaohsiungActorScreenPosition === 'function') {
        return bridge.__kaohsiungActorScreenPosition(actorSlug);
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('actor screen bridge is unavailable');
  }, slug);
}

async function focusAdmin(page: Page, name: string) {
  // District labels only render in the city overview, so return to the world
  // before focusing another district from the map.
  const backToCity = page.getByRole('button', { name: '回到全市' });
  if (await backToCity.isVisible()) {
    await backToCity.click();
    await expect(page.locator('.city-admin-card')).toBeHidden();
    // The camera eases back to the overview, so wait for district labels to
    // settle before measuring their click target.
    await page.waitForTimeout(1600);
  }
  const label = page.locator('.hex-district-label', { hasText: name }).first();
  await expect(label).toBeVisible();
  const box = await label.boundingBox();
  if (!box) throw new Error(`${name} district label is not visible`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('.city-admin-card')).toBeVisible();
}

test.describe('district-focused candidate visibility', () => {
  test('transitions from the mayor-only overview to district focus and back', {
    tag: '@critical',
  }, async ({ page }) => {
    test.setTimeout(120_000);
    await openFocus(page, '/');

    const explorer = page.getByTestId('city-explorer');
    await expect(explorer).toHaveAttribute('data-candidate-scope', 'citywide');
    await expect(explorer).toHaveAttribute('data-candidate-count', '5');

    const overview = await visibility(page);
    expect(overview.scope).toBe('citywide');
    expect(overview.count).toBe(5);
    expect(
      overview.slugs.every(
        (slug) =>
          !slug.startsWith('kaohsiung-council-') &&
          !slug.startsWith('kaohsiung-indigenous-'),
      ),
    ).toBe(true);

    const hidden = await page.evaluate(() => {
      const actor = (window as WorldWindow).__kaohsiungWorld
        ?.actors()
        .find((candidate) => candidate.role !== 'mayor');
      return actor
        ? {
            slug: actor.slug,
            screen: (window as WorldWindow).__kaohsiungActorScreenPosition?.(
              actor.slug,
            ),
          }
        : null;
    });
    expect(hidden?.slug).toBeTruthy();
    expect(hidden?.screen).toBeNull();

    await focusAdmin(page, '左營');
    await expect(explorer).toHaveAttribute('data-scene-focus', /^admin-E03-/, {
      timeout: 20_000,
    });
    await expect(explorer).toHaveAttribute(
      'data-candidate-scope',
      'admin-district',
    );
    await expect(explorer).toHaveAttribute('data-candidate-count', '17');

    await page
      .locator('.city-admin-card .city-landmark-card__actions button')
      .filter({ hasText: '回到全市' })
      .click();
    await expect(explorer).toHaveAttribute(
      'data-scene-focus',
      /^world-overview-/,
      { timeout: 20_000 },
    );
    await expect(explorer).toHaveAttribute('data-candidate-scope', 'citywide');
    await expect(explorer).toHaveAttribute('data-candidate-count', '5');

    const restored = await visibility(page);
    expect(restored.scope).toBe('citywide');
    expect(restored.count).toBe(5);
    expect(
      restored.slugs.every(
        (slug) =>
          !slug.startsWith('kaohsiung-council-') &&
          !slug.startsWith('kaohsiung-indigenous-'),
      ),
    ).toBe(true);
  });

  test('uses official electoral scope across district focus and restores the full city', {
    tag: '@critical',
  }, async ({ page }) => {
    test.setTimeout(180_000);
    await openFocus(page, '/?admin=E03');

    const explorer = page.getByTestId('city-explorer');
    await expect(explorer).toHaveAttribute(
      'data-candidate-scope',
      'admin-district',
    );
    await expect(explorer).toHaveAttribute('data-candidate-count', '17');

    const zuoying = await visibility(page);
    expect(zuoying.scope).toBe('admin-district');
    expect(zuoying.count).toBe(17);
    const zuoyingSlugs = new Set(zuoying.slugs);
    expect(
      [...zuoyingSlugs].some((slug) =>
        slug.startsWith('kaohsiung-council-04-'),
      ),
    ).toBe(true);
    expect([...zuoyingSlugs].some((slug) => slug === 'zhang-jing-2026')).toBe(
      true,
    );
    expect(
      [...zuoyingSlugs].some((slug) =>
        slug.startsWith('kaohsiung-council-01-'),
      ),
    ).toBe(false);
    expect(
      [...zuoyingSlugs].some((slug) =>
        slug.startsWith('kaohsiung-council-05-'),
      ),
    ).toBe(false);
    expect(await page.locator('.city-admin-card').innerText()).toContain(
      '左營區',
    );
    const marker = await page.evaluate(() =>
      (window as WorldWindow).__kaohsiungActorMarker?.(),
    );
    expect(marker?.count).toBe(17);
    const lod = await page.evaluate(() =>
      (window as WorldWindow).__kaohsiungActorLod?.(),
    );
    expect((lod?.detailCount ?? 0) + (lod?.overviewCount ?? 0)).toBe(17);

    const statsBefore = await page.evaluate(() =>
      (window as WorldWindow).__kaohsiungWorld?.stats(),
    );

    await focusAdmin(page, '楠梓');
    await expect(explorer).toHaveAttribute('data-scene-focus', /^admin-E04-/, {
      timeout: 20_000,
    });
    await page.waitForTimeout(800);
    const nanzih = await visibility(page);
    expect(nanzih.count).toBe(17);
    expect(nanzih.slugs).toContain('kaohsiung-council-04-712cf4dd');
    expect(
      nanzih.slugs.some((slug) => slug.startsWith('kaohsiung-council-07-')),
    ).toBe(false);

    await focusAdmin(page, '三民');
    await expect(explorer).toHaveAttribute('data-scene-focus', /^admin-E05-/, {
      timeout: 20_000,
    });
    await page.waitForTimeout(800);
    const sanmin = await visibility(page);
    expect(sanmin.scope).toBe('admin-district');
    expect(sanmin.count).toBe(17);
    expect(
      sanmin.slugs.some((slug) => slug.startsWith('kaohsiung-council-07-')),
    ).toBe(true);
    expect(
      sanmin.slugs.some((slug) => slug.startsWith('kaohsiung-council-04-')),
    ).toBe(false);
    expect(sanmin.slugs).toContain('lai-rui-long-2026');

    await page
      .locator('.city-admin-card .city-landmark-card__actions button')
      .filter({ hasText: '回到全市' })
      .click();
    await expect(explorer).toHaveAttribute(
      'data-scene-focus',
      /^world-overview-/,
      {
        timeout: 20_000,
      },
    );
    await expect(explorer).toHaveAttribute('data-candidate-scope', 'citywide');
    await expect(explorer).toHaveAttribute('data-candidate-count', '5');
    await page.waitForTimeout(800);

    const fullCity = await visibility(page);
    expect(fullCity.count).toBe(5);
    expect(
      fullCity.slugs.every(
        (slug) =>
          !slug.startsWith('kaohsiung-council-') &&
          !slug.startsWith('kaohsiung-indigenous-'),
      ),
    ).toBe(true);
    const restoredMarker = await page.evaluate(() =>
      (window as WorldWindow).__kaohsiungActorMarker?.(),
    );
    expect(restoredMarker?.count).toBe(5);
    const statsAfter = await page.evaluate(() =>
      (window as WorldWindow).__kaohsiungWorld?.stats(),
    );
    expect(statsAfter?.elapsedSeconds).toBeGreaterThanOrEqual(
      statsBefore?.elapsedSeconds ?? 0,
    );
  });

  test('keeps mayors walking citywide across district focus changes', {
    tag: '@critical',
  }, async ({ page }) => {
    test.setTimeout(180_000);
    await openFocus(page, '/?admin=E03');

    const readMayors = () =>
      page.evaluate(() => {
        const bridge = window as WorldWindow;
        const visible = bridge.__kaohsiungCandidateVisibility?.();
        return (bridge.__kaohsiungWorld?.actors() ?? [])
          .filter((actor) => actor.role === 'mayor')
          .map((actor) => ({
            ...actor,
            visible: visible?.slugs.includes(actor.slug) ?? false,
          }));
      });

    const before = await readMayors();
    expect(before.length).toBeGreaterThan(0);
    for (const mayor of before) {
      expect(mayor.allowedAdminIds).toHaveLength(38);
      expect(mayor.visible).toBe(true);
    }
    const roamingMayor = before.find(
      (mayor) => mayor.state === 'walking' && mayor.currentAdminId !== 'E03',
    );
    expect(roamingMayor).toBeTruthy();

    for (const district of ['楠梓', '三民']) {
      await focusAdmin(page, district);
      await page.waitForTimeout(900);
      const after = await readMayors();
      expect(after).toHaveLength(before.length);
      for (const mayor of after) {
        const previous = before.find((item) => item.slug === mayor.slug);
        expect(previous).toBeTruthy();
        expect(mayor.allowedAdminIds).toEqual(previous!.allowedAdminIds);
        expect(mayor.visible).toBe(true);
        expect(mayor.walkPhase).toBeGreaterThanOrEqual(
          previous!.walkPhase - 1e-6,
        );
        expect(
          Math.hypot(
            mayor.position.x - previous!.position.x,
            mayor.position.z - previous!.position.z,
          ),
        ).toBeLessThan(4);
      }
      const moved = after.find((mayor) => mayor.slug === roamingMayor!.slug)!;
      expect(
        Math.hypot(
          moved.position.x - roamingMayor!.position.x,
          moved.position.z - roamingMayor!.position.z,
        ),
      ).toBeGreaterThan(0);
      expect(moved.walkPhase).toBeGreaterThan(roamingMayor!.walkPhase);
    }

    await page
      .locator('.city-admin-card .city-landmark-card__actions button')
      .filter({ hasText: '回到全市' })
      .click();
    await expect(page.getByTestId('city-explorer')).toHaveAttribute(
      'data-candidate-scope',
      'citywide',
      { timeout: 20_000 },
    );
    await expect(page.getByTestId('city-explorer')).toHaveAttribute(
      'data-candidate-count',
      '5',
    );
  });

  test('picks only rendered candidates and keeps hidden actors unpickable', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openFocus(page, '/?admin=E03');

    const mapping = await page.evaluate(() => {
      const visible = (
        window as WorldWindow
      ).__kaohsiungCandidateVisibility?.();
      if (!visible) throw new Error('visibility bridge is unavailable');
      const indexed = visible.slugs.map((slug, index) => ({
        slug,
        indexSlug: (window as WorldWindow).__kaohsiungActorInstance?.(index),
        screen: (window as WorldWindow).__kaohsiungActorScreenPosition?.(slug),
      }));
      const hidden =
        (window as WorldWindow).__kaohsiungWorld
          ?.actors()
          .find(
            (actor) =>
              actor.slug.startsWith('kaohsiung-council-05-') &&
              !visible.slugs.includes(actor.slug),
          ) ?? null;
      return {
        indexed,
        hiddenSlug: hidden?.slug ?? null,
        hiddenScreen: hidden
          ? ((window as WorldWindow).__kaohsiungActorScreenPosition?.(
              hidden.slug,
            ) ?? null)
          : null,
        hiddenPresent: hidden !== null,
      };
    });
    expect(
      mapping.indexed.every((entry) => entry.indexSlug === entry.slug),
    ).toBe(true);
    expect(mapping.hiddenPresent).toBe(true);
    expect(mapping.hiddenSlug).toBeTruthy();
    expect(mapping.hiddenScreen).toBeNull();

    const pick = mapping.indexed
      .filter(
        (entry) =>
          entry.slug.startsWith('kaohsiung-council-04-') &&
          entry.screen &&
          entry.screen.x > 430 &&
          entry.screen.x < 1280 &&
          entry.screen.y > 180 &&
          entry.screen.y < 700,
      )
      .sort((left, right) => {
        const score = (entry: typeof left) =>
          Math.min(
            (entry.screen?.x ?? 0) - 430,
            1280 - (entry.screen?.x ?? 0),
            (entry.screen?.y ?? 0) - 180,
            700 - (entry.screen?.y ?? 0),
          );
        return score(right) - score(left);
      })[0];
    expect(pick).toBeTruthy();
    if (!pick?.screen) throw new Error('no on-screen council candidate');

    const name = await page.evaluate(
      (slug) =>
        (window as WorldWindow).__kaohsiungWorld
          ?.actors()
          .find((actor) => actor.slug === slug)?.displayName ?? '',
      pick.slug,
    );
    expect(name.length).toBeGreaterThan(0);

    await page.mouse.click(pick.screen.x, pick.screen.y);
    await page.waitForTimeout(500);
    await expect(page.getByTestId('profile-panel')).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByTestId('profile-panel')).toContainText(name);
    await expect(page.getByTestId('city-explorer')).toHaveAttribute(
      'data-candidate-scope',
      'constituency',
    );
    await expect(page.getByTestId('city-explorer')).toHaveAttribute(
      'data-candidate-count',
      '17',
    );
    const selected = await visibility(page);
    expect(selected.count).toBe(17);
    expect(selected.slugs).toContain(pick.slug);
    expect(
      selected.slugs.some((slug) => slug.startsWith('kaohsiung-council-05-')),
    ).toBe(false);

    await page.locator('[aria-label="關閉人物資料"]').click();
    await expect(page.getByTestId('profile-panel')).toHaveCount(0);
    await expect(page.getByTestId('city-explorer')).toHaveAttribute(
      'data-scene-focus',
      /^admin-E03-/,
      { timeout: 20_000 },
    );
    await expect(page.getByTestId('city-explorer')).toHaveAttribute(
      'data-candidate-scope',
      'admin-district',
    );
    await expect(page.getByTestId('city-explorer')).toHaveAttribute(
      'data-candidate-count',
      '17',
    );
    expect(
      await actorScreenPosition(page, mapping.hiddenSlug ?? ''),
    ).toBeNull();
  });

  test('switches constituencies rapidly without leaking candidates or selection', {
    tag: '@critical',
  }, async ({ page }) => {
    test.setTimeout(120_000);
    await openFocus(page, '/');
    const explorer = page.getByTestId('city-explorer');

    const focusDistrict = (slug: string) =>
      page.evaluate(
        (next: string) =>
          (window as WorldWindow).__kaohsiungSelectDistrict?.(next),
        slug,
      );

    const expectScope = async (scope: Visibility['scope'], count: number) => {
      await expect(explorer).toHaveAttribute('data-candidate-scope', scope);
      await expect(explorer).toHaveAttribute(
        'data-candidate-count',
        String(count),
      );
      const snapshot = await visibility(page);
      expect(snapshot.scope).toBe(scope);
      expect(snapshot.count).toBe(count);
      const rendered = await page.evaluate(() => {
        const bridge = window as WorldWindow;
        const value = bridge.__kaohsiungCandidateVisibility?.();
        return {
          markerCount: bridge.__kaohsiungActorMarker?.()?.count ?? -1,
          indexed: (value?.slugs ?? []).map((slug, index) => ({
            slug,
            indexSlug: bridge.__kaohsiungActorInstance?.(index),
          })),
        };
      });
      expect(rendered.markerCount).toBe(count);
      expect(
        rendered.indexed.every((entry) => entry.slug === entry.indexSlug),
      ).toBe(true);
      return snapshot;
    };

    await expectScope('citywide', 5);
    const parked = await page.evaluate(() => {
      const bridge = window as WorldWindow;
      const council = (bridge.__kaohsiungWorld?.actors() ?? []).find(
        (actor) => actor.role === 'council',
      );
      return {
        slug: council?.slug ?? null,
        screen: council
          ? (bridge.__kaohsiungActorScreenPosition?.(council.slug) ?? null)
          : null,
      };
    });
    expect(parked.slug).toBeTruthy();
    expect(parked.screen).toBeNull();

    await focusDistrict('kaohsiung-council-04');
    await page.waitForTimeout(80);
    const c04 = await expectScope('constituency', 17);
    expect(
      c04.slugs.some((slug) => slug.startsWith('kaohsiung-council-04-')),
    ).toBe(true);
    const selectedSlug = c04.slugs.find((slug) =>
      slug.startsWith('kaohsiung-council-04-'),
    );
    if (!selectedSlug) throw new Error('council-04 candidate is missing');

    await page.evaluate((slug: string) => {
      window.dispatchEvent(
        new CustomEvent('kaohsiung:select-candidate', { detail: slug }),
      );
    }, selectedSlug);
    await expect(page.getByTestId('profile-panel')).toBeVisible({
      timeout: 20_000,
    });
    await expectScope('constituency', 17);

    await focusDistrict('kaohsiung-council-05');
    await page.waitForTimeout(80);
    const c05 = await expectScope('constituency', 12);
    expect(
      c05.slugs.some((slug) => slug.startsWith('kaohsiung-council-05-')),
    ).toBe(true);
    expect(
      c05.slugs.some((slug) => slug.startsWith('kaohsiung-council-04-')),
    ).toBe(false);
    await expect(page.getByTestId('profile-panel')).toHaveCount(0);
    expect(
      await page.evaluate(
        (slug: string) =>
          (window as WorldWindow).__kaohsiungActorScreenPosition?.(slug) ??
          null,
        selectedSlug,
      ),
    ).toBeNull();

    await focusDistrict('kaohsiung-council-01');
    await page.waitForTimeout(80);
    const c01 = await expectScope('constituency', 10);
    expect(
      c01.slugs.some((slug) => slug.startsWith('kaohsiung-council-01-')),
    ).toBe(true);
    expect(
      c01.slugs.some(
        (slug) =>
          slug.startsWith('kaohsiung-council-04-') ||
          slug.startsWith('kaohsiung-council-05-'),
      ),
    ).toBe(false);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(80);
    await expect(explorer).toHaveAttribute(
      'data-scene-focus',
      /^world-overview-/,
      { timeout: 20_000 },
    );
    const citywide = await expectScope('citywide', 5);
    expect(
      citywide.slugs.every(
        (slug) =>
          !slug.startsWith('kaohsiung-council-') &&
          !slug.startsWith('kaohsiung-indigenous-'),
      ),
    ).toBe(true);
    const restored = await page.evaluate(() => {
      const bridge = window as WorldWindow;
      return (bridge.__kaohsiungWorld?.actors() ?? [])
        .filter((actor) => actor.role !== 'mayor')
        .every(
          (actor) =>
            (bridge.__kaohsiungActorScreenPosition?.(actor.slug) ?? null) ===
            null,
        );
    });
    expect(restored).toBe(true);
  });

  test('initializes and closes a direct candidate URL consistently', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openFocus(page, '/?candidate=kaohsiung-council-04-712cf4dd');
    const explorer = page.getByTestId('city-explorer');

    await expect(explorer).toHaveAttribute(
      'data-candidate-scope',
      'constituency',
    );
    await expect(explorer).toHaveAttribute('data-candidate-count', '17');
    const focused = await visibility(page);
    expect(focused.slugs).toContain('kaohsiung-council-04-712cf4dd');
    expect(
      focused.slugs.some((slug) => slug.startsWith('kaohsiung-council-05-')),
    ).toBe(false);
    await expect(page.getByTestId('profile-panel')).toBeVisible({
      timeout: 20_000,
    });
    expect(
      await actorScreenPosition(page, 'kaohsiung-council-04-712cf4dd'),
    ).not.toBeNull();

    await page.locator('[aria-label="關閉人物資料"]').click();
    await expect(page.getByTestId('profile-panel')).toHaveCount(0);
    await expect(explorer).toHaveAttribute(
      'data-candidate-scope',
      'constituency',
    );
    await expect(explorer).toHaveAttribute('data-candidate-count', '17');
    const after = await visibility(page);
    expect(after.slugs).toContain('kaohsiung-council-04-712cf4dd');
    expect(
      after.slugs.some((slug) => slug.startsWith('kaohsiung-council-05-')),
    ).toBe(false);
  });

  test('normalizes conflicting direct-URL focus parameters', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openFocus(
      page,
      '/?candidate=kaohsiung-council-04-712cf4dd&admin=E05',
    );
    const explorer = page.getByTestId('city-explorer');
    await expect(explorer).toHaveAttribute(
      'data-candidate-scope',
      'constituency',
    );
    await expect(explorer).toHaveAttribute('data-candidate-count', '17');
    await expect(explorer).toHaveAttribute(
      'data-scene-focus',
      /^candidate-kaohsiung-council-04-712cf4dd$/,
    );
    await expect(page.locator('.city-admin-card')).toHaveCount(0);
    await expect(page.getByTestId('profile-panel')).toBeVisible({
      timeout: 20_000,
    });

    await page.locator('[aria-label="關閉人物資料"]').click();
    await expect(page.getByTestId('profile-panel')).toHaveCount(0);
    await expect(explorer).toHaveAttribute(
      'data-scene-focus',
      /^scope-kaohsiung-council-04-/,
    );
    await expect(explorer).toHaveAttribute('data-candidate-count', '17');

    await openFocus(page, '/?admin=E05&district=kaohsiung-council-04');
    await expect(explorer).toHaveAttribute(
      'data-candidate-scope',
      'admin-district',
    );
    await expect(explorer).toHaveAttribute('data-scene-focus', /^admin-E05-/);
    await expect(page.locator('.city-admin-card')).toContainText('三民區');
  });

  test('samples continuously changing interpolated walking while rendered', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openFocus(page, '/?admin=E03');

    const sampled = await page.evaluate(async () => {
      const visible = (
        window as WorldWindow
      ).__kaohsiungCandidateVisibility?.();
      if (!visible) throw new Error('visibility bridge is unavailable');
      let pick: string | null = null;
      for (const slug of visible.slugs) {
        const pose = (window as WorldWindow).__kaohsiungActorPose?.(slug);
        const screen = (window as WorldWindow).__kaohsiungActorScreenPosition?.(
          slug,
        );
        if (
          pose?.walking &&
          screen &&
          screen.x > 20 &&
          screen.x < 1420 &&
          screen.y > 80 &&
          screen.y < 860
        ) {
          pick = slug;
          break;
        }
      }
      if (!pick) throw new Error('no on-screen walking candidate');

      const frames: ActorPose[] = [];
      for (let frame = 0; frame < 10; frame += 1) {
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
        const pose = (window as WorldWindow).__kaohsiungActorPose?.(pick);
        if (pose) frames.push(pose);
      }
      const positions = new Set(
        frames.map((frame) => `${frame.x.toFixed(4)},${frame.z.toFixed(4)}`),
      );
      const phases = new Set(frames.map((frame) => frame.walkPhase.toFixed(4)));
      let maxHeadingStep = 0;
      let phaseRegression = 0;
      for (let i = 1; i < frames.length; i += 1) {
        const delta = Math.atan2(
          Math.sin(frames[i]!.heading - frames[i - 1]!.heading),
          Math.cos(frames[i]!.heading - frames[i - 1]!.heading),
        );
        maxHeadingStep = Math.max(maxHeadingStep, Math.abs(delta));
        phaseRegression = Math.max(
          phaseRegression,
          frames[i - 1]!.walkPhase - frames[i]!.walkPhase,
        );
      }
      return {
        pick,
        count: frames.length,
        uniquePositions: positions.size,
        uniquePhases: phases.size,
        maxHeadingStep,
        phaseRegression,
        finite: frames.every(
          (frame) =>
            Number.isFinite(frame.x) &&
            Number.isFinite(frame.z) &&
            Number.isFinite(frame.heading) &&
            Number.isFinite(frame.walkPhase),
        ),
      };
    });

    expect(sampled.count).toBe(10);
    expect(sampled.finite).toBe(true);
    expect(sampled.uniquePositions).toBeGreaterThanOrEqual(5);
    expect(sampled.uniquePhases).toBeGreaterThanOrEqual(5);
    expect(sampled.maxHeadingStep).toBeLessThanOrEqual(Math.PI);
    expect(sampled.phaseRegression).toBeLessThanOrEqual(0.0001);
  });
});
