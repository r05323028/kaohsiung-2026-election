import { expect, type Page, test } from '@playwright/test';

// The in-city likeness preview is development-only: Astro strips it from the
// production bundle, and the Vite middleware that serves unapproved kits only
// exists when the dev server started with LIKENESS_PREVIEW=1.
test.skip(
  process.env.LIKENESS_PREVIEW !== '1',
  'set LIKENESS_PREVIEW=1 to exercise the development-only likeness preview',
);

const CANDIDATE = 'lai-rui-long-2026';
const KIT_URL = `/assets/avatars/likeness/${CANDIDATE}-head.glb`;
const PANEL = '[data-testid="likeness-preview-panel"]';

type PreviewBridge = () => {
  slug: string;
  view: string;
  kitAttached: boolean;
  kitCount: number;
} | null;

async function previewState(page: Page) {
  return page.evaluate(() => {
    const bridge = window as unknown as {
      __likenessPreview?: PreviewBridge;
    };
    return bridge.__likenessPreview?.() ?? null;
  });
}

async function openPreview(page: Page) {
  await page.goto(`/?candidate=${CANDIDATE}&likenessPreview=1`);
  await expect(
    page.locator('[data-testid="city-explorer"][data-hydrated="true"]'),
  ).toBeVisible();
  const panel = page.locator(PANEL);
  await expect(panel).toHaveAttribute('data-status', 'ready', {
    timeout: 30_000,
  });
  return panel;
}

test.describe('development-only likeness preview', () => {
  test('installs an unapproved kit on the pinned candidate only', async ({
    page,
  }) => {
    const unapproved = await page.request.get('/__dev/likeness/index.json');
    // The route exists only for this run, so read it before the page loads.
    const panel = await openPreview(page);

    expect(unapproved.headers()['cache-control']).toBe('no-store');
    expect(unapproved.headers()['x-likeness-preview']).toBe('development-only');
    const index = (await unapproved.json()) as {
      approval: string;
      origin: string;
      kits: { slug: string; candidateId: string }[];
    };
    expect(index.approval).toBe('unapproved');
    expect(index.origin).toBe('development-only');
    expect(index.kits.map((kit) => kit.slug)).toContain(CANDIDATE);

    await expect(panel).toHaveAttribute('data-show-kit', 'false');

    await page.getByTestId('likeness-sculpted').click();
    await expect(panel).toHaveAttribute('data-show-kit', 'true');
    await page.getByTestId('likeness-view-front').click();
    await expect(panel).toHaveAttribute('data-view', 'front');

    // The fixed profile panel would cover the head being inspected, so a
    // non-city view hides it and the city view restores it.
    await expect(page.getByTestId('profile-panel')).toBeHidden();

    await expect
      .poll(async () => (await previewState(page))?.kitAttached ?? false, {
        timeout: 30_000,
      })
      .toBe(true);
    const front = await previewState(page);
    expect(front).toMatchObject({
      slug: CANDIDATE,
      view: 'front',
      kitCount: 1,
    });

    // Walking is a preview override: it only drives the pinned candidate.
    await page.getByTestId('likeness-walk-walk').click();
    await expect(panel).toHaveAttribute('data-walk', 'walk');
    await page.getByTestId('likeness-walk-idle').click();
    await expect(panel).toHaveAttribute('data-walk', 'idle');
    await page.getByTestId('likeness-walk-auto').click();
    await expect(panel).toHaveAttribute('data-walk', 'auto');

    // Switching back to the shared head removes the kit again.
    await page.getByTestId('likeness-base').click();
    await expect(panel).toHaveAttribute('data-show-kit', 'false');
    await expect
      .poll(async () => (await previewState(page))?.kitCount ?? -1, {
        timeout: 30_000,
      })
      .toBe(0);

    // Leaving the inspection view restores the city framing and the profile.
    await page.getByTestId('likeness-view-city').click();
    await expect(panel).toHaveAttribute('data-view', 'city');
    await expect(page.getByTestId('profile-panel')).toBeVisible();
  });

  test('manual retry installs the kit after the automatic retries are spent', async ({
    page,
  }) => {
    let failedRequests = 0;
    await page.route('**/__dev/likeness/*.glb*', async (route) => {
      if (failedRequests < 2) {
        failedRequests += 1;
        await route.fulfill({ status: 404, body: '' });
        return;
      }
      await route.continue();
    });

    await openPreview(page);
    await page.getByTestId('likeness-sculpted').click();
    await page.getByTestId('likeness-view-front').click();

    // One request plus the single automatic retry, then the shared base head.
    await expect.poll(() => failedRequests, { timeout: 30_000 }).toBe(2);
    await expect
      .poll(async () => (await previewState(page))?.kitAttached ?? false, {
        timeout: 30_000,
      })
      .toBe(false);

    // The panel retry evicts the rejected loader entry before remounting, so
    // the next request is real and can succeed.
    await page.getByTestId('likeness-retry').click();
    await expect
      .poll(async () => (await previewState(page))?.kitAttached ?? false, {
        timeout: 30_000,
      })
      .toBe(true);
    const state = await previewState(page);
    expect(state).toMatchObject({
      slug: CANDIDATE,
      view: 'front',
      kitCount: 1,
    });
    expect(failedRequests).toBe(2);
  });

  test('stays inert on another candidate profile', async ({ page }) => {
    await page.goto('/?candidate=ke-zhi-en-2026&likenessPreview=1');
    const panel = page.locator(PANEL);
    await expect(panel).toHaveAttribute('data-status', 'ready', {
      timeout: 30_000,
    });
    // The kit belongs to one candidate: on someone else's profile the panel
    // says so and leaves the scene, camera and pin untouched.
    await expect(panel).toHaveAttribute('data-active', 'false');
    await expect(page.getByTestId('likeness-preview-mismatch')).toBeVisible();
    await expect(page.getByTestId('likeness-sculpted')).toBeDisabled();
    expect(await previewState(page)).toBeNull();
  });

  test('never serves an unapproved kit from the published path', async ({
    page,
  }) => {
    const response = await page.request.get(KIT_URL);
    expect(response.status()).toBe(404);
  });

  test('falls back to the shared head when the kit cannot load', async ({
    page,
  }) => {
    await page.route('**/__dev/likeness/*.glb*', (route) =>
      route.fulfill({ status: 404, body: '' }),
    );
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    const panel = await openPreview(page);
    await page.getByTestId('likeness-sculpted').click();
    await expect(panel).toHaveAttribute('data-show-kit', 'true');
    await page.getByTestId('likeness-view-front').click();

    // The scene survives a broken kit: a failed head kit must not latch the
    // city's error boundary, so the canvas keeps rendering the shared head.
    await expect(page.getByTestId('scene-frame').locator('canvas')).toBeVisible(
      {
        timeout: 30_000,
      },
    );
    await expect
      .poll(async () => (await previewState(page))?.kitCount ?? -1, {
        timeout: 30_000,
      })
      .toBe(0);
    expect(errors).toEqual([]);
  });
});
