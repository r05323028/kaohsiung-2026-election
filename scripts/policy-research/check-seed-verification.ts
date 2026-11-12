import { readFileSync } from 'node:fs';
import path from 'node:path';
import { validateVerificationBatch } from '../../src/data/policy-research/verification-schema';
import { quotePresent, readJsonFile } from './quote-check';

const ROOT = process.cwd();
const DIR = 'data/policy-research/2026/verification';

type SeedGroup = {
  source: { sourceId: string; title: string; publisher: string; url: string; rawPath: string };
  policies: { policyId: string; originalStatement: string }[];
};

export function checkSeedVerification(batchId: string): string[] {
  const input = readJsonFile<{ groups: SeedGroup[] }>(DIR + '/seed-input-' + batchId + '.json');
  const batch = validateVerificationBatch(
    readJsonFile<unknown>(DIR + '/seed-verify-' + batchId + '.json'),
  );
  const problems: string[] = [];
  const policyIds = new Set(
    input.groups.flatMap((group) => group.policies.map((policy) => policy.policyId)),
  );
  const statements = new Map<string, { statement: string; rawPath: string }>();
  for (const group of input.groups) {
    for (const policy of group.policies) {
      statements.set(policy.policyId, {
        statement: policy.originalStatement,
        rawPath: group.source.rawPath,
      });
    }
  }

  const decided = new Set<string>();
  for (const decision of batch.decisions) {
    const policyId = decision.policyId;
    if (!policyId) {
      problems.push('decision without policyId');
      continue;
    }
    const entry = statements.get(policyId);
    if (!entry) {
      problems.push('unknown policyId ' + policyId);
      continue;
    }
    if (decided.has(policyId)) problems.push('duplicate decision ' + policyId);
    decided.add(policyId);
    const raw = readFileSync(path.join(ROOT, entry.rawPath), 'utf8');
    const present = quotePresent(raw, entry.statement);
    if (present !== decision.checks.excerptPresentInSource) {
      problems.push(policyId + ': excerpt check disagrees with deterministic result');
    }
    if (decision.decision === 'verified' && !present) {
      problems.push(policyId + ': verified but quote is not in source');
    }
  }
  for (const policyId of policyIds) {
    if (!decided.has(policyId)) problems.push('no decision for ' + policyId);
  }
  return problems;
}

const batchId = process.argv[2];
if (!batchId) throw new Error('usage: check-seed-verification.ts <batchId>');
const problems = checkSeedVerification(batchId);
if (problems.length > 0) {
  process.stderr.write(problems.join('\n') + '\n');
  process.exitCode = 1;
} else {
  process.stdout.write('ok ' + batchId + '\n');
}
