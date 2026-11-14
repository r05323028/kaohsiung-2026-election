import { z } from 'zod';

const DateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const IsoTimestampSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/);
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

/**
 * The political actions this record set is allowed to describe.
 *
 * The list is closed on purpose: it is the editorial contract that keeps
 * "attended an event" from being rendered next to "proposed an ordinance".
 */
export const PoliticalActionSchema = z.enum([
  'serve-office',
  'contest-election',
  'propose',
  'co-sponsor',
  'interpellate',
  'deliberate',
  'approve',
  'implement',
  'public-affairs-participation',
]);

export const PoliticalActivityCategorySchema = z.enum([
  'public-office-term',
  'election-contest',
  'council-proposal',
  'council-interpellation',
  'ordinance-review',
  'budget-review',
  'municipal-governance',
  'public-affairs',
]);

export const DatePrecisionSchema = z.enum(['day', 'month', 'year', 'term']);

/**
 * Outcome vocabulary. A council-wide decision may never be recorded with
 * 'documented-outcome' unless the source names the candidate as the actor.
 */
export const OutcomeStatusSchema = z.enum([
  'documented-outcome',
  'institutional-response',
  'pending',
  'not-documented',
  'not-applicable',
]);

export const ActivityAttributionSchema = z.enum([
  'institutional-record',
  'candidate-statement',
  'independently-corroborated',
]);

export const SourceTierSchema = z.enum([
  'tier-1-primary',
  'tier-2-authoritative',
  'tier-3-reporting',
]);

export const PoliticalCareerSourceSchema = z.object({
  sourceId: z.string().min(1),
  url: z.url(),
  publisher: z.string().min(1),
  title: z.string().min(1),
  tier: SourceTierSchema,
  retrievedAt: IsoTimestampSchema,
  rawPath: z.string().min(1).nullable(),
  sha256: Sha256Schema.nullable(),
  note: z.string().min(1),
});

export const OfficeTermSchema = z.object({
  id: z.string().min(1),
  candidateId: z.string().min(1),
  personId: z.string().min(1),
  officeTitle: z.string().min(1),
  organization: z.string().min(1),
  termLabel: z.string().min(1),
  termNumbers: z.array(z.number().int().positive()),
  startDate: DateOnlySchema.nullable(),
  endDate: DateOnlySchema.nullable(),
  status: z.enum(['current', 'former']),
  sourceIds: z.array(z.string().min(1)).min(1),
  note: z.string().min(1),
});

export const PoliticalActivitySchema = z.object({
  id: z.string().min(1),
  candidateId: z.string().min(1),
  personId: z.string().min(1),
  date: DateOnlySchema,
  datePrecision: DatePrecisionSchema,
  category: PoliticalActivityCategorySchema,
  actionType: PoliticalActionSchema,
  title: z.string().min(1),
  description: z.string().min(1),
  role: z.string().min(1),
  venue: z.string().min(1),
  sessionLabel: z.string().min(1).nullable(),
  outcome: z.string().min(1).nullable(),
  outcomeStatus: OutcomeStatusSchema,
  sourceId: z.string().min(1),
  evidenceExcerpt: z.string().min(1),
  attribution: ActivityAttributionSchema,
  identityBasis: z.string().min(1),
});

export const CareerCoverageSchema = z.object({
  candidateId: z.string().min(1),
  displayName: z.string().min(1),
  districtId: z.string().min(1),
  electionType: z.enum(['mayoral', 'city-council', 'indigenous-council']),
  status: z.enum([
    'records-found',
    'no-verifiable-record-found',
    'source-unavailable',
  ]),
  officeTermCount: z.number().int().nonnegative(),
  activityCount: z.number().int().nonnegative(),
  searchedSourceIds: z.array(z.string().min(1)),
  note: z.string().min(1),
});

export const PoliticalCareerReviewSchema = z.object({
  status: z.enum(['approved', 'pending-review']),
  reviewerId: z.string().min(1).nullable(),
  reviewedAt: DateOnlySchema.nullable(),
  approvedAt: DateOnlySchema.nullable(),
  scopeNote: z.string().min(1),
  limitations: z.array(z.string().min(1)).min(1),
});

export const PoliticalCareerDatasetSchema = z.object({
  datasetId: z.literal('kaohsiung-2026-political-career'),
  snapshotDate: DateOnlySchema,
  researchCutoff: DateOnlySchema,
  rosterSnapshotDate: DateOnlySchema,
  candidateCount: z.literal(106),
  sources: z.array(PoliticalCareerSourceSchema),
  officeTerms: z.array(OfficeTermSchema),
  activities: z.array(PoliticalActivitySchema),
  coverage: z.array(CareerCoverageSchema).min(1),
  review: PoliticalCareerReviewSchema,
});

export type PoliticalCareerDataset = z.infer<typeof PoliticalCareerDatasetSchema>;
export type PoliticalCareerSource = z.infer<typeof PoliticalCareerSourceSchema>;
export type OfficeTerm = z.infer<typeof OfficeTermSchema>;
export type PoliticalActivity = z.infer<typeof PoliticalActivitySchema>;
export type CareerCoverage = z.infer<typeof CareerCoverageSchema>;

export function validatePoliticalCareerDataset(
  value: unknown,
): PoliticalCareerDataset {
  return PoliticalCareerDatasetSchema.parse(value);
}
