import { z } from 'zod';

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const IsoTimestampSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/);
const DateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const PartialDateSchema = z
  .string()
  .regex(/^\d{4}(?:-\d{2})?(?:-\d{2})?$/)
  .nullable();

export const ENRICHMENT_CATEGORIES = [
  'basic-biography',
  'policies',
  'public-records',
  'news',
  'relationships',
  'timeline',
] as const;
export const EnrichmentCategorySchema = z.enum(ENRICHMENT_CATEGORIES);
export type EnrichmentCategory = (typeof ENRICHMENT_CATEGORIES)[number];

export const EnrichmentSourceClassSchema = z.enum([
  'cec-roster',
  'khec-roster',
  'kcc-current-member-directory',
  'kcc-member-profile',
  'kcc-history',
  'legislative-yuan',
  'government-record',
  'candidate-statement',
  'news-report',
  'search-discovery',
]);
export const EnrichmentSourceTierSchema = z.enum([
  'tier-1-official',
  'tier-2-candidate',
  'tier-3-news',
  'discovery-only',
]);
export const EnrichmentOutcomeSchema = z.enum([
  'retrieved',
  'retrieved-no-candidate-match',
  'blocked',
  'failed',
  'unattempted',
]);
export const EnrichmentTimestampQualitySchema = z.enum([
  'source-header',
  'execution-record',
  'capture-file-mtime',
  'unavailable',
]);
export const EnrichmentIdentityStatusSchema = z.enum([
  'resolved',
  'ambiguous',
  'conflicted',
  'not-matched',
]);
export const EnrichmentAttributionSchema = z.enum([
  'institutional-record',
  'candidate-statement',
  'news-report',
  'independently-corroborated',
]);
export const EnrichmentSourceDependencySchema = z.enum([
  'institutional-record',
  'source-dependent',
  'self-reported',
]);
export const EnrichmentClaimTypeSchema = z.enum([
  'current-position',
  'historical-position',
  'historical-candidacy',
  'elected-office',
  'professional-experience',
  'education',
  'career-event',
  'policy-statement',
  'public-activity',
  'administrative-outcome',
  'news-report',
  'family-relationship',
  'political-relationship',
  'timeline-event',
]);
export const EnrichmentMachineStatusSchema = z.enum([
  'machine-validated',
  'machine-pending',
  'machine-rejected',
]);

export const EnrichmentSourceAttemptSchema = z.object({
  attemptId: z.string().min(1),
  sourceId: z.string().min(1),
  candidateId: z.string().min(1),
  category: EnrichmentCategorySchema,
  sourceClass: EnrichmentSourceClassSchema,
  sourceTier: EnrichmentSourceTierSchema,
  method: z.enum(['GET', 'POST']),
  url: z.url(),
  query: z.string().nullable(),
  attemptedAt: IsoTimestampSchema,
  outcome: EnrichmentOutcomeSchema,
  httpStatus: z.number().int().min(100).max(599).nullable(),
  contentType: z.string().min(1).nullable(),
  rawPath: z.string().min(1).nullable(),
  sha256: Sha256Schema.nullable(),
  byteLength: z.number().int().nonnegative().nullable(),
  excerpt: z.string().min(1).nullable(),
  failureReason: z.string().min(1).nullable(),
  timestampQuality: EnrichmentTimestampQualitySchema,
  sourceRetrievedAt: IsoTimestampSchema.nullable(),
  isNegativeEvidence: z.literal(false),
});

export const EnrichmentIdentityObservationSchema = z.object({
  observationId: z.string().min(1),
  candidateId: z.string().min(1),
  sourceId: z.string().min(1),
  sourceAttemptId: z.string().min(1),
  externalIdentifier: z.string().min(1).nullable(),
  observedName: z.string().min(1),
  observedJurisdiction: z.string().min(1).nullable(),
  observedOffice: z.string().min(1).nullable(),
  candidateIds: z.array(z.string().min(1)),
  identityStatus: EnrichmentIdentityStatusSchema,
  matchBasis: z.array(z.string().min(1)).min(1),
  rationale: z.string().min(1),
  isNameOnlyMatch: z.literal(false),
  excerpt: z.string().min(1),
});

export const EnrichmentEvidenceSchema = z.object({
  evidenceId: z.string().min(1),
  claimId: z.string().min(1),
  sourceId: z.string().min(1),
  sourceAttemptId: z.string().min(1),
  documentLocation: z.string().min(1),
  excerpt: z.string().min(1),
  supportType: z.enum(['direct', 'context', 'contradicts']),
  attribution: EnrichmentAttributionSchema,
  verificationStatus: z.enum(['source-retrieved', 'pending-review']),
});

export const EnrichmentClaimSchema = z.object({
  claimId: z.string().min(1),
  candidateId: z.string().min(1),
  personId: z.string().min(1),
  category: EnrichmentCategorySchema,
  claimType: EnrichmentClaimTypeSchema,
  title: z.string().min(1),
  organization: z.string().min(1).nullable(),
  value: z.string().min(1),
  sourcePublicationDate: DateOnlySchema.nullable(),
  validFrom: PartialDateSchema,
  validTo: PartialDateSchema,
  temporalPrecision: z.enum(['day', 'month', 'year', 'unknown']),
  currentStatus: z.enum(['current', 'historical', 'unknown']),
  attribution: EnrichmentAttributionSchema,
  sourceDependency: EnrichmentSourceDependencySchema,
  sourceIds: z.array(z.string().min(1)).min(1),
  evidenceIds: z.array(z.string().min(1)).min(1),
  identityObservationIds: z.array(z.string().min(1)).min(1),
  machineStatus: EnrichmentMachineStatusSchema,
  humanReviewStatus: z.literal('not-reviewed'),
  editorialStatus: z.literal('not-reviewed'),
  publicationStatus: z.literal('withheld-pending-review'),
  reviewerId: z.null(),
  reviewedAt: z.null(),
  notes: z.array(z.string().min(1)),
});

export const EnrichmentAuditSchema = z.object({
  auditId: z.string().min(1),
  candidateId: z.string().min(1),
  personId: z.string().min(1),
  displayName: z.string().min(1),
  electionType: z.enum(['mayoral', 'city-council']),
  districtId: z.string().min(1),
  category: EnrichmentCategorySchema,
  discoveryMethod: z.string().min(1),
  queryOrDiscoveryPlan: z.string().min(1),
  sourceIds: z.array(z.string().min(1)),
  attemptIds: z.array(z.string().min(1)).min(1),
  retrievalStatus: z.enum([
    'retrieved',
    'no-candidate-match',
    'blocked',
    'failed',
  ]),
  identityStatus: EnrichmentIdentityStatusSchema,
  matchingConfidence: z.number().min(0).max(1).nullable(),
  discoveryResult: z.string().min(1),
  failureReason: z.string().min(1).nullable(),
  claimIds: z.array(z.string().min(1)),
  evidenceIds: z.array(z.string().min(1)),
  machineValidatedClaimCount: z.number().int().nonnegative(),
  humanReviewedClaimCount: z.literal(0),
  editoriallyApprovedClaimCount: z.literal(0),
  publishedRecordCount: z.literal(0),
  conflictCount: z.number().int().nonnegative(),
  duplicateGroupIds: z.array(z.string().min(1)),
  blockers: z.array(z.string().min(1)),
  reviewState: z.literal('pending-human-review'),
  publicationState: z.literal('not-published'),
  lastAttemptedAt: IsoTimestampSchema,
});

export const EnrichmentDuplicateGroupSchema = z.object({
  groupId: z.string().min(1),
  kind: z.enum(['exact-duplicate', 'possible-overlap']),
  candidateId: z.string().min(1),
  claimIds: z.array(z.string().min(1)).min(2),
  rationale: z.string().min(1),
  disposition: z.literal('retain-both-pending-human-review'),
});

export const EnrichmentVerificationSchema = z.object({
  verificationId: z.string().min(1),
  candidateId: z.string().min(1),
  candidateGroup: z.enum(['district-4', 'mayoral']),
  claimId: z.string().min(1),
  sourceId: z.string().min(1),
  method: z.literal('independent-source-reopen'),
  checks: z.array(z.string().min(1)).min(1),
  result: z.enum(['matches', 'discrepancy', 'insufficient']),
  discrepancy: z.string().nullable(),
  verifiedAt: IsoTimestampSchema,
});

export const EnrichmentReviewItemSchema = z.object({
  reviewItemId: z.string().min(1),
  candidateId: z.string().min(1),
  category: EnrichmentCategorySchema,
  itemType: z.enum([
    'claim',
    'coverage-gap',
    'identity-ambiguity',
    'duplicate-review',
  ]),
  claimId: z.string().nullable(),
  sourceIds: z.array(z.string().min(1)),
  suggestedDisposition: z.enum([
    'review-and-approve-if-supported',
    'request-additional-evidence',
    'resolve-identity-before-review',
    'retain-both-and-consolidate-editorially',
    'keep-withheld',
  ]),
  status: z.literal('pending-human-review'),
  reviewerId: z.null(),
  reviewedAt: z.null(),
  notes: z.string().min(1),
});

export const EnrichmentDatasetSchema = z.object({
  datasetId: z.literal('kaohsiung-2026-zuoying-mayoral-enrichment'),
  snapshotDate: DateOnlySchema,
  rosterSnapshotDate: DateOnlySchema,
  candidateCount: z.literal(17),
  categories: z.array(EnrichmentCategorySchema).length(6),
  candidateIds: z.array(z.string().min(1)).length(17),
  sourceAttempts: z.array(EnrichmentSourceAttemptSchema),
  observations: z.array(EnrichmentIdentityObservationSchema),
  evidence: z.array(EnrichmentEvidenceSchema),
  claims: z.array(EnrichmentClaimSchema),
  audits: z.array(EnrichmentAuditSchema).length(102),
  duplicateGroups: z.array(EnrichmentDuplicateGroupSchema),
  verifications: z.array(EnrichmentVerificationSchema).min(1),
  sourceChecks: z.array(
    z.object({
      sourceId: z.string().min(1),
      rawPath: z.string().min(1),
      expectedSha256: Sha256Schema,
      actualSha256: Sha256Schema,
      byteLength: z.number().int().nonnegative(),
      status: z.literal('unchanged'),
      checkedAt: IsoTimestampSchema,
    }),
  ),
  checkpoint: z.object({
    checkpointId: z.string().min(1),
    runId: z.string().min(1),
    command: z.enum(['execute', 'validate', 'report', 'verify']),
    completedAuditIds: z.array(z.string().min(1)).length(102),
    failedAuditIds: z.array(z.string().min(1)),
    updatedAt: IsoTimestampSchema,
  }),
  review: z.object({
    status: z.literal('pending-human-review'),
    reviewerId: z.null(),
    reviewedAt: z.null(),
    note: z.string().min(1),
  }),
});

export const EnrichmentCandidateSnapshotSchema = z.object({
  candidateId: z.string().min(1),
  personId: z.string().min(1),
  displayName: z.string().min(1),
  electionType: z.enum(['mayoral', 'city-council']),
  districtId: z.string().min(1),
  candidateStatus: z.string().min(1),
  formalStatus: z.string().min(1),
  partyStatus: z.string().min(1),
});

export const EnrichmentReviewPacketSchema = z.object({
  datasetId: z.literal('kaohsiung-2026-zuoying-mayoral-enrichment'),
  snapshotDate: DateOnlySchema,
  status: z.literal('pending-human-review'),
  reviewerId: z.null(),
  reviewedAt: z.null(),
  candidates: z.array(EnrichmentCandidateSnapshotSchema).length(17),
  sourceAttempts: z.array(EnrichmentSourceAttemptSchema),
  claims: z.array(EnrichmentClaimSchema),
  evidence: z.array(EnrichmentEvidenceSchema),
  audits: z.array(EnrichmentAuditSchema).length(102),
  items: z.array(EnrichmentReviewItemSchema),
  notes: z.array(z.string().min(1)),
});

export const EnrichmentEmptyLayerSchema = z.object({
  datasetId: z.literal('kaohsiung-2026-zuoying-mayoral-enrichment'),
  snapshotDate: DateOnlySchema,
  status: z.literal('empty-until-authorized-publication'),
  records: z.array(z.never()),
  note: z.string().min(1),
});

export type EnrichmentSourceAttempt = z.infer<
  typeof EnrichmentSourceAttemptSchema
>;
export type EnrichmentIdentityObservation = z.infer<
  typeof EnrichmentIdentityObservationSchema
>;
export type EnrichmentEvidence = z.infer<typeof EnrichmentEvidenceSchema>;
export type EnrichmentClaim = z.infer<typeof EnrichmentClaimSchema>;
export type EnrichmentAudit = z.infer<typeof EnrichmentAuditSchema>;
export type EnrichmentDuplicateGroup = z.infer<
  typeof EnrichmentDuplicateGroupSchema
>;
export type EnrichmentVerification = z.infer<
  typeof EnrichmentVerificationSchema
>;
export type EnrichmentReviewItem = z.infer<typeof EnrichmentReviewItemSchema>;
export type EnrichmentDataset = z.infer<typeof EnrichmentDatasetSchema>;
export type EnrichmentCandidateSnapshot = z.infer<
  typeof EnrichmentCandidateSnapshotSchema
>;
export type EnrichmentReviewPacket = z.infer<
  typeof EnrichmentReviewPacketSchema
>;

export function validateEnrichmentDataset(input: unknown): EnrichmentDataset {
  const parsed = EnrichmentDatasetSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(
      `Scoped enrichment validation failed:\n${parsed.error.issues
        .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
        .join('\n')}`,
    );
  }
  const dataset = parsed.data;
  const unique = (label: string, ids: string[]) => {
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    if (duplicates.length > 0)
      throw new Error(
        `Scoped enrichment has duplicate ${label}: ${[...new Set(duplicates)].join(', ')}`,
      );
  };
  unique('candidate IDs', dataset.candidateIds);
  unique(
    'source attempt IDs',
    dataset.sourceAttempts.map((item) => item.attemptId),
  );
  unique(
    'observation IDs',
    dataset.observations.map((item) => item.observationId),
  );
  unique(
    'evidence IDs',
    dataset.evidence.map((item) => item.evidenceId),
  );
  unique(
    'claim IDs',
    dataset.claims.map((item) => item.claimId),
  );
  unique(
    'audit IDs',
    dataset.audits.map((item) => item.auditId),
  );
  const candidateIds = new Set(dataset.candidateIds);
  const sourceIds = new Set(
    dataset.sourceAttempts.map((item) => item.sourceId),
  );
  const attemptIds = new Set(
    dataset.sourceAttempts.map((item) => item.attemptId),
  );
  const observationIds = new Set(
    dataset.observations.map((item) => item.observationId),
  );
  const evidenceIds = new Set(dataset.evidence.map((item) => item.evidenceId));
  const claimIds = new Set(dataset.claims.map((item) => item.claimId));
  for (const item of dataset.sourceAttempts) {
    if (!candidateIds.has(item.candidateId))
      throw new Error(
        `Source attempt ${item.attemptId} references an out-of-scope candidate.`,
      );
    if (
      item.rawPath === null ||
      item.sha256 === null ||
      item.byteLength === null
    )
      throw new Error(
        `Source attempt ${item.attemptId} must retain a raw snapshot and checksum.`,
      );
    if (item.outcome === 'failed' && item.failureReason === null)
      throw new Error(
        `Failed source attempt ${item.attemptId} needs a failure reason.`,
      );
  }
  for (const item of dataset.observations) {
    if (!candidateIds.has(item.candidateId))
      throw new Error(
        `Observation ${item.observationId} references an out-of-scope candidate.`,
      );
    if (!sourceIds.has(item.sourceId) || !attemptIds.has(item.sourceAttemptId))
      throw new Error(
        `Observation ${item.observationId} references missing source provenance.`,
      );
    if (item.identityStatus === 'resolved' && item.candidateIds.length !== 1)
      throw new Error(
        `Resolved observation ${item.observationId} must identify exactly one candidate.`,
      );
  }
  for (const item of dataset.evidence) {
    if (
      !claimIds.has(item.claimId) ||
      !sourceIds.has(item.sourceId) ||
      !attemptIds.has(item.sourceAttemptId)
    )
      throw new Error(
        `Evidence ${item.evidenceId} has a missing claim/source reference.`,
      );
  }
  for (const item of dataset.claims) {
    if (!candidateIds.has(item.candidateId))
      throw new Error(
        `Claim ${item.claimId} references an out-of-scope candidate.`,
      );
    if (
      item.humanReviewStatus !== 'not-reviewed' ||
      item.editorialStatus !== 'not-reviewed' ||
      item.publicationStatus !== 'withheld-pending-review' ||
      item.reviewerId !== null ||
      item.reviewedAt !== null
    )
      throw new Error(
        `Claim ${item.claimId} crosses the human/publication boundary.`,
      );
    if (
      item.attribution === 'candidate-statement' &&
      item.sourceDependency !== 'self-reported'
    )
      throw new Error(
        `Candidate statement ${item.claimId} must be self-reported.`,
      );
    for (const id of item.sourceIds)
      if (!sourceIds.has(id))
        throw new Error(
          `Claim ${item.claimId} references missing source ${id}.`,
        );
    for (const id of item.evidenceIds)
      if (!evidenceIds.has(id))
        throw new Error(
          `Claim ${item.claimId} references missing evidence ${id}.`,
        );
    for (const id of item.identityObservationIds)
      if (!observationIds.has(id))
        throw new Error(
          `Claim ${item.claimId} references missing identity observation ${id}.`,
        );
  }
  const auditKeys = new Set<string>();
  for (const audit of dataset.audits) {
    const key = `${audit.candidateId}:${audit.category}`;
    if (auditKeys.has(key))
      throw new Error(`Duplicate candidate/category audit ${key}.`);
    auditKeys.add(key);
    if (!candidateIds.has(audit.candidateId))
      throw new Error(
        `Audit ${audit.auditId} references an out-of-scope candidate.`,
      );
    for (const id of audit.claimIds)
      if (!claimIds.has(id))
        throw new Error(
          `Audit ${audit.auditId} references missing claim ${id}.`,
        );
    for (const id of audit.evidenceIds)
      if (!evidenceIds.has(id))
        throw new Error(
          `Audit ${audit.auditId} references missing evidence ${id}.`,
        );
  }
  if (auditKeys.size !== 102)
    throw new Error(
      `Expected 102 candidate/category audits, received ${auditKeys.size}.`,
    );
  if (dataset.claims.length !== dataset.evidence.length)
    throw new Error(
      'Every scoped claim must have one direct evidence record in this batch.',
    );
  return dataset;
}

export function validateEnrichmentReviewPacket(
  input: unknown,
): EnrichmentReviewPacket {
  const parsed = EnrichmentReviewPacketSchema.safeParse(input);
  if (!parsed.success)
    throw new Error(
      `Scoped enrichment review packet validation failed: ${parsed.error.message}`,
    );
  return parsed.data;
}
