import { z } from 'zod';
import {
  type BiographyPublicationSnapshot,
  BiographyPublicationSnapshotSchema,
  validateBiographyPublicationSnapshot,
} from '../biographies/publication';
import {
  BiographyClaimSchema,
  BiographyConflictSchema,
  BiographyEvidenceSchema,
  BiographyIdentityObservationSchema,
  BiographyReviewItemSchema,
  BiographySourceAttemptSchema,
} from '../biographies/schema';

const IsoTimestampSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/);
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const EditorialReviewStateSchema = z.enum([
  'unreviewed',
  'needs_identity_review',
  'needs_evidence_review',
  'approved',
  'rejected',
  'disputed',
  'superseded',
]);

export const EditorialDecisionSchema = z
  .object({
    decisionId: z.string().min(1),
    subjectType: z.enum(['claim', 'identity']),
    subjectId: z.string().min(1),
    candidateId: z.string().min(1),
    decision: z.enum([
      'approve',
      'reject',
      'request-clarification',
      'dispute',
      'defer',
      'confirm-same',
      'confirm-different',
      'insufficient-evidence',
      'reject-match',
    ]),
    resultingState: EditorialReviewStateSchema,
    reviewerId: z.string().min(1),
    decidedAt: IsoTimestampSchema,
    rationale: z.string().min(1),
    evidenceVersions: z.array(
      z.object({
        sourceId: z.string().min(1),
        sha256: Sha256Schema,
      }),
    ),
    confirmation: z.boolean(),
    decisionSchemaVersion: z.literal('1'),
    supersedesDecisionId: z.string().min(1).nullable(),
  })
  .superRefine((decision, context) => {
    const isApproval =
      decision.decision === 'approve' || decision.decision === 'confirm-same';
    if (isApproval && !decision.confirmation) {
      context.addIssue({
        code: 'custom',
        path: ['confirmation'],
        message: 'Approval requires explicit confirmation.',
      });
    }
    if (
      decision.subjectType === 'claim' &&
      decision.decision === 'approve' &&
      decision.resultingState !== 'approved'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['resultingState'],
        message: 'An approved claim decision must have approved state.',
      });
    }
    if (
      decision.subjectType === 'identity' &&
      decision.decision === 'confirm-same' &&
      decision.resultingState !== 'approved'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['resultingState'],
        message: 'A confirmed identity must have approved state.',
      });
    }
    if (
      [
        'reject',
        'dispute',
        'request-clarification',
        'defer',
        'confirm-different',
        'insufficient-evidence',
        'reject-match',
      ].includes(decision.decision) &&
      decision.rationale.trim().length < 3
    ) {
      context.addIssue({
        code: 'custom',
        path: ['rationale'],
        message: 'This decision requires a meaningful rationale.',
      });
    }
  });

export const ReviewerActionSchema = z.enum([
  'identity-review',
  'claim-review',
  'editorial-approval',
  'publication-review',
]);

export const ReviewerSchema = z.object({
  reviewerId: z.string().min(1),
  displayName: z.string().min(1),
  role: z.string().min(1),
  authorizedActions: z.array(ReviewerActionSchema).min(1),
  active: z.boolean(),
});

export const ReviewerRegistrySchema = z.object({
  schemaVersion: z.literal('1'),
  reviewers: z.array(ReviewerSchema),
  note: z.string().min(1),
});

export const EditorialDecisionSetSchema = z.object({
  datasetId: z.literal(
    'kaohsiung-2026-candidate-biographies-editorial-decisions',
  ),
  snapshotDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  schemaVersion: z.literal('1'),
  decisions: z.array(EditorialDecisionSchema),
  note: z.string().min(1),
});

const EditorialCandidateSchema = z.object({
  candidateId: z.string().min(1),
  displayName: z.string().min(1),
  districtId: z.string().min(1),
  electionType: z.enum(['mayoral', 'city-council', 'indigenous-council']),
  slug: z.string().min(1),
});

export const EditorialReviewPacketSchema = z.object({
  packetId: z.literal('kaohsiung-2026-candidate-biographies-editorial-packet'),
  snapshotDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  generatedAt: IsoTimestampSchema,
  schemaVersion: z.literal('1'),
  candidates: z.array(EditorialCandidateSchema),
  claims: z.array(BiographyClaimSchema),
  evidence: z.array(BiographyEvidenceSchema),
  sources: z.array(BiographySourceAttemptSchema),
  observations: z.array(BiographyIdentityObservationSchema),
  conflicts: z.array(BiographyConflictSchema),
  reviewItems: z.array(BiographyReviewItemSchema),
});

export const PublicationSnapshotSchema = BiographyPublicationSnapshotSchema;

export const PublicationGateEntrySchema = z.object({
  claimId: z.string().min(1),
  candidateId: z.string().min(1),
  eligible: z.boolean(),
  reasons: z.array(z.string().min(1)),
  decisionId: z.string().min(1).nullable(),
  identityDecisionIds: z.array(z.string().min(1)),
});

export const PublicationGateReportSchema = z.object({
  datasetId: z.literal('kaohsiung-2026-candidate-biographies-publication-gate'),
  snapshotDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  generatedAt: IsoTimestampSchema,
  totalClaims: z.number().int().nonnegative(),
  eligibleClaims: z.number().int().nonnegative(),
  blockedClaims: z.number().int().nonnegative(),
  entries: z.array(PublicationGateEntrySchema),
  blockers: z.record(z.string(), z.number().int().nonnegative()),
  note: z.string().min(1),
});

export type EditorialDecision = z.infer<typeof EditorialDecisionSchema>;
export type Reviewer = z.infer<typeof ReviewerSchema>;
export type ReviewerRegistry = z.infer<typeof ReviewerRegistrySchema>;
export type EditorialDecisionSet = z.infer<typeof EditorialDecisionSetSchema>;
export type EditorialReviewPacket = z.infer<typeof EditorialReviewPacketSchema>;
export type PublicationSnapshot = BiographyPublicationSnapshot;
export type PublicationGateEntry = z.infer<typeof PublicationGateEntrySchema>;
export type PublicationGateReport = z.infer<typeof PublicationGateReportSchema>;
export type EditorialReviewState = z.infer<typeof EditorialReviewStateSchema>;

export function validateReviewerRegistry(input: unknown): ReviewerRegistry {
  const result = ReviewerRegistrySchema.safeParse(input);
  if (!result.success)
    throw new Error(formatIssues('Reviewer registry', result.error.issues));
  return result.data;
}

export function validateEditorialDecisionSet(
  input: unknown,
): EditorialDecisionSet {
  const result = EditorialDecisionSetSchema.safeParse(input);
  if (!result.success)
    throw new Error(formatIssues('Editorial decisions', result.error.issues));
  return result.data;
}

export function validateEditorialReviewPacket(
  input: unknown,
): EditorialReviewPacket {
  const result = EditorialReviewPacketSchema.safeParse(input);
  if (!result.success)
    throw new Error(formatIssues('Editorial packet', result.error.issues));
  return result.data;
}

export const validatePublicationSnapshot = validateBiographyPublicationSnapshot;

export function validatePublicationGateReport(
  input: unknown,
): PublicationGateReport {
  const result = PublicationGateReportSchema.safeParse(input);
  if (!result.success)
    throw new Error(formatIssues('Publication gate', result.error.issues));
  return result.data;
}

function formatIssues(
  label: string,
  issues: Array<{ path: PropertyKey[]; message: string }>,
): string {
  return `${label} validation failed:\n${issues
    .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
    .join('\n')}`;
}

export function activeDecisions(
  decisions: EditorialDecision[],
): EditorialDecision[] {
  const superseded = new Set(
    decisions
      .map((decision) => decision.supersedesDecisionId)
      .filter((decisionId): decisionId is string => Boolean(decisionId)),
  );
  return decisions.filter((decision) => !superseded.has(decision.decisionId));
}
