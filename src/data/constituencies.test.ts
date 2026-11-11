import { describe, expect, it } from 'vitest';
import manifestInput from '../../data/official-source-manifest.json';
import { ADMIN_DISTRICT_BY_ID, ADMIN_DISTRICTS } from '../world/geography';
import {
  adminDistrictNamesForCoverage,
  adminDistrictsForCoverage,
  COUNCIL_CONSTITUENCIES,
  COUNCIL_CONSTITUENCY_BY_NUMBER,
  coverageCompactSummary,
  coverageForDistrictSlug,
  coverageSummary,
  coveragesForAdminDistrictId,
  validateConstituencyCoverage,
} from './constituencies';

function requiredCoverage(number: number) {
  const coverage = COUNCIL_CONSTITUENCY_BY_NUMBER.get(number);
  if (!coverage) {
    throw new Error(`Constituency ${number} is missing.`);
  }
  return coverage;
}

describe('council constituency coverage', () => {
  it('validates all 15 constituencies without issues', () => {
    expect(validateConstituencyCoverage()).toEqual([]);
    expect(COUNCIL_CONSTITUENCIES).toHaveLength(15);
  });

  it('maps constituency 4 to Zuoying and Nanzih', () => {
    const fourth = requiredCoverage(4);
    expect(adminDistrictNamesForCoverage(fourth)).toEqual(['左營區', '楠梓區']);
    expect(coverageForDistrictSlug('kaohsiung-council-04')).toBe(fourth);
  });

  it('uses existing administrative district identifiers only', () => {
    expect(ADMIN_DISTRICTS).toHaveLength(38);
    const ids = new Set(ADMIN_DISTRICTS.map((district) => district.id));
    for (const item of COUNCIL_CONSTITUENCIES) {
      for (const id of item.adminDistrictIds) {
        expect(ids.has(id)).toBe(true);
        expect(ADMIN_DISTRICT_BY_ID.get(id)?.name).toBeTruthy();
      }
      const districts = adminDistrictsForCoverage(item);
      expect(districts).toHaveLength(item.adminDistrictIds.length);
    }
  });

  it('keeps ordinary constituencies a 38-district partition', () => {
    const ordinary = COUNCIL_CONSTITUENCIES.filter(
      (item) => item.kind === 'ordinary',
    );
    expect(ordinary).toHaveLength(11);
    const ids = ordinary.flatMap((item) => [...item.adminDistrictIds]);
    expect(ids).toHaveLength(38);
    expect(new Set(ids).size).toBe(38);
  });

  it('keeps indigenous coverage distinct from ordinary geography', () => {
    const plains = requiredCoverage(12);
    expect(plains.coverageKind).toBe('citywide-indigenous');
    expect(plains.adminDistrictIds).toHaveLength(38);
    expect(plains.eligibilityNote).toContain('平地原住民');
    expect(coverageSummary(plains)).toContain('全市 38 個行政區');
    expect(coverageCompactSummary(plains)).toContain('平地原住民');

    const mountain = COUNCIL_CONSTITUENCIES.filter(
      (item) => item.kind === 'mountain-indigenous',
    );
    expect(mountain.map((item) => item.number)).toEqual([13, 14, 15]);
    for (const item of mountain) {
      expect(item.coverageKind).toBe('indigenous-eligible-districts');
      expect(item.eligibilityNote).toContain('山地原住民');
      expect(item.eligibilityNote).toContain('不是一般地理選區');
      expect(adminDistrictNamesForCoverage(item).length).toBeGreaterThan(0);
    }
  });

  it('returns every overlapping indigenous layer for an administrative district', () => {
    const layers = coveragesForAdminDistrictId('E03');
    expect(layers.map((item) => item.number)).toEqual([4, 12, 13]);
    expect(coverageForDistrictSlug('kaohsiung-indigenous-flat-12')).toBe(
      COUNCIL_CONSTITUENCY_BY_NUMBER.get(12),
    );
    expect(coverageForDistrictSlug('kaohsiung-indigenous-mountain-15')).toBe(
      COUNCIL_CONSTITUENCY_BY_NUMBER.get(15),
    );
  });

  it('uses source IDs that exist in the official manifest', () => {
    const sourceIds = new Set(
      (manifestInput as { sources: { id: string }[] }).sources.map(
        (source) => source.id,
      ),
    );
    for (const item of COUNCIL_CONSTITUENCIES) {
      expect(item.sourceIds.length).toBeGreaterThan(0);
      for (const id of item.sourceIds) expect(sourceIds.has(id)).toBe(true);
    }
  });
});
