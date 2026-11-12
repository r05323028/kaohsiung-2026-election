import { z } from 'zod';
import { POLICY_CATEGORIES, PolicyContextSchema } from './schema';

export const ExtractedPolicySchema = z.object({
  researchId: z.string().min(4).max(64),
  candidateId: z.string().min(1),
  title: z.string().min(5).max(80),
  originalStatement: z.string().min(20),
  excerptSourcePath: z.string().min(1),
  category: z.enum(POLICY_CATEGORIES),
  policyContext: PolicyContextSchema,
  announcedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  geographicScope: z.enum(['citywide', 'district', 'community', 'unknown']),
  geographicLabel: z.string().min(1),
  summary: z.string().min(10),
  details: z.string().nullable(),
  implementationDetails: z.array(z.string().min(1)),
  sourceType: z.enum([
    'candidate-authored-policy',
    'party-candidate-policy',
    'policy-statement',
  ]),
  identitySignal: z.string().min(1),
  duplicateKey: z.string().nullable(),
});

export const ExtractionBatchSchema = z.object({
  batchId: z.string().min(1),
  researcherRole: z.literal('policy-researcher'),
  records: z.array(ExtractedPolicySchema),
  candidatesWithoutPolicy: z.array(
    z.object({
      candidateId: z.string().min(1),
      note: z.string().min(1),
    }),
  ),
  searchNotes: z.string().min(1),
});

export type ExtractedPolicy = z.infer<typeof ExtractedPolicySchema>;
export type ExtractionBatch = z.infer<typeof ExtractionBatchSchema>;

export function validateExtractionBatch(input: unknown): ExtractionBatch {
  const parsed = ExtractionBatchSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(
      'Extraction batch validation failed:\n' +
        parsed.error.issues
          .map((issue) => (issue.path.join('.') || '<root>') + ': ' + issue.message)
          .join('\n'),
    );
  }
  return parsed.data;
}
