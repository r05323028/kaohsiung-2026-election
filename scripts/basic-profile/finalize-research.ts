import { join } from 'node:path';
import { queuePath, readJson, researcherDir, writeJson } from './lib';

type Claim = { field: string };
type Entry = {
  candidateId: string;
  displayName: string;
  status: string;
  claims: Claim[];
  gaps: string[];
};

type Batch = {
  batchId: string;
  candidates: Entry[];
};

type QueueEntry = {
  candidateId: string;
  status: string;
  fieldStatus: Record<string, string>;
};

type Queue = { candidates: QueueEntry[] };

const files = ['01', '02', '03', '04', '05', '06', '07', '08', '09'];
const byCandidate = new Map<string, Entry>();
let normalized = 0;
let needsEvidence = 0;

for (const suffix of files) {
  const path = join(researcherDir, `batch-${suffix}.json`);
  const batch = readJson<Batch>(path);
  for (const entry of batch.candidates) {
    if (entry.status === 'researching') {
      if (entry.claims.length > 0) {
        entry.status = 'research-completed';
        normalized += 1;
      } else {
        entry.status = 'needs-additional-evidence';
        needsEvidence += 1;
      }
    }
    byCandidate.set(entry.candidateId, entry);
  }
  writeJson(path, batch);
}

const queue = readJson<Queue>(queuePath);
for (const entry of queue.candidates) {
  const research = byCandidate.get(entry.candidateId);
  if (!research) continue;
  entry.status = research.status;
  const researchedFields = new Set(research.claims.map((claim) => claim.field));
  for (const field of Object.keys(entry.fieldStatus)) {
    entry.fieldStatus[field] = researchedFields.has(field)
      ? 'researched'
      : 'no-evidence';
  }
}
writeJson(queuePath, queue);

console.log(
  `Finalized researcher statuses: ${normalized} marked research-completed, ${needsEvidence} marked needs-additional-evidence; queue synced for ${byCandidate.size} candidates.`,
);
