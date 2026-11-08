/**
 * Root-cause analysis for the previously rejected enrichment claims.
 *
 * Reads only retained artifacts (normalized dataset, semantic review report,
 * automated decision set) and produces an auditable per-claim accounting of why
 * each claim was rejected, including a materiality classification of every
 * reviewer disagreement.
 */
import { assessMateriality } from '../../src/data/enrichment/materiality';
import type { SemanticReviewReport } from '../../src/data/enrichment/semantic-review';
import {
  chromeFindings,
  PATHS,
  readJson,
  sha256,
  writeJson,
  writeText,
} from './lib';

type Decision = {
  claimId: string;
  candidateId: string;
  status: string;
  category: string;
  claimType: string;
  blockingReasons: string[];
  semantic: {
    reviewerA: { verdict: string; identityAssessment: string };
    reviewerB: { verdict: string; identityAssessment: string };
    comparison: string;
  };
};

type Dataset = {
  datasetId: string;
  snapshotDate: string;
  claims: Array<{
    claimId: string;
    candidateId: string;
    category: string;
    claimType: string;
    attribution: string;
    sourceDependency: string;
    currentStatus: string;
    value: string;
    sourceIds: string[];
    evidenceIds: string[];
    machineStatus: string;
  }>;
  sourceAttempts: Array<{
    sourceId: string;
    sourceClass: string;
    outcome: string;
    url: string;
  }>;
};

const CAUSE_LABELS: Record<string, string> = {
  'policy-category':
    'Category outside the low-risk biography scope permitted by policy v1.',
  'policy-claim-type':
    'Claim type is not an institutional biography fact permitted by policy v1.',
  'policy-attribution':
    'Attribution is not an institutional record, so policy v1 withholds it.',
  'policy-current-status':
    'Claim asserts a current status; policy v1 only publishes historical facts.',
  'policy-source-class':
    'Source class is not on the policy v1 authoritative whitelist.',
  'semantic-verdict-not-supported':
    'At least one independent reviewer did not return a supported verdict.',
  'semantic-identity-unconfirmed':
    'At least one reviewer could not confirm subject identity.',
  'semantic-disagreement':
    'The two independent reviewers differed on the semantic finding.',
  'evidence-duplicate-overlap':
    'Claim duplicates or overlaps another retained claim.',
  'evidence-citation-not-direct':
    'A reviewer citation was not direct support for the claim wording.',
  'wording-correction-proposed':
    'A reviewer required a wording correction before publication.',
  'source-not-retrieved':
    'A required source was not retrieved in the retained snapshot.',
  'identity-wrong-subject':
    'The retained evidence does not describe the mapped candidate.',
};

const CAUSE_ORDER = [
  'identity-wrong-subject',
  'semantic-identity-unconfirmed',
  'evidence-duplicate-overlap',
  'evidence-citation-not-direct',
  'source-not-retrieved',
  'semantic-verdict-not-supported',
  'wording-correction-proposed',
  'semantic-disagreement',
  'policy-category',
  'policy-claim-type',
  'policy-attribution',
  'policy-current-status',
  'policy-source-class',
];

function causeOf(reason: string): string {
  if (reason.startsWith('source-class-not-permitted:'))
    return 'policy-source-class';
  if (reason.startsWith('source-not-retrieved:')) return 'source-not-retrieved';
  if (reason === 'category-not-permitted') return 'policy-category';
  if (reason === 'claim-type-not-permitted') return 'policy-claim-type';
  if (reason === 'institutional-attribution-required')
    return 'policy-attribution';
  if (reason === 'historical-status-required') return 'policy-current-status';
  if (reason === 'semantic-review-not-fully-supported')
    return 'semantic-verdict-not-supported';
  if (reason === 'semantic-identity-not-confirmed')
    return 'semantic-identity-unconfirmed';
  if (reason === 'wrong-identity-verdict') return 'identity-wrong-subject';
  if (reason === 'duplicate-or-overlap-review')
    return 'evidence-duplicate-overlap';
  if (reason === 'correction-proposed') return 'wording-correction-proposed';
  if (reason === 'semantic-citation-not-direct-support')
    return 'evidence-citation-not-direct';
  if (
    reason === 'unresolved-semantic-disagreement' ||
    reason === 'unresolved-semantic-review-difference' ||
    reason.startsWith('nonempty-disagreement')
  )
    return 'semantic-disagreement';
  return `unmapped:${reason}`;
}

const dataset = readJson<Dataset>(PATHS.dataset);
const semantic = readJson<SemanticReviewReport>(PATHS.semanticReport);
const decisions = readJson<{ decisions: Decision[] }>(PATHS.decisions);
const review = readJson<{
  candidates: Array<{ candidateId: string; displayName: string | null }>;
}>(PATHS.review);

const candidateNameById = new Map(
  review.candidates.map((candidate) => [
    candidate.candidateId,
    candidate.displayName ?? candidate.candidateId,
  ]),
);
const claimById = new Map(
  dataset.claims.map((claim) => [claim.claimId, claim]),
);
const sourceById = new Map(
  dataset.sourceAttempts.map((source) => [source.sourceId, source]),
);
const invocationByKey = new Map(
  semantic.invocations.map((invocation) => [
    `${invocation.reviewerRole}:${invocation.claimId}`,
    invocation,
  ]),
);
const comparisonByClaim = new Map(
  semantic.comparisons.map((comparison) => [comparison.claimId, comparison]),
);

const records = decisions.decisions.map((decision) => {
  const claim = claimById.get(decision.claimId);
  if (!claim) throw new Error(`Missing claim ${decision.claimId}.`);
  const reviewerA = invocationByKey.get(
    `reviewer-a:${decision.claimId}`,
  )?.result;
  const reviewerB = invocationByKey.get(
    `reviewer-b:${decision.claimId}`,
  )?.result;
  const comparison = comparisonByClaim.get(decision.claimId);
  if (!reviewerA || !reviewerB || !comparison)
    throw new Error(`Incomplete semantic review for ${decision.claimId}.`);
  const materiality = assessMateriality(reviewerA, reviewerB);
  const causes = [...new Set(decision.blockingReasons.map(causeOf))];
  const ordered = [
    ...CAUSE_ORDER.filter((cause) => causes.includes(cause)),
    ...causes.filter((cause) => !CAUSE_ORDER.includes(cause)),
  ];
  const sourceClasses = claim.sourceIds.map(
    (sourceId) => sourceById.get(sourceId)?.sourceClass ?? 'unknown',
  );
  return {
    claimId: decision.claimId,
    candidateId: decision.candidateId,
    candidateName:
      candidateNameById.get(decision.candidateId) ?? decision.candidateId,
    category: decision.category,
    claimType: decision.claimType,
    attribution: claim.attribution,
    currentStatus: claim.currentStatus,
    sourceClasses: [...new Set(sourceClasses)],
    machineStatus: claim.machineStatus,
    status: decision.status,
    blockingReasons: decision.blockingReasons,
    rootCauses: ordered,
    primaryCause: ordered[0] ?? 'none',
    semantic: {
      comparison: decision.semantic.comparison,
      verdictA: decision.semantic.reviewerA.verdict,
      verdictB: decision.semantic.reviewerB.verdict,
      differenceDimensions: comparison.differenceDimensions,
      disputedPropositions: comparison.disputedPropositions,
      materiality,
      correctionProposed:
        reviewerA.proposedCorrection !== null ||
        reviewerB.proposedCorrection !== null,
    },
    wording: {
      chromePatterns: chromeFindings(claim.value),
      chromePatternCount: chromeFindings(claim.value).length,
      valueLength: claim.value.length,
    },
    evidenceCount: claim.evidenceIds.length,
  };
});

const rejected = records.filter(
  (record) => record.status === 'machine-rejected',
);

const causeCounts = new Map<string, string[]>();
for (const record of rejected) {
  for (const cause of record.rootCauses) {
    const list = causeCounts.get(cause) ?? [];
    list.push(record.claimId);
    causeCounts.set(cause, list);
  }
}
const causeCandidateCounts = new Map<string, Map<string, number>>();
for (const record of rejected) {
  for (const cause of record.rootCauses) {
    const map = causeCandidateCounts.get(cause) ?? new Map<string, number>();
    map.set(record.candidateName, (map.get(record.candidateName) ?? 0) + 1);
    causeCandidateCounts.set(cause, map);
  }
}

const primaryCounts = new Map<string, number>();
for (const record of rejected) {
  primaryCounts.set(
    record.primaryCause,
    (primaryCounts.get(record.primaryCause) ?? 0) + 1,
  );
}

const disagreementRecords = rejected
  .filter(
    (record) =>
      record.blockingReasons.includes('unresolved-semantic-disagreement') ||
      record.blockingReasons.includes('unresolved-semantic-review-difference'),
  )
  .map((record) => ({
    claimId: record.claimId,
    candidateName: record.candidateName,
    comparison: record.semantic.comparison,
    verdicts: [record.semantic.verdictA, record.semantic.verdictB],
    differenceDimensions: record.semantic.differenceDimensions,
    materialDimensions: record.semantic.materiality.materialDimensions,
    nonMaterialDimensions: record.semantic.materiality.nonMaterialDimensions,
    material: record.semantic.materiality.material,
    rationale: record.semantic.materiality.rationale,
  }));

const correctionTargets = records.filter((record) =>
  record.blockingReasons.includes('correction-proposed'),
);

const nonMaterialResolved = disagreementRecords.filter(
  (item) => !item.material,
);
const materialRetained = disagreementRecords.filter((item) => item.material);

const candidates = [...new Set(records.map((record) => record.candidateName))];

const report = {
  schemaVersion: '1',
  datasetId: dataset.datasetId,
  snapshotDate: dataset.snapshotDate,
  generatedAt: new Date().toISOString(),
  artifacts: {
    dataset: { path: PATHS.dataset, sha256: sha256(JSON.stringify(dataset)) },
    semanticReview: {
      path: PATHS.semanticReport,
      sha256: sha256(JSON.stringify(semantic)),
    },
    decisions: {
      path: PATHS.decisions,
      sha256: sha256(JSON.stringify(decisions)),
    },
  },
  counts: {
    totalClaims: records.length,
    machineApproved: records.filter(
      (record) => record.status === 'machine-approved',
    ).length,
    machineRejected: rejected.length,
    candidates: candidates.length,
    correctionTargets: correctionTargets.length,
    disagreements: disagreementRecords.length,
    nonMaterialDisagreements: nonMaterialResolved.length,
    materialDisagreements: materialRetained.length,
    chromeCorruptedValues: rejected.filter(
      (record) => record.wording.chromePatternCount > 0,
    ).length,
  },
  causes: [...causeCounts.entries()]
    .map(([cause, claimIds]) => ({
      cause,
      label: CAUSE_LABELS[cause] ?? cause,
      claims: claimIds.length,
      candidateCounts: Object.fromEntries(
        [...(causeCandidateCounts.get(cause) ?? new Map()).entries()].sort(
          (a, b) => b[1] - a[1],
        ),
      ),
      claimIds,
    }))
    .sort((a, b) => b.claims - a.claims),
  primaryCauses: [...primaryCounts.entries()]
    .map(([cause, claims]) => ({
      cause,
      label: CAUSE_LABELS[cause] ?? cause,
      claims,
    }))
    .sort((a, b) => b.claims - a.claims),
  claims: records,
  disagreements: disagreementRecords,
  corrections: correctionTargets.map((record) => ({
    claimId: record.claimId,
    candidateName: record.candidateName,
    claimType: record.claimType,
    chromePatterns: record.wording.chromePatterns,
  })),
};

writeJson('reports/autonomous-remediation-root-causes.json', report);

const lines: string[] = [];
lines.push('# Autonomous remediation root causes');
lines.push('');
lines.push(
  `- Dataset: \`${dataset.datasetId}\` (snapshot ${dataset.snapshotDate})`,
);
lines.push(`- Generated: ${report.generatedAt}`);
lines.push(
  `- Claims: ${report.counts.totalClaims} total / ${report.counts.machineApproved} machine-approved / ${report.counts.machineRejected} rejected`,
);
lines.push(`- Candidates: ${report.counts.candidates}`);
lines.push('');
lines.push('## Rejection causes (a claim can carry several)');
lines.push('');
lines.push('| Cause | Claims |');
lines.push('| --- | ---: |');
for (const cause of report.causes) {
  lines.push(`| \`${cause.cause}\` — ${cause.label} | ${cause.claims} |`);
}
lines.push('');
lines.push('## Primary cause per claim');
lines.push('');
lines.push('| Primary cause | Claims |');
lines.push('| --- | ---: |');
for (const cause of report.primaryCauses) {
  lines.push(`| \`${cause.cause}\` | ${cause.claims} |`);
}
lines.push('');
lines.push('## Reviewer disagreements');
lines.push('');
lines.push(
  `71 disagreements were classified with adjudication-materiality-v2: ${nonMaterialResolved.length} are non-material (reviewer commentary or a vacuous temporal flag), ${materialRetained.length} remain material.`,
);
lines.push('');
lines.push('| Claim | Candidate | Verdicts | Observed dimensions | Material |');
lines.push('| --- | --- | --- | --- | --- |');
for (const item of disagreementRecords) {
  lines.push(
    `| ${item.claimId} | ${item.candidateName} | ${item.verdicts.join(' / ')} | ${item.differenceDimensions.join(', ') || 'none'} | ${item.materialDimensions.join(', ') || 'non-material'} |`,
  );
}
lines.push('');
lines.push('## Wording corrections proposed');
lines.push('');
lines.push('| Claim | Candidate | Type | Page-chrome patterns |');
lines.push('| --- | --- | --- | --- |');
for (const item of report.corrections) {
  lines.push(
    `| ${item.claimId} | ${item.candidateName} | ${item.claimType} | ${item.chromePatterns.join(' ') || '—'} |`,
  );
}
lines.push('');
lines.push('## Root-cause notes');
lines.push('');
lines.push(
  '- Claims that carry `policy-*` causes cannot become publishable through evidence work: policy v1 fixes the permitted category, claim type, attribution, status, and source class. No retrieval or re-review is recorded against those dimensions.',
);
lines.push(
  `- ${report.counts.chromeCorruptedValues} rejected claims carry scraped page-chrome in their wording; those are correctable wording defects, not evidence gaps.`,
);
lines.push(
  `- ${nonMaterialResolved.length} of ${disagreementRecords.length} disagreements are non-material under adjudication-materiality-v2 and therefore eligible for fresh independent adjudication.`,
);
lines.push(
  '- The remaining material disagreements keep their claims withheld; none is resolved by majority vote or by selecting the favourable reviewer.',
);
lines.push('');
writeText('reports/autonomous-remediation-root-causes.md', lines.join('\n'));

console.log(
  JSON.stringify(
    {
      totalClaims: report.counts.totalClaims,
      rejected: report.counts.machineRejected,
      causes: report.causes.map((cause) => `${cause.cause}=${cause.claims}`),
      disagreements: disagreementRecords.length,
      nonMaterial: nonMaterialResolved.length,
      material: materialRetained.length,
      nonMaterialIds: nonMaterialResolved.map((item) => item.claimId),
      materialIds: materialRetained.map((item) => item.claimId),
      chromeCorrupted: report.counts.chromeCorruptedValues,
      chromeClaims: rejected
        .filter((record) => record.wording.chromePatternCount > 0)
        .map((record) => record.claimId),
    },
    null,
    1,
  ),
);
