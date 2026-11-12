import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ResearcherBatch, VerifierBatch } from './batch-schema';
import { ResearcherBatchSchema, VerifierBatchSchema } from './batch-schema';
import { candidates, readJson, researcherDir, verifierDir } from './lib';

const role = process.argv[2];
const batchId = process.argv[3];
if (!role || !batchId) {
  console.error(
    'Usage: npx tsx scripts/basic-profile/check-batch.ts <researcher|verifier> <batch-XX>',
  );
  process.exit(2);
}
const path =
  role === 'researcher'
    ? join(researcherDir, `${batchId}.json`)
    : join(verifierDir, `${batchId}.json`);
let raw: unknown;
try {
  raw = JSON.parse(readFileSync(path, 'utf8'));
} catch (error) {
  console.error(`Cannot read ${path}: ${(error as Error).message}`);
  process.exit(1);
}
const schema =
  role === 'researcher' ? ResearcherBatchSchema : VerifierBatchSchema;
const parsed = schema.safeParse(raw);
if (!parsed.success) {
  console.error('Schema errors:');
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}
const data = parsed.data;
const candidateIds = new Set(candidates.map((candidate) => candidate.id));
if (data.batchId !== batchId) {
  console.error(
    `Batch id mismatch: file says ${data.batchId}, expected ${batchId}`,
  );
  process.exit(1);
}
if (role === 'researcher') {
  const batch = data as ResearcherBatch;
  const seenClaims = new Set<string>();
  for (const entry of batch.candidates) {
    if (!candidateIds.has(entry.candidateId)) {
      console.error(`Unknown candidate: ${entry.candidateId}`);
      process.exit(1);
    }
    if (
      entry.identityStatus === 'resolved' &&
      entry.identitySignals.length < 2
    ) {
      console.error(
        `${entry.displayName}: resolved identity needs at least two signals.`,
      );
      process.exit(1);
    }
    for (const claim of entry.claims) {
      if (claim.candidateId !== entry.candidateId) {
        console.error(`${claim.claimId}: candidateId mismatch.`);
        process.exit(1);
      }
      if (seenClaims.has(claim.claimId)) {
        console.error(`Duplicate claim id: ${claim.claimId}`);
        process.exit(1);
      }
      seenClaims.add(claim.claimId);
      if (claim.source.sourceClass === 'wikipedia-reference') {
        console.error(`${claim.claimId}: Wikipedia cannot be sole evidence.`);
        process.exit(1);
      }
    }
  }
  console.log(
    `OK ${batchId}: ${batch.candidates.length} candidates, ${batch.candidates.reduce((sum, entry) => sum + entry.claims.length, 0)} claims.`,
  );
} else {
  const batch = data as VerifierBatch;
  const researcherBatch = readJson<ResearcherBatch>(
    join(researcherDir, `${batchId}.json`),
  );
  const claimIds = new Set(
    researcherBatch.candidates.flatMap((entry) =>
      entry.claims.map((claim) => claim.claimId),
    ),
  );
  const seen = new Set<string>();
  for (const decision of batch.decisions) {
    if (!candidateIds.has(decision.candidateId)) {
      console.error(`Unknown candidate: ${decision.candidateId}`);
      process.exit(1);
    }
    if (!claimIds.has(decision.claimId)) {
      console.error(
        `Decision references an unknown claim: ${decision.claimId}`,
      );
      process.exit(1);
    }
    if (seen.has(decision.claimId)) {
      console.error(`Duplicate decision for claim: ${decision.claimId}`);
      process.exit(1);
    }
    seen.add(decision.claimId);
    if (
      decision.verdict === 'verified' &&
      (!decision.reopenedEvidence.accessible ||
        !decision.reopenedEvidence.matchesClaim ||
        !decision.checks.identityMatch ||
        !decision.checks.supportsField ||
        !decision.checks.dateConsistent ||
        !decision.checks.currentStatusCorrect)
    ) {
      console.error(
        `${decision.decisionId}: verdict verified requires all checks true and accessible matching evidence.`,
      );
      process.exit(1);
    }
  }
  const missing = [...claimIds].filter((claimId) => !seen.has(claimId));
  if (missing.length > 0) {
    console.error(
      `Missing decisions for ${missing.length} claims: ${missing.slice(0, 5).join(', ')}`,
    );
    process.exit(1);
  }
  console.log(
    `OK ${batchId}: ${batch.decisions.length} decisions covering all ${claimIds.size} claims.`,
  );
}
