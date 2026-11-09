import { z } from 'zod';

export const POLICY_CATEGORIES = [
  'transportation-and-mobility',
  'housing-and-urban-development',
  'economic-development-and-industry',
  'education',
  'childcare-and-family-support',
  'healthcare',
  'social-welfare-and-long-term-care',
  'environment-and-sustainability',
  'public-safety-and-disaster-preparedness',
  'youth-and-employment',
  'agriculture-and-fisheries',
  'culture-tourism-and-sports',
  'digital-governance-and-technology',
  'indigenous-affairs',
  'government-transparency-and-administration',
  'other',
] as const;

export const PolicyCategorySchema = z.enum(POLICY_CATEGORIES);
export type PolicyCategory = z.infer<typeof PolicyCategorySchema>;

export const PolicyContextSchema = z.enum([
  '2026-election-commitment',
  'current-position',
  'historical-position',
  'public-record-achievement',
  'context-unknown',
]);
export type PolicyContext = z.infer<typeof PolicyContextSchema>;

export const SourceTierSchema = z.enum([
  'tier-1-primary',
  'tier-2-authoritative',
  'tier-3-reporting',
  'tier-4-discovery',
]);
export type SourceTier = z.infer<typeof SourceTierSchema>;

export const SourceRetrievalStatusSchema = z.enum([
  'retrieved',
  'blocked',
  'not-found',
  'not-attempted',
  'failed',
]);
export type SourceRetrievalStatus = z.infer<typeof SourceRetrievalStatusSchema>;

export const IdentityStatusSchema = z.enum([
  'resolved',
  'pending-review',
  'unresolved',
  'not-applicable',
]);
export type IdentityStatus = z.infer<typeof IdentityStatusSchema>;

export const PolicyReviewStatusSchema = z.enum([
  'machine-validated',
  'pending-human-review',
  'human-reviewed',
  'editorially-approved',
  'rejected',
]);
export type PolicyReviewStatus = z.infer<typeof PolicyReviewStatusSchema>;

export const PolicyPublicationStatusSchema = z.enum([
  'withheld-pending-review',
  'approved-source-backed',
  'rejected',
  'blocked',
]);
export type PolicyPublicationStatus = z.infer<
  typeof PolicyPublicationStatusSchema
>;

const DateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const TimestampSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/);
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const PolicySourceSnapshotSchema = z.object({
  sourceId: z.string().min(1),
  url: z.url(),
  publisher: z.string().min(1),
  title: z.string().min(1),
  role: z.enum([
    'candidate-operated-campaign-site',
    'party-candidate-page',
    'institutional-member-profile',
    'roster-context',
    'discovery-only',
  ]),
  tier: SourceTierSchema,
  retrievalStatus: SourceRetrievalStatusSchema,
  httpStatus: z.number().int().min(100).max(599).nullable(),
  contentType: z.string().min(1).nullable(),
  rawPath: z.string().min(1).nullable(),
  byteLength: z.number().int().nonnegative().nullable(),
  sha256: Sha256Schema.nullable(),
  retrievedAt: TimestampSchema.nullable(),
  candidateIds: z.array(z.string().min(1)),
  identityStatus: IdentityStatusSchema,
  identityBasis: z.array(z.string().min(1)),
  note: z.string().min(1),
});

export type PolicySourceSnapshot = z.infer<typeof PolicySourceSnapshotSchema>;

export const PolicySourceAttemptSchema = z.object({
  attemptId: z.string().min(1),
  candidateId: z.string().min(1),
  personId: z.string().min(1),
  sourceId: z.string().nullable(),
  sourceRole: z.string().min(1),
  tier: SourceTierSchema,
  url: z.url().nullable(),
  attemptedAt: TimestampSchema,
  retrievalStatus: SourceRetrievalStatusSchema,
  identityStatus: IdentityStatusSchema,
  isNegativeEvidence: z.literal(false),
  resultNote: z.string().min(1),
});

export type PolicySourceAttempt = z.infer<typeof PolicySourceAttemptSchema>;

export const PolicyEvidenceSchema = z.object({
  evidenceId: z.string().min(1),
  policyId: z.string().min(1),
  sourceId: z.string().min(1),
  evidenceType: z.enum([
    'candidate-authored-policy',
    'party-candidate-policy',
    'institutional-service-policy',
    'policy-statement',
  ]),
  locator: z.string().min(1),
  quotedText: z.string().min(1),
  supports: z.literal('supports'),
  identityStatus: z.literal('resolved'),
  attributionStatus: z.literal('attributed'),
});

export type PolicyEvidence = z.infer<typeof PolicyEvidenceSchema>;

export const PolicyRecordSchema = z.object({
  policyId: z.string().min(1),
  candidateId: z.string().min(1),
  personId: z.string().min(1),
  title: z.string().min(1),
  neutralSummary: z.string().min(1),
  originalStatement: z.string().min(1),
  categories: z.array(PolicyCategorySchema).min(1),
  geographicScope: z.enum(['citywide', 'district', 'community', 'unknown']),
  geographicLabel: z.string().min(1),
  statementDate: DateOnlySchema.nullable(),
  policyContext: PolicyContextSchema,
  electionYear: z.literal(2026).nullable(),
  sourceId: z.string().min(1),
  evidenceId: z.string().min(1),
  evidenceType: z.enum([
    'candidate-authored-policy',
    'party-candidate-policy',
    'institutional-service-policy',
    'policy-statement',
  ]),
  verificationStatus: z.literal('machine-validated'),
  reviewStatus: PolicyReviewStatusSchema,
  publicationStatus: PolicyPublicationStatusSchema,
  claimIds: z.array(z.string().min(1)).min(1),
  evidenceIds: z.array(z.string().min(1)).min(1),
  duplicateOf: z.string().nullable(),
  conflictIds: z.array(z.string().min(1)),
});

export type PolicyRecord = z.infer<typeof PolicyRecordSchema>;

export const CandidatePolicyOutcomeSchema = z.enum([
  'verified-records',
  'current-or-historical-only',
  'no-verifiable-policy-found',
  'sources-unavailable',
  'evidence-requires-review',
  'candidate-identity-unresolved',
]);
export type CandidatePolicyOutcome = z.infer<
  typeof CandidatePolicyOutcomeSchema
>;

export const CandidatePolicyAuditSchema = z.object({
  candidateId: z.string().min(1),
  personId: z.string().min(1),
  displayName: z.string().min(1),
  districtId: z.string().min(1),
  districtLabel: z.string().min(1),
  electionType: z.enum(['mayoral', 'city-council', 'indigenous-council']),
  sourceAttemptIds: z.array(z.string().min(1)),
  policyIds: z.array(z.string().min(1)),
  evidenceIds: z.array(z.string().min(1)),
  outcome: CandidatePolicyOutcomeSchema,
  researchStatus: z.enum(['completed', 'blocked', 'identity-unresolved']),
  note: z.string().min(1),
});

export type CandidatePolicyAudit = z.infer<typeof CandidatePolicyAuditSchema>;

export const PolicyResearchConflictSchema = z.object({
  conflictId: z.string().min(1),
  policyIds: z.array(z.string().min(1)).min(2),
  description: z.string().min(1),
  status: z.enum(['open', 'resolved']),
  resolution: z.string().nullable(),
});

export const PolicyResearchReviewSchema = z.object({
  status: z.literal('pending-human-review'),
  reviewerId: z.null(),
  reviewedAt: z.null(),
  approvedPolicyCount: z.literal(0),
  publishedPolicyCount: z.literal(0),
});

export const PolicyResearchDatasetSchema = z.object({
  datasetId: z.literal('kaohsiung-2026-policy-research'),
  snapshotDate: DateOnlySchema,
  researchCutoff: DateOnlySchema,
  rosterSnapshotDate: DateOnlySchema,
  candidateCount: z.literal(106),
  categories: z.array(PolicyCategorySchema).length(POLICY_CATEGORIES.length),
  sourceSnapshots: z.array(PolicySourceSnapshotSchema),
  sourceAttempts: z.array(PolicySourceAttemptSchema),
  policies: z.array(PolicyRecordSchema),
  evidence: z.array(PolicyEvidenceSchema),
  audits: z.array(CandidatePolicyAuditSchema).length(106),
  conflicts: z.array(PolicyResearchConflictSchema),
  review: PolicyResearchReviewSchema,
});

export type PolicyResearchDataset = z.infer<typeof PolicyResearchDatasetSchema>;

export function validatePolicyResearchDataset(
  input: unknown,
): PolicyResearchDataset {
  const parsed = PolicyResearchDatasetSchema.safeParse(input);
  if (!parsed.success) {
    const details = parsed.error.issues.map(
      (issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`,
    );
    throw new Error(
      `Policy research dataset validation failed:\n${details.join('\n')}`,
    );
  }

  const dataset = parsed.data;
  const unique = (label: string, values: string[]) => {
    const duplicate = values.find(
      (value, index) => values.indexOf(value) !== index,
    );
    if (duplicate) throw new Error(`Duplicate ${label}: ${duplicate}`);
  };
  unique(
    'source IDs',
    dataset.sourceSnapshots.map((source) => source.sourceId),
  );
  unique(
    'attempt IDs',
    dataset.sourceAttempts.map((attempt) => attempt.attemptId),
  );
  unique(
    'policy IDs',
    dataset.policies.map((policy) => policy.policyId),
  );
  unique(
    'evidence IDs',
    dataset.evidence.map((item) => item.evidenceId),
  );
  unique(
    'candidate audit IDs',
    dataset.audits.map((audit) => audit.candidateId),
  );

  const sourceIds = new Set(
    dataset.sourceSnapshots.map((source) => source.sourceId),
  );
  const policyIds = new Set(dataset.policies.map((policy) => policy.policyId));
  const evidenceIds = new Set(
    dataset.evidence.map((evidence) => evidence.evidenceId),
  );
  const attemptIds = new Set(
    dataset.sourceAttempts.map((attempt) => attempt.attemptId),
  );

  for (const attempt of dataset.sourceAttempts) {
    if (attempt.sourceId && !sourceIds.has(attempt.sourceId))
      throw new Error(
        `Source attempt ${attempt.attemptId} references missing source ${attempt.sourceId}.`,
      );
  }
  for (const evidence of dataset.evidence) {
    if (!policyIds.has(evidence.policyId))
      throw new Error(
        `Evidence ${evidence.evidenceId} references missing policy ${evidence.policyId}.`,
      );
    if (!sourceIds.has(evidence.sourceId))
      throw new Error(
        `Evidence ${evidence.evidenceId} references missing source ${evidence.sourceId}.`,
      );
  }
  for (const policy of dataset.policies) {
    if (!sourceIds.has(policy.sourceId))
      throw new Error(
        `Policy ${policy.policyId} references missing source ${policy.sourceId}.`,
      );
    if (!evidenceIds.has(policy.evidenceId))
      throw new Error(
        `Policy ${policy.policyId} references missing evidence ${policy.evidenceId}.`,
      );
    if (
      policy.reviewStatus !== 'pending-human-review' ||
      policy.publicationStatus !== 'withheld-pending-review'
    )
      throw new Error(
        `Policy ${policy.policyId} crosses the pending review boundary.`,
      );
    if (policy.duplicateOf && !policyIds.has(policy.duplicateOf))
      throw new Error(
        `Policy ${policy.policyId} references missing duplicate ${policy.duplicateOf}.`,
      );
  }
  for (const audit of dataset.audits) {
    if (audit.sourceAttemptIds.some((id) => !attemptIds.has(id)))
      throw new Error(
        `Audit ${audit.candidateId} references a missing source attempt.`,
      );
    if (audit.policyIds.some((id) => !policyIds.has(id)))
      throw new Error(
        `Audit ${audit.candidateId} references a missing policy.`,
      );
    if (audit.evidenceIds.some((id) => !evidenceIds.has(id)))
      throw new Error(
        `Audit ${audit.candidateId} references missing evidence.`,
      );
    const expectedPolicyIds = dataset.policies
      .filter((policy) => policy.candidateId === audit.candidateId)
      .map((policy) => policy.policyId);
    if (
      JSON.stringify([...expectedPolicyIds].sort()) !==
      JSON.stringify([...audit.policyIds].sort())
    )
      throw new Error(
        `Audit ${audit.candidateId} policy inventory is incomplete.`,
      );
  }
  return dataset;
}
