import { describe, expect, it } from 'vitest';
import { candidateProfiles, districts } from './index';
import { toPublicCandidateProfile, toPublicDistrict } from './view';

const forbiddenKeys = [
  'research',
  'policyResearch',
  'publicRecordResearch',
  'verificationStatus',
  'reviewStatus',
  'publicationStatus',
  'retrievalDate',
  'machineApprovalId',
  'policyVersion',
  'publicationOrigin',
  'sourceSnapshots',
  'rawPath',
  'identityResolutions',
  'conflicts',
];

const forbiddenStrings = [
  'pending-human-review',
  'machine-validated',
  'withheld-pending-review',
  '待人工審查',
  '中央選舉委員會選舉專區留存快照',
  '目前沒有可公開的已核准履歷主張',
  '待審資料不會載入公開頁面',
];

function collectKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(collectKeys);
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) => [
    key,
    ...collectKeys(child),
  ]);
}

describe('public candidate profile props', () => {
  it('sanitizes every roster and demo candidate before hydration', () => {
    const publicProfiles = candidateProfiles.map((candidate) =>
      toPublicCandidateProfile(candidate),
    );
    const serialized = JSON.stringify(publicProfiles);
    const keys = collectKeys(publicProfiles);

    expect(publicProfiles).toHaveLength(110);
    for (const key of forbiddenKeys) {
      expect(keys).not.toContain(key);
    }
    for (const text of forbiddenStrings) {
      expect(serialized).not.toContain(text);
    }
  });

  it('retains public source links and display records without review metadata', () => {
    const publicProfiles = candidateProfiles.map((candidate) =>
      toPublicCandidateProfile(candidate),
    );
    const officialProfile = publicProfiles.find(
      (candidate) => candidate.candidacy.slug === 'ke-zhi-en-2026',
    );

    expect(officialProfile).toBeDefined();
    expect(officialProfile?.sources.every((source) => source.url)).toBe(true);
    expect(officialProfile).not.toHaveProperty('research');
    expect(officialProfile).not.toHaveProperty('policyResearch');
    expect(officialProfile).not.toHaveProperty('publicRecordResearch');
    if (officialProfile?.biography) {
      expect(officialProfile.biography).not.toHaveProperty('status');
      expect(officialProfile.biography).not.toHaveProperty('note');
    }
  });
  it('sanitizes district props used by the city explorer', () => {
    const publicDistricts = districts.map((district) =>
      toPublicDistrict(district),
    );
    const serialized = JSON.stringify(publicDistricts);

    expect(publicDistricts).toHaveLength(18);
    expect(serialized).not.toContain('scopeNote');
    expect(serialized).not.toContain('description');
    expect(serialized).not.toContain('預公告');
    expect(serialized).not.toContain('不等同黨籍認定');
  });
});
