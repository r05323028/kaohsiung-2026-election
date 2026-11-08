import { demoDatasetInput } from './fixtures';
import { officialCandidateProfiles, officialDistricts } from './official';
import type { DemoDataset } from './schema';
import { validateDataset } from './schema';
import type { CandidateProfileView, DistrictView } from './view';

export * from './official';
export * from './schema';
export * from './view';

export const dataset: DemoDataset = validateDataset(demoDatasetInput);

export type CandidateProfile = CandidateProfileView;
export type ElectoralDistrictView = DistrictView;

export interface CandidateSearchRecord {
  id: string;
  slug: string;
  name: string;
  district: string;
  party: string;
  currentPosition: string;
  searchText: string;
}

const peopleById = new Map(dataset.people.map((person) => [person.id, person]));
const districtsById = new Map(
  dataset.districts.map((district) => [district.id, district]),
);
const visualsByCandidacyId = new Map(
  dataset.characterVisuals.map((visual) => [visual.candidacyId, visual]),
);
const sourcesById = new Map(
  dataset.sources.map((source) => [source.id, source]),
);

function required<T>(value: T | undefined, label: string): T {
  if (!value) throw new Error(`Validated demo dataset is missing ${label}.`);
  return value;
}

function getDemoCandidateProfile(slug: string): CandidateProfile | undefined {
  const candidacy = dataset.candidacies.find((item) => item.slug === slug);
  if (!candidacy) return undefined;
  const { cecDirectoryName, ...candidacyWithoutDirectoryName } = candidacy;

  const person = required(
    peopleById.get(candidacy.personId),
    `person ${candidacy.personId}`,
  );
  const district = required(
    districtsById.get(candidacy.districtId),
    `district ${candidacy.districtId}`,
  );
  const visual = required(
    visualsByCandidacyId.get(candidacy.id),
    `visual ${candidacy.id}`,
  );
  const sourceIds = new Set<string>();
  const collectSources = (ids: string[]) => {
    for (const id of ids) sourceIds.add(id);
  };
  const policies = dataset.policies.filter(
    (item) => item.personId === person.id,
  );
  const records = dataset.publicRecords.filter(
    (item) => item.personId === person.id,
  );
  const news = dataset.newsArticles.filter(
    (item) => item.personId === person.id,
  );
  const relationships = dataset.relationships.filter(
    (item) => item.fromPersonId === person.id,
  );
  const timeline = dataset.timelineEvents.filter(
    (item) => item.personId === person.id,
  );

  for (const policy of policies) collectSources(policy.sourceIds);
  for (const record of records) collectSources(record.sourceIds);
  for (const article of news) collectSources(article.sourceIds);
  for (const relationship of relationships)
    collectSources(relationship.sourceIds);
  for (const event of timeline) collectSources(event.sourceIds);

  return {
    person,
    candidacy: {
      ...candidacyWithoutDirectoryName,
      ...(cecDirectoryName ? { cecDirectoryName } : {}),
      candidateNumberStatus: candidacyWithoutDirectoryName.candidateNumber
        ? 'final'
        : 'not-published',
      publicationStatus: 'demo',
    },
    district,
    positions: person.previousPositions,
    policies,
    records,
    news,
    relationships,
    timeline,
    sources: [...sourceIds].map((id) =>
      required(sourcesById.get(id), `source ${id}`),
    ),
    visual,
  };
}

export const demoCandidateProfiles: CandidateProfile[] =
  dataset.candidacies.map((candidacy) =>
    required(
      getDemoCandidateProfile(candidacy.slug),
      `candidate ${candidacy.slug}`,
    ),
  );

export const candidateProfiles: CandidateProfile[] = [
  ...officialCandidateProfiles,
  ...demoCandidateProfiles,
];

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

export const districts: DistrictView[] = [
  ...officialDistricts,
  ...dataset.districts,
];

export function getDistrict(slug: string): DistrictView | undefined {
  return districts.find((district) => district.slug === slug);
}

export function getDistrictCandidates(districtId: string): CandidateProfile[] {
  return candidateProfiles.filter(
    (candidate) => candidate.district.id === districtId,
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
      searchText,
    };
  },
);
