import { describe, expect, it } from 'vitest';
import { getPublishedCandidatePolicies } from '../policy-research/public-index';
import { getPolicyCareer, policyCareerDataset } from './index';
import { readsAsCompletedAction } from './markers';

const { classifications, links } = policyCareerDataset;

describe('policy/career separation dataset', () => {
  it('classifies every published policy exactly once', () => {
    const seen = new Set<string>();
    for (const row of classifications) {
      expect(seen.has(row.policyId)).toBe(false);
      seen.add(row.policyId);
    }
    expect(seen.size).toBe(policyCareerDataset.policyCount);
    expect(policyCareerDataset.review.counts.policies).toBe(seen.size);
  });

  it('never publishes one policy record in both sections', () => {
    const candidates = new Map<string, string[]>();
    for (const row of classifications) {
      const commitments = candidates.get(row.candidateId) ?? [];
      if (row.ownership === 'policy-commitments' || row.ownership === 'split-record') {
        commitments.push(row.policyId);
      }
      candidates.set(row.candidateId, commitments);
    }
    for (const row of classifications) {
      if (row.ownership !== 'political-career') continue;
      const view = getPolicyCareer(row.candidateId);
      const ids = view.commitments.map((commitment) => commitment.policy.policyId);
      expect(ids).not.toContain(row.policyId);
      expect(ids.sort()).toEqual((candidates.get(row.candidateId) ?? []).sort());
    }
  });
  it('keeps split promises distinct from the historical half', () => {
    const split = classifications.filter((row) => row.ownership === 'split-record');
    expect(split).toHaveLength(3);
    for (const row of split) {
      expect(row.commitment).not.toBeNull();
      if (!row.historical) continue;
      expect(row.commitment?.title).not.toBe(row.historical.title);
      expect(row.commitment?.summary ?? '').not.toContain(row.historical.description);
      expect(row.historical.sourceUrls.length).toBeGreaterThan(0);
    }
  });

  it('only reads a promise as a completed action with editorial review', () => {
    for (const row of classifications) {
      if (!row.commitment) continue;
      const policy = getPublishedCandidatePolicies(row.candidateId).find(
        (entry) => entry.policyId === row.policyId,
      );
      if (!policy) continue;
      const text = [policy.title, policy.summary, policy.details].join(' ');
      if (!readsAsCompletedAction(text)) continue;
      expect(row.basis).toBe('editorial-review');
      expect(row.note.length).toBeGreaterThan(0);
    }
  });

  it('links policies to activities of the same candidate', () => {
    expect(links.length).toBe(policyCareerDataset.review.counts.links);
    const pairs = new Set<string>();
    for (const link of links) {
      const policy = getPublishedCandidatePolicies(link.candidateId).find(
        (entry) => entry.policyId === link.policyId,
      );
      expect(policy).toBeDefined();
      const key = link.policyId + '|' + link.activityId;
      expect(pairs.has(key)).toBe(false);
      pairs.add(key);
      if (link.origin === 'automated') {
        expect(link.similarity).toBeGreaterThan(0);
        expect(link.sharedTerms.length).toBeGreaterThan(0);
      } else {
        expect(link.note?.length ?? 0).toBeGreaterThan(0);
      }
    }
  });

  it('moves council history into the career view', () => {
    const row = classifications.find(
      (entry) => entry.policyId === 'policy-2026-huang-bo-lin-07',
    );
    expect(row?.ownership).toBe('political-career');
    const view = getPolicyCareer('official-candidate-2026-district-kaohsiung-council-07-c27cf75d');
    expect(view.commitments.map((c) => c.policy.policyId)).not.toContain(
      'policy-2026-huang-bo-lin-07',
    );
    const record = view.historicalRecords.find(
      (entry) => entry.policyId === 'policy-2026-huang-bo-lin-07',
    );
    expect(record?.sourceUrls.length).toBeGreaterThan(0);
    expect(record?.outcome ?? '').not.toBe('');
    expect(view.movedOutCount).toBeGreaterThan(0);
    expect(view.review.status).toBe('approved');
  });

  it('returns an empty view for a candidate without policy records', () => {
    const view = getPolicyCareer('official-mayor-wang-zhao-min-2026');
    expect(view.commitments).toHaveLength(0);
    expect(view.historicalRecords).toHaveLength(0);
    expect(view.linksByActivityId).toEqual({});
  });
});
