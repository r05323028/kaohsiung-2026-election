import type {
  BiographyClaim,
  BiographyEvidence,
  BiographyIdentityObservation,
  BiographySourceAttempt,
} from '../biographies/schema';

export const RELEASE_CLAIM_CATEGORIES = [
  'basic-biographical-fact',
  'current-position',
  'candidate-statement',
  'public-activity-record',
  'administrative-outcome',
  'ambiguous-or-unsupported',
] as const;
export type ReleaseClaimCategory = (typeof RELEASE_CLAIM_CATEGORIES)[number];

export type EditorialReleaseBatch = {
  schemaVersion: '1';
  snapshotDate: string;
  candidateIds: string[];
  selectedClaimIds: string[];
  groups: Array<{
    groupId: string;
    relationship: 'exact-duplicate' | 'possible-overlap' | 'candidate-review';
    claimIds: string[];
  }>;
  note: string;
};

export type ReleaseClaimAudit = {
  claimId: string;
  candidateId: string;
  category: ReleaseClaimCategory;
  classificationReason: string;
  claimType: BiographyClaim['claimType'];
  attribution: BiographyClaim['attribution'];
  sourceDependency: BiographyClaim['sourceDependency'];
  temporalPrecision: BiographyClaim['temporalPrecision'];
  temporalConfidence:
    | 'exact-or-partial-source-date'
    | 'unknown-but-statement-safe'
    | 'unknown-and-needs-review';
  currentness: 'not-applicable' | 'supported-context' | 'unresolved';
  sourceIds: string[];
  evidenceIds: string[];
  sourceTimestampQualities: BiographySourceAttempt['timestampQuality'][];
  sourceRetrievedAt: Array<string | null>;
  sourceAttemptedAt: string[];
  sourceVersionsCurrent: boolean;
  identityResolved: boolean;
  evidenceDirect: boolean;
  evidenceContradiction: boolean;
  reviewReadiness: 'ready-for-human-review' | 'deferred' | 'blocked';
  blockers: string[];
};

export type ReleaseConsolidationGroup = {
  groupId: string;
  relationship: 'exact-duplicate' | 'possible-overlap';
  candidateId: string;
  claimIds: string[];
  evidenceIds: string[];
  rationale: string;
};

export function normalizeReleaseText(value: string): string {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

function hasOutcomeLanguage(value: string): boolean {
  return /成果|完成|達成|通過|落實|促成|解決/u.test(value);
}

export function classifyReleaseClaim(
  claim: BiographyClaim,
  evidence: BiographyEvidence[],
  observations: BiographyIdentityObservation[],
  sources: BiographySourceAttempt[],
): ReleaseClaimAudit {
  const sourceRecords = claim.sourceIds
    .map((sourceId) => sources.find((source) => source.sourceId === sourceId))
    .filter((source): source is BiographySourceAttempt => Boolean(source));
  const linkedEvidence = claim.evidenceIds
    .map((evidenceId) =>
      evidence.find((item) => item.evidenceId === evidenceId),
    )
    .filter((item): item is BiographyEvidence => Boolean(item));
  const linkedObservations = claim.identityObservationIds
    .map((observationId) =>
      observations.find((item) => item.observationId === observationId),
    )
    .filter((item): item is BiographyIdentityObservation => Boolean(item));
  const sourceVersionsCurrent = sourceRecords.every((source) =>
    Boolean(source.rawPath && source.sha256),
  );
  const identityResolved =
    linkedObservations.length > 0 &&
    linkedObservations.every(
      (observation) => observation.identityStatus === 'resolved',
    );
  const evidenceDirect =
    linkedEvidence.length > 0 &&
    linkedEvidence.every((item) => item.supportType === 'direct');
  const evidenceContradiction = linkedEvidence.some(
    (item) => item.supportType === 'contradicts',
  );
  const statement =
    claim.attribution === 'candidate-statement' ||
    claim.sourceDependency === 'self-reported';
  let category: ReleaseClaimCategory;
  let classificationReason: string;
  if (statement) {
    category = 'candidate-statement';
    classificationReason =
      'The canonical claim or retained KCC excerpt identifies this as a candidate-authored statement; it is not an institutional outcome.';
  } else if (claim.claimType === 'current-position') {
    category = 'current-position';
    classificationReason =
      'The normalized claim is explicitly marked as a current public position and therefore requires currentness review.';
  } else if (hasOutcomeLanguage(`${claim.title} ${claim.value}`)) {
    category = 'administrative-outcome';
    classificationReason =
      'Outcome language requires independent evidence of an institutional result; participation alone is not treated as achievement.';
  } else if (
    claim.claimType === 'career-event' ||
    claim.claimType === 'elected-office'
  ) {
    category = 'public-activity-record';
    classificationReason =
      'The claim describes a public activity or office record and must not be expanded into an outcome.';
  } else if (
    claim.claimType === 'education' ||
    claim.claimType === 'historical-position' ||
    claim.claimType === 'historical-candidacy' ||
    claim.claimType === 'professional-experience'
  ) {
    category = 'basic-biographical-fact';
    classificationReason =
      'The retained source presents a historical education, position, candidacy, or professional-experience fact without an outcome assertion.';
  } else {
    category = 'ambiguous-or-unsupported';
    classificationReason =
      'No conservative release category matched this claim.';
  }

  const blockers: string[] = [];
  if (!identityResolved)
    blockers.push('Identity observation is not resolved for this candidate.');
  if (!evidenceDirect)
    blockers.push('Claim does not have direct linked evidence.');
  if (evidenceContradiction)
    blockers.push('Linked evidence contains a contradiction.');
  if (!sourceVersionsCurrent)
    blockers.push(
      'At least one supporting source has no current retained raw snapshot/checksum.',
    );
  if (category === 'current-position') {
    const hasCurrentAuthoritativeContext = sourceRecords.some(
      (source) =>
        source.sourceClass === 'kcc-member-profile' &&
        source.outcome === 'retrieved' &&
        Boolean(source.rawPath && source.sha256),
    );
    if (!hasCurrentAuthoritativeContext) {
      blockers.push(
        'Currentness lacks a current authoritative source context.',
      );
    } else if (
      sourceRecords.some(
        (source) => source.timestampQuality !== 'source-header',
      )
    ) {
      blockers.push(
        'Currentness needs human confirmation or a newer source version; the retained capture has no source publication/retrieval header.',
      );
    }
  }
  if (category === 'administrative-outcome')
    blockers.push(
      'Independent evidence of the institutional outcome is required.',
    );
  if (category === 'ambiguous-or-unsupported')
    blockers.push('Claim remains outside the low-ambiguity release queue.');

  const temporalConfidence =
    claim.temporalPrecision === 'unknown'
      ? category === 'basic-biographical-fact' &&
        claim.currentStatus === 'historical'
        ? 'unknown-but-statement-safe'
        : 'unknown-and-needs-review'
      : 'exact-or-partial-source-date';
  const currentness =
    category === 'current-position'
      ? blockers.some((blocker) => blocker.includes('Currentness'))
        ? 'unresolved'
        : 'supported-context'
      : 'not-applicable';
  const reviewReadiness =
    blockers.length === 0 ||
    (category === 'candidate-statement' &&
      blockers.every(
        (blocker) =>
          blocker.includes('candidate') || blocker.includes('outcome'),
      ))
      ? 'ready-for-human-review'
      : category === 'basic-biographical-fact' &&
          blockers.every((blocker) => blocker.includes('source publication'))
        ? 'deferred'
        : 'blocked';

  return {
    claimId: claim.claimId,
    candidateId: claim.candidateId,
    category,
    classificationReason,
    claimType: claim.claimType,
    attribution: claim.attribution,
    sourceDependency: claim.sourceDependency,
    temporalPrecision: claim.temporalPrecision,
    temporalConfidence,
    currentness,
    sourceIds: claim.sourceIds,
    evidenceIds: claim.evidenceIds,
    sourceTimestampQualities: sourceRecords.map(
      (source) => source.timestampQuality,
    ),
    sourceRetrievedAt: sourceRecords.map((source) => source.sourceRetrievedAt),
    sourceAttemptedAt: sourceRecords.map((source) => source.attemptedAt),
    sourceVersionsCurrent,
    identityResolved,
    evidenceDirect,
    evidenceContradiction,
    reviewReadiness,
    blockers,
  };
}

export function detectReleaseConsolidation(
  claims: BiographyClaim[],
  evidence: BiographyEvidence[],
): ReleaseConsolidationGroup[] {
  const groups: ReleaseConsolidationGroup[] = [];
  const exact = new Map<string, BiographyClaim[]>();
  for (const claim of claims) {
    const key = [
      claim.candidateId,
      claim.claimType,
      claim.attribution,
      normalizeReleaseText(claim.value),
    ].join('|');
    const bucket = exact.get(key) ?? [];
    bucket.push(claim);
    exact.set(key, bucket);
  }
  let groupCounter = 0;
  for (const bucket of exact.values()) {
    if (bucket.length < 2) continue;
    groupCounter += 1;
    groups.push({
      groupId: `release-group-${String(groupCounter).padStart(3, '0')}`,
      relationship: 'exact-duplicate',
      candidateId: bucket[0]?.candidateId ?? '',
      claimIds: bucket.map((claim) => claim.claimId),
      evidenceIds: bucket.flatMap((claim) => claim.evidenceIds),
      rationale:
        'Same candidate, claim type, attribution, and normalized claim text; retain each original record for claim-level review.',
    });
  }
  const byCandidate = new Map<string, BiographyClaim[]>();
  for (const claim of claims) {
    const bucket = byCandidate.get(claim.candidateId) ?? [];
    bucket.push(claim);
    byCandidate.set(claim.candidateId, bucket);
  }
  for (const bucket of byCandidate.values()) {
    for (let left = 0; left < bucket.length; left += 1) {
      const a = bucket[left];
      if (!a) continue;
      const aText = normalizeReleaseText(a.value);
      if (aText.length < 18) continue;
      for (let right = left + 1; right < bucket.length; right += 1) {
        const b = bucket[right];
        if (
          !b ||
          a.claimType !== b.claimType ||
          a.attribution !== b.attribution
        )
          continue;
        const bText = normalizeReleaseText(b.value);
        if (bText.length < 18 || aText === bText) continue;
        if (!aText.includes(bText) && !bText.includes(aText)) continue;
        groupCounter += 1;
        groups.push({
          groupId: `release-group-${String(groupCounter).padStart(3, '0')}`,
          relationship: 'possible-overlap',
          candidateId: a.candidateId,
          claimIds: [a.claimId, b.claimId],
          evidenceIds: [...a.evidenceIds, ...b.evidenceIds],
          rationale:
            'Same candidate/type/attribution with bounded normalized containment; a reviewer must decide whether the records are repeated wording or distinct facts.',
        });
      }
    }
  }
  return groups.map((group) => ({
    ...group,
    evidenceIds: [...new Set(group.evidenceIds)].filter((evidenceId) =>
      evidence.some((item) => item.evidenceId === evidenceId),
    ),
  }));
}
