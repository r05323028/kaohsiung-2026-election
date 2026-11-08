import { z } from 'zod';
import type { OfficialCandidate, OfficialDataset } from '../official/schema';
import { PUBLIC_RECORD_CATEGORIES } from './coverage';

const DateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const IsoTimestampSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/);
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const ResearchCategorySchema = z.enum(PUBLIC_RECORD_CATEGORIES);
export const ResearchPrioritySchema = z.enum(['P0', 'P1', 'P2', 'P3']);
export const ResearchIdentityStatusSchema = z.enum([
  'roster-verified',
  'resolved',
  'conflicted',
  'ambiguous',
  'unresolved',
]);
export const ResearchDiscoveryStatusSchema = z.enum([
  'not-attempted',
  'source-retrieved',
  'claim-extracted',
  'blocked',
  'failed',
  'ambiguous',
]);
export const ResearchRetrievalStatusSchema = z.enum([
  'not-attempted',
  'retrieved',
  'blocked',
  'failed',
]);
export const ResearchReviewStatusSchema = z.enum([
  'not-ready',
  'machine-validated',
  'pending-human-review',
  'human-reviewed',
  'editorially-approved',
]);
export const ResearchPublicationStatusSchema = z.enum([
  'not-eligible',
  'source-backed-static-display',
  'editorially-approved',
]);
export const ResearchResultStatusSchema = z.enum([
  'evidence-found',
  'identity-conflict',
  'source-scope-unavailable',
  'not-attempted',
  'prior-slice-reused',
]);
export type ResearchResultStatus = z.infer<typeof ResearchResultStatusSchema>;
export type ResearchReviewStatus = z.infer<typeof ResearchReviewStatusSchema>;
export { PUBLIC_RECORD_CATEGORIES };

export const ResearchSourceSnapshotSchema = z.object({
  sourceId: z.string().min(1),
  url: z.url(),
  role: z.string().min(1),
  priority: ResearchPrioritySchema,
  rawPath: z.string().min(1),
  sha256: Sha256Schema,
  retrievedAt: IsoTimestampSchema,
  httpStatus: z.literal(200),
  contentType: z.string().min(1),
  byteLength: z.number().int().positive(),
  scope: z.string().min(1),
});

export const ResearchObservationSchema = z.object({
  observationId: z.string().min(1),
  candidateId: z.string().min(1),
  personId: z.string().min(1),
  category: z.literal('positions'),
  observedName: z.string().min(1),
  observedParty: z.string().min(1).nullable(),
  observedCandidateNumber: z.string().min(1),
  observedDistrictId: z.string().min(1),
  observedElectionType: z.enum([
    'mayoral',
    'city-council',
    'indigenous-council',
  ]),
  sourceId: z.string().min(1),
  sourceUrl: z.url(),
  sourceLocation: z.string().min(1),
  sourceSnapshotPath: z.string().min(1),
  sourceSha256: Sha256Schema,
  observedAt: IsoTimestampSchema,
  identityStatus: ResearchIdentityStatusSchema,
  matchingConfidence: z.number().min(0).max(1),
  matchBasis: z.array(z.string().min(1)).min(1),
  conflictNote: z.string().min(1).nullable(),
  evidenceId: z.string().min(1),
});

export const ResearchEvidenceSchema = z.object({
  evidenceId: z.string().min(1),
  auditId: z.string().min(1),
  candidateId: z.string().min(1),
  sourceId: z.string().min(1),
  sourceUrl: z.url(),
  sourceSnapshotPath: z.string().min(1),
  sourceSha256: Sha256Schema,
  documentLocation: z.string().min(1),
  excerpt: z.string().min(1),
  evidenceType: z.literal('official-candidate-roster-row'),
  supportType: z.literal('direct'),
  retrievedAt: IsoTimestampSchema,
  verificationStatus: z.literal('source-retrieved'),
  reviewStatus: z.literal('pending-human-review'),
});

export const ResearchClaimSchema = z.object({
  claimId: z.string().min(1),
  auditId: z.string().min(1),
  candidateId: z.string().min(1),
  personId: z.string().min(1),
  category: z.literal('positions'),
  predicate: z.literal('participated-in-2026-kaohsiung-election'),
  objectValue: z.string().min(1),
  attribution: z.literal('official-election-source'),
  assertedDate: DateOnlySchema,
  identityStatus: z.literal('roster-verified'),
  verificationStatus: z.literal('source-retrieved'),
  reviewStatus: z.literal('pending-human-review'),
  publicationStatus: z.literal('source-backed-static-display'),
  evidenceIds: z.array(z.string().min(1)).min(1),
});

export const ResearchAuditSchema = z.object({
  auditId: z.string().min(1),
  candidateId: z.string().min(1),
  personId: z.string().min(1),
  displayName: z.string().min(1),
  electionType: z.enum(['mayoral', 'city-council', 'indigenous-council']),
  districtId: z.string().min(1),
  category: ResearchCategorySchema,
  priority: ResearchPrioritySchema,
  candidateNumberStatus: z.enum(['drawn', 'final', 'not-published']),
  candidateNumberIsFinal: z.boolean(),
  formalStatus: z.enum([
    'formally-announced',
    'pending-announcement',
    'changed',
    'blocked',
  ]),
  discoveryMethod: z.string().min(1),
  sourceConsultedIds: z.array(z.string().min(1)),
  sourceCandidateIds: z.array(z.string().min(1)),
  discoveryStatus: ResearchDiscoveryStatusSchema,
  retrievalStatus: ResearchRetrievalStatusSchema,
  identityStatus: ResearchIdentityStatusSchema,
  matchingConfidence: z.number().min(0).max(1).nullable(),
  identityEvidenceIds: z.array(z.string().min(1)),
  resultStatus: ResearchResultStatusSchema,
  resultNote: z.string().min(1),
  failureReason: z.string().nullable(),
  attemptedAt: IsoTimestampSchema.nullable(),
  attemptCount: z.number().int().nonnegative(),
  checksumStatus: z.enum([
    'unchanged',
    'changed',
    'not-checked',
    'missing-snapshot',
  ]),
  claimIds: z.array(z.string().min(1)),
  evidenceIds: z.array(z.string().min(1)),
  recordIds: z.array(z.string().min(1)),
  conflictCount: z.number().int().nonnegative(),
  reviewStatus: ResearchReviewStatusSchema,
  publicationStatus: ResearchPublicationStatusSchema,
  executionOrigin: z.enum([
    'current-official-snapshot',
    'prior-approved-slice',
    'not-attempted',
  ]),
  previousAttemptStatus: ResearchDiscoveryStatusSchema.nullable(),
  isNegativeEvidence: z.literal(false),
});

export const ResearchCheckpointSchema = z.object({
  checkpointId: z.string().min(1),
  datasetId: z.string().min(1),
  snapshotDate: DateOnlySchema,
  runId: z.string().min(1),
  command: z.enum(['execute', 'validate', 'review', 'verify']),
  candidateIds: z.array(z.string().min(1)),
  districtIds: z.array(z.string().min(1)),
  category: ResearchCategorySchema.nullable(),
  completedAuditIds: z.array(z.string().min(1)),
  failedAuditIds: z.array(z.string().min(1)),
  retryLimit: z.number().int().min(0).max(5),
  concurrency: z.number().int().min(1).max(8),
  resumedFromRunId: z.string().nullable(),
  dryRun: z.boolean(),
  updatedAt: IsoTimestampSchema,
});

export const ResearchReviewItemSchema = z.object({
  reviewItemId: z.string().min(1),
  auditId: z.string().min(1),
  candidateId: z.string().min(1),
  personId: z.string().min(1),
  displayName: z.string().min(1),
  category: ResearchCategorySchema,
  itemType: z.enum(['claim', 'identity-conflict', 'coverage-gap']),
  claimIds: z.array(z.string().min(1)),
  evidenceIds: z.array(z.string().min(1)),
  sourceIds: z.array(z.string().min(1)),
  suggestedDisposition: z.enum([
    'human-review-required',
    'withhold-conflict',
    'research-required',
  ]),
  reviewStatus: z.literal('pending-human-review'),
  reviewerId: z.null(),
  reviewedAt: z.null(),
  notes: z.string().min(1),
});

export const ResearchDatasetSchema = z.object({
  datasetId: z.literal('kaohsiung-2026-candidate-public-record-research'),
  snapshotDate: DateOnlySchema,
  rosterSnapshotDate: DateOnlySchema,
  candidateCount: z.number().int().nonnegative(),
  categories: z
    .array(ResearchCategorySchema)
    .length(PUBLIC_RECORD_CATEGORIES.length),
  sources: z.array(ResearchSourceSnapshotSchema).min(1),
  observations: z.array(ResearchObservationSchema),
  evidence: z.array(ResearchEvidenceSchema),
  claims: z.array(ResearchClaimSchema),
  audits: z.array(ResearchAuditSchema),
  checkpoint: ResearchCheckpointSchema,
  review: z.object({
    status: z.literal('pending-human-review'),
    reviewerId: z.null(),
    reviewedAt: z.null(),
    note: z.string().min(1),
  }),
});

export type ResearchCategory = z.infer<typeof ResearchCategorySchema>;
export type ResearchPriority = z.infer<typeof ResearchPrioritySchema>;
export type ResearchSourceSnapshot = z.infer<
  typeof ResearchSourceSnapshotSchema
>;
export type ResearchObservation = z.infer<typeof ResearchObservationSchema>;
export type ResearchEvidence = z.infer<typeof ResearchEvidenceSchema>;
export type ResearchClaim = z.infer<typeof ResearchClaimSchema>;
export type ResearchAudit = z.infer<typeof ResearchAuditSchema>;
export type ResearchCheckpoint = z.infer<typeof ResearchCheckpointSchema>;
export type ResearchReviewItem = z.infer<typeof ResearchReviewItemSchema>;
export type ResearchDataset = z.infer<typeof ResearchDatasetSchema>;

export type CecCandidateRow = {
  name: string;
  candNo: number;
  party: string;
  type: string;
  politics: string;
  educ: string;
  exp: string;
  sourceId: string;
  sourceUrl: string;
  sourcePath: string;
  sourceSha256: string;
  sourceLocation: string;
  districtId: string;
  electionType: OfficialCandidate['electionType'];
};

const CecRowSchema = z.object({
  name: z.string().min(1),
  candNo: z.number().int().positive(),
  party: z.string(),
  type: z.string().min(1),
  politics: z.string(),
  educ: z.string(),
  exp: z.string(),
});

function parseRows(
  value: unknown,
  sourceId: string,
  sourceUrl: string,
  sourcePath: string,
  sourceSha256: string,
  districtId: string,
  electionType: CecCandidateRow['electionType'],
  sourceLocation: string,
): CecCandidateRow[] {
  const parsed = CecRowSchema.array().safeParse(value);
  if (!parsed.success)
    throw new Error(`CEC candidate rows invalid at ${sourceLocation}.`);
  return parsed.data.map((row, index) => ({
    ...row,
    sourceId,
    sourceUrl,
    sourcePath,
    sourceSha256,
    sourceLocation: `${sourceLocation}.cands[${index}]`,
    districtId,
    electionType,
  }));
}

export function districtIdForCecArea(areaCode: string): string {
  const number = Number(areaCode);
  if (!Number.isInteger(number) || number < 1 || number > 15)
    throw new Error(`Unsupported Kaohsiung CEC area code: ${areaCode}.`);
  if (number <= 11)
    return `district-kaohsiung-council-${String(number).padStart(2, '0')}`;
  if (number === 12) return 'district-kaohsiung-indigenous-flat-12';
  return `district-kaohsiung-indigenous-mountain-${number}`;
}

export function parseCecCandidateRows(
  c1Input: unknown,
  councilInput: unknown,
  sourceMeta: ReadonlyMap<string, ResearchSourceSnapshot>,
): CecCandidateRow[] {
  const c1 = z.object({ C1: CecRowSchema.array() }).safeParse(c1Input);
  const council = z
    .object({
      T: z.array(
        z.object({ areaCode: z.string(), cands: CecRowSchema.array() }),
      ),
    })
    .safeParse(councilInput);
  if (!c1.success || !council.success)
    throw new Error(
      'CEC candidate snapshots do not match the expected C1/T schema.',
    );
  const mayorSource = sourceMeta.get('source-cec-vote2026-c1-64000');
  const councilSource = sourceMeta.get('source-cec-vote2026-t-64000');
  if (!mayorSource || !councilSource)
    throw new Error(
      'Research source manifest is missing C1 or T source metadata.',
    );
  const rows = parseRows(
    c1.data.C1,
    mayorSource.sourceId,
    mayorSource.url,
    mayorSource.rawPath,
    mayorSource.sha256,
    'district-kaohsiung-mayor-2026',
    'mayoral',
    'C1',
  );
  for (const area of council.data.T) {
    const districtId = districtIdForCecArea(area.areaCode);
    rows.push(
      ...parseRows(
        area.cands,
        councilSource.sourceId,
        councilSource.url,
        councilSource.rawPath,
        councilSource.sha256,
        districtId,
        Number(area.areaCode) <= 11 ? 'city-council' : 'indigenous-council',
        `T[areaCode=${area.areaCode}]`,
      ),
    );
  }
  return rows;
}

export function researchAuditKey(
  candidateId: string,
  category: ResearchCategory,
): string {
  return `research-${candidateId}-${category}`;
}

function priorityFor(category: ResearchCategory): ResearchPriority {
  if (category === 'positions') return 'P0';
  if (category === 'policies' || category === 'activities') return 'P1';
  if (category === 'news' || category === 'timeline') return 'P2';
  return 'P3';
}

function sourceRowKey(row: CecCandidateRow): string {
  return `${row.districtId}|${row.candNo}`;
}

function candidateRowKey(candidate: OfficialCandidate): string {
  return `${candidate.districtId}|${candidate.candidateNumber}`;
}

function sourceExcerpt(row: CecCandidateRow): string {
  return `中央選舉委員會候選人資料列：${row.name}，${row.electionType === 'mayoral' ? '市長' : '市議員'}，${row.districtId}，號次 ${row.candNo}，政黨欄位為「${row.party || '未填載'}」。`;
}

function sourceForRow(
  row: CecCandidateRow,
  sourceMap: ReadonlyMap<string, ResearchSourceSnapshot>,
): ResearchSourceSnapshot {
  const source = sourceMap.get(row.sourceId);
  if (!source)
    throw new Error(`Research source metadata missing ${row.sourceId}.`);
  return source;
}

function auditBase(
  candidate: OfficialCandidate,
  category: ResearchCategory,
  row: CecCandidateRow | undefined,
  source: ResearchSourceSnapshot | undefined,
  observedAt: string,
): ResearchAudit {
  const identityStatus = row
    ? row.name === candidate.displayName
      ? 'roster-verified'
      : 'conflicted'
    : 'unresolved';
  const hasRow = Boolean(row && source);
  const sourceIds = hasRow && source ? [source.sourceId] : [];
  const conflict = identityStatus === 'conflicted';
  const notAttempted =
    category === 'news' ||
    category === 'timeline' ||
    category === 'relationships';
  const sourceScopeOnly = category === 'policies' || category === 'activities';
  const attempted = !notAttempted && hasRow;
  const resultStatus = notAttempted
    ? 'not-attempted'
    : conflict
      ? 'identity-conflict'
      : sourceScopeOnly
        ? 'source-scope-unavailable'
        : 'evidence-found';
  const resultNote = notAttempted
    ? '本次執行尚未保存此類別的候選人專屬來源；缺少資料不表示不存在。'
    : conflict
      ? `同一選舉區與號次的官方資料出現姓名字元差異：既有名冊為「${candidate.displayName}」，CEC 候選人資料為「${row?.name ?? ''}」；待人工核對。`
      : sourceScopeOnly
        ? '已檢查官方候選人資料快照，但該快照未提供可直接引用的本類別紀錄；這不是不存在的證據。'
        : '已從官方候選人資料快照取得與既有名冊相符的候選人列。';
  return {
    auditId: researchAuditKey(candidate.id, category),
    candidateId: candidate.id,
    personId: `person-${candidate.slug}`,
    displayName: candidate.displayName,
    electionType: candidate.electionType,
    districtId: candidate.districtId,
    category,
    priority: priorityFor(category),
    candidateNumberStatus: candidate.candidateNumberStatus,
    candidateNumberIsFinal: candidate.candidateNumberIsFinal,
    formalStatus: candidate.formalStatus,
    discoveryMethod: notAttempted
      ? 'research-plan-not-executed'
      : 'official-cec-candidate-row-scope-check',
    sourceConsultedIds: sourceIds,
    sourceCandidateIds: sourceIds,
    discoveryStatus: !attempted
      ? 'not-attempted'
      : conflict
        ? 'ambiguous'
        : category === 'positions'
          ? 'claim-extracted'
          : 'source-retrieved',
    retrievalStatus: !attempted ? 'not-attempted' : 'retrieved',
    identityStatus,
    matchingConfidence: row ? (conflict ? 0.75 : 1) : null,
    identityEvidenceIds: [],
    resultStatus,
    resultNote,
    failureReason: null,
    attemptedAt: attempted ? observedAt : null,
    attemptCount: attempted ? 1 : 0,
    checksumStatus: source ? 'unchanged' : 'not-checked',
    claimIds: [],
    evidenceIds: [],
    recordIds: [],
    conflictCount: conflict ? 1 : 0,
    reviewStatus:
      category === 'positions' && !conflict
        ? 'pending-human-review'
        : 'not-ready',
    publicationStatus:
      category === 'positions' && !conflict
        ? 'source-backed-static-display'
        : 'not-eligible',
    executionOrigin: attempted ? 'current-official-snapshot' : 'not-attempted',
    previousAttemptStatus: null,
    isNegativeEvidence: false,
  };
}

export function buildResearchDataset(
  roster: OfficialDataset,
  sourceSnapshots: readonly ResearchSourceSnapshot[],
  c1Input: unknown,
  councilInput: unknown,
  snapshotDate: string,
  observedAt: string,
  options: {
    runId: string;
    candidateIds?: ReadonlySet<string>;
    districtIds?: ReadonlySet<string>;
    category?: ResearchCategory;
    retryLimit: number;
    concurrency: number;
    dryRun: boolean;
    resumedFromRunId: string | null;
  },
): ResearchDataset {
  const sourceMap = new Map(
    sourceSnapshots.map((source) => [source.sourceId, source]),
  );
  const rows = parseCecCandidateRows(c1Input, councilInput, sourceMap);
  const rowsByKey = new Map(rows.map((row) => [sourceRowKey(row), row]));
  const candidates = roster.candidates.filter(
    (candidate) => candidate.publicationStatus === 'approved',
  );
  const observations: ResearchObservation[] = [];
  const evidence: ResearchEvidence[] = [];
  const claims: ResearchClaim[] = [];
  const audits: ResearchAudit[] = [];
  const categories = [...PUBLIC_RECORD_CATEGORIES];
  for (const candidate of candidates) {
    const row = rowsByKey.get(candidateRowKey(candidate));
    const source = row ? sourceForRow(row, sourceMap) : undefined;
    const personId = `person-${candidate.slug}`;
    const observationId = `research-observation-${candidate.id}`;
    const evidenceId = `research-evidence-${candidate.id}`;
    const positionAuditId = researchAuditKey(candidate.id, 'positions');
    if (row && source) {
      const identityStatus =
        row.name === candidate.displayName ? 'roster-verified' : 'conflicted';
      observations.push({
        observationId,
        candidateId: candidate.id,
        personId,
        category: 'positions',
        observedName: row.name,
        observedParty: row.party || null,
        observedCandidateNumber: String(row.candNo),
        observedDistrictId: row.districtId,
        observedElectionType: row.electionType,
        sourceId: source.sourceId,
        sourceUrl: source.url,
        sourceLocation: row.sourceLocation,
        sourceSnapshotPath: source.rawPath,
        sourceSha256: source.sha256,
        observedAt,
        identityStatus,
        matchingConfidence: identityStatus === 'roster-verified' ? 1 : 0.75,
        matchBasis: [
          'district-and-candidate-number',
          ...(identityStatus === 'roster-verified'
            ? ['exact-name']
            : ['name-conflict']),
        ],
        conflictNote:
          identityStatus === 'conflicted'
            ? `CEC「${row.name}」與既有名冊「${candidate.displayName}」字元不同，未靜默合併。`
            : null,
        evidenceId,
      });
      evidence.push({
        evidenceId,
        auditId: positionAuditId,
        candidateId: candidate.id,
        sourceId: source.sourceId,
        sourceUrl: source.url,
        sourceSnapshotPath: source.rawPath,
        sourceSha256: source.sha256,
        documentLocation: row.sourceLocation,
        excerpt: sourceExcerpt(row),
        evidenceType: 'official-candidate-roster-row',
        supportType: 'direct',
        retrievedAt: source.retrievedAt,
        verificationStatus: 'source-retrieved',
        reviewStatus: 'pending-human-review',
      });
      if (identityStatus === 'roster-verified') {
        claims.push({
          claimId: `research-claim-${candidate.id}`,
          auditId: positionAuditId,
          candidateId: candidate.id,
          personId,
          category: 'positions',
          predicate: 'participated-in-2026-kaohsiung-election',
          objectValue: `${row.electionType === 'mayoral' ? '高雄市長' : '高雄市議員'}候選人（號次 ${row.candNo}）`,
          attribution: 'official-election-source',
          assertedDate: snapshotDate,
          identityStatus: 'roster-verified',
          verificationStatus: 'source-retrieved',
          reviewStatus: 'pending-human-review',
          publicationStatus: 'source-backed-static-display',
          evidenceIds: [evidenceId],
        });
      }
    }
    for (const category of categories) {
      const audit = auditBase(candidate, category, row, source, observedAt);
      if (category === 'positions' && row && source) {
        audit.identityEvidenceIds = [evidenceId];
        if (row.name === candidate.displayName) {
          audit.claimIds = [`research-claim-${candidate.id}`];
          audit.evidenceIds = [evidenceId];
          audit.recordIds = [observationId];
        } else {
          audit.evidenceIds = [evidenceId];
        }
      }
      if (options.category && category !== options.category) {
        audit.discoveryStatus = 'not-attempted';
        audit.retrievalStatus = 'not-attempted';
        audit.attemptedAt = null;
        audit.attemptCount = 0;
        audit.resultStatus = 'not-attempted';
        audit.resultNote = `本次批次以 ${options.category} 為篩選條件，其他類別保留為未執行；缺少資料不表示不存在。`;
        audit.executionOrigin = 'not-attempted';
        audit.sourceConsultedIds = [];
        audit.sourceCandidateIds = [];
        audit.checksumStatus = 'not-checked';
        audit.identityStatus = 'unresolved';
        audit.matchingConfidence = null;
        audit.identityEvidenceIds = [];
        audit.claimIds = [];
        audit.evidenceIds = [];
        audit.recordIds = [];
        audit.reviewStatus = 'not-ready';
        audit.publicationStatus = 'not-eligible';
      }
      if (options.candidateIds && !options.candidateIds.has(candidate.id)) {
        audit.discoveryStatus = 'not-attempted';
        audit.retrievalStatus = 'not-attempted';
        audit.attemptedAt = null;
        audit.attemptCount = 0;
        audit.resultStatus = 'not-attempted';
        audit.resultNote = '本次批次未包含此候選人；缺少資料不表示不存在。';
        audit.executionOrigin = 'not-attempted';
        audit.sourceConsultedIds = [];
        audit.sourceCandidateIds = [];
        audit.checksumStatus = 'not-checked';
        audit.identityStatus = 'unresolved';
        audit.matchingConfidence = null;
        audit.identityEvidenceIds = [];
        audit.claimIds = [];
        audit.evidenceIds = [];
        audit.recordIds = [];
        audit.reviewStatus = 'not-ready';
        audit.publicationStatus = 'not-eligible';
      }
      if (
        options.districtIds &&
        !options.districtIds.has(candidate.districtId)
      ) {
        audit.discoveryStatus = 'not-attempted';
        audit.retrievalStatus = 'not-attempted';
        audit.attemptedAt = null;
        audit.attemptCount = 0;
        audit.resultStatus = 'not-attempted';
        audit.resultNote = '本次批次未包含此選舉區；缺少資料不表示不存在。';
        audit.executionOrigin = 'not-attempted';
        audit.sourceConsultedIds = [];
        audit.sourceCandidateIds = [];
        audit.checksumStatus = 'not-checked';
        audit.identityStatus = 'unresolved';
        audit.matchingConfidence = null;
        audit.identityEvidenceIds = [];
        audit.claimIds = [];
        audit.evidenceIds = [];
        audit.recordIds = [];
        audit.reviewStatus = 'not-ready';
        audit.publicationStatus = 'not-eligible';
      }
      audits.push(audit);
    }
  }
  return {
    datasetId: 'kaohsiung-2026-candidate-public-record-research',
    snapshotDate,
    rosterSnapshotDate: roster.snapshotDate,
    candidateCount: candidates.length,
    categories,
    sources: [...sourceSnapshots],
    observations,
    evidence,
    claims,
    audits,
    checkpoint: {
      checkpointId: `research-checkpoint-${options.runId}`,
      datasetId: 'kaohsiung-2026-candidate-public-record-research',
      snapshotDate,
      runId: options.runId,
      command: 'execute',
      candidateIds: [...(options.candidateIds ?? [])],
      districtIds: [...(options.districtIds ?? [])],
      category: options.category ?? null,
      completedAuditIds: audits
        .filter((audit) => audit.attemptCount > 0)
        .map((audit) => audit.auditId),
      failedAuditIds: audits
        .filter((audit) => audit.failureReason !== null)
        .map((audit) => audit.auditId),
      retryLimit: options.retryLimit,
      concurrency: options.concurrency,
      resumedFromRunId: options.resumedFromRunId,
      dryRun: options.dryRun,
      updatedAt: observedAt,
    },
    review: {
      status: 'pending-human-review',
      reviewerId: null,
      reviewedAt: null,
      note: '官方快照已保存並通過機器參照檢查；人工審查、字元衝突裁決與編輯核准尚未完成。',
    },
  };
}

export function validateResearchDataset(
  input: unknown,
  roster: OfficialDataset,
  manifestSourceIds: ReadonlySet<string>,
): ResearchDataset {
  const parsed = ResearchDatasetSchema.safeParse(input);
  if (!parsed.success) {
    const details = parsed.error.issues.map(
      (issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`,
    );
    throw new Error(
      `Candidate research validation failed:\n${details.join('\n')}`,
    );
  }
  const dataset = parsed.data;
  const errors: string[] = [];
  const candidates = roster.candidates.filter(
    (candidate) => candidate.publicationStatus === 'approved',
  );
  const candidateById = new Map(
    candidates.map((candidate) => [candidate.id, candidate]),
  );
  const expectedKeys = new Set(
    candidates.flatMap((candidate) =>
      PUBLIC_RECORD_CATEGORIES.map((category) =>
        researchAuditKey(candidate.id, category),
      ),
    ),
  );
  const seenKeys = new Set<string>();
  for (const audit of dataset.audits) {
    if (seenKeys.has(audit.auditId))
      errors.push(`duplicate research audit ${audit.auditId}`);
    seenKeys.add(audit.auditId);
    const candidate = candidateById.get(audit.candidateId);
    if (!candidate)
      errors.push(
        `research audit ${audit.auditId} references unknown candidate ${audit.candidateId}`,
      );
    else {
      if (audit.personId !== `person-${candidate.slug}`)
        errors.push(
          `research audit ${audit.auditId} has unstable person ID ${audit.personId}`,
        );
      if (audit.districtId !== candidate.districtId)
        errors.push(
          `research audit ${audit.auditId} has wrong district ${audit.districtId}`,
        );
      if (
        audit.candidateNumberStatus !== candidate.candidateNumberStatus ||
        audit.formalStatus !== candidate.formalStatus
      )
        errors.push(
          `research audit ${audit.auditId} changed election status semantics`,
        );
      if (audit.candidateNumberIsFinal !== candidate.candidateNumberIsFinal)
        errors.push(
          `research audit ${audit.auditId} changed candidate-number finality`,
        );
    }
    for (const sourceId of [
      ...audit.sourceConsultedIds,
      ...audit.sourceCandidateIds,
    ])
      if (!manifestSourceIds.has(sourceId))
        errors.push(
          `research audit ${audit.auditId} references missing source ${sourceId}`,
        );
    if (audit.discoveryStatus === 'not-attempted' && audit.attemptedAt !== null)
      errors.push(
        `not-attempted research audit ${audit.auditId} has an attempt timestamp`,
      );
    if (audit.identityStatus === 'conflicted' && audit.claimIds.length > 0)
      errors.push(
        `conflicted research audit ${audit.auditId} publishes a claim`,
      );
    if (
      audit.reviewStatus === 'not-ready' &&
      audit.publicationStatus !== 'not-eligible'
    )
      errors.push(
        `not-ready research audit ${audit.auditId} is publication eligible`,
      );
    if (audit.candidateNumberStatus !== 'final' && audit.candidateNumberIsFinal)
      errors.push(`research audit ${audit.auditId} marks a drawn number final`);
  }
  for (const key of expectedKeys)
    if (!seenKeys.has(key)) errors.push(`missing research audit ${key}`);
  const sourceIds = new Set(dataset.sources.map((source) => source.sourceId));
  for (const source of dataset.sources)
    if (!manifestSourceIds.has(source.sourceId))
      errors.push(`research source ${source.sourceId} is absent from manifest`);
  const evidenceIds = new Set(dataset.evidence.map((item) => item.evidenceId));
  const claimIds = new Set(dataset.claims.map((claim) => claim.claimId));
  const auditIds = new Set(dataset.audits.map((audit) => audit.auditId));
  const observedCandidates = new Set<string>();
  for (const observation of dataset.observations) {
    if (observedCandidates.has(observation.candidateId))
      errors.push(
        `duplicate position observation for ${observation.candidateId}`,
      );
    observedCandidates.add(observation.candidateId);
    if (!candidateById.has(observation.candidateId))
      errors.push(
        `observation ${observation.observationId} references unknown candidate`,
      );
    if (!sourceIds.has(observation.sourceId))
      errors.push(
        `observation ${observation.observationId} references missing research source`,
      );
    if (!evidenceIds.has(observation.evidenceId))
      errors.push(
        `observation ${observation.observationId} references missing evidence`,
      );
  }
  if (observedCandidates.size !== candidates.length)
    errors.push(
      `position observations ${observedCandidates.size} do not cover ${candidates.length} candidates`,
    );
  for (const item of dataset.evidence) {
    if (!auditIds.has(item.auditId))
      errors.push(`evidence ${item.evidenceId} references missing audit`);
    if (!sourceIds.has(item.sourceId))
      errors.push(`evidence ${item.evidenceId} references missing source`);
    if (!candidateById.has(item.candidateId))
      errors.push(`evidence ${item.evidenceId} references unknown candidate`);
  }
  for (const claim of dataset.claims) {
    if (!auditIds.has(claim.auditId))
      errors.push(`claim ${claim.claimId} references missing audit`);
    if (!candidateById.has(claim.candidateId))
      errors.push(`claim ${claim.claimId} references unknown candidate`);
    for (const evidenceId of claim.evidenceIds)
      if (!evidenceIds.has(evidenceId))
        errors.push(
          `claim ${claim.claimId} references missing evidence ${evidenceId}`,
        );
    const audit = dataset.audits.find((item) => item.auditId === claim.auditId);
    if (audit?.identityStatus !== 'roster-verified')
      errors.push(
        `claim ${claim.claimId} is attached to non-verified identity`,
      );
  }
  for (const audit of dataset.audits) {
    for (const claimId of audit.claimIds)
      if (!claimIds.has(claimId))
        errors.push(
          `audit ${audit.auditId} references missing claim ${claimId}`,
        );
    for (const evidenceId of audit.evidenceIds)
      if (!evidenceIds.has(evidenceId))
        errors.push(
          `audit ${audit.auditId} references missing evidence ${evidenceId}`,
        );
  }
  if (dataset.review.reviewerId !== null || dataset.review.reviewedAt !== null)
    errors.push('pending research review cannot contain reviewer metadata');
  if (dataset.audits.length !== expectedKeys.size)
    errors.push(
      `research audit count ${dataset.audits.length} does not match expected ${expectedKeys.size}`,
    );
  if (errors.length > 0)
    throw new Error(
      `Candidate research reference validation failed:\n${errors.join('\n')}`,
    );
  return dataset;
}

export function buildResearchReviewPacket(dataset: ResearchDataset): {
  datasetId: ResearchDataset['datasetId'];
  snapshotDate: string;
  status: 'pending-human-review';
  reviewerId: null;
  reviewedAt: null;
  items: ResearchReviewItem[];
  notes: string[];
} {
  const items = dataset.audits.map((audit): ResearchReviewItem => {
    const itemType: ResearchReviewItem['itemType'] =
      audit.identityStatus === 'conflicted'
        ? 'identity-conflict'
        : audit.claimIds.length > 0
          ? 'claim'
          : 'coverage-gap';
    const suggestedDisposition: ResearchReviewItem['suggestedDisposition'] =
      itemType === 'identity-conflict'
        ? 'withhold-conflict'
        : itemType === 'claim'
          ? 'human-review-required'
          : 'research-required';
    return {
      reviewItemId: `review-${audit.auditId}`,
      auditId: audit.auditId,
      candidateId: audit.candidateId,
      personId: audit.personId,
      displayName: audit.displayName,
      category: audit.category,
      itemType,
      claimIds: audit.claimIds,
      evidenceIds: audit.evidenceIds,
      sourceIds: audit.sourceConsultedIds,
      suggestedDisposition,
      reviewStatus: 'pending-human-review' as const,
      reviewerId: null,
      reviewedAt: null,
      notes:
        itemType === 'identity-conflict' ? audit.resultNote : audit.resultNote,
    };
  });
  return {
    datasetId: dataset.datasetId,
    snapshotDate: dataset.snapshotDate,
    status: 'pending-human-review',
    reviewerId: null,
    reviewedAt: null,
    items,
    notes: [
      '缺少來源或未執行不表示事實不存在。',
      '字元衝突不得以候選人姓名單獨合併或靜默改寫。',
      '本資料包未填入人工審查者或審查時間。',
    ],
  };
}

export type ResearchReport = {
  reportVersion: '1.0.0';
  reportType: 'full-roster-research';
  datasetId: ResearchDataset['datasetId'];
  snapshotDate: string;
  status: 'partial-research-and-pending-review';
  roster: {
    candidateCount: number;
    mayorCount: number;
    ordinaryCouncilCount: number;
    indigenousCouncilCount: number;
    districtCount: number;
  };
  totals: {
    auditCount: number;
    attemptedCount: number;
    retrievedCount: number;
    claimCount: number;
    evidenceCount: number;
    conflictedCount: number;
    conflictedCandidateCount: number;
    notAttemptedCount: number;
    sourceSnapshotCount: number;
    humanReviewedCount: 0;
    editoriallyApprovedCount: 0;
  };
  byCategory: Record<
    ResearchCategory,
    {
      priority: ResearchPriority;
      auditCount: number;
      attemptedCount: number;
      retrievedCount: number;
      claimCount: number;
      evidenceCount: number;
      conflictedCount: number;
      notAttemptedCount: number;
      resultStatuses: Record<string, number>;
    }
  >;
  candidates: Array<{
    candidateId: string;
    personId: string;
    displayName: string;
    electionType: OfficialCandidate['electionType'];
    districtId: string;
    identityStatus: ResearchAudit['identityStatus'];
    categories: ResearchAudit[];
    conflictCount: number;
    claimCount: number;
    evidenceCount: number;
    attemptedCount: number;
    notAttemptedCount: number;
  }>;
  sourceChecks: ResearchSourceSnapshot[];
  review: {
    status: 'pending-human-review';
    reviewerId: null;
    reviewedAt: null;
  };
  integrityAssertions: {
    demoCandidatesIncluded: false;
    nameOnlyMatchesPublished: false;
    unsupportedClaimsGenerated: false;
    reviewerMetadataInvented: false;
    candidateRankingProduced: false;
    completenessClaimed: false;
  };
  limitations: string[];
};

export function buildResearchReport(
  dataset: ResearchDataset,
  roster: OfficialDataset,
): ResearchReport {
  const candidates = roster.candidates.filter(
    (candidate) => candidate.publicationStatus === 'approved',
  );
  const byCategory = Object.fromEntries(
    PUBLIC_RECORD_CATEGORIES.map((category) => {
      const audits = dataset.audits.filter(
        (audit) => audit.category === category,
      );
      const resultStatuses = audits.reduce<Record<string, number>>(
        (counts, audit) => {
          counts[audit.resultStatus] = (counts[audit.resultStatus] ?? 0) + 1;
          return counts;
        },
        {},
      );
      return [
        category,
        {
          priority: priorityFor(category),
          auditCount: audits.length,
          attemptedCount: audits.filter((audit) => audit.attemptCount > 0)
            .length,
          retrievedCount: audits.filter(
            (audit) => audit.retrievalStatus === 'retrieved',
          ).length,
          claimCount: audits.reduce(
            (sum, audit) => sum + audit.claimIds.length,
            0,
          ),
          evidenceCount: audits.reduce(
            (sum, audit) => sum + audit.evidenceIds.length,
            0,
          ),
          conflictedCount: audits.filter(
            (audit) => audit.identityStatus === 'conflicted',
          ).length,
          notAttemptedCount: audits.filter(
            (audit) => audit.resultStatus === 'not-attempted',
          ).length,
          resultStatuses,
        },
      ];
    }),
  ) as Record<ResearchCategory, ResearchReport['byCategory'][ResearchCategory]>;
  const candidatesReport = candidates.map((candidate) => {
    const categories = dataset.audits.filter(
      (audit) => audit.candidateId === candidate.id,
    );
    return {
      candidateId: candidate.id,
      personId: `person-${candidate.slug}`,
      displayName: candidate.displayName,
      electionType: candidate.electionType,
      districtId: candidate.districtId,
      identityStatus:
        categories.find((audit) => audit.category === 'positions')
          ?.identityStatus ?? 'unresolved',
      categories,
      conflictCount: categories.reduce(
        (sum, audit) => sum + audit.conflictCount,
        0,
      ),
      claimCount: categories.reduce(
        (sum, audit) => sum + audit.claimIds.length,
        0,
      ),
      evidenceCount: categories.reduce(
        (sum, audit) => sum + audit.evidenceIds.length,
        0,
      ),
      attemptedCount: categories.filter((audit) => audit.attemptCount > 0)
        .length,
      notAttemptedCount: categories.filter(
        (audit) => audit.resultStatus === 'not-attempted',
      ).length,
    };
  });
  return {
    reportVersion: '1.0.0',
    reportType: 'full-roster-research',
    datasetId: dataset.datasetId,
    snapshotDate: dataset.snapshotDate,
    status: 'partial-research-and-pending-review',
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
    totals: {
      auditCount: dataset.audits.length,
      attemptedCount: dataset.audits.filter((audit) => audit.attemptCount > 0)
        .length,
      retrievedCount: dataset.audits.filter(
        (audit) => audit.retrievalStatus === 'retrieved',
      ).length,
      claimCount: dataset.claims.length,
      evidenceCount: dataset.evidence.length,
      conflictedCount: dataset.audits.filter(
        (audit) => audit.identityStatus === 'conflicted',
      ).length,
      conflictedCandidateCount: new Set(
        dataset.audits
          .filter((audit) => audit.identityStatus === 'conflicted')
          .map((audit) => audit.candidateId),
      ).size,
      notAttemptedCount: dataset.audits.filter(
        (audit) => audit.resultStatus === 'not-attempted',
      ).length,
      sourceSnapshotCount: dataset.sources.length,
      humanReviewedCount: 0,
      editoriallyApprovedCount: 0,
    },
    byCategory,
    candidates: candidatesReport,
    sourceChecks: dataset.sources,
    review: {
      status: 'pending-human-review',
      reviewerId: null,
      reviewedAt: null,
    },
    integrityAssertions: {
      demoCandidatesIncluded: false,
      nameOnlyMatchesPublished: false,
      unsupportedClaimsGenerated: false,
      reviewerMetadataInvented: false,
      candidateRankingProduced: false,
      completenessClaimed: false,
    },
    limitations: [
      'P0 候選人資料快照已對照全數 106 名候選人，但 9 筆姓名字元差異保留為衝突，未靜默合併。',
      'P1 政策／活動僅完成 CEC 候選人資料欄位範圍檢查；空欄位不表示不存在。',
      'P2 新聞／時間軸與 P3 公共關係本次未完成候選人專屬檢索，仍是未執行狀態。',
      '所有研究結果仍待人工審查，沒有人工核准或編輯核准。',
    ],
  };
}

export function researchMarkdown(report: ResearchReport): string {
  const lines = [
    `# 全名冊候選人公共紀錄研究報告`,
    '',
    `- 快照日期：${report.snapshotDate}`,
    `- 狀態：${report.status}`,
    `- 名冊：${report.roster.candidateCount} 人（市長 ${report.roster.mayorCount}、普通市議員 ${report.roster.ordinaryCouncilCount}、原住民族市議員 ${report.roster.indigenousCouncilCount}）`,
    `- 研究審查：待人工審查；reviewerId/reviewedAt 均為 null`,
    '',
    '## 類別統計',
    '',
    '| 類別 | 優先級 | 審計數 | 已嘗試 | 已取回 | 證據 | 聲明 | 衝突 | 未執行 |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const category of PUBLIC_RECORD_CATEGORIES) {
    const metric = report.byCategory[category];
    lines.push(
      `| ${category} | ${metric.priority} | ${metric.auditCount} | ${metric.attemptedCount} | ${metric.retrievedCount} | ${metric.evidenceCount} | ${metric.claimCount} | ${metric.conflictedCount} | ${metric.notAttemptedCount} |`,
    );
  }
  lines.push(
    '',
    '## 誠信不變量',
    '',
    '- demoCandidatesIncluded: false',
    '- nameOnlyMatchesPublished: false',
    '- unsupportedClaimsGenerated: false',
    '- reviewerMetadataInvented: false',
    '- candidateRankingProduced: false',
    '- completenessClaimed: false',
    '',
    '## 限制',
    ...report.limitations.map((note) => `- ${note}`),
    '',
    '此報告將未執行、受阻、衝突與空白欄位與「不存在」分開；未查得不是否定性結論。',
  );
  return `${lines.join('\n')}\n`;
}

export function buildIndependentVerificationReport(
  dataset: ResearchDataset,
  roster: OfficialDataset,
): {
  reportVersion: '1.0.0';
  reportType: 'independent-machine-reparse';
  snapshotDate: string;
  method: string;
  sampleCriteria: string[];
  sampleAuditIds: string[];
  checkedCount: number;
  matchedCount: number;
  discrepancyCount: number;
  discrepancies: string[];
  reviewerId: null;
  reviewedAt: null;
  limitations: string[];
} {
  const candidates = roster.candidates.filter(
    (candidate) => candidate.publicationStatus === 'approved',
  );
  const selected = candidates
    .filter(
      (candidate) =>
        candidate.electionType === 'mayoral' ||
        candidate.districtId === 'district-kaohsiung-council-04' ||
        candidate.districtId === 'district-kaohsiung-indigenous-mountain-13' ||
        candidate.id ===
          dataset.observations.find(
            (observation) => observation.identityStatus === 'conflicted',
          )?.candidateId,
    )
    .slice(0, 12);
  const sampleAuditIds = selected.map((candidate) =>
    researchAuditKey(candidate.id, 'positions'),
  );
  const discrepancies = selected.flatMap((candidate) => {
    const audit = dataset.audits.find(
      (item) => item.auditId === researchAuditKey(candidate.id, 'positions'),
    );
    return audit?.identityStatus === 'conflicted'
      ? [`${candidate.id}: 保留官方姓名字元衝突，未判定為相同姓名。`]
      : [];
  });
  return {
    reportVersion: '1.0.0',
    reportType: 'independent-machine-reparse',
    snapshotDate: dataset.snapshotDate,
    method:
      '重新以保留的 CEC C1/T 原始快照依選舉區與號次抽樣比對；這是獨立機器重解析，不是人工審查。',
    sampleCriteria: [
      '至少一名市長候選人',
      '第4普通市議員選舉區',
      '第13原住民族市議員選舉區',
      '至少一筆姓名衝突',
      '未執行類別不被標記為已驗證',
    ],
    sampleAuditIds,
    checkedCount: sampleAuditIds.length,
    matchedCount: sampleAuditIds.length - discrepancies.length,
    discrepancyCount: discrepancies.length,
    discrepancies,
    reviewerId: null,
    reviewedAt: null,
    limitations: [
      '樣本結果不代表全名冊已人工驗證。',
      '未執行、受阻或衝突的類別仍須後續研究與人工裁決。',
    ],
  };
}
