import summaryInput from '../../../data/public-records/research-enrichment/2026/summary.json';
import {
  type PublicRecordsEnrichmentSummary,
  validatePublicRecordsEnrichmentSummary,
} from './enrichment-summary-schema';

// Production imports use this summary-only artifact; full research remains script/test data.
export const publicRecordsEnrichmentSummary: PublicRecordsEnrichmentSummary =
  validatePublicRecordsEnrichmentSummary(summaryInput);

export type CandidatePublicRecordResearchSummary =
  PublicRecordsEnrichmentSummary['audits'][number];

const auditByCandidate = new Map(
  publicRecordsEnrichmentSummary.audits.map((audit) => [
    audit.candidateId,
    audit,
  ]),
);

export function getCandidatePublicRecordResearchSummary(
  candidateId: string,
): CandidatePublicRecordResearchSummary | undefined {
  return auditByCandidate.get(candidateId);
}

export type { PublicRecordsEnrichmentSummary };
