import datasetInput from '../../../data/policy-research/2026/full-roster.json';
import {
  type CandidatePolicyOutcome,
  type PolicyResearchDataset,
  validatePolicyResearchDataset,
} from './schema';

export const policyResearchDataset: PolicyResearchDataset =
  validatePolicyResearchDataset(datasetInput);

export type CandidatePolicyResearchSummary = {
  outcome: CandidatePolicyOutcome;
  researchStatus: 'completed' | 'blocked' | 'identity-unresolved';
  policyCount: number;
  publishedPolicyCount: number;
  note: string;
};

const auditByCandidate = new Map(
  policyResearchDataset.audits.map((audit) => [audit.candidateId, audit]),
);

export function getCandidatePolicyResearchSummary(
  candidateId: string,
): CandidatePolicyResearchSummary | undefined {
  const audit = auditByCandidate.get(candidateId);
  if (!audit) return undefined;
  return {
    outcome: audit.outcome,
    researchStatus: audit.researchStatus,
    policyCount: audit.policyIds.length,
    publishedPolicyCount: 0,
    note: audit.note,
  };
}

export type { PolicyResearchDataset };
export { validatePolicyResearchDataset };
