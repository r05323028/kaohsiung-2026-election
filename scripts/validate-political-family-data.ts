import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  type FamilyRosterCandidate,
  validatePoliticalFamilyPublication,
  validatePoliticalFamilyPublicationReferences,
  validatePoliticalFamilyReferences,
  validatePoliticalFamilyResearch,
} from '../src/data/political-family/schema';

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null) return true;
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return true;
  }
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (typeof value !== 'object') return false;
  return Object.values(value).every(isJsonValue);
}

function objectValue(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function readJson(path: string): JsonValue {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(resolve(path), 'utf8')) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON in ${path}: ${detail}`, { cause: error });
  }
  if (!isJsonValue(parsed)) {
    throw new Error(`Invalid JSON value in ${path}.`);
  }
  return parsed;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function rosterFromInput(input: unknown): FamilyRosterCandidate[] {
  const candidates = objectValue(input).candidates;
  if (!Array.isArray(candidates)) {
    throw new Error('Political family roster has no candidates array.');
  }
  const roster = candidates.flatMap((value) => {
    const candidate = objectValue(value);
    const id = stringValue(candidate.candidateId ?? candidate.id);
    const slug = stringValue(candidate.slug);
    const displayName = stringValue(candidate.displayName);
    const districtId = stringValue(candidate.districtId);
    const electionType = stringValue(candidate.electionType);
    if (
      !id ||
      !slug ||
      !displayName ||
      !districtId ||
      !electionType ||
      !['mayoral', 'city-council', 'indigenous-council'].includes(electionType)
    ) {
      throw new Error('Political family roster contains an invalid candidate.');
    }
    return [
      {
        id,
        slug,
        displayName,
        districtId,
        electionType: electionType as FamilyRosterCandidate['electionType'],
      },
    ];
  });
  if (roster.length === 0) {
    throw new Error('Political family roster is empty.');
  }
  const ids = new Set(roster.map((candidate) => candidate.id));
  if (ids.size !== roster.length) {
    throw new Error(
      'Political family roster contains duplicate candidate IDs.',
    );
  }
  return roster;
}

function assertExactCandidateCoverage(
  label: string,
  ids: string[],
  roster: FamilyRosterCandidate[],
): void {
  const expected = new Set(roster.map((candidate) => candidate.id));
  const actual = new Set(ids);
  if (actual.size !== ids.length) {
    throw new Error(`${label} contains duplicate candidate records.`);
  }
  if (
    actual.size !== expected.size ||
    [...expected].some((candidateId) => !actual.has(candidateId))
  ) {
    const missing = [...expected].filter(
      (candidateId) => !actual.has(candidateId),
    );
    const unexpected = [...actual].filter(
      (candidateId) => !expected.has(candidateId),
    );
    throw new Error(
      `${label} does not exactly cover the canonical roster. Missing: ${missing.join(', ') || 'none'}; unexpected: ${unexpected.join(', ') || 'none'}.`,
    );
  }
}

function assertPublicationCareerReferences(
  publication: ReturnType<typeof validatePoliticalFamilyPublication>,
): void {
  const sourceIds = new Set(publication.sources.map((source) => source.id));
  const relationshipIds = new Set(
    publication.relationships.map((relationship) => relationship.id),
  );
  for (const person of publication.people) {
    for (const career of person.politicalCareer) {
      for (const sourceId of career.sourceIds) {
        if (!sourceIds.has(sourceId)) {
          throw new Error(
            `Publication career ${career.id} references missing source ${sourceId}.`,
          );
        }
      }
    }
  }
  for (const candidate of publication.candidates) {
    for (const relationshipId of candidate.relationshipIds) {
      if (!relationshipIds.has(relationshipId)) {
        throw new Error(
          `Publication candidate ${candidate.candidateId} references missing relationship ${relationshipId}.`,
        );
      }
    }
  }
}

const roster = rosterFromInput(
  readJson('data/research/2026/political-family/roster.json'),
);
const research = validatePoliticalFamilyResearch(
  readJson('data/research/2026/political-family/research.json'),
);
validatePoliticalFamilyReferences(research, roster);
assertExactCandidateCoverage(
  'Research dataset',
  research.candidates.map((candidate) => candidate.candidateId),
  roster,
);

const publication = validatePoliticalFamilyPublication(
  readJson('data/published/2026/political-family.json'),
);
validatePoliticalFamilyPublicationReferences(publication, roster);
assertExactCandidateCoverage(
  'Publication dataset',
  publication.candidates.map((candidate) => candidate.candidateId),
  roster,
);
assertPublicationCareerReferences(publication);

const publishedRelationshipIds = new Set(
  publication.relationships.map((relationship) => relationship.id),
);
for (const candidate of publication.candidates) {
  if (
    candidate.relationshipIds.some(
      (relationshipId) => !publishedRelationshipIds.has(relationshipId),
    )
  ) {
    throw new Error(
      `Publication candidate ${candidate.candidateId} has a dangling relationship reference.`,
    );
  }
}

console.log(
  JSON.stringify(
    {
      candidateCount: roster.length,
      researchCandidates: research.candidates.length,
      researchRelationships: research.relationships.length,
      publishedCandidates: publication.candidates.length,
      publishedRelationships: publication.relationships.length,
      publishedSources: publication.sources.length,
      status: 'ok',
    },
    null,
    2,
  ),
);
