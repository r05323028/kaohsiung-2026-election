import {
  ADMIN_DISTRICT_BY_ID,
  ADMIN_DISTRICTS,
  type DistrictRecord,
} from '../world/geography';

export type CouncilConstituencyKind =
  | 'ordinary'
  | 'plains-indigenous'
  | 'mountain-indigenous';

export type CouncilCoverageKind =
  | 'geographic'
  | 'citywide-indigenous'
  | 'indigenous-eligible-districts';

export type CouncilConstituencyCoverage = {
  /** Official constituency number, 1-15. */
  number: number;
  /** Official electoral-district record ID used by the approved dataset. */
  districtId: string;
  /** Official electoral-district slug used by the static routes. */
  slug: string;
  kind: CouncilConstituencyKind;
  coverageKind: CouncilCoverageKind;
  /** Existing E01-E38 administrative district IDs. */
  adminDistrictIds: readonly string[];
  coverageLabel: string;
  eligibilityNote?: string;
  sourceIds: readonly string[];
};

const SOURCE_IDS = [
  'source-cec-central-63625',
  'source-cec-vote2026-prvCityDept',
] as const;

const ALL_ADMIN_IDS = ADMIN_DISTRICTS.map((district) => district.id);

const ORDINARY_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;
const MOUNTAIN_NUMBERS = [13, 14, 15] as const;

const PLAINS_ELIGIBILITY_NOTE =
  '第12選舉區為全市平地原住民選舉區，依原住民族身分與選舉資格認定，不以行政區邊界界定；地圖列出的 38 個行政區僅作互動移動範圍，不代表地理選區。';

function mountainEligibilityNote(number: number): string {
  return `第${number}選舉區為山地原住民選舉區，依原住民族身分與設籍資格認定；下列行政區是中央選舉委員會公告的設籍範圍，不是一般地理選區，也不與其他選舉區形成互斥分區。`;
}

function districtIdFor(number: number, kind: CouncilConstituencyKind): string {
  const padded = String(number).padStart(2, '0');
  if (kind === 'ordinary') return `district-kaohsiung-council-${padded}`;
  if (kind === 'plains-indigenous') {
    return 'district-kaohsiung-indigenous-flat-12';
  }
  return `district-kaohsiung-indigenous-mountain-${padded}`;
}

function slugFor(number: number, kind: CouncilConstituencyKind): string {
  const padded = String(number).padStart(2, '0');
  if (kind === 'ordinary') return `kaohsiung-council-${padded}`;
  if (kind === 'plains-indigenous') return 'kaohsiung-indigenous-flat-12';
  return `kaohsiung-indigenous-mountain-${padded}`;
}

function coverage(
  number: number,
  kind: CouncilConstituencyKind,
  adminDistrictIds: readonly string[],
  eligibilityNote?: string,
): CouncilConstituencyCoverage {
  return {
    number,
    districtId: districtIdFor(number, kind),
    slug: slugFor(number, kind),
    kind,
    coverageKind:
      kind === 'ordinary'
        ? 'geographic'
        : kind === 'plains-indigenous'
          ? 'citywide-indigenous'
          : 'indigenous-eligible-districts',
    adminDistrictIds,
    coverageLabel:
      kind === 'ordinary'
        ? '地理選區'
        : kind === 'plains-indigenous'
          ? '平地原住民選舉區'
          : '山地原住民選舉區',
    ...(eligibilityNote ? { eligibilityNote } : {}),
    sourceIds: SOURCE_IDS,
  };
}

/**
 * Canonical 2026 高雄市議員 constituency-to-administrative-district coverage.
 *
 * Source: 中央選舉委員會 115年公告 (source-cec-central-63625) and the
 * 2026-election constituency reference snapshot (source-cec-vote2026-prvCityDept).
 * The first eleven constituencies partition the 38 administrative districts.
 * Constituency 12 is a citywide Plains Indigenous constituency, not a
 * geographic district. Constituencies 13-15 are Mountain Indigenous
 * constituencies whose listed districts are eligibility/residence coverage;
 * they overlap the ordinary layer rather than forming a second partition of it.
 */
export const COUNCIL_CONSTITUENCIES: readonly CouncilConstituencyCoverage[] = [
  // Arrays follow the CEC announcement order so summaries and the deterministic
  // world simulation keep a stable, source-faithful ordering. Membership, not
  // order, defines coverage. Constituency 4 keeps the conventional
  // 左營、楠梓 presentation order used by the interface.
  coverage(1, 'ordinary', [
    'E37',
    'E38',
    'E33',
    'E32',
    'E34',
    'E35',
    'E30',
    'E31',
    'E36',
  ]),
  coverage(2, 'ordinary', ['E26', 'E25', 'E24', 'E23', 'E22']),
  coverage(3, 'ordinary', ['E27', 'E19', 'E21', 'E28', 'E29', 'E20']),
  coverage(4, 'ordinary', ['E03', 'E04']), // 左營、楠梓 (source lists 楠梓、左營)
  coverage(5, 'ordinary', ['E16', 'E17', 'E18', 'E15']),
  coverage(6, 'ordinary', ['E02', 'E01', 'E10']),
  coverage(7, 'ordinary', ['E05']),
  coverage(8, 'ordinary', ['E07', 'E06', 'E08']),
  coverage(9, 'ordinary', ['E12']),
  coverage(10, 'ordinary', ['E09', 'E11']),
  coverage(11, 'ordinary', ['E14', 'E13']),
  coverage(12, 'plains-indigenous', ALL_ADMIN_IDS, PLAINS_ELIGIBILITY_NOTE),
  coverage(
    13,
    'mountain-indigenous',
    [
      'E38',
      'E33',
      'E34',
      'E35',
      'E30',
      'E26',
      'E25',
      'E24',
      'E27',
      'E28',
      'E29',
      'E04',
      'E03',
      'E05',
    ],
    mountainEligibilityNote(13),
  ),
  coverage(
    14,
    'mountain-indigenous',
    [
      'E37',
      'E32',
      'E31',
      'E23',
      'E22',
      'E19',
      'E21',
      'E20',
      'E02',
      'E01',
      'E07',
      'E06',
    ],
    mountainEligibilityNote(14),
  ),
  coverage(
    15,
    'mountain-indigenous',
    [
      'E36',
      'E16',
      'E15',
      'E17',
      'E18',
      'E12',
      'E14',
      'E10',
      'E08',
      'E09',
      'E11',
      'E13',
    ],
    mountainEligibilityNote(15),
  ),
];

export const COUNCIL_CONSTITUENCY_BY_NUMBER = new Map(
  COUNCIL_CONSTITUENCIES.map((item) => [item.number, item]),
);
export const COUNCIL_CONSTITUENCY_BY_DISTRICT_ID = new Map(
  COUNCIL_CONSTITUENCIES.map((item) => [item.districtId, item]),
);
export const COUNCIL_CONSTITUENCY_BY_SLUG = new Map(
  COUNCIL_CONSTITUENCIES.map((item) => [item.slug, item]),
);

export function coverageForDistrictSlug(
  slug: string,
): CouncilConstituencyCoverage | undefined {
  return COUNCIL_CONSTITUENCY_BY_SLUG.get(slug);
}

/** All constituency layers that include an administrative district. */
export function coveragesForAdminDistrictId(
  id: string,
): CouncilConstituencyCoverage[] {
  return COUNCIL_CONSTITUENCIES.filter((item) =>
    item.adminDistrictIds.includes(id),
  );
}

export function adminDistrictsForCoverage(
  coverageItem: CouncilConstituencyCoverage,
): DistrictRecord[] {
  return coverageItem.adminDistrictIds.map((id) => {
    const district = ADMIN_DISTRICT_BY_ID.get(id);
    if (!district) {
      throw new Error(
        `Constituency ${coverageItem.number} references unknown administrative district ${id}.`,
      );
    }
    return district;
  });
}

export function adminDistrictNamesForCoverage(
  coverageItem: CouncilConstituencyCoverage,
): string[] {
  return adminDistrictsForCoverage(coverageItem).map(
    (district) => district.name,
  );
}

export function coverageTypeLabel(kind: CouncilConstituencyKind): string {
  if (kind === 'ordinary') return '地理選區';
  if (kind === 'plains-indigenous') return '平地原住民選舉區';
  return '山地原住民選舉區';
}

export function coverageSummary(
  coverageItem: CouncilConstituencyCoverage,
): string {
  const names = adminDistrictNamesForCoverage(coverageItem);
  if (coverageItem.coverageKind === 'citywide-indigenous') {
    return '全市 38 個行政區（互動移動範圍）';
  }
  if (coverageItem.coverageKind === 'indigenous-eligible-districts') {
    return `設籍範圍 ${names.length} 個行政區：${names.join('、')}`;
  }
  return `涵蓋 ${names.length} 個行政區：${names.join('、')}`;
}

export function coverageCompactSummary(
  coverageItem: CouncilConstituencyCoverage,
): string {
  if (coverageItem.coverageKind === 'citywide-indigenous') {
    return '平地原住民・全市 38 區';
  }
  const names = adminDistrictNamesForCoverage(coverageItem);
  if (coverageItem.coverageKind === 'indigenous-eligible-districts') {
    return `山地原住民・${names.length} 個行政區`;
  }
  return `地理選區・${names.join('、')}`;
}

function duplicateIds(ids: readonly string[]): string[] {
  return ids.filter((id, index) => ids.indexOf(id) !== index);
}

function checkPartition(
  items: CouncilConstituencyCoverage[],
  label: string,
  issues: string[],
): void {
  const ids = items.flatMap((item) => [...item.adminDistrictIds]);
  const unique = new Set(ids);
  if (ids.length !== 38) {
    issues.push(
      `${label} must cover exactly 38 district entries; found ${ids.length}.`,
    );
  }
  if (unique.size !== 38) {
    issues.push(
      `${label} must cover all 38 unique districts; found ${unique.size}.`,
    );
  }
  const duplicates = duplicateIds(ids);
  if (duplicates.length > 0) {
    issues.push(`${label} overlaps on ${[...new Set(duplicates)].join(', ')}.`);
  }
}

export function validateConstituencyCoverage(): string[] {
  const issues: string[] = [];
  if (COUNCIL_CONSTITUENCIES.length !== 15) {
    issues.push(
      `Expected 15 council constituencies; found ${COUNCIL_CONSTITUENCIES.length}.`,
    );
  }

  const numbers = new Set<number>();
  const districtIds = new Set<string>();
  const slugs = new Set<string>();

  for (const item of COUNCIL_CONSTITUENCIES) {
    if (numbers.has(item.number)) {
      issues.push(`Duplicate constituency number ${item.number}.`);
    }
    numbers.add(item.number);
    if (districtIds.has(item.districtId)) {
      issues.push(`Duplicate constituency districtId ${item.districtId}.`);
    }
    districtIds.add(item.districtId);
    if (slugs.has(item.slug)) {
      issues.push(`Duplicate constituency slug ${item.slug}.`);
    }
    slugs.add(item.slug);

    if (item.number < 1 || item.number > 15) {
      issues.push(`Constituency number out of range: ${item.number}.`);
    }
    if (item.districtId !== districtIdFor(item.number, item.kind)) {
      issues.push(
        `Constituency ${item.number} has unexpected districtId ${item.districtId}.`,
      );
    }
    if (item.slug !== slugFor(item.number, item.kind)) {
      issues.push(
        `Constituency ${item.number} has unexpected slug ${item.slug}.`,
      );
    }
    if (item.sourceIds.length === 0) {
      issues.push(`Constituency ${item.number} has no source IDs.`);
    }
    if (item.adminDistrictIds.length === 0) {
      issues.push(
        `Constituency ${item.number} has no administrative districts.`,
      );
    }
    const repeated = duplicateIds(item.adminDistrictIds);
    if (repeated.length > 0) {
      issues.push(
        `Constituency ${item.number} repeats ${[...new Set(repeated)].join(', ')}.`,
      );
    }
    for (const id of item.adminDistrictIds) {
      if (!ADMIN_DISTRICT_BY_ID.has(id)) {
        issues.push(
          `Constituency ${item.number} references unknown administrative district ${id}.`,
        );
      }
    }

    if (item.kind === 'ordinary') {
      if (item.coverageKind !== 'geographic') {
        issues.push(`Ordinary constituency ${item.number} must be geographic.`);
      }
      if (!ORDINARY_NUMBERS.includes(item.number as 1)) {
        issues.push(
          `Ordinary constituency ${item.number} must be within 1-11.`,
        );
      }
    } else if (item.kind === 'plains-indigenous') {
      if (item.number !== 12 || item.coverageKind !== 'citywide-indigenous') {
        issues.push(
          `Plains Indigenous constituency must be number 12 and citywide.`,
        );
      }
      if (!item.eligibilityNote?.includes('平地原住民')) {
        issues.push(
          `Plains Indigenous constituency ${item.number} must explain its eligibility.`,
        );
      }
    } else {
      if (
        !MOUNTAIN_NUMBERS.includes(item.number as 13) ||
        item.coverageKind !== 'indigenous-eligible-districts'
      ) {
        issues.push(
          `Mountain Indigenous constituency ${item.number} must be 13-15 with eligible districts.`,
        );
      }
      if (!item.eligibilityNote?.includes('山地原住民')) {
        issues.push(
          `Mountain Indigenous constituency ${item.number} must explain its eligibility.`,
        );
      }
    }
  }

  const ordinary = COUNCIL_CONSTITUENCIES.filter(
    (item) => item.kind === 'ordinary',
  );
  checkPartition(ordinary, 'Ordinary constituencies 1-11', issues);
  const plains = COUNCIL_CONSTITUENCIES.find(
    (item) => item.kind === 'plains-indigenous',
  );
  if (plains?.adminDistrictIds.length !== 38) {
    issues.push(
      'Plains Indigenous constituency 12 must list all 38 districts.',
    );
  }
  const mountain = COUNCIL_CONSTITUENCIES.filter(
    (item) => item.kind === 'mountain-indigenous',
  );
  checkPartition(mountain, 'Mountain Indigenous constituencies 13-15', issues);

  const fourth = COUNCIL_CONSTITUENCY_BY_NUMBER.get(4);
  const fourthIds = fourth?.adminDistrictIds ?? [];
  if (
    fourthIds.length !== 2 ||
    !fourthIds.includes('E03') ||
    !fourthIds.includes('E04')
  ) {
    issues.push(
      'Constituency 4 must contain exactly E03 (左營) and E04 (楠梓).',
    );
  }

  return issues;
}
