import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import approvedRoster from '../data/approved/2026/kaohsiung-election.json';
import {
  assertClaimEvidence,
  type BiographyClaim,
  type BiographyDataset,
  type BiographyEvidence,
  validateBiographyDataset,
} from '../src/data/biographies/schema';
import {
  classifyReleaseClaim,
  detectReleaseConsolidation,
  type ReleaseClaimAudit,
} from '../src/data/editorial/release';

const ROOT = resolve(process.cwd());
const NORMALIZED_PATH = 'data/normalized/2026/biographies.json';
const PILOT_REPORT_PATH = 'reports/editorial-pilot-summary.json';
const BATCH_PATH = 'data/editorial/release/2026/biography-release-batch.json';
const READINESS_PATH = 'reports/editorial-release-readiness.json';
const PILOT_CANDIDATE_IDS = [
  'official-candidate-2026-district-kaohsiung-council-10-8aa5784f',
  'official-candidate-2026-district-kaohsiung-council-10-ec2af867',
  'official-candidate-2026-district-kaohsiung-council-11-a4e7a38d',
  'official-candidate-2026-district-kaohsiung-council-11-aa063da4',
] as const;
const MAX_SELECTED_PER_CANDIDATE = 3;

type RosterCandidate = {
  id: string;
  displayName: string;
  districtId: string;
  electionType: string;
};

type ReleaseBatch = {
  schemaVersion: '1';
  snapshotDate: string;
  candidateIds: string[];
  selectedClaimIds: string[];
  groups: Array<{
    groupId: string;
    relationship: 'exact-duplicate' | 'possible-overlap' | 'candidate-review';
    claimIds: string[];
  }>;
  note: string;
};

type ReleaseReadiness = {
  schemaVersion: '1';
  snapshotDate: string;
  rosterSnapshotDate: string;
  pilotCandidateIds: string[];
  originalClaimCount: number;
  audits: ReleaseClaimAudit[];
  classificationCounts: Record<string, number>;
  readinessCounts: Record<string, number>;
  selectedClaimIds: string[];
  deferredClaimIds: string[];
  blockedClaimIds: string[];
  consolidationGroups: ReturnType<typeof detectReleaseConsolidation>;
  humanReviewedClaims: 0;
  approvedClaims: 0;
  publishedClaims: 0;
  completion: {
    engineering: 'prepared-after-verification';
    humanEditorial: 'incomplete-no-authorized-reviewer-decisions';
    publication: 'incomplete-no-approved-claims';
  };
};

function readJson<T>(relativePath: string): T {
  const text = readFileSync(join(ROOT, relativePath), 'utf8');
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON in ${relativePath}: ${message}`);
  }
}
function writeJson(relativePath: string, value: unknown): void {
  const path = join(ROOT, relativePath);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
function oneLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
function markdownValue(value: string, limit = 760): string {
  const line = oneLine(value).replaceAll('|', '\\|');
  return line.length > limit ? `${line.slice(0, limit - 1)}…` : line;
}
function rosterCandidates(): RosterCandidate[] {
  return (approvedRoster.candidates as RosterCandidate[]).filter((candidate) =>
    PILOT_CANDIDATE_IDS.includes(
      candidate.id as (typeof PILOT_CANDIDATE_IDS)[number],
    ),
  );
}
function sourceHash(path: string): { sha256: string; byteLength: number } {
  const bytes = readFileSync(join(ROOT, path));
  return {
    sha256: createHash('sha256').update(bytes).digest('hex'),
    byteLength: bytes.byteLength,
  };
}
function verifySources(
  dataset: BiographyDataset,
  claims: BiographyClaim[],
): void {
  const sources = new Map(
    dataset.sources.map((source) => [source.sourceId, source]),
  );
  for (const claim of claims) {
    for (const sourceId of claim.sourceIds) {
      const source = sources.get(sourceId);
      if (!source?.rawPath || !source.sha256)
        throw new Error(
          `Release source missing snapshot/checksum: ${claim.claimId} -> ${sourceId}`,
        );
      if (!existsSync(join(ROOT, source.rawPath)))
        throw new Error(`Release source file missing: ${source.rawPath}`);
      const actual = sourceHash(source.rawPath);
      if (actual.sha256 !== source.sha256) {
        throw new Error(
          `Release source checksum mismatch for ${sourceId}: expected ${source.sha256}, actual ${actual.sha256}`,
        );
      }
      if (source.byteLength !== null && actual.byteLength !== source.byteLength)
        throw new Error(`Release source byte length mismatch for ${sourceId}`);
    }
  }
}
function loadScope(): {
  dataset: BiographyDataset;
  candidates: RosterCandidate[];
  claims: BiographyClaim[];
  evidence: BiographyEvidence[];
} {
  const dataset = validateBiographyDataset(readJson<unknown>(NORMALIZED_PATH));
  assertClaimEvidence(dataset);
  const candidates = rosterCandidates();
  if (candidates.length !== 4)
    throw new Error(
      `Expected 4 release candidates, found ${candidates.length}`,
    );
  const candidateIds = new Set<string>(PILOT_CANDIDATE_IDS);
  const claims = dataset.claims.filter((claim) =>
    candidateIds.has(claim.candidateId),
  );
  if (claims.length !== 405)
    throw new Error(
      `Expected exactly 405 pilot claims, found ${claims.length}`,
    );
  const evidence = dataset.evidence.filter((item) =>
    claims.some((claim) => claim.evidenceIds.includes(item.evidenceId)),
  );
  verifySources(dataset, claims);
  const pilot = readJson<{
    claimsPrepared: number;
    pilotCandidateIds: string[];
  }>(PILOT_REPORT_PATH);
  if (pilot.claimsPrepared !== 405)
    throw new Error(
      `Pilot report is not the expected 405-claim selection: ${pilot.claimsPrepared}`,
    );
  if (
    [...pilot.pilotCandidateIds].sort().join('|') !==
    [...PILOT_CANDIDATE_IDS].sort().join('|')
  )
    throw new Error(
      'Pilot selection does not match the fixed release candidate IDs.',
    );
  return { dataset, candidates, claims, evidence };
}
function selectClaims(
  claims: BiographyClaim[],
  audits: ReleaseClaimAudit[],
): string[] {
  const byCandidate = new Map<string, ReleaseClaimAudit[]>();
  for (const audit of audits) {
    const bucket = byCandidate.get(audit.candidateId) ?? [];
    bucket.push(audit);
    byCandidate.set(audit.candidateId, bucket);
  }
  const selected: string[] = [];
  for (const candidateId of PILOT_CANDIDATE_IDS) {
    const eligible = (byCandidate.get(candidateId) ?? [])
      .filter(
        (audit) =>
          audit.category === 'basic-biographical-fact' &&
          audit.reviewReadiness === 'ready-for-human-review',
      )
      .sort((left, right) => {
        const rank = (audit: ReleaseClaimAudit) =>
          audit.claimType === 'education'
            ? 0
            : audit.claimType === 'historical-position'
              ? 1
              : 2;
        return (
          rank(left) - rank(right) || left.claimId.localeCompare(right.claimId)
        );
      });
    if (eligible.length < MAX_SELECTED_PER_CANDIDATE)
      throw new Error(
        `Candidate ${candidateId} has only ${eligible.length} release-ready claims.`,
      );
    selected.push(
      ...eligible
        .slice(0, MAX_SELECTED_PER_CANDIDATE)
        .map((audit) => audit.claimId),
    );
  }
  const claimIds = new Set(claims.map((claim) => claim.claimId));
  if (selected.some((claimId) => !claimIds.has(claimId)))
    throw new Error('Selected release claim is outside the pilot scope.');
  return selected;
}
function makeReports(
  dataset: BiographyDataset,
  candidates: RosterCandidate[],
  claims: BiographyClaim[],
  evidence: BiographyEvidence[],
): {
  readiness: ReleaseReadiness;
  batch: ReleaseBatch;
  consolidationMarkdown: string;
  candidatesMarkdown: string;
  readinessMarkdown: string;
  qualityMarkdown: string;
} {
  const audits = claims.map((claim) =>
    classifyReleaseClaim(
      claim,
      evidence,
      dataset.observations,
      dataset.sources,
    ),
  );
  const consolidationGroups = detectReleaseConsolidation(claims, evidence);
  const selectedClaimIds = selectClaims(claims, audits);
  const deferredClaimIds = audits
    .filter((audit) => audit.reviewReadiness === 'deferred')
    .map((audit) => audit.claimId);
  const blockedClaimIds = audits
    .filter((audit) => audit.reviewReadiness === 'blocked')
    .map((audit) => audit.claimId);
  const classificationCounts: Record<string, number> = {};
  const readinessCounts: Record<string, number> = {};
  for (const audit of audits) {
    classificationCounts[audit.category] =
      (classificationCounts[audit.category] ?? 0) + 1;
    readinessCounts[audit.reviewReadiness] =
      (readinessCounts[audit.reviewReadiness] ?? 0) + 1;
  }
  const candidateById = new Map(
    candidates.map((candidate) => [candidate.id, candidate]),
  );
  const batch: ReleaseBatch = {
    schemaVersion: '1',
    snapshotDate: dataset.snapshotDate,
    candidateIds: [...PILOT_CANDIDATE_IDS],
    selectedClaimIds,
    groups: [
      ...consolidationGroups.map((group) => ({
        groupId: group.groupId,
        relationship: group.relationship,
        claimIds: group.claimIds,
      })),
      ...PILOT_CANDIDATE_IDS.map((candidateId) => ({
        groupId: `candidate-review-${candidateId}`,
        relationship: 'candidate-review' as const,
        claimIds: selectedClaimIds.filter(
          (claimId) =>
            claims.find((claim) => claim.claimId === claimId)?.candidateId ===
            candidateId,
        ),
      })),
    ],
    note: 'Local review queue only. Selection is not approval and is not a public biography dataset.',
  };
  const readiness: ReleaseReadiness = {
    schemaVersion: '1',
    snapshotDate: dataset.snapshotDate,
    rosterSnapshotDate: approvedRoster.snapshotDate,
    pilotCandidateIds: [...PILOT_CANDIDATE_IDS],
    originalClaimCount: claims.length,
    audits,
    classificationCounts,
    readinessCounts,
    selectedClaimIds,
    deferredClaimIds,
    blockedClaimIds,
    consolidationGroups,
    humanReviewedClaims: 0,
    approvedClaims: 0,
    publishedClaims: 0,
    completion: {
      engineering: 'prepared-after-verification',
      humanEditorial: 'incomplete-no-authorized-reviewer-decisions',
      publication: 'incomplete-no-approved-claims',
    },
  };
  const selectedRows = selectedClaimIds.map((claimId) => {
    const claim = claims.find((item) => item.claimId === claimId);
    const audit = audits.find((item) => item.claimId === claimId);
    if (!claim || !audit) throw new Error(`Missing selected audit ${claimId}`);
    const candidate = candidateById.get(claim.candidateId);
    const source = dataset.sources.find(
      (item) => item.sourceId === claim.sourceIds[0],
    );
    const claimEvidence = evidence.filter((item) =>
      claim.evidenceIds.includes(item.evidenceId),
    );
    return { claim, audit, candidate, source, claimEvidence };
  });
  const consolidationMarkdown = [
    '# Editorial release claim consolidation',
    '',
    `- Snapshot: ${dataset.snapshotDate}`,
    `- Original pilot claims: ${claims.length}`,
    `- Exact duplicate groups: ${consolidationGroups.filter((group) => group.relationship === 'exact-duplicate').length}`,
    `- Possible overlap groups: ${consolidationGroups.filter((group) => group.relationship === 'possible-overlap').length}`,
    '- No claim was deleted, merged, or silently rewritten.',
    '',
    '## Groups',
    '',
    consolidationGroups.length === 0
      ? 'No conservative duplicate or overlap groups were detected.'
      : consolidationGroups
          .map(
            (group) =>
              `- **${group.groupId}** (${group.relationship}): ${group.claimIds.join(', ')}; evidence ${group.evidenceIds.join(', ')}. ${group.rationale}`,
          )
          .join('\n'),
    '',
    '## Separate review attention',
    '',
    audits
      .filter((audit) => audit.blockers.length > 0)
      .slice(0, 60)
      .map((audit) => `- ${audit.claimId}: ${audit.blockers.join(' ')}`)
      .join('\n') || 'No additional blockers recorded.',
    '',
  ].join('\n');
  const candidatesMarkdown = [
    '# Editorial release candidates',
    '',
    `The bounded queue selects ${selectedRows.length} claims: ${MAX_SELECTED_PER_CANDIDATE} per candidate across four candidates. These are pending human review, not approved or published.`,
    '',
    ...selectedRows.map(({ claim, audit, candidate, source, claimEvidence }) =>
      [
        `## ${candidate?.displayName ?? claim.candidateId} — ${claim.claimId}`,
        '',
        `- District: ${candidate?.districtId ?? 'unknown'}`,
        `- Claim: ${claim.title} — ${markdownValue(claim.value)}`,
        `- Category/type: ${audit.category} / ${claim.claimType}`,
        `- Attribution/dependency: ${claim.attribution} / ${claim.sourceDependency}`,
        `- Temporal precision: ${claim.temporalPrecision}; confidence: ${audit.temporalConfidence}`,
        `- Identity resolved: ${audit.identityResolved ? 'yes (machine state; human confirmation still required)' : 'no'}`,
        `- Source: ${source?.url ?? claim.sourceIds.join(', ')}`,
        `- Source date: ${source?.sourceRetrievedAt ?? 'unknown'}; capture quality: ${audit.sourceTimestampQualities.join(', ')}`,
        `- Source checksum current: ${audit.sourceVersionsCurrent ? 'yes' : 'no'}`,
        `- Evidence: ${claimEvidence.map((item) => `${item.evidenceId} — ${markdownValue(item.excerpt, 500)}`).join(' | ')}`,
        `- Review blockers: ${audit.blockers.join(' ') || 'None machine-detected; explicit human identity and editorial decision remain required.'}`,
        '',
      ].join('\n'),
    ),
  ].join('\n');
  const readinessMarkdown = [
    '# Editorial release readiness',
    '',
    `- Pilot claims inspected: ${claims.length}`,
    `- Selected review queue: ${selectedClaimIds.length} (${MAX_SELECTED_PER_CANDIDATE} per candidate)`,
    `- Deferred: ${deferredClaimIds.length}`,
    `- Blocked: ${blockedClaimIds.length}`,
    `- Human-reviewed: 0`,
    `- Approved: 0`,
    `- Published: 0`,
    '',
    '## Classification',
    '',
    Object.entries(classificationCounts)
      .map(([key, value]) => `- ${key}: ${value}`)
      .join('\n'),
    '',
    '## Boundary',
    '',
    'Engineering preparation is measured separately from human editorial completion. The production reviewer registry, decision set, and publication snapshot remain empty. A real authorized reviewer must inspect the selected claims, confirm identity, add rationale/evidence versions, and export decisions before the unchanged publication gate can run.',
    '',
  ].join('\n');
  const qualityMarkdown = [
    '# Editorial release quality audit',
    '',
    `- Claims reopened: ${claims.length}`,
    `- Claims with direct evidence: ${audits.filter((audit) => audit.evidenceDirect).length}`,
    `- Claims with current retained source versions: ${audits.filter((audit) => audit.sourceVersionsCurrent).length}`,
    `- Claims with resolved machine identity: ${audits.filter((audit) => audit.identityResolved).length}`,
    `- Claims with unknown temporal precision: ${audits.filter((audit) => audit.temporalPrecision === 'unknown').length}`,
    `- Capture-file-mtime source records: ${new Set(audits.flatMap((audit) => audit.sourceIds.filter((sourceId) => dataset.sources.find((source) => source.sourceId === sourceId)?.timestampQuality === 'capture-file-mtime'))).size}`,
    `- Candidate-statement claims: ${audits.filter((audit) => audit.category === 'candidate-statement').length}`,
    `- Current-position claims needing freshness review: ${audits.filter((audit) => audit.category === 'current-position').length}`,
    '',
    'No capture-file mtime was converted into an event date or source publication date. Reopening the same bytes is not counted as independent human verification.',
    '',
  ].join('\n');
  return {
    readiness,
    batch,
    consolidationMarkdown,
    candidatesMarkdown,
    readinessMarkdown,
    qualityMarkdown,
  };
}
function writeReports(reports: ReturnType<typeof makeReports>): void {
  writeJson(READINESS_PATH, reports.readiness);
  writeJson(BATCH_PATH, reports.batch);
  writeFileSync(
    join(ROOT, 'reports/editorial-release-claim-consolidation.md'),
    reports.consolidationMarkdown,
    'utf8',
  );
  writeFileSync(
    join(ROOT, 'reports/editorial-release-candidates.md'),
    reports.candidatesMarkdown,
    'utf8',
  );
  writeFileSync(
    join(ROOT, 'reports/editorial-release-readiness.md'),
    reports.readinessMarkdown,
    'utf8',
  );
  writeFileSync(
    join(ROOT, 'reports/editorial-release-quality.md'),
    reports.qualityMarkdown,
    'utf8',
  );
}
function canonical(value: unknown): string {
  return JSON.stringify(value);
}
function run(): void {
  const command = process.argv[2] ?? 'prepare';
  if (!['prepare', 'verify', 'report'].includes(command))
    throw new Error(`Unknown release command: ${command}`);
  const scope = loadScope();
  const reports = makeReports(
    scope.dataset,
    scope.candidates,
    scope.claims,
    scope.evidence,
  );
  if (command === 'verify') {
    const persisted = readJson<ReleaseReadiness>(READINESS_PATH);
    const persistedBatch = readJson<ReleaseBatch>(BATCH_PATH);
    if (canonical(persisted) !== canonical(reports.readiness))
      throw new Error(
        'Release readiness report is stale; run release:prepare.',
      );
    if (canonical(persistedBatch) !== canonical(reports.batch))
      throw new Error('Release batch is stale; run release:prepare.');
    console.log(
      `Release verification passed: ${scope.claims.length} claims, ${reports.readiness.selectedClaimIds.length} selected, ${reports.readiness.consolidationGroups.length} consolidation groups.`,
    );
    return;
  }
  writeReports(reports);
  console.log(
    `Release ${command} complete: ${scope.claims.length} claims audited, ${reports.readiness.selectedClaimIds.length} selected, ${reports.readiness.blockedClaimIds.length} blocked, ${reports.readiness.deferredClaimIds.length} deferred.`,
  );
}
run();
