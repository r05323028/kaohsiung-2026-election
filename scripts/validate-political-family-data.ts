import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validatePoliticalFamilyVerificationCorrections } from '../src/data/political-family/corrections';
import {
  type FamilyRosterCandidate,
  validatePoliticalFamilyPublication,
  validatePoliticalFamilyPublicationApproval,
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

function assertRosterMatchesCanonical(
  actual: FamilyRosterCandidate[],
  canonical: FamilyRosterCandidate[],
): void {
  assertExactCandidateCoverage(
    'Research roster',
    actual.map((candidate) => candidate.id),
    canonical,
  );
  const actualById = new Map(
    actual.map((candidate) => [candidate.id, candidate]),
  );
  for (const expected of canonical) {
    const candidate = actualById.get(expected.id);
    if (!candidate) continue;
    for (const key of [
      'slug',
      'displayName',
      'districtId',
      'electionType',
    ] as const) {
      if (candidate[key] !== expected[key]) {
        throw new Error(
          `Research roster differs from canonical roster for ${expected.id}: ${key}.`,
        );
      }
    }
  }
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
    for (const affiliation of person.affiliations) {
      for (const sourceId of affiliation.sourceIds) {
        if (!sourceIds.has(sourceId)) {
          throw new Error(
            `Publication affiliation ${affiliation.id} references missing source ${sourceId}.`,
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

const canonicalRoster = rosterFromInput(
  readJson('data/approved/2026/kaohsiung-election.json'),
);
const researchRoster = rosterFromInput(
  readJson('data/research/2026/political-family/roster.json'),
);
assertRosterMatchesCanonical(researchRoster, canonicalRoster);
const roster = canonicalRoster;
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

const corrections = validatePoliticalFamilyVerificationCorrections(
  readJson('data/research/2026/political-family/verification-corrections.json'),
);
const researchPersonById = new Map(
  research.people.map((person) => [person.id, person]),
);
const researchRelationshipById = new Map(
  research.relationships.map((relationship) => [relationship.id, relationship]),
);
const researchCandidateById = new Map(
  research.candidates.map((candidate) => [candidate.candidateId, candidate]),
);
const researchSourceIds = new Set(research.sources.map((source) => source.id));
const researchSourceUrls = new Set(
  research.sources.map((source) => source.url),
);
const rosterIds = new Set(roster.map((candidate) => candidate.id));
for (const record of corrections.records) {
  if (!rosterIds.has(record.candidateId)) {
    throw new Error(
      'Correction references candidate outside the roster: ' +
        record.candidateId +
        '.',
    );
  }
  const relationship = researchRelationshipById.get(record.relationshipId);
  if (!relationship) {
    throw new Error(
      'Correction references missing relationship ' +
        record.relationshipId +
        '.',
    );
  }
  if (relationship.verificationStatus !== 'verified') {
    throw new Error(
      'Correction target is not verified: ' + record.relationshipId + '.',
    );
  }
  const candidatePerson = researchPersonById.get(relationship.personAId);
  const relativePerson = researchPersonById.get(relationship.personBId);
  if (candidatePerson?.candidateId !== record.candidateId) {
    throw new Error(
      'Correction candidate does not match relationship person A: ' +
        record.relationshipId +
        '.',
    );
  }
  if (relativePerson?.displayName !== record.relativeName) {
    throw new Error(
      'Correction relative does not match relationship person B: ' +
        record.relationshipId +
        '.',
    );
  }
  const appliedPositionSourceIds =
    record.positionSourceIds ?? relationship.positionSourceIds;
  for (const sourceId of appliedPositionSourceIds) {
    if (!researchSourceIds.has(sourceId)) {
      throw new Error(
        'Correction references missing research source ' + sourceId + '.',
      );
    }
    if (!relationship.positionSourceIds.includes(sourceId)) {
      throw new Error(
        'Correction position source is not on the relationship: ' +
          sourceId +
          '.',
      );
    }
  }
  for (const position of record.positions ?? []) {
    for (const sourceId of position.sourceIds) {
      if (!researchSourceIds.has(sourceId)) {
        throw new Error(
          'Corrected position references missing source ' + sourceId + '.',
        );
      }
      if (!relationship.positionSourceIds.includes(sourceId)) {
        throw new Error(
          'Corrected position source is not on the relationship: ' +
            sourceId +
            '.',
        );
      }
    }
    const applied = relativePerson?.affiliations.some(
      (affiliation) =>
        affiliation.organization === position.organization &&
        affiliation.positionTitle === position.positionTitle &&
        affiliation.startDate === position.startDate &&
        affiliation.endDate === position.endDate,
    );
    if (!applied) {
      throw new Error(
        'Corrected position was not applied: ' +
          position.organization +
          ' ' +
          position.positionTitle +
          '.',
      );
    }
  }
  for (const claim of record.removedClaims) {
    for (const url of claim.sourceUrls) {
      if (!researchSourceUrls.has(url)) {
        throw new Error(
          'Removed claim cites a source outside the research dataset: ' +
            url +
            '.',
        );
      }
    }
    const stillPresent = relativePerson?.affiliations.some(
      (affiliation) =>
        affiliation.organization === claim.organization &&
        affiliation.positionTitle === claim.positionTitle,
    );
    if (stillPresent) {
      throw new Error(
        'Removed claim is still present: ' +
          claim.organization +
          ' ' +
          claim.positionTitle +
          '.',
      );
    }
  }
  for (const url of record.reviewedAgainst) {
    if (!researchSourceUrls.has(url)) {
      throw new Error(
        'Correction reviewedAgainst cites a source outside the research dataset: ' +
          url +
          '.',
      );
    }
  }
}
for (const outcome of corrections.candidateOutcomes) {
  const candidate = researchCandidateById.get(outcome.candidateId);
  if (!candidate) {
    throw new Error(
      'Candidate outcome correction references missing candidate ' +
        outcome.candidateId +
        '.',
    );
  }
  if (candidate.researchStatus !== outcome.outcome) {
    throw new Error(
      'Candidate outcome correction was not applied: ' +
        outcome.candidateId +
        ' is ' +
        candidate.researchStatus +
        '.',
    );
  }
  for (const subject of outcome.suppressLegacyFindingSubjects) {
    if (
      research.unresolvedFindings.some((finding) =>
        finding.subjectName.includes(subject),
      )
    ) {
      throw new Error(
        'Suppressed legacy finding subject is still present: ' + subject + '.',
      );
    }
  }
}

const publishedRelationshipIds = new Set(
  publication.relationships.map((relationship) => relationship.id),
);

const approval = validatePoliticalFamilyPublicationApproval(
  readJson('data/research/2026/political-family/publication-approval.json'),
);
const agentApprovedIds = new Set(
  (approval.agentApprovals ?? []).flatMap((entry) => entry.relationshipIds),
);
const verifiedResearchIds = new Set(
  research.relationships
    .filter((relationship) => relationship.verificationStatus === 'verified')
    .map((relationship) => relationship.id),
);
for (const id of agentApprovedIds) {
  if (approval.approvedRelationshipIds.includes(id)) {
    throw new Error(
      `Relationship ${id} is both editorially and agent approved.`,
    );
  }
  if (!verifiedResearchIds.has(id)) {
    throw new Error(
      'Agent approval ' +
        id +
        ' is not an independently verified relationship.',
    );
  }
  if (!publishedRelationshipIds.has(id)) {
    throw new Error(
      'Agent approval ' +
        id +
        ' is not published; withdraw the approval or fix the position evidence.',
    );
  }
}
for (const id of publication.agentApprovedRelationshipIds) {
  if (!agentApprovedIds.has(id)) {
    throw new Error(
      'Publication marks relationship ' +
        id +
        ' as agent approved without an approval record.',
    );
  }
}
if (
  new Set(publication.agentApprovedRelationshipIds).size !==
  publication.agentApprovedRelationshipIds.length
) {
  throw new Error('Publication lists an agent approval more than once.');
}
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
      correctedRelationships: corrections.records.length,
      correctedCandidateOutcomes: corrections.candidateOutcomes.length,
      status: 'ok',
    },
    null,
    2,
  ),
);
