import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { officialCandidateProfiles } from '../data/official';
import { getCandidatePropertyDeclaration } from '../data/property-declarations';
import type { PublicCandidateProfile } from '../data/view';
import {
  collectNewsCards,
  PROFILE_TABS,
  PropertyDeclarationTab,
} from './ProfileTabs';

describe('candidate profile section structure', () => {
  it('exposes exactly the six production sections in Traditional Chinese', () => {
    expect(PROFILE_TABS).toEqual([
      { id: 'basic', label: '基本資料' },
      { id: 'policies', label: '政策主張' },
      { id: 'news', label: '相關新聞' },
      { id: 'career', label: '從政歷程' },
      { id: 'family', label: '家族政商關係' },
      { id: 'property', label: '財產申報' },
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

describe('family political and business relations section', () => {
  const graphSource = readFileSync(
    fileURLToPath(new URL('./PoliticalFamilyGraph.tsx', import.meta.url)),
    'utf8',
  );

  it('uses the 家族政商關係 heading everywhere it names the section', () => {
    expect(graphSource).toContain('家族政商關係');
    expect(graphSource).not.toContain('家族從政關係');
    expect(graphSource).not.toContain('政治經歷來源');
  });

  it('reads the schema v2 affiliation and position-source fields', () => {
    for (const token of [
      'affiliations',
      'positionSourceIds',
      'organizationType',
      'positionCategory',
      'listingStatus',
    ]) {
      expect(graphSource).toContain(token);
    }
    for (const obsolete of [
      'careerSourceIds',
      'politicalCareer',
      'officeTitle',
    ]) {
      expect(graphSource).not.toContain(obsolete);
    }
  });

  it('keeps the neutral note about family and business relations', () => {
    expect(graphSource).toContain('家族與商業關係本身不代表不當或不當影響');
    expect(graphSource).toContain('不代表不存在關係');
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
    const expected =
      (candidate.publicRecords?.news.length ?? 0) +
      (candidate.publishedNews?.length ?? 0) +
      candidate.news.length;
    expect(cards).toHaveLength(expected);
    const dates = cards.map((card) => card.publicationDate);
    expect(dates).toEqual([...dates].sort((a, b) => b.localeCompare(a)));
  });
});

function renderPropertyPanel(candidateId: string): string {
  const propertyDeclaration = getCandidatePropertyDeclaration(candidateId);
  expect(propertyDeclaration).toBeDefined();
  const candidate = {
    propertyDeclaration,
  } as unknown as PublicCandidateProfile;
  return renderToStaticMarkup(<PropertyDeclarationTab candidate={candidate} />);
}

describe('property declaration source presentation', () => {
  it('labels official and civil fields on a mixed-source candidate', () => {
    const html = renderPropertyPanel(
      'official-candidate-2026-district-kaohsiung-council-07-afc23f7d',
    );
    expect(html).toContain('property-declaration-linked');
    expect(html).toContain('data-source="official-cec"');
    expect(html).toContain('data-source="civil-gazette"');
    expect(html).toContain('中選會官方財產申報');
    expect(html).toContain('台灣前進《2026 民間版選舉公報》');
    expect(html).toContain('NT$750,000');
    expect(html).toContain('申報筆數：14');
    expect(html).toContain('官方與民間來源');
    expect(html).not.toContain('verificationStatus');
    expect(html).not.toContain('dual-render-local-ocr-agreement');
  });

  it('shows civil attribution without assigning an ambiguous official PDF', () => {
    const html = renderPropertyPanel(
      'official-candidate-2026-district-kaohsiung-indigenous-mountain-14-c9a9596c',
    );
    expect(html).toContain('property-declaration-ambiguous');
    expect(html).toContain('同名文件無法以現有識別脈絡唯一對應');
    expect(html).toContain('台灣前進《2026 民間版選舉公報》');
    expect(html).toContain('NT$2,188,518');
    expect(html).not.toContain('files/3471.pdf');
    expect(html).not.toContain('files/3472.pdf');
  });

  it('renders explicit official zeros without substituting a civil value', () => {
    const html = renderPropertyPanel('official-mayor-wang-zhao-min-2026');
    expect(html).toContain('官方明列為零或無申報筆數');
    expect(html).toContain('申報筆數：0');
  });
});
