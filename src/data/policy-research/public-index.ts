import raw from '../../../data/published/2026/candidate-policies.json';
import {
  type PublishedPolicy,
  PublishedPolicyDatasetSchema,
} from './published-schema';

const dataset = PublishedPolicyDatasetSchema.parse(raw);

const byCandidate = new Map<string, PublishedPolicy[]>();
for (const policy of dataset.policies) {
  const list = byCandidate.get(policy.candidateId) ?? [];
  list.push(policy);
  byCandidate.set(policy.candidateId, list);
}

export function getPublishedCandidatePolicies(
  candidateId: string,
): PublishedPolicy[] {
  return byCandidate.get(candidateId) ?? [];
}
