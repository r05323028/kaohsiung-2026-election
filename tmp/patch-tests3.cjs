const fs = require('fs');
let s = fs.readFileSync('tests/e2e/smoke.spec.ts', 'utf8');
s = s.replace(
  "  await expect(\n    explorer.getByRole('button', { name: /高雄市長選舉/ }),\n  ).toBeVisible();",
  "  await expect(\n    explorer\n      .locator('#city-district-tray')\n      .getByRole('button', { name: /高雄市長選舉/ }),\n  ).toBeVisible();",
);
fs.writeFileSync('tests/e2e/smoke.spec.ts', s);
