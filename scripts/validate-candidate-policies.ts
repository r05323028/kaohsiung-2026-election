import { readFileSync } from 'node:fs';
import { validateOfficialDataset } from '../src/data/official/schema';
import { validatePublishedPolicyDataset } from '../src/data/policy-research/published-schema';
import { validatePolicyResearchDataset } from '../src/data/policy-research/schema';

function readJson<T>(relative: string): T {
  try {
    return JSON.parse(readFileSync(relative, 'utf8')) as T;
  } catch (error) {
    throw new Error(
      'Failed to read ' +
        relative +
        ': ' +
        (error instanceof Error ? error.message : String(error)),
    );
  }
}

const failures: string[] = [];
function check(condition: boolean, message: string): void {
  if (!condition) failures.push(message);
}

const published = validatePublishedPolicyDataset(
  readJson<unknown>('data/published/2026/candidate-policies.json'),
);
const dataset = validatePolicyResearchDataset(
  readJson<unknown>('data/policy-research/2026/full-roster.json'),
);
const roster = validateOfficialDataset(
  readJson<unknown>('data/approved/2026/kaohsiung-election.json'),
);

const candidateIds = new Set(
  roster.candidates.map((candidate) => candidate.id),
);
const policyById = new Map(
  dataset.policies.map((policy) => [policy.policyId, policy]),
);
const sourceById = new Map(
  dataset.sourceSnapshots.map((source) => [source.sourceId, source]),
);
const evidenceById = new Map(
  dataset.evidence.map((evidence) => [evidence.evidenceId, evidence]),
);
const decisionByPolicy = new Map(
  dataset.verification.map((decision) => [decision.policyId, decision]),
);

check(published.candidateCount === 106, 'published candidateCount is not 106');
check(
  published.policyCount === published.policies.length,
  'published policyCount does not match inventory',
);
check(
  new Set(published.policies.map((policy) => policy.policyId)).size ===
    published.policies.length,
  'duplicate published policyId',
);

const approvedIds = new Set(
  dataset.policies
    .filter((policy) => policy.publicationStatus === 'approved-source-backed')
    .map((policy) => policy.policyId),
);
check(
  approvedIds.size === published.policies.length,
  'published artifact does not match approved inventory',
);

for (const policy of published.policies) {
  check(
    candidateIds.has(policy.candidateId),
    'unknown candidate ' + policy.candidateId,
  );
  const sourcePolicy = policyById.get(policy.policyId);
  check(
    sourcePolicy !== undefined,
    'unknown published policy ' + policy.policyId,
  );
  if (!sourcePolicy) continue;
  check(
    sourcePolicy.candidateId === policy.candidateId,
    'cross-candidate leak ' + policy.policyId,
  );
  check(
    sourcePolicy.publicationStatus === 'approved-source-backed',
    'unapproved policy published ' + policy.policyId,
  );
  check(
    decisionByPolicy.get(policy.policyId)?.decision === 'verified',
    'unverified policy published ' + policy.policyId,
  );
  const source = sourceById.get(sourcePolicy.sourceId);
  const evidence = evidenceById.get(sourcePolicy.evidenceId);
  check(
    source?.retrievalStatus === 'retrieved',
    'unretrieved source ' + policy.policyId,
  );
  check(
    typeof source?.url === 'string' &&
      policy.sources.some((item) => item.url === source.url),
    'source url mismatch ' + policy.policyId,
  );
  check(
    typeof evidence?.quotedText === 'string' &&
      policy.sources.some((item) => item.excerpt === evidence.quotedText),
    'source excerpt mismatch ' + policy.policyId,
  );
  check(
    (sourcePolicy.categories as string[]).includes(policy.category),
    'category mismatch ' + policy.policyId,
  );
}

if (failures.length > 0) {
  process.stderr.write(failures.join('\n') + '\n');
  process.exitCode = 1;
} else {
  process.stdout.write(
    'Validated ' +
      published.policies.length +
      ' published policy records across ' +
      new Set(published.policies.map((policy) => policy.candidateId)).size +
      ' candidates.\n',
  );
}
