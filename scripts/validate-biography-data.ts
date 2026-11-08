import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import approvedInput from '../data/approved/2026/biographies.json';
import rosterInput from '../data/approved/2026/kaohsiung-election.json';
import checkpointInput from '../data/checkpoints/2026/biographies.json';
import normalizedInput from '../data/normalized/2026/biographies.json';
import reviewInput from '../data/review/2026/biographies-review.json';
import verificationInput from '../reports/biography-verification.json';
import {
  assertClaimEvidence,
  BiographyCheckpointSchema,
  validateBiographyApprovedDataset,
  validateBiographyDataset,
  validateBiographyReviewDataset,
} from '../src/data/biographies/schema';

const root = process.cwd();
const normalized = validateBiographyDataset(normalizedInput);
const checkpointResult = BiographyCheckpointSchema.safeParse(checkpointInput);
if (!checkpointResult.success) {
  throw new Error(
    `Biography checkpoint validation failed:\n${checkpointResult.error.issues
      .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
      .join('\n')}`,
  );
}
const checkpoint = checkpointResult.data;
const review = validateBiographyReviewDataset(reviewInput);
const approved = validateBiographyApprovedDataset(approvedInput);

if (normalized.snapshotDate !== checkpoint.snapshotDate) {
  throw new Error(
    'Biography checkpoint snapshot date does not match normalized data.',
  );
}
assertClaimEvidence(normalized);
if (normalized.candidateCount !== rosterInput.candidates.length) {
  throw new Error(
    `Biography candidate count ${normalized.candidateCount} does not match approved roster count ${rosterInput.candidates.length}.`,
  );
}
if (normalized.audits.length !== normalized.candidateCount) {
  throw new Error(
    'Biography coverage must contain one audit for every roster candidate.',
  );
}
const auditCandidateIds = new Set(
  normalized.audits.map((audit) => audit.candidateId),
);
const rosterCandidateIds = new Set(
  rosterInput.candidates.map((candidate) => candidate.id),
);
if (
  auditCandidateIds.size !== rosterCandidateIds.size ||
  [...rosterCandidateIds].some((id) => !auditCandidateIds.has(id))
) {
  throw new Error(
    'Biography audits do not cover the approved roster IDs exactly.',
  );
}
if (
  review.items.reduce((count, item) => count + item.claimIds.length, 0) !==
  normalized.claims.length
) {
  throw new Error(
    'Biography review packet does not cover every normalized claim.',
  );
}
if (review.reviewerId !== null || review.reviewedAt !== null) {
  throw new Error(
    'Biography review packet contains reviewer metadata before review.',
  );
}
if (
  normalized.claims.some(
    (claim) => claim.publicationStatus === 'approved-static',
  )
) {
  throw new Error(
    'Normalized biography data cannot contain statically approved claims.',
  );
}
if (
  approved.records.some(
    (claim) => claim.publicationStatus !== 'approved-static',
  )
) {
  throw new Error(
    'Approved biography records must all be marked approved-static.',
  );
}

const verificationSamples = Array.isArray(verificationInput.samples)
  ? verificationInput.samples
  : [];
for (const sample of verificationSamples) {
  const expectedSourceIds = new Set([
    ...normalized.observations
      .filter((observation) =>
        observation.candidateIds.includes(sample.candidateId),
      )
      .map((observation) => observation.sourceId),
    ...normalized.claims
      .filter((claim) => claim.candidateId === sample.candidateId)
      .flatMap((claim) => claim.sourceIds),
  ]);
  const actualSourceIds = new Set(sample.sourceIds);
  if (
    actualSourceIds.size !== expectedSourceIds.size ||
    [...expectedSourceIds].some((sourceId) => !actualSourceIds.has(sourceId))
  ) {
    throw new Error(
      `Biography verification source association is not candidate-specific for ${sample.candidateId}.`,
    );
  }
  if (
    sample.status === 'reopened-no-match-not-negative' &&
    actualSourceIds.size !== 0
  ) {
    throw new Error(
      `Biography no-match verification sample ${sample.candidateId} must not imply source support.`,
    );
  }
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}
let checkedSnapshots = 0;
for (const source of normalized.sources) {
  if (!source.rawPath || !source.sha256) continue;
  const absolutePath = join(root, source.rawPath);
  if (!existsSync(absolutePath))
    throw new Error(`Missing biography raw snapshot: ${source.rawPath}`);
  const actual = sha256(absolutePath);
  if (actual !== source.sha256) {
    throw new Error(
      `Biography snapshot checksum mismatch for ${source.sourceId}: expected ${source.sha256}, got ${actual}.`,
    );
  }
  checkedSnapshots += 1;
}

console.log(
  JSON.stringify(
    {
      datasetId: normalized.datasetId,
      candidates: normalized.candidateCount,
      audits: normalized.audits.length,
      observations: normalized.observations.length,
      evidence: normalized.evidence.length,
      claims: normalized.claims.length,
      reviewItems: review.items.length,
      approvedClaims: approved.records.length,
      checkedSnapshots,
      conflicts: normalized.conflicts.length,
    },
    null,
    2,
  ),
);
