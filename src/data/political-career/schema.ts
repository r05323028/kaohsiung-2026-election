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

/**
 * 'news-reporting' marks a record that rests on a single news report and has
 * not (yet) been matched by a second independent source. It is deliberately
 * distinct from 'independently-corroborated' so the UI can state which one it
 * is without overstating the evidence.
 */
export const ActivityAttributionSchema = z.enum([
  'institutional-record',
  'candidate-statement',
  'independently-corroborated',
  'news-reporting',
]);

export const SourceTierSchema = z.enum([
  'tier-1-primary',
  'tier-2-authoritative',
  'tier-3-reporting',
]);

/** The four kinds of public-sector service the career section may describe. */
export const PositionTypeSchema = z.enum([
  'elected-office',
  'government-employment',
  'legislative-office',
  'council-office',
]);

export const EmploymentTypeSchema = z.enum([
  'elected',
  'appointed',
  'civil-service',
  'contract',
  'unknown',
]);

export const ProjectRoleTypeSchema = z.enum([
  'initiated',
  'managed',
  'participated',
  'oversaw',
]);

export const ProjectStatusSchema = z.enum([
  'completed',
  'ongoing',
  'planned',
  'not-implemented',
  'unknown',
]);

export const ProposerRoleSchema = z.enum([
  'primary',
  'co-proposer',
  'co-sponsor',
]);

export const VoteTypeSchema = z.enum(['roll-call', 'voice', 'other']);

/**
 * 'not-recorded' means the candidate did not appear in a roll-call list;
 * 'unknown' means the proceeding produced no individual record at all (for
 * example a voice vote). Neither may ever be rendered as a vote against.
 */
export const IndividualVoteSchema = z.enum([
  'for',
  'against',
  'abstain',
  'absent',
  'not-recorded',
  'unknown',
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

/**
 * A public-sector position: an elected office, a government appointment or
 * civil-service post, or a legislative seat. Campaign staff, party posts and
 * private employment belong elsewhere in the profile, not here.
 */
export const OfficeTermSchema = z.object({
  id: z.string().min(1),
  candidateId: z.string().min(1),
  personId: z.string().min(1),
  positionType: PositionTypeSchema,
  employmentType: EmploymentTypeSchema.nullable(),
  officeTitle: z.string().min(1),
  organization: z.string().min(1),
  termLabel: z.string().min(1),
  termNumbers: z.array(z.number().int().positive()),
  startDate: DateOnlySchema.nullable(),
  startDatePrecision: DatePrecisionSchema.nullable(),
  endDate: DateOnlySchema.nullable(),
  endDatePrecision: DatePrecisionSchema.nullable(),
  status: z.enum(['current', 'former', 'unknown']),
  sourceIds: z.array(z.string().min(1)).min(1),
  evidenceExcerpt: z.string().min(1).nullable(),
  attribution: ActivityAttributionSchema.nullable(),
  note: z.string().min(1),
});

export const PoliticalActivitySchema = z.object({
  id: z.string().min(1),
  candidateId: z.string().min(1),
  personId: z.string().min(1),
  positionId: z.string().min(1).nullable(),
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

/**
 * A documented government project the candidate actually worked on while in
 * office. The role type is the guard against crediting an agency's whole
 * portfolio to whoever happened to hold a post there.
 */
export const GovernmentProjectSchema = z.object({
  id: z.string().min(1),
  candidateId: z.string().min(1),
  personId: z.string().min(1),
  positionId: z.string().min(1).nullable(),
  title: z.string().min(1),
  agency: z.string().min(1),
  roleLabel: z.string().min(1),
  roleType: ProjectRoleTypeSchema,
  positionTitle: z.string().min(1),
  positionOrganization: z.string().min(1),
  positionPeriod: z.string().min(1).nullable(),
  periodLabel: z.string().min(1).nullable(),
  startDate: DateOnlySchema.nullable(),
  startDatePrecision: DatePrecisionSchema.nullable(),
  endDate: DateOnlySchema.nullable(),
  endDatePrecision: DatePrecisionSchema.nullable(),
  status: ProjectStatusSchema,
  outcome: z.string().min(1).nullable(),
  sourceId: z.string().min(1),
  evidenceExcerpt: z.string().min(1),
  attribution: ActivityAttributionSchema,
  confidence: z.enum(['high', 'medium', 'low']).nullable(),
  identityBasis: z.string().min(1),
});

/**
 * A proposal actually filed through a legislature's formal procedure. The
 * record states the proposer role and the latest official status; it never
 * claims enactment unless the status says so.
 */
export const LegislativeProposalSchema = z.object({
  id: z.string().min(1),
  candidateId: z.string().min(1),
  personId: z.string().min(1),
  positionId: z.string().min(1).nullable(),
  institution: z.string().min(1),
  billId: z.string().min(1),
  billNumber: z.string().min(1).nullable(),
  title: z.string().min(1),
  category: z.string().min(1),
  proposerRole: ProposerRoleSchema,
  proposerText: z.string().min(1).nullable(),
  proposedAt: DateOnlySchema.nullable(),
  session: z.number().int().positive().nullable(),
  latestProgressDate: DateOnlySchema.nullable(),
  legislativeStatus: z.string().min(1),
  laws: z.array(z.string().min(1)),
  sourceId: z.string().min(1),
  officialUrl: z.url().nullable(),
  evidenceExcerpt: z.string().min(1),
  attribution: ActivityAttributionSchema,
  identityBasis: z.string().min(1),
});

/**
 * An individual recorded vote. Every value must come from the legislature's
 * own roll-call list for that division; party position is never a substitute.
 */
export const VotingRecordSchema = z.object({
  id: z.string().min(1),
  candidateId: z.string().min(1),
  personId: z.string().min(1),
  positionId: z.string().min(1).nullable(),
  institution: z.string().min(1),
  motionTitle: z.string().min(1),
  votedAt: DateOnlySchema,
  voteId: z.string().min(1),
  meetingName: z.string().min(1).nullable(),
  voteType: VoteTypeSchema,
  individualVote: IndividualVoteSchema,
  tally: z
    .object({
      attending: z.number().int().nonnegative().nullable(),
      for: z.number().int().nonnegative().nullable(),
      against: z.number().int().nonnegative().nullable(),
      abstain: z.number().int().nonnegative().nullable(),
    })
    .nullable(),
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
  governmentPositionCount: z.number().int().nonnegative(),
  legislativePositionCount: z.number().int().nonnegative(),
  councilPositionCount: z.number().int().nonnegative(),
  electedOfficeCount: z.number().int().nonnegative(),
  governmentProjectCount: z.number().int().nonnegative(),
  legislativeProposalCount: z.number().int().nonnegative(),
  votingRecordCount: z.number().int().nonnegative(),
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
  governmentProjects: z.array(GovernmentProjectSchema),
  legislativeProposals: z.array(LegislativeProposalSchema),
  votingRecords: z.array(VotingRecordSchema),
  coverage: z.array(CareerCoverageSchema).min(1),
  review: PoliticalCareerReviewSchema,
});

export type PoliticalCareerDataset = z.infer<
  typeof PoliticalCareerDatasetSchema
>;
export type PoliticalCareerSource = z.infer<typeof PoliticalCareerSourceSchema>;
export type OfficeTerm = z.infer<typeof OfficeTermSchema>;
export type PoliticalActivity = z.infer<typeof PoliticalActivitySchema>;
export type GovernmentProject = z.infer<typeof GovernmentProjectSchema>;
export type LegislativeProposal = z.infer<typeof LegislativeProposalSchema>;
export type VotingRecord = z.infer<typeof VotingRecordSchema>;
export type CareerCoverage = z.infer<typeof CareerCoverageSchema>;
export type IndividualVote = z.infer<typeof IndividualVoteSchema>;

export function validatePoliticalCareerDataset(
  value: unknown,
): PoliticalCareerDataset {
  return PoliticalCareerDatasetSchema.parse(value);
}
