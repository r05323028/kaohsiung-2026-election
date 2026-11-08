import { describe, expect, it } from 'vitest';
import datasetInput from '../../../data/enrichment/normalized/2026/zuoying-mayoral.json';
import reportInput from '../../../reports/independent-ai-review.json';
import {
  type IndependentAIAuditReport,
  validateIndependentAuditReport,
} from './ai-audit';
import { validateEnrichmentDataset } from './schema';

const dataset = validateEnrichmentDataset(datasetInput);
const report = validateIndependentAuditReport(reportInput);

describe('independent scoped evidence audit', () => {
  it('covers every normalized claim exactly once', () => {
    expect(report.findings).toHaveLength(143);
    expect(
      new Set(report.findings.map((finding) => finding.claimId)),
    ).toHaveLength(143);
    expect(
      report.findings.every((finding) =>
        dataset.claims.some((claim) => claim.claimId === finding.claimId),
      ),
    ).toBe(true);
  });

  it('records separate deterministic passes and the unavailable agent attempt', () => {
    expect(report.methods.firstPass).toBe('reopen-and-rule-audit-v1');
    expect(report.methods.secondPass).toBe(
      'independent-reopen-and-rule-audit-v1',
    );
    expect(report.independentAgentAttempt.status).toBe('unavailable');
    expect(report.independentAgentAttempt.runId).toBe('del_mw63q1yg_nogs');
    expect(report.independentAgentAttempts).toHaveLength(2);
    expect(
      report.independentAgentAttempts.every(
        (attempt) => attempt.status === 'unavailable',
      ),
    ).toBe(true);
    expect(report.summary.comparison.agree).toBe(141);
    expect(report.summary.comparison.disagree).toBe(2);
    expect(report.summary.comparison.unavailable).toBe(0);
  });

  it('keeps source/evidence/identity references on every finding', () => {
    expect(
      report.findings.every((finding) => finding.sourceIds.length > 0),
    ).toBe(true);
    expect(
      report.findings.every((finding) => finding.evidenceIds.length > 0),
    ).toBe(true);
    expect(
      report.findings.every(
        (finding) => finding.identityObservationIds.length > 0,
      ),
    ).toBe(true);
    expect(report.summary.unsupportedClaims).toBe(0);
    expect(report.summary.correctionCount).toBe(0);
  });

  it('marks temporal, attribution, currentness, and overlap limits as review blockers', () => {
    expect(report.summary.needsReviewClaims).toBe(139);
    expect(
      report.findings.some((finding) =>
        finding.blockers.includes('temporal-scope-or-date-is-unknown'),
      ),
    ).toBe(true);
    expect(
      report.findings.some((finding) =>
        finding.blockers.includes(
          'candidate-attribution-requires-human-confirmation',
        ),
      ),
    ).toBe(true);
    expect(
      report.findings.some((finding) =>
        finding.blockers.includes(
          'duplicate-or-overlap-group-requires-human-disposition',
        ),
      ),
    ).toBe(true);
  });

  it('rejects duplicate claim findings instead of silently overwriting them', () => {
    const duplicate = JSON.parse(
      JSON.stringify(reportInput),
    ) as IndependentAIAuditReport;
    const first = duplicate.findings[0];
    const second = duplicate.findings[1];
    if (!first || !second) throw new Error('Audit fixture needs two findings.');
    second.claimId = first.claimId;
    expect(() => validateIndependentAuditReport(duplicate)).toThrow(
      /duplicate claim IDs/,
    );
  });

  it('does not turn machine findings into editorial approval', () => {
    expect(
      report.findings.every(
        (finding) =>
          finding.firstPassStatus !== 'machine-verified' ||
          !finding.rationale.includes('approval'),
      ),
    ).toBe(true);
    expect(report.notes.join('\n')).toContain('not human editorial approval');
  });
});
