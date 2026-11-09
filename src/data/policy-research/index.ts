import summaryInput from '../../../data/policy-research/2026/summary.json';
import {
  type PolicyResearchSummary,
  validatePolicyResearchSummary,
} from './summary-schema';

// Production imports use this summary-only artifact; full research remains script/test data.
export const policyResearchSummary: PolicyResearchSummary =
  validatePolicyResearchSummary(summaryInput);

export type CandidatePolicyResearchSummary = {
  outcome: PolicyResearchSummary['audits'][number]['outcome'];
  researchStatus: PolicyResearchSummary['audits'][number]['researchStatus'];
  policyCount: number;
  publishedPolicyCount: number;
  note: string;
};

const auditByCandidate = new Map(
  policyResearchSummary.audits.map((audit) => [audit.candidateId, audit]),
);

export function getCandidatePolicyResearchSummary(
  candidateId: string,
): CandidatePolicyResearchSummary | undefined {
  const audit = auditByCandidate.get(candidateId);
  if (!audit) return undefined;
  return {
    outcome: audit.outcome,
    researchStatus: audit.researchStatus,
    policyCount: audit.policyCount,
    publishedPolicyCount: audit.publishedPolicyCount,
    note: audit.note,
  };
}

export type { PolicyResearchSummary };
