import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import {
  assertSemanticFindingCitations,
  SemanticAgentAttemptSchema,
  type SemanticComparison,
  SemanticComparisonSchema,
  type SemanticEvidencePacket,
  SemanticEvidencePacketSchema,
  SemanticFailedInvocationSchema,
  type SemanticFindingResult,
  SemanticFindingResultSchema,
  SemanticInvocationSchema,
  type SemanticReviewReport,
  validateSemanticReviewReport,
} from '../src/data/enrichment/semantic-review';

const ROOT = process.cwd();
const PACKET_PATH = resolve(
  ROOT,
  'data/enrichment/semantic-review/2026/evidence-packets.json',
);
const RAW_RUNS_PATH = resolve(
  ROOT,
  'data/enrichment/semantic-review/2026/model-runs.json',
);
const REPORT_PATH = resolve(ROOT, 'reports/semantic-review-execution.json');
const FINDINGS_PATH = resolve(ROOT, 'reports/semantic-review-findings.json');
const DISAGREEMENTS_PATH = resolve(
  ROOT,
  'reports/semantic-review-disagreements.md',
);
const CORRECTIONS_PATH = resolve(
  ROOT,
  'reports/semantic-review-corrections.md',
);
const BLOCKERS_PATH = resolve(ROOT, 'reports/semantic-review-blockers.md');
const COVERAGE_PATH = resolve(ROOT, 'reports/semantic-review-coverage.md');
const GENERATED_AT =
  process.env.SEMANTIC_REVIEW_GENERATED_AT ?? new Date().toISOString();

const sha256 = (value: string): string =>
  createHash('sha256').update(value, 'utf8').digest('hex');
const readJson = <T>(path: string): T => {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch (error) {
    throw new Error(
      `Unable to parse ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};
const writeJson = (path: string, value: unknown): void => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
};
const canonical = (value: unknown): string => JSON.stringify(value);
const setKey = (items: string[]): string =>
  [...new Set(items)].sort().join('|');
const normalize = (value: string): string => value.trim().toLocaleLowerCase();

interface RawAttempt {
  invocationId: string;
  runId: string | null;
  reviewerRole: 'reviewer-a' | 'reviewer-b';
  claimId: string;
  model: string;
  runner: string;
  sessionId: string | null;
  packetId: string;
  packetSha256: string;
  status: 'completed' | 'failed' | 'timeout' | 'invalid-output' | 'unavailable';
  startedAt: string;
  finishedAt: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  cost: number | null;
  error: string | null;
  rawOutput?: string | null;
  rawText?: string | null;
  result?: unknown;
}
interface RawRunFile {
  schemaVersion: '1';
  datasetId: 'kaohsiung-2026-zuoying-mayoral-enrichment';
  snapshotDate: string;
  generatedAt: string;
  attempts: RawAttempt[];
  agentAttempts: unknown[];
}

const packetsFile = readJson<{ packets: unknown[] }>(PACKET_PATH);
const packets = packetsFile.packets.map((packet) =>
  SemanticEvidencePacketSchema.parse(packet),
);
const packetByClaimId = new Map(
  packets.map((packet) => [packet.claimId, packet]),
);
const rawRuns = readJson<RawRunFile>(RAW_RUNS_PATH);
if (rawRuns.datasetId !== 'kaohsiung-2026-zuoying-mayoral-enrichment')
  throw new Error('Semantic model runs use the wrong dataset.');

const getRawOutput = (attempt: RawAttempt): string | null =>
  attempt.rawOutput ??
  attempt.rawText ??
  (attempt.result ? canonical(attempt.result) : null);
type RawStructuredResult = Record<string, unknown>;
const isRecord = (value: unknown): value is RawStructuredResult =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const getResult = (attempt: RawAttempt): RawStructuredResult | null => {
  if (isRecord(attempt.result)) return attempt.result;
  const rawOutput = getRawOutput(attempt);
  if (!rawOutput) return null;
  try {
    const parsed: unknown = JSON.parse(rawOutput);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const failed = (
  attempt: RawAttempt,
  error: string,
  status:
    | 'failed'
    | 'timeout'
    | 'invalid-output'
    | 'unavailable' = 'invalid-output',
) =>
  SemanticFailedInvocationSchema.parse({
    invocationId: attempt.invocationId,
    runId: attempt.runId,
    reviewerRole: attempt.reviewerRole,
    claimId: attempt.claimId,
    model: attempt.model,
    runner: attempt.runner,
    sessionId: attempt.sessionId ?? null,
    packetId: attempt.packetId,
    packetSha256: attempt.packetSha256,
    outputSha256: getRawOutput(attempt)
      ? sha256(getRawOutput(attempt) as string)
      : null,
    status,
    startedAt: attempt.startedAt,
    finishedAt: attempt.finishedAt ?? null,
    error,
    rawOutput: getRawOutput(attempt),
  });

const validInvocations: Array<
  ReturnType<typeof SemanticInvocationSchema.parse>
> = [];
const failedInvocations: Array<
  ReturnType<typeof SemanticFailedInvocationSchema.parse>
> = [];
const validByKey = new Map<
  string,
  ReturnType<typeof SemanticInvocationSchema.parse>
>();

for (const attempt of rawRuns.attempts) {
  const packet = packetByClaimId.get(attempt.claimId);
  if (!packet) {
    failedInvocations.push(
      failed(attempt, `Unknown claim ${attempt.claimId}.`),
    );
    continue;
  }
  if (attempt.packetSha256 !== packet.packetSha256) {
    failedInvocations.push(
      failed(attempt, `Packet checksum mismatch for ${attempt.claimId}.`),
    );
    continue;
  }
  if (attempt.status !== 'completed') {
    failedInvocations.push(
      failed(
        attempt,
        attempt.error ?? `Model invocation ended with ${attempt.status}.`,
        attempt.status,
      ),
    );
    continue;
  }
  const resultInput = getResult(attempt);
  if (!resultInput) {
    failedInvocations.push(
      failed(
        attempt,
        'Completed invocation returned no parseable structured result.',
      ),
    );
    continue;
  }
  try {
    const result = SemanticFindingResultSchema.parse(resultInput);
    if (result.claimId !== attempt.claimId)
      throw new Error(
        `Structured result claim ID ${result.claimId} does not match ${attempt.claimId}.`,
      );
    assertSemanticFindingCitations(packet, result);
    const rawOutput = getRawOutput(attempt) ?? canonical(result);
    const invocation = SemanticInvocationSchema.parse({
      invocationId: attempt.invocationId,
      runId: attempt.runId,
      reviewerRole: attempt.reviewerRole,
      claimId: attempt.claimId,
      model: attempt.model,
      runner: attempt.runner,
      sessionId: attempt.sessionId ?? null,
      packetId: attempt.packetId,
      packetSha256: packet.packetSha256,
      outputSha256: sha256(rawOutput),
      status: 'completed',
      startedAt: attempt.startedAt,
      finishedAt: attempt.finishedAt,
      inputTokens: attempt.inputTokens ?? null,
      outputTokens: attempt.outputTokens ?? null,
      cost: attempt.cost ?? null,
      error: null,
      rawOutput,
      result,
    });
    const key = `${invocation.reviewerRole}:${invocation.claimId}`;
    if (validByKey.has(key)) {
      failedInvocations.push(
        failed(
          attempt,
          `Duplicate valid result for ${key}; retained the earlier valid invocation.`,
        ),
      );
    } else {
      validByKey.set(key, invocation);
      validInvocations.push(invocation);
    }
  } catch (error) {
    failedInvocations.push(
      failed(attempt, error instanceof Error ? error.message : String(error)),
    );
  }
}

const getAttributionSignal = (value: string): string => {
  const text = normalize(value);
  if (text.includes('candidate') || text.includes('self')) return 'candidate';
  if (
    text.includes('news') ||
    text.includes('reported') ||
    text.includes('media')
  )
    return 'reported';
  if (
    text.includes('institution') ||
    text.includes('official') ||
    text.includes('legislative')
  )
    return 'institutional';
  return 'other';
};
const citationKey = (result: SemanticFindingResult): string =>
  setKey(
    result.evidence.map(
      (item) => `${item.sourceId}:${item.evidenceId}:${item.relationship}`,
    ),
  );
const correctionKey = (result: SemanticFindingResult): string =>
  result.proposedCorrection
    ? canonical({
        wording: result.proposedCorrection.proposedWording,
        sources: setKey(result.proposedCorrection.sourceIds),
        evidence: setKey(result.proposedCorrection.evidenceIds),
      })
    : 'none';

const compare = (
  packet: SemanticEvidencePacket,
  reviewerA: ReturnType<typeof SemanticInvocationSchema.parse> | undefined,
  reviewerB: ReturnType<typeof SemanticInvocationSchema.parse> | undefined,
): SemanticComparison => {
  if (!reviewerA || !reviewerB || !reviewerA.result || !reviewerB.result) {
    return SemanticComparisonSchema.parse({
      claimId: packet.claimId,
      reviewerAInvocationId:
        reviewerA?.invocationId ?? `missing-reviewer-a-${packet.claimId}`,
      reviewerBInvocationId:
        reviewerB?.invocationId ?? `missing-reviewer-b-${packet.claimId}`,
      agreement: 'unavailable',
      verdictA: reviewerA?.result?.verdict ?? null,
      verdictB: reviewerB?.result?.verdict ?? null,
      disputedPropositions: [
        'Both independent completed findings are required before semantic comparison is complete.',
      ],
      differenceDimensions: ['verdict'],
      adjudicationRecommendation:
        'Do not treat this claim as semantically adjudicated; obtain the missing reviewer result.',
      requiresHumanDecision: true,
    });
  }
  const a = reviewerA.result;
  const b = reviewerB.result;
  const dimensions: Array<
    | 'verdict'
    | 'identity'
    | 'attribution'
    | 'temporal'
    | 'evidence'
    | 'correction'
    | 'limitations'
  > = [];
  if (a.verdict !== b.verdict) dimensions.push('verdict');
  if (a.identityAssessment !== b.identityAssessment)
    dimensions.push('identity');
  if (
    getAttributionSignal(a.attributionAssessment) !==
    getAttributionSignal(b.attributionAssessment)
  )
    dimensions.push('attribution');
  if (
    a.temporalAssessment.requiresDate !== b.temporalAssessment.requiresDate ||
    a.temporalAssessment.sourceSupportsTemporalWording !==
      b.temporalAssessment.sourceSupportsTemporalWording
  )
    dimensions.push('temporal');
  if (citationKey(a) !== citationKey(b)) dimensions.push('evidence');
  if (correctionKey(a) !== correctionKey(b)) dimensions.push('correction');
  if (
    setKey(a.limitations.map(normalize)) !==
    setKey(b.limitations.map(normalize))
  )
    dimensions.push('limitations');
  const substantive = dimensions.filter(
    (dimension) => dimension !== 'limitations',
  );
  const agreement =
    dimensions.length === 0
      ? 'full-agreement'
      : a.verdict === b.verdict && substantive.length === 0
        ? 'same-verdict-different-reasoning'
        : a.verdict !== b.verdict &&
            (['contradicted', 'wrong-identity'].includes(a.verdict) ||
              ['contradicted', 'wrong-identity'].includes(b.verdict))
          ? 'direct-contradiction'
          : 'partial-disagreement';
  const disputedPropositions = dimensions.map((dimension) => {
    if (dimension === 'verdict')
      return `Reviewers returned different verdicts: ${a.verdict} versus ${b.verdict}.`;
    if (dimension === 'identity')
      return `Reviewers assessed identity differently: ${a.identityAssessment} versus ${b.identityAssessment}.`;
    if (dimension === 'attribution')
      return 'Reviewers used materially different attribution interpretations.';
    if (dimension === 'temporal')
      return 'Reviewers disagreed on whether the source supports the claim’s temporal wording.';
    if (dimension === 'evidence')
      return 'Reviewers cited different evidence locations or relationships.';
    if (dimension === 'correction')
      return 'Reviewers differed on whether a wording correction is required.';
    return 'Reviewers reported different limitations.';
  });
  return SemanticComparisonSchema.parse({
    claimId: packet.claimId,
    reviewerAInvocationId: reviewerA.invocationId,
    reviewerBInvocationId: reviewerB.invocationId,
    agreement,
    verdictA: a.verdict,
    verdictB: b.verdict,
    disputedPropositions,
    differenceDimensions: dimensions,
    adjudicationRecommendation:
      agreement === 'full-agreement'
        ? 'The reviewers agree on the semantic finding; a human editor must still inspect the cited source before any decision or publication.'
        : 'Preserve the disagreement and require human editorial inspection of the cited source; no automatic resolution or publication is permitted.',
    requiresHumanDecision: true,
  });
};

const reviewerA = new Map(
  validInvocations
    .filter((item) => item.reviewerRole === 'reviewer-a')
    .map((item) => [item.claimId, item]),
);
const reviewerB = new Map(
  validInvocations
    .filter((item) => item.reviewerRole === 'reviewer-b')
    .map((item) => [item.claimId, item]),
);
const comparisons = packets.map((packet) =>
  compare(packet, reviewerA.get(packet.claimId), reviewerB.get(packet.claimId)),
);
const aResults = [...reviewerA.values()].flatMap((item) =>
  item.result ? [item.result] : [],
);
const correctionClaims = new Set(
  validInvocations
    .filter((item) => item.result?.proposedCorrection)
    .map((item) => item.claimId),
);
const summary = {
  claims: packets.length,
  reviewerASuccessful: reviewerA.size,
  reviewerBSuccessful: reviewerB.size,
  completedPairs: comparisons.filter(
    (comparison) => comparison.agreement !== 'unavailable',
  ).length,
  failedInvocations: failedInvocations.length,
  supported: aResults.filter((result) => result.verdict === 'supported').length,
  partiallySupported: aResults.filter(
    (result) => result.verdict === 'partially-supported',
  ).length,
  insufficientEvidence: aResults.filter(
    (result) => result.verdict === 'insufficient-evidence',
  ).length,
  contradicted: aResults.filter((result) => result.verdict === 'contradicted')
    .length,
  wrongIdentity: aResults.filter(
    (result) => result.verdict === 'wrong-identity',
  ).length,
  disagreements: comparisons.filter((comparison) =>
    ['partial-disagreement', 'direct-contradiction'].includes(
      comparison.agreement,
    ),
  ).length,
  corrections: correctionClaims.size,
  humanApproved: 0 as const,
  published: 0 as const,
};
const agentAttempts = rawRuns.agentAttempts.map((attempt) =>
  SemanticAgentAttemptSchema.parse(attempt),
);
const reportInput = {
  schemaVersion: '1' as const,
  datasetId: rawRuns.datasetId,
  snapshotDate: rawRuns.snapshotDate,
  generatedAt: GENERATED_AT,
  packetCount: packets.length,
  packets,
  invocations: validInvocations,
  failedInvocations,
  comparisons,
  agentAttempts,
  summary,
  notes: [
    'This report records local model inference, not human editorial approval.',
    'The working runtime exposed a run ID but no runner session ID; sessionId is recorded as null rather than fabricated.',
    'Failed, unavailable, timeout, duplicate, and invalid-citation attempts remain in failedInvocations and are not counted as findings.',
    'The previous deterministic audit is historical context only and is not reused as a semantic verdict.',
  ],
};
const report: SemanticReviewReport = validateSemanticReviewReport(reportInput);
writeJson(REPORT_PATH, report);

const findingRows = packets.map((packet) => ({
  claimId: packet.claimId,
  candidateId: packet.candidateId,
  candidateName: packet.candidateName,
  claim: packet.claim,
  packetId: packet.packetId,
  packetSha256: packet.packetSha256,
  reviewerA: reviewerA.get(packet.claimId)?.result ?? null,
  reviewerB: reviewerB.get(packet.claimId)?.result ?? null,
  comparison: comparisons.find((item) => item.claimId === packet.claimId),
  execution: {
    reviewerA: reviewerA.has(packet.claimId)
      ? 'completed-valid'
      : 'missing-or-failed',
    reviewerB: reviewerB.has(packet.claimId)
      ? 'completed-valid'
      : 'missing-or-failed',
  },
}));
writeJson(FINDINGS_PATH, {
  schemaVersion: '1',
  datasetId: report.datasetId,
  snapshotDate: report.snapshotDate,
  generatedAt: report.generatedAt,
  findings: findingRows,
});

const disagreementRows = comparisons.filter((comparison) =>
  ['partial-disagreement', 'direct-contradiction'].includes(
    comparison.agreement,
  ),
);
writeJson(DISAGREEMENTS_PATH.replace(/\.md$/u, '.json'), {
  schemaVersion: '1',
  disagreements: disagreementRows,
});
const disagreementMarkdown = [
  '# Semantic review disagreements',
  '',
  `- Claims reviewed in pairs: ${report.summary.completedPairs}`,
  `- Partial/direct disagreements: ${disagreementRows.length}`,
  '- These are model-review comparisons, not human decisions; no disagreement is auto-resolved.',
  '',
  ...disagreementRows.flatMap((comparison) => [
    `## ${comparison.claimId}`,
    `- Agreement class: ${comparison.agreement}`,
    `- Reviewer A: ${comparison.verdictA ?? 'unavailable'}; Reviewer B: ${comparison.verdictB ?? 'unavailable'}`,
    `- Dimensions: ${comparison.differenceDimensions.join(', ') || 'none'}`,
    ...comparison.disputedPropositions.map((item) => `- Disputed: ${item}`),
    `- Recommendation: ${comparison.adjudicationRecommendation}`,
    '',
  ]),
];
writeFileSync(DISAGREEMENTS_PATH, `${disagreementMarkdown.join('\n')}\n`);

const correctionRows = validInvocations.flatMap((invocation) =>
  invocation.result?.proposedCorrection
    ? [
        {
          claimId: invocation.claimId,
          reviewerRole: invocation.reviewerRole,
          correction: invocation.result.proposedCorrection,
        },
      ]
    : [],
);
const correctionMarkdown = [
  '# Semantic review corrections',
  '',
  `- Model-proposed corrections: ${correctionRows.length}`,
  '- Proposed wording is advisory only. No normalized, approved, decision, or published layer was modified.',
  '',
  ...correctionRows.flatMap((row) => [
    `## ${row.claimId} (${row.reviewerRole})`,
    `- Original: ${row.correction.originalWording}`,
    `- Proposed: ${row.correction.proposedWording}`,
    `- Rationale: ${row.correction.rationale}`,
    `- Sources: ${row.correction.sourceIds.join(', ')}`,
    `- Evidence: ${row.correction.evidenceIds.join(', ')}`,
    '',
  ]),
];
writeFileSync(CORRECTIONS_PATH, `${correctionMarkdown.join('\n')}\n`);

const previousGapsPath = resolve(ROOT, 'reports/remaining-evidence-gaps.md');
const previousGaps = readFileSync(previousGapsPath, 'utf8')
  .split('\n')
  .filter((line) => line.startsWith('- enrich-claim-'));
const blockerMarkdown = [
  '# Semantic review blockers',
  '',
  `- Previous deterministic blocker rows retained: ${previousGaps.length}`,
  `- Current model-review failed/invalid attempts: ${report.summary.failedInvocations}`,
  `- Current paired disagreements: ${disagreementRows.length}`,
  '- A model finding never clears a human/editorial blocker by itself. Every prior row remains claim-linked and requires human disposition or additional evidence.',
  '',
  ...previousGaps.map((line) => {
    const claimId =
      line.match(/^- (enrich-claim-\\d+)/u)?.[1] ?? 'unknown-claim';
    const comparison = comparisons.find((item) => item.claimId === claimId);
    const status =
      comparison?.agreement === 'full-agreement'
        ? 'model-addressed-but-human-review-remains'
        : 'remains-open';
    return `- ${status}: ${line.slice(2)}`;
  }),
];
writeFileSync(BLOCKERS_PATH, `${blockerMarkdown.join('\n')}\n`);

const candidateCounts = new Map<
  string,
  {
    name: string;
    claims: number;
    a: number;
    b: number;
    pairs: number;
    disagreements: number;
  }
>();
for (const packet of packets) {
  const row = candidateCounts.get(packet.candidateId) ?? {
    name: packet.candidateName,
    claims: 0,
    a: 0,
    b: 0,
    pairs: 0,
    disagreements: 0,
  };
  const comparison = comparisons.find(
    (item) => item.claimId === packet.claimId,
  );
  row.claims += 1;
  if (reviewerA.has(packet.claimId)) row.a += 1;
  if (reviewerB.has(packet.claimId)) row.b += 1;
  if (comparison?.agreement !== 'unavailable') row.pairs += 1;
  if (
    comparison &&
    ['partial-disagreement', 'direct-contradiction'].includes(
      comparison.agreement,
    )
  )
    row.disagreements += 1;
  candidateCounts.set(packet.candidateId, row);
}
const coverageMarkdown = [
  '# Semantic review coverage',
  '',
  `- Claims in immutable packets: ${report.packetCount}`,
  `- Reviewer A valid findings: ${report.summary.reviewerASuccessful}`,
  `- Reviewer B valid findings: ${report.summary.reviewerBSuccessful}`,
  `- Completed pairs: ${report.summary.completedPairs}`,
  `- Failed/invalid attempts retained: ${report.summary.failedInvocations}`,
  `- Human approvals: ${report.summary.humanApproved}`,
  `- Published claims: ${report.summary.published}`,
  '',
  '| Candidate | Claims | A valid | B valid | Pairs | Disagreements |',
  '| --- | ---: | ---: | ---: | ---: | ---: |',
  ...[...candidateCounts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([candidateId, row]) =>
        `| ${row.name} (${candidateId}) | ${row.claims} | ${row.a} | ${row.b} | ${row.pairs} | ${row.disagreements} |`,
    ),
  '',
  'Model findings remain advisory. They do not populate reviewer decisions or publication snapshots.',
];
writeFileSync(COVERAGE_PATH, `${coverageMarkdown.join('\n')}\n`);

const mode = process.argv[2] ?? 'report';
if (mode === 'validate' || mode === 'verify') {
  if (mode === 'verify') {
    if (
      report.packetCount !== 143 ||
      report.summary.reviewerASuccessful !== 143 ||
      report.summary.reviewerBSuccessful !== 143 ||
      report.summary.completedPairs !== 143 ||
      report.comparisons.length !== 143
    ) {
      throw new Error(
        `Semantic verification incomplete: packets=${report.packetCount}, A=${report.summary.reviewerASuccessful}, B=${report.summary.reviewerBSuccessful}, pairs=${report.summary.completedPairs}, comparisons=${report.comparisons.length}.`,
      );
    }
  }
  console.log(
    `Semantic ${mode} passed: ${report.packetCount} packets, ${report.summary.reviewerASuccessful}/${report.summary.reviewerBSuccessful} valid reviewer findings, ${report.summary.completedPairs} comparisons, ${report.summary.failedInvocations} retained failed attempts.`,
  );
} else {
  console.log(
    `Semantic report written: ${report.summary.reviewerASuccessful}/${report.summary.reviewerBSuccessful} valid reviewer findings, ${report.summary.completedPairs} comparisons.`,
  );
}
