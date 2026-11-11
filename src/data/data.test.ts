import { describe, expect, it } from 'vitest';
import {
  demoCandidateProfiles,
  demoDataset,
  getDemoCandidateProfile,
} from './demo';
import { demoDatasetInput } from './fixtures';
import * as productionData from './index';
import { candidateProfiles, getCandidateProfile, searchIndex } from './index';
import { validateDataset } from './schema';

describe('fictional demo dataset', () => {
  it('validates schema and referential integrity', () => {
    const parsed = validateDataset(demoDatasetInput);
    expect(parsed.candidacies).toHaveLength(4);
    expect(parsed.districts).toHaveLength(2);
    expect(parsed.candidacies.every((item) => item.isDemo)).toBe(true);
  });

  it('keeps stable demo IDs unique', () => {
    const ids = demoDataset.candidacies.map((candidate) => candidate.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(demoDataset.sources.map((source) => source.id)).size).toBe(
      demoDataset.sources.length,
    );
  });

  it('assembles a complete demo candidate profile', () => {
    const candidate = getDemoCandidateProfile('lin-haixing-demo');
    expect(candidate).toBeDefined();
    expect(candidate?.policies.length).toBeGreaterThan(0);
    expect(candidate?.records.length).toBeGreaterThan(0);
    expect(candidate?.news.length).toBeGreaterThan(0);
    expect(candidate?.timeline.length).toBeGreaterThan(0);
    expect(candidate?.sources.length).toBeGreaterThan(0);
  });

  it('keeps demo helpers out of the production data API', () => {
    expect('demoDataset' in productionData).toBe(false);
    expect('demoCandidateProfiles' in productionData).toBe(false);
    expect('getDemoCandidateProfile' in productionData).toBe(false);
  });

  it('keeps fictional profiles out of production exports', () => {
    expect(candidateProfiles).toHaveLength(106);
    expect(candidateProfiles.every((item) => !item.person.isDemo)).toBe(true);
    expect(getCandidateProfile('lin-haixing-demo')).toBeUndefined();
    expect(demoCandidateProfiles).toHaveLength(4);
    expect(
      searchIndex.some((item) => item.searchText.includes('港灣示範選區')),
    ).toBe(false);
    expect(candidateProfiles).toHaveLength(searchIndex.length);
  });
});
