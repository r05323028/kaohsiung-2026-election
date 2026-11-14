import { describe, expect, it } from 'vitest';
import { getPoliticalCareer, politicalCareerDataset } from './index';

const roster = politicalCareerDataset.coverage;

describe('political career dataset', () => {
  it('covers every candidate exactly once', () => {
    expect(roster).toHaveLength(106);
    expect(new Set(roster.map((row) => row.candidateId)).size).toBe(106);
  });

  it('only cites sources retained in the dataset', () => {
    const sourceIds = new Set(
      politicalCareerDataset.sources.map((source) => source.sourceId),
    );
    for (const activity of politicalCareerDataset.activities) {
      expect(sourceIds.has(activity.sourceId)).toBe(true);
    }
    for (const term of politicalCareerDataset.officeTerms) {
      for (const sourceId of term.sourceIds) {
        expect(sourceIds.has(sourceId)).toBe(true);
      }
    }
  });

  it('never attributes another candidate statement to a candidate', () => {
    const names = new Map(
      politicalCareerDataset.coverage.map((row) => [row.candidateId, row.displayName]),
    );
    for (const activity of politicalCareerDataset.activities) {
      const own = names.get(activity.candidateId);
      for (const name of names.values()) {
        if (name === own) continue;
        expect(activity.description.includes(name)).toBe(false);
      }
    }
  });

  it('returns a view for covered and uncovered candidates alike', () => {
    const covered = getPoliticalCareer(
      'official-candidate-2026-district-kaohsiung-council-08-440e3b8d',
    );
    expect(covered?.activities.length ?? 0).toBeGreaterThan(0);
    const first = covered?.activities[0];
    const source = first ? covered?.sources[first.sourceId] : undefined;
    expect(source).toBeDefined();
    expect(source && 'rawPath' in source).toBe(false);
    expect(source && 'sha256' in source).toBe(false);

    const uncovered = getPoliticalCareer('official-mayor-zhang-jing-2026');
    expect(uncovered?.activities).toHaveLength(0);
    expect(uncovered?.coverage.status).toBe('no-verifiable-record-found');
  });
});
