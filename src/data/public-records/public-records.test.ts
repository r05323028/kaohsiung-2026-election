import { describe, expect, it } from 'vitest';
import approvedInput from '../../../data/approved/2026/kaohsiung-public-records.json';
import {
  parseKccMemberProfile,
  parseKccNewsArticle,
  sourceChangeStatus,
} from './adapters';
import {
  candidateResearchDataset,
  getCandidateResearchSummary,
  getPublicRecordBundle,
  getPublicRecordSourceIds,
  publicRecordsDataset,
} from './index';
import {
  type PublicRecordsDataset,
  validatePublicRecordsDataset,
} from './schema';

const manifestSourceIds = new Set(publicRecordsDataset.sourceIds);

describe('public-record adapters', () => {
  it('parses institutional identity and news deterministically', () => {
    const memberHtml =
      '<title>本屆議員-測試議員|高雄市議會</title><body>本屆議員 測試議員</body>';
    const firstMember = parseKccMemberProfile(
      memberHtml,
      'source-kcc-member-9999-test',
    );
    const secondMember = parseKccMemberProfile(
      memberHtml,
      'source-kcc-member-9999-test',
    );
    expect(secondMember).toEqual(firstMember);
    expect(firstMember).toMatchObject({
      displayName: '測試議員',
      memberIdentifier: '9999',
      isCurrentMemberPage: true,
    });

    const newsHtml =
      '<title>測試議員總質詢摘要</title><body>高雄市議會 測試議員</body>';
    expect(
      parseKccNewsArticle(newsHtml, 'source-kcc-news-test', '測試議員'),
    ).toMatchObject({
      publisher: '高雄市議會',
      mentionsCandidate: true,
    });
    expect(sourceChangeStatus('same', 'same')).toBe('unchanged');
    expect(sourceChangeStatus('old', 'new')).toBe('changed');
  });
});

describe('candidate research read model', () => {
  it('exposes machine research status without inventing approval', () => {
    expect(candidateResearchDataset.candidateCount).toBe(106);
    const summary = getCandidateResearchSummary(
      'official-mayor-zhang-jing-2026',
    );
    expect(summary).toMatchObject({
      reviewStatus: 'pending-human-review',
      identityStatus: 'roster-verified',
      attemptedCategoryCount: 3,
      retrievedCategoryCount: 3,
    });
    expect(summary?.note).toContain('人工審查尚未完成');
    expect(
      getCandidateResearchSummary(
        'official-candidate-2026-district-kaohsiung-council-03-53fbb71e',
      )?.identityStatus,
    ).toBe('conflicted');
  });
});

describe('validated public-record dataset', () => {
  it('keeps selected bundles isolated and leaves missing candidates neutral', () => {
    const liPersonId = 'person-kaohsiung-council-04-a7ed58d6';
    const wangPersonId = 'person-kaohsiung-council-12-1a977b21';
    const laiPersonId = 'person-lai-rui-long-2026';
    const liBundle = getPublicRecordBundle(liPersonId);
    const wangBundle = getPublicRecordBundle(wangPersonId);
    expect(liBundle?.personId).toBe(liPersonId);
    expect(liBundle?.activities.length).toBe(2);
    expect(liBundle?.news.length).toBe(2);
    expect(wangBundle?.personId).toBe(wangPersonId);
    expect(wangBundle?.activities.length).toBe(2);
    expect(wangBundle?.news.length).toBe(2);
    expect(getPublicRecordBundle(laiPersonId)).toBeUndefined();
    const liSourceIds = getPublicRecordSourceIds(liPersonId);
    expect(liSourceIds).toHaveLength(3);
    expect(liSourceIds).toEqual(
      expect.arrayContaining([
        'source-kcc-news-17284',
        'source-kcc-news-17102',
        'source-kcc-member-2186-li-meizhen',
      ]),
    );
  });

  it('validates every approved item against evidence and forbids reviewer metadata while pending', () => {
    const parsed = validatePublicRecordsDataset(
      approvedInput,
      manifestSourceIds,
    );
    expect(parsed.review.status).toBe('pending-human-review');
    expect(parsed.claims.every((claim) => claim.evidenceIds.length > 0)).toBe(
      true,
    );
    expect(
      parsed.evidence.every((item) => parsed.sourceIds.includes(item.sourceId)),
    ).toBe(true);

    const missingEvidence = structuredClone(parsed) as PublicRecordsDataset;
    const firstClaim = missingEvidence.claims.at(0);
    if (!firstClaim) throw new Error('Dataset has no claim fixture.');
    firstClaim.evidenceIds = ['missing-evidence'];
    expect(() =>
      validatePublicRecordsDataset(missingEvidence, manifestSourceIds),
    ).toThrow('references missing evidence');

    const crossLinkedEvidence = structuredClone(parsed) as PublicRecordsDataset;
    const secondClaim = crossLinkedEvidence.claims.at(1);
    const firstEvidence = crossLinkedEvidence.evidence.at(0);
    if (!secondClaim || !firstEvidence)
      throw new Error('Dataset lacks multiple claim fixtures.');
    secondClaim.evidenceIds = [firstEvidence.evidenceId];
    expect(() =>
      validatePublicRecordsDataset(crossLinkedEvidence, manifestSourceIds),
    ).toThrow('for claim');

    const invertedDates = structuredClone(parsed) as PublicRecordsDataset;
    const datedClaim = invertedDates.claims.at(0);
    if (!datedClaim) throw new Error('Dataset has no date fixture.');
    datedClaim.validFrom = '2026-12-01';
    datedClaim.validTo = '2026-01-01';
    expect(() =>
      validatePublicRecordsDataset(invertedDates, manifestSourceIds),
    ).toThrow('inverted validity range');

    const unresolvedConflict = structuredClone(parsed) as PublicRecordsDataset;
    const conflictClaimIds = unresolvedConflict.claims
      .slice(0, 2)
      .map((claim) => claim.claimId);
    unresolvedConflict.conflicts.push({
      conflictId: 'conflict-test',
      conflictType: 'position-title',
      claimIds: conflictClaimIds,
      description: 'synthetic conflict',
      status: 'resolved',
      resolution: null,
    });
    expect(() =>
      validatePublicRecordsDataset(unresolvedConflict, manifestSourceIds),
    ).toThrow('must include a resolution');

    const unreviewedWithReviewer = structuredClone(
      parsed,
    ) as PublicRecordsDataset;
    unreviewedWithReviewer.review.reviewerId = 'invented-reviewer';
    expect(() =>
      validatePublicRecordsDataset(unreviewedWithReviewer, manifestSourceIds),
    ).toThrow('cannot contain reviewer identity');

    const approvedWithoutReviewer = structuredClone(
      parsed,
    ) as PublicRecordsDataset;
    approvedWithoutReviewer.review.status = 'approved';
    expect(() =>
      validatePublicRecordsDataset(approvedWithoutReviewer, manifestSourceIds),
    ).toThrow('must contain reviewer identity');
  });
});
