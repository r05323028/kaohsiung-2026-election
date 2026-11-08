import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  type AuditCheck,
  type IndependentAIAuditReport,
  type IndependentAuditFinding,
  type IndependentAuditStatus,
  validateIndependentAuditReport,
} from '../src/data/enrichment/ai-audit';
import {
  type EnrichmentClaim,
  type EnrichmentEvidence,
  type EnrichmentIdentityObservation,
  type EnrichmentSourceAttempt,
  validateEnrichmentDataset,
} from '../src/data/enrichment/schema';

const ROOT = process.cwd();
const DATASET_PATH = 'data/enrichment/normalized/2026/zuoying-mayoral.json';
const PACKET_PATH = 'data/enrichment/review/2026/zuoying-mayoral-review.json';
const REPORT_PATH = 'reports/independent-ai-review.json';
const DISAGREEMENTS_PATH = 'reports/ai-review-disagreements.md';
const CORRECTIONS_PATH = 'reports/claim-corrections.md';
const GAPS_PATH = 'reports/remaining-evidence-gaps.md';
const SNAPSHOT_DATE = '2026-11-07';
const AGENT_RUN_ID = 'del_mw63q1yg_nogs';
const AGENT_RESULT_PATH =
  '/var/folders/0c/h8c1y10n1fs_xpx543p2zdyh0000gn/T/acp-delegate/del_mw63q1yg_nogs.out';
const SECOND_AGENT_RUN_ID = 'del_mw65rve6_jhey';
const SECOND_AGENT_RESULT_PATH =
  '/var/folders/0c/h8c1y10n1fs_xpx543p2zdyh0000gn/T/acp-delegate/del_mw65rve6_jhey.out';

interface CandidateSnapshot {
  candidateId: string;
  displayName: string;
}

interface SourceState {
  source: EnrichmentSourceAttempt;
  bytes: Buffer | null;
  rawText: string;
  actualSha256: string | null;
  actualByteLength: number | null;
  unchanged: boolean;
}

interface AuditContext {
  candidates: Map<string, CandidateSnapshot>;
  sources: Map<string, SourceState>;
  evidence: Map<string, EnrichmentEvidence>;
  observations: Map<string, EnrichmentIdentityObservation>;
  duplicateClaimIds: Set<string>;
}

function readJson<T>(path: string): T {
  try {
    return JSON.parse(readFileSync(resolve(ROOT, path), 'utf8')) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not read JSON ${path}: ${message}`);
  }
}

function writeJson(path: string, value: unknown): void {
  const absolute = resolve(ROOT, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/giu, ' ')
    .replace(/&amp;/giu, '&')
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>')
    .replace(/&#(\d+);/gu, (_match, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/&#x([0-9a-f]+);/giu, (_match, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    );
}

function visibleText(value: string): string {
  return decodeEntities(
    value
      .replace(/<script[\s\S]*?<\/script>/giu, ' ')
      .replace(/<style[\s\S]*?<\/style>/giu, ' ')
      .replace(/<!--[\s\S]*?-->/gu, ' ')
      .replace(/<[^>]+>/gu, ' '),
  ).replace(/\s+/gu, ' ');
}

function compact(value: string): string {
  return visibleText(value)
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function anchors(value: string): string[] {
  const normalized = compact(value);
  if (normalized.length === 0) return [];
  if (normalized.length <= 18) return [normalized];
  return [
    normalized.slice(0, 32),
    normalized.slice(-32),
    normalized.slice(0, Math.min(72, normalized.length)),
  ];
}

function containsAnchor(haystack: string, value: string): boolean {
  const normalizedHaystack = compact(haystack);
  return anchors(value).some(
    (anchor) => anchor.length >= 4 && normalizedHaystack.includes(anchor),
  );
}

function textSupportsClaim(
  claim: EnrichmentClaim,
  evidence: EnrichmentEvidence,
  rawText: string,
  candidateName: string,
): boolean {
  if (independentTextSupportsClaim(claim, evidence, rawText, candidateName)) {
    return true;
  }
  const evidenceSupport = containsAnchor(rawText, evidence.excerpt);
  const valueSupport = containsAnchor(rawText, claim.value);
  const evidenceValueSupport = containsAnchor(evidence.excerpt, claim.value);
  const identitySupport = containsAnchor(rawText, candidateName);
  return (
    (evidenceSupport || valueSupport || evidenceValueSupport) && identitySupport
  );
}

function independentTextSupportsClaim(
  claim: EnrichmentClaim,
  evidence: EnrichmentEvidence,
  rawText: string,
  candidateName: string,
): boolean {
  const raw = compact(rawText);
  const name = compact(candidateName);
  const excerpt = compact(evidence.excerpt);
  const value = compact(claim.value);
  const excerptAnchor = excerpt.length > 48 ? excerpt.slice(0, 48) : excerpt;
  const valueAnchor = value.length > 48 ? value.slice(0, 48) : value;
  const namePresent = name.length >= 2 && raw.includes(name);
  const excerptPresent =
    excerptAnchor.length >= 4 && raw.includes(excerptAnchor);
  const valuePresent = valueAnchor.length >= 4 && raw.includes(valueAnchor);
  return namePresent && (excerptPresent || valuePresent);
}

function loadContext(
  dataset: ReturnType<typeof validateEnrichmentDataset>,
): AuditContext {
  const packet = readJson<{
    candidates: Array<{ candidateId: string; displayName: string }>;
  }>(PACKET_PATH);
  const candidates = new Map(
    packet.candidates.map((candidate) => [candidate.candidateId, candidate]),
  );
  const sources = new Map<string, SourceState>();
  for (const source of dataset.sourceAttempts) {
    if (sources.has(source.sourceId)) continue;
    if (!source.rawPath || !source.sha256 || source.byteLength === null) {
      sources.set(source.sourceId, {
        source,
        bytes: null,
        rawText: '',
        actualSha256: null,
        actualByteLength: null,
        unchanged: false,
      });
      continue;
    }
    const absolute = resolve(ROOT, source.rawPath);
    if (!existsSync(absolute)) {
      sources.set(source.sourceId, {
        source,
        bytes: null,
        rawText: '',
        actualSha256: null,
        actualByteLength: null,
        unchanged: false,
      });
      continue;
    }
    const bytes = readFileSync(absolute);
    const actualSha256 = sha256(bytes);
    sources.set(source.sourceId, {
      source,
      bytes,
      rawText: bytes.toString('utf8'),
      actualSha256,
      actualByteLength: statSync(absolute).size,
      unchanged:
        actualSha256 === source.sha256 &&
        statSync(absolute).size === source.byteLength,
    });
  }
  const duplicateClaimIds = new Set(
    dataset.duplicateGroups.flatMap((group) => group.claimIds),
  );
  return {
    candidates,
    sources,
    evidence: new Map(dataset.evidence.map((item) => [item.evidenceId, item])),
    observations: new Map(
      dataset.observations.map((item) => [item.observationId, item]),
    ),
    duplicateClaimIds,
  };
}

function sourceStates(
  claim: EnrichmentClaim,
  context: AuditContext,
): SourceState[] {
  return claim.sourceIds
    .map((sourceId) => context.sources.get(sourceId))
    .filter((source): source is SourceState => source !== undefined);
}

function claimEvidence(
  claim: EnrichmentClaim,
  context: AuditContext,
): EnrichmentEvidence[] {
  return claim.evidenceIds
    .map((evidenceId) => context.evidence.get(evidenceId))
    .filter(
      (evidence): evidence is EnrichmentEvidence => evidence !== undefined,
    );
}

function claimObservations(
  claim: EnrichmentClaim,
  context: AuditContext,
): EnrichmentIdentityObservation[] {
  return claim.identityObservationIds
    .map((observationId) => context.observations.get(observationId))
    .filter(
      (observation): observation is EnrichmentIdentityObservation =>
        observation !== undefined,
    );
}

function temporalCheck(
  claim: EnrichmentClaim,
  sources: SourceState[],
): { check: AuditCheck['temporal']; blocker: string | null } {
  if (
    claim.currentStatus === 'current' &&
    sources.some(
      ({ source }) =>
        source.timestampQuality !== 'source-header' &&
        source.timestampQuality !== 'execution-record',
    )
  ) {
    return {
      check: 'currentness-needs-review',
      blocker: 'currentness-requires-a-dated-source-version',
    };
  }
  if (claim.temporalPrecision === 'unknown') {
    return { check: 'unknown', blocker: 'temporal-scope-or-date-is-unknown' };
  }
  return { check: 'dated', blocker: null };
}

function riskBlockers(
  claim: EnrichmentClaim,
  context: AuditContext,
  sources: SourceState[],
): string[] {
  const blockers: string[] = [];
  const temporal = temporalCheck(claim, sources);
  if (temporal.blocker) blockers.push(temporal.blocker);
  if (claim.attribution === 'candidate-statement') {
    blockers.push('candidate-attribution-requires-human-confirmation');
  }
  if (claim.attribution === 'news-report') {
    blockers.push('reported-attribution-requires-human-review');
  }
  if (claim.category === 'relationships') {
    blockers.push('sensitive-relationship-claim-requires-human-review');
  }
  if (
    claim.claimType === 'administrative-outcome' &&
    claim.sourceIds.length < 2
  ) {
    blockers.push('independent-evidence-required-for-administrative-outcome');
  }
  if (context.duplicateClaimIds.has(claim.claimId)) {
    blockers.push('duplicate-or-overlap-group-requires-human-disposition');
  }
  if (claim.currentStatus === 'current' && sources.length === 0) {
    blockers.push('current-claim-has-no-retrieved-source');
  }
  return blockers;
}

function firstPass(
  claim: EnrichmentClaim,
  context: AuditContext,
): {
  status: IndependentAuditStatus;
  checks: AuditCheck;
  rationale: string;
  blockers: string[];
} {
  const candidate = context.candidates.get(claim.candidateId);
  const evidence = claimEvidence(claim, context);
  const observations = claimObservations(claim, context);
  const sources = sourceStates(claim, context);
  const sourceUnchanged =
    sources.length === claim.sourceIds.length &&
    sources.every(({ unchanged }) => unchanged);
  const identityResolved =
    observations.length === claim.identityObservationIds.length &&
    observations.length > 0 &&
    observations.every(
      (observation) =>
        observation.identityStatus === 'resolved' &&
        observation.candidateIds.includes(claim.candidateId) &&
        !observation.isNameOnlyMatch,
    );
  const attributionConsistent =
    evidence.length === claim.evidenceIds.length &&
    evidence.every((item) => item.attribution === claim.attribution);
  const rawSupport =
    candidate !== undefined &&
    evidence.length > 0 &&
    sources.length > 0 &&
    evidence.every((item) => {
      const source = context.sources.get(item.sourceId);
      return (
        source !== undefined &&
        textSupportsClaim(claim, item, source.rawText, candidate.displayName)
      );
    });
  const temporal = temporalCheck(claim, sources);
  const blockers = riskBlockers(claim, context, sources);
  if (!sourceUnchanged)
    blockers.push('raw-source-checksum-or-byte-length-mismatch');
  if (!identityResolved) blockers.push('identity-observation-is-not-resolved');
  if (!attributionConsistent)
    blockers.push('claim-and-evidence-attribution-mismatch');
  if (!rawSupport)
    blockers.push('claim-text-could-not-be-reopened-in-retained-source');
  const unsupported =
    !sourceUnchanged ||
    !identityResolved ||
    !attributionConsistent ||
    !rawSupport;
  const status: IndependentAuditStatus = unsupported
    ? 'unsupported'
    : blockers.length > 0
      ? 'needs-review'
      : 'machine-verified';
  const checks: AuditCheck = {
    sourceReopened: sourceUnchanged ? 'unchanged' : 'mismatch',
    evidenceSupport: rawSupport ? 'direct-and-reopened' : 'not-supported',
    identity: identityResolved ? 'resolved' : 'ambiguous',
    attribution: attributionConsistent ? 'consistent' : 'mismatch',
    temporal: temporal.check,
    overstatement:
      claim.claimType === 'administrative-outcome' && claim.sourceIds.length < 2
        ? 'needs-review'
        : 'not-detected',
  };
  const reason =
    status === 'machine-verified'
      ? 'Retained raw source bytes, direct evidence, resolved identity, and attribution all reopened consistently; no deterministic blocker was found.'
      : status === 'unsupported'
        ? 'At least one required source, identity, attribution, or raw-evidence check failed; this claim must not be treated as supported by this audit.'
        : `The retained source and evidence support the claim text, but human review remains required for: ${blockers.join('; ')}.`;
  return { status, checks, rationale: reason, blockers };
}

function independentPass(
  claim: EnrichmentClaim,
  context: AuditContext,
): { status: IndependentAuditStatus; rationale: string } {
  const candidate = context.candidates.get(claim.candidateId);
  const evidence = claimEvidence(claim, context);
  const observations = claimObservations(claim, context);
  const sources = sourceStates(claim, context);
  const sourceUnchanged =
    sources.length === claim.sourceIds.length &&
    sources.every(({ unchanged }) => unchanged);
  const identityResolved = observations.every(
    (observation) =>
      observation.identityStatus === 'resolved' &&
      observation.candidateIds.includes(claim.candidateId) &&
      !observation.isNameOnlyMatch,
  );
  const rawSupport =
    candidate !== undefined &&
    evidence.length > 0 &&
    evidence.every((item) => {
      const source = context.sources.get(item.sourceId);
      return (
        source !== undefined &&
        independentTextSupportsClaim(
          claim,
          item,
          source.rawText,
          candidate.displayName,
        )
      );
    });
  if (!sourceUnchanged || !identityResolved || !rawSupport) {
    return {
      status: 'unsupported',
      rationale:
        'Independent pass could not satisfy raw checksum, resolved identity, and candidate-name-plus-evidence anchors together.',
    };
  }
  const highRisk =
    claim.temporalPrecision === 'unknown' ||
    claim.currentStatus === 'current' ||
    claim.attribution !== 'institutional-record' ||
    claim.category === 'relationships' ||
    claim.claimType === 'administrative-outcome';
  return {
    status: highRisk ? 'needs-review' : 'machine-verified',
    rationale: highRisk
      ? 'Independent raw reopen supports the claim and identity, but temporal, currentness, attribution, relationship, or outcome context remains review-sensitive.'
      : 'Independent raw reopen found the candidate identity and claim/evidence anchors with unchanged source bytes.',
  };
}

function buildFinding(
  claim: EnrichmentClaim,
  context: AuditContext,
): IndependentAuditFinding {
  const first = firstPass(claim, context);
  const second = independentPass(claim, context);
  const comparison = first.status === second.status ? 'agree' : 'disagree';
  return {
    findingId: `independent-audit-${claim.claimId}`,
    claimId: claim.claimId,
    candidateId: claim.candidateId,
    category: claim.category,
    claimType: claim.claimType,
    firstPassStatus: first.status,
    firstPassMethod: 'reopen-and-rule-audit-v1',
    secondPassStatus: second.status,
    secondPassMethod: 'independent-reopen-and-rule-audit-v1',
    comparison,
    rationale: first.rationale,
    secondPassRationale: second.rationale,
    sourceIds: claim.sourceIds,
    evidenceIds: claim.evidenceIds,
    identityObservationIds: claim.identityObservationIds,
    checks: first.checks,
    blockers: first.blockers,
    corrections: [],
  };
}

function countStatuses(
  findings: IndependentAuditFinding[],
  key: 'firstPassStatus' | 'secondPassStatus',
): Record<string, number> {
  return findings.reduce<Record<string, number>>((counts, finding) => {
    const status = finding[key];
    counts[status] = (counts[status] ?? 0) + 1;
    return counts;
  }, {});
}

function buildReport(): IndependentAIAuditReport {
  const dataset = validateEnrichmentDataset(readJson<unknown>(DATASET_PATH));
  if (dataset.snapshotDate !== SNAPSHOT_DATE) {
    throw new Error(
      `Expected scoped enrichment snapshot ${SNAPSHOT_DATE}, received ${dataset.snapshotDate}.`,
    );
  }
  const context = loadContext(dataset);
  const findings = dataset.claims.map((claim) => buildFinding(claim, context));
  const sourceReopenMismatches = findings.filter(
    (finding) => finding.checks.sourceReopened === 'mismatch',
  ).length;
  const comparison = findings.reduce(
    (counts, finding) => {
      counts[finding.comparison] += 1;
      return counts;
    },
    { agree: 0, disagree: 0, unavailable: 0 },
  );
  const corrections = findings.reduce(
    (count, finding) => count + finding.corrections.length,
    0,
  );
  const blockerCount = findings.reduce(
    (count, finding) => count + finding.blockers.length,
    0,
  );
  return {
    reportId: 'kaohsiung-2026-zuoying-mayoral-independent-ai-review',
    datasetId: dataset.datasetId,
    snapshotDate: dataset.snapshotDate,
    generatedAt: new Date().toISOString(),
    methods: {
      firstPass: 'reopen-and-rule-audit-v1',
      secondPass: 'independent-reopen-and-rule-audit-v1',
      rawSourcePolicy: 'read-only-reopen-with-sha256-and-byte-length',
    },
    independentAgentAttempt: {
      status: 'unavailable',
      agent: 'reviewer',
      runId: AGENT_RUN_ID,
      resultPath: AGENT_RESULT_PATH,
      limitation:
        'ACP reviewer reported that its file-execution tool was unavailable and could not inspect the repository; no agent findings were used.',
    },
    independentAgentAttempts: [
      {
        status: 'unavailable',
        agent: 'reviewer',
        runId: AGENT_RUN_ID,
        resultPath: AGENT_RESULT_PATH,
        limitation:
          'ACP reviewer reported that its file-execution tool was unavailable and could not inspect the repository; no agent findings were used.',
      },
      {
        status: 'unavailable',
        agent: 'reviewer',
        runId: SECOND_AGENT_RUN_ID,
        resultPath: SECOND_AGENT_RESULT_PATH,
        limitation:
          'A changed-approach ACP reviewer was also unable to access repository tools and produced no findings.',
      },
    ],
    findings,
    summary: {
      claimCount: 143,
      firstPass: countStatuses(findings, 'firstPassStatus'),
      secondPass: countStatuses(findings, 'secondPassStatus'),
      comparison,
      sourceReopenMismatches,
      unsupportedClaims: findings.filter(
        (finding) => finding.firstPassStatus === 'unsupported',
      ).length,
      needsReviewClaims: findings.filter(
        (finding) => finding.firstPassStatus === 'needs-review',
      ).length,
      correctionCount: corrections,
      blockerCount,
    },
    notes: [
      'This is an offline evidence audit, not human editorial approval or publication.',
      'The second pass is an independently structured deterministic raw-reopen pass; two separate ACP reviewer attempts were unavailable and did not supply findings.',
      'Every finding is linked to an existing claim ID. No raw source bytes or publication layers were changed.',
      'A needs-review result means source support was found but editorial, temporal, attribution, or sensitivity review remains required.',
      'An unsupported result is unsafe for publication until evidence or identity is repaired; it is not a claim that the fact is false.',
    ],
  };
}

function writeMarkdownReports(report: IndependentAIAuditReport): void {
  const disagreements = report.findings.filter(
    (finding) => finding.comparison === 'disagree',
  );
  const corrections = report.findings.flatMap((finding) =>
    finding.corrections.map((correction) => ({ finding, correction })),
  );
  const gaps = report.findings.filter((finding) => finding.blockers.length > 0);
  const disagreementLines = disagreements.length
    ? disagreements.map(
        (finding) =>
          `- ${finding.claimId}: first=${finding.firstPassStatus}, second=${finding.secondPassStatus}; ${finding.rationale} Independent: ${finding.secondPassRationale}`,
      )
    : ['- None. The two deterministic machine passes agreed on every claim.'];
  const correctionLines = corrections.length
    ? corrections.map(
        ({ finding, correction }) =>
          `- ${finding.claimId} — ${correction.field}: ${correction.proposedValue}; ${correction.rationale} Sources: ${correction.sourceIds.join(', ')}; evidence: ${correction.evidenceIds.join(', ')}.`,
      )
    : [
        '- No correction is proposed. The audit found no clearly evidence-backed field correction that could be made without editorial confirmation.',
      ];
  const gapLines = gaps.length
    ? gaps.map(
        (finding) =>
          `- ${finding.claimId} (${finding.category}/${finding.claimType}): ${finding.blockers.join('; ')}. Source refs: ${finding.sourceIds.join(', ')}; evidence refs: ${finding.evidenceIds.join(', ')}.`,
      )
    : ['- No deterministic blockers were found.'];
  writeFileSync(
    resolve(ROOT, DISAGREEMENTS_PATH),
    [
      '# AI review disagreements',
      '',
      `- Claims audited: ${report.summary.claimCount}`,
      `- Deterministic pass agreement: ${report.summary.comparison.agree}`,
      `- Deterministic pass disagreement: ${report.summary.comparison.disagree}`,
      `- Comparisons unavailable: ${report.summary.comparison.unavailable}`,
      '',
      'Both ACP reviewer attempts were unavailable; this report compares two separately structured offline reopen/rule passes and does not call either pass human or model approval.',
      '',
      ...disagreementLines,
      '',
    ].join('\n'),
    'utf8',
  );
  writeFileSync(
    resolve(ROOT, CORRECTIONS_PATH),
    [
      '# Claim corrections',
      '',
      `- Claims audited: ${report.summary.claimCount}`,
      `- Evidence-backed correction suggestions: ${corrections.length}`,
      '',
      'Only corrections linked to an existing claim, retained source, and evidence are listed. No correction is automatically applied to normalized or publication data.',
      '',
      ...correctionLines,
      '',
    ].join('\n'),
    'utf8',
  );
  writeFileSync(
    resolve(ROOT, GAPS_PATH),
    [
      '# Remaining evidence gaps',
      '',
      `- Claims with one or more audit blockers: ${gaps.length}`,
      `- Total blocker findings: ${report.summary.blockerCount}`,
      `- Unsupported first-pass claims: ${report.summary.unsupportedClaims}`,
      '',
      'A blocker is a review or evidence limitation, not negative evidence. Every row remains tied to an existing claim ID and source/evidence references.',
      '',
      ...gapLines,
      '',
    ].join('\n'),
    'utf8',
  );
}

function execute(): IndependentAIAuditReport {
  const report = buildReport();
  writeJson(REPORT_PATH, report);
  writeMarkdownReports(report);
  return report;
}

function validatePersisted(): IndependentAIAuditReport {
  const report = validateIndependentAuditReport(readJson<unknown>(REPORT_PATH));
  const dataset = validateEnrichmentDataset(readJson<unknown>(DATASET_PATH));
  const datasetIds = new Set(dataset.claims.map((claim) => claim.claimId));
  const reportIds = new Set(report.findings.map((finding) => finding.claimId));
  if (
    datasetIds.size !== reportIds.size ||
    [...datasetIds].some((id) => !reportIds.has(id))
  ) {
    throw new Error(
      'Independent audit findings do not cover exactly the normalized claim IDs.',
    );
  }
  const context = loadContext(dataset);
  for (const finding of report.findings) {
    for (const sourceId of finding.sourceIds) {
      const source = context.sources.get(sourceId);
      if (!source?.unchanged) {
        throw new Error(
          `Audit source is not unchanged for ${finding.claimId}: ${sourceId}`,
        );
      }
    }
  }
  return report;
}

function verify(): void {
  const persisted = validatePersisted();
  const fresh = buildReport();
  const freshById = new Map(
    fresh.findings.map((finding) => [finding.claimId, finding]),
  );
  for (const finding of persisted.findings) {
    const current = freshById.get(finding.claimId);
    if (
      !current ||
      current.firstPassStatus !== finding.firstPassStatus ||
      current.secondPassStatus !== finding.secondPassStatus ||
      current.comparison !== finding.comparison ||
      current.sourceIds.join('|') !== finding.sourceIds.join('|')
    ) {
      throw new Error(
        `Independent audit verification changed for ${finding.claimId}.`,
      );
    }
  }
  console.log(
    `Independent audit verification passed: ${persisted.findings.length} claims, ${persisted.summary.comparison.agree} agreements, ${persisted.summary.comparison.disagree} disagreements, ${persisted.summary.unsupportedClaims} unsupported first-pass claims.`,
  );
}

function printReport(): void {
  const report = validatePersisted();
  console.log(
    `Independent audit report: ${report.summary.claimCount} claims, first pass ${JSON.stringify(report.summary.firstPass)}, second pass ${JSON.stringify(report.summary.secondPass)}, ${report.summary.comparison.disagree} disagreements, ${report.summary.correctionCount} corrections, ${report.summary.blockerCount} blocker findings.`,
  );
}

const command = process.argv[2] ?? 'execute';
if (command === 'execute' || command === 'normalize' || command === 'review') {
  const report = execute();
  console.log(
    `Independent audit complete: ${report.summary.claimCount} claims, ${report.summary.comparison.agree} deterministic agreements, ${report.summary.comparison.disagree} disagreements, ${report.summary.unsupportedClaims} unsupported first-pass claims.`,
  );
} else if (command === 'validate') {
  const report = validatePersisted();
  console.log(
    `Independent audit data valid: ${report.summary.claimCount} findings, ${report.summary.blockerCount} blocker findings, agent pass unavailable.`,
  );
} else if (command === 'verify') {
  verify();
} else if (command === 'report') {
  printReport();
} else {
  throw new Error(`Unknown command: ${command}`);
}
