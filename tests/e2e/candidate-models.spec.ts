import { expect, type Page, test } from '@playwright/test';

type ActorLod = {
  mode: 'detail' | 'overview';
  detailCount: number;
  overviewCount: number;
  screenPx: number;
  enterPx: number;
  exitPx: number;
  model: 'glb';
};

type WorldWindow = Window & {
  __kaohsiungActorLod?: () => ActorLod;
  __kaohsiungActorScale?: (slug: string) => number | null;
  __kaohsiungActorMarker?: () => { uuid: string; count: number } | null;
  __kaohsiungActorOverviewLimb?: (
    pivot: 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg' | 'head',
    slug: string,
  ) => number[] | null;
  __kaohsiungActorDetailLimb?: (
    pivot: 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg' | 'head',
    slug: string,
  ) => number[] | null;
  __kaohsiungActorPose?: (slug: string) => {
    x: number;
    z: number;
    heading: number;
    walkPhase: number;
    walking: boolean;
  } | null;
  __kaohsiungCandidateVisibility?: () => {
    scope: 'citywide' | 'admin-district' | 'constituency';
    count: number;
    slugs: string[];
  };
  __kaohsiungWorld?: {
    camera: () => { zoom: number };
    actors: () => { slug: string; currentAdminId: string | null }[];
  };
};

async function openModels(page: Page, path: string) {
  const separator = path.includes('?') ? '&' : '?';
  await page.goto(path + separator + 'quality=low');
  await expect(page.getByTestId('city-explorer')).toHaveAttribute(
    'data-hydrated',
    'true',
    { timeout: 30_000 },
  );
  await page.waitForFunction(
    () => typeof (window as WorldWindow).__kaohsiungActorLod === 'function',
    undefined,
    { timeout: 30_000 },
  );
}

async function lod(page: Page): Promise<ActorLod> {
  return page.evaluate(() => {
    const value = (window as WorldWindow).__kaohsiungActorLod?.();
    if (!value) throw new Error('actor LOD bridge is unavailable');
    return value;
  });
}

test.describe('GLB candidate models', () => {
  test('uses complete overview models across the full city', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const modelResponses: { status: number; type: string }[] = [];
    const pageErrors: string[] = [];
    page.on('response', (response) => {
      if (response.url().includes('/models/kaohsiung_chibi_')) {
        modelResponses.push({
          status: response.status(),
          type: response.headers()['content-type'] ?? '',
        });
      }
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await openModels(page, '/');
    await expect
      .poll(
        async () => {
          const value = await lod(page);
          return (
            value.model === 'glb' &&
            value.mode === 'overview' &&
            value.overviewCount === 5 &&
            value.detailCount === 0 &&
            value.screenPx < value.enterPx
          );
        },
        { timeout: 30_000 },
      )
      .toBe(true);
    const value = await lod(page);
    expect(value.model).toBe('glb');
    expect(value.mode).toBe('overview');
    expect(value.overviewCount).toBe(5);
    expect(value.detailCount).toBe(0);
    expect(value.screenPx).toBeLessThan(value.enterPx);
    expect(value.enterPx).toBeGreaterThan(value.exitPx);

    const marker = await page.evaluate(() =>
      (window as WorldWindow).__kaohsiungActorMarker?.(),
    );
    expect(marker?.count).toBe(5);
    expect(
      modelResponses.some(
        (response) =>
          response.status === 200 && response.type.includes('gltf-binary'),
      ),
    ).toBe(true);
    expect(pageErrors).toEqual([]);
    await expect(
      page.getByTestId('scene-frame').locator('canvas'),
    ).toBeVisible();
  });

  test('animates overview limb pivots while candidates walk', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openModels(page, '/');
    await page.waitForTimeout(6000);

    const sample = () =>
      page.evaluate(() => {
        const bridge = window as WorldWindow;
        const visibility = bridge.__kaohsiungCandidateVisibility?.();
        const limbs: Record<string, string> = {};
        for (const slug of visibility?.slugs ?? []) {
          const matrix = bridge.__kaohsiungActorOverviewLimb?.('leftLeg', slug);
          if (matrix)
            limbs[slug] = matrix.map((value) => value.toFixed(5)).join(',');
        }
        return limbs;
      });

    const before = await sample();
    expect(Object.keys(before).length).toBe(5);
    await page.waitForTimeout(400);
    const after = await sample();
    const animated = Object.keys(before).filter(
      (slug) => before[slug] !== after[slug],
    );
    expect(animated.length).toBeGreaterThan(0);
  });

  test('forces the detailed model for a selected candidate at overview zoom', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openModels(page, '/?candidate=zhang-jing-2026');
    await expect
      .poll(
        async () => {
          const value = await lod(page);
          return (
            value.model === 'glb' &&
            value.detailCount >= 1 &&
            value.detailCount + value.overviewCount === 5
          );
        },
        { timeout: 30_000 },
      )
      .toBe(true);
    const value = await lod(page);
    expect(value.model).toBe('glb');
    expect(value.detailCount).toBeGreaterThanOrEqual(1);
    expect(value.detailCount + value.overviewCount).toBe(5);
    const scale = await page.evaluate(() =>
      (window as WorldWindow).__kaohsiungActorScale?.('zhang-jing-2026'),
    );
    expect(scale).toBe(0.42);
    await expect(page.locator('.profile-panel')).toBeVisible();
  });

  test('animates detailed GLB limb pivots while candidates walk', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openModels(page, '/?admin=E03');
    await page.waitForTimeout(3000);

    const slug = await page.evaluate(() => {
      const bridge = window as WorldWindow;
      for (const candidate of bridge.__kaohsiungCandidateVisibility?.().slugs ??
        []) {
        if (bridge.__kaohsiungActorDetailLimb?.('leftLeg', candidate)) {
          return candidate;
        }
      }
      return null;
    });
    expect(slug).toBeTruthy();

    const frames = await page.evaluate(async (candidate) => {
      const bridge = window as WorldWindow;
      const samples: {
        leg: number;
        arm: number;
        phase: number;
      }[] = [];
      for (let frame = 0; frame < 12; frame += 1) {
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
        const leg = bridge.__kaohsiungActorDetailLimb?.('leftLeg', candidate);
        const arm = bridge.__kaohsiungActorDetailLimb?.('leftArm', candidate);
        const pose = bridge.__kaohsiungActorPose?.(candidate);
        if (leg && arm && pose) {
          samples.push({ leg: leg[0]!, arm: arm[0]!, phase: pose.walkPhase });
        }
      }
      return samples;
    }, slug!);

    expect(frames).toHaveLength(12);
    expect(
      new Set(frames.map((frame) => frame.leg.toFixed(4))).size,
    ).toBeGreaterThan(4);
    expect(
      new Set(frames.map((frame) => frame.arm.toFixed(4))).size,
    ).toBeGreaterThan(4);
    expect(
      frames.every(
        (frame, index) =>
          index === 0 || frame.phase >= frames[index - 1]!.phase - 1e-6,
      ),
    ).toBe(true);
  });

  test('freezes limb pivots but keeps actors moving under reduced motion', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openModels(page, '/');
    await page.waitForTimeout(6000);
    await page.locator('.global-header__settings-button').click();
    const toggle = page.locator('.city-settings__toggle input');
    await expect(toggle).toBeVisible();
    await toggle.check();
    await page.waitForTimeout(2400);

    const sample = () =>
      page.evaluate(() => {
        const bridge = window as WorldWindow;
        const visibility = bridge.__kaohsiungCandidateVisibility?.();
        const limbs: Record<string, string> = {};
        const positions: Record<string, string> = {};
        for (const slug of visibility?.slugs ?? []) {
          const matrix = bridge.__kaohsiungActorOverviewLimb?.('leftLeg', slug);
          if (matrix) {
            // Compare the rotation block only; the body-relative translation
            // can carry harmless sub-pixel float noise between frames.
            limbs[slug] = [1, 2, 4, 6, 8, 9]
              .map((index) =>
                (Math.abs(matrix[index]!) < 1e-5 ? 0 : matrix[index]!).toFixed(
                  6,
                ),
              )
              .join(',');
          }
          const pose = bridge.__kaohsiungActorPose?.(slug);
          if (pose)
            positions[slug] = `${pose.x.toFixed(4)},${pose.z.toFixed(4)}`;
        }
        return { limbs, positions };
      });

    const before = await sample();
    expect(Object.keys(before.limbs)).toHaveLength(5);
    await page.waitForTimeout(500);
    const after = await sample();
    const moving = Object.keys(before.positions).filter(
      (slug) => before.positions[slug] !== after.positions[slug],
    );
    const movingLimbs = Object.keys(before.limbs).filter(
      (slug) => before.limbs[slug] !== after.limbs[slug],
    );
    expect(moving.length).toBeGreaterThan(0);
    expect(movingLimbs).toHaveLength(0);
  });

  test('mounts detailed models and keeps scale consistent in a district focus', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openModels(page, '/?admin=E03');
    await expect
      .poll(
        async () => {
          const value = await lod(page);
          const visibility = await page.evaluate(() =>
            (window as WorldWindow).__kaohsiungCandidateVisibility?.(),
          );
          return (
            value.model === 'glb' &&
            value.mode === 'detail' &&
            value.screenPx > value.enterPx &&
            visibility?.scope === 'admin-district' &&
            visibility.count === 17 &&
            value.detailCount + value.overviewCount === 17
          );
        },
        { timeout: 30_000 },
      )
      .toBe(true);
    const value = await lod(page);
    expect(value.model).toBe('glb');
    expect(value.mode).toBe('detail');
    expect(value.detailCount).toBeGreaterThan(0);
    expect(value.detailCount).toBeLessThanOrEqual(10);
    const visibility = await page.evaluate(() =>
      (window as WorldWindow).__kaohsiungCandidateVisibility?.(),
    );
    expect(visibility?.scope).toBe('admin-district');
    expect(visibility?.count).toBe(17);
    expect(value.detailCount + value.overviewCount).toBe(visibility?.count);
    expect(value.screenPx).toBeGreaterThan(value.enterPx);

    const detailScales = await page.evaluate(() => {
      const bridge = window as WorldWindow;
      const actors = bridge.__kaohsiungWorld?.actors() ?? [];
      return actors
        .map((actor) => bridge.__kaohsiungActorScale?.(actor.slug) ?? null)
        .filter((scale): scale is number => scale !== null);
    });
    expect(detailScales.length).toBe(value.detailCount);
    expect(new Set(detailScales.map((scale) => scale.toFixed(2)))).toEqual(
      new Set(['0.42']),
    );
    expect(
      await page.evaluate(
        () => (window as WorldWindow).__kaohsiungWorld?.camera().zoom,
      ),
    ).toBeGreaterThan(22 / (1.1 * 0.42));
  });
});
