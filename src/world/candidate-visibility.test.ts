import { describe, expect, it } from 'vitest';
import { candidateProfiles } from '../data';
import { COUNCIL_CONSTITUENCIES } from '../data/constituencies';
import type { CandidateVisibilityScope } from './candidate-visibility';
import {
  adminDistrictVisibilityScope,
  CITYWIDE_OVERVIEW_VISIBILITY,
  constituencyVisibilityScope,
  isCandidateVisibleInFocus,
  isMayoralCandidate,
  ordinaryConstituencySlugForAdminDistrict,
  visibilityScopeForFocus,
  visibleCandidatesForFocus,
} from './candidate-visibility';
import { ADMIN_DISTRICTS } from './geography';

const official = candidateProfiles.filter(
  (candidate) => !candidate.candidacy.isDemo,
);
const mayors = official.filter(isMayoralCandidate);
const mayorSlugs = new Set(mayors.map((candidate) => candidate.candidacy.slug));

function candidatesFor(slug: string) {
  return official.filter((candidate) => candidate.district.slug === slug);
}

function visibleSlugs(scope: CandidateVisibilityScope): string[] {
  return visibleCandidatesForFocus(official, scope)
    .map((candidate) => candidate.candidacy.slug)
    .sort();
}

function expectedSlugs(constituencySlug: string): string[] {
  return [
    ...mayorSlugs,
    ...candidatesFor(constituencySlug).map(
      (candidate) => candidate.candidacy.slug,
    ),
  ].sort();
}

describe('citywide overview visibility', () => {
  it('shows mayoral candidates only', () => {
    expect(mayors.length).toBeGreaterThan(0);
    const visible = visibleCandidatesForFocus(
      official,
      CITYWIDE_OVERVIEW_VISIBILITY,
    );
    expect(visible).toHaveLength(mayors.length);
    expect(visible.every(isMayoralCandidate)).toBe(true);
    expect(visibleSlugs(CITYWIDE_OVERVIEW_VISIBILITY)).toEqual(
      [...mayorSlugs].sort(),
    );

    for (const candidate of official.filter(
      (item) => !isMayoralCandidate(item),
    )) {
      expect(
        isCandidateVisibleInFocus(candidate, CITYWIDE_OVERVIEW_VISIBILITY),
      ).toBe(false);
    }
  });
});

describe('constituency focus visibility', () => {
  it('shows exactly that constituency plus the mayors for all 15 constituencies', () => {
    expect(COUNCIL_CONSTITUENCIES).toHaveLength(15);
    for (const coverage of COUNCIL_CONSTITUENCIES) {
      const own = candidatesFor(coverage.slug);
      expect(own.length, coverage.slug).toBeGreaterThan(0);
      const slugs = visibleSlugs(constituencyVisibilityScope(coverage.slug));
      expect(slugs, coverage.slug).toEqual(expectedSlugs(coverage.slug));
      for (const slug of slugs) {
        expect(
          mayorSlugs.has(slug) ||
            own.some((candidate) => candidate.candidacy.slug === slug),
          `${coverage.slug} leaked ${slug}`,
        ).toBe(true);
      }
    }
  });

  it('keeps indigenous candidates inside their own selected constituency', () => {
    const indigenous = official.filter((candidate) =>
      candidate.district.slug.includes('-indigenous-'),
    );
    expect(indigenous.length).toBeGreaterThan(0);
    for (const coverage of COUNCIL_CONSTITUENCIES.filter(
      (item) => item.kind !== 'ordinary',
    )) {
      const scope = constituencyVisibilityScope(coverage.slug);
      const own = candidatesFor(coverage.slug);
      expect(own.length).toBeGreaterThan(0);
      for (const candidate of indigenous) {
        const isOwn = candidate.district.slug === coverage.slug;
        expect(
          isCandidateVisibleInFocus(candidate, scope),
          `${candidate.candidacy.slug} under ${coverage.slug}`,
        ).toBe(isOwn);
      }
    }
  });
});

describe('administrative district focus visibility', () => {
  it('maps all 38 administrative districts to exactly one ordinary constituency', () => {
    expect(ADMIN_DISTRICTS).toHaveLength(38);
    for (const district of ADMIN_DISTRICTS) {
      const slug = ordinaryConstituencySlugForAdminDistrict(district.id);
      expect(slug, district.id).not.toBeNull();
      const coverage = COUNCIL_CONSTITUENCIES.find(
        (item) => item.slug === slug,
      );
      expect(coverage?.kind, district.id).toBe('ordinary');
      expect(coverage?.adminDistrictIds, district.id).toContain(district.id);
    }
  });

  it('shows mayors plus the district ordinary constituency only for all 38 districts', () => {
    for (const district of ADMIN_DISTRICTS) {
      const slug = ordinaryConstituencySlugForAdminDistrict(district.id)!;
      const visible = visibleCandidatesForFocus(
        official,
        adminDistrictVisibilityScope([district.id]),
      );
      expect(
        visible.map((candidate) => candidate.candidacy.slug).sort(),
        district.id,
      ).toEqual(expectedSlugs(slug));
      for (const candidate of visible) {
        if (isMayoralCandidate(candidate)) continue;
        expect(candidate.district.slug, district.id).toBe(slug);
      }
      for (const candidate of candidatesFor(slug)) {
        expect(
          isCandidateVisibleInFocus(
            candidate,
            adminDistrictVisibilityScope([district.id]),
          ),
        ).toBe(true);
      }
    }
  });

  it('never leaks indigenous candidates through administrative coverage', () => {
    const indigenous = official.filter((candidate) =>
      candidate.district.slug.includes('-indigenous-'),
    );
    expect(indigenous.length).toBeGreaterThan(0);
    for (const district of ADMIN_DISTRICTS) {
      const scope = adminDistrictVisibilityScope([district.id]);
      for (const candidate of indigenous) {
        expect(
          isCandidateVisibleInFocus(candidate, scope),
          `${candidate.candidacy.slug} in ${district.id}`,
        ).toBe(false);
      }
    }
  });

  it('matches the ordinary constituency set for every administrative district', () => {
    for (const district of ADMIN_DISTRICTS) {
      const slug = ordinaryConstituencySlugForAdminDistrict(district.id)!;
      expect(
        visibleSlugs(adminDistrictVisibilityScope([district.id])),
        district.id,
      ).toEqual(visibleSlugs(constituencyVisibilityScope(slug)));
    }
  });
});

describe('visibility scope resolution', () => {
  it('resolves the three UI focus modes explicitly', () => {
    expect(visibilityScopeForFocus({ kind: 'citywide' })).toEqual(
      CITYWIDE_OVERVIEW_VISIBILITY,
    );
    expect(
      visibilityScopeForFocus({
        kind: 'constituency',
        districtSlug: 'kaohsiung-council-04',
      }),
    ).toEqual(constituencyVisibilityScope('kaohsiung-council-04'));
    expect(
      visibilityScopeForFocus({
        kind: 'administrative',
        adminDistrictId: 'E03',
      }),
    ).toEqual(adminDistrictVisibilityScope(['E03']));
  });

  it('uses the candidate own electoral district and never reveals unrelated candidates', () => {
    for (const candidate of official) {
      const scope = visibilityScopeForFocus({ kind: 'candidate', candidate });
      const visible = visibleCandidatesForFocus(official, scope);
      expect(
        visible.some(
          (item) => item.candidacy.slug === candidate.candidacy.slug,
        ),
        candidate.candidacy.slug,
      ).toBe(true);

      if (isMayoralCandidate(candidate)) {
        expect(scope.kind).toBe('citywide');
        expect(visible.every(isMayoralCandidate)).toBe(true);
        continue;
      }

      expect(scope).toEqual(
        constituencyVisibilityScope(candidate.district.slug),
      );
      for (const item of visible) {
        if (isMayoralCandidate(item)) continue;
        expect(item.district.slug, candidate.candidacy.slug).toBe(
          candidate.district.slug,
        );
      }
    }
  });
});
