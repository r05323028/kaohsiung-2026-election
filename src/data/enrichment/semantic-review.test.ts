import { describe, expect, it } from 'vitest';
import reportInput from '../../../reports/semantic-review-execution.json';
import {
  type SemanticReviewReport,
  validateSemanticReviewReport,
} from './semantic-review';

const report = validateSemanticReviewReport(reportInput);

describe('semantic evidence adjudication report', () => {
  it('has two valid, independently identified findings for every claim', () => {
    expect(report.packets).toHaveLength(143);
    expect(report.invocations).toHaveLength(286);
    expect(report.summary.reviewerASuccessful).toBe(143);
    expect(report.summary.reviewerBSuccessful).toBe(143);
    expect(report.summary.completedPairs).toBe(143);
    expect(report.comparisons).toHaveLength(143);
    expect(
      report.invocations.every(
        (invocation) =>
          invocation.status === 'completed' && invocation.runId !== null,
      ),
    ).toBe(true);
    expect(
      new Set(report.invocations.map((invocation) => invocation.runId)).size,
    ).toBe(286);
  });

  it('retains failed/provider attempts without treating them as findings', () => {
    expect(report.failedInvocations).toHaveLength(206);
    expect(report.summary.failedInvocations).toBe(206);
    expect(
      report.failedInvocations.every(
        (invocation) => invocation.error.length > 0,
      ),
    ).toBe(true);
    expect(
      report.agentAttempts.some((attempt) => attempt.status === 'unavailable'),
    ).toBe(true);
  });

  it('keeps disagreement, correction, and publication boundaries explicit', () => {
    expect(report.summary.disagreements).toBe(71);
    expect(report.summary.corrections).toBe(25);
    expect(report.summary.humanApproved).toBe(0);
    expect(report.summary.published).toBe(0);
    expect(
      report.comparisons.every(
        (comparison) => comparison.agreement !== 'unavailable',
      ),
    ).toBe(true);
  });

  it('rejects completed invocations without a real run ID', () => {
    const invalid = JSON.parse(
      JSON.stringify(reportInput),
    ) as SemanticReviewReport;
    const first = invalid.invocations[0];
    if (!first)
      throw new Error('Semantic fixture needs a completed invocation.');
    first.runId = null;
    expect(() => validateSemanticReviewReport(invalid)).toThrow(
      /Completed invocations require run ID/,
    );
  });

  it('rejects citations that are not present in retained packet evidence', () => {
    const invalid = JSON.parse(
      JSON.stringify(reportInput),
    ) as SemanticReviewReport;
    const first = invalid.invocations[0];
    if (!first?.result) throw new Error('Semantic fixture needs a result.');
    const citation = first.result.evidence[0];
    if (!citation) throw new Error('Semantic fixture needs a citation.');
    citation.excerpt = 'fabricated citation text';
    expect(() => validateSemanticReviewReport(invalid)).toThrow(
      /not a contiguous substring/,
    );
  });
});
