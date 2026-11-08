import { describe, expect, it } from 'vitest';
import normalizedInput from '../../../data/normalized/2026/biographies.json';
import reviewInput from '../../../data/review/2026/biographies-review.json';
import verificationInput from '../../../reports/biography-verification.json';
import {
  cleanHtml,
  parseKccDirectory,
  parseKccProfile,
  parseMoiDetail,
} from './adapters';
import { getBiographyReadModel, publicationBiographySnapshot } from './index';
import {
  assertClaimEvidence,
  BiographyPublishedClaimSchema,
  validateBiographyDataset,
  validateBiographyReviewDataset,
} from './schema';

describe('biography source adapters', () => {
  it('extracts a KCC directory identity deterministically', () => {
    const html = `<a href="MemberInfo_New.aspx?n=39&sms=9028&msn=2171"><div class="name">測試議員</div><div title="測試政黨" class="detail">第1選區</div></a>`;
    expect(parseKccDirectory(html)).toEqual([
      {
        msn: '2171',
        observedName: '測試議員',
        observedParty: '測試政黨',
        observedDistrict: '第1選區',
        excerpt: expect.stringContaining('測試議員'),
      },
    ]);
  });

  it('extracts KCC education and experience without inventing dates', () => {
    const html = `<title>高雄市議會-本屆議員-測試議員</title><div>所屬政黨：測試黨</div><h4>學歷</h4><ul><li>測試大學</li><li>測試研究所</li></ul><h4>經歷</h4><ul><li>測試公司</li><li>測試職務</li></ul><h4>政見</h4>`;
    expect(parseKccProfile(html, '2171')).toMatchObject({
      msn: '2171',
      observedName: '測試議員',
      observedParty: '測試黨',
      education: ['測試大學', '測試研究所'],
      experience: ['測試公司', '測試職務'],
    });
  });

  it('extracts MOI labelled fields and decodes HTML', () => {
    const html = `<div class="title">高雄市議會</div><div class="name"><span>測試議員</span></div><div class="caption">學歷：</div><ul><li>測試大學&nbsp;畢業</li></ul>`;
    const parsed = parseMoiDetail(html, 'ER-test');
    expect(parsed).toMatchObject({
      externalIdentifier: 'ER-test',
      observedName: '測試議員',
      jurisdiction: '高雄市議會',
      fields: { 學歷: ['測試大學 畢業'] },
    });
    expect(cleanHtml('<p>甲&nbsp;&amp;&amp;乙</p>')).toBe('甲 &&乙');
  });
});

describe('biography contracts and read model', () => {
  it('validates the generated dataset and every claim evidence link', () => {
    const dataset = validateBiographyDataset(normalizedInput);
    expect(dataset.candidateCount).toBe(106);
    expect(dataset.claims.length).toBeGreaterThan(0);
    expect(
      dataset.claims.every(
        (claim) => claim.publicationStatus !== 'approved-static',
      ),
    ).toBe(true);
    expect(() => assertClaimEvidence(dataset)).not.toThrow();
    expect(validateBiographyReviewDataset(reviewInput).status).toBe(
      'pending-human-review',
    );
  });

  it('rejects static publication in the machine-normalized layer', () => {
    const dataset = structuredClone(validateBiographyDataset(normalizedInput));
    const firstClaim = dataset.claims.at(0);
    if (!firstClaim) throw new Error('Biography fixture has no claim.');
    firstClaim.publicationStatus = 'approved-static';
    expect(() => validateBiographyDataset(dataset)).toThrow(
      'Static publication requires',
    );
  });

  it('keeps verification samples limited to candidate-supporting sources', () => {
    const dataset = validateBiographyDataset(normalizedInput);
    for (const sample of verificationInput.samples) {
      const expectedSourceIds = new Set([
        ...dataset.observations
          .filter((observation) =>
            observation.candidateIds.includes(sample.candidateId),
          )
          .map((observation) => observation.sourceId),
        ...dataset.claims
          .filter((claim) => claim.candidateId === sample.candidateId)
          .flatMap((claim) => claim.sourceIds),
      ]);
      expect(new Set(sample.sourceIds)).toEqual(expectedSourceIds);
      if (sample.status === 'reopened-no-match-not-negative')
        expect(sample.sourceIds).toHaveLength(0);
    }
  });

  it('keeps reviewer metadata out of published claim shapes', () => {
    const dataset = validateBiographyDataset(normalizedInput);
    const firstClaim = dataset.claims.at(0);
    if (!firstClaim) throw new Error('Biography fixture has no claim.');
    const { reviewerId, reviewedAt, ...publicFields } = firstClaim;
    expect(reviewerId).toBeNull();
    expect(reviewedAt).toBeNull();
    const published = BiographyPublishedClaimSchema.parse({
      ...publicFields,
      humanReviewStatus: 'human-reviewed',
      editorialStatus: 'editorially-approved',
      publicationStatus: 'approved-static',
    });
    expect(published).not.toHaveProperty('reviewerId');
    expect(published).not.toHaveProperty('reviewedAt');
    expect(() =>
      BiographyPublishedClaimSchema.parse({ ...published, reviewerId: null }),
    ).toThrow();
    expect(
      publicationBiographySnapshot.records.every(
        (claim) =>
          !Object.hasOwn(claim, 'reviewerId') &&
          !Object.hasOwn(claim, 'reviewedAt'),
      ),
    ).toBe(true);
  });

  it('exposes pending status and never leaks unapproved claims', () => {
    const knownCandidate =
      'official-candidate-2026-district-kaohsiung-council-10-8aa5784f';
    const pending = getBiographyReadModel(knownCandidate);
    expect(pending).toMatchObject({
      status: 'pending-human-review',
      claims: [],
    });
    expect(pending).not.toHaveProperty('pendingClaimCount');
    expect(
      getBiographyReadModel('candidate-with-no-biography-evidence'),
    ).toMatchObject({
      status: 'pending-human-review',
      claims: [],
    });
  });
});
