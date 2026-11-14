import { z } from 'zod';
import {
  coverageFor,
  type DiscoveryFile,
  discoveryPath,
  loadRoster,
  NEWS_PATHS,
  pool,
  readJsonFile,
  snapshotDate,
  type VerificationFile,
  verificationPath,
  writeJsonFile,
  writeTextFile,
} from '../../src/data/news/pipeline';
import {
  applyDeduplication,
  evaluateNewsPublication,
  NEWS_NORMALIZED_DATASET_ID,
  NEWS_POLICY_VERSION,
  NEWS_PUBLISHED_DATASET_ID,
  type NewsArticle,
  type NewsCandidateCoverage,
  NewsNormalizedDatasetSchema,
  NewsPublishedDatasetSchema,
  type NewsTopic,
  NewsTopicSchema,
  sortNewsArticles,
} from '../../src/data/news/schema';
import { parseNewsArgs } from './args';

const EditorialFileSchema = z
  .object({
    datasetId: z.literal('kaohsiung-2026-candidate-news-editorial'),
    snapshotDate: z.string(),
    note: z.string().min(1),
    excluded: z.record(z.string(), z.string().min(1)).optional(),
    articles: z.record(
      z.string(),
      z
        .object({
          summary: z.string().min(20).max(240),
          topicTags: z.array(NewsTopicSchema).min(1),
          note: z.string().min(1),
        })
        .strict(),
    ),
  })
  .strict();

type EditorialFile = z.infer<typeof EditorialFileSchema>;

const COVERAGE_LABELS: Record<NewsCandidateCoverage['status'], string> = {
  'not-researched': '未研究',
  'no-results': '搜尋無結果',
  'discovered-unverified': '已發現未驗證',
  'verification-failed': '驗證未通過',
  'verified-pending-review': '已驗證待編輯審核',
  published: '已發布',
};

function decide(
  article: NewsArticle,
  editorial: EditorialFile | null,
  decidedAt: string,
): NewsArticle {
  const exclusion = editorial?.excluded?.[article.articleId];
  if (exclusion) {
    return {
      ...article,
      summary: null,
      summaryBasis: null,
      publication: {
        status: 'blocked-verification',
        policyVersion: NEWS_POLICY_VERSION,
        decisionId: 'news-policy-' + article.articleId,
        decidedAt,
        blockers: ['editorial-exclusion:' + exclusion],
        origin: 'automated-policy',
      },
    };
  }
  const override = editorial?.articles[article.articleId];
  const withEditorial: NewsArticle = {
    ...article,
    summary: override?.summary ?? null,
    summaryBasis: override ? 'editorial' : null,
    topicTags: override
      ? (override.topicTags as NewsTopic[])
      : article.topicTags,
  };
  const policy = evaluateNewsPublication(withEditorial);
  const status = policy.status === 'published' ? 'published' : policy.status;
  return {
    ...withEditorial,
    publication: {
      status,
      policyVersion: NEWS_POLICY_VERSION,
      decisionId: 'news-policy-' + article.articleId,
      decidedAt,
      blockers: policy.blockers,
      origin: 'automated-policy',
    },
  };
}

function mergeDuplicates(articles: readonly NewsArticle[]): NewsArticle[] {
  const byId = new Map<string, NewsArticle>();
  for (const article of articles) {
    const existing = byId.get(article.articleId);
    if (!existing) {
      byId.set(article.articleId, article);
      continue;
    }
    const candidateIds = [
      ...new Set([...existing.candidateIds, ...article.candidateIds]),
    ].sort();
    const preferred =
      article.identity.namesakeRisk === 'low' &&
      existing.identity.namesakeRisk !== 'low'
        ? article
        : existing;
    byId.set(article.articleId, { ...preferred, candidateIds });
  }
  return [...byId.values()];
}

function markdownTable(
  rows: readonly string[][],
  header: readonly string[],
): string {
  const line = (cells: readonly string[]) => '| ' + cells.join(' | ') + ' |';
  return [line(header), line(header.map(() => '---')), ...rows.map(line)].join(
    '\n',
  );
}

async function main(): Promise<void> {
  const options = parseNewsArgs(process.argv.slice(2));
  const roster = await loadRoster();
  const scoped = roster.filter(
    (candidate) =>
      (!options.candidateIds ||
        options.candidateIds.has(candidate.id) ||
        options.candidateIds.has(candidate.slug)) &&
      (!options.districtIds || options.districtIds.has(candidate.districtId)),
  );

  const discoveries = new Map<string, DiscoveryFile>();
  const verifications = new Map<string, VerificationFile>();
  await pool(scoped, 8, async (candidate) => {
    const discovery = await readJsonFile<DiscoveryFile>(
      discoveryPath(candidate.id),
    );
    if (discovery) discoveries.set(candidate.id, discovery);
    const verification = await readJsonFile<VerificationFile>(
      verificationPath(candidate.id),
    );
    if (verification) verifications.set(candidate.id, verification);
  });

  const editorialRaw = await readJsonFile<unknown>(NEWS_PATHS.editorial);
  const editorial = editorialRaw
    ? EditorialFileSchema.parse(editorialRaw)
    : null;
  const decidedAt = new Date().toISOString();
  const snapshot = snapshotDate();

  const allVerified = [...verifications.values()].flatMap(
    (file) => file.articles,
  );
  const merged = mergeDuplicates(allVerified).map((article) =>
    decide(article, editorial, decidedAt),
  );
  const articles = sortNewsArticles(applyDeduplication(merged));

  const publishedArticles = articles.filter(
    (article) => article.publication.status === 'published',
  );
  const publishedIdsByCandidate = new Map<string, number>();
  for (const article of publishedArticles) {
    for (const candidateId of article.candidateIds) {
      publishedIdsByCandidate.set(
        candidateId,
        (publishedIdsByCandidate.get(candidateId) ?? 0) + 1,
      );
    }
  }

  // Coverage blockers must reflect the publication decision, not the raw
  // verifier draft (which still carries publication-policy-not-evaluated).
  const blockersByCandidate = new Map<string, string[]>();
  for (const article of articles) {
    if (article.publication.status === 'published') continue;
    for (const candidateId of article.candidateIds) {
      const bucket = blockersByCandidate.get(candidateId) ?? [];
      for (const blocker of article.publication.blockers) {
        if (!bucket.includes(blocker)) bucket.push(blocker);
      }
      blockersByCandidate.set(candidateId, bucket);
    }
  }

  const coverage: NewsCandidateCoverage[] = scoped.map((candidate) => {
    const entry = coverageFor(
      candidate,
      discoveries.get(candidate.id) ?? null,
      verifications.get(candidate.id) ?? null,
    );
    const published = publishedIdsByCandidate.get(candidate.id) ?? 0;
    const verified = entry.verified;
    const status: NewsCandidateCoverage['status'] =
      published > 0
        ? 'published'
        : verified > 0
          ? 'verified-pending-review'
          : entry.status;
    const blockers =
      published > 0
        ? []
        : [
            ...new Set([
              ...entry.blockers.filter(
                (blocker) => blocker !== 'publication-policy-not-evaluated',
              ),
              ...(blockersByCandidate.get(candidate.id) ?? []),
            ]),
          ];
    return { ...entry, status, published, blockers };
  });

  const normalized = {
    datasetId: NEWS_NORMALIZED_DATASET_ID,
    snapshotDate: snapshot,
    policyVersion: NEWS_POLICY_VERSION,
    articles,
    coverage,
    review: {
      status: 'pending-human-review' as const,
      reviewerId: null,
      reviewedAt: null,
      note: '所有紀錄由自動化政策評估；摘要需經編輯撰寫（data/approved/2026/candidate-news-editorial.json）後才會進入 published。未通過政策者保留於 data/review/2026/candidate-news-review.json。',
    },
  };
  NewsNormalizedDatasetSchema.parse(normalized);

  const published = {
    datasetId: NEWS_PUBLISHED_DATASET_ID,
    snapshotDate: snapshot,
    policyVersion: NEWS_POLICY_VERSION,
    generatedAt: decidedAt,
    articles: publishedArticles,
    coverage,
    note: '僅包含通過自動化政策（獨立重新抓取驗證、低同名風險、日期可確認、中性摘要、去重）的新聞中介資料；不儲存全文。',
  };
  NewsPublishedDatasetSchema.parse(published);

  const reviewQueue = {
    datasetId: 'kaohsiung-2026-candidate-news-review-queue',
    snapshotDate: snapshot,
    policyVersion: NEWS_POLICY_VERSION,
    generatedAt: decidedAt,
    entries: articles
      .filter((article) => article.publication.status !== 'published')
      .map((article) => ({
        articleId: article.articleId,
        candidateIds: article.candidateIds,
        headline: article.headline,
        publisher: article.publisher,
        canonicalUrl: article.canonicalUrl,
        publicationDate: article.publicationDate,
        status: article.publication.status,
        blockers: article.publication.blockers,
        editorialSummaryPresent: article.summary !== null,
      })),
  };

  const coverageCounts = coverage.reduce<Record<string, number>>(
    (counts, entry) => {
      counts[entry.status] = (counts[entry.status] ?? 0) + 1;
      return counts;
    },
    {},
  );
  const discoveredTotal = coverage.reduce(
    (sum, entry) => sum + entry.discovered,
    0,
  );
  const verifiedTotal = articles.length;
  const attemptTotal = coverage.reduce(
    (sum, entry) => sum + entry.attempts.length,
    0,
  );
  const sourceErrors = coverage.reduce(
    (sum, entry) =>
      sum +
      entry.attempts.filter((attempt) => attempt.status === 'source-error')
        .length,
    0,
  );
  const rejectedTotal = [...verifications.values()].reduce(
    (sum, file) => sum + file.rejected.length,
    0,
  );
  const duplicates = articles.filter(
    (article) => article.duplicateOf !== null,
  ).length;

  const coverageReport = {
    datasetId: 'kaohsiung-2026-candidate-news-coverage',
    snapshotDate: snapshot,
    generatedAt: decidedAt,
    candidates: coverage.length,
    discoveredArticles: discoveredTotal,
    verifiedArticles: verifiedTotal,
    publishedArticles: publishedArticles.length,
    reviewQueuedArticles: articles.length - publishedArticles.length,
    duplicates,
    rejectedHits: rejectedTotal,
    discoveryAttempts: attemptTotal,
    sourceErrorAttempts: sourceErrors,
    statusCounts: coverageCounts,
    candidatesWithoutPublishableNews: coverage
      .filter((entry) => entry.published === 0)
      .map((entry) => ({
        candidateId: entry.candidateId,
        candidateName: entry.candidateName,
        districtId: entry.districtId,
        status: entry.status,
        discovered: entry.discovered,
        blockers: entry.blockers.slice(0, 6),
      })),
  };

  const verificationReport = {
    datasetId: 'kaohsiung-2026-candidate-news-verification',
    snapshotDate: snapshot,
    generatedAt: decidedAt,
    candidatesResearched: [...discoveries.values()].length,
    hitsFetched: verifiedTotal + rejectedTotal,
    verified: verifiedTotal,
    rejected: rejectedTotal,
    rejectionReasons: Object.entries(
      [...verifications.values()]
        .flatMap((file) => file.rejected)
        .flatMap((entry) => entry.reasons)
        .reduce<Record<string, number>>((counts, reason) => {
          const key = reason.split(':')[0] ?? reason;
          counts[key] = (counts[key] ?? 0) + 1;
          return counts;
        }, {}),
    )
      .map(([reason, count]) => ({ reason, count }))
      .sort((left, right) => right.count - left.count),
    articles: articles.map((article) => ({
      articleId: article.articleId,
      candidateIds: article.candidateIds,
      headline: article.headline,
      publisher: article.publisher,
      canonicalUrl: article.canonicalUrl,
      publicationDate: article.publicationDate,
      dateStatus: article.dateStatus,
      namesakeRisk: article.identity.namesakeRisk,
      verificationStatus: article.verification.status,
      publicationStatus: article.publication.status,
      blockers: article.publication.blockers,
    })),
  };

  const coverageRows = coverage.map((entry) => [
    entry.candidateName,
    entry.candidateId,
    entry.districtId.replace('district-kaohsiung-', ''),
    COVERAGE_LABELS[entry.status],
    String(entry.discovered),
    String(entry.verified),
    String(entry.published),
  ]);
  const coverageMarkdown = [
    '# 候選人新聞覆蓋報告',
    '',
    '- 快照日期：' + snapshot,
    '- 候選人數：' + coverage.length,
    '- 研究嘗試次數：' + attemptTotal + '（來源錯誤 ' + sourceErrors + '）',
    '- 搜尋命中：' +
      discoveredTotal +
      '；獨立驗證通過：' +
      verifiedTotal +
      '；已發布：' +
      publishedArticles.length,
    '- 待編輯審核：' +
      (articles.length - publishedArticles.length) +
      '；重複：' +
      duplicates,
    '',
    '## 狀態統計',
    '',
    markdownTable(
      Object.entries(coverageCounts).map(([status, count]) => [
        COVERAGE_LABELS[status as NewsCandidateCoverage['status']] ?? status,
        String(count),
      ]),
      ['狀態', '候選人數'],
    ),
    '',
    '## 逐位候選人',
    '',
    markdownTable(coverageRows, [
      '候選人',
      'ID',
      '選區',
      '狀態',
      '命中',
      '驗證',
      '發布',
    ]),
    '',
    '搜尋無結果不代表不存在相關報導；僅表示本次查詢的三個來源未回傳可驗證資料。',
    '',
  ].join('\n');

  const verificationMarkdown = [
    '# 新聞獨立驗證報告',
    '',
    '- 已研究候選人：' + [...discoveries.values()].length,
    '- 抓取文章：' +
      (verifiedTotal + rejectedTotal) +
      '；通過：' +
      verifiedTotal +
      '；未通過：' +
      rejectedTotal,
    '',
    '## 未通過原因',
    '',
    markdownTable(
      verificationReport.rejectionReasons.map((entry) => [
        entry.reason,
        String(entry.count),
      ]),
      ['原因', '次數'],
    ),
    '',
    '## 文章清單',
    '',
    markdownTable(
      verificationReport.articles.map((article) => [
        article.publicationDate ?? '日期不明',
        article.publisher,
        article.headline,
        article.namesakeRisk,
        article.publicationStatus,
      ]),
      ['日期', '媒體', '標題', '同名風險', '發布狀態'],
    ),
    '',
  ].join('\n');

  const publicationMarkdown = [
    '# 新聞發布報告',
    '',
    '- 已發布：' + publishedArticles.length + ' / 驗證通過 ' + verifiedTotal,
    '- 政策版本：' + NEWS_POLICY_VERSION,
    '- 審核佇列：' +
      reviewQueue.entries.length +
      ' 筆（data/review/2026/candidate-news-review.json）',
    '',
    '## 已發布文章',
    '',
    publishedArticles.length === 0
      ? '（尚無）'
      : markdownTable(
          publishedArticles.map((article) => [
            article.publicationDate ?? '',
            article.publisher,
            article.headline,
            article.candidateIds.length.toString(),
          ]),
          ['日期', '媒體', '標題', '關聯候選人數'],
        ),
    '',
  ].join('\n');

  if (options.dryRun) {
    console.log(
      JSON.stringify(
        { ...coverageReport, statusCounts: coverageCounts },
        null,
        2,
      ),
    );
    return;
  }

  await writeJsonFile(NEWS_PATHS.normalized, normalized);
  await writeJsonFile(NEWS_PATHS.published, published);
  await writeJsonFile(NEWS_PATHS.review, reviewQueue);
  await writeJsonFile(NEWS_PATHS.coverageReport, coverageReport);
  await writeTextFile(NEWS_PATHS.coverageMarkdown, coverageMarkdown);
  await writeJsonFile(NEWS_PATHS.verificationReport, verificationReport);
  await writeTextFile(NEWS_PATHS.verificationMarkdown, verificationMarkdown);
  await writeJsonFile(NEWS_PATHS.publicationReport, {
    datasetId: 'kaohsiung-2026-candidate-news-publication',
    snapshotDate: snapshot,
    generatedAt: decidedAt,
    published: publishedArticles.length,
    reviewQueue: reviewQueue.entries.length,
  });
  await writeTextFile(NEWS_PATHS.publicationMarkdown, publicationMarkdown);

  console.log(
    JSON.stringify(
      {
        candidates: coverage.length,
        discovered: discoveredTotal,
        verified: verifiedTotal,
        published: publishedArticles.length,
        reviewQueue: reviewQueue.entries.length,
        statusCounts: coverageCounts,
      },
      null,
      2,
    ),
  );
}

await main();
