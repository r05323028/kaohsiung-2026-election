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
  __kaohsiungCandidateVisibility?: () => {
    scope: 'all' | 'admin-district' | 'constituency';
    count: number;
    slugs: string[];
  };
  __kaohsiungWorld?: {
    camera: () => { zoom: number };
    actors: () => { slug: string; currentAdminId: string | null }[];
  };
};

async function openModels(page: Page, path: string) {
  await page.goto(path);
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
    await page.waitForTimeout(8000);
    const value = await lod(page);
    expect(value.model).toBe('glb');
    expect(value.mode).toBe('overview');
    expect(value.overviewCount).toBe(106);
    expect(value.detailCount).toBe(0);
    expect(value.screenPx).toBeLessThan(value.enterPx);
    expect(value.enterPx).toBeGreaterThan(value.exitPx);

    const marker = await page.evaluate(() =>
      (window as WorldWindow).__kaohsiungActorMarker?.(),
    );
    expect(marker?.count).toBe(106);
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

  test('forces the detailed model for a selected candidate at overview zoom', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openModels(page, '/?candidate=zhang-jing-2026');
    await page.waitForTimeout(8000);
    const value = await lod(page);
    expect(value.model).toBe('glb');
    expect(value.detailCount).toBeGreaterThanOrEqual(1);
    expect(value.detailCount + value.overviewCount).toBe(106);
    const scale = await page.evaluate(() =>
      (window as WorldWindow).__kaohsiungActorScale?.('zhang-jing-2026'),
    );
    expect(scale).toBe(0.42);
    await expect(page.locator('.profile-panel')).toBeVisible();
  });

  test('mounts detailed models and keeps scale consistent in a district focus', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openModels(page, '/?admin=E03');
    await page.waitForTimeout(8000);
    const value = await lod(page);
    expect(value.model).toBe('glb');
    expect(value.mode).toBe('detail');
    expect(value.detailCount).toBeGreaterThan(0);
    expect(value.detailCount).toBeLessThanOrEqual(10);
    const visibility = await page.evaluate(() =>
      (window as WorldWindow).__kaohsiungCandidateVisibility?.(),
    );
    expect(visibility?.scope).toBe('admin-district');
    expect(visibility?.count).toBe(22);
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
