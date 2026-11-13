import { describe, expect, it } from 'vitest';
import { candidateProfiles } from '../data';
import { COUNCIL_CONSTITUENCIES } from '../data/constituencies';
import {
  ALL_CANDIDATE_VISIBILITY,
  adminDistrictVisibilityScope,
  constituencyVisibilityScope,
  isCandidateVisibleInFocus,
  MAYORAL_CANDIDATE_VISIBILITY,
  visibleCandidatesForFocus,
} from './candidate-visibility';
import { ADMIN_DISTRICTS } from './geography';

const official = candidateProfiles.filter(
  (candidate) => !candidate.candidacy.isDemo,
);

function candidatesFor(slug: string) {
  return official.filter((candidate) => candidate.district.slug === slug);
}

describe('candidate visibility', () => {
  it('keeps every official candidate visible in the all-candidate scope', () => {
    expect(
      visibleCandidatesForFocus(official, ALL_CANDIDATE_VISIBILITY),
    ).toHaveLength(official.length);
  });

  it('shows only mayors in the city overview scope', () => {
    const visible = visibleCandidatesForFocus(
      official,
      MAYORAL_CANDIDATE_VISIBILITY,
    );
    expect(visible).toHaveLength(
      official.filter(
        (candidate) => candidate.candidacy.electionType === 'mayoral',
      ).length,
    );
    expect(
      visible.every(
        (candidate) => candidate.candidacy.electionType === 'mayoral',
      ),
    ).toBe(true);
    expect(
      official
        .filter((candidate) => candidate.candidacy.electionType !== 'mayoral')
        .every((candidate) =>
          isCandidateVisibleInFocus(candidate, MAYORAL_CANDIDATE_VISIBILITY),
        ),
    ).toBe(false);
  });

  it('keeps the mayors and the fourth constituency in Zuoying focus', () => {
    const visible = visibleCandidatesForFocus(
      official,
      adminDistrictVisibilityScope(['E03']),
    );
    const council04 = candidatesFor('kaohsiung-council-04');
    expect(visible).toEqual(
      expect.arrayContaining([
        ...candidatesFor('kaohsiung-mayor-2026'),
        ...council04,
      ]),
    );
    expect(council04.length).toBeGreaterThan(0);
    expect(
      visible.some(
        (candidate) =>
          candidate.candidacy.electionType === 'city-council' &&
          candidate.district.slug === 'kaohsiung-council-01',
      ),
    ).toBe(false);
    expect(
      visible.some(
        (candidate) => candidate.district.slug === 'kaohsiung-council-05',
      ),
    ).toBe(false);
  });

  it('hides every council candidate outside the focused ordinary constituency for all 38 districts', () => {
    for (const district of ADMIN_DISTRICTS) {
      const visible = visibleCandidatesForFocus(
        official,
        adminDistrictVisibilityScope([district.id]),
      );
      const allowedOrdinary = new Set(
        COUNCIL_CONSTITUENCIES.filter(
          (coverage) =>
            coverage.kind === 'ordinary' &&
            coverage.adminDistrictIds.includes(district.id),
        ).map((coverage) => coverage.slug),
      );
      for (const candidate of visible) {
        if (candidate.candidacy.electionType === 'mayoral') continue;
        const coverage = COUNCIL_CONSTITUENCIES.find(
          (item) => item.slug === candidate.district.slug,
        );
        expect(coverage).toBeDefined();
        if (coverage?.kind === 'ordinary') {
          expect(allowedOrdinary.has(candidate.district.slug)).toBe(true);
        }
      }
      expect(visible.length).toBeGreaterThan(0);
    }
  });

  it('applies the authoritative indigenous coverage instead of a geographic guess', () => {
    const plainsSlug = 'kaohsiung-indigenous-flat-12';
    const mountainSlug = 'kaohsiung-indigenous-mountain-13';
    const plains = candidatesFor(plainsSlug);
    const mountain = candidatesFor(mountainSlug);
    expect(plains.length).toBeGreaterThan(0);
    expect(mountain.length).toBeGreaterThan(0);

    for (const district of ADMIN_DISTRICTS) {
      const scope = adminDistrictVisibilityScope([district.id]);
      for (const candidate of plains) {
        expect(isCandidateVisibleInFocus(candidate, scope)).toBe(true);
      }
      const mountainCoverage = COUNCIL_CONSTITUENCIES.find(
        (coverage) => coverage.slug === mountainSlug,
      );
      const mountainRelevant = mountainCoverage?.adminDistrictIds.includes(
        district.id,
      );
      for (const candidate of mountain) {
        expect(isCandidateVisibleInFocus(candidate, scope)).toBe(
          Boolean(mountainRelevant),
        );
      }
    }
  });

  it('scopes an electoral-district focus to that constituency and the mayors', () => {
    const visible = visibleCandidatesForFocus(
      official,
      constituencyVisibilityScope('kaohsiung-council-04'),
    );
    expect(
      visible.every(
        (candidate) =>
          candidate.candidacy.electionType === 'mayoral' ||
          candidate.district.slug === 'kaohsiung-council-04',
      ),
    ).toBe(true);
    expect(
      new Set(visible.map((candidate) => candidate.district.slug)),
    ).toEqual(new Set(['kaohsiung-mayor-2026', 'kaohsiung-council-04']));
  });
});
