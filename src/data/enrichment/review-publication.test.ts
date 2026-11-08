import { describe, expect, it } from 'vitest';
import datasetInput from '../../../data/enrichment/normalized/2026/zuoying-mayoral.json';
import packetInput from '../../../data/enrichment/review/2026/zuoying-mayoral-review.json';
import blockerInput from '../../../reports/zuoying-mayoral-blocker-analysis.json';
import verificationInput from '../../../reports/zuoying-mayoral-independent-verification.json';
import gateInput from '../../../reports/zuoying-mayoral-publication-gate.json';
import readinessInput from '../../../reports/zuoying-mayoral-publication-readiness.json';
import queueInput from '../../../reports/zuoying-mayoral-review-queue.json';
import type { EditorialDecision, ReviewerRegistry } from '../editorial/schema';
import {
  buildScopedBlockerAnalysis,
  buildScopedPublicationReadiness,
  buildScopedPublishedRecords,
  buildScopedReviewQueue,
  evaluateScopedEnrichmentPublicationGate,
  type ScopedPublicationGateReport,
  validateScopedBlockerAnalysis,
  validateScopedPublicationGateReport,
  validateScopedPublicationReadiness,
  validateScopedReviewQueue,
} from './review-publication';
import {
  validateEnrichmentDataset,
  validateEnrichmentReviewPacket,
} from './schema';

const dataset = validateEnrichmentDataset(datasetInput);
const packet = validateEnrichmentReviewPacket(packetInput);

function sourceVersions(claim: (typeof dataset.claims)[number]) {
  return claim.sourceIds.map((sourceId) => {
    const source = dataset.sourceAttempts.find(
      (attempt) => attempt.sourceId === sourceId,
    );
    if (!source?.sha256) throw new Error(`Missing source hash ${sourceId}.`);
    return { sourceId, sha256: source.sha256 };
  });
}

function fixtureDecisions(
  claim: (typeof dataset.claims)[number],
): EditorialDecision[] {
  const evidenceVersions = sourceVersions(claim);
  return [
    {
      decisionId: 'scoped-fixture-identity',
      subjectType: 'identity',
      subjectId: `candidate:${claim.candidateId}`,
      candidateId: claim.candidateId,
      decision: 'confirm-same',
      resultingState: 'approved',
      reviewerId: 'scoped-fixture-reviewer',
      decidedAt: '2026-11-07T12:00:00.000Z',
      rationale:
        'Fictional isolated fixture confirms the stable candidate identity.',
      evidenceVersions,
      confirmation: true,
      decisionSchemaVersion: '1',
      supersedesDecisionId: null,
    },
    {
      decisionId: 'scoped-fixture-claim',
      subjectType: 'claim',
      subjectId: claim.claimId,
      candidateId: claim.candidateId,
      decision: 'approve',
      resultingState: 'approved',
      reviewerId: 'scoped-fixture-reviewer',
      decidedAt: '2026-11-07T12:00:00.000Z',
      rationale:
        'Fictional isolated fixture approves the directly evidenced claim.',
      evidenceVersions,
      confirmation: true,
      decisionSchemaVersion: '1',
      supersedesDecisionId: null,
    },
  ];
}

const fixtureRegistry: ReviewerRegistry = {
  schemaVersion: '1',
  reviewers: [
    {
      reviewerId: 'scoped-fixture-reviewer',
      displayName: 'Fictional scoped reviewer (test only)',
      role: 'fixture reviewer',
      authorizedActions: ['identity-review', 'editorial-approval'],
      active: true,
    },
  ],
  note: 'Fictional fixture only; not a production reviewer.',
};

describe('scoped review and publication contracts', () => {
  it('classifies every persisted blocker row without collapsing affected audits', () => {
    const analysis = buildScopedBlockerAnalysis(dataset);
    expect(analysis.originalBlockerRowCount).toBe(107);
    expect(analysis.affectedAuditCount).toBe(75);
    expect(analysis.summary.byCategory).toEqual({
      currentness: 7,
      'candidate-attribution': 8,
      'coverage-gap': 60,
      'missing-public-record-evidence': 16,
      'sensitive-relationship-evidence': 16,
    });
    expect(analysis.summary.remainingBlocked).toBe(107);
    expect(analysis.summary.machineRemediated).toBe(0);
    expect(validateScopedBlockerAnalysis(blockerInput).blockers).toHaveLength(
      107,
    );
  });

  it('builds the complete claim-plus-gap review queue and readiness matrix', () => {
    const analysis = buildScopedBlockerAnalysis(dataset);
    const queue = buildScopedReviewQueue(dataset, packet, analysis);
    const readiness = buildScopedPublicationReadiness(dataset, packet, queue);
    expect(queue.items).toHaveLength(203);
    expect(queue.summary.claimItems).toBe(143);
    expect(queue.summary.coverageGapItems).toBe(60);
    expect(readiness.candidates).toHaveLength(17);
    expect(readiness.categoryMatrix).toHaveLength(102);
    expect(validateScopedReviewQueue(queueInput).items).toHaveLength(203);
    expect(
      validateScopedPublicationReadiness(readinessInput).summary
        .publishedClaims,
    ).toBe(0);
  });

  it('covers all categories, candidate groups, timestamp qualities, and blocked samples', () => {
    const verification = verificationInput;
    expect(verification.samples).toHaveLength(13);
    expect(verification.summary.matching).toBe(13);
    expect(verification.summary.discrepancies).toBe(0);
    expect(verification.summary.blockedSamples).toBe(7);
    expect(verification.summary.categories).toEqual([
      'basic-biography',
      'policies',
      'public-records',
      'news',
      'relationships',
      'timeline',
    ]);
    expect(verification.summary.candidateGroups).toEqual([
      'district-4',
      'mayoral',
    ]);
    expect(verification.summary.timestampQualities).toEqual([
      'capture-file-mtime',
      'source-header',
      'unavailable',
    ]);
  });

  it('keeps duplicate claims and evidence together in presentation grouping', () => {
    const group = dataset.duplicateGroups[0];
    if (!group) throw new Error('Expected the retained duplicate group.');
    const emptyGate = evaluateScopedEnrichmentPublicationGate(dataset, [], {
      schemaVersion: '1',
      reviewers: [],
      note: 'No reviewers.',
    });
    const duplicateIds = new Set(group.claimIds);
    const gate: ScopedPublicationGateReport = {
      ...emptyGate,
      eligibleClaims: group.claimIds.length,
      blockedClaims: dataset.claims.length - group.claimIds.length,
      entries: emptyGate.entries.map((entry) =>
        duplicateIds.has(entry.claimId)
          ? { ...entry, eligible: true, blockers: [] }
          : entry,
      ),
    };
    const records = buildScopedPublishedRecords(dataset, gate);
    const grouped = records.find((record) =>
      group.claimIds.every((claimId) => record.claimIds.includes(claimId)),
    );
    expect(grouped?.claimIds).toEqual(group.claimIds);
    expect(grouped?.evidenceIds.length).toBeGreaterThanOrEqual(2);
    expect(validateScopedPublicationGateReport(gate).eligibleClaims).toBe(2);
  });

  it('keeps the real scoped gate empty with no reviewer or publication authorization', () => {
    const gate = evaluateScopedEnrichmentPublicationGate(dataset, [], {
      schemaVersion: '1',
      reviewers: [],
      note: 'No reviewers configured.',
    });
    expect(gate.totalClaims).toBe(143);
    expect(gate.eligibleClaims).toBe(0);
    expect(gate.blockedClaims).toBe(143);
    expect(gate.reviewerIds).toEqual([]);
    expect(validateScopedPublicationGateReport(gateInput).eligibleClaims).toBe(
      0,
    );
  });

  it('allows only an isolated fictional directly evidenced claim through the scoped gate', () => {
    const claim = dataset.claims.find(
      (candidateClaim) =>
        candidateClaim.category === 'basic-biography' &&
        candidateClaim.claimType !== 'current-position',
    );
    if (!claim) throw new Error('Expected a fictional-gate test claim.');
    const gate = evaluateScopedEnrichmentPublicationGate(
      dataset,
      fixtureDecisions(claim),
      fixtureRegistry,
    );
    const entry = gate.entries.find(
      (candidate) => candidate.claimId === claim.claimId,
    );
    expect(entry?.eligible).toBe(true);
    expect(gate.eligibleClaims).toBe(1);
    expect(gate.blockedClaims).toBe(142);
  });
});
