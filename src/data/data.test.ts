import { describe, expect, it } from 'vitest';
import { demoDatasetInput } from './fixtures';
import {
  candidateProfiles,
  dataset,
  getCandidateProfile,
  searchIndex,
} from './index';
import { validateDataset } from './schema';

describe('fictional demo dataset', () => {
  it('validates schema and referential integrity', () => {
    const parsed = validateDataset(demoDatasetInput);
    expect(parsed.candidacies).toHaveLength(4);
    expect(parsed.districts).toHaveLength(2);
    expect(parsed.candidacies.every((item) => item.isDemo)).toBe(true);
  });

  it('keeps stable IDs unique', () => {
    const ids = dataset.candidacies.map((candidate) => candidate.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(dataset.sources.map((source) => source.id)).size).toBe(
      dataset.sources.length,
    );
  });

  it('assembles a complete candidate profile', () => {
    const candidate = getCandidateProfile('lin-haixing-demo');
    expect(candidate).toBeDefined();
    expect(candidate?.policies.length).toBeGreaterThan(0);
    expect(candidate?.records.length).toBeGreaterThan(0);
    expect(candidate?.news.length).toBeGreaterThan(0);
    expect(candidate?.timeline.length).toBeGreaterThan(0);
    expect(candidate?.sources.length).toBeGreaterThan(0);
  });

  it('generates a static search index for the requested fields', () => {
    expect(
      searchIndex.some((item) => item.searchText.includes('港灣示範選區')),
    ).toBe(true);
    expect(
      searchIndex.some((item) => item.searchText.includes('海風共好黨')),
    ).toBe(true);
    expect(candidateProfiles).toHaveLength(searchIndex.length);
  });
});
