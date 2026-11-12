import { describe, expect, it } from 'vitest';
import coverageReport from '../../reports/candidate-profile-coverage.json';
import sourceQualityReport from '../../reports/candidate-profile-source-quality.json';
import { scopedCategoryToProfileTab } from './enrichment/review-publication';
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

describe('five-section candidate profile coverage', () => {
  it('covers the current canonical candidate roster', () => {
    expect(officialCandidateProfiles).toHaveLength(candidateProfiles.length);
    expect(coverageReport.totalCandidates).toBe(candidateProfiles.length);
    expect(coverageReport.candidatesStructurallySupported).toBe(
      candidateProfiles.length,
    );

    const profileIds = new Set(
      officialCandidateProfiles.map((candidate) => candidate.candidacy.id),
    );
    const inventoryIds = new Set(
      coverageReport.candidateInventory.map(
        (candidate) => candidate.candidateId,
      ),
    );
    expect(inventoryIds).toEqual(profileIds);
    expect(
      coverageReport.candidateInventory.every(
        (candidate) => candidate.structurallySupported,
      ),
    ).toBe(true);
  });

  it('keeps the five section contract and reports explicit content gaps', () => {
    expect(coverageReport.profileTabs).toEqual([
      '基本資料',
      '政策主張',
      '相關新聞',
      '從政歷程',
      '家族從政關係',
    ]);
    expect(coverageReport.candidatesWithVerifiedPolicyStatements).toBe(0);
    expect(coverageReport.candidatesWithPendingPolicyResearch).toBeGreaterThan(
      0,
    );
    expect(coverageReport).not.toHaveProperty('candidatesWithPositiveNews');
    expect(coverageReport).not.toHaveProperty('candidatesWithNegativeNews');
    expect(
      coverageReport.candidateInventory.every(
        (candidate) =>
          !('positiveNewsCount' in candidate) &&
          !('negativeNewsCount' in candidate),
      ),
    ).toBe(true);
    expect(coverageReport.individualVoteRecordCount).toBe(0);
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

    expect(sourceQualityReport.sourceReferenceIssues).toEqual([]);
    expect(sourceQualityReport.publishedRecordWithEvidenceCount).toBe(
      sourceQualityReport.publishedRecordCount,
    );
    expect(sourceQualityReport.publishedRecordWithResolvedSourcesCount).toBe(
      sourceQualityReport.publishedRecordCount,
    );
  });

  it('maps legacy record categories into the career tab', () => {
    expect(scopedCategoryToProfileTab('public-records')).toBe('career');
    expect(scopedCategoryToProfileTab('relationships')).toBe('career');
    expect(scopedCategoryToProfileTab('timeline')).toBe('career');
    expect(scopedCategoryToProfileTab('news')).toBe('news');
    expect(scopedCategoryToProfileTab('policies')).toBe('policies');
  });

  it('keeps vote availability conservative and separates career record types', () => {
    expect(
      officialCandidateProfiles.every((candidate) =>
        publicRecords(candidate).every((record) => !('votePosition' in record)),
      ),
    ).toBe(true);
    expect(
      coverageReport.formerLegislatorsWithVerifiedIndividualVotingRecords,
    ).toBe(0);
    expect(coverageReport.formerExecutivesWithVerifiedPolicyInitiatives).toBe(
      0,
    );
  });
});
