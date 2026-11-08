import approvedResearchInput from '../../../data/approved/2026/candidate-public-record-research.json';
import approvedRosterInput from '../../../data/approved/2026/kaohsiung-election.json';
import manifestInput from '../../../data/official-source-manifest.json';
import {
  type OfficialDataset,
  validateOfficialDataset,
} from '../official/schema';
import {
  PUBLIC_RECORD_CATEGORIES,
  type ResearchCategory,
  type ResearchDataset,
  type ResearchResultStatus,
  type ResearchReviewStatus,
  type ResearchSourceSnapshot,
  validateResearchDataset,
} from './research';

type SourceManifest = { sources: Array<{ id: string }> };

const roster: OfficialDataset = validateOfficialDataset(approvedRosterInput);
const manifest = manifestInput as SourceManifest;
const manifestSourceIds = new Set(manifest.sources.map((source) => source.id));

export const candidateResearchDataset: ResearchDataset =
  validateResearchDataset(approvedResearchInput, roster, manifestSourceIds);

export type CandidateResearchCategorySummary = {
  discoveryStatus: string;
  retrievalStatus: string;
  resultStatus: ResearchResultStatus;
  reviewStatus: ResearchReviewStatus;
  publicationStatus: string;
  claimCount: number;
  evidenceCount: number;
  sourceIds: string[];
};

export type CandidateResearchSummary = {
  snapshotDate: string;
  reviewStatus: 'pending-human-review';
  identityStatus: 'roster-verified' | 'conflicted';
  categoryAudits: Record<ResearchCategory, CandidateResearchCategorySummary>;
  sourceIds: string[];
  attemptedCategoryCount: number;
  retrievedCategoryCount: number;
  claimCount: number;
  evidenceCount: number;
  note: string;
};

const sourceById = new Map<string, ResearchSourceSnapshot>(
  candidateResearchDataset.sources.map((source) => [source.sourceId, source]),
);

function sourceIdsFor(audits: ResearchDataset['audits']): string[] {
  return [
    ...new Set(
      audits.flatMap((audit) => [
        ...audit.sourceConsultedIds,
        ...audit.sourceCandidateIds,
      ]),
    ),
  ].filter((sourceId) => sourceById.has(sourceId));
}

const auditsByCandidate = new Map<string, ResearchDataset['audits']>();
for (const audit of candidateResearchDataset.audits) {
  const audits = auditsByCandidate.get(audit.candidateId) ?? [];
  audits.push(audit);
  auditsByCandidate.set(audit.candidateId, audits);
}

export function getCandidateResearchSummary(
  candidateId: string,
): CandidateResearchSummary | undefined {
  const audits = auditsByCandidate.get(candidateId);
  if (!audits) return undefined;

  const categoryAudits = Object.fromEntries(
    PUBLIC_RECORD_CATEGORIES.map((category) => {
      const audit = audits.find((item) => item.category === category);
      if (!audit)
        throw new Error(
          `Candidate research is missing category ${category} for ${candidateId}.`,
        );
      return [
        category,
        {
          discoveryStatus: audit.discoveryStatus,
          retrievalStatus: audit.retrievalStatus,
          resultStatus: audit.resultStatus,
          reviewStatus: audit.reviewStatus,
          publicationStatus: audit.publicationStatus,
          claimCount: audit.claimIds.length,
          evidenceCount: audit.evidenceIds.length,
          sourceIds: sourceIdsFor([audit]),
        },
      ];
    }),
  ) as Record<ResearchCategory, CandidateResearchCategorySummary>;
  const identityStatus = audits.some(
    (audit) => audit.identityStatus === 'conflicted',
  )
    ? 'conflicted'
    : 'roster-verified';

  return {
    snapshotDate: candidateResearchDataset.snapshotDate,
    reviewStatus: candidateResearchDataset.review.status,
    identityStatus,
    categoryAudits,
    sourceIds: sourceIdsFor(audits),
    attemptedCategoryCount: audits.filter((audit) => audit.attemptedAt !== null)
      .length,
    retrievedCategoryCount: audits.filter(
      (audit) => audit.retrievalStatus === 'retrieved',
    ).length,
    claimCount: audits.reduce((sum, audit) => sum + audit.claimIds.length, 0),
    evidenceCount: audits.reduce(
      (sum, audit) => sum + audit.evidenceIds.length,
      0,
    ),
    note: '研究快照已通過機器參照檢查；人工審查尚未完成。未執行不代表不存在。',
  };
}
