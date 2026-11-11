import { describe, expect, it } from 'vitest';
import {
  auditBallotNumbers,
  ballotNumberContestKey,
  ballotNumberText,
  compareBallotNumbers,
  formatBallotNumber,
  isValidBallotNumber,
  normalizeBallotNumberInput,
  parseBallotNumber,
  sortCandidatesByBallotNumber,
} from './ballot';

describe('official ballot numbers', () => {
  it('normalizes full-width digits and whitespace before parsing', () => {
    expect(normalizeBallotNumberInput(' １２ ')).toBe('12');
    expect(parseBallotNumber(' １２ ')).toBe(12);
    expect(parseBallotNumber(' 7 ')).toBe(7);
  });

  it('rejects numbers that are not positive integers', () => {
    for (const value of [
      '',
      '0',
      '00',
      '007',
      '-1',
      '1.5',
      '一',
      null,
      undefined,
    ])
      expect(parseBallotNumber(value)).toBeNull();
    expect(isValidBallotNumber('12')).toBe(true);
    expect(isValidBallotNumber('１２')).toBe(true);
  });

  it('formats published numbers as 「N 號」 and keeps drafts unpublished', () => {
    expect(formatBallotNumber('3')).toBe('3 號');
    expect(formatBallotNumber('010')).toBeNull();
    expect(formatBallotNumber('abc')).toBeNull();
    expect(
      ballotNumberText({
        candidateNumber: '3',
        candidateNumberStatus: 'drawn',
      }),
    ).toBe('3 號');
    expect(
      ballotNumberText({
        candidateNumber: '3',
        candidateNumberStatus: 'final',
      }),
    ).toBe('3 號');
    expect(
      ballotNumberText({
        candidateNumber: '3',
        candidateNumberStatus: 'not-published',
      }),
    ).toBe('待公告');
    expect(ballotNumberText({ candidateNumber: '' })).toBe('待公告');
    expect(
      ballotNumberText({
        candidateNumber: '3',
        candidateNumberStatus: 'drawn',
      }),
    ).not.toContain('待公告');
  });

  it('sorts numerically, so 10 follows 9 instead of 1', () => {
    expect(compareBallotNumbers('9', '10')).toBeLessThan(0);
    expect(compareBallotNumbers('10', '2')).toBeGreaterThan(0);
    expect(compareBallotNumbers('3', '3')).toBe(0);
    expect(compareBallotNumbers('', '1')).toBeGreaterThan(0);
    expect(compareBallotNumbers('', '')).toBe(0);

    const sorted = sortCandidatesByBallotNumber(
      ['10', '2', '1', '11', '9'].map((number) => ({
        candidacy: {
          id: `candidate-${number}`,
          candidateNumber: number,
          candidateNumberStatus: 'drawn' as const,
        },
      })),
    );
    expect(sorted.map((item) => item.candidacy.candidateNumber)).toEqual([
      '1',
      '2',
      '9',
      '10',
      '11',
    ]);
  });

  it('keeps mayoral and council contests separate', () => {
    const audit = auditBallotNumbers([
      {
        candidateId: 'mayor-a',
        candidateName: '甲',
        electionType: 'mayoral',
        districtId: 'district-mayor',
        candidateNumber: '1',
        candidateNumberStatus: 'drawn',
      },
      {
        candidateId: 'council-a',
        candidateName: '乙',
        electionType: 'city-council',
        districtId: 'district-01',
        candidateNumber: '1',
        candidateNumberStatus: 'drawn',
      },
    ]);
    expect(audit.ok).toBe(true);
    expect(audit.duplicates).toHaveLength(0);
    expect(audit.contests).toHaveLength(2);
    expect(
      ballotNumberContestKey({
        electionType: 'mayoral',
        districtId: 'district-mayor',
      }),
    ).toBe('mayoral:district-mayor');
  });

  it('flags duplicate numbers inside one contest', () => {
    const audit = auditBallotNumbers([
      {
        candidateId: 'a',
        candidateName: '甲',
        electionType: 'city-council',
        districtId: 'district-01',
        candidateNumber: '2',
        candidateNumberStatus: 'drawn',
      },
      {
        candidateId: 'b',
        candidateName: '乙',
        electionType: 'city-council',
        districtId: 'district-01',
        candidateNumber: '2',
        candidateNumberStatus: 'drawn',
      },
    ]);
    expect(audit.ok).toBe(false);
    expect(audit.duplicates).toEqual([
      {
        contest: 'city-council:district-01',
        ballotNumber: 2,
        candidateIds: ['a', 'b'],
      },
    ]);
  });

  it('flags unpublished, invalid and unprovenanced numbers', () => {
    const entries = [
      {
        candidateId: 'a',
        candidateName: '甲',
        electionType: 'city-council',
        districtId: 'district-01',
        candidateNumber: '1',
        candidateNumberStatus: 'drawn' as const,
      },
      {
        candidateId: 'b',
        candidateName: '乙',
        electionType: 'city-council',
        districtId: 'district-01',
        candidateNumber: 'x',
        candidateNumberStatus: 'drawn' as const,
      },
      {
        candidateId: 'c',
        candidateName: '丙',
        electionType: 'city-council',
        districtId: 'district-01',
        candidateNumber: '',
        candidateNumberStatus: 'not-published' as const,
      },
    ];
    const audit = auditBallotNumbers(entries, {
      hasProvenance: (entry) => entry.candidateId !== 'a',
    });
    expect(audit.total).toBe(3);
    expect(audit.numbered).toBe(2);
    expect(audit.unpublished.map((entry) => entry.candidateId)).toEqual(['c']);
    expect(audit.invalid.map((entry) => entry.candidateId)).toEqual(['b']);
    expect(audit.missingProvenance.map((entry) => entry.candidateId)).toEqual([
      'a',
    ]);
    expect(audit.ok).toBe(false);
  });

  it('reports contiguous ranges only through sorted contest numbers', () => {
    const audit = auditBallotNumbers([
      {
        candidateId: 'a',
        candidateName: '甲',
        electionType: 'mayoral',
        districtId: 'district-mayor',
        candidateNumber: '3',
        candidateNumberStatus: 'drawn',
      },
      {
        candidateId: 'b',
        candidateName: '乙',
        electionType: 'mayoral',
        districtId: 'district-mayor',
        candidateNumber: '1',
        candidateNumberStatus: 'drawn',
      },
      {
        candidateId: 'c',
        candidateName: '丙',
        electionType: 'mayoral',
        districtId: 'district-mayor',
        candidateNumber: '5',
        candidateNumberStatus: 'drawn',
      },
    ]);
    expect(audit.contests[0]?.numbers).toEqual([1, 3, 5]);
  });
});
