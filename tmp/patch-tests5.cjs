const fs = require('fs');
let s = fs.readFileSync('tests/e2e/smoke.spec.ts', 'utf8');
s = s.replace(
  "  await explorer.getByRole('tab', { name: '原住民族' }).click();",
  "  await explorer.locator('[aria-controls=\"city-district-tray\"]').click();\n  await explorer.getByRole('tab', { name: '原住民族' }).click();",
);
fs.writeFileSync('tests/e2e/smoke.spec.ts', s);
