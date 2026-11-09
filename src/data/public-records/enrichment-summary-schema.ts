import { z } from 'zod';

const DateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const OutcomeSchema = z.enum([
  'records-found',
  'policy-references-only',
  'sources-attempted-no-additional-records',
  'sources-unavailable',
  'identity-conflict',
  'no-verifiable-record-found',
]);

const ResearchStatusSchema = z.literal('completed');

export const PublicRecordsEnrichmentSummaryAuditSchema = z
  .object({
    candidateId: z.string().min(1),
    outcome: OutcomeSchema,
    researchStatus: ResearchStatusSchema,
    sourceAttemptCount: z.number().int().nonnegative(),
    retrievedSourceAttemptCount: z.number().int().nonnegative(),
    retainedSourceCount: z.number().int().nonnegative(),
    resolvedSourceCount: z.number().int().nonnegative(),
    pendingClaimCount: z.number().int().nonnegative(),
    pendingEvidenceCount: z.number().int().nonnegative(),
    pendingPositionCount: z.number().int().nonnegative(),
    pendingCareerRecordCount: z.number().int().nonnegative(),
    pendingPolicyReferenceCount: z.number().int().nonnegative(),
    pendingRecordCount: z.number().int().nonnegative(),
    publishedRecordCount: z.literal(0),
    note: z.string().min(1),
  })
  .strict();

export const PublicRecordsEnrichmentSummarySchema = z
  .object({
    datasetId: z.literal('kaohsiung-2026-public-records-enrichment'),
    snapshotDate: DateOnlySchema,
    researchCutoff: DateOnlySchema,
    candidateCount: z.literal(106),
    audits: z.array(PublicRecordsEnrichmentSummaryAuditSchema).length(106),
  })
  .strict();

export type PublicRecordsEnrichmentSummary = z.infer<
  typeof PublicRecordsEnrichmentSummarySchema
>;

export function validatePublicRecordsEnrichmentSummary(
  input: unknown,
): PublicRecordsEnrichmentSummary {
  const parsed = PublicRecordsEnrichmentSummarySchema.safeParse(input);
  if (!parsed.success) {
    const details = parsed.error.issues.map(
      (issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`,
    );
    throw new Error(
      `Public-record enrichment summary validation failed:\n${details.join('\n')}`,
    );
  }
  const candidateIds = new Set(
    parsed.data.audits.map((audit) => audit.candidateId),
  );
  if (candidateIds.size !== parsed.data.audits.length) {
    throw new Error(
      'Public-record enrichment summary contains duplicate candidate IDs',
    );
  }
  return parsed.data;
}
