import { describe, expect, it } from 'vitest';
import releaseBatch from '../../../data/editorial/release/2026/biography-release-batch.json';
import normalizedInput from '../../../data/normalized/2026/biographies.json';
import pilotSummary from '../../../reports/editorial-pilot-summary.json';
import releaseReadiness from '../../../reports/editorial-release-readiness.json';
import type {
  BiographyClaim,
  BiographyEvidence,
  BiographyIdentityObservation,
  BiographySourceAttempt,
} from '../biographies/schema';
import { validateBiographyDataset } from '../biographies/schema';
import {
  classifyReleaseClaim,
  detectReleaseConsolidation,
  normalizeReleaseText,
} from './release';

const source = {
  attemptId: 'attempt-release-fixture',
  sourceId: 'source-release-fixture',
  sourceClass: 'government-record',
  method: 'GET',
  url: 'https://fixture.example/release',
  query: null,
  attemptedAt: '2026-11-06T10:00:00.000Z',
  outcome: 'retrieved',
  httpStatus: 200,
  contentType: 'text/html',
  rawPath: 'tests/fixtures/release.html',
  sha256: 'a'.repeat(64),
  byteLength: 100,
  excerpt: 'Fictional source.',
  failureReason: null,
  timestampQuality: 'source-header',
  sourceRetrievedAt: '2026-11-06T10:00:00.000Z',
  isNegativeEvidence: false,
} satisfies BiographySourceAttempt;

const observation = {
  observationId: 'observation-release-fixture',
  sourceId: source.sourceId,
  sourceAttemptId: source.attemptId,
  externalIdentifier: 'release-fixture-001',
  observedName: '虛構候選人',
  observedParty: '虛構政黨',
  observedDistrict: '虛構選區',
  observedJurisdiction: '虛構市',
  candidateIds: ['candidate-release-fixture'],
  identityStatus: 'resolved',
  matchBasis: ['fictional stable identifier'],
  rationale: 'Fixture identity uses a stable source identifier.',
  isNameOnlyMatch: false,
  excerpt: 'Fictional identity.',
} satisfies BiographyIdentityObservation;

function makeClaim(overrides: Partial<BiographyClaim> = {}): BiographyClaim {
  return {
    claimId: 'claim-release-fixture',
    candidateId: 'candidate-release-fixture',
    personId: 'person-release-fixture',
    claimType: 'historical-position',
    title: '公共職務經歷',
    organization: '虛構市政府',
    value: '曾任虛構市政府顧問',
    validFrom: null,
    validTo: null,
    temporalPrecision: 'unknown',
    currentStatus: 'historical',
    attribution: 'institutional-record',
    sourceDependency: 'source-backed',
    sourceIds: [source.sourceId],
    evidenceIds: ['evidence-release-fixture'],
    identityObservationIds: [observation.observationId],
    machineStatus: 'machine-validated',
    humanReviewStatus: 'not-reviewed',
    editorialStatus: 'not-reviewed',
    publicationStatus: 'withheld-pending-review',
    reviewerId: null,
    reviewedAt: null,
    ...overrides,
  };
}

function makeEvidence(
  excerpt = '曾任虛構市政府顧問',
  evidenceId = 'evidence-release-fixture',
): BiographyEvidence {
  return {
    evidenceId,
    claimId: 'claim-release-fixture',
    sourceId: source.sourceId,
    sourceAttemptId: source.attemptId,
    documentLocation: 'fixture.html#biography',
    excerpt,
    supportType: 'direct',
    attribution: 'institutional-record',
    verificationStatus: 'source-retrieved',
  };
}

describe('release claim audit helpers', () => {
  it('uses canonical attribution instead of shared navigation text', () => {
    const institutional = makeClaim({
      claimId: 'institutional-navigation',
      value: '高雄市議會本屆議員名錄列載',
      claimType: 'current-position',
      currentStatus: 'current',
    });
    const statement = makeClaim({
      claimId: 'candidate-statement',
      attribution: 'candidate-statement',
      sourceDependency: 'self-reported',
    });
    const navigationEvidence = makeEvidence(
      '學經歷與政見 當屆議事資料 歷屆議事資料',
      'evidence-navigation',
    );
    expect(
      classifyReleaseClaim(
        institutional,
        [navigationEvidence],
        [observation],
        [source],
      ).category,
    ).toBe('current-position');
    expect(
      classifyReleaseClaim(
        statement,
        [navigationEvidence],
        [observation],
        [source],
      ).category,
    ).toBe('candidate-statement');
  });

  it('blocks stale currentness and preserves unknown historical dates', () => {
    const staleSource = {
      ...source,
      timestampQuality: 'capture-file-mtime',
      sourceRetrievedAt: null,
    } satisfies BiographySourceAttempt;
    const current = makeClaim({
      claimId: 'current-stale',
      claimType: 'current-position',
      currentStatus: 'current',
    });
    const audit = classifyReleaseClaim(
      current,
      [makeEvidence()],
      [observation],
      [{ ...staleSource, sourceClass: 'kcc-member-profile' }],
    );
    expect(audit.category).toBe('current-position');
    expect(audit.reviewReadiness).toBe('blocked');
    expect(audit.currentness).toBe('unresolved');
    expect(audit.temporalConfidence).toBe('unknown-and-needs-review');
    expect(audit.blockers.join(' ')).toContain(
      'Currentness needs human confirmation',
    );

    const historical = classifyReleaseClaim(
      makeClaim({ claimId: 'historical-safe' }),
      [makeEvidence()],
      [observation],
      [source],
    );
    expect(historical.temporalConfidence).toBe('unknown-but-statement-safe');
  });

  it('detects duplicates and containment overlaps without collapsing claims', () => {
    const exactA = makeClaim({
      claimId: 'exact-a',
      value: '曾任高雄市議會公共事務研究顧問並參與地方治理工作',
    });
    const exactB = makeClaim({
      claimId: 'exact-b',
      value: '曾任高雄市議會公共事務研究顧問並參與地方治理工作',
    });
    const overlapA = makeClaim({
      claimId: 'overlap-a',
      value: '曾任高雄市議會公共事務研究顧問並參與地方治理工作多年',
    });
    const overlapB = makeClaim({
      claimId: 'overlap-b',
      value: '高雄市議會公共事務研究顧問並參與地方治理工作',
    });
    const groups = detectReleaseConsolidation(
      [exactA, exactB, overlapA, overlapB],
      [],
    );
    expect(
      groups.some((group) => group.relationship === 'exact-duplicate'),
    ).toBe(true);
    expect(
      groups.some((group) => group.relationship === 'possible-overlap'),
    ).toBe(true);
    expect(
      groups.some(
        (group) =>
          group.relationship === 'exact-duplicate' &&
          group.claimIds.join('|') === 'exact-a|exact-b',
      ),
    ).toBe(true);
    expect(groups.length).toBeGreaterThanOrEqual(2);
    expect(normalizeReleaseText(exactA.value)).toBe(
      normalizeReleaseText(exactB.value),
    );
  });
});

describe('generated release audit', () => {
  it('keeps the four canonical pilot statements corrected with lineage', () => {
    const dataset = validateBiographyDataset(normalizedInput);
    const pilotIds = new Set(pilotSummary.pilotCandidateIds);
    const corrected = dataset.claims.filter(
      (claim) =>
        pilotIds.has(claim.candidateId) &&
        claim.attribution === 'candidate-statement',
    );
    expect(corrected).toHaveLength(4);
    expect(
      corrected.every((claim) => claim.sourceDependency === 'self-reported'),
    ).toBe(true);
    expect(
      corrected.every(
        (claim) =>
          claim.lineage?.correctionType === 'attribution-correction' &&
          claim.lineage.correctionMethod ===
            'execute-biography-research:kcc-service-statement-detector' &&
          claim.lineage.sourceSha256 !== null &&
          claim.lineage.sourceSha256.length === 64 &&
          claim.lineage.evidenceId === claim.evidenceIds[0],
      ),
    ).toBe(true);
  });

  it('retains an equal, non-public 3-per-candidate review queue', () => {
    expect(releaseReadiness.originalClaimCount).toBe(405);
    expect(releaseReadiness.classificationCounts).toEqual({
      'current-position': 4,
      'basic-biographical-fact': 395,
      'candidate-statement': 4,
      'administrative-outcome': 2,
    });
    expect(releaseReadiness.readinessCounts).toEqual({
      blocked: 6,
      'ready-for-human-review': 399,
    });
    expect(releaseReadiness.selectedClaimIds).toHaveLength(12);
    expect(releaseBatch.selectedClaimIds).toHaveLength(12);
    expect(releaseBatch.groups).toHaveLength(4);
    expect(releaseReadiness.humanReviewedClaims).toBe(0);
    expect(releaseReadiness.approvedClaims).toBe(0);
    expect(releaseReadiness.publishedClaims).toBe(0);
  });
});
