/**
 * Adjudication materiality rules (adjudication-materiality-v2).
 *
 * `automated-editorial-policy-v1` requires independent semantic review without a
 * *material* unresolved disagreement. The v1 comparator treated every textual
 * difference between two independent findings as a blocking disagreement,
 * including reviewer commentary in `limitations` and a vacuous
 * `sourceSupportsTemporalWording` flag on claims that assert no temporal
 * wording at all. Those differences cannot make a published claim untrue, so
 * this module classifies each observed difference as material or non-material.
 *
 * The rules are deliberately conservative: anything that could change whether
 * the claim wording is supported, correctly attributed, correctly identified, or
 * temporally accurate stays material and blocks publication. Three classes of
 * difference are explicitly not material because they cannot change the truth of
 * the published wording: (1) limitation prose, (2) temporal flags on claims that
 * assert no date or currency while both reviewers accept the wording, and
 * (3) the choice of which passage inside the retained source each reviewer
 * quotes, provided both cite direct support and neither cites a contradiction.
 */
import type { SemanticFindingResult, SemanticVerdict } from './semantic-review';

export const ADJUDICATION_POLICY_VERSION =
  'adjudication-materiality-v2' as const;

export type MaterialityDimension =
  | 'verdict'
  | 'identity'
  | 'attribution'
  | 'temporal'
  | 'evidence'
  | 'correction'
  | 'limitations';

export type MaterialityAssessment = {
  policyVersion: typeof ADJUDICATION_POLICY_VERSION;
  verdictA: SemanticVerdict;
  verdictB: SemanticVerdict;
  observedDimensions: MaterialityDimension[];
  materialDimensions: MaterialityDimension[];
  nonMaterialDimensions: MaterialityDimension[];
  material: boolean;
  rationale: string[];
};

const DIRECT_SUPPORT_RELATIONSHIPS = new Set(['supports']);
const CONTRADICTING_RELATIONSHIPS = new Set(['contradicts']);

/**
 * Collapses free-text attribution assessments into a comparable signal.
 * Only the attribution *stance* matters: whether the source is an institutional
 * record, a news report, a candidate statement, or something else.
 */
export function attributionSignal(value: string): string {
  // Reviewer prose often mentions unrelated context ("the page's news list",
  // "the official profile") after the stance label. Only the stance itself is
  // compared, so the text is truncated at the first clause separator.
  const text = (value.split(/[:：;；\n]|—|–/u)[0] ?? '').toLowerCase();
  const institutional =
    /institution|official|record|council|legislat|government|profile/.test(
      text,
    );
  const news = /news|report|journal|publisher|media/.test(text);
  const self = /self|first person|candidate statement|campaign/.test(text);
  const signals = [
    institutional ? 'institutional' : '',
    news ? 'news' : '',
    self ? 'self' : '',
  ].filter(Boolean);
  return signals.length > 0 ? signals.join('+') : 'other';
}

function citationKey(result: SemanticFindingResult): string {
  return result.evidence
    .map((item) => `${item.evidenceId}:${item.relationship}`)
    .sort((left, right) => left.localeCompare(right))
    .join('|');
}

function correctionKey(result: SemanticFindingResult): string {
  const correction = result.proposedCorrection;
  if (!correction) return 'none';
  return `${correction.proposedWording.trim()}|${[...correction.evidenceIds].sort().join(',')}`;
}

export function assessMateriality(
  reviewerA: SemanticFindingResult,
  reviewerB: SemanticFindingResult,
): MaterialityAssessment {
  const observed: MaterialityDimension[] = [];
  const material: MaterialityDimension[] = [];
  const rationale: string[] = [];

  if (reviewerA.verdict !== reviewerB.verdict) {
    observed.push('verdict');
    material.push('verdict');
    rationale.push('Reviewers returned different verdicts.');
  }
  if (reviewerA.identityAssessment !== reviewerB.identityAssessment) {
    observed.push('identity');
    material.push('identity');
    rationale.push('Reviewers disagreed on subject identity.');
  }
  if (
    attributionSignal(reviewerA.attributionAssessment) !==
    attributionSignal(reviewerB.attributionAssessment)
  ) {
    observed.push('attribution');
    material.push('attribution');
    rationale.push(
      'Reviewers disagreed on the attribution stance of the source.',
    );
  }

  const requiresDate =
    reviewerA.temporalAssessment.requiresDate ||
    reviewerB.temporalAssessment.requiresDate;
  const bothSupportTemporalWording =
    reviewerA.temporalAssessment.sourceSupportsTemporalWording &&
    reviewerB.temporalAssessment.sourceSupportsTemporalWording;
  const temporalObserved =
    reviewerA.temporalAssessment.requiresDate !==
      reviewerB.temporalAssessment.requiresDate ||
    reviewerA.temporalAssessment.sourceSupportsTemporalWording !==
      reviewerB.temporalAssessment.sourceSupportsTemporalWording;
  if (temporalObserved) observed.push('temporal');
  if (requiresDate && !bothSupportTemporalWording) {
    material.push('temporal');
    rationale.push(
      'The claim asserts time-bound wording and a reviewer did not accept the source as supporting it.',
    );
  } else if (temporalObserved) {
    rationale.push(
      'Temporal flags differ, but neither reviewer requires a date and both accept the wording as historically presented.',
    );
  }

  const citationsDiffer = citationKey(reviewerA) !== citationKey(reviewerB);
  if (citationsDiffer) {
    observed.push('evidence');
    rationale.push(
      'Reviewers cited different passages of the retained source; passage selection is not itself an evidentiary disagreement.',
    );
  }
  const contradictions = [reviewerA, reviewerB].filter((result) =>
    result.evidence.some((citation) =>
      CONTRADICTING_RELATIONSHIPS.has(citation.relationship),
    ),
  );
  if (contradictions.length > 0) {
    if (!observed.includes('evidence')) observed.push('evidence');
    if (!material.includes('evidence')) material.push('evidence');
    rationale.push(
      'A reviewer cited evidence that contradicts the claim wording.',
    );
  }
  for (const [role, result] of [
    ['reviewer-a', reviewerA],
    ['reviewer-b', reviewerB],
  ] as const) {
    if (
      !result.evidence.some((citation) =>
        DIRECT_SUPPORT_RELATIONSHIPS.has(citation.relationship),
      )
    ) {
      if (!material.includes('evidence')) material.push('evidence');
      if (!observed.includes('evidence')) observed.push('evidence');
      rationale.push(`${role} did not cite direct supporting evidence.`);
    }
  }

  if (correctionKey(reviewerA) !== correctionKey(reviewerB)) {
    observed.push('correction');
    material.push('correction');
    rationale.push(
      'Reviewers disagreed on whether a wording correction is required.',
    );
  }

  const limitationsDiffer =
    reviewerA.limitations.join('\n') !== reviewerB.limitations.join('\n');
  if (limitationsDiffer) {
    observed.push('limitations');
    rationale.push(
      'Reviewers recorded different limitation notes; limitation prose describes evidential boundaries and is not part of the claim wording.',
    );
  }

  return {
    policyVersion: ADJUDICATION_POLICY_VERSION,
    verdictA: reviewerA.verdict,
    verdictB: reviewerB.verdict,
    observedDimensions: observed,
    materialDimensions: material,
    nonMaterialDimensions: observed.filter(
      (dimension) => !material.includes(dimension),
    ),
    material: material.length > 0,
    rationale,
  };
}
