/**
 * Verifies the remediated publication set: decisions, snapshot, source bytes,
 * withdrawal history, and the fact that the site module actually serves the
 * remediated snapshot.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type remediatedDecisionsInput from '../../data/enrichment/automated/2026/zuoying-mayoral-decisions-v2.json';
import datasetInput from '../../data/enrichment/normalized/2026/zuoying-mayoral.json';
import previousSnapshotInput from '../../data/published/2026/zuoying-mayoral-automated.json';
import remediatedSnapshotInput from '../../data/published/2026/zuoying-mayoral-automated-v2.json';
import {
  AUTOMATED_POLICY_VERSION,
  PERMITTED_SOURCE_CLASSES,
  PERMITTED_TYPES,
} from '../../src/data/enrichment/automated-policy';
import {
  automatedPublicationSnapshot,
  validateAutomatedPublicationSnapshot,
} from '../../src/data/enrichment/automated-publication';
import { validateEnrichmentDataset } from '../../src/data/enrichment/schema';
import {
  canonicalize,
  PATHS,
  ROOT,
  readJson,
  readRaw,
  sha256,
  sourcePublisher,
} from './lib';

const WITHDRAWAL_PATH =
  'data/published/2026/zuoying-mayoral-withdrawal-history.json';
const FORBIDDEN_PUBLIC_KEYS = [
  'runId',
  'rawPath',
  'promptPath',
  'promptSha256',
  'invocationId',
  'packetSha256',
  'reviewerA',
  'reviewerB',
  'reasoning',
  'referenceAnswer',
];
const CHROME = /即時\s*要聞|-->|立即加入|請繼續往下閱讀|跳到主要內容/u;

const fail = (message: string): never => {
  throw new Error(`Remediated publication verification failed: ${message}`);
};

export function verifyRemediatedPublication(): void {
  const dataset = validateEnrichmentDataset(datasetInput);
  const decisions = readJson<typeof remediatedDecisionsInput>(
    PATHS.remediationDecisions,
  );
  const snapshot = validateAutomatedPublicationSnapshot(
    remediatedSnapshotInput,
  );
  const previous = validateAutomatedPublicationSnapshot(previousSnapshotInput);
  const withdrawalHistory = readJson<{
    withdrawals: Array<{ claimId: string; reason: string }>;
  }>(WITHDRAWAL_PATH);

  if (snapshot.policyVersion !== AUTOMATED_POLICY_VERSION)
    fail('snapshot policy version drifted');
  if (decisions.decisions.length !== dataset.claims.length)
    fail('decision count does not equal claim count');

  const claimIds = new Set(dataset.claims.map((claim) => claim.claimId));
  for (const decision of decisions.decisions)
    if (!claimIds.has(decision.claimId))
      fail(`decision references unknown claim ${decision.claimId}`);

  const approved = new Set(
    decisions.decisions
      .filter((decision) => decision.status === 'machine-approved')
      .map((decision) => decision.claimId),
  );
  const published = new Set(snapshot.records.map((record) => record.claimId));
  if (approved.size !== published.size)
    fail('approved/published count mismatch');
  for (const claimId of approved)
    if (!published.has(claimId))
      fail(`approved claim ${claimId} is not published`);
  for (const record of snapshot.records) {
    if (!approved.has(record.claimId))
      fail(`published record ${record.claimId} lacks machine approval`);
    const decision = decisions.decisions.find(
      (item) => item.claimId === record.claimId,
    );
    if (!decision) fail(`published record ${record.claimId} lacks a decision`);
    if (decision?.blockingReasons.length !== 0)
      fail(`published record ${record.claimId} still carries blocking reasons`);
    if (decision?.publishedWording !== record.value)
      fail(
        `published record ${record.claimId} wording differs from its decision`,
      );
    if (decision?.adjudication === null)
      fail(
        `published record ${record.claimId} lacks fresh adjudication provenance`,
      );
    if (record.category !== 'basic-biography')
      fail(`published record ${record.claimId} uses a non-permitted category`);
    if (!PERMITTED_TYPES.has(record.claimType as never))
      fail(
        `published record ${record.claimId} uses a non-permitted claim type`,
      );
    if (
      record.attribution !== 'institutional-record' ||
      record.currentStatus !== 'historical'
    )
      fail(
        `published record ${record.claimId} is not a historical institutional record`,
      );
    if (CHROME.test(record.value))
      fail(`published record ${record.claimId} contains page chrome`);
  }

  const expectedChecksum = sha256(
    canonicalize({
      schemaVersion: snapshot.schemaVersion,
      datasetId: snapshot.datasetId,
      policyVersion: snapshot.policyVersion,
      snapshotDate: snapshot.snapshotDate,
      generatedAt: snapshot.generatedAt,
      records: snapshot.records,
      sources: snapshot.sources,
      withdrawnClaimIds: snapshot.withdrawnClaimIds,
      note: snapshot.note,
    }),
  );
  if (snapshot.checksum !== expectedChecksum)
    fail('snapshot checksum mismatch');
  if (automatedPublicationSnapshot.checksum !== snapshot.checksum)
    fail('site module does not serve the remediated snapshot');

  const serialized = JSON.stringify(snapshot);
  for (const key of FORBIDDEN_PUBLIC_KEYS)
    if (serialized.includes(`"${key}"`)) fail(`public snapshot leaks ${key}`);

  const retired = previous.records.filter(
    (record) => !published.has(record.claimId),
  );
  for (const record of retired)
    if (!snapshot.withdrawnClaimIds.includes(record.claimId))
      fail(`retired record ${record.claimId} is not recorded as withdrawn`);
  for (const claimId of snapshot.withdrawnClaimIds)
    if (!withdrawalHistory.withdrawals.some((item) => item.claimId === claimId))
      fail(`withdrawn claim ${claimId} lacks a withdrawal-history entry`);

  const sourceIds = new Set(
    snapshot.records.flatMap((record) => record.sourceIds),
  );
  for (const source of snapshot.sources) {
    if (!sourceIds.has(source.sourceId))
      fail(`source ${source.sourceId} is published but unused`);
    if (source.publisher !== sourcePublisher(source.sourceId))
      fail(`source ${source.sourceId} publisher drifted`);
    const version = decisions.decisions
      .flatMap((decision) => decision.sourceVersions)
      .find((item) => item.sourceId === source.sourceId);
    if (!version)
      throw new Error(
        `Remediated publication verification failed: source ${source.sourceId} lacks a retained version`,
      );
    const rawPath = resolve(ROOT, version.rawPath);
    if (!existsSync(rawPath))
      fail(`source ${source.sourceId} raw file is missing`);
    const raw = readRaw(version.rawPath);
    if (sha256(raw) !== version.sha256)
      fail(`source ${source.sourceId} checksum drifted`);
    if (Buffer.byteLength(raw, 'utf8') !== version.byteLength)
      fail(`source ${source.sourceId} byte length drifted`);
  }

  for (const decision of decisions.decisions)
    if (decision.status === 'machine-approved')
      for (const version of decision.sourceVersions)
        if (/^scope-news-/u.test(version.sourceId))
          fail(`approved claim ${decision.claimId} cites a news-only source`);

  const badSourceClass = decisions.decisions
    .filter((decision) => decision.status === 'machine-approved')
    .flatMap((decision) => decision.sourceIds)
    .filter((sourceId) => {
      const attempt = dataset.sourceAttempts.find(
        (item) => item.sourceId === sourceId,
      );
      return (
        !attempt || !PERMITTED_SOURCE_CLASSES.has(attempt.sourceClass as never)
      );
    });
  if (badSourceClass.length > 0)
    fail(
      `published claims cite non-permitted source classes: ${badSourceClass.join(',')}`,
    );

  const summaries = readJson<{ summary: { humanApproved: number } }>(
    'reports/adjudication-remediated.json',
  );
  if (summaries.summary.humanApproved !== 0)
    fail('remediations report claims a human approval');
  if (previous.checksum === snapshot.checksum)
    fail('remediated snapshot is identical to the v1 history snapshot');

  console.log(
    `Remediated publication verified: ${snapshot.records.length} published records across ${new Set(snapshot.records.map((record) => record.candidateId)).size} candidates, ${snapshot.sources.length} retained sources, checksum ${snapshot.checksum.slice(0, 12)}…, retained from v1: ${
      previous.records
        .filter((record) => published.has(record.claimId))
        .map((record) => record.claimId)
        .join(',') || 'none'
    }.`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`)
  verifyRemediatedPublication();
