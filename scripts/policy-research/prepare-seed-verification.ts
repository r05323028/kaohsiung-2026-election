import { existsSync, readFileSync, writeFileSync } from 'node:fs';

type Roster = { candidates: { id: string; displayName: string }[] };
type SeedSource = {
  sourceId: string;
  url: string;
  publisher: string;
  title: string;
  rawPath: string | null;
  candidateIds: string[];
};
type SeedPolicy = {
  policyId: string;
  candidateId: string;
  title: string;
  neutralSummary: string;
  originalStatement: string;
  statementDate: string | null;
  policyContext: string;
  sourceId: string;
};
type SeedDataset = {
  sourceSnapshots: SeedSource[];
  policies: SeedPolicy[];
};

const OUT_DIR = 'data/policy-research/2026/verification';
const CHUNK = 70;

function readJson<T>(relative: string): T {
  try {
    return JSON.parse(readFileSync(relative, 'utf8')) as T;
  } catch (error) {
    throw new Error(
      'Failed to read ' + relative + ': ' +
        (error instanceof Error ? error.message : String(error)),
    );
  }
}

const seed = readJson<SeedDataset>(
  'data/policy-research/2026/seed/full-roster-2026-11-09.json',
);
const roster = readJson<Roster>('data/approved/2026/kaohsiung-election.json');
const nameById = new Map(roster.candidates.map((candidate) => [candidate.id, candidate.displayName]));
const sourceById = new Map(seed.sourceSnapshots.map((source) => [source.sourceId, source]));

const groups = new Map<string, SeedPolicy[]>();
for (const policy of seed.policies) {
  const list = groups.get(policy.sourceId) ?? [];
  list.push(policy);
  groups.set(policy.sourceId, list);
}

const ordered = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
const batches: { sourceId: string; policies: SeedPolicy[] }[][] = [];
let current: { sourceId: string; policies: SeedPolicy[] }[] = [];
let size = 0;

for (const [sourceId, policies] of ordered) {
  if (size > 0 && size + policies.length > CHUNK) {
    batches.push(current);
    current = [];
    size = 0;
  }
  current.push({ sourceId, policies });
  size += policies.length;
}
if (current.length > 0) batches.push(current);

const missingSource = ordered.filter(([sourceId]) => !sourceById.get(sourceId)?.rawPath);
if (missingSource.length > 0) {
  throw new Error(
    'Seed sources without retained raw bytes: ' +
      missingSource.map(([sourceId]) => sourceId).join(', '),
  );
}

batches.forEach((entries, index) => {
  const batchNumber = String(index + 1).padStart(2, '0');
  const payload = {
    batchId: 'seed-verify-' + batchNumber,
    verifierRole: 'independent-verifier',
    groups: entries.map(({ sourceId, policies }) => {
      const source = sourceById.get(sourceId) as SeedSource;
      return {
        source: {
          sourceId,
          title: source.title,
          publisher: source.publisher,
          url: source.url,
          rawPath: source.rawPath,
        },
        policies: policies.map((policy) => ({
          policyId: policy.policyId,
          candidateId: policy.candidateId,
          candidateName: nameById.get(policy.candidateId) ?? policy.candidateId,
          title: policy.title,
          neutralSummary: policy.neutralSummary,
          originalStatement: policy.originalStatement,
          statementDate: policy.statementDate,
          policyContext: policy.policyContext,
        })),
      };
    }),
  };
  writeFileSync(OUT_DIR + '/seed-input-' + batchNumber + '.json', JSON.stringify(payload, null, 2) + '\n');
  process.stdout.write(
    'seed-input-' + batchNumber + '.json policies=' + entries.reduce((sum, entry) => sum + entry.policies.length, 0) + '\n',
  );
});

if (!existsSync(OUT_DIR)) throw new Error('missing ' + OUT_DIR);
