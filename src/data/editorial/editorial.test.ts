import { describe, expect, it } from 'vitest';
import {
  type BiographyDataset,
  validateBiographyDataset,
} from '../biographies/schema';
import {
  type EditorialDecision,
  type EditorialDecisionSet,
  type EditorialReviewPacket,
  evaluateEditorialPublicationGate,
  type ReviewerRegistry,
  validateEditorialDecisionIntegrity,
  validateEditorialDecisionSet,
  validateEditorialReviewPacket,
  validateReviewerRegistry,
} from './index';

const sourceHash = 'a'.repeat(64);
const sourceUrl = 'https://fixture.example/fictional-biography';

function makeDecision(
  subjectType: 'claim' | 'identity',
  subjectId: string,
  candidateId: string,
  decision: EditorialDecision['decision'],
  reviewerId = 'reviewer-fixture',
  supersedesDecisionId: string | null = null,
  hash = sourceHash,
): EditorialDecision {
  const resultingState: EditorialDecision['resultingState'] =
    decision === 'approve' || decision === 'confirm-same'
      ? 'approved'
      : decision === 'reject' ||
          decision === 'confirm-different' ||
          decision === 'reject-match'
        ? 'rejected'
        : decision === 'dispute'
          ? 'disputed'
          : decision === 'request-clarification'
            ? 'needs_evidence_review'
            : decision === 'insufficient-evidence'
              ? 'needs_identity_review'
              : 'unreviewed';
  return {
    decisionId: `${subjectType}-${decision}-${supersedesDecisionId ?? 'initial'}`,
    subjectType,
    subjectId,
    candidateId,
    decision,
    resultingState,
    reviewerId,
    decidedAt: '2026-11-06T12:00:00.000Z',
    rationale: 'Fictional fixture review with explicit evidence inspection.',
    evidenceVersions: [{ sourceId: 'source-fixture', sha256: hash }],
    confirmation: decision === 'approve' || decision === 'confirm-same',
    decisionSchemaVersion: '1',
    supersedesDecisionId,
  };
}

function makeFixture(): {
  dataset: BiographyDataset;
  packet: EditorialReviewPacket;
  registry: ReviewerRegistry;
  decisions: EditorialDecisionSet;
} {
  const dataset = validateBiographyDataset({
    datasetId: 'kaohsiung-2026-candidate-biographies',
    snapshotDate: '2026-11-06',
    rosterSnapshotDate: '2026-11-05',
    candidateCount: 1,
    sources: [
      {
        attemptId: 'attempt-fixture',
        sourceId: 'source-fixture',
        sourceClass: 'government-record',
        method: 'GET',
        url: sourceUrl,
        query: null,
        attemptedAt: '2026-11-06T10:00:00.000Z',
        outcome: 'retrieved',
        httpStatus: 200,
        contentType: 'text/html',
        rawPath: 'tests/fixtures/editorial-fictional.html',
        sha256: sourceHash,
        byteLength: 128,
        excerpt: 'Fictional source excerpt.',
        failureReason: null,
        timestampQuality: 'execution-record',
        sourceRetrievedAt: '2026-11-06T10:00:00.000Z',
        isNegativeEvidence: false,
      },
    ],
    observations: [
      {
        observationId: 'observation-fixture',
        sourceId: 'source-fixture',
        sourceAttemptId: 'attempt-fixture',
        externalIdentifier: 'fictional-001',
        observedName: '虛構候選人',
        observedParty: '虛構政黨',
        observedDistrict: 'fictional-district',
        observedJurisdiction: 'fictional-city',
        candidateIds: ['candidate-fictional'],
        identityStatus: 'resolved',
        matchBasis: ['fictional stable source identifier'],
        rationale:
          'The fixture provides a stable identifier and matching constituency.',
        isNameOnlyMatch: false,
        excerpt: 'Fictional candidate identity excerpt.',
      },
    ],
    evidence: [
      {
        evidenceId: 'evidence-fixture',
        claimId: 'claim-fixture',
        sourceId: 'source-fixture',
        sourceAttemptId: 'attempt-fixture',
        documentLocation: 'fixture.html#experience',
        excerpt: 'Fictional candidate held a fictional public position.',
        supportType: 'direct',
        attribution: 'institutional-record',
        verificationStatus: 'source-retrieved',
      },
    ],
    claims: [
      {
        claimId: 'claim-fixture',
        candidateId: 'candidate-fictional',
        personId: 'person-fictional',
        claimType: 'historical-position',
        title: '虛構公職經歷',
        organization: '虛構市政府',
        value: '曾任虛構市政府顧問',
        validFrom: null,
        validTo: null,
        temporalPrecision: 'unknown',
        currentStatus: 'historical',
        attribution: 'institutional-record',
        sourceDependency: 'source-backed',
        sourceIds: ['source-fixture'],
        evidenceIds: ['evidence-fixture'],
        identityObservationIds: ['observation-fixture'],
        machineStatus: 'machine-validated',
        humanReviewStatus: 'not-reviewed',
        editorialStatus: 'not-reviewed',
        publicationStatus: 'withheld-pending-review',
        reviewerId: null,
        reviewedAt: null,
      },
    ],
    audits: [],
    conflicts: [],
    checkpoint: {
      checkpointId: 'checkpoint-fixture',
      runId: 'run-fixture',
      command: 'review',
      snapshotDate: '2026-11-06',
      attemptedSourceIds: ['source-fixture'],
      completedSourceIds: ['source-fixture'],
      failedSourceIds: [],
      retryLimit: 0,
      concurrency: 1,
      dryRun: false,
      resumedFromRunId: null,
      updatedAt: '2026-11-06T10:00:00.000Z',
    },
    review: {
      status: 'pending-human-review',
      reviewerId: null,
      reviewedAt: null,
      note: 'Fictional fixture remains separate from production review.',
    },
  });
  const packet = validateEditorialReviewPacket({
    packetId: 'kaohsiung-2026-candidate-biographies-editorial-packet',
    snapshotDate: '2026-11-06',
    generatedAt: '2026-11-06T00:00:00.000Z',
    schemaVersion: '1',
    candidates: [
      {
        candidateId: 'candidate-fictional',
        displayName: '虛構候選人',
        districtId: 'fictional-district',
        electionType: 'city-council',
        slug: 'fictional-candidate',
      },
    ],
    claims: dataset.claims,
    evidence: dataset.evidence,
    sources: dataset.sources,
    observations: dataset.observations,
    conflicts: dataset.conflicts,
    reviewItems: [],
  });
  const registry = validateReviewerRegistry({
    schemaVersion: '1',
    reviewers: [
      {
        reviewerId: 'reviewer-fixture',
        displayName: 'Fictional reviewer (test only)',
        role: 'fixture reviewer',
        authorizedActions: [
          'identity-review',
          'claim-review',
          'editorial-approval',
        ],
        active: true,
      },
    ],
    note: 'Fixture registry is not authentication and cannot represent a real human review.',
  });
  const decisions = validateEditorialDecisionSet({
    datasetId: 'kaohsiung-2026-candidate-biographies-editorial-decisions',
    snapshotDate: '2026-11-06',
    schemaVersion: '1',
    decisions: [
      makeDecision(
        'identity',
        'candidate:candidate-fictional',
        'candidate-fictional',
        'confirm-same',
      ),
      makeDecision('claim', 'claim-fixture', 'candidate-fictional', 'approve'),
    ],
    note: 'Fictional decisions are test-only and never enter production files.',
  });
  return { dataset, packet, registry, decisions };
}

function decisionAt(
  decisionSet: EditorialDecisionSet,
  index: number,
): EditorialDecision {
  const decision = decisionSet.decisions[index];
  if (!decision) throw new Error(`Missing fixture decision at index ${index}.`);
  return decision;
}

function withDecisions(
  fixture: ReturnType<typeof makeFixture>,
  decisions: EditorialDecision[],
): EditorialDecisionSet {
  return validateEditorialDecisionSet({
    ...fixture.decisions,
    decisions,
  });
}

describe('editorial decision integrity', () => {
  it('accepts an explicitly authorized fictional approval pair', () => {
    const fixture = makeFixture();
    expect(
      validateEditorialDecisionIntegrity(
        fixture.decisions,
        fixture.registry,
        fixture.packet,
      ),
    ).toHaveLength(2);
  });

  it('rejects an unknown or unauthorized reviewer', () => {
    const fixture = makeFixture();
    const unknown = withDecisions(
      fixture,
      fixture.decisions.decisions.map((decision) => ({
        ...decision,
        reviewerId: 'missing-reviewer',
      })),
    );
    expect(() =>
      validateEditorialDecisionIntegrity(
        unknown,
        fixture.registry,
        fixture.packet,
      ),
    ).toThrow('unknown reviewer');

    const reviewer = fixture.registry.reviewers[0];
    if (!reviewer) throw new Error('Fixture reviewer is required.');
    const unauthorizedRegistry = validateReviewerRegistry({
      ...fixture.registry,
      reviewers: [
        {
          ...reviewer,
          authorizedActions: ['claim-review'],
        },
      ],
    });
    expect(() =>
      validateEditorialDecisionIntegrity(
        fixture.decisions,
        unauthorizedRegistry,
        fixture.packet,
      ),
    ).toThrow('not authorized');
  });

  it('rejects an invalid state mapping and ambiguous supersession', () => {
    const fixture = makeFixture();
    const invalidState: EditorialDecisionSet = {
      ...fixture.decisions,
      decisions: [
        {
          ...decisionAt(fixture.decisions, 0),
          resultingState: 'rejected',
        } as EditorialDecision,
        decisionAt(fixture.decisions, 1),
      ],
    };
    expect(() =>
      validateEditorialDecisionIntegrity(
        invalidState,
        fixture.registry,
        fixture.packet,
      ),
    ).toThrow('expected approved');

    const first = makeDecision(
      'claim',
      'claim-fixture',
      'candidate-fictional',
      'approve',
      'reviewer-fixture',
      null,
    );
    const second = makeDecision(
      'claim',
      'claim-fixture',
      'candidate-fictional',
      'reject',
      'reviewer-fixture',
      null,
    );
    const third = makeDecision(
      'claim',
      'claim-fixture',
      'candidate-fictional',
      'approve',
      'reviewer-fixture',
      first.decisionId,
    );
    const fourth = makeDecision(
      'claim',
      'claim-fixture',
      'candidate-fictional',
      'reject',
      'reviewer-fixture',
      first.decisionId,
    );
    const ambiguous = withDecisions(fixture, [
      decisionAt(fixture.decisions, 0),
      first,
      second,
      third,
      fourth,
    ]);
    expect(() =>
      validateEditorialDecisionIntegrity(
        ambiguous,
        fixture.registry,
        fixture.packet,
      ),
    ).toThrow('current active decision');
  });
});

describe('fictional publication gate', () => {
  it('allows only the fully reviewed fictional claim', () => {
    const fixture = makeFixture();
    const report = evaluateEditorialPublicationGate(
      fixture.dataset,
      fixture.decisions,
      fixture.registry,
      fixture.packet,
    );
    expect(report.eligibleClaims).toBe(1);
    expect(report.blockedClaims).toBe(0);
  });

  it('blocks missing evidence, identity, stale sources, rejection, and identity reversal', () => {
    const fixture = makeFixture();
    const missingEvidence = evaluateEditorialPublicationGate(
      { ...fixture.dataset, evidence: [] },
      fixture.decisions,
      fixture.registry,
      fixture.packet,
    );
    expect(missingEvidence.entries[0]?.reasons).toContain(
      'missing-evidence-reference',
    );

    const withoutIdentity = withDecisions(fixture, [
      decisionAt(fixture.decisions, 1),
    ]);
    const missingIdentity = evaluateEditorialPublicationGate(
      fixture.dataset,
      withoutIdentity,
      fixture.registry,
      fixture.packet,
    );
    expect(missingIdentity.entries[0]?.reasons).toContain(
      'missing-identity-resolution',
    );

    const stale = withDecisions(
      fixture,
      fixture.decisions.decisions.map((decision) => ({
        ...decision,
        evidenceVersions: [
          { sourceId: 'source-fixture', sha256: 'b'.repeat(64) },
        ],
      })),
    );
    const staleReport = evaluateEditorialPublicationGate(
      fixture.dataset,
      stale,
      fixture.registry,
      fixture.packet,
    );
    expect(staleReport.entries[0]?.reasons).toContain(
      'claim-stale-source-version:source-fixture',
    );

    const rejected = withDecisions(fixture, [
      decisionAt(fixture.decisions, 0),
      makeDecision('claim', 'claim-fixture', 'candidate-fictional', 'reject'),
    ]);
    const rejectedReport = evaluateEditorialPublicationGate(
      fixture.dataset,
      rejected,
      fixture.registry,
      fixture.packet,
    );
    expect(rejectedReport.entries[0]?.eligible).toBe(false);

    const reversed = withDecisions(fixture, [
      decisionAt(fixture.decisions, 0),
      makeDecision(
        'identity',
        'candidate:candidate-fictional',
        'candidate-fictional',
        'confirm-different',
        'reviewer-fixture',
        decisionAt(fixture.decisions, 0).decisionId,
      ),
      decisionAt(fixture.decisions, 1),
    ]);
    const reversedReport = evaluateEditorialPublicationGate(
      fixture.dataset,
      reversed,
      fixture.registry,
      fixture.packet,
    );
    expect(reversedReport.entries[0]?.reasons).toContain(
      'identity-state:rejected',
    );
  });

  it('blocks an open identity conflict until a decision resolves its subject', () => {
    const fixture = makeFixture();
    const conflict = {
      conflictId: 'conflict-fixture',
      candidateId: 'candidate-fictional',
      rosterName: '虛構候選人',
      competingObservedNames: ['虛構候選人', '另一位虛構候選人'],
      priorEvidenceSourceIds: ['source-fixture'],
      additionalObservationIds: [],
      status: 'open' as const,
      resolution: 'Awaiting identity review.',
      isNameOnlyResolution: false as const,
    };
    const dataset = { ...fixture.dataset, conflicts: [conflict] };
    const packet = validateEditorialReviewPacket({
      ...fixture.packet,
      conflicts: [conflict],
    });
    const report = evaluateEditorialPublicationGate(
      dataset,
      fixture.decisions,
      fixture.registry,
      packet,
    );
    expect(report.entries[0]?.reasons).toContain('missing-identity-resolution');
    expect(report.entries[0]?.reasons).toContain(
      'blocking-identity-conflict:conflict-fixture',
    );
  });
});
