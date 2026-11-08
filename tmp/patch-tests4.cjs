const fs = require('fs');
let s = fs.readFileSync('tests/e2e/smoke.spec.ts', 'utf8');
s = s.replace(
  "  const councilDistrict = explorer.getByRole('button', {\n    name: /高雄市議員第1選舉區/,\n  });",
  "  const councilDistrict = explorer\n    .locator('#city-district-tray')\n    .getByRole('button', { name: /高雄市議員第1選舉區/ });",
);
fs.writeFileSync('tests/e2e/smoke.spec.ts', s);
