import { z } from 'zod';

function isCalendarDate(value: string): boolean {
  const parts = value.split('-');
  const year = Number(parts[0] ?? Number.NaN);
  const month = Number(parts[1] ?? Number.NaN);
  const day = Number(parts[2] ?? Number.NaN);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    Number.isInteger(day) &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isUtcTimestamp(value: string): boolean {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  const normalized = parsed.toISOString();
  return value.includes('.')
    ? normalized === value
    : normalized.replace('.000Z', 'Z') === value;
}

const DateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must use YYYY-MM-DD.')
  .refine(isCalendarDate, 'Must be a real calendar date.');

const IsoTimestampSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/,
    'Must use an ISO-8601 UTC timestamp.',
  )
  .refine(isUtcTimestamp, 'Must be a real UTC timestamp.');

export const PoliticalCareerStatusSchema = z.enum([
  'current-officeholder',
  'former-officeholder',
  'current-candidate',
  'former-candidate',
  'political-appointee',
  'party-official',
  'historical-status-unknown',
]);

export const FamilyRelationshipTypeSchema = z.enum([
  'parent-child',
  'siblings',
  'spouses',
  'grandparent-grandchild',
  'uncle-aunt-niece-nephew',
  'cousins',
  'in-laws',
  'other',
]);

export const FamilyVerificationStatusSchema = z.enum([
  'verified',
  'pending-review',
  'rejected',
]);

export const FamilyResearchStatusSchema = z.enum([
  'verified-relations-found',
  'searched-no-verified-relations',
  'unresolved',
]);

export const FamilySourceKindSchema = z.enum([
  'official-record',
  'institutional-profile',
  'established-news',
  'candidate-statement',
  'other-public-record',
]);

export const PoliticalCareerSchema = z
  .object({
    id: z.string().min(1),
    officeTitle: z.string().min(1),
    organization: z.string().min(1),
    status: PoliticalCareerStatusSchema,
    startDate: DateOnlySchema.nullable(),
    endDate: DateOnlySchema.nullable(),
    sourceIds: z.array(z.string().min(1)).min(1),
  })
  .strict();

export const PoliticalPersonSchema = z
  .object({
    id: z.string().min(1),
    displayName: z.string().min(1),
    candidateId: z.string().min(1).optional(),
    politicalCareer: z.array(PoliticalCareerSchema),
  })
  .strict();

export const FamilyEvidenceSourceSchema = z
  .object({
    id: z.string().min(1),
    publisher: z.string().min(1),
    title: z.string().min(1),
    url: z.url(),
    publicationDate: DateOnlySchema.nullable(),
    retrievedAt: DateOnlySchema,
    sourceKind: FamilySourceKindSchema,
    supportedClaimIds: z.array(z.string().min(1)),
  })
  .strict();

export const FamilyRelationshipSchema = z
  .object({
    id: z.string().min(1),
    personAId: z.string().min(1),
    personBId: z.string().min(1),
    relationshipType: FamilyRelationshipTypeSchema,
    relationshipLabel: z.string().min(1),
    personALabel: z.string().min(1),
    personBLabel: z.string().min(1),
    verificationStatus: FamilyVerificationStatusSchema,
    kinshipSourceIds: z.array(z.string().min(1)).min(1),
    careerSourceIds: z.array(z.string().min(1)).min(1),
    sourceIds: z.array(z.string().min(1)).min(1),
  })
  .strict()
  .superRefine((relationship, context) => {
    const expected = [
      ...new Set([
        ...relationship.kinshipSourceIds,
        ...relationship.careerSourceIds,
      ]),
    ].sort();
    const actual = [...new Set(relationship.sourceIds)].sort();
    if (JSON.stringify(expected) !== JSON.stringify(actual)) {
      context.addIssue({
        code: 'custom',
        path: ['sourceIds'],
        message:
          'sourceIds must be the union of kinshipSourceIds and careerSourceIds.',
      });
    }
    if (relationship.personAId === relationship.personBId) {
      context.addIssue({
        code: 'custom',
        path: ['personBId'],
        message: 'A family relationship cannot connect a person to themself.',
      });
    }
    if (
      relationship.verificationStatus === 'verified' &&
      (relationship.kinshipSourceIds.length === 0 ||
        relationship.careerSourceIds.length === 0)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['verificationStatus'],
        message:
          'A verified relationship requires separate kinship and career evidence.',
      });
    }
  });

export const FamilySearchAuditSchema = z
  .object({
    id: z.string().min(1),
    candidateId: z.string().min(1),
    searchedAt: IsoTimestampSchema,
    method: z.enum([
      'independent-source-review',
      'targeted-web-research',
      'follow-up-verification',
    ]),
    searchQueries: z.array(z.string().min(1)).min(1),
    attemptedUrls: z.array(z.url()),
    sourceIds: z.array(z.string().min(1)),
    independentVerification: z.boolean(),
    outcome: FamilyResearchStatusSchema,
    notes: z.string().min(1),
  })
  .strict();

export const CandidateFamilyResearchSchema = z
  .object({
    candidateId: z.string().min(1),
    personId: z.string().min(1),
    displayName: z.string().min(1),
    districtId: z.string().min(1),
    electionType: z.enum(['mayoral', 'city-council', 'indigenous-council']),
    researchStatus: FamilyResearchStatusSchema,
    searchedAt: IsoTimestampSchema,
    searchAuditIds: z.array(z.string().min(1)).min(1),
    verifiedRelationshipIds: z.array(z.string().min(1)),
    pendingRelationshipIds: z.array(z.string().min(1)),
    rejectedRelationshipIds: z.array(z.string().min(1)),
    unresolvedFindingIds: z.array(z.string().min(1)),
    note: z.string().min(1),
  })
  .strict();

export const FamilyUnresolvedFindingSchema = z
  .object({
    id: z.string().min(1),
    candidateId: z.string().min(1),
    subjectName: z.string().min(1),
    reason: z.string().min(1),
    sourceIds: z.array(z.string().min(1)),
    disposition: z.literal('withheld'),
  })
  .strict();

export const PoliticalFamilyResearchDatasetSchema = z
  .object({
    datasetId: z.literal('kaohsiung-2026-political-family-research'),
    snapshotDate: DateOnlySchema,
    researchCutoff: DateOnlySchema,
    generatedAt: IsoTimestampSchema,
    rosterDatasetId: z.string().min(1),
    candidateCount: z.number().int().positive(),
    sources: z.array(FamilyEvidenceSourceSchema),
    people: z.array(PoliticalPersonSchema),
    relationships: z.array(FamilyRelationshipSchema),
    searchAudits: z.array(FamilySearchAuditSchema),
    unresolvedFindings: z.array(FamilyUnresolvedFindingSchema),
    candidates: z.array(CandidateFamilyResearchSchema),
    note: z.string().min(1),
  })
  .strict();

export const FamilyPublicationCandidateSchema = z
  .object({
    candidateId: z.string().min(1),
    researchStatus: FamilyResearchStatusSchema,
    relationshipIds: z.array(z.string().min(1)),
    note: z.string().min(1),
  })
  .strict();

export const PoliticalFamilyPublicationSchema = z
  .object({
    datasetId: z.literal('kaohsiung-2026-political-family-publication'),
    snapshotDate: DateOnlySchema,
    generatedAt: IsoTimestampSchema,
    rosterDatasetId: z.string().min(1),
    schemaVersion: z.literal('1'),
    sources: z.array(FamilyEvidenceSourceSchema),
    people: z.array(PoliticalPersonSchema),
    relationships: z.array(
      FamilyRelationshipSchema.safeExtend({
        verificationStatus: z.literal('verified'),
      }),
    ),
    candidates: z.array(FamilyPublicationCandidateSchema),
    note: z.string().min(1),
  })
  .strict();

export const PoliticalFamilyPublicationApprovalSchema = z
  .object({
    approvalVersion: z.literal('1'),
    datasetId: z.literal('kaohsiung-2026-political-family-publication'),
    approvedAt: DateOnlySchema,
    approvalBasis: z.literal('independent-verification'),
    approvedRelationshipIds: z.array(z.string().min(1)).min(1),
    note: z.string().min(1),
  })
  .strict();

export type PoliticalCareerStatus = z.infer<typeof PoliticalCareerStatusSchema>;
export type FamilyRelationshipType = z.infer<
  typeof FamilyRelationshipTypeSchema
>;
export type FamilyVerificationStatus = z.infer<
  typeof FamilyVerificationStatusSchema
>;
export type FamilyResearchStatus = z.infer<typeof FamilyResearchStatusSchema>;
export type FamilyEvidenceSource = z.infer<typeof FamilyEvidenceSourceSchema>;
export type PoliticalCareer = z.infer<typeof PoliticalCareerSchema>;
export type PoliticalPerson = z.infer<typeof PoliticalPersonSchema>;
export type FamilyRelationship = z.infer<typeof FamilyRelationshipSchema>;
export type FamilySearchAudit = z.infer<typeof FamilySearchAuditSchema>;
export type CandidateFamilyResearch = z.infer<
  typeof CandidateFamilyResearchSchema
>;
export type FamilyUnresolvedFinding = z.infer<
  typeof FamilyUnresolvedFindingSchema
>;
export type PoliticalFamilyResearchDataset = z.infer<
  typeof PoliticalFamilyResearchDatasetSchema
>;
export type PoliticalFamilyPublication = z.infer<
  typeof PoliticalFamilyPublicationSchema
>;
export type PoliticalFamilyPublicationApproval = z.infer<
  typeof PoliticalFamilyPublicationApprovalSchema
>;

function issueText(issues: z.core.$ZodIssue[]): string {
  return issues
    .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
    .join('\n');
}

export function validatePoliticalFamilyResearch(
  input: unknown,
): PoliticalFamilyResearchDataset {
  const result = PoliticalFamilyResearchDatasetSchema.safeParse(input);
  if (!result.success) {
    throw new Error(
      `Political family research schema validation failed:\n${issueText(result.error.issues)}`,
    );
  }
  return result.data;
}

export function validatePoliticalFamilyPublication(
  input: unknown,
): PoliticalFamilyPublication {
  const result = PoliticalFamilyPublicationSchema.safeParse(input);
  if (!result.success) {
    throw new Error(
      `Political family publication schema validation failed:\n${issueText(result.error.issues)}`,
    );
  }
  return result.data;
}

export function validatePoliticalFamilyPublicationApproval(
  input: unknown,
): PoliticalFamilyPublicationApproval {
  const result = PoliticalFamilyPublicationApprovalSchema.safeParse(input);
  if (!result.success) {
    throw new Error(
      `Political family publication approval validation failed:\n${issueText(result.error.issues)}`,
    );
  }
  return result.data;
}

export type FamilyRosterCandidate = {
  id: string;
  slug: string;
  displayName: string;
  districtId: string;
  electionType: 'mayoral' | 'city-council' | 'indigenous-council';
};

function checkUnique(label: string, ids: string[], errors: string[]): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) errors.push(`${label}: duplicate id "${id}".`);
    seen.add(id);
  }
}

function checkRelationshipAssignment(
  relationIds: string[],
  expectedStatus: FamilyVerificationStatus,
  candidateId: string,
  relationsById: Map<string, FamilyRelationship>,
  candidatePerson: string,
  errors: string[],
): Set<string> {
  const ids = new Set<string>();
  for (const relationId of relationIds) {
    if (ids.has(relationId))
      errors.push(
        `candidate ${candidateId}: duplicate relationship ${relationId}.`,
      );
    ids.add(relationId);
    const relation = relationsById.get(relationId);
    if (!relation) {
      errors.push(
        `candidate ${candidateId} references missing ${expectedStatus} relationship ${relationId}.`,
      );
      continue;
    }
    if (relation.verificationStatus !== expectedStatus) {
      errors.push(
        `candidate ${candidateId} assigns ${relationId} to ${expectedStatus}, but status is ${relation.verificationStatus}.`,
      );
    }
    if (relation.personAId !== candidatePerson) {
      errors.push(
        `relationship ${relationId} is not owned by candidate ${candidateId}.`,
      );
    }
  }
  return ids;
}

export function validatePoliticalFamilyReferences(
  dataset: PoliticalFamilyResearchDataset,
  roster: FamilyRosterCandidate[],
): void {
  const rosterById = new Map(
    roster.map((candidate) => [candidate.id, candidate]),
  );
  const peopleById = new Map(
    dataset.people.map((person) => [person.id, person]),
  );
  const sourcesById = new Map(
    dataset.sources.map((source) => [source.id, source]),
  );
  const relationshipsById = new Map(
    dataset.relationships.map((relation) => [relation.id, relation]),
  );
  const auditsById = new Map(
    dataset.searchAudits.map((audit) => [audit.id, audit]),
  );
  const findingsById = new Map(
    dataset.unresolvedFindings.map((finding) => [finding.id, finding]),
  );
  const candidateById = new Map(
    dataset.candidates.map((candidate) => [candidate.candidateId, candidate]),
  );
  const errors: string[] = [];

  checkUnique(
    'sources',
    dataset.sources.map((source) => source.id),
    errors,
  );
  checkUnique(
    'people',
    dataset.people.map((person) => person.id),
    errors,
  );
  checkUnique(
    'relationships',
    dataset.relationships.map((relation) => relation.id),
    errors,
  );
  checkUnique(
    'searchAudits',
    dataset.searchAudits.map((audit) => audit.id),
    errors,
  );
  checkUnique(
    'unresolvedFindings',
    dataset.unresolvedFindings.map((finding) => finding.id),
    errors,
  );
  checkUnique(
    'candidate audits',
    dataset.candidates.map((audit) => audit.candidateId),
    errors,
  );

  if (dataset.candidateCount !== roster.length)
    errors.push(
      `candidateCount ${dataset.candidateCount} does not match roster ${roster.length}.`,
    );
  if (dataset.candidates.length !== roster.length)
    errors.push(
      `expected one candidate audit per roster candidate, got ${dataset.candidates.length}.`,
    );
  for (const candidate of roster) {
    if (!candidateById.has(candidate.id))
      errors.push(`missing candidate research for ${candidate.id}.`);
  }
  for (const candidate of dataset.candidates) {
    const rosterCandidate = rosterById.get(candidate.candidateId);
    if (!rosterCandidate) {
      errors.push(
        `candidate research references unknown candidate ${candidate.candidateId}.`,
      );
      continue;
    }
    if (candidate.personId !== `person-${rosterCandidate.slug}`)
      errors.push(`wrong person ID for ${candidate.candidateId}.`);
    if (candidate.displayName !== rosterCandidate.displayName)
      errors.push(`wrong display name for ${candidate.candidateId}.`);
    if (candidate.districtId !== rosterCandidate.districtId)
      errors.push(`wrong district for ${candidate.candidateId}.`);
    if (candidate.electionType !== rosterCandidate.electionType)
      errors.push(`wrong election type for ${candidate.candidateId}.`);
    for (const auditId of candidate.searchAuditIds) {
      const audit = auditsById.get(auditId);
      if (!audit) {
        errors.push(
          `candidate ${candidate.candidateId} references missing search audit ${auditId}.`,
        );
      } else if (audit.candidateId !== candidate.candidateId) {
        errors.push(`search audit ${auditId} is owned by another candidate.`);
      }
    }
    const assigned = new Set<string>();
    for (const [ids, status] of [
      [candidate.verifiedRelationshipIds, 'verified'],
      [candidate.pendingRelationshipIds, 'pending-review'],
      [candidate.rejectedRelationshipIds, 'rejected'],
    ] as const) {
      const current = checkRelationshipAssignment(
        ids,
        status,
        candidate.candidateId,
        relationshipsById,
        candidate.personId,
        errors,
      );
      for (const id of current) {
        if (assigned.has(id))
          errors.push(
            `candidate ${candidate.candidateId} assigns relationship ${id} more than once.`,
          );
        assigned.add(id);
      }
    }
    const ownedRelations = dataset.relationships
      .filter((relation) => relation.personAId === candidate.personId)
      .map((relation) => relation.id);
    for (const relationId of ownedRelations) {
      if (!assigned.has(relationId))
        errors.push(
          `candidate ${candidate.candidateId} does not assign relationship ${relationId} to a research status list.`,
        );
    }
    if (assigned.size !== ownedRelations.length)
      errors.push(
        `candidate ${candidate.candidateId} has an incorrect relationship assignment count.`,
      );
    for (const findingId of candidate.unresolvedFindingIds) {
      const finding = findingsById.get(findingId);
      if (!finding) {
        errors.push(
          `candidate ${candidate.candidateId} references missing unresolved finding ${findingId}.`,
        );
      } else if (finding.candidateId !== candidate.candidateId) {
        errors.push(
          `unresolved finding ${findingId} is owned by another candidate.`,
        );
      }
    }
    const expectedStatus =
      candidate.verifiedRelationshipIds.length > 0
        ? 'verified-relations-found'
        : dataset.searchAudits.find(
              (audit) => audit.candidateId === candidate.candidateId,
            )?.outcome === 'unresolved'
          ? 'unresolved'
          : candidate.pendingRelationshipIds.length > 0
            ? 'unresolved'
            : 'searched-no-verified-relations';
    if (candidate.researchStatus !== expectedStatus)
      errors.push(
        `candidate ${candidate.candidateId} has status ${candidate.researchStatus}, expected ${expectedStatus}.`,
      );
  }

  for (const person of dataset.people) {
    if (person.candidateId) {
      const candidate = rosterById.get(person.candidateId);
      if (!candidate)
        errors.push(
          `person ${person.id} has unknown candidateId ${person.candidateId}.`,
        );
      else if (person.id !== `person-${candidate.slug}`)
        errors.push(
          `candidate person ${person.id} does not match candidate ${person.candidateId}.`,
        );
    }
    for (const career of person.politicalCareer)
      for (const sourceId of career.sourceIds)
        if (!sourcesById.has(sourceId))
          errors.push(
            `career ${career.id} references missing source ${sourceId}.`,
          );
  }

  for (const audit of dataset.searchAudits) {
    if (!rosterById.has(audit.candidateId))
      errors.push(`search audit ${audit.id} references unknown candidate.`);
    for (const sourceId of audit.sourceIds)
      if (!sourcesById.has(sourceId))
        errors.push(
          `search audit ${audit.id} references missing source ${sourceId}.`,
        );
  }

  for (const finding of dataset.unresolvedFindings) {
    if (!rosterById.has(finding.candidateId))
      errors.push(
        `unresolved finding ${finding.id} references unknown candidate.`,
      );
    for (const sourceId of finding.sourceIds)
      if (!sourcesById.has(sourceId))
        errors.push(
          `unresolved finding ${finding.id} references missing source ${sourceId}.`,
        );
  }

  for (const relationship of dataset.relationships) {
    const personA = peopleById.get(relationship.personAId);
    const personB = peopleById.get(relationship.personBId);
    if (!personA || !personB) {
      errors.push(
        `relationship ${relationship.id} has an unresolved endpoint.`,
      );
      continue;
    }
    if (
      !roster.some(
        (candidate) => `person-${candidate.slug}` === relationship.personAId,
      )
    )
      errors.push(
        `relationship ${relationship.id} has a non-candidate personA endpoint.`,
      );
    for (const sourceId of relationship.sourceIds)
      if (!sourcesById.has(sourceId))
        errors.push(
          `relationship ${relationship.id} references missing source ${sourceId}.`,
        );
  }

  if (errors.length > 0)
    throw new Error(
      `Political family reference validation failed:\n${errors.join('\n')}`,
    );
}

export function validatePoliticalFamilyPublicationReferences(
  dataset: PoliticalFamilyPublication,
  roster: FamilyRosterCandidate[],
): void {
  const rosterById = new Map(
    roster.map((candidate) => [candidate.id, candidate]),
  );
  const candidateById = new Map(
    dataset.candidates.map((candidate) => [candidate.candidateId, candidate]),
  );
  const peopleById = new Map(
    dataset.people.map((person) => [person.id, person]),
  );
  const sourceById = new Map(
    dataset.sources.map((source) => [source.id, source]),
  );
  const relationById = new Map(
    dataset.relationships.map((relation) => [relation.id, relation]),
  );
  const errors: string[] = [];
  checkUnique(
    'publication sources',
    dataset.sources.map((source) => source.id),
    errors,
  );
  checkUnique(
    'publication people',
    dataset.people.map((person) => person.id),
    errors,
  );
  checkUnique(
    'publication relationships',
    dataset.relationships.map((relation) => relation.id),
    errors,
  );
  checkUnique(
    'publication candidate records',
    dataset.candidates.map((candidate) => candidate.candidateId),
    errors,
  );
  if (dataset.candidates.length !== roster.length)
    errors.push(
      `publication candidate records ${dataset.candidates.length} do not match roster ${roster.length}.`,
    );
  for (const candidate of roster)
    if (!candidateById.has(candidate.id))
      errors.push(`publication is missing candidate ${candidate.id}.`);

  const assignedRelations = new Set<string>();
  const allowedClaimIds = new Set<string>();
  for (const relation of dataset.relationships) {
    allowedClaimIds.add(`claim-${relation.id}-kinship`);
    const personB = peopleById.get(relation.personBId);
    for (const career of personB?.politicalCareer ?? [])
      allowedClaimIds.add(`claim-${career.id}`);
  }

  for (const source of dataset.sources) {
    for (const claimId of source.supportedClaimIds) {
      if (!allowedClaimIds.has(claimId))
        errors.push(
          `publication source ${source.id} exposes unsupported claim ${claimId}.`,
        );
    }
  }

  for (const candidate of dataset.candidates) {
    const rosterCandidate = rosterById.get(candidate.candidateId);
    if (!rosterCandidate) {
      errors.push(
        `publication references unknown candidate ${candidate.candidateId}.`,
      );
      continue;
    }
    const candidatePersonId = `person-${rosterCandidate.slug}`;
    if (
      candidate.relationshipIds.length > 0 &&
      candidate.researchStatus !== 'verified-relations-found'
    )
      errors.push(
        `publication candidate ${candidate.candidateId} has relations but non-verified status.`,
      );
    for (const relationshipId of candidate.relationshipIds) {
      if (assignedRelations.has(relationshipId))
        errors.push(
          `publication relationship ${relationshipId} is assigned more than once.`,
        );
      assignedRelations.add(relationshipId);
      const relation = relationById.get(relationshipId);
      if (!relation) {
        errors.push(
          `publication candidate ${candidate.candidateId} references missing relation ${relationshipId}.`,
        );
        continue;
      }
      if (relation.verificationStatus !== 'verified')
        errors.push(`publication relation ${relationshipId} is not verified.`);
      if (relation.personAId !== candidatePersonId)
        errors.push(
          `publication relation ${relationshipId} is not owned by candidate ${candidate.candidateId}.`,
        );
      const personA = peopleById.get(relation.personAId);
      const personB = peopleById.get(relation.personBId);
      if (!personA || !personB)
        errors.push(
          `publication relation ${relationshipId} has dangling endpoints.`,
        );
      for (const sourceId of relation.sourceIds)
        if (!sourceById.has(sourceId))
          errors.push(
            `publication relation ${relationshipId} references missing source ${sourceId}.`,
          );
      for (const sourceId of relation.kinshipSourceIds)
        if (!sourceById.has(sourceId))
          errors.push(
            `publication relation ${relationshipId} references missing kinship source ${sourceId}.`,
          );
      for (const sourceId of relation.careerSourceIds)
        if (!sourceById.has(sourceId))
          errors.push(
            `publication relation ${relationshipId} references missing career source ${sourceId}.`,
          );
      for (const sourceId of relation.careerSourceIds) {
        const careerBacked = (personB?.politicalCareer ?? []).some((career) =>
          career.sourceIds.includes(sourceId),
        );
        if (!careerBacked)
          errors.push(
            `publication relation ${relationshipId} has career source ${sourceId} without a published career.`,
          );
      }
    }
  }
  for (const relation of dataset.relationships)
    if (!assignedRelations.has(relation.id))
      errors.push(
        `publication relation ${relation.id} is not assigned to a candidate.`,
      );

  for (const person of dataset.people) {
    if (person.candidateId && !rosterById.has(person.candidateId))
      errors.push(
        `publication person ${person.id} has unknown candidateId ${person.candidateId}.`,
      );
  }
  const referencedPeople = new Set(
    dataset.relationships.flatMap((relation) => [
      relation.personAId,
      relation.personBId,
    ]),
  );
  for (const person of dataset.people)
    if (!referencedPeople.has(person.id))
      errors.push(
        `publication person ${person.id} is not referenced by a relationship.`,
      );

  if (errors.length > 0)
    throw new Error(
      `Political family publication reference validation failed:\n${errors.join('\n')}`,
    );
}
