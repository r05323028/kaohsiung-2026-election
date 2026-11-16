import { describe, expect, it } from 'vitest';
import { validatePoliticalFamilyVerificationCorrections } from './corrections';

const baseRecord = {
  candidateId: 'candidate-1',
  relationshipId: 'family-relation-0123456789ab',
  relativeName: '測試親屬',
  action: 'verify-after-pruning' as const,
  positionSource: 'verification-record' as const,
  removedClaims: [
    {
      organization: '測試組織',
      positionTitle: '測試職務',
      reason: '單一來源只記載推薦，不足以支持就任。',
      sourceUrls: ['https://example.com/source'],
    },
  ],
  reason: '移除過度主張後，親屬與其餘職務仍有獨立來源。',
  reviewedAgainst: ['https://example.com/source'],
};

function file(records: unknown[] = [baseRecord]) {
  return {
    correctionVersion: '1',
    datasetId: 'kaohsiung-2026-political-family-verification-corrections',
    appliedAt: '2026-11-16',
    reviewerRole: 'agent-evidence-correction',
    note: '測試更正檔。',
    records,
    candidateOutcomes: [],
  };
}

describe('political family verification corrections', () => {
  it('accepts a verification-record correction that only prunes claims', () => {
    const parsed = validatePoliticalFamilyVerificationCorrections(file());
    expect(parsed.records).toHaveLength(1);
    expect(parsed.records[0]?.positionSource).toBe('verification-record');
  });

  it('accepts a correction-record that supplies official replacement positions', () => {
    const parsed = validatePoliticalFamilyVerificationCorrections(
      file([
        {
          ...baseRecord,
          positionSource: 'correction-record',
          positions: [
            {
              organization: '高雄市議會',
              organizationType: 'legislature',
              positionTitle: '副議長',
              positionCategory: 'political',
              listingStatus: null,
              status: 'former-officeholder',
              startDate: '1977-12-30',
              endDate: '1979-06-30',
              sourceIds: ['source-1'],
            },
          ],
          positionSourceIds: ['source-1'],
        },
      ]),
    );
    expect(parsed.records[0]?.positions).toHaveLength(1);
  });

  it('rejects a correction-record without explicit positions or source IDs', () => {
    expect(() =>
      validatePoliticalFamilyVerificationCorrections(
        file([
          {
            ...baseRecord,
            positionSource: 'correction-record',
          },
        ]),
      ),
    ).toThrow(/requires explicit positions/);
  });

  it('rejects duplicate candidate and relative corrections', () => {
    expect(() =>
      validatePoliticalFamilyVerificationCorrections(
        file([
          baseRecord,
          {
            ...baseRecord,
            relationshipId: 'family-relation-ba9876543210',
          },
        ]),
      ),
    ).toThrow(/Duplicate correction/);
  });

  it('rejects a current corrected position that carries an end date', () => {
    expect(() =>
      validatePoliticalFamilyVerificationCorrections(
        file([
          {
            ...baseRecord,
            positionSource: 'correction-record',
            positions: [
              {
                organization: '高雄市議會',
                organizationType: 'legislature',
                positionTitle: '議員',
                positionCategory: 'political',
                listingStatus: null,
                status: 'current-officeholder',
                startDate: '2022-12-25',
                endDate: '2026-12-24',
                sourceIds: ['source-1'],
              },
            ],
            positionSourceIds: ['source-1'],
          },
        ]),
      ),
    ).toThrow(/must not carry an end date/);
  });
});
