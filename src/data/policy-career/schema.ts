import { z } from 'zod';
import {
  OutcomeStatusSchema,
  PoliticalActionSchema,
} from '../political-career/schema';

const DateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * Where a published policy record is allowed to be rendered.
 *
 * - policy-commitments: a future promise or stated policy objective; Policy tab.
 * - political-career: a historical action only; migrated to the Career tab.
 * - split-record: one source record that contains a historical action *and* a
 *   future commitment; both facets are rendered, each in its own section.
 * - review-required: not publishable until an editor resolves it.
 */
export const PolicyOwnershipSchema = z.enum([
  'policy-commitments',
  'political-career',
  'split-record',
  'review-required',
]);

export const TemporalBasisSchema = z.enum([
  'future-commitment',
  'historical-action',
  'mixed',
  'unclear',
]);

/** Categories a policy-derived historical record may use. */
export const PolicyDerivedCategorySchema = z.enum([
  'council-proposal',
  'council-interpellation',
  'ordinance-review',
  'budget-review',
  'municipal-governance',
  'public-affairs',
]);

export const DatePrecisionSchema = z.enum(['day', 'month', 'year', 'undated']);

export const CommitmentFacetSchema = z.object({
  title: z.string().min(2),
  summary: z.string().min(4),
  /** Must be a verbatim fragment of the policy record or of a retained source. */
  evidenceExcerpt: z.string().min(4),
});

export const HistoricalFacetSchema = z.object({
  title: z.string().min(2),
  description: z.string().min(10),
  category: PolicyDerivedCategorySchema,
  actionType: PoliticalActionSchema,
  role: z.string().min(2),
  date: DateOnlySchema.nullable(),
  datePrecision: DatePrecisionSchema,
  dateBasis: z.string().min(4),
  outcome: z.string().min(2).nullable(),
  outcomeStatus: OutcomeStatusSchema,
  /** Must be a verbatim fragment of the policy record or of a retained source. */
  evidenceExcerpt: z.string().min(4),
  sourceUrls: z.array(z.url()).min(1),
});

export const PolicyClassificationSchema = z
  .object({
    policyId: z.string().min(1),
    candidateId: z.string().min(1),
    ownership: PolicyOwnershipSchema,
    temporalBasis: TemporalBasisSchema,
    /** How the temporal reading was reached: mostly automated, never silent. */
    basis: z.enum(['policy-type', 'tense-marker', 'editorial-review']),
    note: z.string().min(4),
    status: z.enum(['approved', 'pending-review']),
    commitment: CommitmentFacetSchema.nullable(),
    historical: HistoricalFacetSchema.nullable(),
    /** Existing career activities that already document this action. */
    duplicateOfActivityIds: z.array(z.string().min(1)),
    relatedActivityIds: z.array(z.string().min(1)),
  })
  .superRefine((value, ctx) => {
    // A policy-commitments record may leave the commitment facet empty: the
    // published policy record is then rendered unchanged. A split record must
    // carry the future facet explicitly, because part of its text moves away.
    if (value.ownership === 'political-career' && !value.historical) {
      ctx.addIssue({
        code: 'custom',
        message: 'political-career records need a historical facet',
        path: ['historical'],
      });
    }
    if (value.ownership === 'split-record' && !value.commitment) {
      ctx.addIssue({
        code: 'custom',
        message: 'split records need a commitment facet',
        path: ['commitment'],
      });
    }
    if (
      value.ownership === 'split-record' &&
      !value.historical &&
      value.duplicateOfActivityIds.length === 0
    ) {
      ctx.addIssue({
        code: 'custom',
        message:
          'split records need a historical facet or an existing activity that documents the action',
        path: ['historical'],
      });
    }
    if (value.ownership === 'review-required' && value.status === 'approved') {
      ctx.addIssue({
        code: 'custom',
        message: 'review-required records cannot be approved',
        path: ['status'],
      });
    }
  });

export const PolicyActivityLinkSchema = z
  .object({
    policyId: z.string().min(1),
    activityId: z.string().min(1),
    candidateId: z.string().min(1),
    relation: z.enum(['same-event', 'related-topic']),
    /** How the link was established, kept so review can audit the aid. */
    origin: z.enum(['automated', 'curated']),
    similarity: z.number().min(0).max(1),
    sharedTerms: z.array(z.string().min(1)),
    note: z.string().min(4).nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.origin === 'automated') {
      if (value.sharedTerms.length === 0) {
        ctx.addIssue({
          code: 'custom',
          message: 'automated links must record their shared wording',
          path: ['sharedTerms'],
        });
      }
      if (value.similarity <= 0) {
        ctx.addIssue({
          code: 'custom',
          message: 'automated links must record a positive similarity',
          path: ['similarity'],
        });
      }
    }
    if (value.origin === 'curated' && !value.note) {
      ctx.addIssue({
        code: 'custom',
        message: 'curated links must explain their editorial basis',
        path: ['note'],
      });
    }
  });

export const PolicyCareerReviewSchema = z.object({
  status: z.literal('approved'),
  reviewerId: z.string().min(1),
  reviewedAt: DateOnlySchema,
  scopeNote: z.string().min(1),
  limitations: z.array(z.string().min(1)).min(1),
  counts: z.object({
    policies: z.number().int().nonnegative(),
    commitments: z.number().int().nonnegative(),
    careerRecords: z.number().int().nonnegative(),
    splitRecords: z.number().int().nonnegative(),
    movedOut: z.number().int().nonnegative(),
    links: z.number().int().nonnegative(),
  }),
});

export const PolicyCareerDatasetSchema = z.object({
  datasetId: z.literal('kaohsiung-2026-policy-career-separation'),
  snapshotDate: DateOnlySchema,
  policyDatasetId: z.literal('kaohsiung-2026-candidate-policies'),
  careerDatasetId: z.literal('kaohsiung-2026-political-career'),
  policyCount: z.literal(1005),
  classifications: z.array(PolicyClassificationSchema).min(1),
  links: z.array(PolicyActivityLinkSchema),
  review: PolicyCareerReviewSchema,
});

export type PolicyCareerDataset = z.infer<typeof PolicyCareerDatasetSchema>;
export type PolicyClassification = z.infer<typeof PolicyClassificationSchema>;
export type PolicyActivityLink = z.infer<typeof PolicyActivityLinkSchema>;
export type CommitmentFacet = z.infer<typeof CommitmentFacetSchema>;
export type HistoricalFacet = z.infer<typeof HistoricalFacetSchema>;

export function validatePolicyCareerDataset(
  value: unknown,
): PolicyCareerDataset {
  return PolicyCareerDatasetSchema.parse(value);
}
