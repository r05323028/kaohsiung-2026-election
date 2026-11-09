import datasetInput from '../../../data/policy-research/2026/full-roster.json';
import {
  type PolicyResearchDataset,
  validatePolicyResearchDataset,
} from './schema';

export const policyResearchDataset: PolicyResearchDataset =
  validatePolicyResearchDataset(datasetInput);

export type { PolicyResearchDataset };
export { validatePolicyResearchDataset };
