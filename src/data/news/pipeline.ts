import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { sha256 } from './research';
import {
  articleIdFor,
  NEWS_SNAPSHOT_DATE,
  type NewsArticle,
  type NewsCandidateCoverage,
  type NewsCoverageStatus,
  NewsDateSchema,
  type NewsTopic,
  sortNewsArticles,
} from './schema';

const ROOT = process.cwd();

export const NEWS_PATHS = {
  roster: 'data/approved/2026/kaohsiung-election.json',
  rawDiscovery: 'data/raw/2026/news/discovery',
  normalized: 'data/normalized/2026/candidate-news.json',
  normalizedArticles: 'data/normalized/2026/news',
  editorial: 'data/approved/2026/candidate-news-editorial.json',
  review: 'data/review/2026/candidate-news-review.json',
  published: 'data/published/2026/candidate-news.json',
  coverageReport: 'reports/news-coverage.json',
  coverageMarkdown: 'reports/news-coverage.md',
  verificationReport: 'reports/news-verification.json',
  verificationMarkdown: 'reports/news-verification.md',
  publicationReport: 'reports/news-publication.json',
  publicationMarkdown: 'reports/news-publication.md',
} as const;

export type RosterCandidate = {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  districtId: string;
  districtName: string;
  districtLabel: string;
  electionType: string;
  party: string;
  currentPosition: string;
};

type RosterFile = {
  districts: Array<{
    id: string;
    name: string;
    districtLabel: string;
  }>;
  candidates: Array<{
    id: string;
    slug: string;
    displayName: string;
    shortName: string;
    districtId: string;
    electionType: string;
    politicalParty: string;
    currentPosition: string;
  }>;
};

export async function loadRoster(): Promise<RosterCandidate[]> {
  const raw = JSON.parse(
    await readFile(path.join(ROOT, NEWS_PATHS.roster), 'utf8'),
  ) as RosterFile;
  const districts = new Map(
    raw.districts.map((district) => [district.id, district]),
  );
  return raw.candidates.map((candidate) => {
    const district = districts.get(candidate.districtId);
    return {
      id: candidate.id,
      slug: candidate.slug,
      name: candidate.displayName,
      shortName: candidate.shortName,
      districtId: candidate.districtId,
      districtName: district?.name ?? candidate.districtId,
      districtLabel: district?.districtLabel ?? candidate.districtId,
      electionType: candidate.electionType,
      party: candidate.politicalParty,
      currentPosition: candidate.currentPosition,
    };
  });
}

export type FetchResult = {
  status: number | null;
  text: string;
  sha256: string | null;
  fetchedAt: string;
  error: string | null;
};

const USER_AGENT =
  'kaohsiung-2026-election-research/1.0 (+https://github.com/r05323028/kaohsiung-2026-election)';

export async function fetchDocument(
  url: string,
  options: { retries?: number; timeoutMs?: number; accept?: string } = {},
): Promise<FetchResult> {
  const retries = options.retries ?? 1;
  const timeoutMs = options.timeoutMs ?? 25_000;
  let lastError = '';
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const fetchedAt = new Date().toISOString();
    try {
      const response = await fetch(url, {
        redirect: 'follow',
        headers: {
          'user-agent': USER_AGENT,
          'accept-language': 'zh-TW,zh;q=0.9',
          accept: options.accept ?? 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
      const text = await response.text();
      return {
        status: response.status,
        text,
        sha256: text.length > 0 ? sha256(text) : null,
        fetchedAt,
        error: response.ok ? null : 'HTTP ' + response.status,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt < retries) await sleep(600 + attempt * 900);
    }
  }
  return {
    status: null,
    text: '',
    sha256: null,
    fetchedAt: new Date().toISOString(),
    error: lastError,
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function pool<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      if (item !== undefined) await worker(item);
    }
  });
  await Promise.all(runners);
}

export async function readJsonFile<T>(relative: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path.join(ROOT, relative), 'utf8')) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export async function writeJsonFile(
  relative: string,
  value: unknown,
): Promise<void> {
  const target = path.join(ROOT, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

export async function writeTextFile(
  relative: string,
  value: string,
): Promise<void> {
  const target = path.join(ROOT, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, value, 'utf8');
}

export const TOPIC_KEYWORDS: ReadonlyArray<
  readonly [NewsTopic, readonly string[]]
> = [
  [
    'election',
    [
      '登記',
      '抽籤',
      '號次',
      '參選',
      '競選',
      '初選',
      '提名',
      '民調',
      '投票',
      '選舉',
      '政見會',
      '拜票',
    ],
  ],
  [
    'policy',
    [
      '政策',
      '政見',
      '預算',
      '補助',
      '托育',
      '長照',
      '住宅',
      '捷運',
      '產業',
      '能源',
      '交通建設',
    ],
  ],
  [
    'legislative',
    ['議會', '質詢', '提案', '審查', '程序委員會', '臨時會', '定期會', '表決'],
  ],
  [
    'public-service',
    ['會勘', '爭取', '服務處', '陳情', '協調', '捐贈', '公益', '志工'],
  ],
  [
    'local-issue',
    [
      '淹水',
      '空污',
      '垃圾',
      '道路',
      '公園',
      '市場',
      '夜市',
      '停車',
      '學區',
      '社區',
    ],
  ],
  [
    'legal',
    [
      '起訴',
      '判決',
      '偵辦',
      '調查',
      '羈押',
      '告訴',
      '二審',
      '地院',
      '高院',
      '緩刑',
    ],
  ],
  ['career', ['接任', '卸任', '辭職', '就職', '經歷', '連任', '轉任']],
] as const;

/** Descriptive topical tags only. Never tone, sentiment or favourability. */
export function inferTopicTags(
  headline: string,
  description: string | null,
): NewsTopic[] {
  const text = headline + ' ' + (description ?? '');
  const tags: NewsTopic[] = [];
  for (const [topic, keywords] of TOPIC_KEYWORDS) {
    if (keywords.some((keyword) => text.includes(keyword))) tags.push(topic);
  }
  return tags.length > 0 ? tags : ['other'];
}

export type DiscoveryFile = {
  candidateId: string;
  candidateName: string;
  researchedAt: string;
  attempts: Array<{
    sourceId: 'ltn' | 'ettoday' | 'cna';
    query: string;
    fetchedAt: string;
    httpStatus: number | null;
    documentSha256: string | null;
    status: 'results' | 'no-results' | 'source-error';
    resultCount: number;
    error: string | null;
  }>;
  hits: Array<{
    sourceId: 'ltn' | 'ettoday' | 'cna';
    url: string;
    headline: string;
    publicationDate: string | null;
    query: string;
  }>;
};

export type VerificationFile = {
  candidateId: string;
  candidateName: string;
  verifiedAt: string;
  articles: NewsArticle[];
  rejected: Array<{
    url: string;
    headline: string;
    reasons: string[];
    httpStatus: number | null;
  }>;
};

export function discoveryPath(candidateId: string): string {
  return NEWS_PATHS.rawDiscovery + '/' + candidateId + '.json';
}

export function verificationPath(candidateId: string): string {
  return NEWS_PATHS.normalizedArticles + '/' + candidateId + '.json';
}

export function coverageFor(
  candidate: RosterCandidate,
  discovery: DiscoveryFile | null,
  verification: VerificationFile | null,
): NewsCandidateCoverage {
  const attempts = discovery?.attempts ?? [];
  const discovered = discovery?.hits.length ?? 0;
  const verifiedArticles =
    verification?.articles.filter(
      (article) => article.verification.status === 'verified',
    ) ?? [];
  const published = verifiedArticles.filter(
    (article) => article.publication.status === 'published',
  ).length;
  const blockers: string[] = [];

  let status: NewsCoverageStatus;
  if (!discovery) {
    status = 'not-researched';
    blockers.push('discovery-not-run');
  } else if (
    attempts.length > 0 &&
    attempts.every((attempt) => attempt.status === 'source-error')
  ) {
    status = 'not-researched';
    blockers.push('discovery-source-error');
  } else if (discovered === 0) {
    status = 'no-results';
  } else if (verification === null) {
    status = 'discovered-unverified';
  } else if (verifiedArticles.length === 0) {
    status = 'verification-failed';
  } else if (published > 0) {
    status = 'published';
  } else {
    status = 'verified-pending-review';
  }

  if (status === 'discovered-unverified') blockers.push('verification-not-run');
  if (status === 'verification-failed') blockers.push('no-verified-articles');

  for (const article of verification?.articles ?? []) {
    for (const blocker of article.publication.blockers) {
      if (!blockers.includes(blocker)) blockers.push(blocker);
    }
  }

  return {
    candidateId: candidate.id,
    candidateName: candidate.name,
    districtId: candidate.districtId,
    status,
    attempts: attempts.map((attempt) => ({
      sourceId: attempt.sourceId,
      query: attempt.query,
      fetchedAt: attempt.fetchedAt,
      httpStatus: attempt.httpStatus,
      documentSha256: attempt.documentSha256,
      status: attempt.status,
      resultCount: attempt.resultCount,
      error: attempt.error,
    })),
    discovered,
    verified: verifiedArticles.length,
    published,
    blockers,
  };
}

export function articleFromVerification(
  candidate: RosterCandidate,
  draft: NewsArticle,
  editorial: { summary: string; topicTags: NewsTopic[] } | null,
): NewsArticle {
  return {
    ...draft,
    articleId: draft.articleId || articleIdFor(draft.canonicalUrl),
    summary: editorial?.summary ?? null,
    summaryBasis: editorial ? 'editorial' : null,
    topicTags: editorial?.topicTags ?? draft.topicTags,
  };
}

export function mergeCoverage(
  coverage: readonly NewsCandidateCoverage[],
  publishedIds: ReadonlySet<string>,
  verifiedCounts: ReadonlyMap<string, number>,
): NewsCandidateCoverage[] {
  return coverage.map((entry) => {
    const published = publishedIds.has(entry.candidateId)
      ? Math.max(1, entry.published)
      : 0;
    const verified = Math.max(
      entry.verified,
      verifiedCounts.get(entry.candidateId) ?? 0,
    );
    let status = entry.status;
    if (published > 0) status = 'published';
    else if (verified > 0) status = 'verified-pending-review';
    return { ...entry, status, published, verified };
  });
}

export function snapshotDate(): string {
  return NewsDateSchema.parse(NEWS_SNAPSHOT_DATE);
}

export function sortedArticles(
  articles: readonly NewsArticle[],
): NewsArticle[] {
  return sortNewsArticles(articles);
}
