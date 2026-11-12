import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const researchRoot = join(root, 'data/research/2026/basic-profiles');
const queue = JSON.parse(
  readFileSync(join(researchRoot, 'queue.json'), 'utf8'),
) as {
  candidates: Array<{
    candidateId: string;
    displayName: string;
    batchId: string;
    status: string;
    fieldStatus: Record<string, string>;
  }>;
};
const roster = JSON.parse(
  readFileSync(
    join(root, 'data/approved/2026/kaohsiung-election.json'),
    'utf8',
  ),
) as { candidates: Array<{ id: string }> };

const batchFiles = readdirSync(join(researchRoot, 'researcher')).filter(
  (name) => /^batch-\d{2}\.json$/.test(name),
);
const batches = batchFiles.map(
  (name) =>
    JSON.parse(
      readFileSync(join(researchRoot, 'researcher', name), 'utf8'),
    ) as {
      batchId: string;
      candidates: Array<{
        candidateId: string;
        displayName: string;
        status: string;
        claims: Array<{ claimId: string; candidateId: string }>;
      }>;
    },
);

const verifierFiles = readdirSync(join(researchRoot, 'verifier')).filter(
  (name) => /^batch-\d{2}\.json$/.test(name),
);
const verifiers = verifierFiles.map(
  (name) =>
    JSON.parse(readFileSync(join(researchRoot, 'verifier', name), 'utf8')) as {
      batchId: string;
      decisions: Array<{ claimId: string }>;
    },
);

const rosterIds = new Set(roster.candidates.map((candidate) => candidate.id));
const queueIds = queue.candidates.map((candidate) => candidate.candidateId);

describe('basic profile research workflow', () => {
  it('queues exactly the 106 canonical roster candidates', () => {
    expect(queueIds).toHaveLength(106);
    expect(new Set(queueIds).size).toBe(106);
    expect([...queueIds].sort()).toEqual([...rosterIds].sort());
    for (const candidate of queue.candidates) {
      expect(candidate.displayName.length).toBeGreaterThan(0);
      expect(candidate.batchId).toMatch(/^batch-\d{2}$/);
      expect(Object.keys(candidate.fieldStatus)).toHaveLength(6);
    }
  });

  it('maps every research batch record to a roster candidate without duplicates', () => {
    expect(batches).toHaveLength(9);
    const researched = batches.flatMap((batch) => batch.candidates);
    expect(researched).toHaveLength(106);
    expect(new Set(researched.map((entry) => entry.candidateId)).size).toBe(
      106,
    );
    for (const entry of researched) {
      expect(rosterIds.has(entry.candidateId)).toBe(true);
      expect([
        'research-completed',
        'needs-additional-evidence',
        'publication-blocked',
      ]).toContain(entry.status);
      for (const claim of entry.claims) {
        expect(claim.candidateId).toBe(entry.candidateId);
        expect(claim.claimId).toMatch(/^bp-[a-z0-9-]+$/);
      }
    }
  });

  it('has one independent verifier decision for every researcher claim', () => {
    const claimsByBatch = new Map(
      batches.map((batch) => [
        batch.batchId,
        new Set(
          batch.candidates.flatMap((entry) =>
            entry.claims.map((claim) => claim.claimId),
          ),
        ),
      ]),
    );
    const decisionsByBatch = new Map(
      verifiers.map((batch) => [
        batch.batchId,
        new Set(batch.decisions.map((decision) => decision.claimId)),
      ]),
    );
    for (const [batchId, claims] of claimsByBatch) {
      const decisions = decisionsByBatch.get(batchId);
      expect(decisions, batchId).toBeDefined();
      expect(decisions?.size, batchId).toBe(claims.size);
      for (const claimId of claims) {
        expect(decisions?.has(claimId), `${batchId} ${claimId}`).toBe(true);
      }
    }
  });
});
