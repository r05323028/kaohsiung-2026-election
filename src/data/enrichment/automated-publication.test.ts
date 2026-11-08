import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import decisions from '../../../data/enrichment/automated/2026/zuoying-mayoral-decisions.json';
import publication from '../../../data/published/2026/zuoying-mayoral-automated.json';
import { validateAutomatedDecisionSet } from './automated-policy';
import {
  AutomatedPublicClaimSchema,
  validateAutomatedPublicationSnapshot,
} from './automated-publication';

const root = process.cwd();

describe('automated candidate publication policy', () => {
  it('accounts for every claim and publishes only the full-agreement low-risk fact', () => {
    const decisionSet = validateAutomatedDecisionSet(decisions);
    const snapshot = validateAutomatedPublicationSnapshot(publication);
    expect(decisionSet.decisions).toHaveLength(143);
    expect(decisionSet.summary).toMatchObject({
      machineApproved: 1,
      machineRejected: 142,
      disagreementClaims: 71,
      humanApproved: 0,
    });
    expect(snapshot.records.map((record) => record.claimId)).toEqual([
      'enrich-claim-0031',
    ]);
    expect(snapshot.records[0]?.publicationOrigin).toBe('automated-policy');
  });

  it('keeps wrong identity, corrections, and disagreement claims blocked', () => {
    const decisionSet = validateAutomatedDecisionSet(decisions);
    const wrongSubject = decisionSet.decisions.find(
      (decision) => decision.claimId === 'enrich-claim-0111',
    );
    expect(wrongSubject?.status).toBe('machine-rejected');
    expect(wrongSubject?.blockingReasons).toContain('wrong-identity-verdict');
    expect(wrongSubject?.blockingReasons).toContain(
      'unresolved-semantic-disagreement',
    );

    const correctionTargets = decisionSet.decisions.filter(
      (decision) => decision.correctionDisposition === 'blocked',
    );
    expect(correctionTargets).toHaveLength(25);
    expect(
      decisionSet.decisions.filter(
        (decision) => decision.semantic.comparison !== 'full-agreement',
      ),
    ).toHaveLength(142);
  });

  it('does not expose machine review provenance or raw paths in public records', () => {
    const snapshot = validateAutomatedPublicationSnapshot(publication);
    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain('runId');
    expect(serialized).not.toContain('rawPath');
    expect(serialized).not.toContain('reviewerId');
    expect(() =>
      AutomatedPublicClaimSchema.parse({
        ...snapshot.records[0],
        runId: 'not-public',
      }),
    ).toThrow();
  });

  it('retains the source bytes used by the published record', () => {
    const decisionSet = validateAutomatedDecisionSet(decisions);
    const approved = decisionSet.decisions.find(
      (decision) => decision.status === 'machine-approved',
    );
    const source = approved?.sourceVersions[0];
    expect(source).toBeDefined();
    if (!source) return;
    const bytes = fs.readFileSync(path.resolve(root, source.rawPath));
    expect(bytes.byteLength).toBe(source.byteLength);
  });
});
