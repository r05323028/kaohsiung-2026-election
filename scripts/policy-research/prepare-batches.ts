import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const BATCH_DIR = path.join(ROOT, 'data/policy-research/2026/extraction');
const BATCH_SIZE = 9;

type Candidate = {
  id: string;
  displayName: string;
  districtId: string;
  electionType: string;
  politicalParty: string | null;
};

type NewsItem = {
  candidateId: string;
  headline: string;
  publisher: string;
  publishedAt: string | null;
  retrievalStatus: string;
  rawPath: string | null;
};

async function readJson<T>(file: string): Promise<T> {
  try {
    return JSON.parse(await readFile(path.join(ROOT, file), 'utf8')) as T;
  } catch (error) {
    throw new Error(
      'Failed to read ' + file + ': ' + (error instanceof Error ? error.message : String(error)),
    );
  }
}

async function main(): Promise<void> {
  const roster = await readJson<{ candidates: Candidate[] }>(
    'data/approved/2026/kaohsiung-election.json',
  );
  const seed = await readJson<{ policies: { candidateId: string }[] }>(
    'data/policy-research/2026/full-roster.json',
  );
  const news = await readJson<{ items: NewsItem[] }>(
    'data/policy-research/2026/discovery/news-discovery.json',
  );

  const seedCount = new Map<string, number>();
  for (const policy of seed.policies) {
    seedCount.set(policy.candidateId, (seedCount.get(policy.candidateId) ?? 0) + 1);
  }

  const filesByCandidate = new Map<string, NewsItem[]>();
  for (const item of news.items) {
    if (item.retrievalStatus !== 'retrieved' || !item.rawPath) continue;
    const list = filesByCandidate.get(item.candidateId) ?? [];
    list.push(item);
    filesByCandidate.set(item.candidateId, list);
  }

  await mkdir(BATCH_DIR, { recursive: true });
  const batches: string[][] = [];
  for (let index = 0; index < roster.candidates.length; index += BATCH_SIZE) {
    batches.push(roster.candidates.slice(index, index + BATCH_SIZE).map((c) => c.id));
  }

  for (const [index, candidateIds] of batches.entries()) {
    const batchId = 'batch-' + String(index + 1).padStart(2, '0');
    const candidates = roster.candidates
      .filter((candidate) => candidateIds.includes(candidate.id))
      .map((candidate) => ({
        candidateId: candidate.id,
        displayName: candidate.displayName,
        electionType: candidate.electionType,
        districtId: candidate.districtId,
        politicalParty: candidate.politicalParty,
        existingSeedPolicyCount: seedCount.get(candidate.id) ?? 0,
        files: (filesByCandidate.get(candidate.id) ?? []).map((item) => ({
          rawPath: item.rawPath,
          headline: item.headline,
          publisher: item.publisher,
          publishedAt: item.publishedAt,
        })),
      }));
    await writeFile(
      path.join(BATCH_DIR, batchId + '-input.json'),
      JSON.stringify({ batchId, candidates }, null, 2) + '\n',
      'utf8',
    );
  }
  process.stdout.write('wrote ' + batches.length + ' batches\n');
}

await main();
