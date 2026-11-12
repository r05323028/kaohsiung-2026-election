import { z } from 'zod';
import {
  PolicyPublicationStatusSchema,
  PolicyReviewStatusSchema,
} from '../policy-research/schema';

const DateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const IsoTimestampSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/);
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const EnrichmentRecordStatusSchema = z.object({
  verificationStatus: z.literal('machine-validated'),
  reviewStatus: z.literal('pending-human-review'),
  publicationStatus: z.literal('withheld-pending-review'),
});

const TierSchema = z.enum([
  'tier-1-primary',
  'tier-2-authoritative',
  'tier-3-secondary',
  'tier-3-reporting',
  'tier-4-discovery',
]);
const RetrievalSchema = z.enum([
  'retrieved',
  'blocked',
  'failed',
  'not-attempted',
]);
const IdentitySchema = z.enum([
  'resolved',
  'unresolved',
  'ambiguous',
  'conflicted',
  'not-applicable',
]);

export const EnrichmentSourceSnapshotSchema = z.object({
  sourceId: z.string().min(1),
  url: z.url(),
  publisher: z.string().min(1),
  title: z.string().min(1),
  role: z.string().min(1),
  tier: TierSchema,
  retrievalStatus: RetrievalSchema,
  httpStatus: z.number().int().nullable(),
  contentType: z.string().nullable(),
  rawPath: z.string().nullable(),
  byteLength: z.number().int().positive().nullable(),
  sha256: Sha256Schema.nullable(),
  retrievedAt: IsoTimestampSchema.nullable(),
  candidateIds: z.array(z.string().min(1)),
  identityStatus: IdentitySchema,
  identityBasis: z.array(z.string().min(1)),
  note: z.string().min(1),
});

export const EnrichmentSourceAttemptSchema = z.object({
  attemptId: z.string().min(1),
  candidateId: z.string().min(1),
  personId: z.string().min(1),
  sourceId: z.string().min(1).nullable(),
  sourceRole: z.string().min(1),
  tier: TierSchema,
  url: z.url().nullable(),
  attemptedAt: IsoTimestampSchema.nullable(),
  retrievalStatus: RetrievalSchema,
  identityStatus: IdentitySchema,
  isNegativeEvidence: z.literal(false),
  resultNote: z.string().min(1),
});

export const EnrichmentClaimSchema = z.object({
  claimId: z.string().min(1),
  candidateId: z.string().min(1),
  personId: z.string().min(1),
  claimType: z.enum(['position-held', 'career-event']),
  predicate: z.string().min(1),
  objectValue: z.string().min(1),
  originalStatement: z.string().min(1),
  assertedAt: DateOnlySchema,
  attribution: z.enum(['institutional-profile', 'candidate-self-description']),
  ...EnrichmentRecordStatusSchema.shape,
  evidenceIds: z.array(z.string().min(1)).min(1),
});

export const EnrichmentEvidenceSchema = z.object({
  evidenceId: z.string().min(1),
  claimId: z.string().min(1),
  candidateId: z.string().min(1),
  personId: z.string().min(1),
  sourceId: z.string().min(1),
  evidenceType: z.literal('institutional-profile'),
  supportType: z.enum(['supports', 'attributes-statement']),
  documentLocation: z.string().min(1),
  quotedText: z.string().min(1),
  retrievedAt: DateOnlySchema,
  identityBasis: z.array(z.string().min(1)).min(1),
});

export const EnrichmentPositionRecordSchema = z.object({
  id: z.string().min(1),
  candidateId: z.string().min(1),
  personId: z.string().min(1),
  title: z.string().min(1),
  organization: z.string().min(1),
  currentStatus: z.literal('current'),
  description: z.string().min(1),
  sourceId: z.string().min(1),
  claimIds: z.array(z.string().min(1)).min(1),
  evidenceIds: z.array(z.string().min(1)).min(1),
  ...EnrichmentRecordStatusSchema.shape,
});

export const EnrichmentCareerRecordSchema = z.object({
  id: z.string().min(1),
  candidateId: z.string().min(1),
  personId: z.string().min(1),
  category: z.enum([
    'education',
    'professional',
    'public-office',
    'organizational-role',
    'other',
  ]),
  title: z.string().min(1),
  originalStatement: z.string().min(1),
  neutralSummary: z.string().min(1),
  recordedDate: DateOnlySchema.nullable(),
  sourceId: z.string().min(1),
  claimIds: z.array(z.string().min(1)).min(1),
  evidenceIds: z.array(z.string().min(1)).min(1),
  ...EnrichmentRecordStatusSchema.shape,
});

export const EnrichmentPolicyReferenceSchema = z.object({
  policyId: z.string().min(1),
  candidateId: z.string().min(1),
  personId: z.string().min(1),
  sourceId: z.string().min(1),
  evidenceId: z.string().min(1),
  policyContext: z.enum([
    '2026-election-commitment',
    'current-position',
    'historical-position',
    'public-record-achievement',
    'context-unknown',
  ]),
  verificationStatus: z.literal('machine-validated'),
  reviewStatus: PolicyReviewStatusSchema,
  publicationStatus: PolicyPublicationStatusSchema,
});

export const EnrichmentCandidateAuditSchema = z.object({
  candidateId: z.string().min(1),
  personId: z.string().min(1),
  displayName: z.string().min(1),
  districtId: z.string().min(1),
  electionType: z.enum(['mayoral', 'city-council', 'indigenous-council']),
  sourceSnapshotIds: z.array(z.string().min(1)),
  sourceAttemptIds: z.array(z.string().min(1)),
  policyReferenceCount: z.number().int().nonnegative(),
  positionRecordIds: z.array(z.string().min(1)),
  careerRecordIds: z.array(z.string().min(1)),
  newsRecordCount: z.literal(0),
  proposalRecordCount: z.literal(0),
  individualVoteRecordCount: z.literal(0),
  executiveInitiativeRecordCount: z.literal(0),
  outcome: z.enum([
    'records-found',
    'policy-references-only',
    'sources-attempted-no-additional-records',
    'sources-unavailable',
    'identity-conflict',
    'no-verifiable-record-found',
  ]),
  researchStatus: z.literal('completed'),
  note: z.string().min(1),
  isNegativeEvidence: z.literal(false),
  ...EnrichmentRecordStatusSchema.shape,
});

export const EnrichmentUpstreamPolicyResearchSchema = z.object({
  datasetId: z.literal('kaohsiung-2026-policy-research'),
  datasetPath: z.string().min(1),
  sourceSnapshotCount: z.number().int().nonnegative(),
  sourceAttemptCount: z.number().int().nonnegative(),
  policyCount: z.number().int().nonnegative(),
  sourceSnapshots: z.array(EnrichmentSourceSnapshotSchema),
  sourceAttempts: z.array(EnrichmentSourceAttemptSchema),
});

export const PublicRecordsEnrichmentDatasetSchema = z.object({
  datasetId: z.literal('kaohsiung-2026-public-records-enrichment'),
  snapshotDate: DateOnlySchema,
  researchCutoff: DateOnlySchema,
  rosterSnapshotDate: DateOnlySchema,
  candidateCount: z.literal(106),
  upstreamPolicyResearch: EnrichmentUpstreamPolicyResearchSchema,
  sourceSnapshots: z.array(EnrichmentSourceSnapshotSchema),
  sourceAttempts: z.array(EnrichmentSourceAttemptSchema),
  claims: z.array(EnrichmentClaimSchema),
  evidence: z.array(EnrichmentEvidenceSchema),
  positions: z.array(EnrichmentPositionRecordSchema),
  careerRecords: z.array(EnrichmentCareerRecordSchema),
  policyReferences: z.array(EnrichmentPolicyReferenceSchema),
  audits: z.array(EnrichmentCandidateAuditSchema).length(106),
  coverageAssertions: z.object({
    individualVoteRecords: z.literal(0),
    executiveInitiativeRecords: z.literal(0),
    relationshipRecords: z.literal(0),
    newsRecordsAdded: z.literal(0),
    proposalsAdded: z.literal(0),
    publishedRecords: z.literal(0),
  }),
  review: z.object({
    status: z.literal('pending-human-review'),
    reviewerId: z.null(),
    reviewedAt: z.null(),
    approvedRecordCount: z.literal(0),
    publishedRecordCount: z.literal(0),
    note: z.string().min(1),
  }),
});

export type EnrichmentSourceSnapshot = z.infer<
  typeof EnrichmentSourceSnapshotSchema
>;
export type EnrichmentSourceAttempt = z.infer<
  typeof EnrichmentSourceAttemptSchema
>;
export type EnrichmentClaim = z.infer<typeof EnrichmentClaimSchema>;
export type EnrichmentEvidence = z.infer<typeof EnrichmentEvidenceSchema>;
export type EnrichmentPositionRecord = z.infer<
  typeof EnrichmentPositionRecordSchema
>;
export type EnrichmentCareerRecord = z.infer<
  typeof EnrichmentCareerRecordSchema
>;
export type EnrichmentPolicyReference = z.infer<
  typeof EnrichmentPolicyReferenceSchema
>;
export type EnrichmentCandidateAudit = z.infer<
  typeof EnrichmentCandidateAuditSchema
>;
export type PublicRecordsEnrichmentDataset = z.infer<
  typeof PublicRecordsEnrichmentDatasetSchema
>;

export function validatePublicRecordsEnrichmentDataset(
  input: unknown,
): PublicRecordsEnrichmentDataset {
  const parsed = PublicRecordsEnrichmentDatasetSchema.safeParse(input);
  if (!parsed.success) {
    const details = parsed.error.issues.map(
      (issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`,
    );
    throw new Error(
      `Public-record enrichment schema validation failed:\n${details.join('\n')}`,
    );
  }
  const dataset = parsed.data;
  const checkUnique = (label: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) throw new Error(`Duplicate ${label}: ${id}`);
      seen.add(id);
    }
  };
  checkUnique(
    'source snapshot ID',
    dataset.sourceSnapshots.map((item) => item.sourceId),
  );
  checkUnique(
    'source attempt ID',
    dataset.sourceAttempts.map((item) => item.attemptId),
  );
  checkUnique(
    'claim ID',
    dataset.claims.map((item) => item.claimId),
  );
  checkUnique(
    'evidence ID',
    dataset.evidence.map((item) => item.evidenceId),
  );
  checkUnique(
    'position ID',
    dataset.positions.map((item) => item.id),
  );
  checkUnique(
    'career record ID',
    dataset.careerRecords.map((item) => item.id),
  );
  checkUnique(
    'policy reference ID',
    dataset.policyReferences.map((item) => item.policyId),
  );
  checkUnique(
    'candidate audit ID',
    dataset.audits.map((item) => item.candidateId),
  );

  const sourceIds = new Set(
    dataset.sourceSnapshots.map((item) => item.sourceId),
  );
  const attemptIds = new Set(
    dataset.sourceAttempts.map((item) => item.attemptId),
  );
  const claimIds = new Set(dataset.claims.map((item) => item.claimId));
  const evidenceIds = new Set(dataset.evidence.map((item) => item.evidenceId));
  const auditByCandidate = new Map(
    dataset.audits.map((item) => [item.candidateId, item]),
  );
  const recordIds = new Set([
    ...dataset.positions.map((item) => item.id),
    ...dataset.careerRecords.map((item) => item.id),
  ]);

  for (const source of dataset.sourceSnapshots) {
    if (
      source.retrievalStatus === 'blocked' &&
      (source.rawPath !== null ||
        source.sha256 !== null ||
        source.byteLength !== null)
    )
      throw new Error(
        `Blocked source ${source.sourceId} must not have retained bytes`,
      );
    if (
      source.retrievalStatus === 'retrieved' &&
      (source.rawPath === null ||
        source.sha256 === null ||
        source.byteLength === null ||
        source.retrievedAt === null)
    )
      throw new Error(
        `Retrieved source ${source.sourceId} is missing retention metadata`,
      );
    if (
      source.identityStatus === 'resolved' &&
      source.candidateIds.length === 0
    )
      throw new Error(
        `Resolved source ${source.sourceId} has no candidate identity`,
      );
  }

  for (const attempt of dataset.sourceAttempts) {
    const audit = auditByCandidate.get(attempt.candidateId);
    if (!audit)
      throw new Error(
        `Attempt ${attempt.attemptId} references unknown candidate ${attempt.candidateId}`,
      );
    if (attempt.personId !== audit.personId)
      throw new Error(
        `Attempt ${attempt.attemptId} has inconsistent person ID`,
      );
    if (
      attempt.sourceId !== null &&
      !sourceIds.has(attempt.sourceId) &&
      !dataset.upstreamPolicyResearch.sourceSnapshots.some(
        (item) => item.sourceId === attempt.sourceId,
      )
    )
      throw new Error(
        `Attempt ${attempt.attemptId} references unknown source ${attempt.sourceId}`,
      );
  }

  for (const claim of dataset.claims) {
    const audit = auditByCandidate.get(claim.candidateId);
    if (!audit || claim.personId !== audit.personId)
      throw new Error(
        `Claim ${claim.claimId} has an inconsistent candidate/person reference`,
      );
    for (const evidenceId of claim.evidenceIds)
      if (!evidenceIds.has(evidenceId))
        throw new Error(
          `Claim ${claim.claimId} references missing evidence ${evidenceId}`,
        );
  }
  for (const evidence of dataset.evidence) {
    if (!sourceIds.has(evidence.sourceId))
      throw new Error(
        `Evidence ${evidence.evidenceId} references missing source ${evidence.sourceId}`,
      );
    if (!claimIds.has(evidence.claimId))
      throw new Error(
        `Evidence ${evidence.evidenceId} references missing claim ${evidence.claimId}`,
      );
  }

  const checkRecordRefs = (
    label: string,
    records: Array<{
      id: string;
      candidateId: string;
      claimIds: string[];
      evidenceIds: string[];
    }>,
  ) => {
    for (const record of records) {
      if (!auditByCandidate.has(record.candidateId))
        throw new Error(`${label} ${record.id} references unknown candidate`);
      for (const claimId of record.claimIds)
        if (!claimIds.has(claimId))
          throw new Error(
            `${label} ${record.id} references missing claim ${claimId}`,
          );
      for (const evidenceId of record.evidenceIds)
        if (!evidenceIds.has(evidenceId))
          throw new Error(
            `${label} ${record.id} references missing evidence ${evidenceId}`,
          );
    }
  };
  checkRecordRefs('Position', dataset.positions);
  checkRecordRefs('Career', dataset.careerRecords);

  const upstreamPolicySources = new Set(
    dataset.upstreamPolicyResearch.sourceSnapshots.map((item) => item.sourceId),
  );
  for (const reference of dataset.policyReferences) {
    const audit = auditByCandidate.get(reference.candidateId);
    if (!audit || reference.personId !== audit.personId)
      throw new Error(
        `Policy reference ${reference.policyId} has an inconsistent candidate/person reference`,
      );
    if (!upstreamPolicySources.has(reference.sourceId))
      throw new Error(
        `Policy reference ${reference.policyId} references an unknown upstream source`,
      );
  }

  for (const audit of dataset.audits) {
    for (const sourceId of audit.sourceSnapshotIds)
      if (
        !sourceIds.has(sourceId) &&
        !dataset.upstreamPolicyResearch.sourceSnapshots.some(
          (item) => item.sourceId === sourceId,
        )
      )
        throw new Error(
          `Audit ${audit.candidateId} references missing source ${sourceId}`,
        );
    for (const attemptId of audit.sourceAttemptIds)
      if (
        !attemptIds.has(attemptId) &&
        !dataset.upstreamPolicyResearch.sourceAttempts.some(
          (item) => item.attemptId === attemptId,
        )
      )
        throw new Error(
          `Audit ${audit.candidateId} references missing attempt ${attemptId}`,
        );
    for (const recordId of [
      ...audit.positionRecordIds,
      ...audit.careerRecordIds,
    ])
      if (!recordIds.has(recordId))
        throw new Error(
          `Audit ${audit.candidateId} references missing record ${recordId}`,
        );
    if (audit.isNegativeEvidence)
      throw new Error(`Audit ${audit.candidateId} is negative evidence`);
  }

  if (dataset.review.reviewerId !== null || dataset.review.reviewedAt !== null)
    throw new Error('Pending enrichment cannot contain reviewer metadata');
  if (
    dataset.review.approvedRecordCount !== 0 ||
    dataset.review.publishedRecordCount !== 0
  )
    throw new Error(
      'Pending enrichment cannot contain approved or published records',
    );
  return dataset;
}
