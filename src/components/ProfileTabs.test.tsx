import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { officialCandidateProfiles } from '../data/official';
import { collectNewsCards, PROFILE_TABS } from './ProfileTabs';

describe('candidate profile section structure', () => {
  it('exposes exactly the four production sections in Traditional Chinese', () => {
    expect(PROFILE_TABS).toEqual([
      { id: 'basic', label: '基本資料' },
      { id: 'policies', label: '政策主張' },
      { id: 'news', label: '相關新聞' },
      { id: 'career', label: '從政歷程' },
    ]);
  });

  it('does not retain obsolete standalone profile sections', () => {
    const labels = PROFILE_TABS.map((tab) => tab.label);
    expect(labels).not.toContain('公共紀錄');
    expect(labels).not.toContain('公共關係史');
    expect(labels).not.toContain('政治時間軸');
  });

  it('does not retain sentiment filters or sentiment labels in the UI source', () => {
    const source = readFileSync(
      fileURLToPath(new URL('./ProfileTabs.tsx', import.meta.url)),
      'utf8',
    );
    for (const token of [
      '正負面新聞',
      '正負面',
      'news-filter-',
      'newsClassificationLabels',
      'NewsClassification',
      "'positive'",
      "'negative'",
    ]) {
      expect(source).not.toContain(token);
    }
  });
});

const candidatesWithNews = officialCandidateProfiles.filter(
  (candidate) => (candidate.publicRecords?.news.length ?? 0) > 0,
);

describe('neutral candidate news presentation', () => {
  it('exposes no sentiment field on any public news card', () => {
    expect(candidatesWithNews.length).toBeGreaterThan(0);
    const forbidden =
      /sentiment|classification|positive|negative|neutral|disputed/i;
    for (const candidate of candidatesWithNews) {
      const cards = collectNewsCards(candidate);
      expect(cards.length).toBeGreaterThan(0);
      for (const card of cards) {
        expect(Object.keys(card).filter((key) => forbidden.test(key))).toEqual(
          [],
        );
      }
    }
  });

  it('keeps every eligible article and sorts newest first', () => {
    const candidate = candidatesWithNews.find(
      (item) => (item.publicRecords?.news.length ?? 0) > 1,
    );
    expect(candidate).toBeDefined();
    if (!candidate) return;
    const cards = collectNewsCards(candidate);
    expect(cards).toHaveLength(candidate.publicRecords?.news.length ?? 0);
    const dates = cards.map((card) => card.publicationDate);
    expect(dates).toEqual([...dates].sort((a, b) => b.localeCompare(a)));
  });
});
