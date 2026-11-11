import { readFile } from 'node:fs/promises';
import path from 'node:path';
import manifestInput from '../data/official-source-manifest.json';
import {
  adminDistrictNamesForCoverage,
  COUNCIL_CONSTITUENCIES,
  coverageForDistrictSlug,
  validateConstituencyCoverage,
} from '../src/data/constituencies';
import { officialDistricts } from '../src/data/official';
import { ADMIN_DISTRICTS } from '../src/world/geography';

type ManifestSource = { id: string };
type Manifest = { sources: ManifestSource[] };

const manifest = manifestInput as Manifest;
const manifestIds = new Set(manifest.sources.map((source) => source.id));
const issues = [...validateConstituencyCoverage()];

if (COUNCIL_CONSTITUENCIES.length !== 15) {
  issues.push('Expected exactly 15 council constituencies.');
}

if (ADMIN_DISTRICTS.length !== 38) {
  issues.push('Expected 38 existing administrative districts.');
}

const officialBySlug = new Map(
  officialDistricts.map((district) => [district.slug, district]),
);
const officialCouncilDistricts = officialDistricts.filter(
  (district) =>
    district.slug.startsWith('kaohsiung-council-') ||
    district.slug.startsWith('kaohsiung-indigenous-'),
);

const expectedDistrictCounts: Record<number, number> = {
  1: 9,
  2: 5,
  3: 6,
  4: 2,
  5: 4,
  6: 3,
  7: 1,
  8: 3,
  9: 1,
  10: 2,
  11: 2,
  12: 38,
  13: 14,
  14: 12,
  15: 12,
};

for (const item of COUNCIL_CONSTITUENCIES) {
  const view = officialBySlug.get(item.slug);
  if (!view) {
    issues.push(
      'Constituency ' +
        item.number +
        ' is missing official district ' +
        item.slug +
        '.',
    );
  } else {
    if (view.id !== item.districtId) {
      issues.push(
        'Constituency ' +
          item.number +
          ' district ID mismatch: ' +
          view.id +
          '.',
      );
    }
    if (!view.constituencyCoverage) {
      issues.push(
        'Official district ' + item.slug + ' has no constituency coverage.',
      );
    } else if (view.constituencyCoverage.number !== item.number) {
      issues.push(
        'Official district ' + item.slug + ' has the wrong coverage number.',
      );
    }
  }

  if (coverageForDistrictSlug(item.slug)?.number !== item.number) {
    issues.push('Coverage lookup failed for ' + item.slug + '.');
  }

  if (item.adminDistrictIds.length !== expectedDistrictCounts[item.number]) {
    issues.push(
      'Constituency ' +
        item.number +
        ' expected ' +
        expectedDistrictCounts[item.number] +
        ' districts, found ' +
        item.adminDistrictIds.length +
        '.',
    );
  }

  for (const sourceId of item.sourceIds) {
    if (!manifestIds.has(sourceId)) {
      issues.push(
        'Constituency ' +
          item.number +
          ' references missing source ' +
          sourceId +
          '.',
      );
    }
  }

  let names: string[] = [];
  try {
    names = adminDistrictNamesForCoverage(item);
  } catch (error) {
    issues.push(
      'Constituency ' +
        item.number +
        ' failed district lookup: ' +
        (error instanceof Error ? error.message : String(error)),
    );
  }
  if (names.length !== item.adminDistrictIds.length) {
    issues.push(
      'Constituency ' + item.number + ' district names are incomplete.',
    );
  }
  if (item.number === 4) {
    const fourthExpected = ['左營區', '楠梓區'];
    for (const name of fourthExpected) {
      if (!names.includes(name)) {
        issues.push('Constituency 4 is missing ' + name + '.');
      }
    }
    if (names.length !== 2) {
      issues.push('Constituency 4 must only contain 左營區 and 楠梓區.');
    }
  }
}

if (officialCouncilDistricts.length !== COUNCIL_CONSTITUENCIES.length) {
  issues.push(
    'Expected ' +
      COUNCIL_CONSTITUENCIES.length +
      ' official council districts, found ' +
      officialCouncilDistricts.length +
      '.',
  );
}
for (const district of officialCouncilDistricts) {
  if (!district.constituencyCoverage) {
    issues.push(
      'Official district ' + district.slug + ' lacks coverage metadata.',
    );
  }
}

const plains = COUNCIL_CONSTITUENCIES.find((item) => item.number === 12);
if (plains?.coverageKind !== 'citywide-indigenous') {
  issues.push(
    'Constituency 12 must be the citywide Plains Indigenous constituency.',
  );
}
if (plains?.adminDistrictIds.length !== 38) {
  issues.push(
    'Constituency 12 must list all 38 districts as its movement range.',
  );
}
if (!plains?.eligibilityNote?.includes('平地原住民')) {
  issues.push('Constituency 12 must explain Plains Indigenous eligibility.');
}

for (const number of [13, 14, 15]) {
  const mountain = COUNCIL_CONSTITUENCIES.find(
    (item) => item.number === number,
  );
  if (!mountain || mountain.coverageKind !== 'indigenous-eligible-districts') {
    issues.push(
      'Constituency ' +
        number +
        ' must be an eligible-district Mountain Indigenous constituency.',
    );
    continue;
  }
  if (!mountain.eligibilityNote?.includes('山地原住民')) {
    issues.push(
      'Constituency ' +
        number +
        ' must explain Mountain Indigenous eligibility.',
    );
  }
  if (!mountain.eligibilityNote?.includes('不是一般地理選區')) {
    issues.push(
      'Constituency ' +
        number +
        ' must distinguish eligibility from geography.',
    );
  }
}

const source = await readFile(
  path.join(process.cwd(), 'src/data/constituencies.ts'),
  'utf8',
);
for (const forbidden of ['fetch(', 'XMLHttpRequest', '/api/']) {
  if (source.includes(forbidden)) {
    issues.push(
      'Canonical coverage data must not contain runtime API access: ' +
        forbidden,
    );
  }
}

if (issues.length > 0) {
  console.error('Constituency coverage validation failed:');
  for (const issue of issues) console.error('- ' + issue);
  process.exitCode = 1;
} else {
  console.log(
    'Validated 15 council constituencies across 38 administrative districts.',
  );
}
