import type { CandidateProfile } from '../data';
import { coverageForDistrictSlug } from '../data/constituencies';

/** The fields that electoral relevance depends on, shared by public views. */
export type CandidateVisibilitySubject = Pick<
  CandidateProfile,
  'candidacy' | 'district'
>;

/**
 * Rendering visibility is deliberately separate from movement eligibility.
 * Every council candidate keeps their authoritative movement scope, while the
 * scene only presents candidates relevant to the district the visitor opened.
 */
export type CandidateVisibilityScope =
  | { kind: 'all' }
  | { kind: 'mayoral' }
  | { kind: 'admin-district'; adminDistrictIds: readonly string[] }
  | { kind: 'constituency'; districtSlug: string };

export const ALL_CANDIDATE_VISIBILITY: CandidateVisibilityScope = {
  kind: 'all',
};

export const MAYORAL_CANDIDATE_VISIBILITY: CandidateVisibilityScope = {
  kind: 'mayoral',
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

function isMayoral(candidate: CandidateVisibilitySubject): boolean {
  return candidate.candidacy.electionType === 'mayoral';
}

function coverageForCandidate(candidate: CandidateVisibilitySubject) {
  return coverageForDistrictSlug(candidate.district.slug);
}

/**
 * A focused administrative district keeps:
 * - every citywide mayoral candidate,
 * - ordinary council candidates whose official constituency includes it,
 * - Plains Indigenous candidates, whose constituency is citywide by identity,
 * - Mountain Indigenous candidates whose official residence coverage lists it.
 *
 * The indigenous checks use the existing coverage records and do not turn the
 * overlapping eligibility lists into an ordinary geographic partition.
 */
export function isCandidateVisibleInAdminFocus(
  candidate: CandidateVisibilitySubject,
  focusedDistrictId: string,
): boolean {
  if (isMayoral(candidate)) return true;
  const coverage = coverageForCandidate(candidate);
  if (!coverage) return false;
  if (coverage.kind === 'plains-indigenous') return true;
  return coverage.adminDistrictIds.includes(focusedDistrictId);
}

/**
 * Constituency focus (the selected electoral district) keeps that
 * constituency's candidates plus citywide mayors. This is the same scope that
 * the candidate tray shows for an electoral district.
 */
export function isCandidateVisibleInConstituencyFocus(
  candidate: CandidateVisibilitySubject,
  districtSlug: string,
): boolean {
  if (isMayoral(candidate)) return true;
  return candidate.district.slug === districtSlug;
}

export function isCandidateVisibleInFocus(
  candidate: CandidateVisibilitySubject,
  scope: CandidateVisibilityScope,
): boolean {
  if (scope.kind === 'all') return true;
  if (scope.kind === 'mayoral') return isMayoral(candidate);
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
