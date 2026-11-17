import { officialCandidateProfiles, officialDistricts } from './official';
import {
  formatBallotNumber,
  sortCandidatesByBallotNumber,
} from './official/ballot';
import type { CandidateProfileView, DistrictView } from './view';

export * from './constituencies';
export * from './official';
export * from './schema';
export * from './view';

export type CandidateProfile = CandidateProfileView;
export type ElectoralDistrictView = DistrictView;

export interface CandidateSearchRecord {
  id: string;
  slug: string;
  name: string;
  district: string;
  party: string;
  currentPosition: string;
  ballotNumber: string;
  searchText: string;
}

export const candidateProfiles: CandidateProfile[] = officialCandidateProfiles;

export function getCandidateProfile(
  slug: string,
): CandidateProfile | undefined {
  return candidateProfiles.find(
    (candidate) => candidate.candidacy.slug === slug,
  );
}

export function getCandidateProfiles(): CandidateProfile[] {
  return candidateProfiles;
}

export const districts: DistrictView[] = officialDistricts;

export function getDistrict(slug: string): DistrictView | undefined {
  return districts.find((district) => district.slug === slug);
}

export function getDistrictCandidates(districtId: string): CandidateProfile[] {
  return sortCandidatesByBallotNumber(
    candidateProfiles.filter(
      (candidate) => candidate.district.id === districtId,
    ),
  );
}

export const searchIndex: CandidateSearchRecord[] = candidateProfiles.map(
  (candidate) => {
    const { candidacy, district, person } = candidate;
    const searchText = [
      person.displayName,
      district.name,
      candidacy.politicalParty,
      candidacy.currentPosition,
      formatBallotNumber(candidacy.candidateNumber),
    ]
      .join(' ')
      .toLocaleLowerCase();
    return {
      id: candidacy.id,
      slug: candidacy.slug,
      name: person.displayName,
      district: district.name,
      party: candidacy.politicalParty,
      currentPosition: candidacy.currentPosition,
      ballotNumber: formatBallotNumber(candidacy.candidateNumber) ?? '',
      searchText,
    };
  },
);
