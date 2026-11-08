import { z } from 'zod';
import type { OfficialCandidate, OfficialDataset } from '../official/schema';
import type {
  Claim,
  NewsRecord,
  PolicyRecord,
  PositionRecord,
  PublicActivityRecord,
  PublicRecordBundle,
  PublicRecordCategory,
  PublicRecordsDataset,
  RelationshipRecord,
  TimelineEventRecord,
} from './schema';

export const PUBLIC_RECORD_CATEGORIES = [
  'positions',
  'policies',
  'activities',
  'news',
  'relationships',
  'timeline',
] as const satisfies readonly PublicRecordCategory[];

export const CoverageCategorySchema = z.enum(PUBLIC_RECORD_CATEGORIES);
export const CoverageDiscoveryStatusSchema = z.enum([
  'not-attempted',
  'pending-discovery',
  'source-discovered',
  'source-retrieved',
  'claim-extracted',
  'blocked',
  'ambiguous',
  'failed',
]);
export const CoverageRetrievalStatusSchema = z.enum([
  'not-attempted',
  'retrieved',
  'blocked',
  'failed',
]);
export const CoverageIdentityStatusSchema = z.enum([
  'roster-verified',
  'resolved',
  'ambiguous',
  'unresolved',
]);
export const CoverageReviewStateSchema = z.enum([
  'not-ready',
  'machine-validated',
  'pending-human-review',
  'human-reviewed',
  'editorially-approved',
  'published',
]);
export const CoverageChecksumStatusSchema = z.enum([
  'unchanged',
  'changed',
  'not-checked',
  'missing-snapshot',
]);
const IsoTimestampSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
const DateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const CoverageAuditSchema = z.object({
  auditId: z.string().min(1),
  candidateId: z.string().min(1),
  personId: z.string().min(1),
  displayName: z.string().min(1),
  electionType: z.enum(['mayoral', 'city-council', 'indigenous-council']),
  districtId: z.string().min(1),
  districtName: z.string().min(1),
  category: CoverageCategorySchema,
  discoveryMethod: z.string().min(1),
  queryOrDiscoveryPlan: z.string().min(1),
  sourceConsultedIds: z.array(z.string().min(1)),
  sourceCandidateIds: z.array(z.string().min(1)),
  discoveryStatus: CoverageDiscoveryStatusSchema,
  retrievalStatus: CoverageRetrievalStatusSchema,
  identityStatus: CoverageIdentityStatusSchema,
  matchingConfidence: z.number().min(0).max(1).nullable(),
  identityEvidence: z.array(z.string().min(1)),
  discoveryResult: z.string().min(1),
  failureReason: z.string().nullable(),
  lastAttemptedAt: IsoTimestampSchema.nullable(),
  checksumStatus: CoverageChecksumStatusSchema,
  claimCount: z.number().int().nonnegative(),
  evidenceCount: z.number().int().nonnegative(),
  machineValidatedClaimCount: z.number().int().nonnegative(),
  humanReviewedClaimCount: z.number().int().nonnegative(),
  editoriallyApprovedClaimCount: z.number().int().nonnegative(),
  staticDisplayRecordCount: z.number().int().nonnegative(),
  publishedRecordCount: z.number().int().nonnegative(),
  conflictCount: z.number().int().nonnegative(),
  ambiguousMatchCount: z.number().int().nonnegative(),
  recordIds: z.array(z.string().min(1)),
  reviewState: CoverageReviewStateSchema,
  publicationState: z.enum([
    'not-eligible',
    'source-backed-static-display',
    'editorially-approved',
  ]),
  attemptCount: z.number().int().nonnegative(),
  previousAuditStatus: CoverageDiscoveryStatusSchema.nullable(),
});

export const CoverageSourceCheckSchema = z.object({
  sourceId: z.string().min(1),
  expectedSha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
  actualSha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
  status: CoverageChecksumStatusSchema,
  rawPath: z.string().nullable(),
  role: z.string().min(1),
  checkedAt: IsoTimestampSchema,
});

export const ClaimRevisionSchema = z.object({
  claimId: z.string().min(1),
  personId: z.string().min(1),
  revision: z.number().int().positive(),
  firstSeenSnapshotDate: DateOnlySchema,
  lastSeenSnapshotDate: DateOnlySchema,
  status: z.enum([
    'machine-validated',
    'pending-human-review',
    'human-reviewed',
    'editorially-approved',
    'published',
  ]),
  sourceIds: z.array(z.string().min(1)).min(1),
  previousClaimId: z.string().nullable(),
});

export const CoverageCheckpointSchema = z.object({
  checkpointId: z.string().min(1),
  datasetId: z.string().min(1),
  snapshotDate: DateOnlySchema,
  runId: z.string().min(1),
  command: z.enum([
    'discover',
    'ingest',
    'validate',
    'review-report',
    'coverage',
  ]),
  candidateIds: z.array(z.string().min(1)),
  districtIds: z.array(z.string().min(1)),
  category: CoverageCategorySchema.nullable(),
  completedAuditIds: z.array(z.string().min(1)),
  failedAuditIds: z.array(z.string().min(1)),
  retryLimit: z.number().int().min(0).max(5),
  concurrency: z.number().int().min(1).max(8),
  resumedFromRunId: z.string().nullable(),
  dryRun: z.boolean(),
  updatedAt: IsoTimestampSchema,
});

export const CoverageDatasetSchema = z.object({
  datasetId: z.literal('kaohsiung-2026-full-roster-public-record-coverage'),
  snapshotDate: DateOnlySchema,
  rosterSnapshotDate: DateOnlySchema,
  candidateCount: z.number().int().nonnegative(),
  categories: z
    .array(CoverageCategorySchema)
    .length(PUBLIC_RECORD_CATEGORIES.length),
  audits: z.array(CoverageAuditSchema),
  sourceChecks: z.array(CoverageSourceCheckSchema),
  claimRevisions: z.array(ClaimRevisionSchema),
  previousBaseline: z.enum(['available', 'no-baseline']),
  batch: z.object({
    runId: z.string().min(1),
    command: z.enum([
      'discover',
      'ingest',
      'validate',
      'review-report',
      'coverage',
    ]),
    candidateIds: z.array(z.string().min(1)),
    districtIds: z.array(z.string().min(1)),
    category: CoverageCategorySchema.nullable(),
    dryRun: z.boolean(),
    retryLimit: z.number().int().min(0).max(5),
    concurrency: z.number().int().min(1).max(8),
    resumedFromRunId: z.string().nullable(),
  }),
  review: z.object({
    status: z.literal('pending-human-review'),
    reviewerId: z.null(),
    reviewedAt: z.null(),
    note: z.string().min(1),
  }),
});

export const FullRosterReviewItemSchema = z.object({
  reviewItemId: z.string().min(1),
  candidateId: z.string().min(1),
  personId: z.string().min(1),
  displayName: z.string().min(1),
  category: CoverageCategorySchema,
  itemType: z.enum(['claim', 'coverage-gap']),
  proposedClaimId: z.string().nullable(),
  sourceIds: z.array(z.string().min(1)),
  identityStatus: CoverageIdentityStatusSchema,
  validationResult: z.enum(['machine-validated', 'not-ready']),
  suggestedDisposition: z.enum([
    'human-review-required',
    'discovery-required',
    'withhold-ambiguous-match',
  ]),
  reviewStatus: z.literal('pending-human-review'),
  reviewerId: z.null(),
  reviewedAt: z.null(),
  notes: z.string().min(1),
});

export const FullRosterReviewPacketSchema = z.object({
  datasetId: z.literal('kaohsiung-2026-full-roster-public-record-coverage'),
  snapshotDate: DateOnlySchema,
  status: z.literal('pending-human-review'),
  reviewerId: z.null(),
  reviewedAt: z.null(),
  items: z.array(FullRosterReviewItemSchema),
  notes: z.array(z.string().min(1)),
});

export type CoverageCategory = z.infer<typeof CoverageCategorySchema>;
export type CoverageAudit = z.infer<typeof CoverageAuditSchema>;
export type CoverageSourceCheck = z.infer<typeof CoverageSourceCheckSchema>;
export type ClaimRevision = z.infer<typeof ClaimRevisionSchema>;
export type CoverageCheckpoint = z.infer<typeof CoverageCheckpointSchema>;
export type CoverageDataset = z.infer<typeof CoverageDatasetSchema>;
export type FullRosterReviewItem = z.infer<typeof FullRosterReviewItemSchema>;
export type FullRosterReviewPacket = z.infer<
  typeof FullRosterReviewPacketSchema
>;
export type CoverageBatchOptions = {
  snapshotDate: string;
  runId: string;
  command: CoverageCheckpoint['command'];
  candidateIds?: ReadonlySet<string>;
  districtIds?: ReadonlySet<string>;
  category?: CoverageCategory;
  dryRun: boolean;
  retryLimit: number;
  concurrency: number;
  resumedFromRunId?: string | null;
};

type CoverageManifestSource = {
  id: string;
  rawPath?: string | null;
  sha256?: string | null;
  role?: string;
};

export type CoverageReport = {
  reportVersion: '1.0.0';
  reportType: 'full-roster-coverage';
  datasetId: CoverageDataset['datasetId'];
  snapshotDate: string;
  scope: 'complete-official-preliminary-roster';
  status: 'partial-discovery-and-pending-review';
  roster: {
    candidateCount: number;
    mayorCount: number;
    ordinaryCouncilCount: number;
    indigenousCouncilCount: number;
    districtCount: number;
  };
  metrics: {
    discovery: Record<string, unknown>;
    sourceRetrieval: Record<string, unknown>;
    claimExtraction: Record<string, unknown>;
    machineValidation: Record<string, unknown>;
    humanReview: Record<string, unknown>;
    editorialApproval: Record<string, unknown>;
    staticPublication: Record<string, unknown>;
  };
  categoryMetrics: Record<CoverageCategory, Record<string, unknown>>;
  candidates: Array<{
    candidateId: string;
    personId: string;
    displayName: string;
    electionType: OfficialCandidate['electionType'];
    districtId: string;
    categories: CoverageAudit[];
    identityStatus: CoverageAudit['identityStatus'];
    sourceRetrievalCount: number;
    claimCount: number;
    machineValidatedClaimCount: number;
    humanReviewedClaimCount: number;
    editoriallyApprovedClaimCount: number;
    staticDisplayRecordCount: number;
    publishedRecordCount: number;
    conflictCount: number;
    ambiguousMatchCount: number;
    lastAttemptedAt: string | null;
  }>;
  sourceChecks: CoverageSourceCheck[];
  inaccessibleSources: CoverageSourceCheck[];
  revision: {
    previousBaseline: CoverageDataset['previousBaseline'];
    changedAuditCount: number;
    claimRevisionCount: number;
    note: string;
  };
  integrityAssertions: {
    demoCandidatesIncluded: false;
    nameOnlyMatchesPublished: false;
    unsupportedClaimsGenerated: false;
    reviewerMetadataInvented: false;
    candidateRankingProduced: false;
    singleCompletenessScoreProduced: false;
  };
  notes: string[];
};

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function recordsForCategory(
  bundle: PublicRecordBundle | undefined,
  category: CoverageCategory,
): Array<
  | PositionRecord
  | PolicyRecord
  | PublicActivityRecord
  | NewsRecord
  | RelationshipRecord
  | TimelineEventRecord
> {
  if (!bundle) return [];
  switch (category) {
    case 'positions':
      return bundle.positions;
    case 'policies':
      return bundle.policies;
    case 'activities':
      return bundle.activities;
    case 'news':
      return bundle.news;
    case 'relationships':
      return bundle.relationships;
    case 'timeline':
      return bundle.timeline;
  }
}

function bundleFor(
  dataset: PublicRecordsDataset,
  personId: string,
): PublicRecordBundle | undefined {
  const claims = dataset.claims.filter((claim) => claim.subjectId === personId);
  const claimIds = new Set(claims.map((claim) => claim.claimId));
  const bundle: PublicRecordBundle = {
    personId,
    claims,
    evidence: dataset.evidence.filter((item) => claimIds.has(item.claimId)),
    positions: dataset.positions.filter((item) => item.personId === personId),
    policies: dataset.policies.filter((item) => item.personId === personId),
    activities: dataset.activities.filter((item) => item.personId === personId),
    news: dataset.news.filter((item) => item.personIds.includes(personId)),
    relationships: dataset.relationships.filter(
      (item) => item.personId === personId,
    ),
    timeline: dataset.timeline.filter((item) => item.personId === personId),
    identityResolutions: dataset.identityResolutions.filter(
      (item) => item.personId === personId,
    ),
    conflicts: dataset.conflicts.filter((item) =>
      item.claimIds.some((claimId) => claimIds.has(claimId)),
    ),
  };
  if (
    bundle.claims.length === 0 &&
    bundle.positions.length === 0 &&
    bundle.policies.length === 0 &&
    bundle.activities.length === 0 &&
    bundle.news.length === 0 &&
    bundle.relationships.length === 0 &&
    bundle.timeline.length === 0
  )
    return undefined;
  return bundle;
}

function sourceIdsForBundle(bundle: PublicRecordBundle): string[] {
  return unique([
    ...bundle.evidence.map((item) => item.sourceId),
    ...bundle.identityResolutions.map((item) => item.sourceId),
  ]);
}

function categoryClaimIds(
  bundle: PublicRecordBundle | undefined,
  category: CoverageCategory,
): string[] {
  return unique(
    recordsForCategory(bundle, category).flatMap((record) => record.claimIds),
  );
}

function categoryEvidenceIds(
  bundle: PublicRecordBundle | undefined,
  category: CoverageCategory,
): string[] {
  return unique(
    recordsForCategory(bundle, category).flatMap(
      (record) => record.evidenceIds,
    ),
  );
}

function categoryChecksumStatus(
  sourceIds: readonly string[],
  sourceChecks: readonly CoverageSourceCheck[],
): CoverageAudit['checksumStatus'] {
  if (sourceIds.length === 0) return 'not-checked';
  const statuses = sourceIds.map(
    (sourceId) =>
      sourceChecks.find((check) => check.sourceId === sourceId)?.status,
  );
  if (statuses.some((status) => status === 'changed')) return 'changed';
  if (statuses.some((status) => status === 'missing-snapshot'))
    return 'missing-snapshot';
  if (statuses.every((status) => status === 'unchanged')) return 'unchanged';
  return 'not-checked';
}

function sourcePlanForCategory(
  category: CoverageCategory,
  sources: readonly CoverageManifestSource[],
): string[] {
  const matching = sources.filter((source) => {
    const role = source.role ?? '';
    if (category === 'positions')
      return role.includes('member') || role.includes('qualification');
    if (category === 'activities' || category === 'news')
      return role.includes('public-record') || role.includes('questioning');
    if (category === 'policies')
      return (
        role.includes('event') ||
        role.includes('bulletin') ||
        role.includes('portal')
      );
    if (category === 'timeline')
      return (
        role.includes('election') ||
        role.includes('public-record') ||
        role.includes('qualification')
      );
    return role.includes('public-record') || role.includes('qualification');
  });
  return matching.length > 0
    ? matching.map((source) => source.id)
    : sources.map((source) => source.id);
}

function isSelected(
  candidate: OfficialCandidate,
  category: CoverageCategory,
  options: CoverageBatchOptions,
): boolean {
  if (options.candidateIds && !options.candidateIds.has(candidate.id))
    return false;
  if (options.districtIds && !options.districtIds.has(candidate.districtId))
    return false;
  if (options.category && options.category !== category) return false;
  return true;
}

export function coverageAuditKey(
  candidateId: string,
  category: CoverageCategory,
): string {
  return `${candidateId}::${category}`;
}

export function buildCoverageAudits(
  roster: readonly OfficialCandidate[],
  publicRecords: PublicRecordsDataset,
  manifestSources: readonly CoverageManifestSource[],
  sourceChecks: readonly CoverageSourceCheck[],
  options: CoverageBatchOptions,
  previousAudits: readonly CoverageAudit[] = [],
): CoverageAudit[] {
  const previousByKey = new Map(
    previousAudits.map((audit) => [
      coverageAuditKey(audit.candidateId, audit.category),
      audit,
    ]),
  );
  const audits: CoverageAudit[] = [];
  for (const candidate of roster) {
    const personId = `person-${candidate.slug}`;
    const bundle = bundleFor(publicRecords, personId);
    const districtName = candidate.districtId;
    for (const category of PUBLIC_RECORD_CATEGORIES) {
      const key = coverageAuditKey(candidate.id, category);
      const previous = previousByKey.get(key);
      if (!isSelected(candidate, category, options) && previous) {
        audits.push(previous);
        continue;
      }
      const records = recordsForCategory(bundle, category);
      const claimIds = categoryClaimIds(bundle, category);
      const evidenceIds = categoryEvidenceIds(bundle, category);
      const sourceIds = bundle ? sourceIdsForBundle(bundle) : [];
      const sourceCandidateIds = sourcePlanForCategory(
        category,
        manifestSources,
      );
      const hasRecords = records.length > 0;
      const reviewState: CoverageAudit['reviewState'] = hasRecords
        ? 'pending-human-review'
        : 'not-ready';
      audits.push({
        auditId: `audit-${candidate.id}-${category}`,
        candidateId: candidate.id,
        personId,
        displayName: candidate.displayName,
        electionType: candidate.electionType,
        districtId: candidate.districtId,
        districtName,
        category,
        discoveryMethod: 'checked-in-official-roster-and-snapshot-audit',
        queryOrDiscoveryPlan: `以${candidate.displayName}／${candidate.districtId}／${candidate.electionType}為範圍，依${category}分類查核已保留的官方來源；不執行即時網路搜尋。`,
        sourceConsultedIds: sourceIds,
        sourceCandidateIds,
        discoveryStatus: hasRecords ? 'source-retrieved' : 'not-attempted',
        retrievalStatus: hasRecords ? 'retrieved' : 'not-attempted',
        identityStatus: hasRecords ? 'resolved' : 'roster-verified',
        matchingConfidence: hasRecords ? 1 : null,
        identityEvidence: hasRecords
          ? ['official-roster-candidacy', 'source-specific-record-link']
          : ['official-roster-candidacy'],
        discoveryResult: hasRecords
          ? 'source-backed-records-linked'
          : 'not-run',
        failureReason: hasRecords
          ? null
          : '本次離線批次沒有此候選人／分類的已保留候選人專屬快照；此狀態不表示不存在相關資料。',
        lastAttemptedAt: hasRecords
          ? `${options.snapshotDate}T00:00:00Z`
          : null,
        checksumStatus: categoryChecksumStatus(sourceIds, sourceChecks),
        claimCount: claimIds.length,
        evidenceCount: evidenceIds.length,
        machineValidatedClaimCount: claimIds.length,
        humanReviewedClaimCount: 0,
        editoriallyApprovedClaimCount: 0,
        staticDisplayRecordCount: records.filter(
          (record) => record.publicationStatus === 'approved-source-backed',
        ).length,
        publishedRecordCount: records.filter(
          (record) => record.publicationStatus === 'approved-source-backed',
        ).length,
        conflictCount: bundle?.conflicts.length ?? 0,
        ambiguousMatchCount: hasRecords
          ? (bundle?.identityResolutions.filter(
              (item) => item.status === 'pending-review',
            ).length ?? 0)
          : 0,
        recordIds: records.map((record) => record.id),
        reviewState,
        publicationState: hasRecords
          ? 'source-backed-static-display'
          : 'not-eligible',
        attemptCount: hasRecords ? 1 : 0,
        previousAuditStatus: previous?.discoveryStatus ?? null,
      });
    }
  }
  return audits;
}

export function mergeCoverageAudits(
  previous: readonly CoverageAudit[],
  updates: readonly CoverageAudit[],
  selectedKeys: ReadonlySet<string>,
): CoverageAudit[] {
  const updatesByKey = new Map(
    updates.map((audit) => [
      coverageAuditKey(audit.candidateId, audit.category),
      audit,
    ]),
  );
  return previous.map((audit) => {
    const key = coverageAuditKey(audit.candidateId, audit.category);
    return selectedKeys.has(key) && updatesByKey.has(key)
      ? (updatesByKey.get(key) as CoverageAudit)
      : audit;
  });
}

export function buildClaimRevisions(
  dataset: PublicRecordsDataset,
): ClaimRevision[] {
  const evidenceByClaim = new Map<string, string[]>();
  for (const evidence of dataset.evidence) {
    const sourceIds = evidenceByClaim.get(evidence.claimId) ?? [];
    sourceIds.push(evidence.sourceId);
    evidenceByClaim.set(evidence.claimId, sourceIds);
  }
  return dataset.claims.map((claim) => ({
    claimId: claim.claimId,
    personId: claim.subjectId,
    revision: 1,
    firstSeenSnapshotDate: dataset.snapshotDate,
    lastSeenSnapshotDate: dataset.snapshotDate,
    status:
      claim.reviewStatus === 'approved'
        ? 'editorially-approved'
        : claim.reviewStatus === 'pending-review'
          ? 'pending-human-review'
          : 'machine-validated',
    sourceIds: unique(evidenceByClaim.get(claim.claimId) ?? []),
    previousClaimId: null,
  }));
}

export function buildCoverageDataset(
  roster: OfficialDataset,
  publicRecords: PublicRecordsDataset,
  manifestSources: readonly CoverageManifestSource[],
  sourceChecks: readonly CoverageSourceCheck[],
  options: CoverageBatchOptions,
  previous?: CoverageDataset,
): CoverageDataset {
  const approvedRoster = roster.candidates.filter(
    (candidate) => candidate.publicationStatus === 'approved',
  );
  const audits = buildCoverageAudits(
    approvedRoster,
    publicRecords,
    manifestSources,
    sourceChecks,
    options,
    previous?.audits,
  );
  return {
    datasetId: 'kaohsiung-2026-full-roster-public-record-coverage',
    snapshotDate: options.snapshotDate,
    rosterSnapshotDate: roster.snapshotDate,
    candidateCount: approvedRoster.length,
    categories: [...PUBLIC_RECORD_CATEGORIES],
    audits,
    sourceChecks: [...sourceChecks],
    claimRevisions: buildClaimRevisions(publicRecords),
    previousBaseline: previous ? 'available' : 'no-baseline',
    batch: {
      runId: options.runId,
      command: options.command,
      candidateIds: [...(options.candidateIds ?? [])],
      districtIds: [...(options.districtIds ?? [])],
      category: options.category ?? null,
      dryRun: options.dryRun,
      retryLimit: options.retryLimit,
      concurrency: options.concurrency,
      resumedFromRunId: options.resumedFromRunId ?? null,
    },
    review: {
      status: 'pending-human-review',
      reviewerId: null,
      reviewedAt: null,
      note: 'Coverage audits and source-backed records remain pending human review; no reviewer metadata is inferred.',
    },
  };
}

export function validateCoverageDataset(
  input: unknown,
  roster: OfficialDataset,
  manifestSourceIds: ReadonlySet<string>,
): CoverageDataset {
  const parsed = CoverageDatasetSchema.safeParse(input);
  if (!parsed.success) {
    const details = parsed.error.issues.map(
      (issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`,
    );
    throw new Error(
      `Full-roster coverage validation failed:\n${details.join('\n')}`,
    );
  }
  const dataset = parsed.data;
  const errors: string[] = [];
  const rosterCandidates = roster.candidates.filter(
    (candidate) => candidate.publicationStatus === 'approved',
  );
  const rosterById = new Map(
    rosterCandidates.map((candidate) => [candidate.id, candidate]),
  );
  if (dataset.candidateCount !== rosterCandidates.length)
    errors.push(
      `candidate count ${dataset.candidateCount} does not match roster ${rosterCandidates.length}`,
    );
  const expectedKeys = new Set(
    rosterCandidates.flatMap((candidate) =>
      PUBLIC_RECORD_CATEGORIES.map((category) =>
        coverageAuditKey(candidate.id, category),
      ),
    ),
  );
  const seenKeys = new Set<string>();
  for (const audit of dataset.audits) {
    const key = coverageAuditKey(audit.candidateId, audit.category);
    if (seenKeys.has(key)) errors.push(`duplicate coverage audit ${key}`);
    seenKeys.add(key);
    const candidate = rosterById.get(audit.candidateId);
    if (!candidate)
      errors.push(
        `coverage audit ${audit.auditId} references unknown candidate ${audit.candidateId}`,
      );
    else {
      const expectedPersonId = `person-${candidate.slug}`;
      if (audit.personId !== expectedPersonId)
        errors.push(
          `coverage audit ${audit.auditId} has unstable person ID ${audit.personId}`,
        );
      if (audit.districtId !== candidate.districtId)
        errors.push(
          `coverage audit ${audit.auditId} has wrong constituency ${audit.districtId}`,
        );
    }
    for (const sourceId of [
      ...audit.sourceConsultedIds,
      ...audit.sourceCandidateIds,
    ])
      if (!manifestSourceIds.has(sourceId))
        errors.push(
          `coverage audit ${audit.auditId} references missing source ${sourceId}`,
        );
    if (
      audit.discoveryStatus === 'not-attempted' &&
      audit.lastAttemptedAt !== null
    )
      errors.push(
        `not-attempted audit ${audit.auditId} has an attempt timestamp`,
      );
    if (audit.identityStatus === 'ambiguous' && audit.publishedRecordCount > 0)
      errors.push(`ambiguous audit ${audit.auditId} publishes records`);
    if (audit.reviewState === 'not-ready' && audit.publishedRecordCount > 0)
      errors.push(`not-ready audit ${audit.auditId} publishes records`);
    if (audit.editoriallyApprovedClaimCount > audit.humanReviewedClaimCount)
      errors.push(
        `audit ${audit.auditId} editorial approval exceeds human review`,
      );
    if (audit.publishedRecordCount < audit.editoriallyApprovedClaimCount)
      errors.push(
        `audit ${audit.auditId} publication count is below editorial approval count`,
      );
  }
  for (const key of expectedKeys)
    if (!seenKeys.has(key)) errors.push(`missing coverage audit ${key}`);
  const revisionIds = new Set<string>();
  for (const revision of dataset.claimRevisions) {
    if (revisionIds.has(revision.claimId))
      errors.push(`duplicate claim revision ${revision.claimId}`);
    revisionIds.add(revision.claimId);
    if (!manifestSourceIds.has(revision.sourceIds[0] ?? ''))
      errors.push(`claim revision ${revision.claimId} has no manifest source`);
  }
  if (dataset.review.reviewerId !== null || dataset.review.reviewedAt !== null)
    errors.push('pending coverage review cannot contain reviewer metadata');
  if (dataset.audits.length !== expectedKeys.size)
    errors.push(
      `coverage audit count ${dataset.audits.length} does not match expected ${expectedKeys.size}`,
    );
  if (errors.length > 0)
    throw new Error(
      `Full-roster coverage reference validation failed:\n${errors.join('\n')}`,
    );
  return dataset;
}

export function buildReviewPacket(
  coverage: CoverageDataset,
  publicRecords: PublicRecordsDataset,
): FullRosterReviewPacket {
  const items: FullRosterReviewItem[] = [];
  const claimByPerson = new Map<string, Claim[]>();
  for (const claim of publicRecords.claims) {
    const claims = claimByPerson.get(claim.subjectId) ?? [];
    claims.push(claim);
    claimByPerson.set(claim.subjectId, claims);
  }
  for (const audit of coverage.audits) {
    const bundle = bundleFor(publicRecords, audit.personId);
    const categoryClaimIdSet = new Set(
      categoryClaimIds(bundle, audit.category),
    );
    const claims = (claimByPerson.get(audit.personId) ?? []).filter((claim) =>
      categoryClaimIdSet.has(claim.claimId),
    );
    if (claims.length > 0) {
      for (const claim of claims) {
        const sourceIds = publicRecords.evidence
          .filter((evidence) => claim.evidenceIds.includes(evidence.evidenceId))
          .map((evidence) => evidence.sourceId);
        items.push({
          reviewItemId: `review-${audit.auditId}-${claim.claimId}`,
          candidateId: audit.candidateId,
          personId: audit.personId,
          displayName: audit.displayName,
          category: audit.category,
          itemType: 'claim',
          proposedClaimId: claim.claimId,
          sourceIds: unique(sourceIds),
          identityStatus: audit.identityStatus,
          validationResult: 'machine-validated',
          suggestedDisposition: 'human-review-required',
          reviewStatus: 'pending-human-review',
          reviewerId: null,
          reviewedAt: null,
          notes: '此項目有保留來源與證據鏈，仍須人工確認歸屬、脈絡與發布措辭。',
        });
      }
    } else {
      items.push({
        reviewItemId: `review-gap-${audit.auditId}`,
        candidateId: audit.candidateId,
        personId: audit.personId,
        displayName: audit.displayName,
        category: audit.category,
        itemType: 'coverage-gap',
        proposedClaimId: null,
        sourceIds: audit.sourceConsultedIds,
        identityStatus: audit.identityStatus,
        validationResult: 'not-ready',
        suggestedDisposition:
          audit.identityStatus === 'ambiguous'
            ? 'withhold-ambiguous-match'
            : 'discovery-required',
        reviewStatus: 'pending-human-review',
        reviewerId: null,
        reviewedAt: null,
        notes:
          audit.failureReason ??
          '目前沒有可供人工審查的候選人專屬證據；不得將空白解讀為不存在。',
      });
    }
  }
  return {
    datasetId: coverage.datasetId,
    snapshotDate: coverage.snapshotDate,
    status: 'pending-human-review',
    reviewerId: null,
    reviewedAt: null,
    items,
    notes: [
      'Coverage-gap items are discovery work, not negative findings.',
      'Claim items preserve source/evidence references but are not editorial approval.',
      'No reviewer identity or review date is populated by the generator.',
    ],
  };
}

export function validatePositionDateRanges(
  positions: readonly PositionRecord[],
): string[] {
  return positions
    .filter(
      (position) =>
        position.startDate &&
        position.endDate &&
        position.startDate > position.endDate,
    )
    .map((position) => `position ${position.id} has an inverted date range`);
}

export function deduplicateNewsRecords(records: readonly NewsRecord[]): {
  records: NewsRecord[];
  duplicates: Array<{ duplicateId: string; canonicalId: string; key: string }>;
} {
  const seen = new Map<string, NewsRecord>();
  const canonical: NewsRecord[] = [];
  const duplicates: Array<{
    duplicateId: string;
    canonicalId: string;
    key: string;
  }> = [];
  for (const record of records) {
    const key = [
      record.headline.trim().replace(/\s+/g, ' ').toLocaleLowerCase(),
      record.publisher.trim().replace(/\s+/g, ' ').toLocaleLowerCase(),
      record.publicationDate,
    ].join('|');
    const previous = seen.get(key);
    if (previous) {
      duplicates.push({
        duplicateId: record.id,
        canonicalId: previous.id,
        key,
      });
      continue;
    }
    seen.set(key, record);
    canonical.push(record);
  }
  return { records: canonical, duplicates };
}

export function buildTimelineEvents(
  bundle: PublicRecordBundle,
): TimelineEventRecord[] {
  const events: TimelineEventRecord[] = [
    ...bundle.positions.map((position) => ({
      id: `derived-timeline-${position.id}`,
      personId: position.personId,
      eventDate: position.startDate,
      title: `${position.organization}・${position.title}`,
      category: 'public-office' as const,
      description: `來源記錄此職務；完整任期日期可能未在來源頁面標示。`,
      verificationStatus: position.verificationStatus,
      reviewStatus: position.reviewStatus,
      publicationStatus: position.publicationStatus,
      claimIds: position.claimIds,
      evidenceIds: position.evidenceIds,
    })),
    ...bundle.activities.map((activity) => ({
      id: `derived-timeline-${activity.id}`,
      personId: activity.personId,
      eventDate: activity.eventDate,
      title: activity.title,
      category: 'public-activity' as const,
      description: activity.description,
      verificationStatus: activity.verificationStatus,
      reviewStatus: activity.reviewStatus,
      publicationStatus: activity.publicationStatus,
      claimIds: activity.claimIds,
      evidenceIds: activity.evidenceIds,
    })),
    ...bundle.policies.map((policy) => ({
      id: `derived-timeline-${policy.id}`,
      personId: policy.personId,
      eventDate: policy.publicationDate,
      title: policy.title,
      category: 'policy' as const,
      description: policy.neutralSummary ?? policy.originalStatement,
      verificationStatus: policy.verificationStatus,
      reviewStatus: policy.reviewStatus,
      publicationStatus: policy.publicationStatus,
      claimIds: policy.claimIds,
      evidenceIds: policy.evidenceIds,
    })),
    ...bundle.news.flatMap((news) =>
      news.personIds.map((personId) => ({
        id: `derived-timeline-${news.id}-${personId}`,
        personId,
        eventDate: news.publicationDate,
        title: news.headline,
        category: 'other' as const,
        description: news.editorialSummary ?? news.headline,
        verificationStatus: news.verificationStatus,
        reviewStatus: news.reviewStatus,
        publicationStatus: news.publicationStatus,
        claimIds: news.claimIds,
        evidenceIds: news.evidenceIds,
      })),
    ),
  ];
  return events.sort((left, right) => {
    if (left.eventDate === right.eventDate)
      return left.id.localeCompare(right.id);
    if (!left.eventDate) return 1;
    if (!right.eventDate) return -1;
    return left.eventDate.localeCompare(right.eventDate);
  });
}

function countBy<T extends string>(
  values: readonly T[],
): Record<string, number> {
  return values.reduce<Record<string, number>>((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

export function buildCoverageReport(
  coverage: CoverageDataset,
  roster: OfficialDataset,
): CoverageReport {
  const candidates = roster.candidates.filter(
    (candidate) => candidate.publicationStatus === 'approved',
  );
  const candidateSummaries = candidates.map((candidate) => {
    const categories = coverage.audits.filter(
      (audit) => audit.candidateId === candidate.id,
    );
    return {
      candidateId: candidate.id,
      personId: `person-${candidate.slug}`,
      displayName: candidate.displayName,
      electionType: candidate.electionType,
      districtId: candidate.districtId,
      categories,
      identityStatus: categories.some(
        (audit) => audit.identityStatus === 'resolved',
      )
        ? ('resolved' as const)
        : ('roster-verified' as const),
      sourceRetrievalCount: categories.filter(
        (audit) => audit.retrievalStatus === 'retrieved',
      ).length,
      claimCount: categories.reduce((sum, audit) => sum + audit.claimCount, 0),
      machineValidatedClaimCount: categories.reduce(
        (sum, audit) => sum + audit.machineValidatedClaimCount,
        0,
      ),
      humanReviewedClaimCount: categories.reduce(
        (sum, audit) => sum + audit.humanReviewedClaimCount,
        0,
      ),
      editoriallyApprovedClaimCount: categories.reduce(
        (sum, audit) => sum + audit.editoriallyApprovedClaimCount,
        0,
      ),
      staticDisplayRecordCount: categories.reduce(
        (sum, audit) => sum + audit.staticDisplayRecordCount,
        0,
      ),
      publishedRecordCount: categories.reduce(
        (sum, audit) => sum + audit.publishedRecordCount,
        0,
      ),
      conflictCount: categories.reduce(
        (sum, audit) => sum + audit.conflictCount,
        0,
      ),
      ambiguousMatchCount: categories.reduce(
        (sum, audit) => sum + audit.ambiguousMatchCount,
        0,
      ),
      lastAttemptedAt:
        categories
          .map((audit) => audit.lastAttemptedAt)
          .filter(Boolean)
          .sort()
          .at(-1) ?? null,
    };
  });
  const recordsWithClaims = coverage.audits.filter(
    (audit) => audit.claimCount > 0,
  );
  const retrieved = coverage.audits.filter(
    (audit) => audit.retrievalStatus === 'retrieved',
  );
  // SAFETY: PUBLIC_RECORD_CATEGORIES supplies every CoverageCategory exactly once.
  const categoryMetrics = Object.fromEntries(
    PUBLIC_RECORD_CATEGORIES.map((category) => {
      const audits = coverage.audits.filter(
        (audit) => audit.category === category,
      );
      return [
        category,
        {
          auditedSlots: audits.length,
          sourceRetrievedSlots: audits.filter(
            (audit) => audit.retrievalStatus === 'retrieved',
          ).length,
          notAttemptedSlots: audits.filter(
            (audit) => audit.discoveryStatus === 'not-attempted',
          ).length,
          claims: audits.reduce((sum, audit) => sum + audit.claimCount, 0),
          machineValidatedClaims: audits.reduce(
            (sum, audit) => sum + audit.machineValidatedClaimCount,
            0,
          ),
          humanReviewedClaims: audits.reduce(
            (sum, audit) => sum + audit.humanReviewedClaimCount,
            0,
          ),
          editoriallyApprovedClaims: audits.reduce(
            (sum, audit) => sum + audit.editoriallyApprovedClaimCount,
            0,
          ),
          staticDisplayRecords: audits.reduce(
            (sum, audit) => sum + audit.staticDisplayRecordCount,
            0,
          ),
          publishedRecords: audits.reduce(
            (sum, audit) => sum + audit.publishedRecordCount,
            0,
          ),
        },
      ];
    }),
  ) as unknown as Record<CoverageCategory, Record<string, unknown>>;
  return {
    reportVersion: '1.0.0',
    reportType: 'full-roster-coverage',
    datasetId: coverage.datasetId,
    snapshotDate: coverage.snapshotDate,
    scope: 'complete-official-preliminary-roster',
    status: 'partial-discovery-and-pending-review',
    roster: {
      candidateCount: candidates.length,
      mayorCount: candidates.filter(
        (candidate) => candidate.electionType === 'mayoral',
      ).length,
      ordinaryCouncilCount: candidates.filter(
        (candidate) => candidate.electionType === 'city-council',
      ).length,
      indigenousCouncilCount: candidates.filter(
        (candidate) => candidate.electionType === 'indigenous-council',
      ).length,
      districtCount: new Set(
        candidates.map((candidate) => candidate.districtId),
      ).size,
    },
    metrics: {
      discovery: {
        auditedCandidateCount: candidates.length,
        auditedCategorySlotCount: coverage.audits.length,
        discoveryStatusCounts: countBy(
          coverage.audits.map((audit) => audit.discoveryStatus),
        ),
        sourceDiscoveredSlots: retrieved.length,
        notAttemptedSlots: coverage.audits.filter(
          (audit) => audit.discoveryStatus === 'not-attempted',
        ).length,
      },
      sourceRetrieval: {
        retrievedCategorySlots: retrieved.length,
        unchangedSourceCount: coverage.sourceChecks.filter(
          (check) => check.status === 'unchanged',
        ).length,
        changedSourceCount: coverage.sourceChecks.filter(
          (check) => check.status === 'changed',
        ).length,
        missingSnapshotCount: coverage.sourceChecks.filter(
          (check) => check.status === 'missing-snapshot',
        ).length,
      },
      claimExtraction: {
        categorySlotsWithClaims: recordsWithClaims.length,
        distinctClaimCount: coverage.claimRevisions.length,
        claimRevisionCount: coverage.claimRevisions.length,
      },
      machineValidation: {
        machineValidatedClaimCount: coverage.audits.reduce(
          (sum, audit) => sum + audit.machineValidatedClaimCount,
          0,
        ),
        evidenceLinkedCategorySlots: coverage.audits.filter(
          (audit) => audit.evidenceCount > 0,
        ).length,
        conflicts: coverage.audits.reduce(
          (sum, audit) => sum + audit.conflictCount,
          0,
        ),
        ambiguousIdentityMatches: coverage.audits.reduce(
          (sum, audit) => sum + audit.ambiguousMatchCount,
          0,
        ),
      },
      humanReview: {
        pendingClaimCount: coverage.audits.reduce(
          (sum, audit) =>
            sum + audit.claimCount - audit.humanReviewedClaimCount,
          0,
        ),
        humanReviewedClaimCount: coverage.audits.reduce(
          (sum, audit) => sum + audit.humanReviewedClaimCount,
          0,
        ),
        reviewerId: null,
        reviewedAt: null,
      },
      editorialApproval: {
        editoriallyApprovedClaimCount: coverage.audits.reduce(
          (sum, audit) => sum + audit.editoriallyApprovedClaimCount,
          0,
        ),
        editoriallyApprovedRecordCount: 0,
      },
      staticPublication: {
        sourceBackedStaticDisplayRecordCount: coverage.audits.reduce(
          (sum, audit) => sum + audit.staticDisplayRecordCount,
          0,
        ),
        publishedRecordCount: coverage.audits.reduce(
          (sum, audit) => sum + audit.publishedRecordCount,
          0,
        ),
        candidatesWithStaticRecords: candidateSummaries.filter(
          (candidate) => candidate.staticDisplayRecordCount > 0,
        ).length,
        meaning:
          'publishedRecordCount means source-backed static HTML display; it is not editorial approval.',
      },
    },
    categoryMetrics,
    candidates: candidateSummaries,
    sourceChecks: coverage.sourceChecks,
    inaccessibleSources: coverage.sourceChecks.filter(
      (check) =>
        check.status === 'missing-snapshot' || check.status === 'not-checked',
    ),
    revision: {
      previousBaseline: coverage.previousBaseline,
      changedAuditCount: coverage.audits.filter(
        (audit) =>
          audit.previousAuditStatus !== null &&
          audit.previousAuditStatus !== audit.discoveryStatus,
      ).length,
      claimRevisionCount: coverage.claimRevisions.length,
      note:
        coverage.previousBaseline === 'no-baseline'
          ? 'No previous full-roster coverage baseline was available; current checksums are not historical continuity.'
          : 'Previous audit state was available and unselected keys were preserved during resume.',
    },
    integrityAssertions: {
      demoCandidatesIncluded: false,
      nameOnlyMatchesPublished: false,
      unsupportedClaimsGenerated: false,
      reviewerMetadataInvented: false,
      candidateRankingProduced: false,
      singleCompletenessScoreProduced: false,
    },
    notes: [
      'A not-attempted or pending-discovery category is not evidence that no public information exists.',
      'The official roster is preliminary; drawn numbers and formal election status remain governed by the official election dataset.',
      'Selected source-backed records remain pending human review and are displayed with attribution and provenance.',
      'Fictional demo candidates are excluded from this production coverage report.',
    ],
  };
}

export function coverageMarkdown(report: CoverageReport): string {
  const categoryRows = PUBLIC_RECORD_CATEGORIES.map((category) => {
    const metrics = report.categoryMetrics[category];
    return `| ${category} | ${metrics.auditedSlots} | ${metrics.sourceRetrievedSlots} | ${metrics.notAttemptedSlots} | ${metrics.claims} | ${metrics.machineValidatedClaims} | ${metrics.humanReviewedClaims} | ${metrics.editoriallyApprovedClaims} | ${metrics.publishedRecords} |`;
  }).join('\n');
  const candidateRows = report.candidates
    .map((candidate) => {
      const categoryState = candidate.categories
        .map((audit) => `${audit.category}:${audit.discoveryStatus}`)
        .join('；');
      return `| ${candidate.displayName} | ${candidate.candidateId} | ${candidate.districtId} | ${categoryState} | ${candidate.publishedRecordCount} | ${candidate.conflictCount} |`;
    })
    .join('\n');
  return `# Full-roster public-record coverage report

- Dataset: \`${report.datasetId}\`
- Snapshot: ${report.snapshotDate}
- Scope: official preliminary roster only
- Status: **partial discovery／待人工審查**
- Candidates: ${report.roster.candidateCount} (${report.roster.mayorCount} mayoral, ${report.roster.ordinaryCouncilCount} ordinary-council, ${report.roster.indigenousCouncilCount} indigenous-council)
- Districts: ${report.roster.districtCount}

This report is a coverage audit, not a ranking and not a claim that unattempted categories have no public history. It deliberately does not provide a single completeness score.

## Separate pipeline metrics

| Stage | Measured result |
| --- | --- |
| Discovery | ${report.metrics.discovery.auditedCategorySlotCount} candidate/category slots audited; ${report.metrics.discovery.sourceDiscoveredSlots} linked to retained source-backed records; ${report.metrics.discovery.notAttemptedSlots} remain not-attempted |
| Source retrieval | ${report.metrics.sourceRetrieval.retrievedCategorySlots} category slots with retained retrieval; ${report.metrics.sourceRetrieval.missingSnapshotCount} manifest sources without snapshots |
| Claim extraction | ${report.metrics.claimExtraction.distinctClaimCount} distinct claims; ${report.metrics.claimExtraction.categorySlotsWithClaims} category slots with claims |
| Machine validation | ${report.metrics.machineValidation.machineValidatedClaimCount} machine-validated claim references; ${report.metrics.machineValidation.conflicts} conflicts; ${report.metrics.machineValidation.ambiguousIdentityMatches} ambiguous matches |
| Human review | ${report.metrics.humanReview.humanReviewedClaimCount} reviewed; ${report.metrics.humanReview.pendingClaimCount} pending; reviewer metadata is not recorded |
| Editorial approval | ${report.metrics.editorialApproval.editoriallyApprovedClaimCount} claims / ${report.metrics.editorialApproval.editoriallyApprovedRecordCount} records |
| Static publication | ${report.metrics.staticPublication.publishedRecordCount} source-backed records in static HTML for ${report.metrics.staticPublication.candidatesWithStaticRecords} candidates; this is not editorial approval |

## Category metrics

| Category | Audited | Retrieved | Not attempted | Claims | Machine validated | Human reviewed | Editorially approved | Static records |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${categoryRows}

## Candidate/category audit

| Candidate | Canonical candidacy ID | Constituency | Category states | Static records | Conflicts |
| --- | --- | --- | --- | ---: | ---: |
${candidateRows}

## Source and refresh state

- Previous full-roster baseline: **${report.revision.previousBaseline}**
- Changed audit states: ${report.revision.changedAuditCount}
- Claim revisions represented: ${report.revision.claimRevisionCount}
- Inaccessible or unretained manifest sources: ${report.inaccessibleSources.length}
- ${report.revision.note}

## Integrity boundaries

- Demo candidates included: no
- Name-only matches published: no
- Unsupported claims generated: no
- Reviewer identity/date invented: no
- Candidate ranking produced: no
- Single completeness score produced: no

${report.notes.map((note) => `- ${note}`).join('\n')}
`;
}
