import { z } from 'zod';

export const PublicDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const ClaimTypeSchema = z.enum([
  'position-held',
  'election-participation',
  'policy-statement',
  'legislative-proposal',
  'council-questioning',
  'public-project-involvement',
  'administrative-outcome',
  'family-relationship',
  'political-relationship',
  'career-event',
]);
export const ClaimAttributionSchema = z.enum([
  'candidate-statement',
  'documented-participation',
  'institutional-outcome',
  'independently-corroborated',
  'editorial-context',
]);
export const ClaimVerificationStatusSchema = z.enum([
  'Verified',
  'Pending review',
  'Disputed',
  'Insufficient information',
]);
export const ClaimReviewStatusSchema = z.enum([
  'approved',
  'pending-review',
  'rejected',
  'needs-clarification',
]);

const ClaimBaseSchema = z.object({
  claimId: z.string().min(1),
  subjectId: z.string().min(1),
  predicate: z.string().min(1),
  qualifiers: z.record(z.string(), z.string()).default({}),
  validFrom: PublicDateSchema.nullable(),
  validTo: PublicDateSchema.nullable(),
  assertedAt: PublicDateSchema,
  attribution: ClaimAttributionSchema,
  verificationStatus: ClaimVerificationStatusSchema,
  evidenceIds: z.array(z.string().min(1)).min(1),
  reviewStatus: ClaimReviewStatusSchema,
});

const PositionClaimSchema = ClaimBaseSchema.extend({
  claimType: z.literal('position-held'),
  object: z.object({
    title: z.string().min(1),
    organization: z.string().min(1),
  }),
});
const ElectionClaimSchema = ClaimBaseSchema.extend({
  claimType: z.literal('election-participation'),
  object: z.object({
    electionYear: z.number().int(),
    electionType: z.enum(['mayoral', 'city-council', 'indigenous-council']),
    constituencyId: z.string().min(1),
    status: z.string().min(1),
  }),
});
const PolicyClaimSchema = ClaimBaseSchema.extend({
  claimType: z.literal('policy-statement'),
  object: z.object({
    title: z.string().min(1),
    category: z.string().min(1),
    statement: z.string().min(1),
  }),
});
const ProposalClaimSchema = ClaimBaseSchema.extend({
  claimType: z.literal('legislative-proposal'),
  object: z.object({
    title: z.string().min(1),
    organization: z.string().min(1),
  }),
});
const QuestioningClaimSchema = ClaimBaseSchema.extend({
  claimType: z.literal('council-questioning'),
  object: z.object({
    title: z.string().min(1),
    organization: z.string().min(1),
    topic: z.string().min(1),
  }),
});
const ProjectClaimSchema = ClaimBaseSchema.extend({
  claimType: z.literal('public-project-involvement'),
  object: z.object({
    project: z.string().min(1),
    role: z.string().min(1),
  }),
});
const OutcomeClaimSchema = ClaimBaseSchema.extend({
  claimType: z.literal('administrative-outcome'),
  object: z.object({
    outcome: z.string().min(1),
    organization: z.string().min(1),
  }),
});
const FamilyRelationshipClaimSchema = ClaimBaseSchema.extend({
  claimType: z.literal('family-relationship'),
  object: z.object({
    relationshipType: z.enum(['parent', 'child', 'spouse', 'sibling']),
    relatedPersonId: z.string().nullable(),
    relatedPersonName: z.string().min(1),
  }),
});
const PoliticalRelationshipClaimSchema = ClaimBaseSchema.extend({
  claimType: z.literal('political-relationship'),
  object: z.object({
    relationshipType: z.enum([
      'mentor',
      'organizational-colleague',
      'political-affiliation',
      'business-affiliation',
    ]),
    relatedPersonId: z.string().nullable(),
    relatedPersonName: z.string().min(1),
  }),
});
const CareerEventClaimSchema = ClaimBaseSchema.extend({
  claimType: z.literal('career-event'),
  object: z.object({
    title: z.string().min(1),
    category: z.enum([
      'education',
      'professional',
      'public-office',
      'election',
      'public-activity',
      'other',
    ]),
  }),
});

export const ClaimSchema = z.discriminatedUnion('claimType', [
  PositionClaimSchema,
  ElectionClaimSchema,
  PolicyClaimSchema,
  ProposalClaimSchema,
  QuestioningClaimSchema,
  ProjectClaimSchema,
  OutcomeClaimSchema,
  FamilyRelationshipClaimSchema,
  PoliticalRelationshipClaimSchema,
  CareerEventClaimSchema,
]);

export const EvidenceSchema = z.object({
  evidenceId: z.string().min(1),
  sourceId: z.string().min(1),
  claimId: z.string().min(1),
  evidenceType: z.enum([
    'primary-document',
    'institutional-profile',
    'official-news',
    'official-record',
  ]),
  supportType: z.enum([
    'supports',
    'contradicts',
    'provides-context',
    'attributes-statement',
  ]),
  documentLocation: z.string().min(1),
  quotedText: z.string().nullable(),
  retrievedAt: PublicDateSchema,
  verificationStatus: ClaimVerificationStatusSchema,
  reviewStatus: ClaimReviewStatusSchema,
});

export const IdentityResolutionSchema = z.object({
  resolutionId: z.string().min(1),
  personId: z.string().min(1),
  sourceId: z.string().min(1),
  sourceIdentifier: z.string().min(1),
  observedName: z.string().min(1),
  matchBasis: z.array(z.string().min(1)).min(1),
  status: z.enum(['resolved', 'pending-review', 'rejected']),
  evidenceIds: z.array(z.string().min(1)).min(1),
});

export const ConflictSchema = z.object({
  conflictId: z.string().min(1),
  conflictType: z.enum([
    'position-dates',
    'position-title',
    'election-affiliation',
    'duplicate-policy',
    'relationship-description',
    'event-date',
    'identity',
  ]),
  claimIds: z.array(z.string().min(1)).min(2),
  description: z.string().min(1),
  status: z.enum(['open', 'resolved']),
  resolution: z.string().nullable(),
});

const RecordReviewFields = {
  verificationStatus: ClaimVerificationStatusSchema,
  reviewStatus: ClaimReviewStatusSchema,
  publicationStatus: z.enum([
    'approved-source-backed',
    'pending-review',
    'blocked',
  ]),
  claimIds: z.array(z.string().min(1)).min(1),
  evidenceIds: z.array(z.string().min(1)).min(1),
};

export const PositionRecordSchema = z.object({
  id: z.string().min(1),
  personId: z.string().min(1),
  title: z.string().min(1),
  organization: z.string().min(1),
  startDate: PublicDateSchema.nullable(),
  endDate: PublicDateSchema.nullable(),
  currentStatus: z.enum(['current', 'historical', 'unknown']),
  lastVerifiedAt: PublicDateSchema,
  ...RecordReviewFields,
});

export const PolicyContextSchema = z.enum([
  'campaign-promise',
  'formal-proposal',
  'legislative-proposal',
  'implemented-policy',
  'commentary',
  'historical-position',
  'unknown',
]);

export const PolicyStatusSchema = z.enum([
  'proposed',
  'under-review',
  'approved',
  'under-implementation',
  'implemented',
  'completed',
  'cancelled',
  'unknown',
]);

export const PolicyRecordSchema = z.object({
  id: z.string().min(1),
  personId: z.string().min(1),
  electionYear: z.number().int().nullable(),
  title: z.string().min(1),
  category: z.string().min(1),
  originalStatement: z.string().min(1),
  neutralSummary: z.string().nullable(),
  publicationDate: PublicDateSchema.nullable(),
  attribution: ClaimAttributionSchema,
  policyContext: PolicyContextSchema.optional(),
  policyStatus: PolicyStatusSchema.optional(),
  geographicScope: z.string().min(1).optional(),
  ...RecordReviewFields,
});

export const PublicActivityRecordSchema = z.object({
  id: z.string().min(1),
  personId: z.string().min(1),
  activityType: z.enum([
    'council-questioning',
    'legislative-proposal',
    'committee-activity',
    'government-project',
    'budget-decision',
    'other',
  ]),
  title: z.string().min(1),
  eventDate: PublicDateSchema,
  organization: z.string().min(1),
  role: z.string().min(1),
  description: z.string().min(1),
  documentedOutcome: z.string().nullable(),
  attribution: ClaimAttributionSchema,
  ...RecordReviewFields,
});

/**
 * Legacy sentiment classification retained only so historical raw records keep
 * validating. It is not read by the public view model, the profile UI, filters,
 * or coverage metrics, and must never be reintroduced as a presentation or
 * inclusion rule.
 */
export const NewsClassificationSchema = z.enum([
  'positive',
  'negative',
  'neutral',
  'disputed',
  'unclassified',
]);

export const NewsRecordSchema = z.object({
  id: z.string().min(1),
  personIds: z.array(z.string().min(1)).min(1),
  headline: z.string().min(1),
  publisher: z.string().min(1),
  originalUrl: z.url(),
  publicationDate: PublicDateSchema,
  eventDate: PublicDateSchema.nullable().optional(),
  latestStatus: z.string().min(1).nullable().optional(),
  topicTags: z.array(z.string().min(1)).min(1),
  editorialSummary: z.string().nullable(),
  /** @deprecated Historical sentiment field; not used for public UI or filtering. */
  classification: NewsClassificationSchema.optional(),
  /** @deprecated Historical sentiment rationale; not used for public UI. */
  classificationRationale: z.string().min(1).nullable().optional(),
  contentType: z.enum([
    'reporting',
    'opinion',
    'institutional-update',
    'unknown',
  ]),
  sourceDependencies: z.array(z.string().min(1)).min(1),
  duplicateOf: z.string().nullable(),
  ...RecordReviewFields,
});

export const RelationshipRecordSchema = z.object({
  id: z.string().min(1),
  personId: z.string().min(1),
  relationshipType: z.enum([
    'parent',
    'child',
    'spouse',
    'sibling',
    'political-mentor',
    'organizational-colleague',
    'political-affiliation',
    'business-affiliation',
  ]),
  relatedPersonId: z.string().nullable(),
  relatedPersonName: z.string().min(1),
  description: z.string().min(1),
  ...RecordReviewFields,
});

export const TimelineEventRecordSchema = z.object({
  id: z.string().min(1),
  personId: z.string().min(1),
  eventDate: PublicDateSchema.nullable(),
  title: z.string().min(1),
  category: z.enum([
    'education',
    'professional',
    'public-office',
    'election',
    'public-activity',
    'policy',
    'other',
  ]),
  description: z.string().min(1),
  ...RecordReviewFields,
});

export const PublicRecordsDatasetSchema = z.object({
  datasetId: z.literal('kaohsiung-2026-public-records'),
  snapshotDate: PublicDateSchema,
  selectedCandidateIds: z.array(z.string().min(1)).min(1),
  selectedPersonIds: z.array(z.string().min(1)).min(1),
  sourceIds: z.array(z.string().min(1)).min(1),
  claims: z.array(ClaimSchema),
  evidence: z.array(EvidenceSchema),
  positions: z.array(PositionRecordSchema),
  policies: z.array(PolicyRecordSchema),
  activities: z.array(PublicActivityRecordSchema),
  news: z.array(NewsRecordSchema),
  relationships: z.array(RelationshipRecordSchema),
  timeline: z.array(TimelineEventRecordSchema),
  identityResolutions: z.array(IdentityResolutionSchema),
  conflicts: z.array(ConflictSchema),
  review: z.object({
    status: z.enum(['pending-human-review', 'partially-reviewed', 'approved']),
    reviewerId: z.string().nullable(),
    reviewedAt: PublicDateSchema.nullable(),
    note: z.string().min(1),
  }),
});

export type Claim = z.infer<typeof ClaimSchema>;
export type Evidence = z.infer<typeof EvidenceSchema>;
export type IdentityResolution = z.infer<typeof IdentityResolutionSchema>;
export type Conflict = z.infer<typeof ConflictSchema>;
export type PositionRecord = z.infer<typeof PositionRecordSchema>;
export type PolicyRecord = z.infer<typeof PolicyRecordSchema>;
export type PublicActivityRecord = z.infer<typeof PublicActivityRecordSchema>;
export type NewsRecord = z.infer<typeof NewsRecordSchema>;
export type RelationshipRecord = z.infer<typeof RelationshipRecordSchema>;
export type TimelineEventRecord = z.infer<typeof TimelineEventRecordSchema>;
export type PublicRecordsDataset = z.infer<typeof PublicRecordsDatasetSchema>;
export type PublicRecordCategory =
  | 'positions'
  | 'policies'
  | 'activities'
  | 'news'
  | 'relationships'
  | 'timeline';

export type PublicRecordBundle = {
  personId: string;
  claims: Claim[];
  evidence: Evidence[];
  positions: PositionRecord[];
  policies: PolicyRecord[];
  activities: PublicActivityRecord[];
  news: NewsRecord[];
  relationships: RelationshipRecord[];
  timeline: TimelineEventRecord[];
  identityResolutions: IdentityResolution[];
  conflicts: Conflict[];
};

function checkUnique(label: string, ids: string[], errors: string[]) {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) errors.push(`duplicate ${label}: ${id}`);
    seen.add(id);
  }
}

function checkRecordRefs(
  label: string,
  records: Array<{
    id: string;
    personId?: string;
    personIds?: string[];
    claimIds: string[];
    evidenceIds: string[];
  }>,
  claimIds: Set<string>,
  evidenceIds: Set<string>,
  selectedPersonIds: Set<string>,
  errors: string[],
) {
  for (const record of records) {
    const people = record.personId
      ? [record.personId]
      : (record.personIds ?? []);
    for (const personId of people)
      if (!selectedPersonIds.has(personId))
        errors.push(
          `${label} ${record.id} references unselected person ${personId}`,
        );
    for (const claimId of record.claimIds)
      if (!claimIds.has(claimId))
        errors.push(
          `${label} ${record.id} references missing claim ${claimId}`,
        );
    for (const evidenceId of record.evidenceIds)
      if (!evidenceIds.has(evidenceId))
        errors.push(
          `${label} ${record.id} references missing evidence ${evidenceId}`,
        );
  }
}

export function validatePublicRecordsDataset(
  input: unknown,
  manifestSourceIds: ReadonlySet<string>,
): PublicRecordsDataset {
  const parsed = PublicRecordsDatasetSchema.safeParse(input);
  if (!parsed.success) {
    const details = parsed.error.issues.map(
      (issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`,
    );
    throw new Error(
      `Public-record dataset validation failed:\n${details.join('\n')}`,
    );
  }
  const dataset = parsed.data;
  const errors: string[] = [];
  checkUnique(
    'claim ID',
    dataset.claims.map((item) => item.claimId),
    errors,
  );
  checkUnique(
    'evidence ID',
    dataset.evidence.map((item) => item.evidenceId),
    errors,
  );
  checkUnique(
    'position ID',
    dataset.positions.map((item) => item.id),
    errors,
  );
  checkUnique(
    'policy ID',
    dataset.policies.map((item) => item.id),
    errors,
  );
  checkUnique(
    'activity ID',
    dataset.activities.map((item) => item.id),
    errors,
  );
  checkUnique(
    'news ID',
    dataset.news.map((item) => item.id),
    errors,
  );
  checkUnique(
    'relationship ID',
    dataset.relationships.map((item) => item.id),
    errors,
  );
  checkUnique(
    'timeline ID',
    dataset.timeline.map((item) => item.id),
    errors,
  );
  checkUnique(
    'identity resolution ID',
    dataset.identityResolutions.map((item) => item.resolutionId),
    errors,
  );
  checkUnique(
    'conflict ID',
    dataset.conflicts.map((item) => item.conflictId),
    errors,
  );
  const claimIds = new Set(dataset.claims.map((item) => item.claimId));
  const evidenceIds = new Set(dataset.evidence.map((item) => item.evidenceId));
  const selectedPersonIds = new Set(dataset.selectedPersonIds);
  const sourceIds = new Set(dataset.sourceIds);
  for (const sourceId of dataset.sourceIds)
    if (!manifestSourceIds.has(sourceId))
      errors.push(`missing manifest source ${sourceId}`);
  for (const claim of dataset.claims) {
    if (!selectedPersonIds.has(claim.subjectId))
      errors.push(
        `claim ${claim.claimId} has unselected subject ${claim.subjectId}`,
      );
    for (const evidenceId of claim.evidenceIds) {
      const evidence = dataset.evidence.find(
        (item) => item.evidenceId === evidenceId,
      );
      if (!evidence)
        errors.push(
          `claim ${claim.claimId} references missing evidence ${evidenceId}`,
        );
      else if (evidence.claimId !== claim.claimId)
        errors.push(
          `claim ${claim.claimId} references evidence ${evidenceId} for claim ${evidence.claimId}`,
        );
    }
    if (claim.validFrom && claim.validTo && claim.validFrom > claim.validTo)
      errors.push(`claim ${claim.claimId} has an inverted validity range`);
  }
  for (const evidence of dataset.evidence) {
    if (!sourceIds.has(evidence.sourceId))
      errors.push(
        `evidence ${evidence.evidenceId} uses source outside dataset ${evidence.sourceId}`,
      );
    if (!claimIds.has(evidence.claimId))
      errors.push(
        `evidence ${evidence.evidenceId} references missing claim ${evidence.claimId}`,
      );
  }
  checkRecordRefs(
    'position',
    dataset.positions,
    claimIds,
    evidenceIds,
    selectedPersonIds,
    errors,
  );
  checkRecordRefs(
    'policy',
    dataset.policies,
    claimIds,
    evidenceIds,
    selectedPersonIds,
    errors,
  );
  checkRecordRefs(
    'activity',
    dataset.activities,
    claimIds,
    evidenceIds,
    selectedPersonIds,
    errors,
  );
  checkRecordRefs(
    'news',
    dataset.news,
    claimIds,
    evidenceIds,
    selectedPersonIds,
    errors,
  );
  checkRecordRefs(
    'relationship',
    dataset.relationships,
    claimIds,
    evidenceIds,
    selectedPersonIds,
    errors,
  );
  checkRecordRefs(
    'timeline',
    dataset.timeline,
    claimIds,
    evidenceIds,
    selectedPersonIds,
    errors,
  );
  for (const resolution of dataset.identityResolutions) {
    if (!selectedPersonIds.has(resolution.personId))
      errors.push(
        `identity resolution ${resolution.resolutionId} has unselected person`,
      );
    if (!sourceIds.has(resolution.sourceId))
      errors.push(
        `identity resolution ${resolution.resolutionId} uses source outside dataset`,
      );
    for (const evidenceId of resolution.evidenceIds)
      if (!evidenceIds.has(evidenceId))
        errors.push(
          `identity resolution ${resolution.resolutionId} references missing evidence ${evidenceId}`,
        );
  }
  for (const conflict of dataset.conflicts) {
    for (const claimId of conflict.claimIds)
      if (!claimIds.has(claimId))
        errors.push(
          `conflict ${conflict.conflictId} references missing claim ${claimId}`,
        );
    if (conflict.status === 'resolved' && !conflict.resolution)
      errors.push(
        `resolved conflict ${conflict.conflictId} must include a resolution`,
      );
  }
  if (
    dataset.review.status === 'approved' &&
    (dataset.review.reviewerId === null || dataset.review.reviewedAt === null)
  )
    errors.push(
      'approved dataset must contain reviewer identity and review date',
    );
  if (
    dataset.review.status === 'pending-human-review' &&
    (dataset.review.reviewerId !== null || dataset.review.reviewedAt !== null)
  )
    errors.push(
      'pending-human-review dataset cannot contain reviewer identity or review date',
    );
  if (errors.length > 0)
    throw new Error(
      `Public-record reference validation failed:\n${errors.join('\n')}`,
    );
  return dataset;
}
