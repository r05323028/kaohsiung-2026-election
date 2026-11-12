import { z } from 'zod';

const DateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const CandidatePolicyOutcomeSummarySchema = z.enum([
  'verified-records',
  'current-or-historical-only',
  'no-verifiable-policy-found',
  'sources-unavailable',
  'evidence-requires-review',
  'candidate-identity-unresolved',
]);

const ResearchStatusSchema = z.enum([
  'completed',
  'blocked',
  'identity-unresolved',
]);

export const PolicyResearchSummaryAuditSchema = z
  .object({
    candidateId: z.string().min(1),
    outcome: CandidatePolicyOutcomeSummarySchema,
    researchStatus: ResearchStatusSchema,
    policyCount: z.number().int().nonnegative(),
    publishedPolicyCount: z.number().int().nonnegative(),
    note: z.string().min(1),
  })
  .strict();

export const PolicyResearchSummarySchema = z
  .object({
    datasetId: z.literal('kaohsiung-2026-policy-research'),
    snapshotDate: DateOnlySchema,
    researchCutoff: DateOnlySchema,
    candidateCount: z.literal(106),
    audits: z.array(PolicyResearchSummaryAuditSchema).length(106),
  })
  .strict();

export type PolicyResearchSummary = z.infer<typeof PolicyResearchSummarySchema>;

export function validatePolicyResearchSummary(
  input: unknown,
): PolicyResearchSummary {
  const parsed = PolicyResearchSummarySchema.safeParse(input);
  if (!parsed.success) {
    const details = parsed.error.issues.map(
      (issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`,
    );
    throw new Error(
      `Policy research summary validation failed:\n${details.join('\n')}`,
    );
  }
  const candidateIds = new Set(
    parsed.data.audits.map((audit) => audit.candidateId),
  );
  if (candidateIds.size !== parsed.data.audits.length) {
    throw new Error('Policy research summary contains duplicate candidate IDs');
  }
  return parsed.data;
}
