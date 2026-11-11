import { describe, expect, it } from 'vitest';
import { candidateProfiles, getDistrictCandidates, searchIndex } from './index';
import {
  getOfficialDistrictCandidates,
  officialCandidateProfiles,
  officialDataset,
} from './official';
import {
  BALLOT_NUMBER_PUBLICATION_DATE,
  BALLOT_NUMBER_SOURCE_ID,
  formatBallotNumber,
  parseBallotNumber,
} from './official/ballot';

const approved = officialDataset.candidates.filter(
  (candidate) => candidate.publicationStatus === 'approved',
);

const numbersOf = (
  items: readonly { candidacy: { candidateNumber: string } }[],
) => items.map((item) => parseBallotNumber(item.candidacy.candidateNumber));

describe('official ballot numbers in the shipped dataset', () => {
  it('publishes a verified number for every approved candidate', () => {
    expect(approved).toHaveLength(106);
    for (const candidate of approved) {
      expect(parseBallotNumber(candidate.candidateNumber)).not.toBeNull();
      expect(['drawn', 'final']).toContain(candidate.candidateNumberStatus);
      expect(candidate.candidateNumberSource?.sourceId).toBe(
        BALLOT_NUMBER_SOURCE_ID,
      );
      expect(candidate.candidateNumberSource?.publicationDate).toBe(
        BALLOT_NUMBER_PUBLICATION_DATE,
      );
      expect(candidate.candidateNumberSource?.page).toBe(1);
      expect(candidate.candidateNumberSource?.tableReference ?? '').not.toBe(
        '',
      );
    }
  });

  it('does not duplicate a number inside a contest', () => {
    const seen = new Map<string, string>();
    for (const candidate of approved) {
      const key = `${candidate.electionType}:${candidate.districtId}:${candidate.candidateNumber}`;
      expect(
        seen.has(key),
        `${key} repeats between ${seen.get(key)} and ${candidate.id}`,
      ).toBe(false);
      seen.set(key, candidate.id);
    }
    expect(seen.size).toBe(106);
  });

  it('covers the mayoral race, 11 regular and 4 Indigenous constituencies', () => {
    const counts = new Map<string, number>();
    for (const candidate of approved)
      counts.set(
        candidate.districtId,
        (counts.get(candidate.districtId) ?? 0) + 1,
      );
    expect(counts.get('district-kaohsiung-mayor-2026')).toBe(5);
    for (let number = 1; number <= 11; number += 1) {
      const id = `district-kaohsiung-council-${String(number).padStart(2, '0')}`;
      expect(counts.get(id) ?? 0).toBeGreaterThan(0);
    }
    const indigenous = approved.filter(
      (candidate) => candidate.electionType === 'indigenous-council',
    );
    expect(indigenous).toHaveLength(10);
    expect(
      new Set(indigenous.map((candidate) => candidate.districtId)).size,
    ).toBe(4);
  });

  it('orders every candidate collection by numeric ballot number', () => {
    const check = (
      items: readonly {
        candidacy: { districtId: string; candidateNumber: string };
      }[],
    ) => {
      const byDistrict = new Map<string, number[]>();
      for (const item of items) {
        const list = byDistrict.get(item.candidacy.districtId) ?? [];
        list.push(parseBallotNumber(item.candidacy.candidateNumber) ?? 0);
        byDistrict.set(item.candidacy.districtId, list);
      }
      for (const numbers of byDistrict.values())
        expect(numbers).toEqual(
          [...numbers].sort((left, right) => left - right),
        );
    };
    check(officialCandidateProfiles);
    check(candidateProfiles);
    for (const district of officialDataset.districts) {
      check(getDistrictCandidates(district.id));
      check(getOfficialDistrictCandidates(district.id));
    }
  });

  it('keeps 「10 號」 after 「9 號」 in a twelve-seat constituency', () => {
    const districtFour = getDistrictCandidates('district-kaohsiung-council-04');
    expect(districtFour).toHaveLength(12);
    expect(numbersOf(districtFour)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
  });

  it('exposes the same formatted number in the search index', () => {
    expect(searchIndex).toHaveLength(106);
    for (const record of searchIndex) {
      const candidate = approved.find((item) => item.id === record.id);
      expect(candidate).toBeDefined();
      expect(record.ballotNumber).toBe(
        formatBallotNumber(candidate?.candidateNumber),
      );
    }
  });

  it('keeps drawn numbers visible to the public view model', () => {
    const drawn = candidateProfiles.filter(
      (profile) => profile.candidacy.candidateNumberStatus === 'drawn',
    );
    expect(drawn.length).toBeGreaterThan(0);
    for (const profile of drawn) {
      expect(profile.candidacy.candidateNumber).not.toBe('');
      expect(profile.candidacy.candidateNumber).not.toBe('待公告');
    }
  });
});
