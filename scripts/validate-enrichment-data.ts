import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  ENRICHMENT_CATEGORIES,
  EnrichmentEmptyLayerSchema,
  validateEnrichmentDataset,
  validateEnrichmentReviewPacket,
} from '../src/data/enrichment';
import { validateOfficialDataset } from '../src/data/official/schema';

const ROOT = resolve(process.cwd());
const SNAPSHOT_DATE = '2026-11-07';
const ROSTER_PATH = 'data/approved/2026/kaohsiung-election.json';
const DATASET_PATH = 'data/enrichment/normalized/2026/zuoying-mayoral.json';
const REVIEW_PATH = 'data/enrichment/review/2026/zuoying-mayoral-review.json';
const APPROVED_PATH = 'data/enrichment/approved/2026/zuoying-mayoral.json';
const PUBLISHED_PATH = 'data/enrichment/published/2026/zuoying-mayoral.json';
const CHECKPOINT_PATH = 'data/enrichment/checkpoints/2026/zuoying-mayoral.json';

const SCOPED_NAMES = [
  '黃文志',
  '李雅芬',
  '白喬茵',
  '柳淑芳',
  '李眉蓁',
  '李雅慧',
  '陳玫娟',
  '張以理',
  '陳冠宇',
  '陳麗珍',
  '薛兆基',
  '尹立',
  '張靜',
  '王肇民',
  '柯志恩',
  '洪方隆',
  '賴瑞隆',
];

function absolute(path: string): string {
  return join(ROOT, path);
}

function readJsonObject(path: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(absolute(path), 'utf8')) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON in ${path}: ${message}`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
    throw new Error(`Expected a JSON object in ${path}.`);
  return parsed as Record<string, unknown>;
}

function sha256(path: string): string {
  return createHash('sha256')
    .update(readFileSync(absolute(path)))
    .digest('hex');
}

function main(): void {
  const dataset = validateEnrichmentDataset(readJsonObject(DATASET_PATH));
  const packet = validateEnrichmentReviewPacket(readJsonObject(REVIEW_PATH));
  const approved = EnrichmentEmptyLayerSchema.parse(
    readJsonObject(APPROVED_PATH),
  );
  const published = EnrichmentEmptyLayerSchema.parse(
    readJsonObject(PUBLISHED_PATH),
  );
  const checkpoint = readJsonObject(CHECKPOINT_PATH);
  if (
    dataset.snapshotDate !== SNAPSHOT_DATE ||
    packet.snapshotDate !== SNAPSHOT_DATE
  )
    throw new Error('Scoped enrichment snapshot date is not 2026-11-07.');
  if (
    approved.snapshotDate !== SNAPSHOT_DATE ||
    published.snapshotDate !== SNAPSHOT_DATE
  )
    throw new Error('Scoped empty layers have the wrong snapshot date.');
  if (approved.records.length !== 0 || published.records.length !== 0)
    throw new Error(
      'Scoped approved/published layers must remain empty before authorized decisions.',
    );
  if (JSON.stringify(checkpoint) !== JSON.stringify(dataset.checkpoint))
    throw new Error(
      'Scoped checkpoint does not match the normalized dataset checkpoint.',
    );
  const official = validateOfficialDataset(readJsonObject(ROSTER_PATH));
  const expectedIds = SCOPED_NAMES.map((name) => {
    const matches = official.candidates.filter(
      (candidate) => candidate.displayName === name,
    );
    if (matches.length !== 1 || !matches[0])
      throw new Error(`Expected one official roster candidate for ${name}.`);
    return matches[0].id;
  });
  if (
    JSON.stringify([...dataset.candidateIds].sort()) !==
    JSON.stringify([...expectedIds].sort())
  )
    throw new Error(
      'Scoped dataset candidate IDs differ from the canonical 17-candidate scope.',
    );
  if (
    packet.claims.length !== dataset.claims.length ||
    packet.evidence.length !== dataset.evidence.length ||
    packet.audits.length !== dataset.audits.length
  )
    throw new Error(
      'Scoped review packet is not a complete pending projection.',
    );
  const auditKeys = new Set(
    dataset.audits.map((audit) => `${audit.candidateId}:${audit.category}`),
  );
  for (const candidateId of dataset.candidateIds)
    for (const category of ENRICHMENT_CATEGORIES)
      if (!auditKeys.has(`${candidateId}:${category}`))
        throw new Error(`Missing scoped audit ${candidateId}:${category}.`);
  const sourceHashes = new Map(
    dataset.sourceChecks.map((check) => [check.sourceId, check]),
  );
  for (const source of dataset.sourceAttempts) {
    const path = source.rawPath;
    if (!path || !existsSync(absolute(path)))
      throw new Error(`Missing scoped raw source ${path ?? '<null>'}.`);
    if (source.sha256 === null || source.byteLength === null)
      throw new Error(`Source ${source.sourceId} has no retained checksum.`);
    const actual = sha256(path);
    if (
      actual !== source.sha256 ||
      statSync(absolute(path)).size !== source.byteLength
    )
      throw new Error(`Scoped source checksum/size mismatch: ${path}`);
    const check = sourceHashes.get(source.sourceId);
    if (
      !check ||
      check.expectedSha256 !== actual ||
      check.actualSha256 !== actual ||
      check.byteLength !== source.byteLength
    )
      throw new Error(`Missing or stale source check for ${source.sourceId}.`);
  }
  if (
    dataset.claims.some(
      (claim) =>
        claim.reviewerId !== null ||
        claim.reviewedAt !== null ||
        claim.publicationStatus !== 'withheld-pending-review',
    )
  )
    throw new Error(
      'Scoped claims contain reviewer/publication state before review.',
    );
  if (dataset.observations.some((observation) => observation.isNameOnlyMatch))
    throw new Error('Scoped dataset contains a name-only identity match.');
  if (dataset.sourceAttempts.some((attempt) => attempt.isNegativeEvidence))
    throw new Error(
      'Scoped dataset marks a source attempt as negative evidence.',
    );
  if (
    dataset.verifications.filter(
      (verification) => verification.result === 'matches',
    ).length < 2
  )
    throw new Error(
      'Scoped independent verification has fewer than two matching samples.',
    );
  if (
    !dataset.verifications.some(
      (verification) => verification.candidateGroup === 'district-4',
    ) ||
    !dataset.verifications.some(
      (verification) => verification.candidateGroup === 'mayoral',
    )
  )
    throw new Error(
      'Scoped independent verification must cover District 4 and mayoral sources.',
    );
  if (
    dataset.claims.length !== dataset.evidence.length ||
    dataset.audits.length !== 102
  )
    throw new Error('Scoped claim/evidence/audit counts are incomplete.');
  console.log(
    `Scoped enrichment data valid: 17 candidates, 102 audits, ${dataset.claims.length} claims/evidence, ${dataset.sourceChecks.length} source records, ${dataset.duplicateGroups.length} duplicate groups, 0 approved/published.`,
  );
}

main();
