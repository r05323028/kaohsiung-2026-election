const fs = require('fs');
let s = fs.readFileSync('tests/e2e/smoke.spec.ts', 'utf8');
s = s.replace(
  "  await explorer.getByRole('button', { name: /高雄市長選舉/ }).click();",
  "  await explorer\n    .locator('#city-district-tray')\n    .getByRole('button', { name: /高雄市長選舉/ })\n    .click();",
);
s = s.replace(
  "  await expect(\n    explorer.getByRole('button', { name: /高雄市議員第12選舉區/ }),\n  ).toBeVisible();",
  "  await expect(\n    explorer\n      .locator('#city-district-tray')\n      .getByRole('button', { name: /高雄市議員第12選舉區/ }),\n  ).toBeVisible();",
);
s = s.replace(
  "  await page.goto('/');\n  await page.getByLabel('搜尋人物').fill('林海星');",
  "  await page.goto('/');\n  await expect(page.getByTestId('city-explorer')).toHaveAttribute(\n    'data-hydrated',\n    'true',\n  );\n  await page.getByLabel('搜尋人物').fill('林海星');",
);
fs.writeFileSync('tests/e2e/smoke.spec.ts', s);
console.log('patched');
