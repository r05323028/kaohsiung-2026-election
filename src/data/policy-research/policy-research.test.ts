import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import rosterInput from '../../../data/approved/2026/kaohsiung-election.json';
import policyResearchInput from '../../../data/policy-research/2026/full-roster.json';
import reportInput from '../../../reports/2026-policy-enrichment.json';
import { getOfficialCandidateProfile } from '../official';
import { validateOfficialDataset } from '../official/schema';
import {
  type PolicyResearchDataset,
  validatePolicyResearchDataset,
} from './schema';

const dataset: PolicyResearchDataset =
  validatePolicyResearchDataset(policyResearchInput);
const roster = validateOfficialDataset(rosterInput);

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
  });

  it('keeps atomic policy records identity-linked and publication-gated', () => {
    expect(dataset.policies.length).toBeGreaterThan(0);
    expect(
      new Set(dataset.policies.map((policy) => policy.policyId)).size,
    ).toBe(dataset.policies.length);
    expect(
      dataset.policies.every(
        (policy) => policy.verificationStatus === 'machine-validated',
      ),
    ).toBe(true);
    expect(
      dataset.policies.every(
        (policy) => policy.reviewStatus === 'pending-human-review',
      ),
    ).toBe(true);
    expect(
      dataset.policies.every(
        (policy) => policy.publicationStatus === 'withheld-pending-review',
      ),
    ).toBe(true);
    expect(
      dataset.evidence.every(
        (evidence) => evidence.identityStatus === 'resolved',
      ),
    ).toBe(true);
    expect(
      dataset.evidence.every(
        (evidence) => evidence.attributionStatus === 'attributed',
      ),
    ).toBe(true);
    expect(
      dataset.policies.some((policy) =>
        policy.originalStatement.includes('✅'),
      ),
    ).toBe(false);
  });

  it('separates 2026 commitments from current service positions', () => {
    const commitments = dataset.policies.filter(
      (policy) => policy.policyContext === '2026-election-commitment',
    );
    const currentPositions = dataset.policies.filter(
      (policy) => policy.policyContext === 'current-position',
    );
    expect(commitments.length).toBe(245);
    expect(currentPositions.length).toBe(423);
    expect(commitments.every((policy) => policy.electionYear === 2026)).toBe(
      true,
    );
    expect(
      currentPositions.every((policy) => policy.electionYear === null),
    ).toBe(true);
  });

  it('preserves explicit missing-information outcomes', () => {
    const outcomeCounts = dataset.audits.reduce<Record<string, number>>(
      (counts, audit) => {
        counts[audit.outcome] = (counts[audit.outcome] ?? 0) + 1;
        return counts;
      },
      {},
    );
    expect(outcomeCounts).toEqual({
      'sources-unavailable': 42,
      'verified-records': 2,
      'no-verifiable-policy-found': 11,
      'current-or-historical-only': 51,
    });
    expect(
      dataset.audits
        .filter((audit) => audit.outcome === 'sources-unavailable')
        .every((audit) =>
          audit.note.includes('不將此結果解讀為候選人沒有政策'),
        ),
    ).toBe(true);
    expect(
      dataset.audits
        .filter((audit) => audit.outcome === 'no-verifiable-policy-found')
        .every((audit) => audit.note.includes('不是候選人沒有政策的證據')),
    ).toBe(true);
    expect(
      dataset.audits
        .filter((audit) => audit.outcome === 'current-or-historical-only')
        .every((audit) => audit.note.includes('不是 2026 競選承諾')),
    ).toBe(true);
  });

  it('contains the candidate, district, category, and publication coverage report', () => {
    expect(reportInput.reportType).toBe('full-roster-policy-enrichment');
    expect(reportInput.totalCandidatesInvestigated).toBe(106);
    expect(reportInput.totalPolicyRecordsDiscovered).toBe(668);
    expect(reportInput.approvedPolicyCount).toBe(0);
    expect(reportInput.publishedPolicyCount).toBe(0);
    expect(Object.keys(reportInput.coverageByDistrict).length).toBeGreaterThan(
      0,
    );
    expect(reportInput.candidateInventory).toHaveLength(106);
    expect(Object.keys(reportInput.policyCountByCategory)).toHaveLength(16);
    expect(
      reportInput.remainingManualReviewRequirements.length,
    ).toBeGreaterThan(0);
  });

  it('keeps the generated report reproducible from the checked-in artifact', () => {
    const reportPath = resolve(
      process.cwd(),
      'reports/2026-policy-enrichment.json',
    );
    expect(readFileSync(reportPath, 'utf8')).toContain(
      '"totalCandidatesInvestigated": 106',
    );
    expect(reportInput.sourceAttemptCount).toBeGreaterThanOrEqual(106);
    expect(reportInput.missingSourceReasons).toEqual({
      noRetainedCandidateSpecificSource: 42,
      retrievedCandidateSourceWithoutVerifiablePolicy: 11,
      blockedExternalSources: 2,
    });
    expect(reportInput.identityOrAttributionConflicts).toEqual([]);
  });

  it('attaches research status to official profiles without exposing pending claims', () => {
    const profile = getOfficialCandidateProfile('ke-zhi-en-2026');
    expect(profile?.policyResearch).toMatchObject({
      outcome: 'verified-records',
      policyCount: 153,
      publishedPolicyCount: 0,
    });
    expect(profile?.policies).toHaveLength(0);
  });
});
