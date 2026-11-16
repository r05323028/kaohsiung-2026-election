import { describe, expect, it } from 'vitest';
import rosterInput from '../../../data/approved/2026/kaohsiung-election.json';
import publishedInput from '../../../data/published/2026/candidate-biographies.json';
import { calculateBiographySnapshotChecksum } from './checksum';
import { getBiographyReadModel, publicationBiographySnapshot } from './index';
import { validateBiographyPublicationSnapshot } from './schema';

describe('PR-maintained biography publication', () => {
  it('preserves the migrated source-backed facts and verifies the checksum', () => {
    const snapshot = validateBiographyPublicationSnapshot(publishedInput);
    expect(snapshot.records).toHaveLength(75);
    expect(snapshot.sources).toHaveLength(9);
    const { checksum, ...withoutChecksum } = snapshot;
    expect(calculateBiographySnapshotChecksum(withoutChecksum)).toBe(checksum);
    expect(publicationBiographySnapshot.checksum).toBe(checksum);
  });

  it('keeps every published claim attached to a canonical candidate and source', () => {
    const candidateIds = new Set(
      rosterInput.candidates.map((candidate) => candidate.id),
    );
    const sourceIds = new Set(
      publicationBiographySnapshot.sources.map((source) => source.sourceId),
    );
    for (const claim of publicationBiographySnapshot.records) {
      expect(candidateIds.has(claim.candidateId)).toBe(true);
      expect(claim.sourceIds.every((sourceId) => sourceIds.has(sourceId))).toBe(
        true,
      );
      expect(claim.evidenceIds.length).toBeGreaterThan(0);
    }
  });

  it('uses neutral published and none states', () => {
    const candidateId = publicationBiographySnapshot.records[0]?.candidateId;
    if (!candidateId) throw new Error('Expected migrated biography record.');
    expect(getBiographyReadModel(candidateId).status).toBe('published');
    expect(getBiographyReadModel('candidate-without-biography').status).toBe(
      'none',
    );
  });

  it('does not carry internal approval metadata', () => {
    const serialized = JSON.stringify(publicationBiographySnapshot);
    expect(serialized).not.toContain('machineApprovalId');
    const retiredPolicyMarker = ['automated', 'editorial-policy-v1'].join('-');
    expect(serialized).not.toContain(retiredPolicyMarker);
    expect(serialized).not.toContain('publicationOrigin');
  });
});
