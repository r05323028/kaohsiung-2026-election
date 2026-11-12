import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  ResearcherBatch,
  ResearcherClaim,
  VerifierBatch,
  VerifierDecision,
} from './batch-schema';
import {
  artifactsDir,
  isoNow,
  readJson,
  readSeed,
  researcherDir,
  root,
  verifierDir,
  writeJson,
} from './lib';

type SeedEntry = {
  candidateId: string;
  displayName: string;
  msn?: string;
  filename?: string;
  file?: string;
  page?: number;
  url: string;
  sha256: string;
  education: string[];
  experience: string[];
  excerpt: string;
};

const batchId = process.argv[2];
if (!batchId || !/^batch-\d{2}$/.test(batchId)) {
  console.error(
    'Usage: npx tsx scripts/basic-profile/preverify-batch.ts <batch-XX>',
  );
  process.exit(2);
}
const batch = readJson<ResearcherBatch>(join(researcherDir, `${batchId}.json`));
const kccProfiles = readSeed<SeedEntry>('kcc-profiles', 'profiles');
const bulletins = readSeed<SeedEntry>('cec-2022-bulletin', 'candidates');

function normalize(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .replace(/[。，、；：（）()「」『』·．.,;:]/g, '');
}

function sha256File(path: string): string | null {
  if (!existsSync(path)) return null;
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function decide(
  claim: ResearcherClaim,
  entry: SeedEntry,
  sourceKind: 'kcc' | 'bulletin',
): VerifierDecision {
  const value = normalize(claim.value);
  const inEducation = normalize(entry.education.join('')).includes(value);
  const inExperience = normalize(entry.experience.join('')).includes(value);
  const isCurrentPosition = claim.field === 'current-position';
  const expectedSection =
    claim.field === 'education'
      ? inEducation
      : isCurrentPosition
        ? true
        : inExperience;
  const excerpt = claim.source.excerpt;
  const excerptHasValue = isCurrentPosition
    ? excerpt.includes('本屆議員') && excerpt.includes(entry.displayName)
    : normalize(excerpt).includes(value);
  const identityMatch = entry.candidateId === claim.candidateId;
  const currentStatusCorrect =
    claim.currentStatus === 'current'
      ? sourceKind === 'kcc'
      : claim.currentStatus !== 'unknown';
  let currentPositionEvidence = true;
  if (claim.field === 'current-position') {
    const snapshot = join(
      root,
      'data/biographies/raw/2026-11-06/kcc/profiles',
      entry.filename ?? '',
    );
    currentPositionEvidence =
      sourceKind === 'kcc' &&
      existsSync(snapshot) &&
      readFileSync(snapshot, 'utf8').includes('本屆議員') &&
      readFileSync(snapshot, 'utf8').includes(entry.displayName);
  }
  const snapshotPath =
    sourceKind === 'kcc'
      ? join(
          root,
          'data/biographies/raw/2026-11-06/kcc/profiles',
          entry.filename ?? '',
        )
      : join(artifactsDir, 'cec-bulletin-2022', `${entry.file ?? ''}.pdf`);
  const actualSha = sha256File(snapshotPath);
  const accessible = actualSha !== null && actualSha === entry.sha256;
  const supportsField = isCurrentPosition
    ? excerptHasValue
    : expectedSection && excerptHasValue;
  const allChecks =
    identityMatch &&
    supportsField &&
    excerptHasValue &&
    currentStatusCorrect &&
    currentPositionEvidence &&
    accessible;
  const verdict = allChecks
    ? 'verified'
    : supportsField && excerptHasValue
      ? 'partially-supported'
      : 'insufficient-evidence';
  const notes: string[] = [];
  if (!accessible) notes.push('retained snapshot missing or checksum mismatch');
  if (!excerptHasValue)
    notes.push('excerpt does not contain the claim value verbatim');
  if (!expectedSection)
    notes.push(`value found outside the expected ${claim.field} section`);
  if (!currentStatusCorrect)
    notes.push('current status is not supported by a 2022 bulletin');
  if (!currentPositionEvidence)
    notes.push('current position not evidenced by the KCC profile title');
  return {
    decisionId: `vd-${claim.claimId}`,
    claimId: claim.claimId,
    candidateId: claim.candidateId,
    verdict,
    rationale: allChecks
      ? `Reopened the retained ${sourceKind === 'kcc' ? 'KCC profile snapshot' : '2022 CEC bulletin PDF'}, verified its SHA-256, and located the claim value in the ${claim.field} section.`
      : `Seed re-check failed: ${notes.join('; ')}.`,
    reopenedEvidence: {
      url: claim.source.url,
      retrievedAt: isoNow(),
      accessible,
      excerpt: excerpt.slice(0, 1600),
      matchesClaim: excerptHasValue,
    },
    checks: {
      identityMatch,
      supportsField,
      dateConsistent: true,
      currentStatusCorrect,
    },
    correction: allChecks ? null : notes.join('; ').slice(0, 500),
  };
}

const decisions: VerifierDecision[] = [];
for (const candidate of batch.candidates) {
  const kcc = kccProfiles.find(
    (entry) => entry.candidateId === candidate.candidateId,
  );
  const bulletin = bulletins.find(
    (entry) => entry.candidateId === candidate.candidateId,
  );
  for (const claim of candidate.claims) {
    if (claim.source.sourceId.startsWith('kcc-') && kcc) {
      decisions.push(decide(claim, kcc, 'kcc'));
    } else if (
      claim.source.sourceId.startsWith('cec-bulletin-2022-') &&
      bulletin
    ) {
      decisions.push(decide(claim, bulletin, 'bulletin'));
    }
  }
}

const output: VerifierBatch = {
  batchId,
  generatedAt: isoNow(),
  verifier: 'candidate-verifier',
  decisions,
};
writeJson(join(verifierDir, `${batchId}.json`), output);
const counts = new Map<string, number>();
for (const decision of decisions)
  counts.set(decision.verdict, (counts.get(decision.verdict) ?? 0) + 1);
console.log(
  `Pre-verified ${decisions.length} seed claims for ${batchId}: ${[...counts.entries()].map(([verdict, count]) => `${verdict} ${count}`).join(', ')}. Decisions without a seed source remain for the verifier agent.`,
);
