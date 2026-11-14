import type { CandidateProfile } from '../data';
import { coveragesForAdminDistrictId } from '../data/constituencies';

/** The fields that electoral relevance depends on, shared by public views. */
export type CandidateVisibilitySubject = Pick<
  CandidateProfile,
  'candidacy' | 'district'
>;

/**
 * Rendering visibility is deliberately separate from movement eligibility.
 *
 * The world has exactly three visibility states:
 * - citywide: the overview and every mayoral profile; mayors only.
 * - constituency: one electoral district plus the citywide mayors.
 * - admin-district: an administrative focus, which resolves to the district's
 *   one ordinary constituency and therefore shows exactly the same candidate
 *   set as that constituency focus. Indigenous eligibility coverage never
 *   leaks into an administrative focus.
 */
export type CandidateVisibilityScope =
  | { kind: 'citywide' }
  | { kind: 'admin-district'; adminDistrictIds: readonly string[] }
  | { kind: 'constituency'; districtSlug: string };

/**
 * Explicit citywide-overview policy. The old 'all' scope exposed every council
 * candidate in the city overview and must not be reintroduced for this view.
 */
export const CITYWIDE_OVERVIEW_VISIBILITY: CandidateVisibilityScope = {
  kind: 'citywide',
};

export function adminDistrictVisibilityScope(
  adminDistrictIds: readonly string[],
): CandidateVisibilityScope {
  return { kind: 'admin-district', adminDistrictIds: [...adminDistrictIds] };
}

export function constituencyVisibilityScope(
  districtSlug: string,
): CandidateVisibilityScope {
  return { kind: 'constituency', districtSlug };
}

export function isMayoralCandidate(
  candidate: CandidateVisibilitySubject,
): boolean {
  return candidate.candidacy.electionType === 'mayoral';
}

/**
 * Administrative districts do not carry their own candidate list: each one
 * belongs to exactly one ordinary electoral constituency. Resolving that
 * constituency (instead of testing the candidate's broad eligibility coverage)
 * is what keeps Indigenous candidates out of ordinary district focus.
 */
export function ordinaryConstituencySlugForAdminDistrict(
  adminDistrictId: string,
): string | null {
  const ordinary = coveragesForAdminDistrictId(adminDistrictId).find(
    (coverage) => coverage.kind === 'ordinary',
  );
  return ordinary?.slug ?? null;
}

export function isCandidateVisibleInAdminFocus(
  candidate: CandidateVisibilitySubject,
  focusedDistrictId: string,
): boolean {
  if (isMayoralCandidate(candidate)) return true;
  const constituencySlug =
    ordinaryConstituencySlugForAdminDistrict(focusedDistrictId);
  if (!constituencySlug) return false;
  return candidate.district.slug === constituencySlug;
}

/**
 * Constituency focus (the selected electoral district) keeps that
 * constituency's candidates plus citywide mayors. Indigenous constituencies are
 * selected explicitly through this path, never through administrative overlap.
 */
export function isCandidateVisibleInConstituencyFocus(
  candidate: CandidateVisibilitySubject,
  districtSlug: string,
): boolean {
  if (isMayoralCandidate(candidate)) return true;
  return candidate.district.slug === districtSlug;
}

export function isCandidateVisibleInFocus(
  candidate: CandidateVisibilitySubject,
  scope: CandidateVisibilityScope,
): boolean {
  if (scope.kind === 'citywide') return isMayoralCandidate(candidate);
  if (scope.kind === 'constituency') {
    return isCandidateVisibleInConstituencyFocus(candidate, scope.districtSlug);
  }
  if (scope.adminDistrictIds.length === 0) return false;
  return scope.adminDistrictIds.some((districtId) =>
    isCandidateVisibleInAdminFocus(candidate, districtId),
  );
}

export function visibleCandidatesForFocus<T extends CandidateVisibilitySubject>(
  candidates: readonly T[],
  scope: CandidateVisibilityScope,
): T[] {
  return candidates.filter((candidate) =>
    isCandidateVisibleInFocus(candidate, scope),
  );
}

/**
 * One authoritative translation from the UI focus to a visibility scope.
 * Candidate selection uses the candidate's own electoral district, never the
 * camera position or the previously focused administrative district.
 */
export type CandidateFocusRequest =
  | { kind: 'citywide' }
  | { kind: 'constituency'; districtSlug: string }
  | { kind: 'administrative'; adminDistrictId: string }
  | { kind: 'candidate'; candidate: CandidateVisibilitySubject };

export function visibilityScopeForFocus(
  request: CandidateFocusRequest,
): CandidateVisibilityScope {
  switch (request.kind) {
    case 'citywide':
      return CITYWIDE_OVERVIEW_VISIBILITY;
    case 'constituency':
      return constituencyVisibilityScope(request.districtSlug);
    case 'administrative':
      // Keep the administrative focus as its own scope so camera/HUD state stays
      // distinguishable; isCandidateVisibleInAdminFocus already resolves the
      // district's ordinary constituency, so the candidate set matches it.
      return adminDistrictVisibilityScope([request.adminDistrictId]);
    case 'candidate': {
      if (isMayoralCandidate(request.candidate)) {
        return CITYWIDE_OVERVIEW_VISIBILITY;
      }
      // Official council and Indigenous candidates always resolve through their
      // own electoral district. An unknown district still scopes to itself so
      // that selecting the candidate can never reveal an unrelated roster.
      return constituencyVisibilityScope(request.candidate.district.slug);
    }
    default:
      return CITYWIDE_OVERVIEW_VISIBILITY;
  }
}
