import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import approvedInput from '../../../data/enrichment/approved/2026/zuoying-mayoral.json';
import datasetInput from '../../../data/enrichment/normalized/2026/zuoying-mayoral.json';
import publishedInput from '../../../data/enrichment/published/2026/zuoying-mayoral.json';
import reviewInput from '../../../data/enrichment/review/2026/zuoying-mayoral-review.json';
import {
  EnrichmentEmptyLayerSchema,
  validateEnrichmentDataset,
  validateEnrichmentReviewPacket,
} from './schema';

const dataset = validateEnrichmentDataset(datasetInput);
const packet = validateEnrichmentReviewPacket(reviewInput);

function sourceClass(sourceId: string): string | undefined {
  return dataset.sourceAttempts.find((attempt) => attempt.sourceId === sourceId)
    ?.sourceClass;
}

describe('scoped candidate enrichment', () => {
  it('covers the fixed 17-candidate, six-category matrix without name-only matches', () => {
    expect(dataset.candidateIds).toHaveLength(17);
    expect(dataset.audits).toHaveLength(102);
    expect(
      new Set(
        dataset.audits.map((audit) => `${audit.candidateId}:${audit.category}`),
      ),
    ).toHaveLength(102);
    expect(
      dataset.observations.every(
        (observation) => observation.isNameOnlyMatch === false,
      ),
    ).toBe(true);
    expect(
      dataset.sourceAttempts.every(
        (attempt) => attempt.isNegativeEvidence === false,
      ),
    ).toBe(true);
  });

  it('keeps every generated claim directly linked to one captured source and evidence record', () => {
    expect(dataset.claims).toHaveLength(143);
    expect(dataset.evidence).toHaveLength(dataset.claims.length);
    for (const claim of dataset.claims) {
      expect(claim.sourceIds.length).toBeGreaterThan(0);
      expect(claim.evidenceIds.length).toBeGreaterThan(0);
      expect(claim.identityObservationIds.length).toBeGreaterThan(0);
      expect(claim.publicationStatus).toBe('withheld-pending-review');
      expect(claim.reviewerId).toBeNull();
      expect(claim.reviewedAt).toBeNull();
    }
  });

  it('keeps candidate statements attributed and separates KCC policy extraction from navigation text', () => {
    const statements = dataset.claims.filter(
      (claim) => claim.attribution === 'candidate-statement',
    );
    expect(statements).toHaveLength(8);
    expect(
      statements.every((claim) => claim.sourceDependency === 'self-reported'),
    ).toBe(true);
    const kccStatements = statements.filter(
      (claim) => sourceClass(claim.sourceIds[0] ?? '') === 'kcc-member-profile',
    );
    expect(kccStatements).toHaveLength(7);
    expect(
      kccStatements.every((claim) => claim.title === '候選人自述政見'),
    ).toBe(true);
    expect(
      kccStatements.every((claim) => !claim.value.includes('學經歷與政見')),
    ).toBe(true);
  });

  it('retains duplicate/overlap groups without deleting or merging claims', () => {
    expect(dataset.duplicateGroups.length).toBeGreaterThan(0);
    for (const group of dataset.duplicateGroups) {
      expect(group.claimIds.length).toBeGreaterThanOrEqual(2);
      expect(group.disposition).toBe('retain-both-pending-human-review');
      expect(
        group.claimIds.every((claimId) =>
          dataset.claims.some((claim) => claim.claimId === claimId),
        ),
      ).toBe(true);
    }
  });

  it('keeps the review packet complete and approved/public layers empty', () => {
    expect(packet.candidates).toHaveLength(17);
    expect(packet.claims).toHaveLength(dataset.claims.length);
    expect(packet.evidence).toHaveLength(dataset.evidence.length);
    expect(packet.audits).toHaveLength(102);
    expect(packet.reviewerId).toBeNull();
    expect(packet.reviewedAt).toBeNull();
    expect(
      EnrichmentEmptyLayerSchema.parse(approvedInput).records,
    ).toHaveLength(0);
    expect(
      EnrichmentEmptyLayerSchema.parse(publishedInput).records,
    ).toHaveLength(0);
  });

  it('can reopen a captured source using its recorded checksum', () => {
    const source = dataset.sourceChecks.find(
      (check) => check.sourceId === 'scope-kcc-profile-2185',
    );
    if (!source) throw new Error('Expected KCC 2185 source check.');
    const bytes = readFileSync(source.rawPath);
    expect(bytes.byteLength).toBe(source.byteLength);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      source.expectedSha256,
    );
  });
});
