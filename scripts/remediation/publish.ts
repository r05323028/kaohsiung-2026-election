/**
 * Publishes adjudication-materiality-v2 decisions into a new sanitized snapshot.
 *
 * The previous snapshot (data/published/2026/zuoying-mayoral-automated.json) is
 * never rewritten: it is read as the withdrawal baseline and kept on disk as
 * publication history. Every record in the new snapshot is re-verified against
 * the retained source bytes (checksum, byte length, byte-identical reopen of the
 * evidence excerpt) before it is written.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  AUTOMATED_DATASET_ID,
  AUTOMATED_POLICY_VERSION,
  type AutomatedSemanticProvenance,
} from '../../src/data/enrichment/automated-policy';
import { validateAutomatedPublicationSnapshot } from '../../src/data/enrichment/automated-publication';
import { ADJUDICATION_POLICY_VERSION } from '../../src/data/enrichment/materiality';
import type { EnrichmentDataset } from '../../src/data/enrichment/schema';
import type { SemanticReviewReport } from '../../src/data/enrichment/semantic-review';
import {
  canonicalize,
  normalizeText,
  PATHS,
  ROOT,
  readJson,
  readRaw,
  sha256,
  sourcePublisher,
  writeJson,
  writeText,
} from './lib';

const SNAPSHOT_PATH = 'data/published/2026/zuoying-mayoral-automated-v2.json';
const WITHDRAWAL_PATH =
  'data/published/2026/zuoying-mayoral-withdrawal-history.json';
const SNAPSHOT_DATE = '2026-11-07';

type Decision = {
  decisionId: string;
  claimId: string;
  candidateId: string;
  status: string;
  category: string;
  claimType: string;
  originalWording: string;
  publishedWording: string | null;
  sourceIds: string[];
  evidenceIds: string[];
  sourceVersions: Array<{
    sourceId: string;
    sha256: string;
    byteLength: number;
    rawPath: string;
  }>;
  semantic: AutomatedSemanticProvenance | null;
  adjudication: { invocationIds: string[]; material: boolean } | null;
};

type DecisionSet = {
  decisions: Decision[];
  generatedAt: string;
};

type PreviousSnapshot = {
  records: Array<{ claimId: string; value: string; candidateId: string }>;
  withdrawnClaimIds: string[];
  checksum: string;
};

type Withdrawal = {
  claimId: string;
  candidateId: string;
  previousWording: string;
  withdrawnAt: string;
  reason: string;
  revalidation: string;
};

const reopenCheck = (
  rawText: string,
  evidenceExcerpts: string[],
  citationExcerpts: string[],
): { method: string; matched: string | null } => {
  const haystack = normalizeText(rawText);
  for (const excerpt of evidenceExcerpts) {
    if (excerpt.trim().length === 0) continue;
    if (haystack.includes(normalizeText(excerpt))) {
      return { method: 'retained-evidence-excerpt', matched: excerpt };
    }
  }
  for (const excerpt of citationExcerpts) {
    if (excerpt.trim().length === 0) continue;
    if (haystack.includes(normalizeText(excerpt))) {
      return { method: 'adjudicator-citation-excerpt', matched: excerpt };
    }
  }
  return { method: 'none', matched: null };
};

const main = (now: Date = new Date()) => {
  const dataset = readJson<EnrichmentDataset>(PATHS.dataset);
  const decisions = readJson<DecisionSet>(PATHS.remediationDecisions);
  const review = readJson<SemanticReviewReport>(PATHS.semanticReport);
  const previous = readJson<PreviousSnapshot>(PATHS.published);

  const evidenceById = new Map(
    dataset.evidence.map((item) => [item.evidenceId, item]),
  );
  const claimsById = new Map(
    dataset.claims.map((claim) => [claim.claimId, claim]),
  );
  const sourceAttemptsById = new Map(
    dataset.sourceAttempts.map((attempt) => [attempt.sourceId, attempt]),
  );
  const packetByClaim = new Map(
    review.packets.map((packet) => [packet.claimId, packet]),
  );
  const rawCache = new Map<string, string>();

  const approved = decisions.decisions.filter(
    (decision) => decision.status === 'machine-approved',
  );

  const verification: Array<{
    claimId: string;
    sourceId: string;
    sha256: string;
    byteLength: number;
    reopen: string;
    decisionId: string;
  }> = [];

  for (const decision of approved) {
    if (!decision.publishedWording) {
      throw new Error(
        `Approved decision ${decision.decisionId} has no wording.`,
      );
    }
    const claim = claimsById.get(decision.claimId);
    if (!claim) throw new Error(`Missing claim ${decision.claimId}.`);
    const evidenceExcerpts = decision.evidenceIds.map((evidenceId) => {
      const item = evidenceById.get(evidenceId);
      if (!item) throw new Error(`Missing evidence ${evidenceId}.`);
      return item.excerpt;
    });
    const packet = packetByClaim.get(decision.claimId);
    const citationExcerpts = packet
      ? packet.evidence.map((item) => item.excerpt)
      : [];

    for (const version of decision.sourceVersions) {
      const attempt = sourceAttemptsById.get(version.sourceId);
      if (!attempt) throw new Error(`Missing attempt ${version.sourceId}.`);
      if (!rawCache.has(version.rawPath)) {
        rawCache.set(version.rawPath, readRaw(version.rawPath));
      }
      const raw = rawCache.get(version.rawPath) as string;
      const digest = sha256(raw);
      if (digest !== version.sha256) {
        throw new Error(
          `${decision.claimId}: source ${version.sourceId} checksum drifted (${digest} != ${version.sha256}).`,
        );
      }
      if (Buffer.byteLength(raw, 'utf8') !== version.byteLength) {
        throw new Error(
          `${decision.claimId}: source ${version.sourceId} byte length drifted.`,
        );
      }
      const reopen = reopenCheck(raw, evidenceExcerpts, citationExcerpts);
      if (reopen.method === 'none') {
        throw new Error(
          `${decision.claimId}: neither the retained evidence excerpt nor an adjudicator citation reopens in ${version.rawPath}.`,
        );
      }
      verification.push({
        claimId: decision.claimId,
        sourceId: version.sourceId,
        sha256: version.sha256,
        byteLength: version.byteLength,
        reopen: reopen.method,
        decisionId: decision.decisionId,
      });
    }
  }

  const usedSourceIds = [
    ...new Set(approved.flatMap((item) => item.sourceIds)),
  ].sort((left, right) => left.localeCompare(right));
  const sources = usedSourceIds.map((sourceId) => {
    const attempt = sourceAttemptsById.get(sourceId);
    const version = approved
      .flatMap((decision) => decision.sourceVersions)
      .find((item) => item.sourceId === sourceId);
    if (!attempt || !version) {
      throw new Error(`Cannot describe source ${sourceId}.`);
    }
    return {
      sourceId,
      url: attempt.url,
      publisher: sourcePublisher(sourceId),
      publicationDate: null,
      verificationStatus: 'Verified' as const,
      note: `Retained ${attempt.sourceClass} capture, HTTP ${attempt.httpStatus ?? 'n/a'}, SHA-256 ${version.sha256.slice(0, 16)}…, ${version.byteLength} bytes.`,
    };
  });

  const records = approved.map((decision) => {
    const claim = claimsById.get(
      decision.claimId,
    ) as EnrichmentDataset['claims'][number];
    return {
      claimId: decision.claimId,
      candidateId: decision.candidateId,
      category: claim.category,
      claimType: claim.claimType,
      title: claim.title,
      organization: claim.organization,
      value: decision.publishedWording as string,
      sourcePublicationDate: claim.sourcePublicationDate ?? null,
      validFrom: claim.validFrom ?? null,
      validTo: claim.validTo ?? null,
      temporalPrecision: claim.temporalPrecision,
      currentStatus: 'historical' as const,
      attribution: 'institutional-record' as const,
      sourceIds: decision.sourceIds,
      evidenceIds: decision.evidenceIds,
      machineApprovalId: decision.decisionId,
      policyVersion: AUTOMATED_POLICY_VERSION,
      publicationOrigin: 'automated-policy' as const,
    };
  });

  const previousClaimIds = previous.records.map((record) => record.claimId);
  const publishedClaimIds = new Set(records.map((record) => record.claimId));
  const withdrawals: Withdrawal[] = previous.records
    .filter((record) => !publishedClaimIds.has(record.claimId))
    .map((record) => ({
      claimId: record.claimId,
      candidateId: record.candidateId,
      previousWording: record.value,
      withdrawnAt: now.toISOString(),
      reason:
        'No longer satisfies automated-editorial-policy-v1 plus adjudication-materiality-v2.',
      revalidation: 'withdrawn-after-revalidation',
    }));

  const snapshotWithoutChecksum = {
    schemaVersion: '1' as const,
    datasetId: AUTOMATED_DATASET_ID,
    policyVersion: AUTOMATED_POLICY_VERSION,
    snapshotDate: SNAPSHOT_DATE,
    generatedAt: now.toISOString(),
    records,
    sources,
    withdrawnClaimIds: [
      ...new Set([
        ...previous.withdrawnClaimIds,
        ...withdrawals.map((item) => item.claimId),
      ]),
    ].sort((left, right) => left.localeCompare(right)),
    note: `Machine approval under ${AUTOMATED_POLICY_VERSION} plus fresh independent adjudication (${ADJUDICATION_POLICY_VERSION}). Every record cites a retained institutional capture; this is not human editorial approval. Supersedes the 1-record snapshot at data/published/2026/zuoying-mayoral-automated.json.`,
  };
  const snapshot = {
    ...snapshotWithoutChecksum,
    checksum: sha256(canonicalize(snapshotWithoutChecksum)),
  };

  const validated = validateAutomatedPublicationSnapshot(snapshot);
  writeJson(SNAPSHOT_PATH, validated);

  const previousHistory = existsSync(resolve(ROOT, WITHDRAWAL_PATH))
    ? readJson<{ withdrawals: Withdrawal[] }>(WITHDRAWAL_PATH)
    : { withdrawals: [] as Withdrawal[] };
  writeJson(WITHDRAWAL_PATH, {
    datasetId: AUTOMATED_DATASET_ID,
    policyVersion: AUTOMATED_POLICY_VERSION,
    adjudicationPolicyVersion: ADJUDICATION_POLICY_VERSION,
    updatedAt: now.toISOString(),
    withdrawals: [...previousHistory.withdrawals, ...withdrawals],
  });

  const retainedFromPrevious = previousClaimIds.filter((claimId) =>
    publishedClaimIds.has(claimId),
  );
  const perCandidate = new Map<string, number>();
  for (const record of records) {
    perCandidate.set(
      record.candidateId,
      (perCandidate.get(record.candidateId) ?? 0) + 1,
    );
  }

  const report = {
    generatedAt: now.toISOString(),
    policyVersion: AUTOMATED_POLICY_VERSION,
    adjudicationPolicyVersion: ADJUDICATION_POLICY_VERSION,
    snapshotPath: SNAPSHOT_PATH,
    snapshotChecksum: validated.checksum,
    previousSnapshot: {
      path: PATHS.published,
      checksum: previous.checksum,
      records: previous.records.length,
    },
    counts: {
      totalClaims: dataset.claims.length,
      machineApproved: approved.length,
      machineRejected: decisions.decisions.length - approved.length,
      published: records.length,
      withdrawals: withdrawals.length,
      uniqueSources: sources.length,
      candidatesWithPublishedContent: perCandidate.size,
      candidatesInScope: new Set(
        dataset.claims.map((claim) => claim.candidateId),
      ).size,
    },
    retainedFromPrevious,
    withdrawals,
    sourceReopen: verification,
    publishedByCandidate: [...perCandidate].map(([candidateId, claims]) => ({
      candidateId,
      claims,
    })),
  };
  writeJson('reports/autonomous-remediation-publication.json', report);

  const candidateNames = new Map(
    readJson<{ claims: Array<{ candidateId: string; candidateName: string }> }>(
      PATHS.rootCauses,
    ).claims.map((claim) => [claim.candidateId, claim.candidateName]),
  );
  const lines: string[] = [];
  lines.push('# Autonomous remediation — publication report');
  lines.push('');
  lines.push(`Generated ${now.toISOString()}.`);
  lines.push('');
  lines.push('## Before / after');
  lines.push('');
  lines.push('| Metric | Before (v1 snapshot) | After (v2 snapshot) |');
  lines.push('| --- | --- | --- |');
  lines.push(`| Machine-approved claims | 1 | ${approved.length} |`);
  lines.push(
    `| Published claims in the sanitized snapshot | ${previous.records.length} | ${records.length} |`,
  );
  lines.push(
    `| Candidates with published content | ${new Set(previous.records.map((record) => record.candidateId)).size} | ${perCandidate.size} |`,
  );
  lines.push(
    `| Unique public sources | (v1 snapshot sources) | ${sources.length} |`,
  );
  lines.push(
    `| Withdrawn records | ${previous.withdrawnClaimIds.length} | ${withdrawals.length} |`,
  );
  lines.push('');
  lines.push('## Sanitized snapshot');
  lines.push('');
  lines.push(`- Path: \`${SNAPSHOT_PATH}\``);
  lines.push(`- Checksum: \`${validated.checksum}\``);
  lines.push(
    `- Every record cites a retained capture whose SHA-256 and byte length were re-verified at publish time, and whose evidence excerpt reopens byte-identically in the raw file.`,
  );
  lines.push(
    `- Reopen evidence: ${report.sourceReopen.filter((item) => item.reopen === 'retained-evidence-excerpt').length} checks used the retained evidence excerpt, ${report.sourceReopen.filter((item) => item.reopen === 'adjudicator-citation-excerpt').length} used a fresh adjudicator citation.`,
  );
  lines.push(
    `- Retained from the previous snapshot: ${retainedFromPrevious.join(', ') || 'none'}`,
  );
  lines.push(
    `- Withdrawn: ${withdrawals.map((item) => item.claimId).join(', ') || 'none'}`,
  );
  lines.push('');
  lines.push('## Published content by candidate');
  lines.push('');
  lines.push('| Candidate | Published claims |');
  lines.push('| --- | --- |');
  for (const [candidateId, count] of [...perCandidate].sort(
    (left, right) => right[1] - left[1],
  )) {
    lines.push(
      `| ${candidateNames.get(candidateId) ?? candidateId} | ${count} |`,
    );
  }
  lines.push('');
  writeText('reports/autonomous-remediation-publication.md', lines.join('\n'));

  return {
    counts: report.counts,
    checksum: validated.checksum,
    retainedFromPrevious,
    withdrawals,
  };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = main();
  console.log(JSON.stringify(result, null, 1));
}

export { main as publishRemediatedSnapshot };
