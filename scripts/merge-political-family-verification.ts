// Merge the per-batch independent verification files into the single record set
// that scripts/generate-political-family-data.ts consumes.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(process.cwd());
const directory = join(root, 'data/research/2026/political-family');
const output = join(directory, 'verification-networks.json');

const files = readdirSync(directory)
  .filter((name) => /^verification-networks-\d{2}\.json$/.test(name))
  .sort();

if (!files.length) {
  throw new Error('No verification-networks-NN.json files found.');
}

const records: unknown[] = [];
const batches: { file: string; records: number }[] = [];
for (const file of files) {
  const parsed = JSON.parse(readFileSync(join(directory, file), 'utf8')) as {
    records?: unknown[];
    relations?: unknown[];
  };
  const values = parsed.records ?? parsed.relations ?? [];
  if (!values.length) throw new Error(file + ' contains no records.');
  records.push(...values);
  batches.push({ file, records: values.length });
}

const seen = new Set<string>();
for (const value of records) {
  const record = value as {
    candidateId?: string;
    relativeName?: string;
    status?: string;
  };
  for (const field of ['candidateId', 'relativeName', 'status'] as const) {
    if (!record[field])
      throw new Error('Verification record is missing ' + field);
  }
  const key = record.candidateId + '|' + record.relativeName;
  if (seen.has(key)) throw new Error('Duplicate verification record: ' + key);
  seen.add(key);
}

writeFileSync(
  output,
  JSON.stringify(
    {
      verificationVersion: '1',
      verifiedAt: new Date().toISOString().slice(0, 10),
      reviewerRole: 'independent-fact-checker',
      mergedFrom: batches,
      records,
    },
    null,
    2,
  ) + '\n',
  'utf8',
);
console.log(JSON.stringify({ files: batches.length, records: records.length }));
