import approvedInput from '../../../data/approved/2026/kaohsiung-election.json';
import publicationInput from '../../../data/published/2026/political-family.json';
import {
  type FamilyEvidenceSource,
  type FamilyRosterCandidate,
  type PoliticalFamilyPublication,
  type PoliticalPerson,
  validatePoliticalFamilyPublication,
  validatePoliticalFamilyPublicationReferences,
} from './schema';

function rosterElectionType(
  value: string,
): FamilyRosterCandidate['electionType'] {
  if (
    value === 'mayoral' ||
    value === 'city-council' ||
    value === 'indigenous-council'
  ) {
    return value;
  }
  throw new Error(`Unknown political family election type: ${value}.`);
}

const roster: FamilyRosterCandidate[] = approvedInput.candidates.map(
  (candidate) => ({
    id: candidate.id,
    slug: candidate.slug,
    displayName: candidate.displayName,
    districtId: candidate.districtId,
    electionType: rosterElectionType(candidate.electionType),
  }),
);

export const politicalFamilyPublication: PoliticalFamilyPublication =
  validatePoliticalFamilyPublication(publicationInput);
validatePoliticalFamilyPublicationReferences(
  politicalFamilyPublication,
  roster,
);

export type PoliticalFamilyPublicRelationship = Omit<
  PoliticalFamilyPublication['relationships'][number],
  'verificationStatus'
> & {
  /** True when an explicitly authorised agent track approved the relation. */
  agentApproved: boolean;
};
export type PoliticalFamilyPublicSource = Omit<
  FamilyEvidenceSource,
  'supportedClaimIds'
>;

export type PoliticalFamilyReadModel = {
  researchStatus: PoliticalFamilyPublication['candidates'][number]['researchStatus'];
  note: string;
  people: PoliticalPerson[];
  relationships: PoliticalFamilyPublicRelationship[];
  sources: PoliticalFamilyPublicSource[];
};

const candidatePublicationById = new Map(
  politicalFamilyPublication.candidates.map((candidate) => [
    candidate.candidateId,
    candidate,
  ]),
);
const peopleById = new Map(
  politicalFamilyPublication.people.map((person) => [person.id, person]),
);
const relationshipById = new Map(
  politicalFamilyPublication.relationships.map((relationship) => [
    relationship.id,
    relationship,
  ]),
);
const agentApprovedRelationshipIds = new Set(
  politicalFamilyPublication.agentApprovedRelationshipIds,
);
const sourceById = new Map(
  politicalFamilyPublication.sources.map((source) => [source.id, source]),
);

export function getPoliticalFamilyReadModel(
  candidateId: string,
): PoliticalFamilyReadModel | undefined {
  const candidate = candidatePublicationById.get(candidateId);
  if (!candidate) return undefined;
  const relationships = candidate.relationshipIds.map((id) => {
    const relationship = relationshipById.get(id);
    if (!relationship) {
      throw new Error(
        `Political family publication is missing relationship ${id}.`,
      );
    }
    const { verificationStatus: _verificationStatus, ...publicRelationship } =
      relationship;
    return {
      ...publicRelationship,
      agentApproved: agentApprovedRelationshipIds.has(relationship.id),
    };
  });
  const personIds = new Set(
    relationships.flatMap((relationship) => [
      relationship.personAId,
      relationship.personBId,
    ]),
  );
  const people = [...personIds].map((id) => {
    const person = peopleById.get(id);
    if (!person) {
      throw new Error(`Political family publication is missing person ${id}.`);
    }
    return person;
  });
  const sourceIds = new Set([
    ...relationships.flatMap((relationship) => relationship.sourceIds),
    // Every affiliation shown in the graph needs its own source links.
    ...people.flatMap((person) =>
      person.affiliations.flatMap((affiliation) => affiliation.sourceIds),
    ),
  ]);
  const sources = [...sourceIds].map((id) => {
    const source = sourceById.get(id);
    if (!source) {
      throw new Error(`Political family publication is missing source ${id}.`);
    }
    const { supportedClaimIds: _supportedClaimIds, ...publicSource } = source;
    return publicSource;
  });
  return {
    researchStatus: candidate.researchStatus,
    note: candidate.note,
    people,
    relationships,
    sources,
  };
}

export type {
  CandidateFamilyResearch,
  FamilyEvidenceSource,
  FamilyRelationship,
  FamilyResearchStatus,
  PoliticalCareer,
  PoliticalCareerStatus,
  PoliticalFamilyPublication,
  PoliticalFamilyResearchDataset,
  PoliticalPerson,
} from './schema';
export { validatePoliticalFamilyPublication };
