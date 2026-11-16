import { describe, expect, it } from 'vitest';
import policyInput from '../../../data/policy-research/2026/full-roster.json';
import enrichmentInput from '../../../data/public-records/research-enrichment/2026/full-roster.json';
import enrichmentSummaryInput from '../../../data/public-records/research-enrichment/2026/summary.json';
import type { PolicyResearchDataset } from '../policy-research/schema';
import { publicRecordsEnrichment } from './enrichment-full-index';
import { validatePublicRecordsEnrichmentDataset } from './enrichment-schema';
import { validatePublicRecordsEnrichmentSummary } from './enrichment-summary-schema';

const policyDataset = policyInput as unknown as Pick<
  PolicyResearchDataset,
  'policies'
>;

describe('full-roster public-record enrichment', () => {
  it('covers every canonical candidate with stable identity fields', () => {
    const dataset = validatePublicRecordsEnrichmentDataset(enrichmentInput);
    expect(dataset.candidateCount).toBe(106);
    expect(dataset.audits).toHaveLength(106);

    const candidateIds = new Set(
      dataset.audits.map((audit) => audit.candidateId),
    );
    const personIds = new Set(dataset.audits.map((audit) => audit.personId));
    expect(candidateIds.size).toBe(106);
    expect(personIds.size).toBe(106);
    expect(
      dataset.audits.every(
        (audit) =>
          audit.personId.startsWith('person-') &&
          audit.isNegativeEvidence === false &&
          audit.researchStatus === 'completed',
      ),
    ).toBe(true);
  });

  it('keeps every upstream policy traceable without publishing pending content', () => {
    expect(publicRecordsEnrichment.policyReferences).toHaveLength(
      policyDataset.policies.length,
    );
    const policiesById = new Map(
      policyDataset.policies.map((policy) => [policy.policyId, policy]),
    );

    for (const reference of publicRecordsEnrichment.policyReferences) {
      const policy = policiesById.get(reference.policyId);
      expect(policy).toBeDefined();
      expect(reference.candidateId).toBe(policy?.candidateId);
      expect(reference.sourceId).toBe(policy?.sourceId);
      expect(reference.evidenceId).toBe(policy?.evidenceId);
      expect(reference.validationStatus).toBe(policy?.validationStatus);
      expect(reference.publicationStatus).toBe(policy?.publicationStatus);
    }

    expect(publicRecordsEnrichment.validation).toMatchObject({
      status: 'pending-verification',
      method: 'deterministic-source-check-v1',
    });
    expect(publicRecordsEnrichment.coverageAssertions.publishedRecords).toBe(0);
  });

  it('requires source-backed claims, evidence, and records', () => {
    const sources = new Set(
      publicRecordsEnrichment.sourceSnapshots.map((source) => source.sourceId),
    );
    const claims = new Map(
      publicRecordsEnrichment.claims.map((claim) => [claim.claimId, claim]),
    );
    const evidence = new Map(
      publicRecordsEnrichment.evidence.map((item) => [item.evidenceId, item]),
    );

    expect(publicRecordsEnrichment.claims).toHaveLength(
      publicRecordsEnrichment.evidence.length,
    );
    for (const claim of publicRecordsEnrichment.claims) {
      expect(claim.evidenceIds.length).toBeGreaterThan(0);
      expect(claim.evidenceIds.every((id) => evidence.has(id))).toBe(true);
      expect(claim.validationStatus).toBe('pending-verification');
      expect(claim.publicationStatus).toBe('withheld-unverified');
    }
    for (const item of publicRecordsEnrichment.evidence) {
      expect(sources.has(item.sourceId)).toBe(true);
      expect(claims.has(item.claimId)).toBe(true);
      expect(item.quotedText.length).toBeGreaterThan(0);
    }
    for (const record of [
      ...publicRecordsEnrichment.positions,
      ...publicRecordsEnrichment.careerRecords,
    ]) {
      expect(record.claimIds.length).toBeGreaterThan(0);
      expect(record.evidenceIds.length).toBeGreaterThan(0);
      expect(record.verificationStatus).toBe('machine-validated');
      expect(record.publicationStatus).toBe('withheld-unverified');
    }
  });

  it('does not infer votes, proposals, executive initiatives, or news', () => {
    expect(publicRecordsEnrichment.coverageAssertions).toEqual({
      individualVoteRecords: 0,
      executiveInitiativeRecords: 0,
      relationshipRecords: 0,
      newsRecordsAdded: 0,
      proposalsAdded: 0,
      publishedRecords: 0,
    });
    expect(
      publicRecordsEnrichment.audits.every(
        (audit) =>
          audit.individualVoteRecordCount === 0 &&
          audit.executiveInitiativeRecordCount === 0 &&
          audit.newsRecordCount === 0 &&
          audit.proposalRecordCount === 0,
      ),
    ).toBe(true);
  });

  it('keeps the production summary free of pending record content', () => {
    const summary = validatePublicRecordsEnrichmentSummary(
      enrichmentSummaryInput,
    );
    expect(summary.audits).toHaveLength(106);
    for (const audit of summary.audits) {
      expect(Object.keys(audit).sort()).toEqual([
        'candidateId',
        'note',
        'outcome',
        'pendingCareerRecordCount',
        'pendingClaimCount',
        'pendingEvidenceCount',
        'pendingPolicyReferenceCount',
        'pendingPositionCount',
        'pendingRecordCount',
        'publishedRecordCount',
        'researchStatus',
        'resolvedSourceCount',
        'retainedSourceCount',
        'retrievedSourceAttemptCount',
        'sourceAttemptCount',
      ]);
    }
    expect(JSON.stringify(summary)).not.toContain('sourceSnapshots');
    expect(JSON.stringify(summary)).not.toContain('originalStatement');
    expect(JSON.stringify(summary)).not.toContain('quotedText');
    expect(JSON.stringify(summary)).not.toContain('rawPath');
    expect(JSON.stringify(summary)).not.toContain('https://');
  });
});
