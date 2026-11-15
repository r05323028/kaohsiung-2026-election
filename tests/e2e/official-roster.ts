import { readFileSync } from 'node:fs';

type RosterCandidate = {
  id: string;
  slug: string;
  displayName: string;
  districtId: string;
  electionType: 'mayoral' | 'city-council' | 'indigenous-council';
  candidateNumber: string;
  publicationStatus: string;
};

type RosterDistrict = {
  id: string;
  slug: string;
  name: string;
  electionType: 'mayoral' | 'city-council' | 'indigenous-council';
  publicationStatus: string;
};

const dataset = JSON.parse(
  readFileSync(
    new URL(
      '../../data/approved/2026/kaohsiung-election.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as { candidates: RosterCandidate[]; districts: RosterDistrict[] };

export const officialCandidates = dataset.candidates.filter(
  (candidate) => candidate.publicationStatus === 'approved',
);

export const officialDistricts = dataset.districts.filter(
  (district) => district.publicationStatus === 'approved',
);

export const rosterTotal = officialCandidates.length;

export function candidatesForDistrict(districtId: string): RosterCandidate[] {
  return officialCandidates.filter(
    (candidate) => candidate.districtId === districtId,
  );
}

export const populatedDistricts = officialDistricts.filter(
  (district) => candidatesForDistrict(district.id).length > 0,
);

export const rosterGroupCount = populatedDistricts.length;

export const mayoralDistrictId =
  officialDistricts.find((district) => district.electionType === 'mayoral')
    ?.id ?? '';

export const mayoralCandidateCount =
  candidatesForDistrict(mayoralDistrictId).length;

export function districtBySlug(slug: string): RosterDistrict {
  const district = officialDistricts.find((item) => item.slug === slug);
  if (!district) throw new Error(`unknown official district slug: ${slug}`);
  return district;
}

export function candidateForDistrict(
  districtId: string,
  index = 0,
): RosterCandidate {
  const candidate = candidatesForDistrict(districtId)[index];
  if (!candidate) {
    throw new Error(`no official candidate for district: ${districtId}`);
  }
  return candidate;
}
