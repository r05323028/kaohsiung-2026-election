import { describe, expect, it } from 'vitest';
import { deriveLoadable } from '../../../../scripts/avatar/likeness/derive';

const APPEARANCE_SHA = 'a'.repeat(64);
const KIT_SHA = 'b'.repeat(64);

function manifest(overrides: Record<string, unknown> = {}) {
  const entry = {
    candidateId: 'official-mayor-a-2026',
    slug: 'a-2026',
    displayName: 'A',
    photoIds: ['photo-a'],
    photoIdentityConfidence: 'source-linked',
    appearanceId: 'mayor-a-2026',
    appearanceSha256: APPEARANCE_SHA,
    state: 'generated',
    blockedReason: null,
    headKit: {
      path: '/assets/avatars/likeness/a-2026-head.glb',
      sha256: KIT_SHA,
      fileSizeBytes: 220_000,
      meshCount: 8,
      materialCount: 8,
      triangleCount: 12_000,
      bounds: {
        minX: -0.6,
        maxX: 0.6,
        minY: -0.2,
        maxY: 1.1,
        minZ: -0.5,
        maxZ: 0.5,
      },
      generator: 'head_kit.py',
      blenderVersion: '5.3.0',
    },
    ...overrides,
  };
  return {
    schemaVersion: 1,
    pipelineVersion: '1.0.0',
    generatedAt: '2026-01-01T00:00:00+08:00',
    roster: {
      source: 'data/approved/2026/kaohsiung-election.json',
      candidateCount: 1,
      sha256: 'c'.repeat(64),
    },
    candidates: [entry],
  };
}

function review(decisions: unknown[]) {
  return {
    schemaVersion: 1,
    note: 'Hand-authored likeness decisions.',
    decisions,
  };
}

function decision(overrides: Record<string, unknown> = {}) {
  return {
    candidateId: 'official-mayor-a-2026',
    decision: 'approved',
    reviewer: 'human-reviewer',
    reviewedAt: '2026-01-02',
    appearanceSha256: APPEARANCE_SHA,
    headKitSha256: KIT_SHA,
    note: 'Looks like the candidate in the reference photo.',
    ...overrides,
  };
}

function derive(candidateManifest: unknown, reviewFile: unknown) {
  return deriveLoadable(
    Buffer.from(JSON.stringify(candidateManifest)),
    Buffer.from(JSON.stringify(reviewFile)),
  );
}

describe('likeness publication gate', () => {
  it('publishes nothing without a human decision', () => {
    const { loadable, errors } = derive(manifest(), review([]));
    expect(errors).toEqual([]);
    expect(loadable.kits).toEqual([]);
  });

  it('publishes an approved kit that is pinned to the current artefacts', () => {
    const { loadable, errors } = derive(manifest(), review([decision()]));
    expect(errors).toEqual([]);
    expect(loadable.kits).toEqual([
      {
        candidateId: 'official-mayor-a-2026',
        slug: 'a-2026',
        path: '/assets/avatars/likeness/a-2026-head.glb',
        sha256: KIT_SHA,
      },
    ]);
  });

  it('withholds a kit that was regenerated after review', () => {
    const { loadable, errors } = derive(
      manifest(),
      review([decision({ headKitSha256: 'd'.repeat(64) })]),
    );
    expect(loadable.kits).toEqual([]);
    expect(errors.join(' ')).toContain('re-review after regeneration');
  });

  it('withholds a kit whose appearance record changed after review', () => {
    const { loadable, errors } = derive(
      manifest(),
      review([decision({ appearanceSha256: 'e'.repeat(64) })]),
    );
    expect(loadable.kits).toEqual([]);
    expect(errors.join(' ')).toContain('re-extraction');
  });

  it('refuses to publish a likeness whose photo is not source-linked', () => {
    const { loadable, errors } = derive(
      manifest({ photoIdentityConfidence: 'probable' }),
      review([decision()]),
    );
    expect(loadable.kits).toEqual([]);
    expect(errors.join(' ')).toContain('photo identity is probable');
  });

  it('records a rejection without publishing the kit', () => {
    const { loadable, errors } = derive(
      manifest(),
      review([decision({ decision: 'rejected' })]),
    );
    expect(errors).toEqual([]);
    expect(loadable.kits).toEqual([]);
  });

  it('refuses a decision for a candidate outside the manifest', () => {
    const { loadable, errors } = derive(
      manifest(),
      review([decision({ candidateId: 'someone-else' })]),
    );
    expect(loadable.kits).toEqual([]);
    expect(errors.join(' ')).toContain('outside the roster');
  });

  it('refuses to approve a candidate that has no generated head kit', () => {
    const extracted = manifest({ state: 'extracted', headKit: null });
    const { loadable, errors } = derive(extracted, review([decision()]));
    expect(loadable.kits).toEqual([]);
    expect(errors.join(' ')).toContain('no generated head kit');
  });
});
