import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import {
  assertClaimEvidence,
  type BiographyDataset,
  type BiographyPublishedClaim,
  validateBiographyDataset,
  validateBiographyReviewDataset,
} from '../src/data/biographies/schema';
import { evaluateEditorialPublicationGate } from '../src/data/editorial/gate';
import {
  activeDecisions,
  type EditorialDecisionSet,
  type EditorialReviewPacket,
  type PublicationGateReport,
  type PublicationSnapshot,
  type ReviewerRegistry,
  validateEditorialDecisionSet,
  validateEditorialReviewPacket,
  validatePublicationGateReport,
  validatePublicationSnapshot,
  validateReviewerRegistry,
} from '../src/data/editorial/schema';
import { validateEditorialDecisionIntegrity } from '../src/data/editorial/validation';

const root = process.cwd();
const normalizedPath = join(root, 'data/normalized/2026/biographies.json');
const reviewPath = join(root, 'data/review/2026/biographies-review.json');
const rosterPath = join(root, 'data/approved/2026/kaohsiung-election.json');
const registryPath = join(root, 'data/editorial/reviewer-registry.json');
const decisionsPath = join(
  root,
  'data/editorial/decisions/2026/biography-decisions.json',
);
const packetPath = join(
  root,
  'data/editorial/review-packet/2026/biography-review-packet.json',
);
const publishedPath = join(
  root,
  'data/published/2026/candidate-biographies.json',
);
const approvedPath = join(root, 'data/approved/2026/biographies.json');
const reportsPath = join(root, 'reports');

interface RosterCandidate {
  id: string;
  slug: string;
  displayName: string;
  districtId: string;
  electionType: 'mayoral' | 'city-council' | 'indigenous-council';
}

interface Roster {
  snapshotDate: string;
  candidates: RosterCandidate[];
}

function readJson(path: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  } catch (error) {
    throw new Error(
      `Unable to read JSON ${relative(root, path)}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function deterministicTimestamp(date: string): string {
  return `${date}T00:00:00.000Z`;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value))
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

function loadNormalized(): BiographyDataset {
  const dataset = validateBiographyDataset(readJson(normalizedPath));
  assertClaimEvidence(dataset);
  return dataset;
}

function loadRoster(): Roster {
  // SAFETY: the approved roster is validated by the existing full-roster gate; this local shape only selects packet fields.
  const roster = readJson(rosterPath) as unknown as Roster;
  if (!Array.isArray(roster.candidates))
    throw new Error('Roster candidates are missing.');
  return roster;
}

function loadRegistry(): ReviewerRegistry {
  return validateReviewerRegistry(readJson(registryPath));
}

function loadDecisions(): EditorialDecisionSet {
  return validateEditorialDecisionSet(readJson(decisionsPath));
}

function loadPacket(): EditorialReviewPacket {
  return validateEditorialReviewPacket(readJson(packetPath));
}

function makePacket(): EditorialReviewPacket {
  const dataset = loadNormalized();
  const review = validateBiographyReviewDataset(readJson(reviewPath));
  const roster = loadRoster();
  return {
    packetId: 'kaohsiung-2026-candidate-biographies-editorial-packet',
    snapshotDate: dataset.snapshotDate,
    generatedAt: deterministicTimestamp(dataset.snapshotDate),
    schemaVersion: '1',
    candidates: roster.candidates.map((candidate) => ({
      candidateId: candidate.id,
      displayName: candidate.displayName,
      districtId: candidate.districtId,
      electionType: candidate.electionType,
      slug: candidate.slug,
    })),
    claims: dataset.claims,
    evidence: dataset.evidence,
    sources: dataset.sources,
    observations: dataset.observations,
    conflicts: dataset.conflicts,
    reviewItems: review.items,
  };
}

function evaluateGate(
  dataset: BiographyDataset,
  decisionSet: EditorialDecisionSet,
): PublicationGateReport {
  return evaluateEditorialPublicationGate(
    dataset,
    decisionSet,
    loadRegistry(),
    loadPacket(),
  );
}

function writeGateReports(report: PublicationGateReport): void {
  validatePublicationGateReport(report);
  writeJson(join(reportsPath, 'publication-gate.json'), report);
  const markdown = [
    '# Biography publication gate',
    '',
    `- Snapshot: ${report.snapshotDate}`,
    `- Claims: ${report.totalClaims}`,
    `- Eligible: ${report.eligibleClaims}`,
    `- Blocked: ${report.blockedClaims}`,
    '',
    '## Blockers',
    '',
    ...Object.entries(report.blockers).map(
      ([key, count]) => `- ${key}: ${count}`,
    ),
    '',
    'Each entry retains claim-level reasons in `publication-gate.json`.',
  ].join('\n');
  writeFileSync(
    join(reportsPath, 'publication-gate.md'),
    `${markdown}\n`,
    'utf8',
  );
}

function writeReviewReports(
  dataset: BiographyDataset,
  decisions: EditorialDecisionSet,
): void {
  const active = activeDecisions(decisions.decisions);
  const claimDecisions = active.filter(
    (decision) => decision.subjectType === 'claim',
  );
  const identityDecisions = active.filter(
    (decision) => decision.subjectType === 'identity',
  );
  const summary = {
    datasetId: dataset.datasetId,
    snapshotDate: dataset.snapshotDate,
    totalClaims: dataset.claims.length,
    claimDecisions: claimDecisions.length,
    approvedClaims: claimDecisions.filter(
      (decision) => decision.resultingState === 'approved',
    ).length,
    rejectedClaims: claimDecisions.filter(
      (decision) => decision.resultingState === 'rejected',
    ).length,
    disputedClaims: claimDecisions.filter(
      (decision) => decision.resultingState === 'disputed',
    ).length,
    deferredClaims: claimDecisions.filter(
      (decision) => decision.resultingState === 'unreviewed',
    ).length,
    unresolvedClaims: dataset.claims.length - claimDecisions.length,
    identityDecisions: identityDecisions.length,
    reviewerIds: [...new Set(active.map((decision) => decision.reviewerId))],
    note: 'Machine validation and editorial review are measured separately; no decision proves reviewer identity beyond the local registry.',
  };
  const identity = {
    datasetId: dataset.datasetId,
    snapshotDate: dataset.snapshotDate,
    totalConflicts: dataset.conflicts.length,
    resolvedConflicts: dataset.conflicts.filter((conflict) => {
      const decision = active.find(
        (candidate) =>
          candidate.subjectType === 'identity' &&
          candidate.subjectId === conflict.conflictId,
      );
      return (
        decision?.decision === 'confirm-same' ||
        decision?.decision === 'confirm-different'
      );
    }).length,
    unresolvedConflicts:
      dataset.conflicts.length -
      dataset.conflicts.filter((conflict) =>
        active.some(
          (decision) =>
            decision.subjectType === 'identity' &&
            decision.subjectId === conflict.conflictId &&
            ['confirm-same', 'confirm-different'].includes(decision.decision),
        ),
      ).length,
    decisions: identityDecisions,
    note: 'No name-only merge is accepted. Identity reversal blocks dependent claims until a later, explicitly superseding decision resolves the subject.',
  };
  writeJson(join(reportsPath, 'editorial-review-summary.json'), summary);
  writeJson(join(reportsPath, 'identity-review-summary.json'), identity);
  writeFileSync(
    join(reportsPath, 'editorial-review-summary.md'),
    `# Editorial review summary\n\n- Snapshot: ${dataset.snapshotDate}\n- Machine claims: ${summary.totalClaims}\n- Claim decisions: ${summary.claimDecisions}\n- Approved decisions: ${summary.approvedClaims}\n- Rejected decisions: ${summary.rejectedClaims}\n- Disputed decisions: ${summary.disputedClaims}\n- Unresolved claims: ${summary.unresolvedClaims}\n- Active reviewers: ${summary.reviewerIds.length}\n\nMachine extraction is not editorial approval.\n`,
    'utf8',
  );
  writeFileSync(
    join(reportsPath, 'identity-review-summary.md'),
    `# Identity review summary\n\n- Snapshot: ${dataset.snapshotDate}\n- Existing identity conflicts: ${identity.totalConflicts}\n- Resolved by explicit decision: ${identity.resolvedConflicts}\n- Unresolved: ${identity.unresolvedConflicts}\n\nNo name-only merge is accepted.\n`,
    'utf8',
  );
}

function buildPublicationRecords(
  dataset: BiographyDataset,
  gate: PublicationGateReport,
  decisions: EditorialDecisionSet,
): BiographyPublishedClaim[] {
  const active = new Map(
    activeDecisions(decisions.decisions).map((decision) => [
      `${decision.subjectType}:${decision.subjectId}`,
      decision,
    ]),
  );
  const eligibleIds = new Set(
    gate.entries
      .filter((entry) => entry.eligible)
      .map((entry) => entry.claimId),
  );
  return dataset.claims
    .filter((claim) => eligibleIds.has(claim.claimId))
    .map((claim) => {
      const decision = active.get(`claim:${claim.claimId}`);
      if (!decision)
        throw new Error(`Missing approval decision for ${claim.claimId}.`);
      const { reviewerId, reviewedAt, ...publicClaim } = claim;
      void reviewerId;
      void reviewedAt;
      return {
        ...publicClaim,
        humanReviewStatus: 'human-reviewed' as const,
        editorialStatus: 'editorially-approved' as const,
        publicationStatus: 'approved-static' as const,
      };
    })
    .sort((left, right) => left.claimId.localeCompare(right.claimId));
}

function buildPublicationSnapshot(
  dataset: BiographyDataset,
  gate: PublicationGateReport,
  decisions: EditorialDecisionSet,
): PublicationSnapshot {
  const records = buildPublicationRecords(dataset, gate, decisions);
  const active = new Map(
    activeDecisions(decisions.decisions).map((decision) => [
      `${decision.subjectType}:${decision.subjectId}`,
      decision,
    ]),
  );
  const hashes = new Map(
    dataset.sources.flatMap((source) =>
      source.sha256 ? [[source.sourceId, source.sha256] as const] : [],
    ),
  );
  const sourceVersions = [
    ...new Set(records.flatMap((claim) => claim.sourceIds)),
  ]
    .sort()
    .map((sourceId) => ({ sourceId, sha256: hashes.get(sourceId) ?? '' }))
    .filter((source) => source.sha256.length > 0);
  const decisionIds = records
    .flatMap((claim) => {
      const claimDecision = active.get(`claim:${claim.claimId}`);
      const conflict = dataset.conflicts.find(
        (item) => item.candidateId === claim.candidateId,
      );
      const identitySubjectId =
        conflict?.conflictId ?? `candidate:${claim.candidateId}`;
      const identityDecision = active.get(`identity:${identitySubjectId}`);
      return [claimDecision?.decisionId, identityDecision?.decisionId].filter(
        (value): value is string => Boolean(value),
      );
    })
    .sort();
  const withoutChecksum = {
    datasetId: 'kaohsiung-2026-candidate-biographies-publication' as const,
    snapshotDate: dataset.snapshotDate,
    generatedAt: deterministicTimestamp(dataset.snapshotDate),
    schemaVersion: '1' as const,
    approvedClaimIds: records.map((claim) => claim.claimId),
    sourceVersions,
    decisionIds: [...new Set(decisionIds)],
    records,
    note: 'Only claims that pass the identity, evidence, reviewer authorization, source-version, and conflict gates are published.',
  };
  return {
    ...withoutChecksum,
    checksum: sha256(canonicalJson(withoutChecksum)),
  };
}

function assertPublicationSnapshotIntegrity(
  snapshot: PublicationSnapshot,
  dataset: BiographyDataset,
  decisions: EditorialDecisionSet,
  gate: PublicationGateReport,
): void {
  const expected = buildPublicationSnapshot(dataset, gate, decisions);
  if (canonicalJson(snapshot) !== canonicalJson(expected)) {
    throw new Error(
      'Published biography snapshot is not the deterministic output of the current normalized dataset, decisions, and publication gate.',
    );
  }
}

function prepare(): void {
  const packet = makePacket();
  writeJson(packetPath, packet);
  console.log(
    `Prepared editorial packet: ${relative(root, packetPath)} (${packet.claims.length} claims).`,
  );
}

function validate(): void {
  const dataset = loadNormalized();
  const registry = loadRegistry();
  const decisions = loadDecisions();
  const packet = loadPacket();
  if (
    decisions.snapshotDate !== dataset.snapshotDate ||
    packet.snapshotDate !== dataset.snapshotDate
  ) {
    throw new Error(
      'Editorial, packet, and biography snapshot dates must match.',
    );
  }
  validateEditorialDecisionIntegrity(decisions, registry, packet);
  const gate = evaluateGate(dataset, decisions);
  validatePublicationGateReport(gate);
  if (!existsSync(publishedPath)) {
    throw new Error(
      `Missing required publication snapshot: ${relative(root, publishedPath)}.`,
    );
  }
  const snapshot = validatePublicationSnapshot(readJson(publishedPath));
  assertPublicationSnapshotIntegrity(snapshot, dataset, decisions, gate);
  console.log(
    `Editorial validation passed: ${decisions.decisions.length} decisions, ${gate.eligibleClaims}/${gate.totalClaims} eligible claims.`,
  );
}

function apply(decisionInput: string | null): void {
  if (!decisionInput)
    throw new Error('Use editorial:apply -- --decisions <path>.');
  const incoming = validateEditorialDecisionSet(
    readJson(join(root, decisionInput)),
  );
  const current = loadDecisions();
  if (incoming.snapshotDate !== current.snapshotDate) {
    throw new Error(
      `Decision snapshot ${incoming.snapshotDate} does not match ${current.snapshotDate}.`,
    );
  }
  const mergedById = new Map(
    current.decisions.map((decision) => [decision.decisionId, decision]),
  );
  for (const decision of incoming.decisions) {
    const existing = mergedById.get(decision.decisionId);
    if (existing && canonicalJson(existing) !== canonicalJson(decision)) {
      throw new Error(
        `Decision ${decision.decisionId} already exists with different content.`,
      );
    }
    mergedById.set(decision.decisionId, decision);
  }
  const merged: EditorialDecisionSet = {
    ...current,
    decisions: [...mergedById.values()].sort((left, right) =>
      left.decisionId.localeCompare(right.decisionId),
    ),
  };
  validateEditorialDecisionIntegrity(merged, loadRegistry(), loadPacket());
  writeJson(decisionsPath, merged);
  console.log(
    `Applied ${incoming.decisions.length} decision(s) to ${relative(root, decisionsPath)}.`,
  );
}

function publish(): void {
  const dataset = loadNormalized();
  const decisions = loadDecisions();
  const gate = evaluateGate(dataset, decisions);
  writeGateReports(gate);
  writeReviewReports(dataset, decisions);
  const records = buildPublicationRecords(dataset, gate, decisions);
  const snapshot = buildPublicationSnapshot(dataset, gate, decisions);
  validatePublicationSnapshot(snapshot);
  assertPublicationSnapshotIntegrity(snapshot, dataset, decisions, gate);
  writeJson(publishedPath, snapshot);
  writeJson(approvedPath, {
    datasetId: 'kaohsiung-2026-candidate-biographies-approved',
    snapshotDate: dataset.snapshotDate,
    records,
    note: 'Derived compatibility layer. Publication authority is data/published/2026/candidate-biographies.json and its editorial gate.',
  });
  console.log(
    `Published ${records.length} approved biography claim(s); ${gate.blockedClaims} remain blocked.`,
  );
}

function report(): void {
  const dataset = loadNormalized();
  const decisions = loadDecisions();
  const gate = evaluateGate(dataset, decisions);
  writeGateReports(gate);
  writeReviewReports(dataset, decisions);
  console.log(
    `Reports written: ${gate.eligibleClaims}/${gate.totalClaims} claims eligible.`,
  );
}
function argValue(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
}

const command = process.argv[2] ?? 'validate';
try {
  if (command === 'prepare') prepare();
  else if (command === 'validate') validate();
  else if (command === 'apply') apply(argValue('--decisions'));
  else if (command === 'publish') publish();
  else if (command === 'report') report();
  else if (command === 'review') {
    console.log(
      'Start the local review UI with EDITORIAL_REVIEW=true npm run dev -- --host 127.0.0.1.',
    );
  } else throw new Error(`Unknown editorial biography command: ${command}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
