import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import rosterInput from '../../../data/approved/2026/kaohsiung-election.json';
import policyResearchInput from '../../../data/policy-research/2026/full-roster.json';
import policySummaryInput from '../../../data/policy-research/2026/summary.json';
import publishedInput from '../../../data/published/2026/candidate-policies.json';
import { getOfficialCandidateProfile } from '../official';
import { validateOfficialDataset } from '../official/schema';
import { validatePublishedPolicyDataset } from './published-schema';
import {
  POLICY_TYPES_BY_CONTEXT,
  type PolicyResearchDataset,
  validatePolicyResearchDataset,
} from './schema';
import { validatePolicyResearchSummary } from './summary-schema';

const dataset: PolicyResearchDataset =
  validatePolicyResearchDataset(policyResearchInput);
const roster = validateOfficialDataset(rosterInput);
const published = validatePublishedPolicyDataset(publishedInput);
const summary = validatePolicyResearchSummary(policySummaryInput);

function normalize(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, '');
}

describe('full-roster policy research', () => {
  it('covers every canonical candidate exactly once', () => {
    expect(dataset.candidateCount).toBe(106);
    expect(dataset.audits).toHaveLength(106);
    expect(new Set(dataset.audits.map((audit) => audit.candidateId)).size).toBe(
      106,
    );
    expect(new Set(roster.candidates.map((candidate) => candidate.id))).toEqual(
      new Set(dataset.audits.map((audit) => audit.candidateId)),
    );
    expect(
      dataset.audits.every((audit) => audit.researchStatus === 'completed'),
    ).toBe(true);
    expect(summary.audits).toHaveLength(106);
  });

  it('keeps policy ids unique and every record independently decided', () => {
    expect(dataset.policies.length).toBeGreaterThan(0);
    expect(
      new Set(dataset.policies.map((policy) => policy.policyId)).size,
    ).toBe(dataset.policies.length);
    expect(
      dataset.policies.every(
        (policy) => policy.verificationStatus === 'machine-validated',
      ),
    ).toBe(true);
    const decided = new Set(dataset.verification.map((item) => item.policyId));
    expect(decided.size).toBe(dataset.verification.length);
    for (const policy of dataset.policies) {
      expect(decided.has(policy.policyId)).toBe(true);
    }
    expect(
      dataset.policies.some((policy) =>
        policy.originalStatement.includes('✅'),
      ),
    ).toBe(false);
  });

  it('publishes only approved, verified, source-backed records', () => {
    for (const policy of dataset.policies) {
      if (policy.publicationStatus !== 'approved-source-backed') continue;
      const decision = dataset.verification.find(
        (item) => item.policyId === policy.policyId,
      );
      const source = dataset.sourceSnapshots.find(
        (item) => item.sourceId === policy.sourceId,
      );
      const evidence = dataset.evidence.find(
        (item) => item.evidenceId === policy.evidenceId,
      );
      expect(policy.reviewStatus).toBe('editorially-approved');
      expect(decision?.decision).toBe('verified');
      expect(decision?.checks.attributionResolved).toBe(true);
      expect(decision?.checks.figuresPreserved).toBe(true);
      expect(source?.retrievalStatus).toBe('retrieved');
      expect(source?.rawPath).toBeTruthy();
      expect(evidence?.quotedText).toBeTruthy();
      const raw = readFileSync(source?.rawPath ?? '', 'utf8');
      expect(normalize(raw)).toContain(normalize(evidence?.quotedText ?? ''));
    }
  });

  it('keeps historical positions separate from 2026 commitments', () => {
    for (const policy of dataset.policies) {
      expect(POLICY_TYPES_BY_CONTEXT[policy.policyContext]).toContain(
        policy.type,
      );
      if (policy.type === 'historical_proposal') {
        expect(policy.policyContext).toBe('historical-position');
      }
      if (policy.policyContext === '2026-election-commitment') {
        expect([2026, null]).toContain(policy.electionYear);
      }
    }
    expect(
      dataset.policies.filter(
        (policy) => policy.policyContext === '2026-election-commitment',
      ).length,
    ).toBeGreaterThan(0);
  });
});

describe('published candidate policy artifact', () => {
  it('loads only published records from the research dataset', () => {
    const publishedIds = new Set(
      dataset.policies
        .filter(
          (policy) => policy.publicationStatus === 'approved-source-backed',
        )
        .map((policy) => policy.policyId),
    );
    expect(published.policies).toHaveLength(publishedIds.size);
    for (const policy of published.policies) {
      expect(publishedIds.has(policy.policyId)).toBe(true);
    }
  });

  it('keeps candidate references inside the official roster', () => {
    const candidateIds = new Set(
      roster.candidates.map((candidate) => candidate.id),
    );
    for (const policy of published.policies) {
      expect(candidateIds.has(policy.candidateId)).toBe(true);
      const source = dataset.policies.find(
        (item) => item.policyId === policy.policyId,
      );
      expect(source?.candidateId).toBe(policy.candidateId);
      expect(policy.sources.length).toBeGreaterThan(0);
      for (const item of policy.sources) {
        expect(item.url).toMatch(/^https?:\/\//);
        expect(item.publisher.length).toBeGreaterThan(0);
        expect(item.excerpt.length).toBeGreaterThan(0);
      }
    }
  });

  it('reports counts that match the published inventory', () => {
    expect(published.candidateCount).toBe(106);
    expect(published.policyCount).toBe(published.policies.length);
    const withPolicies = new Set(
      published.policies.map((policy) => policy.candidateId),
    ).size;
    expect(
      summary.audits.filter((audit) => audit.publishedPolicyCount > 0),
    ).toHaveLength(withPolicies);
    expect(dataset.review.publishedPolicyCount).toBe(published.policies.length);
  });

  it('renders published policies on the candidate profile', () => {
    const candidate = published.policies[0];
    if (!candidate) return;
    const profile = getOfficialCandidateProfile(
      roster.candidates.find((item) => item.id === candidate.candidateId)
        ?.slug ?? '',
    );
    expect(profile?.publishedPolicies?.length).toBeGreaterThan(0);
  });
});
