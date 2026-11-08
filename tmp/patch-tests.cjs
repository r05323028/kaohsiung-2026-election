const fs = require('fs');
let smoke = fs.readFileSync('tests/e2e/smoke.spec.ts', 'utf8');
smoke = smoke.replace(
  "  await page.getByRole('button', { name: /山城示範選區/ }).click();\n  await expect(page.locator('#scene-heading')).toContainText('山城示範選區');\n  await expect(\n    page.getByRole('button', { name: /沈安波/ }).first(),\n  ).toBeVisible();",
  "  await page.locator('[aria-controls=\"city-district-tray\"]').click();\n  await page.getByRole('button', { name: /山城示範選區/ }).click();\n  await expect(page.locator('#scene-heading')).toContainText('山城示範選區');\n  await page.locator('[aria-controls=\"city-people-tray\"]').click();\n  await expect(\n    page.getByRole('button', { name: /沈安波/ }).first(),\n  ).toBeVisible();",
);
smoke = smoke.replace(
  "  await page\n    .getByRole('button', { name: /林海星/ })\n    .first()\n    .click();\n  const panel = page.getByTestId('profile-panel');",
  "  await page.locator('[aria-controls=\"city-people-tray\"]').click();\n  await page\n    .getByRole('button', { name: /林海星/ })\n    .first()\n    .click();\n  const panel = page.getByTestId('profile-panel');",
);
smoke = smoke.replace(
  "  await explorer.getByRole('tab', { name: '市長選' }).click();",
  "  await explorer.locator('[aria-controls=\"city-district-tray\"]').click();\n  await explorer.getByRole('tab', { name: '市長選' }).click();",
);
smoke = smoke.replace(
  "  await councilDistrict.click();\n  await expect(\n    explorer.getByRole('button', { name: /李 李振豪 2026/ }),\n  ).toBeVisible();",
  "  await councilDistrict.click();\n  await explorer.locator('[aria-controls=\"city-people-tray\"]').click();\n  await expect(\n    explorer.getByRole('button', { name: /李 李振豪 2026/ }),\n  ).toBeVisible();",
);
smoke = smoke.replace(
  "  await page\n    .getByRole('button', { name: /林海星/ })\n    .first()\n    .click();\n  await expect(page.getByTestId('profile-panel')).toContainText('基本資料');",
  "  await page.locator('[aria-controls=\"city-people-tray\"]').click();\n  await page\n    .getByRole('button', { name: /林海星/ })\n    .first()\n    .click();\n  await expect(page.getByTestId('profile-panel')).toContainText('基本資料');",
);
fs.writeFileSync('tests/e2e/smoke.spec.ts', smoke);

let mobile = fs.readFileSync('tests/e2e/mobile.spec.ts', 'utf8');
mobile = mobile.replace(
  "  await expect(\n    page.getByRole('heading', { name: '不用 3D 也能選擇人物' }),\n  ).toBeVisible();\n  await page\n    .getByRole('button', { name: /林海星/ })\n    .first()\n    .click();",
  "  await page.locator('[aria-controls=\"city-people-tray\"]').click();\n  await expect(\n    page.getByRole('heading', { name: '不用 3D 也能選擇人物' }),\n  ).toBeVisible();\n  await page\n    .getByRole('button', { name: /林海星/ })\n    .first()\n    .click();",
);
fs.writeFileSync('tests/e2e/mobile.spec.ts', mobile);
console.log('tests adapted to trays');
