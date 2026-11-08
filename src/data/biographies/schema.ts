import { z } from 'zod';

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const IsoTimestampSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/);
const PartialDateSchema = z
  .string()
  .regex(/^\d{4}(?:-\d{2})?(?:-\d{2})?$/)
  .nullable();

export const BiographySourceClassSchema = z.enum([
  'kcc-current-member-directory',
  'kcc-member-profile',
  'moi-local-official-index',
  'moi-local-official-detail',
  'legislative-yuan',
  'cec-historical',
  'government-record',
  'candidate-self-report',
]);
export const BiographyOutcomeSchema = z.enum([
  'retrieved',
  'retrieved-no-candidate-match',
  'blocked',
  'failed',
  'unattempted',
]);
export const BiographyTimestampQualitySchema = z.enum([
  'source-header',
  'execution-record',
  'capture-file-mtime',
  'unavailable',
]);
export const BiographyIdentityStatusSchema = z.enum([
  'resolved',
  'ambiguous',
  'conflicted',
  'not-matched',
]);
export const BiographyClaimTypeSchema = z.enum([
  'current-position',
  'historical-position',
  'historical-candidacy',
  'elected-office',
  'professional-experience',
  'education',
  'career-event',
]);
export const BiographyAttributionSchema = z.enum([
  'institutional-record',
  'candidate-statement',
  'independently-corroborated',
]);
export const BiographyMachineStatusSchema = z.enum([
  'machine-validated',
  'machine-rejected',
  'machine-pending',
]);
export const BiographyHumanReviewStatusSchema = z.enum([
  'not-reviewed',
  'human-reviewed',
]);
export const BiographyEditorialStatusSchema = z.enum([
  'not-reviewed',
  'editorially-approved',
  'editorially-rejected',
]);
export const BiographyPublicationStatusSchema = z.enum([
  'withheld-pending-review',
  'withheld-conflict',
  'approved-static',
]);
export const BiographySourceDependencySchema = z.enum([
  'source-backed',
  'source-dependent',
  'self-reported',
]);

export const BiographySourceAttemptSchema = z.object({
  attemptId: z.string().min(1),
  sourceId: z.string().min(1),
  sourceClass: BiographySourceClassSchema,
  method: z.enum(['GET', 'POST']),
  url: z.url(),
  query: z.string().nullable(),
  attemptedAt: IsoTimestampSchema,
  outcome: BiographyOutcomeSchema,
  httpStatus: z.number().int().min(100).max(599).nullable(),
  contentType: z.string().min(1).nullable(),
  rawPath: z.string().min(1).nullable(),
  sha256: Sha256Schema.nullable(),
  byteLength: z.number().int().nonnegative().nullable(),
  excerpt: z.string().min(1).nullable(),
  failureReason: z.string().min(1).nullable(),
  timestampQuality: BiographyTimestampQualitySchema,
  sourceRetrievedAt: IsoTimestampSchema.nullable(),
  isNegativeEvidence: z.literal(false),
});

export const BiographyIdentityObservationSchema = z.object({
  observationId: z.string().min(1),
  sourceId: z.string().min(1),
  sourceAttemptId: z.string().min(1),
  externalIdentifier: z.string().min(1).nullable(),
  observedName: z.string().min(1),
  observedParty: z.string().min(1).nullable(),
  observedDistrict: z.string().min(1).nullable(),
  observedJurisdiction: z.string().min(1).nullable(),
  candidateIds: z.array(z.string().min(1)),
  identityStatus: BiographyIdentityStatusSchema,
  matchBasis: z.array(z.string().min(1)).min(1),
  rationale: z.string().min(1),
  isNameOnlyMatch: z.boolean(),
  excerpt: z.string().min(1),
});

export const BiographyEvidenceSchema = z.object({
  evidenceId: z.string().min(1),
  claimId: z.string().min(1),
  sourceId: z.string().min(1),
  sourceAttemptId: z.string().min(1),
  documentLocation: z.string().min(1),
  excerpt: z.string().min(1),
  supportType: z.enum(['direct', 'context', 'contradicts']),
  attribution: BiographyAttributionSchema,
  verificationStatus: z.enum(['source-retrieved', 'pending-review']),
});

export const BiographyClaimLineageSchema = z.object({
  correctionId: z.string().min(1),
  correctionType: z.literal('attribution-correction'),
  originalClaimType: BiographyClaimTypeSchema,
  originalAttribution: BiographyAttributionSchema,
  originalSourceDependency: BiographySourceDependencySchema,
  rationale: z.string().min(1),
  sourceId: z.string().min(1),
  sourceSha256: Sha256Schema.nullable(),
  evidenceId: z.string().min(1),
  correctionMethod: z.literal(
    'execute-biography-research:kcc-service-statement-detector',
  ),
});

const BiographyClaimBaseSchema = z.object({
  claimId: z.string().min(1),
  candidateId: z.string().min(1),
  personId: z.string().min(1),
  claimType: BiographyClaimTypeSchema,
  title: z.string().min(1),
  organization: z.string().min(1).nullable(),
  value: z.string().min(1),
  validFrom: PartialDateSchema,
  validTo: PartialDateSchema,
  temporalPrecision: z.enum(['day', 'month', 'year', 'unknown']),
  currentStatus: z.enum(['current', 'historical', 'unknown']),
  attribution: BiographyAttributionSchema,
  sourceDependency: BiographySourceDependencySchema,
  sourceIds: z.array(z.string().min(1)).min(1),
  evidenceIds: z.array(z.string().min(1)).min(1),
  identityObservationIds: z.array(z.string().min(1)).min(1),
  machineStatus: BiographyMachineStatusSchema,
  humanReviewStatus: BiographyHumanReviewStatusSchema,
  editorialStatus: BiographyEditorialStatusSchema,
  publicationStatus: BiographyPublicationStatusSchema,
  reviewerId: z.string().min(1).nullable(),
  reviewedAt: IsoTimestampSchema.nullable(),
  lineage: BiographyClaimLineageSchema.optional(),
});

export const BiographyClaimSchema = BiographyClaimBaseSchema.superRefine(
  (claim, context) => {
    if (
      claim.claimType === 'historical-candidacy' &&
      claim.currentStatus === 'current'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['currentStatus'],
        message: 'A historical candidacy cannot be current.',
      });
    }
    if (
      claim.claimType === 'elected-office' &&
      claim.sourceDependency === 'self-reported'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['sourceDependency'],
        message: 'A self-report cannot independently establish elected office.',
      });
    }
    if (claim.publicationStatus === 'approved-static') {
      if (
        claim.humanReviewStatus !== 'human-reviewed' ||
        claim.editorialStatus !== 'editorially-approved'
      ) {
        context.addIssue({
          code: 'custom',
          path: ['publicationStatus'],
          message: 'Static publication requires human and editorial approval.',
        });
      }
      if (claim.reviewerId === null || claim.reviewedAt === null) {
        context.addIssue({
          code: 'custom',
          path: ['reviewerId'],
          message: 'Published claims require reviewer metadata.',
        });
      }
    }
    if (
      claim.attribution === 'candidate-statement' &&
      claim.sourceDependency !== 'self-reported'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['sourceDependency'],
        message: 'Candidate statements must remain self-reported.',
      });
    }
  },
);

export const BiographyPublishedClaimSchema = BiographyClaimBaseSchema.omit({
  reviewerId: true,
  reviewedAt: true,
})
  .extend({
    humanReviewStatus: z.literal('human-reviewed'),
    editorialStatus: z.literal('editorially-approved'),
    publicationStatus: z.literal('approved-static'),
  })
  .strict()
  .superRefine((claim, context) => {
    if (
      claim.claimType === 'historical-candidacy' &&
      claim.currentStatus === 'current'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['currentStatus'],
        message: 'A historical candidacy cannot be current.',
      });
    }
    if (
      claim.claimType === 'elected-office' &&
      claim.sourceDependency === 'self-reported'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['sourceDependency'],
        message: 'A self-report cannot independently establish elected office.',
      });
    }
    if (
      claim.attribution === 'candidate-statement' &&
      claim.sourceDependency !== 'self-reported'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['sourceDependency'],
        message: 'Candidate statements must remain self-reported.',
      });
    }
  });

export const BiographyConflictSchema = z.object({
  conflictId: z.string().min(1),
  candidateId: z.string().min(1),
  rosterName: z.string().min(1),
  competingObservedNames: z.array(z.string().min(1)).min(1),
  priorEvidenceSourceIds: z.array(z.string().min(1)).min(1),
  additionalObservationIds: z.array(z.string().min(1)),
  status: z.enum(['open', 'resolved', 'withheld']),
  resolution: z.string().min(1),
  isNameOnlyResolution: z.literal(false),
});

export const BiographyAuditSchema = z.object({
  auditId: z.string().min(1),
  candidateId: z.string().min(1),
  displayName: z.string().min(1),
  districtId: z.string().min(1),
  electionType: z.enum(['mayoral', 'city-council', 'indigenous-council']),
  sourceClassesAttempted: z.array(BiographySourceClassSchema),
  sourceIds: z.array(z.string().min(1)),
  outcome: z.enum([
    'evidence-found',
    'no-conservative-match',
    'identity-conflict',
    'unattempted',
  ]),
  claimIds: z.array(z.string().min(1)),
  observationIds: z.array(z.string().min(1)),
  evidenceIds: z.array(z.string().min(1)),
  failureReason: z.string().min(1).nullable(),
  note: z.string().min(1),
  isNegativeEvidence: z.literal(false),
});

export const BiographyReviewItemSchema = z.object({
  reviewItemId: z.string().min(1),
  candidateId: z.string().min(1),
  claimIds: z.array(z.string().min(1)),
  observationIds: z.array(z.string().min(1)),
  evidenceIds: z.array(z.string().min(1)),
  suggestedDisposition: z.enum([
    'human-review-required',
    'withhold-conflict',
    'research-required',
  ]),
  machineStatus: z.literal('machine-validated'),
  humanReviewStatus: z.literal('not-reviewed'),
  editorialStatus: z.literal('not-reviewed'),
  publicationStatus: z.enum(['withheld-pending-review', 'withheld-conflict']),
  reviewerId: z.null(),
  reviewedAt: z.null(),
  note: z.string().min(1),
});

export const BiographyReviewDatasetSchema = z.object({
  datasetId: z.literal('kaohsiung-2026-candidate-biographies-review'),
  snapshotDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.literal('pending-human-review'),
  reviewerId: z.null(),
  reviewedAt: z.null(),
  items: z.array(BiographyReviewItemSchema),
});

export const BiographyCheckpointSchema = z.object({
  checkpointId: z.string().min(1),
  runId: z.string().min(1),
  command: z.enum(['execute', 'normalize', 'validate', 'review', 'verify']),
  snapshotDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  attemptedSourceIds: z.array(z.string().min(1)),
  completedSourceIds: z.array(z.string().min(1)),
  failedSourceIds: z.array(z.string().min(1)),
  retryLimit: z.number().int().min(0).max(5),
  concurrency: z.number().int().min(1).max(8),
  dryRun: z.boolean(),
  resumedFromRunId: z.string().nullable(),
  updatedAt: IsoTimestampSchema,
});

export const BiographyDatasetSchema = z.object({
  datasetId: z.literal('kaohsiung-2026-candidate-biographies'),
  snapshotDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rosterSnapshotDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  candidateCount: z.number().int().nonnegative(),
  sources: z.array(BiographySourceAttemptSchema),
  observations: z.array(BiographyIdentityObservationSchema),
  evidence: z.array(BiographyEvidenceSchema),
  claims: z.array(BiographyClaimSchema),
  audits: z.array(BiographyAuditSchema),
  conflicts: z.array(BiographyConflictSchema),
  checkpoint: BiographyCheckpointSchema,
  review: z.object({
    status: z.literal('pending-human-review'),
    reviewerId: z.null(),
    reviewedAt: z.null(),
    note: z.string().min(1),
  }),
});

export const BiographyApprovedDatasetSchema = z.object({
  datasetId: z.literal('kaohsiung-2026-candidate-biographies-approved'),
  snapshotDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  records: z.array(BiographyPublishedClaimSchema),
  note: z.string().min(1),
});

export type BiographySourceAttempt = z.infer<
  typeof BiographySourceAttemptSchema
>;
export type BiographyIdentityObservation = z.infer<
  typeof BiographyIdentityObservationSchema
>;
export type BiographyEvidence = z.infer<typeof BiographyEvidenceSchema>;
export type BiographyClaim = z.infer<typeof BiographyClaimSchema>;
export type BiographyPublishedClaim = z.infer<
  typeof BiographyPublishedClaimSchema
>;
export type BiographyConflict = z.infer<typeof BiographyConflictSchema>;
export type BiographyAudit = z.infer<typeof BiographyAuditSchema>;
export type BiographyReviewItem = z.infer<typeof BiographyReviewItemSchema>;
export type BiographyReviewDataset = z.infer<
  typeof BiographyReviewDatasetSchema
>;
export type BiographyCheckpoint = z.infer<typeof BiographyCheckpointSchema>;
export type BiographyDataset = z.infer<typeof BiographyDatasetSchema>;
export type BiographyApprovedDataset = z.infer<
  typeof BiographyApprovedDatasetSchema
>;
export type BiographyClaimType = z.infer<typeof BiographyClaimTypeSchema>;
export type BiographySourceClass = z.infer<typeof BiographySourceClassSchema>;
export type BiographyOutcome = z.infer<typeof BiographyOutcomeSchema>;

export function validateBiographyReviewDataset(
  input: unknown,
): BiographyReviewDataset {
  const result = BiographyReviewDatasetSchema.safeParse(input);
  if (!result.success) {
    throw new Error(
      `Biography review validation failed:\n${result.error.issues
        .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
        .join('\n')}`,
    );
  }
  return result.data;
}

export function validateBiographyDataset(input: unknown): BiographyDataset {
  const result = BiographyDatasetSchema.safeParse(input);
  if (!result.success) {
    throw new Error(
      `Biography dataset validation failed:\n${result.error.issues
        .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
        .join('\n')}`,
    );
  }
  return result.data;
}

export function validateBiographyApprovedDataset(
  input: unknown,
): BiographyApprovedDataset {
  const result = BiographyApprovedDatasetSchema.safeParse(input);
  if (!result.success) {
    throw new Error(
      `Approved biography dataset validation failed:\n${result.error.issues
        .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
        .join('\n')}`,
    );
  }
  return result.data;
}

export function assertClaimEvidence(dataset: BiographyDataset): void {
  const sourceIds = new Set(dataset.sources.map((source) => source.sourceId));
  const observationIds = new Set(
    dataset.observations.map((observation) => observation.observationId),
  );
  const evidenceIds = new Set(
    dataset.evidence.map((evidence) => evidence.evidenceId),
  );
  for (const claim of dataset.claims) {
    if (claim.publicationStatus === 'approved-static') {
      throw new Error(
        `Biography claim ${claim.claimId} is marked approved in an unapproved dataset.`,
      );
    }
    for (const sourceId of claim.sourceIds)
      if (!sourceIds.has(sourceId))
        throw new Error(
          `Claim ${claim.claimId} references missing source ${sourceId}.`,
        );
    for (const observationId of claim.identityObservationIds)
      if (!observationIds.has(observationId))
        throw new Error(
          `Claim ${claim.claimId} references missing identity observation ${observationId}.`,
        );
    for (const evidenceId of claim.evidenceIds)
      if (!evidenceIds.has(evidenceId))
        throw new Error(
          `Claim ${claim.claimId} references missing evidence ${evidenceId}.`,
        );
  }
  for (const evidence of dataset.evidence) {
    if (!sourceIds.has(evidence.sourceId))
      throw new Error(
        `Evidence ${evidence.evidenceId} references missing source ${evidence.sourceId}.`,
      );
  }
}
