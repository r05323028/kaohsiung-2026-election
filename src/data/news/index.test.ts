import { describe, expect, it } from 'vitest';
import publishedInput from '../../../data/published/2026/candidate-news.json';
import {
  candidateNewsSnapshot,
  getCandidateNewsCoverage,
  getCandidatePublishedNews,
  newsCoverageSummary,
} from './index';

const PUBLISHED = candidateNewsSnapshot.articles;

describe('published news read model', () => {
  it('exposes every published article with a neutral summary and a source link', () => {
    expect(PUBLISHED.length).toBeGreaterThan(0);
    for (const article of PUBLISHED) {
      expect(article.publication.status).toBe('published');
      expect(article.summary).toBeTruthy();
      expect(article.canonicalUrl).toMatch(/^https:\/\//);
      expect(article.publicationDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(article.identity.namesakeRisk).toBe('low');
      expect(article.verification.status).toBe('verified');
    }
  });

  it('never models sentiment, tone or favourability', () => {
    const serialised = JSON.stringify(publishedInput);
    expect(serialised).not.toMatch(/"(sentiment|tone|favourab|positive|negative)"\s*:/i);
  });

  it('returns candidate news newest first', () => {
    const items = getCandidatePublishedNews(
      'official-mayor-ke-zhi-en-2026',
    );
    expect(items.length).toBeGreaterThan(0);
    const dates = items.map((item) => item.publicationDate);
    expect(dates).toEqual([...dates].sort((a, b) => b.localeCompare(a)));
    for (const item of items) {
      expect(item.summary.length).toBeGreaterThan(0);
      expect(item.url).toMatch(/^https:\/\//);
      expect(item.topicTags.length).toBeGreaterThan(0);
    }
  });

  it('returns an empty list for a candidate without published coverage', () => {
    expect(getCandidatePublishedNews('official-candidate-not-in-dataset')).toEqual([]);
  });

  it('records a discovery attempt status for every candidate', () => {
    expect(candidateNewsSnapshot.coverage.length).toBe(106);
    for (const entry of candidateNewsSnapshot.coverage) {
      expect(entry.attempts.length).toBeGreaterThan(0);
      expect(entry.published).toBeLessThanOrEqual(entry.verified);
      expect(entry.verified).toBeLessThanOrEqual(entry.discovered);
    }
    const summary = newsCoverageSummary();
    expect(summary.candidates).toBe(106);
    expect(summary.publishedArticles).toBe(PUBLISHED.length);
  });

  it('reports coverage rows by candidate id', () => {
    const entry = getCandidateNewsCoverage(
      'official-mayor-ke-zhi-en-2026',
    );
    expect(entry?.candidateName).toBe('柯志恩');
    expect(entry?.published).toBeGreaterThan(0);
  });
});
