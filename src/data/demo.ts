import { demoDatasetInput } from './fixtures';
import type { DemoDataset } from './schema';
import { validateDataset } from './schema';
import type { CandidateProfileView } from './view';

/** Test-only fictional fixture. Never import this module from production code. */
export const demoDataset: DemoDataset = validateDataset(demoDatasetInput);

const peopleById = new Map(
  demoDataset.people.map((person) => [person.id, person]),
);
const districtsById = new Map(
  demoDataset.districts.map((district) => [district.id, district]),
);
const visualsByCandidacyId = new Map(
  demoDataset.characterVisuals.map((visual) => [visual.candidacyId, visual]),
);
const sourcesById = new Map(
  demoDataset.sources.map((source) => [source.id, source]),
);

function required<T>(value: T | undefined, label: string): T {
  if (!value) throw new Error(`Validated demo dataset is missing ${label}.`);
  return value;
}

export function getDemoCandidateProfile(
  slug: string,
): CandidateProfileView | undefined {
  const candidacy = demoDataset.candidacies.find((item) => item.slug === slug);
  if (!candidacy) return undefined;
  const candidacyWithoutDirectoryName = {
    id: candidacy.id,
    slug: candidacy.slug,
    personId: candidacy.personId,
    districtId: candidacy.districtId,
    electionYear: candidacy.electionYear,
    electionType: candidacy.electionType,
    candidateNumber: candidacy.candidateNumber,
    politicalParty: candidacy.politicalParty,
    currentPosition: candidacy.currentPosition,
    portraitReference: candidacy.portraitReference,
    isDemo: candidacy.isDemo,
  };
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
  const policies = demoDataset.policies.filter(
    (item) => item.personId === person.id,
  );
  const records = demoDataset.publicRecords.filter(
    (item) => item.personId === person.id,
  );
  const news = demoDataset.newsArticles.filter(
    (item) => item.personId === person.id,
  );
  const relationships = demoDataset.relationships.filter(
    (item) => item.fromPersonId === person.id,
  );
  const timeline = demoDataset.timelineEvents.filter(
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

/** Test-only fictional profiles. Never import this module from production code. */
export const demoCandidateProfiles: CandidateProfileView[] =
  demoDataset.candidacies.map((candidacy) =>
    required(
      getDemoCandidateProfile(candidacy.slug),
      `candidate ${candidacy.slug}`,
    ),
  );
