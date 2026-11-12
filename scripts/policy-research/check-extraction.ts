import { readFileSync } from 'node:fs';
import path from 'node:path';
import { validateExtractionBatch } from '../../src/data/policy-research/extraction-schema';
import { quotePresent, readJsonFile } from './quote-check';

const ROOT = process.cwd();

type BatchInput = {
  batchId: string;
  candidates: {
    candidateId: string;
    displayName: string;
    files: { rawPath: string }[];
  }[];
};

export function checkExtraction(batchId: string): string[] {
  const input = readJsonFile<BatchInput>(
    'data/policy-research/2026/extraction/' + batchId + '-input.json',
  );
  const batch = validateExtractionBatch(
    readJsonFile<unknown>('data/policy-research/2026/extraction/' + batchId + '.json'),
  );

  const allowed = new Map<string, Set<string>>();
  for (const candidate of input.candidates) {
    allowed.set(
      candidate.candidateId,
      new Set(candidate.files.map((file) => file.rawPath)),
    );
  }

  const seen = new Set<string>();
  const duplicateKeys = new Set<string>();
  const problems: string[] = [];
  for (const record of batch.records) {
    if (seen.has(record.researchId)) {
      problems.push('duplicate researchId ' + record.researchId);
    }
    seen.add(record.researchId);
    if (record.duplicateKey) {
      const key = record.candidateId + '\u0000' + record.duplicateKey;
      if (duplicateKeys.has(key)) {
        problems.push(
          record.researchId + ': duplicate proposal key ' + record.duplicateKey,
        );
      }
      duplicateKeys.add(key);
    }
    const files = allowed.get(record.candidateId);
    if (!files) {
      problems.push(record.researchId + ': unknown candidate ' + record.candidateId);
      continue;
    }
    if (!files.has(record.excerptSourcePath)) {
      problems.push(record.researchId + ': source not listed for candidate');
      continue;
    }
    const raw = readFileSync(path.join(ROOT, record.excerptSourcePath), 'utf8');
    if (!quotePresent(raw, record.originalStatement)) {
      problems.push(record.researchId + ': quote not found verbatim in source');
    }
  }
  const withoutPolicy = new Set(
    batch.candidatesWithoutPolicy.map((item) => item.candidateId),
  );
  for (const candidateId of withoutPolicy) {
    if (!allowed.has(candidateId)) {
      problems.push('unknown candidate in candidatesWithoutPolicy ' + candidateId);
    }
  }
  for (const candidate of input.candidates) {
    const covered = batch.records.some(
      (record) => record.candidateId === candidate.candidateId,
    );
    if (!covered && !withoutPolicy.has(candidate.candidateId)) {
      problems.push('candidate missing from output: ' + candidate.candidateId);
    }
  }
  return problems;
}

if (import.meta.url === 'file://' + process.argv[1]) {
  const batchId = process.argv[2];
  if (!batchId) throw new Error('usage: check-extraction.ts <batchId>');
  const problems = checkExtraction(batchId);
  if (problems.length > 0) {
    process.stderr.write(problems.join('\n') + '\n');
    process.exitCode = 1;
  } else {
    process.stdout.write('ok ' + batchId + '\n');
  }
}
