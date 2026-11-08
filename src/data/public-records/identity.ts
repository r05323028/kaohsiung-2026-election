export type IdentityCandidate = {
  candidateId: string;
  personId: string;
  displayName: string;
  districtId: string;
  electionType: 'mayoral' | 'city-council' | 'indigenous-council';
  currentPosition: string;
  organization?: string;
  sourceIdentifiers?: readonly string[];
};

export type IdentityObservation = {
  observedName: string;
  canonicalCandidateId?: string;
  canonicalPersonId?: string;
  districtId?: string;
  office?: string;
  organization?: string;
  sourceIdentifier?: string;
};

export type IdentityResolutionResult = {
  status: 'resolved' | 'ambiguous' | 'unresolved';
  candidateId: string | null;
  personId: string | null;
  confidence: number;
  matchBasis: string[];
  candidateIds: string[];
};

function normalize(value: string): string {
  return value.replace(/\s+/g, '').toLocaleLowerCase();
}

function officeMatches(
  candidate: IdentityCandidate,
  observation: IdentityObservation,
): boolean {
  if (!observation.office) return false;
  return normalize(candidate.currentPosition).includes(
    normalize(observation.office),
  );
}

function organizationMatches(
  candidate: IdentityCandidate,
  observation: IdentityObservation,
): boolean {
  if (!observation.organization) return false;
  return normalize(candidate.organization ?? '').includes(
    normalize(observation.organization),
  );
}

export function resolveCandidateIdentity(
  observation: IdentityObservation,
  candidates: readonly IdentityCandidate[],
): IdentityResolutionResult {
  if (observation.canonicalCandidateId) {
    const candidate = candidates.find(
      (item) => item.candidateId === observation.canonicalCandidateId,
    );
    if (candidate) {
      return {
        status: 'resolved',
        candidateId: candidate.candidateId,
        personId: candidate.personId,
        confidence: 1,
        matchBasis: ['canonical-candidate-id'],
        candidateIds: [candidate.candidateId],
      };
    }
  }
  if (observation.canonicalPersonId) {
    const candidate = candidates.find(
      (item) => item.personId === observation.canonicalPersonId,
    );
    if (candidate) {
      return {
        status: 'resolved',
        candidateId: candidate.candidateId,
        personId: candidate.personId,
        confidence: 1,
        matchBasis: ['canonical-person-id'],
        candidateIds: [candidate.candidateId],
      };
    }
  }
  const nameMatches = candidates.filter(
    (candidate) =>
      normalize(candidate.displayName) === normalize(observation.observedName),
  );
  if (nameMatches.length === 0)
    return {
      status: 'unresolved',
      candidateId: null,
      personId: null,
      confidence: 0,
      matchBasis: [],
      candidateIds: [],
    };
  const scored = nameMatches
    .map((candidate) => {
      const matchBasis = ['exact-observed-name'];
      let score = 0;
      if (
        observation.districtId &&
        observation.districtId === candidate.districtId
      ) {
        score += 3;
        matchBasis.push('constituency');
      }
      if (officeMatches(candidate, observation)) {
        score += 2;
        matchBasis.push('office');
      }
      if (organizationMatches(candidate, observation)) {
        score += 2;
        matchBasis.push('organization');
      }
      if (
        observation.sourceIdentifier &&
        candidate.sourceIdentifiers?.includes(observation.sourceIdentifier)
      ) {
        score += 4;
        matchBasis.push('source-identifier');
      }
      return { candidate, score, matchBasis };
    })
    .sort((left, right) => right.score - left.score);
  const first = scored[0];
  const second = scored[1];
  if (!first || first.score === 0 || (second && first.score === second.score))
    return {
      status: 'ambiguous',
      candidateId: null,
      personId: null,
      confidence: 0,
      matchBasis: first?.matchBasis ?? ['exact-observed-name'],
      candidateIds: scored.map((item) => item.candidate.candidateId),
    };
  return {
    status: 'resolved',
    candidateId: first.candidate.candidateId,
    personId: first.candidate.personId,
    confidence: Math.min(0.99, 0.5 + first.score / 10),
    matchBasis: first.matchBasis,
    candidateIds: [first.candidate.candidateId],
  };
}
