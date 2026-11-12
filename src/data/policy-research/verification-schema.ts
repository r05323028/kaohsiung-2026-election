import { z } from 'zod';

export const VerificationDecisionSchema = z.object({
  researchId: z.string().min(4).optional(),
  policyId: z.string().min(1).optional(),
  decision: z.enum(['verified', 'rejected', 'unresolved']),
  checks: z.object({
    attributionResolved: z.boolean(),
    excerptPresentInSource: z.boolean(),
    figuresPreserved: z.boolean(),
    dateConsistent: z.boolean(),
  }),
  note: z.string().min(1),
});

export const VerificationBatchSchema = z.object({
  batchId: z.string().min(1),
  verifierRole: z.literal('independent-verifier'),
  decisions: z.array(VerificationDecisionSchema),
});

export type VerificationBatch = z.infer<typeof VerificationBatchSchema>;

export function validateVerificationBatch(input: unknown): VerificationBatch {
  const parsed = VerificationBatchSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(
      'Verification batch validation failed:\n' +
        parsed.error.issues
          .map((issue) => (issue.path.join('.') || '<root>') + ': ' + issue.message)
          .join('\n'),
    );
  }
  return parsed.data;
}
