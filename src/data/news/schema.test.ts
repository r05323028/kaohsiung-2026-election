import { describe, expect, it } from 'vitest';
import {
  applyDeduplication,
  articleIdFor,
  eventKeyFor,
  type NewsArticle,
  NewsArticleSchema,
  normalizeHeadline,
  normalizeUrl,
  summaryNeutralityBlockers,
} from './schema';

const SHA = 'a'.repeat(64);

function article(overrides: Partial<NewsArticle> = {}): NewsArticle {
  const base: NewsArticle = {
    articleId: 'news-00000001',
    candidateIds: ['official-candidate-1'],
    headline: '某候選人成立競選總部',
    publisher: '自由時報',
    publisherType: 'national-news',
    canonicalUrl: 'https://news.ltn.com.tw/news/politics/breakingnews/1234567',
    publicationDate: '2026-11-01',
    dateStatus: 'confirmed',
    updatedDate: null,
    retrievedAt: '2026-11-12T00:00:00.000Z',
    summary: '某候選人在高雄成立競選總部，多位地方民代到場。',
    summaryBasis: 'source-summary',
    topicTags: ['election'],
    contentType: 'reporting',
    eventKey: 'event',
    duplicateOf: null,
    relatedArticleIds: [],
    evidence: {
      excerpt: '某候選人今天在高雄成立競選總部，現場有多位地方民代到場致意。',
      excerptSha256: SHA,
      documentSha256: SHA,
      metadataSource: 'json-ld',
      capturedAt: '2026-11-12T00:00:00.000Z',
    },
    identity: {
      matchedName: '某候選人',
      matchedIn: 'headline-and-body',
      contextSignals: ['高雄'],
      namesakeRisk: 'low',
      note: 'headline + district token',
    },
    verification: {
      status: 'verified',
      verifiedAt: '2026-11-12T00:00:00.000Z',
      verifierVersion: 'news-verifier-v1',
      checks: [
        { check: 'source-reachable', passed: true, detail: 'HTTP 200' },
        {
          check: 'identity',
          passed: true,
          detail: 'name in headline with district',
        },
      ],
      notes: [],
    },
    publication: {
      status: 'published',
      blockers: [],
    },
  };
  return { ...base, ...overrides };
}

describe('news schema', () => {
  it('rejects records that carry sentiment-like fields', () => {
    const withSentiment = { ...article(), sentiment: 'positive' };
    expect(NewsArticleSchema.safeParse(withSentiment).success).toBe(false);
  });

  it('accepts a fully specified record', () => {
    expect(NewsArticleSchema.safeParse(article()).success).toBe(true);
  });
});

describe('summaryNeutralityBlockers', () => {
  it('flags missing summaries and loaded terms only', () => {
    expect(summaryNeutralityBlockers(null)).toEqual(['summary-missing']);
    expect(summaryNeutralityBlockers('候選人召開記者會說明政見。')).toEqual([]);
    expect(summaryNeutralityBlockers('對手慘敗收場')).toEqual([
      'summary-loaded-term:慘敗',
    ]);
  });
});

describe('normalisation', () => {
  it('strips tracking parameters, hash and www prefix', () => {
    expect(
      normalizeUrl(
        'https://www.News.ltn.com.tw/news/politics/breakingnews/1/?utm_source=x&fbclid=y#top',
      ),
    ).toBe('https://news.ltn.com.tw/news/politics/breakingnews/1');
  });

  it('normalises headline decoration for dedupe', () => {
    expect(normalizeHeadline('獨／高雄 候選人：成立總部！')).toBe(
      normalizeHeadline('高雄候選人成立總部'),
    );
  });

  it('derives a stable article id from the canonical url', () => {
    const id = articleIdFor('https://www.ettoday.net/news/20261101/123.htm');
    expect(id).toBe(
      articleIdFor('https://ettoday.net/news/20261101/123.htm?utm_medium=a'),
    );
    expect(id).toMatch(/^news-[0-9a-f]{8}$/);
  });

  it('keys events by normalised headline and date', () => {
    expect(eventKeyFor('高雄候選人成立總部', '2026-11-01')).toBe(
      eventKeyFor('快訊／高雄候選人成立總部', '2026-11-01'),
    );
  });
});

describe('applyDeduplication', () => {
  it('keeps the first copy and marks syndicated duplicates', () => {
    const first = article({ articleId: 'news-00000001' });
    const second = article({
      articleId: 'news-00000002',
      canonicalUrl:
        'https://news.ltn.com.tw/news/politics/breakingnews/1234567?utm_source=rss',
    });
    const [kept, marked] = applyDeduplication([first, second]);
    expect(kept?.duplicateOf).toBeNull();
    expect(marked?.duplicateOf).toBe('news-00000001');
    expect(marked?.publication.status).toBe('blocked-duplicate');
  });

  it('does not merge different publishers with the same headline', () => {
    const [left, right] = applyDeduplication([
      article({ articleId: 'news-00000001' }),
      article({
        articleId: 'news-00000002',
        publisher: '中央社',
        canonicalUrl: 'https://www.cna.com.tw/news/aipl/202611010001.aspx',
      }),
    ]);
    expect(left?.duplicateOf).toBeNull();
    expect(right?.duplicateOf).toBeNull();
  });
});
