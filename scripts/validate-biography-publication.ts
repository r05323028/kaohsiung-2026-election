import rosterInput from '../data/approved/2026/kaohsiung-election.json';
import input from '../data/published/2026/candidate-biographies.json';
import { calculateBiographySnapshotChecksum } from '../src/data/biographies/checksum';
import { validateBiographyPublicationSnapshot } from '../src/data/biographies/schema';

const snapshot = validateBiographyPublicationSnapshot(input);
const { checksum, ...withoutChecksum } = snapshot;
const expectedChecksum = calculateBiographySnapshotChecksum(withoutChecksum);
if (checksum !== expectedChecksum) {
  throw new Error(
    `Biography snapshot checksum mismatch: expected ${expectedChecksum}, got ${checksum}.`,
  );
}
const rosterIds = new Set(
  rosterInput.candidates.map((candidate) => candidate.id),
);
const unknownCandidateIds = snapshot.records
  .map((claim) => claim.candidateId)
  .filter((candidateId) => !rosterIds.has(candidateId));
if (unknownCandidateIds.length > 0) {
  throw new Error(
    `Biography snapshot contains unknown candidate IDs: ${[...new Set(unknownCandidateIds)].join(', ')}.`,
  );
}
console.log(
  `Biography publication validated: ${snapshot.records.length} claims, ${snapshot.sources.length} sources, ${new Set(snapshot.records.map((claim) => claim.candidateId)).size} candidates.`,
);
