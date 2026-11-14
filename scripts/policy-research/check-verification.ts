import { readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { validateVerificationBatch } from '../../src/data/policy-research/verification-schema';
import { quotePresent, readJsonFile } from './quote-check';

const ROOT = process.cwd();

const InputRecordSchema = z.object({
  researchId: z.string().min(1),
  originalStatement: z.string().min(1),
  source: z.object({ rawPath: z.string().min(1) }),
});

type VerificationInput = {
  batchId: string;
  records: unknown[];
};

function checkVerification(batchId: string): string[] {
  const input = readJsonFile<VerificationInput>(
    'data/policy-research/2026/verification/verify-input-' + batchId + '.json',
  );
  const records = input.records.map((record) =>
    InputRecordSchema.parse(record),
  );
  const verification = validateVerificationBatch(
    readJsonFile<unknown>(
      'data/policy-research/2026/verification/verify-' + batchId + '.json',
    ),
  );

  const problems: string[] = [];
  const ids = new Set(records.map((record) => record.researchId));
  const decided = new Set<string>();
  for (const decision of verification.decisions) {
    const researchId = decision.researchId;
    if (!researchId) {
      problems.push(
        'decision without researchId: ' + (decision.policyId ?? 'unknown'),
      );
      continue;
    }
    if (!ids.has(researchId)) {
      problems.push('unknown researchId ' + researchId);
      continue;
    }
    if (decided.has(researchId)) {
      problems.push('duplicate decision ' + researchId);
    }
    decided.add(researchId);
    const record = records.find((item) => item.researchId === researchId);
    if (!record) continue;
    const raw = readFileSync(path.join(ROOT, record.source.rawPath), 'utf8');
    const present = quotePresent(raw, record.originalStatement);
    if (present !== decision.checks.excerptPresentInSource) {
      problems.push(
        researchId + ': excerpt check disagrees with deterministic result',
      );
    }
    if (decision.decision === 'verified' && !present) {
      problems.push(researchId + ': verified but quote is not in source');
    }
  }
  for (const record of records) {
    if (!decided.has(record.researchId)) {
      problems.push('no decision for ' + record.researchId);
    }
  }
  return problems;
}

const batchId = process.argv[2];
if (!batchId) throw new Error('usage: check-verification.ts <batchId>');
const problems = checkVerification(batchId);
if (problems.length > 0) {
  process.stderr.write(problems.join('\n') + '\n');
  process.exitCode = 1;
} else {
  process.stdout.write('ok ' + batchId + '\n');
}
