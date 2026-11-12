import approvedInput from '../../../data/approved/2026/kaohsiung-election.json';
import manifestInput from '../../../data/official-source-manifest.json';
import { getBasicProfileReadModel } from '../basic-profiles';
import { getBiographyReadModel } from '../biographies';
import { coverageForDistrictSlug } from '../constituencies';
import { getAutomatedCandidateReadModel } from '../enrichment/automated-publication';
import { getCandidatePolicyResearchSummary } from '../policy-research';
import {
  getCandidateResearchSummary,
  getPublicRecordBundle,
  getPublicRecordSourceIds,
  publicRecordsDataset,
} from '../public-records';
import { getCandidatePublicRecordResearchSummary } from '../public-records/enrichment-summary';

export { publicRecordsDataset };

import type { CandidateProfileView, DistrictView } from '../view';
import {
  compareCandidatesByBallotNumber,
  formatBallotNumber,
  sortCandidatesByBallotNumber,
} from './ballot';
import {
  type OfficialCandidate,
  type OfficialDataset,
  type OfficialDistrict,
  validateOfficialDataset,
} from './schema';

export const officialDataset: OfficialDataset =
  validateOfficialDataset(approvedInput);
type ManifestSource = {
  id: string;
  publisher: string;
  title: string;
  canonicalUrl: string;
  publicationDate: string | null;
  retrievalDate: string;
  verificationStatus: string;
};

type SourceManifest = { sources: ManifestSource[] };
const sourceManifest = manifestInput as SourceManifest;

export const officialSourceManifest = manifestInput;
const manifestSourceById = new Map(
  sourceManifest.sources.map((source) => [source.id, source]),
);
const sourceById = new Map(
  officialDataset.sources.map((source) => [source.id, source]),
);
const districtById = new Map(
  officialDataset.districts.map((district) => [district.id, district]),
);
/** Dataset order is the official contest order: mayor, then districts 1–15. */
const districtOrderById = new Map(
  officialDataset.districts.map((district, index) => [district.id, index]),
);

type ProfileSource = CandidateProfileView['sources'][number];

function sourceFor(id: string): ProfileSource {
  const source = sourceById.get(id);
  if (source) {
    return {
      id: source.id,
      url: source.url,
      publisher: source.publisher,
      publicationDate: source.publicationDate,
      retrievalDate: source.retrievalDate,
      verificationStatus: source.verificationStatus,
      relatedEntityIds: [],
      note: source.note,
      isDemo: false,
    };
  }
  const manifestSource = manifestSourceById.get(id);
  if (!manifestSource)
    throw new Error(`Approved public-record dataset is missing source ${id}.`);
  return {
    id: manifestSource.id,
    url: manifestSource.canonicalUrl,
    publisher: manifestSource.publisher,
    publicationDate: manifestSource.publicationDate,
    retrievalDate: manifestSource.retrievalDate,
    verificationStatus:
      manifestSource.verificationStatus === 'verified'
        ? ('Verified' as const)
        : ('Pending review' as const),
    relatedEntityIds: [],
    note: manifestSource.publicationDate
      ? manifestSource.title
      : `${manifestSource.title}（出版日期未標示）`,
    isDemo: false,
  };
}

function toDistrictView(district: OfficialDistrict): DistrictView {
  const constituencyCoverage = coverageForDistrictSlug(district.slug);
  return {
    id: district.id,
    slug: district.slug,
    name: district.name,
    electionType: district.electionType,
    constituencyType: district.constituencyType,
    districtLabel: district.districtLabel,
    description: district.description,
    scopeNote: district.scopeNote,
    isDemo: false,
    ...(constituencyCoverage ? { constituencyCoverage } : {}),
  };
}

export const officialDistricts: DistrictView[] = officialDataset.districts
  .filter((district) => district.publicationStatus === 'approved')
  .map(toDistrictView);

function neutralVisual(candidacyId: string, index: number) {
  return {
    candidacyId,
    renderer: 'procedural' as const,
    modelAsset: null,
    position: [
      ((index % 5) - 2) * 2.3,
      0.85,
      (Math.floor(index / 5) % 2) * 0.8,
    ] as [number, number, number],
    rotation: 0,
    palette: {
      skin: '#F2C6A0',
      hair: '#294858',
      top: '#4CAFA8',
      bottom: '#294858',
      accessory: '#E99679',
    },
    accessory: 'none' as const,
    animation: {
      idle: 'gentle-breathe',
      greeting: 'small-wave',
      reducedMotion: 'still',
    },
    isDemo: false,
  };
}

function toProfile(
  candidate: OfficialCandidate,
  index: number,
): CandidateProfileView {
  const district = districtById.get(candidate.districtId);
  if (!district)
    throw new Error(
      `Approved official dataset is missing district ${candidate.districtId}.`,
    );
  const personId = `person-${candidate.slug}`;
  const candidacyId = candidate.id;
  const publicRecords = getPublicRecordBundle(personId);
  const publicSourceIds = getPublicRecordSourceIds(personId);
  const research = getCandidateResearchSummary(candidate.id);
  const policyResearch = getCandidatePolicyResearchSummary(candidate.id);
  const publicRecordResearch = getCandidatePublicRecordResearchSummary(
    candidate.id,
  );
  const biography = getBiographyReadModel(candidate.id);
  const basicProfile = getBasicProfileReadModel(candidate.id);
  const automatedPublication = getAutomatedCandidateReadModel(candidate.id);
  const researchSourceIds = research?.sourceIds ?? [];
  const sources = [
    ...new Set([
      ...candidate.sourceIds,
      ...publicSourceIds,
      ...researchSourceIds,
    ]),
  ].map(sourceFor);
  return {
    person: {
      id: personId,
      slug: candidate.slug,
      displayName: candidate.displayName,
      shortName: candidate.shortName,
      summary: candidate.summary,
      education: [],
      professionalExperience: [],
      previousPositions: [],
      isDemo: false,
    },
    candidacy: {
      id: candidacyId,
      slug: candidate.slug,
      personId,
      districtId: candidate.districtId,
      electionYear: candidate.electionYear,
      electionType: candidate.electionType,
      candidateNumber: candidate.candidateNumber,
      ...(candidate.birthDate ? { birthDate: candidate.birthDate } : {}),
      ...(candidate.cecDirectoryName
        ? { cecDirectoryName: candidate.cecDirectoryName }
        : {}),
      politicalParty: candidate.politicalParty ?? '目前尚未刊載政黨資訊',
      partyStatus: candidate.partyStatus,
      currentPosition: candidate.currentPosition,
      portraitReference: candidate.portraitReference,
      isDemo: false,
      candidateNumberStatus: candidate.candidateNumberStatus,
      publicationStatus: candidate.publicationStatus,
    },
    district: toDistrictView(district),
    positions: [],
    policies: [],
    records: [],
    news: [],
    relationships: [],
    timeline: [],
    sources,
    ...(publicRecords ? { publicRecords } : {}),
    ...(research ? { research } : {}),
    ...(policyResearch ? { policyResearch } : {}),
    ...(publicRecordResearch ? { publicRecordResearch } : {}),
    ...(biography ? { biography } : {}),
    ...(basicProfile ? { basicProfile } : {}),
    ...(automatedPublication.claims.length > 0 ? { automatedPublication } : {}),
    visual: neutralVisual(candidacyId, index),
  };
}

/**
 * Canonical display order: official contest order (mayor first, then electoral
 * districts 1–15) and ascending ballot number inside each contest. Every view
 * derives its ordering from this list, so no page can drift independently.
 */
function compareProfilesByContestAndBallot(
  left: CandidateProfileView,
  right: CandidateProfileView,
): number {
  const leftDistrict =
    districtOrderById.get(left.district.id) ?? Number.MAX_SAFE_INTEGER;
  const rightDistrict =
    districtOrderById.get(right.district.id) ?? Number.MAX_SAFE_INTEGER;
  if (leftDistrict !== rightDistrict) return leftDistrict - rightDistrict;
  return compareCandidatesByBallotNumber(left, right);
}

export const officialCandidateProfiles: CandidateProfileView[] =
  officialDataset.candidates
    .filter((candidate) => candidate.publicationStatus === 'approved')
    .map(toProfile)
    .sort(compareProfilesByContestAndBallot);

export type OfficialSearchRecord = {
  id: string;
  slug: string;
  name: string;
  district: string;
  party: string;
  currentPosition: string;
  ballotNumber: string;
  searchText: string;
};

export const officialSearchIndex: OfficialSearchRecord[] =
  officialCandidateProfiles.map((candidate) => {
    const { candidacy, district, person } = candidate;
    return {
      id: candidacy.id,
      slug: candidacy.slug,
      name: person.displayName,
      district: district.name,
      party: candidacy.politicalParty,
      currentPosition: candidacy.currentPosition,
      ballotNumber: formatBallotNumber(candidacy.candidateNumber) ?? '',
      searchText: [
        person.displayName,
        district.name,
        candidacy.politicalParty,
        candidacy.currentPosition,
        formatBallotNumber(candidacy.candidateNumber),
      ]
        .join(' ')
        .toLocaleLowerCase(),
    };
  });

export function getOfficialCandidateProfile(
  slug: string,
): CandidateProfileView | undefined {
  return officialCandidateProfiles.find(
    (candidate) => candidate.candidacy.slug === slug,
  );
}

export function getOfficialDistrict(slug: string): DistrictView | undefined {
  return officialDistricts.find((district) => district.slug === slug);
}

export function getOfficialDistrictCandidates(
  districtId: string,
): CandidateProfileView[] {
  return sortCandidatesByBallotNumber(
    officialCandidateProfiles.filter(
      (candidate) => candidate.district.id === districtId,
    ),
  );
}
