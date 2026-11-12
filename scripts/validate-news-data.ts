import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  NEWS_PATHS,
  loadRoster,
} from '../src/data/news/pipeline';
import {
  NewsNormalizedDatasetSchema,
  NewsPublishedDatasetSchema,
  summaryNeutralityBlockers,
} from '../src/data/news/schema';

const FORBIDDEN_KEYS = [
  'sentiment',
  'sentimentScore',
  'tone',
  'favorability',
  'favourability',
  'reputation',
  'classification',
  'classificationRationale',
];

function findForbiddenKeys(value: unknown, trail: string): string[] {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findForbiddenKeys(item, trail + '[' + index + ']'));
  }
  const hits: string[] = [];
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_KEYS.includes(key)) hits.push(trail + '.' + key);
    hits.push(...findForbiddenKeys(child, trail + '.' + key));
  }
  return hits;
}

async function main(): Promise<void> {
  const errors: string[] = [];
  const read = async (relative: string) =>
    JSON.parse(await readFile(path.join(process.cwd(), relative), 'utf8')) as unknown;

  const roster = await loadRoster();
  const rosterIds = new Set(roster.map((candidate) => candidate.id));
  const publishedRaw = await read(NEWS_PATHS.published);
  const normalizedRaw = await read(NEWS_PATHS.normalized);
  const published = NewsPublishedDatasetSchema.parse(publishedRaw);
  const normalized = NewsNormalizedDatasetSchema.parse(normalizedRaw);

  for (const key of findForbiddenKeys(publishedRaw, 'published')) {
    errors.push('sentiment-like field in published dataset: ' + key);
  }
  for (const key of findForbiddenKeys(normalizedRaw, 'normalized')) {
    errors.push('sentiment-like field in normalized dataset: ' + key);
  }

  const coverageIds = published.coverage.map((entry) => entry.candidateId);
  if (coverageIds.length !== roster.length) {
    errors.push('coverage rows ' + coverageIds.length + ' != roster ' + roster.length);
  }
  const seenCoverage = new Set<string>();
  for (const entry of published.coverage) {
    if (seenCoverage.has(entry.candidateId)) {
      errors.push('duplicate coverage row ' + entry.candidateId);
    }
    seenCoverage.add(entry.candidateId);
    if (!rosterIds.has(entry.candidateId)) {
      errors.push('coverage row for unknown candidate ' + entry.candidateId);
    }
    if (entry.status !== 'not-researched' && entry.attempts.length === 0) {
      errors.push('coverage without discovery attempts ' + entry.candidateId);
    }
  }
  for (const candidateId of rosterIds) {
    if (!seenCoverage.has(candidateId)) {
      errors.push('missing coverage row ' + candidateId);
    }
  }

  const articleIds = new Set<string>();
  for (const article of published.articles) {
    if (articleIds.has(article.articleId)) {
      errors.push('duplicate published article id ' + article.articleId);
    }
    articleIds.add(article.articleId);
    if (article.publication.status !== 'published') {
      errors.push('non-published article in published dataset ' + article.articleId);
    }
    if (!article.summary) {
      errors.push('published article without summary ' + article.articleId);
    }
    const blockers = summaryNeutralityBlockers(article.summary);
    if (blockers.length > 0) {
      errors.push(
        'loaded summary term ' + article.articleId + ': ' + blockers.join(','),
      );
    }
    if (article.verification.status !== 'verified') {
      errors.push('published article not verified ' + article.articleId);
    }
    if (article.identity.namesakeRisk !== 'low') {
      errors.push('published article identity risk ' + article.articleId);
    }
    for (const candidateId of article.candidateIds) {
      if (!rosterIds.has(candidateId)) {
        errors.push('article ' + article.articleId + ' references unknown candidate ' + candidateId);
      }
    }
  }

  const normalizedIds = new Set(normalized.articles.map((article) => article.articleId));
  for (const articleId of articleIds) {
    if (!normalizedIds.has(articleId)) {
      errors.push('published article missing from normalized dataset ' + articleId);
    }
  }
  const publishedCounts = new Map<string, number>();
  for (const article of published.articles) {
    for (const candidateId of article.candidateIds) {
      publishedCounts.set(candidateId, (publishedCounts.get(candidateId) ?? 0) + 1);
    }
  }
  for (const entry of published.coverage) {
    const expected = publishedCounts.get(entry.candidateId) ?? 0;
    if (entry.published !== expected) {
      errors.push(
        'coverage published count mismatch ' + entry.candidateId + ': ' + entry.published + ' != ' + expected,
      );
    }
    if (expected > 0 && entry.status !== 'published') {
      errors.push('coverage status not published for ' + entry.candidateId);
    }
  }

  if (errors.length > 0) {
    console.error(errors.map((error) => '- ' + error).join('\n'));
    throw new Error('News validation failed with ' + errors.length + ' error(s).');
  }
  console.log(
    'News data OK: ' +
      published.articles.length +
      ' published articles, ' +
      published.coverage.length +
      ' candidate coverage rows.',
  );
}

await main();
