import publishedInput from '../../../data/published/2026/candidate-news.json';
import {
  type NewsCandidateCoverage,
  type NewsTopic,
  NEWS_TOPIC_LABELS,
  NewsPublishedDatasetSchema,
  sortNewsArticles,
} from './schema';

/**
 * Read model for published candidate news.
 *
 * Only records whose publication status is "published" are exposed. Verified but
 * editorially-unapproved records stay in data/normalized + data/review and never
 * reach a page. No sentiment, tone or favourability value is modelled or shown.
 */
export const candidateNewsSnapshot = NewsPublishedDatasetSchema.parse(publishedInput);

export type PublishedNewsItem = {
  articleId: string;
  headline: string;
  publisher: string;
  url: string;
  publicationDate: string;
  summary: string;
  topicTags: string[];
  contentType: 'reporting' | 'opinion' | 'institutional-update' | 'unknown';
};

const itemsByCandidate = new Map<string, PublishedNewsItem[]>();
for (const article of candidateNewsSnapshot.articles) {
  if (article.publication.status !== 'published') continue;
  if (!article.summary) continue;
  const item: PublishedNewsItem = {
    articleId: article.articleId,
    headline: article.headline,
    publisher: article.publisher,
    url: article.canonicalUrl,
    publicationDate: article.publicationDate ?? '',
    summary: article.summary,
    topicTags: article.topicTags.map((topic: NewsTopic) => NEWS_TOPIC_LABELS[topic]),
    contentType: article.contentType,
  };
  for (const candidateId of article.candidateIds) {
    const bucket = itemsByCandidate.get(candidateId) ?? [];
    bucket.push(item);
    itemsByCandidate.set(candidateId, bucket);
  }
}

const coverageByCandidate = new Map<string, NewsCandidateCoverage>(
  candidateNewsSnapshot.coverage.map((entry) => [entry.candidateId, entry]),
);

export function getCandidatePublishedNews(
  candidateId: string,
): PublishedNewsItem[] {
  return sortNewsArticles(itemsByCandidate.get(candidateId) ?? []);
}

export function getCandidateNewsCoverage(
  candidateId: string,
): NewsCandidateCoverage | undefined {
  return coverageByCandidate.get(candidateId);
}

export function newsCoverageSummary(): {
  candidates: number;
  publishedArticles: number;
  statusCounts: Record<string, number>;
} {
  const statusCounts: Record<string, number> = {};
  for (const entry of candidateNewsSnapshot.coverage) {
    statusCounts[entry.status] = (statusCounts[entry.status] ?? 0) + 1;
  }
  return {
    candidates: candidateNewsSnapshot.coverage.length,
    publishedArticles: candidateNewsSnapshot.articles.filter(
      (article) => article.publication.status === 'published',
    ).length,
    statusCounts,
  };
}
