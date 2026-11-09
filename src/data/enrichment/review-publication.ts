import { z } from 'zod';
import {
  type EditorialDecision,
  EditorialDecisionSchema,
  type ReviewerRegistry,
} from '../editorial/schema';
import type {
  EnrichmentAudit,
  EnrichmentCategory,
  EnrichmentDataset,
  EnrichmentReviewPacket,
  EnrichmentSourceAttempt,
} from './schema';

const IsoTimestampSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/);
const DateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const SCOPED_BLOCKER_CATEGORIES = [
  'coverage-gap',
  'missing-public-record-evidence',
  'sensitive-relationship-evidence',
  'candidate-attribution',
  'currentness',
  'other',
] as const;
export type ScopedBlockerCategory = (typeof SCOPED_BLOCKER_CATEGORIES)[number];

export const SCOPED_BLOCKER_STATUSES = [
  'remaining-blocked',
  'resolved-by-retained-evidence',
] as const;
export type ScopedBlockerStatus = (typeof SCOPED_BLOCKER_STATUSES)[number];

export const ScopedBlockerRecordSchema = z.object({
  blockerId: z.string().min(1),
  auditId: z.string().min(1),
  candidateId: z.string().min(1),
  displayName: z.string().min(1),
  category: z.string().min(1),
  claimIds: z.array(z.string().min(1)),
  sourceIds: z.array(z.string().min(1)),
  blockerCategory: z.enum(SCOPED_BLOCKER_CATEGORIES),
  blockingRule: z.string().min(1),
  issue: z.string().min(1),
  machineRemediable: z.boolean(),
  requiresNewEvidence: z.boolean(),
  requiresHumanDecision: z.boolean(),
  retainedEvidenceStatus: z.enum(['present', 'absent', 'not-applicable']),
  remediationAttempt: z.string().min(1),
  finalStatus: z.enum(SCOPED_BLOCKER_STATUSES),
  isNeutralGap: z.boolean(),
});
export type ScopedBlockerRecord = z.infer<typeof ScopedBlockerRecordSchema>;

export const ScopedBlockerAnalysisSchema = z.object({
  reportId: z.literal('zuoying-mayoral-blocker-analysis'),
  datasetId: z.literal('kaohsiung-2026-zuoying-mayoral-enrichment'),
  snapshotDate: DateOnlySchema,
  originalBlockerRowCount: z.number().int().nonnegative(),
  affectedAuditCount: z.number().int().nonnegative(),
  blockers: z.array(ScopedBlockerRecordSchema),
  summary: z.object({
    byCategory: z.record(z.string(), z.number().int().nonnegative()),
    byStatus: z.record(z.string(), z.number().int().nonnegative()),
    machineRemediated: z.number().int().nonnegative(),
    remainingBlocked: z.number().int().nonnegative(),
    neutralGaps: z.number().int().nonnegative(),
  }),
  note: z.string().min(1),
});
export type ScopedBlockerAnalysis = z.infer<typeof ScopedBlockerAnalysisSchema>;

export const ScopedVerificationRecordSchema = z.object({
  verificationId: z.string().min(1),
  candidateId: z.string().min(1),
  displayName: z.string().min(1),
  candidateGroup: z.enum(['district-4', 'mayoral']),
  category: z.string().min(1),
  claimId: z.string().min(1),
  sourceId: z.string().min(1),
  sourceUrl: z.url(),
  rawPath: z.string().min(1),
  sourceTimestampQuality: z.string().min(1),
  sourceChecksumStatus: z.enum(['unchanged', 'mismatch', 'unavailable']),
  candidateIdentityStatus: z.enum([
    'resolved',
    'ambiguous',
    'conflicted',
    'not-matched',
  ]),
  attributionStatus: z.string().min(1),
  temporalStatus: z.string().min(1),
  evidenceStatus: z.enum(['linked', 'missing']),
  blocked: z.boolean(),
  blockerIds: z.array(z.string().min(1)),
  checks: z.array(z.string().min(1)).min(1),
  result: z.enum(['matches', 'discrepancy', 'insufficient']),
  discrepancy: z.string().nullable(),
  verifiedAt: IsoTimestampSchema,
});
export type ScopedVerificationRecord = z.infer<
  typeof ScopedVerificationRecordSchema
>;

export const ScopedVerificationReportSchema = z.object({
  reportId: z.literal('zuoying-mayoral-independent-verification'),
  datasetId: z.literal('kaohsiung-2026-zuoying-mayoral-enrichment'),
  snapshotDate: DateOnlySchema,
  method: z.string().min(1),
  samples: z.array(ScopedVerificationRecordSchema).min(1),
  summary: z.object({
    sampleCount: z.number().int().nonnegative(),
    matching: z.number().int().nonnegative(),
    discrepancies: z.number().int().nonnegative(),
    insufficient: z.number().int().nonnegative(),
    categories: z.array(z.string().min(1)),
    candidateGroups: z.array(z.string().min(1)),
    timestampQualities: z.array(z.string().min(1)),
    blockedSamples: z.number().int().nonnegative(),
  }),
  note: z.string().min(1),
});
export type ScopedVerificationReport = z.infer<
  typeof ScopedVerificationReportSchema
>;

export const ScopedReviewQueueItemSchema = z.object({
  reviewItemId: z.string().min(1),
  itemType: z.enum(['claim', 'coverage-gap']),
  candidateId: z.string().min(1),
  displayName: z.string().min(1),
  electionType: z.enum(['mayoral', 'city-council']),
  districtId: z.string().min(1),
  category: z.string().min(1),
  claimId: z.string().nullable(),
  claimWording: z.string().nullable(),
  attribution: z.string().nullable(),
  sourceIds: z.array(z.string().min(1)),
  sourceUrls: z.array(z.url()),
  evidenceExcerpt: z.string().nullable(),
  temporalStatus: z.string().min(1),
  identityStatus: z.string().min(1),
  readiness: z.enum([
    'ready-for-human-review',
    'blocked',
    'requires-additional-evidence',
  ]),
  blockingIssues: z.array(z.string()),
  blockerIds: z.array(z.string().min(1)),
  suggestedDisposition: z.enum([
    'review-and-approve-if-supported',
    'request-additional-evidence',
    'keep-withheld',
  ]),
  reviewStatus: z.literal('pending-human-review'),
});
export type ScopedReviewQueueItem = z.infer<typeof ScopedReviewQueueItemSchema>;

export const ScopedReviewQueueReportSchema = z.object({
  reportId: z.literal('zuoying-mayoral-review-queue'),
  datasetId: z.literal('kaohsiung-2026-zuoying-mayoral-enrichment'),
  snapshotDate: DateOnlySchema,
  items: z.array(ScopedReviewQueueItemSchema),
  summary: z.object({
    claimItems: z.number().int().nonnegative(),
    coverageGapItems: z.number().int().nonnegative(),
    readyForHumanReview: z.number().int().nonnegative(),
    blocked: z.number().int().nonnegative(),
    requiresAdditionalEvidence: z.number().int().nonnegative(),
    reviewerIds: z.array(z.string()),
  }),
  note: z.string().min(1),
});
export type ScopedReviewQueueReport = z.infer<
  typeof ScopedReviewQueueReportSchema
>;

export const ScopedCandidateReadinessSchema = z.object({
  candidateId: z.string().min(1),
  displayName: z.string().min(1),
  electionType: z.enum(['mayoral', 'city-council']),
  districtId: z.string().min(1),
  totalClaims: z.number().int().nonnegative(),
  verifiedSourceClaims: z.number().int().nonnegative(),
  releaseReadyClaims: z.number().int().nonnegative(),
  blockedClaims: z.number().int().nonnegative(),
  humanReviewedClaims: z.literal(0),
  editoriallyApprovedClaims: z.literal(0),
  publishedClaims: z.literal(0),
  missingCategories: z.array(z.string().min(1)),
});
export type ScopedCandidateReadiness = z.infer<
  typeof ScopedCandidateReadinessSchema
>;

export const ScopedPublicationReadinessSchema = z.object({
  reportId: z.literal('zuoying-mayoral-publication-readiness'),
  datasetId: z.literal('kaohsiung-2026-zuoying-mayoral-enrichment'),
  snapshotDate: DateOnlySchema,
  candidates: z.array(ScopedCandidateReadinessSchema).length(17),
  categoryMatrix: z.array(
    z.object({
      candidateId: z.string().min(1),
      category: z.string().min(1),
      claimCount: z.number().int().nonnegative(),
      releaseReadyClaimCount: z.number().int().nonnegative(),
      blocked: z.boolean(),
      status: z.enum(['claims', 'neutral-gap', 'blocked']),
    }),
  ),
  summary: z.object({
    totalClaims: z.number().int().nonnegative(),
    verifiedSourceClaims: z.number().int().nonnegative(),
    releaseReadyClaims: z.number().int().nonnegative(),
    blockedClaims: z.number().int().nonnegative(),
    humanReviewedClaims: z.literal(0),
    editoriallyApprovedClaims: z.literal(0),
    publishedClaims: z.literal(0),
  }),
  note: z.string().min(1),
});
export type ScopedPublicationReadiness = z.infer<
  typeof ScopedPublicationReadinessSchema
>;

export const ScopedPublicationGateEntrySchema = z.object({
  claimId: z.string().min(1),
  candidateId: z.string().min(1),
  eligible: z.boolean(),
  blockers: z.array(z.string()),
  duplicateGroupIds: z.array(z.string()),
});
export type ScopedPublicationGateEntry = z.infer<
  typeof ScopedPublicationGateEntrySchema
>;

export const ScopedPublicationGateReportSchema = z.object({
  gateId: z.literal(
    'kaohsiung-2026-zuoying-mayoral-enrichment-publication-gate',
  ),
  datasetId: z.literal('kaohsiung-2026-zuoying-mayoral-enrichment'),
  snapshotDate: DateOnlySchema,
  totalClaims: z.number().int().nonnegative(),
  eligibleClaims: z.number().int().nonnegative(),
  blockedClaims: z.number().int().nonnegative(),
  entries: z.array(ScopedPublicationGateEntrySchema),
  blockerCounts: z.record(z.string(), z.number().int().nonnegative()),
  reviewerIds: z.array(z.string()),
  note: z.string().min(1),
});
export type ScopedPublicationGateReport = z.infer<
  typeof ScopedPublicationGateReportSchema
>;

export const ScopedPublishedRecordSchema = z.object({
  presentationKey: z.string().min(1),
  claimIds: z.array(z.string().min(1)).min(1),
  candidateId: z.string().min(1),
  category: z.string().min(1),
  claimType: z.string().min(1),
  title: z.string().min(1),
  organization: z.string().nullable(),
  value: z.string().min(1),
  sourcePublicationDate: z.string().nullable(),
  validFrom: z.string().nullable(),
  validTo: z.string().nullable(),
  temporalPrecision: z.string().min(1),
  currentStatus: z.string().min(1),
  attribution: z.string().min(1),
  sourceDependency: z.string().min(1),
  sourceIds: z.array(z.string().min(1)).min(1),
  sourceUrls: z.array(z.url()).min(1),
  evidenceIds: z.array(z.string().min(1)).min(1),
});
export type ScopedPublishedRecord = z.infer<typeof ScopedPublishedRecordSchema>;

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function blockerCategory(issue: string): ScopedBlockerCategory {
  if (issue.includes('中性缺口')) return 'coverage-gap';
  if (issue.includes('議事／行政')) return 'missing-public-record-evidence';
  if (issue.includes('公共關係')) return 'sensitive-relationship-evidence';
  if (issue.includes('候選人自述')) return 'candidate-attribution';
  if (issue.includes('currentness')) return 'currentness';
  return 'other';
}

function blockerRule(category: ScopedBlockerCategory): string {
  switch (category) {
    case 'coverage-gap':
      return 'No candidate-specific retained evidence may be treated as proof of absence.';
    case 'missing-public-record-evidence':
      return 'Public activity or administrative outcome requires a directly reopenable institutional record.';
    case 'sensitive-relationship-evidence':
      return 'A public relationship requires a direct, relevant source; do not infer private relationships.';
    case 'candidate-attribution':
      return 'Candidate statements must remain attributed and require human scope confirmation.';
    case 'currentness':
      return 'A current-position claim needs a current source version or explicit human temporal review.';
    default:
      return 'Unclassified blocker requires human review before publication.';
  }
}

function hasEvidenceForAudit(audit: EnrichmentAudit): boolean {
  return audit.claimIds.length > 0 && audit.evidenceIds.length > 0;
}

export function classifyScopedBlocker(
  audit: EnrichmentAudit,
  issue: string,
  index: number,
): ScopedBlockerRecord {
  const category = blockerCategory(issue);
  const hasEvidence = hasEvidenceForAudit(audit);
  const requiresNewEvidence = [
    'coverage-gap',
    'missing-public-record-evidence',
    'sensitive-relationship-evidence',
    'currentness',
  ].includes(category);
  return {
    blockerId: `enrich-blocker-${audit.auditId}-${String(index + 1).padStart(2, '0')}`,
    auditId: audit.auditId,
    candidateId: audit.candidateId,
    displayName: audit.displayName,
    category: audit.category,
    claimIds: [...audit.claimIds],
    sourceIds: [...audit.sourceIds],
    blockerCategory: category,
    blockingRule: blockerRule(category),
    issue,
    machineRemediable: false,
    requiresNewEvidence,
    requiresHumanDecision: true,
    retainedEvidenceStatus: hasEvidence
      ? 'present'
      : category === 'coverage-gap' ||
          category === 'missing-public-record-evidence' ||
          category === 'sensitive-relationship-evidence'
        ? 'absent'
        : 'not-applicable',
    remediationAttempt:
      category === 'coverage-gap'
        ? 'Reopened the retained source index and checksum set; no candidate-specific source was retained, and no absence inference or runtime retrieval was performed.'
        : category === 'currentness'
          ? 'Reopened the retained source and confirmed its checksum; the capture has no source-header date, so currentness was not inferred from capture-file mtime.'
          : category === 'candidate-attribution'
            ? 'Reopened the retained excerpt and preserved candidate-statement/self-reported attribution; no human attribution approval was inferred.'
            : 'Reopened the retained source/checksum set; no additional directly relevant evidence was present, so the issue remains withheld.',
    finalStatus: 'remaining-blocked',
    isNeutralGap: category === 'coverage-gap',
  };
}

export function buildScopedBlockerAnalysis(
  dataset: EnrichmentDataset,
): ScopedBlockerAnalysis {
  const blockers = dataset.audits.flatMap((audit) =>
    audit.blockers.map((issue, index) =>
      classifyScopedBlocker(audit, issue, index),
    ),
  );
  const byCategory: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  for (const item of blockers) {
    byCategory[item.blockerCategory] =
      (byCategory[item.blockerCategory] ?? 0) + 1;
    byStatus[item.finalStatus] = (byStatus[item.finalStatus] ?? 0) + 1;
  }
  return {
    reportId: 'zuoying-mayoral-blocker-analysis',
    datasetId: dataset.datasetId,
    snapshotDate: dataset.snapshotDate,
    originalBlockerRowCount: blockers.length,
    affectedAuditCount: new Set(blockers.map((item) => item.auditId)).size,
    blockers,
    summary: {
      byCategory,
      byStatus,
      machineRemediated: blockers.filter(
        (item) => item.finalStatus === 'resolved-by-retained-evidence',
      ).length,
      remainingBlocked: blockers.filter(
        (item) => item.finalStatus === 'remaining-blocked',
      ).length,
      neutralGaps: blockers.filter((item) => item.isNeutralGap).length,
    },
    note: 'Blocker rows are preserved individually. Multiple rows may belong to one audit or claim; a neutral gap never means that the underlying fact does not exist.',
  };
}

function sourceAttemptsById(
  sourceAttempts: EnrichmentSourceAttempt[],
): Map<string, EnrichmentSourceAttempt> {
  const result = new Map<string, EnrichmentSourceAttempt>();
  for (const source of sourceAttempts) {
    if (!result.has(source.sourceId)) result.set(source.sourceId, source);
  }
  return result;
}

function blockersByClaim(
  blockers: ScopedBlockerRecord[],
): Map<string, ScopedBlockerRecord[]> {
  const result = new Map<string, ScopedBlockerRecord[]>();
  for (const blocker of blockers) {
    for (const claimId of blocker.claimIds) {
      const existing = result.get(claimId) ?? [];
      existing.push(blocker);
      result.set(claimId, existing);
    }
  }
  return result;
}

function candidateSnapshot(
  packet: EnrichmentReviewPacket,
  candidateId: string,
): EnrichmentReviewPacket['candidates'][number] {
  const candidate = packet.candidates.find(
    (item) => item.candidateId === candidateId,
  );
  if (!candidate)
    throw new Error(`Missing scoped candidate snapshot ${candidateId}.`);
  return candidate;
}

export function buildScopedReviewQueue(
  dataset: EnrichmentDataset,
  packet: EnrichmentReviewPacket,
  blockerAnalysis: ScopedBlockerAnalysis,
): ScopedReviewQueueReport {
  const sources = sourceAttemptsById(dataset.sourceAttempts);
  const claimBlockers = blockersByClaim(blockerAnalysis.blockers);
  const items: ScopedReviewQueueItem[] = dataset.claims.map((claim) => {
    const candidate = candidateSnapshot(packet, claim.candidateId);
    const evidence = dataset.evidence.find(
      (item) => item.claimId === claim.claimId,
    );
    const observations = claim.identityObservationIds.map((id) =>
      dataset.observations.find((item) => item.observationId === id),
    );
    const blockers = claimBlockers.get(claim.claimId) ?? [];
    const sourceRecords = claim.sourceIds
      .map((sourceId) => sources.get(sourceId))
      .filter((item): item is EnrichmentSourceAttempt => Boolean(item));
    const sourceChecks = new Map(
      dataset.sourceChecks.map((item) => [item.sourceId, item]),
    );
    const sourceIntegrity = claim.sourceIds.every(
      (sourceId) => sourceChecks.get(sourceId)?.status === 'unchanged',
    );
    const identityResolved = observations.every(
      (item) => item?.identityStatus === 'resolved',
    );
    const additionalEvidence = blockers.some(
      (item) => item.requiresNewEvidence,
    );
    const readiness = additionalEvidence
      ? 'requires-additional-evidence'
      : blockers.length > 0 || !sourceIntegrity || !identityResolved
        ? 'blocked'
        : 'ready-for-human-review';
    const suggestedDisposition =
      readiness === 'requires-additional-evidence'
        ? 'request-additional-evidence'
        : readiness === 'blocked'
          ? 'keep-withheld'
          : 'review-and-approve-if-supported';
    return {
      reviewItemId: `scoped-claim-${claim.claimId}`,
      itemType: 'claim',
      candidateId: candidate.candidateId,
      displayName: candidate.displayName,
      electionType: candidate.electionType,
      districtId: candidate.districtId,
      category: claim.category,
      claimId: claim.claimId,
      claimWording: `${claim.title}：${claim.value}`,
      attribution: claim.attribution,
      sourceIds: [...claim.sourceIds],
      sourceUrls: unique(sourceRecords.map((item) => item.url)),
      evidenceExcerpt: evidence?.excerpt ?? null,
      temporalStatus: `${claim.currentStatus}/${claim.temporalPrecision}/${claim.validFrom ?? 'date-unknown'}—${claim.validTo ?? 'date-unknown'}`,
      identityStatus: identityResolved ? 'resolved' : 'needs-review',
      readiness,
      blockingIssues: blockers.map((item) => item.issue),
      blockerIds: blockers.map((item) => item.blockerId),
      suggestedDisposition,
      reviewStatus: 'pending-human-review',
    };
  });
  const claimAuditKeys = new Set(
    dataset.audits.flatMap((audit) => audit.claimIds),
  );
  const coverageItems = dataset.audits
    .filter((audit) => audit.claimIds.length === 0)
    .map((audit) => {
      const candidate = candidateSnapshot(packet, audit.candidateId);
      const blockers = blockerAnalysis.blockers.filter(
        (item) => item.auditId === audit.auditId,
      );
      const sourceRecords = audit.sourceIds
        .map((sourceId) => sources.get(sourceId))
        .filter((item): item is EnrichmentSourceAttempt => Boolean(item));
      return {
        reviewItemId: `scoped-gap-${audit.auditId}`,
        itemType: 'coverage-gap' as const,
        candidateId: candidate.candidateId,
        displayName: candidate.displayName,
        electionType: candidate.electionType,
        districtId: candidate.districtId,
        category: audit.category,
        claimId: null,
        claimWording: null,
        attribution: null,
        sourceIds: [...audit.sourceIds],
        sourceUrls: unique(sourceRecords.map((item) => item.url)),
        evidenceExcerpt: null,
        temporalStatus: 'unknown/no-claim',
        identityStatus: audit.identityStatus,
        readiness: blockers.some((item) => item.requiresNewEvidence)
          ? ('requires-additional-evidence' as const)
          : ('blocked' as const),
        blockingIssues: blockers.map((item) => item.issue),
        blockerIds: blockers.map((item) => item.blockerId),
        suggestedDisposition: 'request-additional-evidence' as const,
        reviewStatus: 'pending-human-review' as const,
      };
    });
  if (claimAuditKeys.size !== dataset.claims.length)
    throw new Error(
      'Every scoped claim must belong to an audit before queue generation.',
    );
  const allItems = [...items, ...coverageItems];
  return {
    reportId: 'zuoying-mayoral-review-queue',
    datasetId: dataset.datasetId,
    snapshotDate: dataset.snapshotDate,
    items: allItems,
    summary: {
      claimItems: items.length,
      coverageGapItems: coverageItems.length,
      readyForHumanReview: allItems.filter(
        (item) => item.readiness === 'ready-for-human-review',
      ).length,
      blocked: allItems.filter((item) => item.readiness === 'blocked').length,
      requiresAdditionalEvidence: allItems.filter(
        (item) => item.readiness === 'requires-additional-evidence',
      ).length,
      reviewerIds: [],
    },
    note: 'This queue is a local review aid. It contains pending claims and neutral gaps, never decisions or publication authorization.',
  };
}

export function buildScopedPublicationReadiness(
  dataset: EnrichmentDataset,
  packet: EnrichmentReviewPacket,
  queue: ScopedReviewQueueReport,
): ScopedPublicationReadiness {
  const claimItems = new Map(
    queue.items
      .filter((item) => item.itemType === 'claim' && item.claimId)
      .map((item) => [item.claimId as string, item]),
  );
  const candidates = packet.candidates.map((candidate) => {
    const audits = dataset.audits.filter(
      (audit) => audit.candidateId === candidate.candidateId,
    );
    const claims = dataset.claims.filter(
      (claim) => claim.candidateId === candidate.candidateId,
    );
    const queueClaims = claims.map((claim) => claimItems.get(claim.claimId));
    const missingCategories = audits
      .filter((audit) => audit.claimIds.length === 0)
      .map((audit) => audit.category);
    return {
      candidateId: candidate.candidateId,
      displayName: candidate.displayName,
      electionType: candidate.electionType,
      districtId: candidate.districtId,
      totalClaims: claims.length,
      verifiedSourceClaims: claims.filter(
        (claim) => claim.evidenceIds.length > 0 && claim.sourceIds.length > 0,
      ).length,
      releaseReadyClaims: queueClaims.filter(
        (item) => item?.readiness === 'ready-for-human-review',
      ).length,
      blockedClaims: queueClaims.filter(
        (item) => item?.readiness !== 'ready-for-human-review',
      ).length,
      humanReviewedClaims: 0 as const,
      editoriallyApprovedClaims: 0 as const,
      publishedClaims: 0 as const,
      missingCategories: unique(missingCategories),
    };
  });
  const categoryMatrix = packet.candidates.flatMap((candidate) =>
    dataset.categories.map((category) => {
      const claims = dataset.claims.filter(
        (claim) =>
          claim.candidateId === candidate.candidateId &&
          claim.category === category,
      );
      const ready = claims.filter(
        (claim) =>
          claimItems.get(claim.claimId)?.readiness === 'ready-for-human-review',
      ).length;
      return {
        candidateId: candidate.candidateId,
        category,
        claimCount: claims.length,
        releaseReadyClaimCount: ready,
        blocked: claims.some(
          (claim) =>
            claimItems.get(claim.claimId)?.readiness !==
            'ready-for-human-review',
        ),
        status:
          claims.length === 0
            ? ('neutral-gap' as const)
            : claims.some(
                  (claim) =>
                    claimItems.get(claim.claimId)?.readiness !==
                    'ready-for-human-review',
                )
              ? ('blocked' as const)
              : ('claims' as const),
      };
    }),
  );
  const allClaims = dataset.claims;
  return {
    reportId: 'zuoying-mayoral-publication-readiness',
    datasetId: dataset.datasetId,
    snapshotDate: dataset.snapshotDate,
    candidates,
    categoryMatrix,
    summary: {
      totalClaims: allClaims.length,
      verifiedSourceClaims: allClaims.filter(
        (claim) => claim.evidenceIds.length > 0 && claim.sourceIds.length > 0,
      ).length,
      releaseReadyClaims: queue.summary.readyForHumanReview,
      blockedClaims:
        queue.summary.blocked + queue.summary.requiresAdditionalEvidence,
      humanReviewedClaims: 0,
      editoriallyApprovedClaims: 0,
      publishedClaims: 0,
    },
    note: 'Ready-for-human-review is a machine readiness state, not an approval or publication state. Neutral category gaps do not imply absence.',
  };
}

function activeDecisions(
  decisions: EditorialDecision[],
): Map<string, EditorialDecision> {
  const superseded = new Set(
    decisions
      .map((decision) => decision.supersedesDecisionId)
      .filter((id): id is string => Boolean(id)),
  );
  return new Map(
    decisions
      .filter((decision) => !superseded.has(decision.decisionId))
      .map((decision) => [
        `${decision.subjectType}:${decision.subjectId}`,
        decision,
      ]),
  );
}

function addBlocker(
  blockers: string[],
  counts: Record<string, number>,
  code: string,
): void {
  blockers.push(code);
  counts[code] = (counts[code] ?? 0) + 1;
}

export function evaluateScopedEnrichmentPublicationGate(
  dataset: EnrichmentDataset,
  decisions: EditorialDecision[],
  registry: ReviewerRegistry,
): ScopedPublicationGateReport {
  const parsedDecisions = decisions.map((decision) =>
    EditorialDecisionSchema.parse(decision),
  );
  const active = activeDecisions(parsedDecisions);
  const sourceChecks = new Map(
    dataset.sourceChecks.map((item) => [item.sourceId, item]),
  );
  const sourceAttempts = sourceAttemptsById(dataset.sourceAttempts);
  const evidenceById = new Map(
    dataset.evidence.map((item) => [item.evidenceId, item]),
  );
  const observationsById = new Map(
    dataset.observations.map((item) => [item.observationId, item]),
  );
  const duplicateGroups = new Map<string, string[]>();
  for (const group of dataset.duplicateGroups) {
    for (const claimId of group.claimIds) {
      const current = duplicateGroups.get(claimId) ?? [];
      current.push(group.groupId);
      duplicateGroups.set(claimId, current);
    }
  }
  const blockerCounts: Record<string, number> = {};
  const reviewerIds = unique(
    parsedDecisions.map((decision) => decision.reviewerId),
  );
  const entries = dataset.claims.map((claim) => {
    const blockers: string[] = [];
    const claimDecision = active.get(`claim:${claim.claimId}`);
    const identityDecision = active.get(
      `identity:candidate:${claim.candidateId}`,
    );
    const claimReviewer = claimDecision
      ? registry.reviewers.find(
          (reviewer) => reviewer.reviewerId === claimDecision.reviewerId,
        )
      : undefined;
    const identityReviewer = identityDecision
      ? registry.reviewers.find(
          (reviewer) => reviewer.reviewerId === identityDecision.reviewerId,
        )
      : undefined;
    if (
      claimDecision?.decision !== 'approve' ||
      claimDecision?.resultingState !== 'approved'
    )
      addBlocker(blockers, blockerCounts, 'missing-claim-approval');
    if (!claimDecision?.confirmation)
      addBlocker(
        blockers,
        blockerCounts,
        'missing-explicit-claim-confirmation',
      );
    if (
      !claimReviewer?.active ||
      !claimReviewer.authorizedActions.includes('editorial-approval')
    )
      addBlocker(blockers, blockerCounts, 'unauthorized-claim-reviewer');
    if (
      identityDecision?.decision !== 'confirm-same' ||
      identityDecision?.resultingState !== 'approved'
    )
      addBlocker(blockers, blockerCounts, 'missing-identity-confirmation');
    if (!identityDecision?.confirmation)
      addBlocker(
        blockers,
        blockerCounts,
        'missing-explicit-identity-confirmation',
      );
    if (
      !identityReviewer?.active ||
      !identityReviewer.authorizedActions.includes('identity-review')
    )
      addBlocker(blockers, blockerCounts, 'unauthorized-identity-reviewer');
    if (claim.machineStatus !== 'machine-validated')
      addBlocker(blockers, blockerCounts, 'machine-validation-not-passed');
    const evidenceValid = claim.evidenceIds.every((evidenceId) => {
      const evidence = evidenceById.get(evidenceId);
      return (
        evidence?.claimId === claim.claimId && evidence.supportType === 'direct'
      );
    });
    if (!evidenceValid)
      addBlocker(blockers, blockerCounts, 'missing-direct-evidence');
    const identityValid = claim.identityObservationIds.every(
      (observationId) => {
        const observation = observationsById.get(observationId);
        return (
          observation?.identityStatus === 'resolved' &&
          observation.candidateIds.includes(claim.candidateId)
        );
      },
    );
    if (!identityValid)
      addBlocker(blockers, blockerCounts, 'unresolved-identity-observation');
    for (const sourceId of claim.sourceIds) {
      const source = sourceAttempts.get(sourceId);
      const check = sourceChecks.get(sourceId);
      if (
        !source ||
        !check ||
        check.status !== 'unchanged' ||
        source.sha256 !== check.actualSha256
      )
        addBlocker(blockers, blockerCounts, 'stale-or-missing-source-version');
      const decisionVersion = claimDecision?.evidenceVersions.find(
        (item) => item.sourceId === sourceId,
      );
      if (!decisionVersion || decisionVersion.sha256 !== source?.sha256)
        addBlocker(
          blockers,
          blockerCounts,
          'approval-does-not-cover-current-source',
        );
    }
    if (
      claim.attribution === 'candidate-statement' &&
      claim.sourceDependency !== 'self-reported'
    )
      addBlocker(blockers, blockerCounts, 'candidate-attribution-mismatch');
    if (
      claim.claimType === 'administrative-outcome' &&
      new Set(claim.sourceIds).size < 2
    )
      addBlocker(
        blockers,
        blockerCounts,
        'administrative-outcome-needs-independent-evidence',
      );
    const duplicateGroupIds = duplicateGroups.get(claim.claimId) ?? [];
    return {
      claimId: claim.claimId,
      candidateId: claim.candidateId,
      eligible: blockers.length === 0,
      blockers: unique(blockers),
      duplicateGroupIds,
    };
  });
  return {
    gateId: 'kaohsiung-2026-zuoying-mayoral-enrichment-publication-gate',
    datasetId: dataset.datasetId,
    snapshotDate: dataset.snapshotDate,
    totalClaims: entries.length,
    eligibleClaims: entries.filter((entry) => entry.eligible).length,
    blockedClaims: entries.filter((entry) => !entry.eligible).length,
    entries,
    blockerCounts,
    reviewerIds,
    note: 'Scoped publication uses the existing reviewer registry and decision shape through a governed adapter. It never changes the Biography publication gate or publishes normalized/review data directly.',
  };
}

function normalizePresentation(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

export function buildScopedPublishedRecords(
  dataset: EnrichmentDataset,
  gate: ScopedPublicationGateReport,
): ScopedPublishedRecord[] {
  const eligible = new Set(
    gate.entries
      .filter((entry) => entry.eligible)
      .map((entry) => entry.claimId),
  );
  const sourceAttempts = sourceAttemptsById(dataset.sourceAttempts);
  const grouped = new Map<string, ScopedPublishedRecord>();
  for (const claim of dataset.claims) {
    if (!eligible.has(claim.claimId)) continue;
    const sourceUrls = unique(
      claim.sourceIds
        .map((sourceId) => sourceAttempts.get(sourceId)?.url)
        .filter((url): url is string => Boolean(url)),
    );
    const presentationKey = [
      claim.candidateId,
      claim.category,
      normalizePresentation(claim.title),
      normalizePresentation(claim.value),
    ].join('|');
    const existing = grouped.get(presentationKey);
    if (existing) {
      existing.claimIds = unique([...existing.claimIds, claim.claimId]);
      existing.sourceIds = unique([...existing.sourceIds, ...claim.sourceIds]);
      existing.sourceUrls = unique([...existing.sourceUrls, ...sourceUrls]);
      existing.evidenceIds = unique([
        ...existing.evidenceIds,
        ...claim.evidenceIds,
      ]);
      continue;
    }
    grouped.set(presentationKey, {
      presentationKey,
      claimIds: [claim.claimId],
      candidateId: claim.candidateId,
      category: claim.category,
      claimType: claim.claimType,
      title: claim.title,
      organization: claim.organization,
      value: claim.value,
      sourcePublicationDate: claim.sourcePublicationDate,
      validFrom: claim.validFrom,
      validTo: claim.validTo,
      temporalPrecision: claim.temporalPrecision,
      currentStatus: claim.currentStatus,
      attribution: claim.attribution,
      sourceDependency: claim.sourceDependency,
      sourceIds: [...claim.sourceIds],
      sourceUrls,
      evidenceIds: [...claim.evidenceIds],
    });
  }
  return [...grouped.values()];
}

export function scopedCategoryToProfileTab(
  category: EnrichmentCategory,
): 'basic' | 'policies' | 'news' | 'career' {
  switch (category) {
    case 'policies':
      return 'policies';
    case 'news':
      return 'news';
    case 'public-records':
    case 'relationships':
    case 'timeline':
      return 'career';
    default:
      return 'basic';
  }
}

export function validateScopedBlockerAnalysis(
  input: unknown,
): ScopedBlockerAnalysis {
  return ScopedBlockerAnalysisSchema.parse(input);
}
export function validateScopedVerificationReport(
  input: unknown,
): ScopedVerificationReport {
  return ScopedVerificationReportSchema.parse(input);
}
export function validateScopedReviewQueue(
  input: unknown,
): ScopedReviewQueueReport {
  return ScopedReviewQueueReportSchema.parse(input);
}
export function validateScopedPublicationReadiness(
  input: unknown,
): ScopedPublicationReadiness {
  return ScopedPublicationReadinessSchema.parse(input);
}
export function validateScopedPublicationGateReport(
  input: unknown,
): ScopedPublicationGateReport {
  return ScopedPublicationGateReportSchema.parse(input);
}
