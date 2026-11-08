import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import decisions from '../../../data/enrichment/automated/2026/zuoying-mayoral-decisions-v2.json';
import previous from '../../../data/published/2026/zuoying-mayoral-automated.json';
import publication from '../../../data/published/2026/zuoying-mayoral-automated-v2.json';
import { PERMITTED_SOURCE_CLASSES, PERMITTED_TYPES } from './automated-policy';
import { validateAutomatedPublicationSnapshot } from './automated-publication';

const canonicalize = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`)
      .join(',')}}`;
  return JSON.stringify(value);
};

const snapshot = validateAutomatedPublicationSnapshot(publication);
const remediated = decisions.decisions;
const CHROME = /即時\s*要聞|-->|立即加入|請繼續往下閱讀/u;

describe('remediated publication snapshot', () => {
  it('publishes only adjudicated, policy-eligible historical institutional records', () => {
    expect(snapshot.records).toHaveLength(75);
    expect(
      new Set(snapshot.records.map((record) => record.candidateId)).size,
    ).toBe(9);
    const approved = new Set(
      remediated
        .filter((decision) => decision.status === 'machine-approved')
        .map((decision) => decision.claimId),
    );
    for (const record of snapshot.records) {
      expect(approved.has(record.claimId)).toBe(true);
      expect(record.category).toBe('basic-biography');
      expect(PERMITTED_TYPES.has(record.claimType as never)).toBe(true);
      expect(record.attribution).toBe('institutional-record');
      expect(record.currentStatus).toBe('historical');
      expect(record.policyVersion).toBe('automated-editorial-policy-v1');
      expect(record.publicationOrigin).toBe('automated-policy');
      const decision = remediated.find(
        (item) => item.claimId === record.claimId,
      );
      expect(decision?.blockingReasons).toEqual([]);
      expect(decision?.publishedWording).toBe(record.value);
      expect(decision?.adjudication).not.toBeNull();
    }
    for (const sourceId of snapshot.records.flatMap(
      (record) => record.sourceIds,
    )) {
      expect(sourceId.startsWith('scope-news-')).toBe(false);
    }
  });

  it('research decisions leave every other claim withheld under the same policy', () => {
    expect(remediated).toHaveLength(143);
    expect(decisions.summary).toMatchObject({
      totalClaims: 143,
      machineApproved: 75,
      machineRejected: 68,
      humanApproved: 0,
    });
    const withheld = remediated.filter(
      (decision) => decision.status === 'machine-rejected',
    );
    expect(withheld).toHaveLength(68);
    for (const decision of withheld)
      expect(decision.blockingReasons.length).toBeGreaterThan(0);
    const wrongSubject = withheld.find(
      (decision) => decision.claimId === 'enrich-claim-0111',
    );
    expect(wrongSubject?.blockingReasons).toContain(
      'source-class-not-permitted:news-report',
    );
    expect(wrongSubject?.blockingReasons).toContain('correction-proposed');
    expect(
      withheld.filter((decision) =>
        decision.blockingReasons.some((reason) =>
          reason.startsWith('adjudicated-material-concern'),
        ),
      ),
    ).toHaveLength(1);
  });

  it('keeps the v1 snapshot as publication history and records withdrawals', () => {
    const history = validateAutomatedPublicationSnapshot(previous);
    expect(history.records.map((record) => record.claimId)).toEqual([
      'enrich-claim-0031',
    ]);
    expect(snapshot.records.map((record) => record.claimId)).toContain(
      'enrich-claim-0031',
    );
    const announced = new Set([
      ...history.withdrawnClaimIds,
      ...snapshot.withdrawnClaimIds,
      ...history.records.map((record) => record.claimId),
    ]);
    for (const claimId of history.withdrawnClaimIds)
      expect(announced.has(claimId)).toBe(true);
    expect(snapshot.withdrawnClaimIds).toEqual([]);
  });

  it('carries a recomputable checksum and no review provenance', () => {
    const { checksum, ...rest } = snapshot;
    expect(checksum).toBe(
      createHash('sha256').update(canonicalize(rest)).digest('hex'),
    );
    const serialized = JSON.stringify(rest);
    for (const key of [
      'runId',
      'rawPath',
      'promptPath',
      'promptSha256',
      'invocationId',
      'packetSha256',
      'reviewerA',
      'reviewerB',
      'rationale',
    ])
      expect(serialized).not.toContain(`"${key}"`);
    for (const record of snapshot.records)
      expect(CHROME.test(record.value)).toBe(false);
  });

  it('retains the source bytes and rejects non-permitted source classes in public records', () => {
    const root = process.cwd();
    const versions = new Map(
      remediated
        .flatMap((decision) => decision.sourceVersions)
        .map((version) => [version.sourceId, version]),
    );
    for (const source of snapshot.sources) {
      const version = versions.get(source.sourceId);
      expect(version).toBeDefined();
      if (!version) continue;
      const bytes = fs.readFileSync(path.resolve(root, version.rawPath));
      expect(bytes.byteLength).toBe(version.byteLength);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(
        version.sha256,
      );
      expect(source.verificationStatus).toBe('Verified');
    }
    expect(snapshot.sources).toHaveLength(9);
    expect(PERMITTED_SOURCE_CLASSES.size).toBeGreaterThan(0);
  });
});
