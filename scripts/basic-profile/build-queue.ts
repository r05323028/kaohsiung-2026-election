import {
  BASIC_PROFILE_FIELDS,
  BASIC_PROFILE_POLICY_VERSION,
} from '../../src/data/basic-profiles/schema';
import {
  batchIdForIndex,
  candidateById,
  candidates,
  districtById,
  isoNow,
  queuePath,
  sortedCandidates,
  writeJson,
} from './lib';

const ordered = sortedCandidates();
const batchMap = new Map<string, string[]>();
const entries = ordered.map((candidate, index) => {
  const batchId = batchIdForIndex(index);
  const list = batchMap.get(batchId) ?? [];
  list.push(candidate.id);
  batchMap.set(batchId, list);
  const district = districtById.get(candidate.districtId);
  if (!district) throw new Error(`Unknown district: ${candidate.districtId}`);
  return {
    candidateId: candidate.id,
    displayName: candidate.displayName,
    districtId: candidate.districtId,
    districtLabel: district.name,
    electionType: candidate.electionType,
    candidateNumber: candidate.candidateNumber,
    politicalParty: candidate.politicalParty ?? null,
    birthDate: candidate.birthDate ?? null,
    batchId,
    status: 'not-started' as const,
    identityStatus: 'unverified' as const,
    fieldStatus: Object.fromEntries(
      BASIC_PROFILE_FIELDS.map((field) => [field, 'not-started']),
    ),
  };
});

if (entries.length !== 106) {
  throw new Error(`Expected 106 candidates, found ${entries.length}.`);
}
if (new Set(entries.map((entry) => entry.candidateId)).size !== 106) {
  throw new Error('Duplicate candidate ids in queue.');
}
if (candidates.length !== candidateById.size) {
  throw new Error('Duplicate candidate ids in approved roster.');
}

writeJson(queuePath, {
  datasetId: 'kaohsiung-2026-basic-profile-work-queue',
  schemaVersion: '1',
  snapshotDate: '2026-11-12',
  generatedAt: isoNow(),
  policyVersion: BASIC_PROFILE_POLICY_VERSION,
  note: 'One queue entry per canonical 2026 candidate. Field status is tracked separately from candidate status. This queue never changes roster identity, district, or ballot number.',
  batches: [...batchMap.entries()].map(([batchId, candidateIds]) => ({
    batchId,
    candidateIds,
    researcherStatus: 'not-started',
    verifierStatus: 'not-started',
  })),
  candidates: entries,
});
console.log(
  `Wrote ${queuePath} (${entries.length} candidates, ${batchMap.size} batches).`,
);
