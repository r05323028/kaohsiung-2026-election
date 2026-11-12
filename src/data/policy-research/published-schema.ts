import { z } from 'zod';
import { PolicyCategorySchema, PolicyRecordTypeSchema } from './schema';

const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const PublishedPolicySourceSchema = z.object({
  url: z.url(),
  publisher: z.string().min(1),
  title: z.string().min(1),
  publishedAt: IsoDateSchema.nullable(),
  excerpt: z.string().min(1),
});
export type PublishedPolicySource = z.infer<typeof PublishedPolicySourceSchema>;

export const PublishedPolicySchema = z.object({
  policyId: z.string().min(1),
  candidateId: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  details: z.string().nullable(),
  originalStatement: z.string().min(1),
  category: PolicyCategorySchema,
  type: PolicyRecordTypeSchema,
  announcedAt: IsoDateSchema.nullable(),
  scope: z.string().nullable(),
  implementationDetails: z.array(z.string()),
  sources: z.array(PublishedPolicySourceSchema).min(1),
});
export type PublishedPolicy = z.infer<typeof PublishedPolicySchema>;

export const PublishedPolicyDatasetSchema = z.object({
  datasetId: z.literal('kaohsiung-2026-candidate-policies'),
  snapshotDate: IsoDateSchema,
  electionYear: z.literal(2026),
  candidateCount: z.number().int().positive(),
  policyCount: z.number().int().nonnegative(),
  policies: z.array(PublishedPolicySchema),
});
export type PublishedPolicyDataset = z.infer<
  typeof PublishedPolicyDatasetSchema
>;

export function validatePublishedPolicyDataset(
  input: unknown,
): PublishedPolicyDataset {
  return PublishedPolicyDatasetSchema.parse(input);
}
