import { describe, expect, it } from 'vitest';
import { candidateProfiles, districts } from '../data';
import { compareBallotNumbers } from '../data/official/ballot';
import { groupCandidatesByConstituency } from './CandidateBottomSheet';

describe('groupCandidatesByConstituency', () => {
  it('covers canonical roster in official constituency order', () => {
    const groups = groupCandidatesByConstituency(candidateProfiles, districts);
    const expectedGroups = districts.filter((district) =>
      candidateProfiles.some(
        (candidate) => candidate.candidacy.districtId === district.id,
      ),
    );

    expect(groups.map((group) => group.district.id)).toEqual(
      expectedGroups.map((district) => district.id),
    );
    expect(
      groups.reduce((total, group) => total + group.candidates.length, 0),
    ).toBe(candidateProfiles.length);

    const groupedIds = groups.flatMap((group) =>
      group.candidates.map((candidate) => candidate.candidacy.id),
    );
    const canonicalIds = candidateProfiles.map(
      (candidate) => candidate.candidacy.id,
    );

    expect(new Set(groupedIds).size).toBe(canonicalIds.length);
    expect([...groupedIds].sort()).toEqual([...canonicalIds].sort());
  });

  it('sorts candidates by published ballot number within each group', () => {
    const groups = groupCandidatesByConstituency(candidateProfiles, districts);

    for (const group of groups) {
      for (let index = 1; index < group.candidates.length; index += 1) {
        const previous = group.candidates[index - 1];
        const current = group.candidates[index];
        if (!previous || !current) continue;
        expect(
          compareBallotNumbers(
            previous.candidacy.candidateNumber,
            current.candidacy.candidateNumber,
          ),
        ).toBeLessThanOrEqual(0);
      }
    }
  });
});
