import { z } from 'zod';

/**
 * Candidate news coverage model.
 *
 * Lifecycle: raw discovery -> independent verification -> normalized -> review -> published.
 * Publication is decided by an explicit, fail-closed policy; no sentiment, tone or
 * favourability field exists anywhere in this model, and every article schema is strict
 * so a sentiment-like field cannot be smuggled in.
 */

export const NEWS_POLICY_VERSION = 'news-publication-policy-v1';
export const NEWS_VERIFIER_VERSION = 'news-verifier-v1';
export const NEWS_PUBLISHED_DATASET_ID =
  'kaohsiung-2026-candidate-news-published';
export const NEWS_NORMALIZED_DATASET_ID =
  'kaohsiung-2026-candidate-news-normalized';
export const NEWS_SNAPSHOT_DATE = '2026-11-12';

export const NewsDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const IsoTimestampSchema = z.iso.datetime({ offset: true });
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const NewsSourceIdSchema = z.enum(['ltn', 'ettoday', 'cna']);
export const NewsPublisherTypeSchema = z.enum([
  'national-news',
  'local-news',
  'broadcast',
  'digital-native',
  'institutional',
  'unknown',
]);
export const NewsDateStatusSchema = z.enum([
  'confirmed',
  'inferred-from-url',
  'missing',
  'conflicting',
]);
export const NewsTopicSchema = z.enum([
  'election',
  'policy',
  'legislative',
  'public-service',
  'local-issue',
  'legal',
  'career',
  'other',
]);
export const NewsContentTypeSchema = z.enum([
  'reporting',
  'opinion',
  'institutional-update',
  'unknown',
]);
export const NewsVerificationStatusSchema = z.enum([
  'verified',
  'failed',
  'unverified',
]);
export const NewsPublicationStatusSchema = z.enum([
  'published',
  'pending-review',
  'blocked-verification',
  'blocked-policy',
  'rejected-duplicate',
  'rejected-irrelevant',
]);
export const NewsCoverageStatusSchema = z.enum([
  'not-researched',
  'no-results',
  'discovered-unverified',
  'verification-failed',
  'verified-pending-review',
  'published',
]);
export const NewsIdentityRiskSchema = z.enum(['low', 'medium', 'high']);

export const NewsEvidenceSchema = z
  .object({
    excerpt: z.string().min(20).max(1200),
    excerptSha256: Sha256Schema,
    documentSha256: Sha256Schema,
    metadataSource: z.enum(['json-ld', 'open-graph', 'html']),
    capturedAt: IsoTimestampSchema,
  })
  .strict();

export const NewsIdentitySchema = z
  .object({
    matchedName: z.string().min(1),
    matchedIn: z.enum(['headline', 'body', 'headline-and-body']),
    contextSignals: z.array(z.string().min(1)),
    namesakeRisk: NewsIdentityRiskSchema,
    note: z.string().min(1),
  })
  .strict();

export const NewsVerificationCheckSchema = z
  .object({
    check: z.enum([
      'source-reachable',
      'url-canonical',
      'publisher-match',
      'headline-match',
      'publication-date',
      'identity',
      'relevance',
      'summary-grounded',
      'not-duplicate',
    ]),
    passed: z.boolean(),
    detail: z.string().min(1),
  })
  .strict();

export const NewsVerificationSchema = z
  .object({
    status: NewsVerificationStatusSchema,
    verifiedAt: IsoTimestampSchema.nullable(),
    verifierVersion: z.string().min(1),
    checks: z.array(NewsVerificationCheckSchema).min(1),
    notes: z.array(z.string()),
  })
  .strict();

export const NewsPublicationSchema = z
  .object({
    status: NewsPublicationStatusSchema,
    policyVersion: z.string().min(1),
    decisionId: z.string().min(1).nullable(),
    decidedAt: IsoTimestampSchema.nullable(),
    blockers: z.array(z.string().min(1)),
    origin: z.enum(['human-editorial', 'automated-policy']).nullable(),
  })
  .strict();

export const NewsArticleSchema = z
  .object({
    articleId: z.string().min(1),
    candidateIds: z.array(z.string().min(1)).min(1),
    headline: z.string().min(1).max(300),
    publisher: z.string().min(1),
    publisherType: NewsPublisherTypeSchema,
    canonicalUrl: z.url(),
    publicationDate: NewsDateSchema.nullable(),
    dateStatus: NewsDateStatusSchema,
    updatedDate: NewsDateSchema.nullable(),
    retrievedAt: IsoTimestampSchema,
    summary: z.string().min(20).max(240).nullable(),
    summaryBasis: z
      .enum(['article-metadata', 'headline', 'editorial'])
      .nullable(),
    topicTags: z.array(NewsTopicSchema).min(1),
    contentType: NewsContentTypeSchema,
    eventKey: z.string().min(1),
    duplicateOf: z.string().min(1).nullable(),
    relatedArticleIds: z.array(z.string().min(1)),
    evidence: NewsEvidenceSchema,
    identity: NewsIdentitySchema,
    verification: NewsVerificationSchema,
    publication: NewsPublicationSchema,
  })
  .strict();

export const NewsDiscoveryAttemptSchema = z
  .object({
    sourceId: NewsSourceIdSchema,
    query: z.string().min(1),
    fetchedAt: IsoTimestampSchema,
    httpStatus: z.number().int().nullable(),
    documentSha256: Sha256Schema.nullable(),
    status: z.enum(['results', 'no-results', 'source-error']),
    resultCount: z.number().int().min(0),
    error: z.string().nullable(),
  })
  .strict();

export const NewsDiscoveryHitSchema = z
  .object({
    sourceId: NewsSourceIdSchema,
    url: z.url(),
    headline: z.string().min(1),
    publicationDate: NewsDateSchema.nullable(),
    query: z.string().min(1),
  })
  .strict();

export const NewsCandidateCoverageSchema = z
  .object({
    candidateId: z.string().min(1),
    candidateName: z.string().min(1),
    districtId: z.string().min(1),
    status: NewsCoverageStatusSchema,
    attempts: z.array(NewsDiscoveryAttemptSchema),
    discovered: z.number().int().min(0),
    verified: z.number().int().min(0),
    published: z.number().int().min(0),
    blockers: z.array(z.string().min(1)),
  })
  .strict();

export const NewsNormalizedDatasetSchema = z
  .object({
    datasetId: z.literal(NEWS_NORMALIZED_DATASET_ID),
    snapshotDate: NewsDateSchema,
    policyVersion: z.literal(NEWS_POLICY_VERSION),
    articles: z.array(NewsArticleSchema),
    coverage: z.array(NewsCandidateCoverageSchema),
    review: z
      .object({
        status: z.enum(['pending-human-review', 'partially-reviewed']),
        reviewerId: z.string().nullable(),
        reviewedAt: NewsDateSchema.nullable(),
        note: z.string().min(1),
      })
      .strict(),
  })
  .strict();

export const NewsPublishedDatasetSchema = z
  .object({
    datasetId: z.literal(NEWS_PUBLISHED_DATASET_ID),
    snapshotDate: NewsDateSchema,
    policyVersion: z.literal(NEWS_POLICY_VERSION),
    generatedAt: IsoTimestampSchema,
    articles: z.array(NewsArticleSchema),
    coverage: z.array(NewsCandidateCoverageSchema),
    note: z.string().min(1),
  })
  .strict();

export type NewsArticle = z.infer<typeof NewsArticleSchema>;
export type NewsCandidateCoverage = z.infer<typeof NewsCandidateCoverageSchema>;
export type NewsNormalizedDataset = z.infer<typeof NewsNormalizedDatasetSchema>;
export type NewsPublishedDataset = z.infer<typeof NewsPublishedDatasetSchema>;
export type NewsDiscoveryAttempt = z.infer<typeof NewsDiscoveryAttemptSchema>;
export type NewsDiscoveryHit = z.infer<typeof NewsDiscoveryHitSchema>;
export type NewsCoverageStatus = z.infer<typeof NewsCoverageStatusSchema>;
export type NewsDateStatus = z.infer<typeof NewsDateStatusSchema>;
export type NewsTopic = z.infer<typeof NewsTopicSchema>;

export const NEWS_TOPIC_LABELS: Record<NewsTopic, string> = {
  election: '選舉發展',
  policy: '政策主張',
  legislative: '議事問政',
  'public-service': '公共服務',
  'local-issue': '地方議題',
  legal: '司法與調查',
  career: '從政經歷',
  other: '其他',
};

const BLOCKED_SUMMARY_TERMS = [
  '大勝',
  '大敗',
  '慘敗',
  '崩盤',
  '醜聞',
  '英雄',
  '救世主',
  '聲勢看漲',
  '人氣王',
  '黑馬',
  '痛批',
  '砲轟',
  '嗆聲',
  '狠酸',
  '神隱',
  '落跑',
  '叛徒',
  '舔共',
  '賣台',
  '無能',
  '腐敗',
  '貪腐',
];

/** Sentiment-free summary gate. Blocks loaded language instead of scoring tone. */
export function summaryNeutralityBlockers(summary: string | null): string[] {
  if (!summary) return ['summary-missing'];
  const blockers: string[] = [];
  for (const term of BLOCKED_SUMMARY_TERMS) {
    if (summary.includes(term)) blockers.push('summary-loaded-term:' + term);
  }
  return blockers;
}

export function normalizeUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|oc$)/i.test(key)) url.searchParams.delete(key);
    }
    url.search = url.searchParams.toString()
      ? '?' + url.searchParams.toString()
      : '';
    url.hostname = url.hostname.replace(/^www\./, '').toLowerCase();
    const path = url.pathname.replace(/\/+$/, '') || '/';
    return url.origin + path + url.search;
  } catch {
    return raw.trim();
  }
}

export function normalizeHeadline(headline: string): string {
  return headline
    .replace(
      /^(獨[／/]|快訊[／/]?|影[／/]|圖[／/]|更新[／/]?|不斷更新[／/]?)/,
      '',
    )
    .replace(/[\s\u3000]+/g, '')
    .replace(/[！!?？…。，,、：:「」『』（）()｜|~～\-—]/g, '')
    .toLocaleLowerCase();
}

/** Stable event key: publisher-independent headline core plus day precision. */
export function eventKeyFor(
  headline: string,
  publicationDate: string | null,
): string {
  return normalizeHeadline(headline) + '@' + (publicationDate ?? 'unknown');
}

export function articleIdFor(url: string): string {
  const normalized = normalizeUrl(url);
  let hash = 0x811c9dc5;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return 'news-' + hash.toString(16).padStart(8, '0');
}

export type PublicationPolicyResult = {
  status: NewsArticle['publication']['status'];
  blockers: string[];
};

/**
 * Fail-closed machine publication policy for news metadata. It only ever admits a
 * record that passed an independent live re-fetch, a low-risk identity resolution,
 * a confirmed or URL-derived date, a grounded neutral summary, and a clean dedupe
 * pass. Anything else stays in the review queue with an explicit blocker.
 */
export function evaluateNewsPublication(
  article: NewsArticle,
): PublicationPolicyResult {
  const blockers: string[] = [];
  if (article.duplicateOf) blockers.push('duplicate-of:' + article.duplicateOf);
  if (article.verification.status !== 'verified') {
    blockers.push('verification-not-passed');
  }
  for (const check of article.verification.checks) {
    if (!check.passed) blockers.push('failed-check:' + check.check);
  }
  if (article.identity.namesakeRisk !== 'low') {
    blockers.push('identity-namesake-risk:' + article.identity.namesakeRisk);
  }
  if (article.identity.contextSignals.length === 0) {
    blockers.push('identity-context-missing');
  }
  if (!article.publicationDate) blockers.push('publication-date-missing');
  if (article.dateStatus === 'conflicting')
    blockers.push('publication-date-conflicting');
  if (article.dateStatus === 'missing')
    blockers.push('publication-date-missing');
  if (article.summary === null) blockers.push('summary-missing');
  blockers.push(...summaryNeutralityBlockers(article.summary));
  if (!/^https?:\/\//.test(article.canonicalUrl)) blockers.push('url-invalid');
  if (article.evidence.excerpt.length < 20)
    blockers.push('evidence-excerpt-too-short');
  if (article.topicTags.length === 0) blockers.push('topic-tags-missing');

  const unique = [...new Set(blockers)];
  if (unique.length > 0) {
    const status: NewsArticle['publication']['status'] =
      article.verification.status !== 'verified'
        ? 'blocked-verification'
        : unique.includes('duplicate-of:' + article.duplicateOf)
          ? 'rejected-duplicate'
          : 'blocked-policy';
    return { status, blockers: unique };
  }
  return { status: 'published', blockers: [] };
}

/** Groups syndicated/identical coverage and marks every non-primary copy. */
export function applyDeduplication(
  articles: readonly NewsArticle[],
): NewsArticle[] {
  const seenUrl = new Map<string, string>();
  const seenHeadline = new Map<string, string>();
  return articles.map((article) => {
    const urlKey = normalizeUrl(article.canonicalUrl);
    const headlineKey =
      article.publisher + '|' + normalizeHeadline(article.headline);
    const primary = seenUrl.get(urlKey) ?? seenHeadline.get(headlineKey);
    if (primary && primary !== article.articleId) {
      return {
        ...article,
        duplicateOf: primary,
        publication: {
          ...article.publication,
          status: 'rejected-duplicate',
          blockers: [
            ...new Set([
              ...article.publication.blockers,
              'duplicate-of:' + primary,
            ]),
          ],
        },
      };
    }
    seenUrl.set(urlKey, article.articleId);
    seenHeadline.set(headlineKey, article.articleId);
    return article;
  });
}

export function sortNewsArticles<
  T extends { publicationDate: string | null; headline: string },
>(articles: readonly T[]): T[] {
  return [...articles].sort(
    (left, right) =>
      (right.publicationDate ?? '').localeCompare(left.publicationDate ?? '') ||
      left.headline.localeCompare(right.headline),
  );
}
