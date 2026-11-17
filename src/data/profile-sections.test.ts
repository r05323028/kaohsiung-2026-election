import { describe, expect, it } from 'vitest';
import { PROFILE_TABS } from '../components/ProfileTabs';
import { publicationBiographySnapshot } from './biographies/publication';
import { candidateProfiles } from './index';
import { officialCandidateProfiles } from './official';

const publicRecords = (
  candidate: (typeof officialCandidateProfiles)[number],
) =>
  candidate.publicRecords
    ? [
        ...candidate.publicRecords.positions,
        ...candidate.publicRecords.policies,
        ...candidate.publicRecords.activities,
        ...candidate.publicRecords.news,
        ...candidate.publicRecords.relationships,
        ...candidate.publicRecords.timeline,
      ]
    : [];

describe('six-section candidate profile coverage', () => {
  it('covers the current canonical candidate roster', () => {
    expect(officialCandidateProfiles).toHaveLength(106);
    expect(candidateProfiles).toHaveLength(officialCandidateProfiles.length);
    expect(
      officialCandidateProfiles.every(
        (candidate) => candidate.propertyDeclaration !== undefined,
      ),
    ).toBe(true);
    expect(
      new Set(
        officialCandidateProfiles.map((candidate) => candidate.candidacy.id),
      ).size,
    ).toBe(106);
  });

  it('keeps the six section contract and neutral content boundaries', () => {
    expect(PROFILE_TABS.map((tab) => tab.label)).toEqual([
      '基本資料',
      '政策主張',
      '相關新聞',
      '從政歷程',
      '家族政商關係',
      '財產申報',
    ]);
    expect(
      officialCandidateProfiles.some(
        (candidate) => (candidate.publishedPolicies?.length ?? 0) > 0,
      ),
    ).toBe(true);
    expect(
      officialCandidateProfiles.some(
        (candidate) => (candidate.publishedNews?.length ?? 0) > 0,
      ),
    ).toBe(true);
    expect(
      officialCandidateProfiles.every(
        (candidate) =>
          !('positiveNewsCount' in candidate) &&
          !('negativeNewsCount' in candidate),
      ),
    ).toBe(true);
  });

  it('exposes only a status summary for pending public-record research', () => {
    expect(
      officialCandidateProfiles.every(
        (candidate) => candidate.publicRecordResearch !== undefined,
      ),
    ).toBe(true);
    expect(
      officialCandidateProfiles.some(
        (candidate) =>
          (candidate.publicRecordResearch?.pendingRecordCount ?? 0) > 0,
      ),
    ).toBe(true);
    expect(
      officialCandidateProfiles.every(
        (candidate) =>
          candidate.publicRecordResearch?.publishedRecordCount === 0,
      ),
    ).toBe(true);
    expect(
      officialCandidateProfiles.every(
        (candidate) =>
          candidate.publicRecordResearch?.outcome !== 'identity-conflict',
      ),
    ).toBe(true);
  });

  it('does not expose pending policy research as public policy records', () => {
    const pendingCandidates = officialCandidateProfiles.filter(
      (candidate) => (candidate.policyResearch?.policyCount ?? 0) > 0,
    );
    expect(pendingCandidates.length).toBeGreaterThan(0);
    expect(
      pendingCandidates.every(
        (candidate) => (candidate.publicRecords?.policies.length ?? 0) === 0,
      ),
    ).toBe(true);
  });

  it('requires source-backed claim and evidence references for public records', () => {
    for (const candidate of officialCandidateProfiles) {
      const sourceIds = new Set(candidate.sources.map((source) => source.id));
      const bundle = candidate.publicRecords;
      if (!bundle) continue;
      const evidenceById = new Map(
        bundle.evidence.map((evidence) => [evidence.evidenceId, evidence]),
      );
      const claimIds = new Set(bundle.claims.map((claim) => claim.claimId));

      for (const record of publicRecords(candidate)) {
        expect(record.claimIds.length).toBeGreaterThan(0);
        expect(record.evidenceIds.length).toBeGreaterThan(0);
        expect(record.claimIds.every((claimId) => claimIds.has(claimId))).toBe(
          true,
        );
        expect(
          record.evidenceIds.every((evidenceId) =>
            evidenceById.has(evidenceId),
          ),
        ).toBe(true);
        expect(
          record.evidenceIds.every((evidenceId) => {
            const evidence = evidenceById.get(evidenceId);
            return evidence !== undefined && sourceIds.has(evidence.sourceId);
          }),
        ).toBe(true);
      }
    }
  });

  it('keeps biography claims linked to the neutral publication snapshot', () => {
    expect(publicationBiographySnapshot.records).toHaveLength(75);
    expect(publicationBiographySnapshot.sources).toHaveLength(9);
    const snapshotClaimIds = new Set(
      publicationBiographySnapshot.records.map((claim) => claim.claimId),
    );
    const snapshotSourceIds = new Set(
      publicationBiographySnapshot.sources.map((source) => source.sourceId),
    );
    for (const candidate of officialCandidateProfiles) {
      for (const claim of candidate.biography?.claims ?? []) {
        expect(snapshotClaimIds.has(claim.claimId)).toBe(true);
        expect(claim.sourceIds.length).toBeGreaterThan(0);
        expect(
          claim.sourceIds.every((sourceId) => snapshotSourceIds.has(sourceId)),
        ).toBe(true);
      }
    }
  });

  it('keeps vote availability conservative and separates career record types', () => {
    expect(
      officialCandidateProfiles.every((candidate) =>
        publicRecords(candidate).every((record) => !('votePosition' in record)),
      ),
    ).toBe(true);
  });
});
