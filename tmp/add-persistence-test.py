
from pathlib import Path
p = Path('tests/e2e/unified-world.spec.ts')
s = p.read_text()
needle = """  test('mayoral simulation crosses several administrative districts', async ({
    page,
  }) => {"""
addition = """  test('simulation persists when the profile closes and another district is focused', async ({
    page,
  }) => {
    await page.goto(
      '/?district=kaohsiung-council-04&candidate=kaohsiung-council-04-712cf4dd',
    );
    await explorer(page);
    await expect(page.locator('.profile-panel')).toBeVisible();
    await waitForWorld(page);

    const before = await page.evaluate(() => {
      const world = (window as WorldWindow).__kaohsiungWorld as WorldBridge;
      world.advance(60);
      const actors = world.actors();
      return {
        count: actors.length,
        unique: new Set(actors.map((actor) => actor.electoralDistrictSlug)).size,
        selectedProgress: actors.find(
          (actor) => actor.electoralDistrictSlug === 'kaohsiung-council-04',
        )?.progressKm,
      };
    });

    await page.getByRole('button', { name: '關閉人物資料' }).click();
    await page.locator('[aria-controls="city-admin-tray"]').click();
    await page
      .locator('#city-admin-tray .city-admin-chip')
      .filter({ hasText: '楠梓' })
      .click();
    await expect(
      page.locator('[data-testid="city-explorer"]'),
    ).toHaveAttribute('data-scene-focus', /^admin-E04-/, { timeout: 15_000 });

    const after = await page.evaluate(() => {
      const world = (window as WorldWindow).__kaohsiungWorld as WorldBridge;
      world.advance(60);
      const actors = world.actors();
      return {
        count: actors.length,
        unique: new Set(actors.map((actor) => actor.electoralDistrictSlug)).size,
        selectedProgress: actors.find(
          (actor) => actor.electoralDistrictSlug === 'kaohsiung-council-04',
        )?.progressKm,
        invalidRoutes: world.stats().invalidRoutes,
      };
    });

    expect(before.count).toBe(110);
    expect(after.count).toBe(110);
    expect(after.unique).toBe(before.unique);
    expect(after.selectedProgress ?? 0).toBeGreaterThan(
      before.selectedProgress ?? 0,
    );
    expect(after.invalidRoutes).toBe(0);
  });

  test('mayoral simulation crosses several administrative districts', async ({
    page,
  }) => {"""
if needle not in s:
    raise SystemExit('needle not found')
s = s.replace(needle, addition)
# Add progressKm to the actor type.
s = s.replace("  currentAdminName: string | null;\n};", "  currentAdminName: string | null;\n  progressKm: number;\n};")
p.write_text(s)
print('persistence e2e added')
