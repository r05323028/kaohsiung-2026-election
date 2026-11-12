import { BASIC_PROFILE_FIELDS } from '../../src/data/basic-profiles/schema';
import {
  isoNow,
  normalizedPath,
  queueCandidates,
  queuePath,
  readJson,
  writeJson,
} from './lib';

type NormalizedClaim = {
  field: string;
  disposition: string;
  verification?: { verdict: string } | null;
};

type NormalizedCandidate = {
  candidateId: string;
  verificationStatus: string;
  finalStatus: string;
  claims: NormalizedClaim[];
};

const normalized = readJson<{ candidates: NormalizedCandidate[] }>(
  normalizedPath,
);
const byCandidate = new Map(
  normalized.candidates.map((candidate) => [candidate.candidateId, candidate]),
);
let updated = 0;

for (const entry of queueCandidates) {
  const candidate = byCandidate.get(entry.candidateId);
  if (!candidate) continue;
  entry.verificationStatus = candidate.verificationStatus;
  entry.finalStatus = candidate.finalStatus;
  entry.fieldStatus = Object.fromEntries(
    BASIC_PROFILE_FIELDS.map((field) => {
      const claims = candidate.claims.filter((claim) => claim.field === field);
      if (
        claims.some((claim) => claim.disposition === 'publication-eligible')
      ) {
        return [field, 'published'];
      }
      if (claims.some((claim) => claim.verification?.verdict === 'verified')) {
        return [field, 'verified'];
      }
      if (claims.length > 0) return [field, 'researched'];
      return [field, 'no-evidence'];
    }),
  );
  updated += 1;
}

const queue = readJson<Record<string, unknown>>(queuePath);
queue.generatedAt = isoNow();
queue.candidates = queueCandidates;
writeJson(queuePath, queue);
console.log('Synced queue status for ' + updated + ' candidates.');
