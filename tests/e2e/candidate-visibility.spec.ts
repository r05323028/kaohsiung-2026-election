import { expect, type Page, test } from '@playwright/test';

type Visibility = {
  scope: 'all' | 'admin-district' | 'constituency';
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
  __kaohsiungActorMarker?: () => { uuid: string; count: number } | null;
  __kaohsiungActorLod?: () => {
    detailCount: number;
    overviewCount: number;
  };
  __kaohsiungWorld?: {
    actors: () => { slug: string; displayName?: string }[];
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

async function focusAdmin(page: Page, name: string) {
  const tray = page.locator('#city-admin-tray');
  if (!(await tray.isVisible())) {
    await page.locator('[aria-controls="city-admin-tray"]').click();
  }
  await expect(tray).toBeVisible();
  await tray.locator('.city-admin-chip').filter({ hasText: name }).click();
}

test.describe('district-focused candidate visibility', () => {
  test('uses official electoral scope across district focus and restores the full city', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await openFocus(page, '/?admin=E03');

    const explorer = page.getByTestId('city-explorer');
    await expect(explorer).toHaveAttribute(
      'data-candidate-scope',
      'admin-district',
    );
    await expect(explorer).toHaveAttribute('data-candidate-count', '22');

    const zuoying = await visibility(page);
    expect(zuoying.scope).toBe('admin-district');
    expect(zuoying.count).toBe(22);
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
    expect(marker?.count).toBe(22);
    const lod = await page.evaluate(() =>
      (window as WorldWindow).__kaohsiungActorLod?.(),
    );
    expect((lod?.detailCount ?? 0) + (lod?.overviewCount ?? 0)).toBe(22);

    const statsBefore = await page.evaluate(() =>
      (window as WorldWindow).__kaohsiungWorld?.stats(),
    );

    await focusAdmin(page, '楠梓');
    await expect(explorer).toHaveAttribute('data-scene-focus', /^admin-E04-/, {
      timeout: 20_000,
    });
    await page.waitForTimeout(800);
    const nanzih = await visibility(page);
    expect(nanzih.count).toBe(22);
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
    expect(sanmin.count).toBe(22);
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
    await expect(explorer).toHaveAttribute('data-candidate-scope', 'all');
    await expect(explorer).toHaveAttribute('data-candidate-count', '106');
    await page.waitForTimeout(800);

    const fullCity = await visibility(page);
    expect(fullCity.count).toBe(106);
    expect(
      fullCity.slugs.some((slug) => slug.startsWith('kaohsiung-council-01-')),
    ).toBe(true);
    expect(
      fullCity.slugs.some((slug) => slug.startsWith('kaohsiung-council-04-')),
    ).toBe(true);
    expect(
      fullCity.slugs.some((slug) => slug.startsWith('kaohsiung-council-07-')),
    ).toBe(true);
    const restoredMarker = await page.evaluate(() =>
      (window as WorldWindow).__kaohsiungActorMarker?.(),
    );
    expect(restoredMarker?.count).toBe(106);
    const statsAfter = await page.evaluate(() =>
      (window as WorldWindow).__kaohsiungWorld?.stats(),
    );
    expect(statsAfter?.elapsedSeconds).toBeGreaterThanOrEqual(
      statsBefore?.elapsedSeconds ?? 0,
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
      '22',
    );
    expect(
      await page.evaluate(
        (slug) =>
          (window as WorldWindow).__kaohsiungActorScreenPosition?.(slug),
        mapping.hiddenSlug ?? '',
      ),
    ).toBeNull();
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
