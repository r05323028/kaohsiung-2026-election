import { expect, type Page, test } from '@playwright/test';

type WorldActor = {
  slug: string;
  role: 'mayor' | 'council' | 'indigenous' | 'demo';
  electoralDistrictSlug: string;
  currentAdminId: string | null;
  currentAdminName: string | null;
  allowedAdminIds: string[];
  spawnAdminId: string | null;
  state: 'walking' | 'idle';
  behavior: string;
  heading: number;
  position: { x: number; z: number };
};

type WorldBridge = {
  advance: (seconds: number) => void;
  actors: () => WorldActor[];
  stats: () => {
    actors: number;
    invalidRoutes: number;
    elapsedSeconds: number;
    territoryRejections: number;
    byBehavior: Record<string, number>;
  };
  camera: () => { position: [number, number, number]; zoom: number };
};

type WorldWindow = Window & { __kaohsiungWorld?: WorldBridge };

const COUNCIL_04_SLUG = 'kaohsiung-council-04-712cf4dd';

test.use({ reducedMotion: 'reduce' });

async function openWorld(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByTestId('city-explorer')).toHaveAttribute(
    'data-hydrated',
    'true',
  );
  await page.waitForFunction(() =>
    Boolean((window as WorldWindow).__kaohsiungWorld),
  );
}

test.describe('living-world simulation', () => {
  test('characters walk, pause, turn and keep a stable identity', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await openWorld(page, '/?district=kaohsiung-council-04');

    const samples = await page.evaluate(() => {
      const world = (window as WorldWindow).__kaohsiungWorld as WorldBridge;
      const slug = 'kaohsiung-council-04-712cf4dd';
      const behaviors = new Set<string>();
      let previousHeading: number | null = null;
      let maxHeadingStep = 0;
      let moved = 0;
      let last = world.actors().find((actor) => actor.slug === slug)?.position;

      for (let second = 0; second < 120; second += 1) {
        world.advance(1);
        const actor = world.actors().find((item) => item.slug === slug);
        if (!actor) break;
        behaviors.add(actor.behavior);
        if (previousHeading !== null) {
          const delta = Math.atan2(
            Math.sin(actor.heading - previousHeading),
            Math.cos(actor.heading - previousHeading),
          );
          maxHeadingStep = Math.max(maxHeadingStep, Math.abs(delta));
        }
        previousHeading = actor.heading;
        if (last) {
          moved += Math.hypot(
            actor.position.x - last.x,
            actor.position.z - last.z,
          );
        }
        last = { ...actor.position };
      }

      return {
        behaviors: [...behaviors],
        maxHeadingStep,
        moved,
        actors: world.actors().length,
        duplicates:
          world.actors().length -
          new Set(world.actors().map((actor) => actor.slug)).size,
        demoActors: world.actors().filter((actor) => actor.role === 'demo')
          .length,
      };
    });

    expect(samples.behaviors).toContain('walking');
    expect(
      samples.behaviors.some((behavior) =>
        ['pausing', 'observing', 'turning', 'arriving'].includes(behavior),
      ),
    ).toBe(true);
    expect(samples.maxHeadingStep).toBeLessThanOrEqual(2.81);
    expect(samples.moved).toBeGreaterThan(0.01);
    expect(samples.actors).toBe(106);
    expect(samples.duplicates).toBe(0);
    expect(samples.demoActors).toBe(0);
  });

  test('council-04 cannot leave Zuoying or Nanzih', {
    tag: '@critical',
  }, async ({ page }) => {
    test.setTimeout(90_000);
    await openWorld(page, '/?district=kaohsiung-council-04');

    const result = await page.evaluate(() => {
      const world = (window as WorldWindow).__kaohsiungWorld as WorldBridge;
      const visited = new Set<string>();
      for (let step = 0; step < 60; step += 1) {
        world.advance(30);
        for (const actor of world.actors()) {
          if (
            actor.electoralDistrictSlug === 'kaohsiung-council-04' &&
            actor.currentAdminId
          ) {
            visited.add(actor.currentAdminId);
          }
        }
      }
      const council = world
        .actors()
        .filter(
          (actor) => actor.electoralDistrictSlug === 'kaohsiung-council-04',
        );
      return {
        count: council.length,
        allowed: [
          ...new Set(council.flatMap((actor) => actor.allowedAdminIds)),
        ],
        visited: [...visited],
        duplicates:
          world.actors().length -
          new Set(world.actors().map((actor) => actor.slug)).size,
      };
    });

    expect(result.count).toBe(12);
    expect(result.allowed.sort()).toEqual(['E03', 'E04']);
    expect(result.visited.sort()).toEqual(['E03', 'E04']);
    expect(result.duplicates).toBe(0);
  });

  test('mayoral simulation crosses multiple districts without padding', async ({
    page,
  }) => {
    await openWorld(page, '/?district=kaohsiung-mayor-2026');

    const result = await page.evaluate(() => {
      const world = (window as WorldWindow).__kaohsiungWorld as WorldBridge;
      world.advance(900);
      const mayors = world.actors().filter((actor) => actor.role === 'mayor');
      return {
        count: mayors.length,
        districts: [
          ...new Set(
            mayors
              .map((actor) => actor.currentAdminName)
              .filter((name): name is string => Boolean(name)),
          ),
        ],
        maxAllowed: Math.max(
          ...mayors.map((actor) => actor.allowedAdminIds.length),
        ),
        stats: world.stats(),
      };
    });

    expect(result.count).toBe(5);
    expect(result.districts.length).toBeGreaterThanOrEqual(2);
    expect(result.maxAllowed).toBe(38);
    expect(result.stats.invalidRoutes).toBe(0);
  });

  test('camera follows a selected walking character', async ({ page }) => {
    test.setTimeout(90_000);
    await openWorld(
      page,
      `/?district=kaohsiung-council-04&candidate=${COUNCIL_04_SLUG}`,
    );
    await expect(page.locator('.profile-panel')).toBeVisible();

    await page.waitForFunction(
      ({ slug }) => {
        const world = (window as WorldWindow).__kaohsiungWorld;
        const actor = world?.actors().find((item) => item.slug === slug);
        return actor?.behavior === 'walking';
      },
      { slug: COUNCIL_04_SLUG },
      { timeout: 30_000 },
    );
    await page.waitForTimeout(2_000);

    const before = await page.evaluate((slug) => {
      const world = (window as WorldWindow).__kaohsiungWorld as WorldBridge;
      const actor = world.actors().find((item) => item.slug === slug);
      return {
        actor: actor ? { ...actor.position } : null,
        camera: world.camera(),
      };
    }, COUNCIL_04_SLUG);

    await page.evaluate(() => {
      const world = (window as WorldWindow).__kaohsiungWorld as WorldBridge;
      world.advance(20);
    });
    await page.waitForTimeout(1_500);

    const after = await page.evaluate((slug) => {
      const world = (window as WorldWindow).__kaohsiungWorld as WorldBridge;
      const actor = world.actors().find((item) => item.slug === slug);
      return {
        actor: actor ? { ...actor.position } : null,
        camera: world.camera(),
      };
    }, COUNCIL_04_SLUG);

    expect(before.actor).not.toBeNull();
    expect(after.actor).not.toBeNull();
    const actorMoved = Math.hypot(
      (after.actor?.x ?? 0) - (before.actor?.x ?? 0),
      (after.actor?.z ?? 0) - (before.actor?.z ?? 0),
    );
    const cameraMoved = Math.hypot(
      after.camera.position[0] - before.camera.position[0],
      after.camera.position[2] - before.camera.position[2],
    );
    expect(actorMoved).toBeGreaterThan(0.005);
    expect(cameraMoved).toBeGreaterThan(0.001);
    expect(after.camera.zoom).toBeGreaterThan(3);
  });
});
