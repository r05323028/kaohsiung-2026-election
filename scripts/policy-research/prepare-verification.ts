import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { validateExtractionBatch } from '../../src/data/policy-research/extraction-schema';

const EXTRACTION_DIR = 'data/policy-research/2026/extraction';
const OUT_DIR = 'data/policy-research/2026/verification';
const CHUNK = 24;

type Roster = { candidates: { id: string; displayName: string }[] };
type NewsItem = {
  candidateId: string;
  headline: string;
  publisher: string;
  publishedAt: string | null;
  resolvedUrl: string | null;
  rawPath: string | null;
};

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

const roster = readJson<Roster>('data/approved/2026/kaohsiung-election.json');
const nameById = new Map(
  roster.candidates.map((candidate) => [candidate.id, candidate.displayName]),
);
const news = readJson<{ items: NewsItem[] }>(
  'data/policy-research/2026/discovery/news-discovery.json',
);
const newsByRawPath = new Map(
  news.items
    .filter((item) => item.rawPath !== null)
    .map((item) => [item.rawPath as string, item]),
);

type Record_ = ReturnType<typeof validateExtractionBatch>['records'][number];
const records: Record_[] = [];
for (const file of readdirSync(EXTRACTION_DIR).sort()) {
  if (!/^batch-\d+\.json$/.test(file)) continue;
  const batch = validateExtractionBatch(
    readJson<unknown>(EXTRACTION_DIR + '/' + file),
  );
  for (const record of batch.records) records.push(record);
}

const batches: Record_[][] = [];
for (let index = 0; index < records.length; index += CHUNK) {
  batches.push(records.slice(index, index + CHUNK));
}

batches.forEach((entries, index) => {
  const batchNumber = String(index + 1).padStart(2, '0');
  const payload = {
    batchId: 'verify-' + batchNumber,
    verifierRole: 'independent-verifier',
    records: entries.map((record) => {
      const item = newsByRawPath.get(record.excerptSourcePath);
      return {
        researchId: record.researchId,
        candidateId: record.candidateId,
        candidateName: nameById.get(record.candidateId) ?? record.candidateId,
        title: record.title,
        originalStatement: record.originalStatement,
        summary: record.summary,
        category: record.category,
        policyContext: record.policyContext,
        announcedAt: record.announcedAt,
        source: {
          headline: item?.headline ?? '',
          publisher: item?.publisher ?? '',
          url: item?.resolvedUrl ?? null,
          publishedAt: item?.publishedAt ?? null,
          rawPath: record.excerptSourcePath,
        },
      };
    }),
  };
  writeFileSync(
    OUT_DIR + '/verify-input-' + batchNumber + '.json',
    JSON.stringify(payload, null, 2) + '\n',
  );
  process.stdout.write(
    'verify-input-' + batchNumber + '.json records=' + entries.length + '\n',
  );
});
