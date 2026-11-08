import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReviewerRegistry } from '../src/data/editorial/schema';
import {
  buildScopedBlockerAnalysis,
  buildScopedPublicationReadiness,
  buildScopedReviewQueue,
  evaluateScopedEnrichmentPublicationGate,
  type ScopedBlockerAnalysis,
  type ScopedPublicationReadiness,
  type ScopedReviewQueueReport,
  type ScopedVerificationRecord,
  type ScopedVerificationReport,
  validateScopedBlockerAnalysis,
  validateScopedPublicationGateReport,
  validateScopedPublicationReadiness,
  validateScopedReviewQueue,
  validateScopedVerificationReport,
} from '../src/data/enrichment/review-publication';
import {
  type EnrichmentClaim,
  type EnrichmentDataset,
  type EnrichmentReviewPacket,
  type EnrichmentSourceAttempt,
  validateEnrichmentDataset,
  validateEnrichmentReviewPacket,
} from '../src/data/enrichment/schema';

const ROOT = process.cwd();
const DATASET_PATH = 'data/enrichment/normalized/2026/zuoying-mayoral.json';
const PACKET_PATH = 'data/enrichment/review/2026/zuoying-mayoral-review.json';
const APPROVED_PATH = 'data/enrichment/approved/2026/zuoying-mayoral.json';
const PUBLISHED_PATH = 'data/enrichment/published/2026/zuoying-mayoral.json';
const EMPTY_REGISTRY: ReviewerRegistry = {
  schemaVersion: '1',
  reviewers: [],
  note: 'No reviewer is configured for the scoped enrichment review run.',
};

function readJson<T = unknown>(path: string): T {
  try {
    return JSON.parse(readFileSync(join(ROOT, path), 'utf8')) as T;
  } catch (error) {
    throw new Error(
      `Could not parse ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function writeJson(path: string, value: unknown): void {
  const absolute = join(ROOT, path);
  mkdirSync(join(absolute, '..'), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function sha256(path: string): string {
  return createHash('sha256')
    .update(readFileSync(join(ROOT, path)))
    .digest('hex');
}

function sourceMap(
  dataset: EnrichmentDataset,
): Map<string, EnrichmentSourceAttempt> {
  const map = new Map<string, EnrichmentSourceAttempt>();
  for (const source of dataset.sourceAttempts) {
    const current = map.get(source.sourceId);
    if (!current || (current.rawPath === null && source.rawPath !== null)) {
      map.set(source.sourceId, source);
    }
  }
  return map;
}

function sourceIntegrity(dataset: EnrichmentDataset): void {
  for (const source of dataset.sourceAttempts) {
    if (!source.rawPath || !source.sha256 || source.byteLength === null) {
      throw new Error(
        `Scoped source ${source.sourceId} has incomplete raw metadata.`,
      );
    }
    const bytes = readFileSync(join(ROOT, source.rawPath));
    const actualHash = createHash('sha256').update(bytes).digest('hex');
    if (
      actualHash !== source.sha256 ||
      bytes.byteLength !== source.byteLength
    ) {
      throw new Error(
        `Scoped source checksum changed: ${source.sourceId} (${source.rawPath}).`,
      );
    }
  }
  for (const check of dataset.sourceChecks) {
    const actualHash = sha256(check.rawPath);
    const actualLength = readFileSync(join(ROOT, check.rawPath)).byteLength;
    if (
      actualHash !== check.expectedSha256 ||
      actualHash !== check.actualSha256 ||
      actualLength !== check.byteLength
    ) {
      throw new Error(`Scoped source check failed: ${check.sourceId}.`);
    }
  }
}

function candidateGroup(
  packet: EnrichmentReviewPacket,
  candidateId: string,
): 'district-4' | 'mayoral' {
  const candidate = packet.candidates.find(
    (item) => item.candidateId === candidateId,
  );
  if (!candidate) throw new Error(`Missing candidate ${candidateId}.`);
  return candidate.electionType === 'mayoral' ? 'mayoral' : 'district-4';
}

function chooseVerificationClaims(
  dataset: EnrichmentDataset,
  packet: EnrichmentReviewPacket,
  queue: ScopedReviewQueueReport,
): EnrichmentClaim[] {
  const selected: EnrichmentClaim[] = [];
  const used = new Set<string>();
  const take = (predicate: (claim: EnrichmentClaim) => boolean) => {
    const claim = dataset.claims.find(
      (item) => !used.has(item.claimId) && predicate(item),
    );
    if (claim) {
      selected.push(claim);
      used.add(claim.claimId);
    }
  };
  for (const category of [
    'basic-biography',
    'policies',
    'public-records',
    'news',
    'relationships',
    'timeline',
  ]) {
    take((claim) => claim.category === category);
  }
  take((claim) => candidateGroup(packet, claim.candidateId) === 'district-4');
  take((claim) => candidateGroup(packet, claim.candidateId) === 'mayoral');
  for (const quality of [
    'source-header',
    'capture-file-mtime',
    'unavailable',
  ]) {
    take((claim) =>
      claim.sourceIds.some((sourceId) =>
        dataset.sourceAttempts.some(
          (source) =>
            source.sourceId === sourceId && source.timestampQuality === quality,
        ),
      ),
    );
  }
  for (const readiness of ['blocked', 'requires-additional-evidence']) {
    const blockedIds = new Set(
      queue.items
        .filter(
          (item) =>
            item.itemType === 'claim' &&
            item.readiness === readiness &&
            item.claimId,
        )
        .map((item) => item.claimId as string),
    );
    take((claim) => blockedIds.has(claim.claimId));
  }
  take((claim) => claim.claimType === 'administrative-outcome');
  return selected;
}

function buildVerificationReport(
  dataset: EnrichmentDataset,
  packet: EnrichmentReviewPacket,
  queue: ScopedReviewQueueReport,
  blockers: ScopedBlockerAnalysis,
): ScopedVerificationReport {
  const sources = sourceMap(dataset);
  const observations = new Map(
    dataset.observations.map((item) => [item.observationId, item]),
  );
  const evidence = new Map(
    dataset.evidence.map((item) => [item.evidenceId, item]),
  );
  const queueByClaim = new Map(
    queue.items
      .filter((item) => item.claimId)
      .map((item) => [item.claimId as string, item]),
  );
  const blockersByClaim = new Map<string, string[]>();
  for (const blocker of blockers.blockers) {
    for (const claimId of blocker.claimIds) {
      blockersByClaim.set(claimId, [
        ...(blockersByClaim.get(claimId) ?? []),
        blocker.blockerId,
      ]);
    }
  }
  const samples: ScopedVerificationRecord[] = chooseVerificationClaims(
    dataset,
    packet,
    queue,
  ).map((claim, index) => {
    const sourceId =
      claim.sourceIds.find((id) => sources.get(id)?.rawPath) ??
      claim.sourceIds[0];
    const source = sourceId ? sources.get(sourceId) : undefined;
    const observation = claim.identityObservationIds
      .map((id) => observations.get(id))
      .find(Boolean);
    const claimEvidence = claim.evidenceIds
      .map((id) => evidence.get(id))
      .find(Boolean);
    const queueItem = queueByClaim.get(claim.claimId);
    const checks: string[] = [];
    let result: 'matches' | 'discrepancy' | 'insufficient' = 'matches';
    let discrepancy: string | null = null;
    let checksumStatus: 'unchanged' | 'mismatch' | 'unavailable' =
      'unavailable';
    if (!source?.rawPath || !source.sha256 || source.byteLength === null) {
      result = 'insufficient';
      discrepancy =
        'The selected source has no complete retained raw metadata.';
    } else {
      const bytes = readFileSync(join(ROOT, source.rawPath));
      const actualHash = createHash('sha256').update(bytes).digest('hex');
      checksumStatus =
        actualHash === source.sha256 && bytes.byteLength === source.byteLength
          ? 'unchanged'
          : 'mismatch';
      checks.push(`reopened ${source.rawPath}`);
      checks.push(`sha256 ${checksumStatus}`);
      checks.push(`byteLength ${bytes.byteLength}/${source.byteLength}`);
      if (checksumStatus !== 'unchanged') {
        result = 'discrepancy';
        discrepancy =
          'The immutable source checksum or byte length did not match the normalized metadata.';
      }
    }
    if (
      observation?.identityStatus === 'resolved' &&
      observation.candidateIds.includes(claim.candidateId)
    ) {
      checks.push(
        'resolved identity observation points to the sampled candidate',
      );
    } else {
      result = result === 'discrepancy' ? result : 'insufficient';
      discrepancy ??=
        'The sampled claim lacks a resolved candidate-linked identity observation.';
    }
    if (
      claimEvidence?.claimId === claim.claimId &&
      claimEvidence.sourceId === sourceId &&
      claimEvidence.supportType === 'direct'
    ) {
      checks.push('direct evidence links the claim to the reopened source');
    } else {
      result = result === 'discrepancy' ? result : 'insufficient';
      discrepancy ??=
        'The sampled claim does not have a matching direct evidence link.';
    }
    checks.push(`attribution preserved as ${claim.attribution}`);
    checks.push(`temporal precision preserved as ${claim.temporalPrecision}`);
    const candidate = packet.candidates.find(
      (item) => item.candidateId === claim.candidateId,
    );
    if (!candidate || !source) {
      result = 'insufficient';
      discrepancy ??= 'Candidate or source metadata was unavailable.';
    }
    return {
      verificationId: `zuoying-mayoral-independent-${String(index + 1).padStart(2, '0')}`,
      candidateId: claim.candidateId,
      displayName: candidate?.displayName ?? claim.candidateId,
      candidateGroup: candidateGroup(packet, claim.candidateId),
      category: claim.category,
      claimId: claim.claimId,
      sourceId: sourceId ?? 'missing-source',
      sourceUrl: source?.url ?? 'https://invalid.local/missing-source',
      rawPath: source?.rawPath ?? 'missing',
      sourceTimestampQuality: source?.timestampQuality ?? 'unavailable',
      sourceChecksumStatus: checksumStatus,
      candidateIdentityStatus: observation?.identityStatus ?? 'not-matched',
      attributionStatus: claim.attribution,
      temporalStatus: `${claim.currentStatus}/${claim.temporalPrecision}`,
      evidenceStatus: claimEvidence ? 'linked' : 'missing',
      blocked: Boolean(
        queueItem && queueItem.readiness !== 'ready-for-human-review',
      ),
      blockerIds: blockersByClaim.get(claim.claimId) ?? [],
      checks,
      result,
      discrepancy,
      verifiedAt: new Date().toISOString(),
    };
  });
  return {
    reportId: 'zuoying-mayoral-independent-verification',
    datasetId: dataset.datasetId,
    snapshotDate: dataset.snapshotDate,
    method:
      'Stratified reopening of immutable local snapshots. This is independent of normalization: each sample rehashes the raw bytes and rechecks candidate identity, direct evidence linkage, attribution, and temporal precision.',
    samples,
    summary: {
      sampleCount: samples.length,
      matching: samples.filter((item) => item.result === 'matches').length,
      discrepancies: samples.filter((item) => item.result === 'discrepancy')
        .length,
      insufficient: samples.filter((item) => item.result === 'insufficient')
        .length,
      categories: [...new Set(samples.map((item) => item.category))],
      candidateGroups: [...new Set(samples.map((item) => item.candidateGroup))],
      timestampQualities: [
        ...new Set(samples.map((item) => item.sourceTimestampQuality)),
      ],
      blockedSamples: samples.filter((item) => item.blocked).length,
    },
    note: 'Sample results do not replace claim-level review. A matching checksum confirms source integrity, not editorial approval.',
  };
}

function markdownBlockers(report: ScopedBlockerAnalysis): string {
  const rows = report.blockers
    .map(
      (item) =>
        `| ${item.blockerId} | ${item.auditId} | ${item.displayName} | ${item.category} | ${item.blockerCategory} | ${item.claimIds.join(', ') || '—'} | ${item.finalStatus} |`,
    )
    .join('\n');
  return `# 左營／市長範圍 blocker analysis\n\n- 原始 blocker rows：${report.originalBlockerRowCount}\n- 受影響 audit：${report.affectedAuditCount}\n- 機器解決：${report.summary.machineRemediated}\n- 仍阻擋：${report.summary.remainingBlocked}\n- 中性缺口：${report.summary.neutralGaps}\n\n每一列 blocker 都保留原始 audit 與 claim 關聯；同一 audit 的多列不合併。\n\n| Blocker ID | Audit | 候選人 | 類別 | 分類 | Claim IDs | 最終狀態 |\n|---|---|---|---|---|---|---|\n${rows}\n\n## 人工邊界\n\n目前沒有新增來源、reviewer 或決策。中性缺口不代表事實不存在；現職、候選人自述、公共關係與行政結果均不得因機器重開而自動發布。`;
}

function markdownVerification(report: ScopedVerificationReport): string {
  const rows = report.samples
    .map(
      (item) =>
        `| ${item.verificationId} | ${item.displayName} | ${item.candidateGroup} | ${item.category} | ${item.claimId} | ${item.sourceId} | ${item.sourceTimestampQuality} | ${item.result} | ${item.discrepancy ?? '—'} |`,
    )
    .join('\n');
  return `# 左營／市長範圍 independent verification\n\n${report.method}\n\n- Samples：${report.summary.sampleCount}\n- Matches：${report.summary.matching}\n- Discrepancies：${report.summary.discrepancies}\n- Insufficient：${report.summary.insufficient}\n- Blocked samples：${report.summary.blockedSamples}\n- Categories：${report.summary.categories.join('、')}\n- Candidate groups：${report.summary.candidateGroups.join('、')}\n- Timestamp qualities：${report.summary.timestampQualities.join('、')}\n\n| Sample | 候選人 | 範圍 | 類別 | Claim | Source | 時間品質 | 結果 | 差異 |\n|---|---|---|---|---|---|---|---|---|\n${rows}\n\n每個 sample 都重新開啟 immutable raw snapshot、比對 SHA-256/byte length，並重新確認 identity observation、direct evidence、attribution 與 temporal precision。此檢查不等於人工核准。`;
}

function markdownQueue(report: ScopedReviewQueueReport): string {
  const rows = report.items
    .map(
      (item) =>
        `| ${item.reviewItemId} | ${item.displayName} | ${item.category} | ${item.claimId ?? '—'} | ${item.readiness} | ${item.attribution ?? '—'} | ${item.blockingIssues.join('；') || '—'} |`,
    )
    .join('\n');
  return `# 左營／市長範圍 review queue\n\n- Claim items：${report.summary.claimItems}\n- Coverage-gap items：${report.summary.coverageGapItems}\n- Ready for human review：${report.summary.readyForHumanReview}\n- Blocked：${report.summary.blocked}\n- Requires additional evidence：${report.summary.requiresAdditionalEvidence}\n\n這是 17 位候選人的 local-only claim-level review queue。Queue 只建議處置，不代表核准；source URL 與原始 evidence excerpt 保留在 JSON。\n\n| Item | 候選人 | 類別 | Claim | Readiness | Attribution | Blocking issues |\n|---|---|---|---|---|---|---|\n${rows}`;
}

function markdownReadiness(report: ScopedPublicationReadiness): string {
  const rows = report.candidates
    .map(
      (item) =>
        `| ${item.displayName} | ${item.electionType} | ${item.totalClaims} | ${item.verifiedSourceClaims} | ${item.releaseReadyClaims} | ${item.blockedClaims} | ${item.missingCategories.join('、') || '—'} |`,
    )
    .join('\n');
  const matrix = report.categoryMatrix
    .map(
      (item) =>
        `| ${item.candidateId} | ${item.category} | ${item.claimCount} | ${item.releaseReadyClaimCount} | ${item.status} |`,
    )
    .join('\n');
  return `# 左營／市長範圍 publication readiness\n\n- Claims：${report.summary.totalClaims}\n- Machine evidence-linked：${report.summary.verifiedSourceClaims}\n- Ready for human review：${report.summary.releaseReadyClaims}\n- Blocked：${report.summary.blockedClaims}\n- Human reviewed：${report.summary.humanReviewedClaims}\n- Editorially approved：${report.summary.editoriallyApprovedClaims}\n- Published：${report.summary.publishedClaims}\n\nReady for human review is not approved or published.\n\n## Candidate summary\n\n| Candidate | Election | Claims | Evidence-linked | Ready | Blocked | Missing categories |\n|---|---|---:|---:|---:|---:|---|\n${rows}\n\n## 17 × 6 category matrix\n\n| Candidate ID | Category | Claims | Ready | Status |\n|---|---|---:|---:|---|\n${matrix}`;
}

function markdownQuality(
  dataset: EnrichmentDataset,
  blockers: ScopedBlockerAnalysis,
  queue: ScopedReviewQueueReport,
  verification: ScopedVerificationReport,
): string {
  const attempts = new Map<string, number>();
  const timestamps = new Map<string, number>();
  for (const source of dataset.sourceAttempts) {
    attempts.set(
      source.sourceClass,
      (attempts.get(source.sourceClass) ?? 0) + 1,
    );
    timestamps.set(
      source.timestampQuality,
      (timestamps.get(source.timestampQuality) ?? 0) + 1,
    );
  }
  return `# 左營／市長範圍 publication quality\n\nSnapshot：${dataset.snapshotDate}\n\n- 17 candidates × 6 categories = ${dataset.audits.length} audits\n- ${dataset.sourceAttempts.length} source attempts; ${new Set(dataset.sourceAttempts.map((item) => item.sourceId)).size} source records\n- ${dataset.observations.length} identity observations; all name-only flags false\n- ${dataset.claims.length} claims and ${dataset.evidence.length} direct evidence records\n- ${blockers.originalBlockerRowCount} blocker rows across ${blockers.affectedAuditCount} audits; ${blockers.summary.remainingBlocked} remain blocked\n- Queue: ${queue.summary.claimItems} claim items + ${queue.summary.coverageGapItems} coverage gaps\n- Verification: ${verification.summary.sampleCount} samples, ${verification.summary.matching} matches, ${verification.summary.discrepancies} discrepancies, ${verification.summary.insufficient} insufficient\n- Duplicate groups: ${dataset.duplicateGroups.length}; retained without deletion/merge\n- Human-reviewed/editorially-approved/published: 0/0/0\n\n## Source classes\n\n${[...attempts.entries()].map(([key, value]) => `- ${key}: ${value}`).join('\n')}\n\n## Timestamp quality\n\n${[...timestamps.entries()].map(([key, value]) => `- ${key}: ${value}`).join('\n')}\n\n## Integrity boundary\n\nAll raw source checks are re-opened offline. News navigation noise remains visible in evidence for human inspection and is not promoted into a fact. Preliminary, formal, and party status values remain source-scoped. No scoped normalized, review, or queue data is imported by public profile code.`;
}

function prepare(): void {
  const dataset = validateEnrichmentDataset(readJson(DATASET_PATH));
  const packet = validateEnrichmentReviewPacket(readJson(PACKET_PATH));
  sourceIntegrity(dataset);
  const blockerAnalysis = buildScopedBlockerAnalysis(dataset);
  const queue = buildScopedReviewQueue(dataset, packet, blockerAnalysis);
  const readiness = buildScopedPublicationReadiness(dataset, packet, queue);
  const verification = buildVerificationReport(
    dataset,
    packet,
    queue,
    blockerAnalysis,
  );
  const gate = evaluateScopedEnrichmentPublicationGate(
    dataset,
    [],
    EMPTY_REGISTRY,
  );
  validateScopedBlockerAnalysis(blockerAnalysis);
  validateScopedReviewQueue(queue);
  validateScopedPublicationReadiness(readiness);
  validateScopedVerificationReport(verification);
  validateScopedPublicationGateReport(gate);
  const approvedLayer = readJson(APPROVED_PATH) as { records?: unknown[] };
  const publishedLayer = readJson(PUBLISHED_PATH) as { records?: unknown[] };
  if (
    (approvedLayer.records?.length ?? 0) !== 0 ||
    (publishedLayer.records?.length ?? 0) !== 0
  )
    throw new Error(
      'Scoped approved and published layers must remain empty without real authorized decisions.',
    );
  writeJson('reports/zuoying-mayoral-blocker-analysis.json', blockerAnalysis);
  writeJson('reports/zuoying-mayoral-review-queue.json', queue);
  writeJson(
    'reports/zuoying-mayoral-independent-verification.json',
    verification,
  );
  writeJson('reports/zuoying-mayoral-publication-readiness.json', readiness);
  writeJson('reports/zuoying-mayoral-publication-gate.json', gate);
  writeFileSync(
    join(ROOT, 'reports/zuoying-mayoral-blocker-analysis.md'),
    `${markdownBlockers(blockerAnalysis)}\n`,
    'utf8',
  );
  writeFileSync(
    join(ROOT, 'reports/zuoying-mayoral-independent-verification.md'),
    `${markdownVerification(verification)}\n`,
    'utf8',
  );
  writeFileSync(
    join(ROOT, 'reports/zuoying-mayoral-review-queue.md'),
    `${markdownQueue(queue)}\n`,
    'utf8',
  );
  writeFileSync(
    join(ROOT, 'reports/zuoying-mayoral-publication-readiness.md'),
    `${markdownReadiness(readiness)}\n`,
    'utf8',
  );
  writeFileSync(
    join(ROOT, 'reports/zuoying-mayoral-publication-quality.md'),
    `${markdownQuality(dataset, blockerAnalysis, queue, verification)}\n`,
    'utf8',
  );
  console.log(
    `Scoped review/publication preparation complete: ${blockerAnalysis.originalBlockerRowCount} blocker rows, ${queue.items.length} queue items, ${verification.samples.length} independent samples, ${gate.eligibleClaims}/${gate.totalClaims} publication-eligible.`,
  );
}

function validatePersisted(): void {
  const dataset = validateEnrichmentDataset(readJson(DATASET_PATH));
  validateEnrichmentReviewPacket(readJson(PACKET_PATH));
  sourceIntegrity(dataset);
  const blockerAnalysis = validateScopedBlockerAnalysis(
    readJson('reports/zuoying-mayoral-blocker-analysis.json'),
  );
  const queue = validateScopedReviewQueue(
    readJson('reports/zuoying-mayoral-review-queue.json'),
  );
  const readiness = validateScopedPublicationReadiness(
    readJson('reports/zuoying-mayoral-publication-readiness.json'),
  );
  const verification = validateScopedVerificationReport(
    readJson('reports/zuoying-mayoral-independent-verification.json'),
  );
  const gate = validateScopedPublicationGateReport(
    readJson('reports/zuoying-mayoral-publication-gate.json'),
  );
  if (
    blockerAnalysis.originalBlockerRowCount !==
      blockerAnalysis.blockers.length ||
    blockerAnalysis.affectedAuditCount !==
      new Set(blockerAnalysis.blockers.map((item) => item.auditId)).size
  )
    throw new Error('Persisted blocker analysis counts do not match its rows.');
  if (
    queue.summary.claimItems + queue.summary.coverageGapItems !==
    queue.items.length
  )
    throw new Error(
      'Persisted review queue summary does not match item count.',
    );
  if (
    readiness.summary.totalClaims !== dataset.claims.length ||
    readiness.candidates.length !== 17 ||
    readiness.categoryMatrix.length !== 102
  )
    throw new Error(
      'Persisted publication readiness does not cover the exact scoped matrix.',
    );
  if (
    verification.summary.sampleCount !== verification.samples.length ||
    verification.samples.length < 6
  )
    throw new Error(
      'Persisted independent verification sample count is invalid.',
    );
  if (
    gate.totalClaims !== dataset.claims.length ||
    gate.eligibleClaims !== 0 ||
    gate.reviewerIds.length !== 0
  )
    throw new Error(
      'Scoped publication gate must remain 0 eligible with the empty production registry.',
    );
  console.log(
    `Scoped review/publication validation passed: ${dataset.claims.length} claims, ${blockerAnalysis.blockers.length} blocker rows, ${queue.items.length} queue items, ${verification.samples.length} independent samples, ${gate.eligibleClaims} eligible.`,
  );
}

function main(): void {
  const command = process.argv[2] ?? 'prepare';
  if (command === 'prepare' || command === 'report') {
    prepare();
    return;
  }
  if (command === 'validate' || command === 'verify') {
    validatePersisted();
    return;
  }
  throw new Error(`Unknown scoped review command: ${command}`);
}

main();
