import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Retains the Kaohsiung City Council news pages that the 65 institutional
 * member profiles link to from their 相關新聞 blocks. Every page recorded here
 * is later re-read offline by scripts/political-career/build.ts, so the raw
 * bytes are the provenance and the build must never reach the network.
 */

const ROOT = process.cwd();
const ENRICHMENT_PATH = join(
  ROOT,
  'data/public-records/research-enrichment/2026/full-roster.json',
);
const OUTPUT_ROOT = join(ROOT, 'data/raw/political-career/2026');
const NEWS_ROOT = join(OUTPUT_ROOT, 'news');
const MANIFEST_PATH = join(OUTPUT_ROOT, 'news-manifest.json');
const CONCURRENCY = 3;
const ATTEMPTS = 3;
const TIMEOUT_MS = 30_000;
const USER_AGENT =
  'Mozilla/5.0 (compatible; kaohsiung-2026-election-research/1.0; +https://github.com/r05323028/kaohsiung-2026-election)';

type EnrichmentSnapshot = {
  sourceId: string;
  role: string;
  url: string;
  retrievalStatus: string;
  rawPath: string | null;
  candidateIds?: string[];
  title?: string;
};

type EnrichmentDataset = {
  sourceSnapshots: EnrichmentSnapshot[];
};

type NewsIndexEntry = {
  newsId: string;
  url: string;
  profileTitle: string;
  sourceIds: string[];
  candidateIds: string[];
};

type ManifestEntry = {
  newsId: string;
  url: string;
  httpStatus: number;
  byteLength: number;
  sha256: string;
  rawPath: string;
  retrievedAt: string;
  candidateIds: string[];
  profileSourceIds: string[];
  profileTitles: string[];
};

type ManifestFailure = {
  newsId: string;
  url: string;
  attempts: number;
  error: string;
};

const NEWS_ANCHOR =
  /<a\s+href="\/News_Content\.aspx\?n=47&s=(\d+)"\s+title="([^"]*)"\s*>\s*<i class="mark">([^<]*)<\/i>([\s\S]{0,400}?)<\/a>/g;

function sha256(buffer: Buffer | string): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function newsUrl(newsId: string): string {
  return `https://www.kcc.gov.tw/News_Content.aspx?n=47&s=${newsId}`;
}

function buildIndex(snapshots: EnrichmentSnapshot[]): Map<string, NewsIndexEntry> {
  const index = new Map<string, NewsIndexEntry>();

  for (const snapshot of snapshots) {
    if (snapshot.role !== 'institutional-member-profile') continue;
    if (snapshot.retrievalStatus !== 'retrieved') continue;
    if (!snapshot.rawPath) continue;

    const absolutePath = join(ROOT, snapshot.rawPath);
    if (!existsSync(absolutePath)) continue;

    const html = readFileSync(absolutePath, 'utf8');
    NEWS_ANCHOR.lastIndex = 0;
    let match = NEWS_ANCHOR.exec(html);

    while (match) {
      const newsId = match[1] ?? '';
      const title = (match[2] ?? '').trim();

      if (!newsId) {
        match = NEWS_ANCHOR.exec(html);
        continue;
      }

      const existing = index.get(newsId);

      if (existing) {
        if (!existing.sourceIds.includes(snapshot.sourceId)) {
          existing.sourceIds.push(snapshot.sourceId);
        }
        for (const candidateId of snapshot.candidateIds ?? []) {
          if (!existing.candidateIds.includes(candidateId)) {
            existing.candidateIds.push(candidateId);
          }
        }
      } else {
        index.set(newsId, {
          newsId,
          url: newsUrl(newsId),
          profileTitle: title,
          sourceIds: [snapshot.sourceId],
          candidateIds: [...(snapshot.candidateIds ?? [])],
        });
      }

      match = NEWS_ANCHOR.exec(html);
    }
  }

  return index;
}

async function fetchOnce(url: string): Promise<{ status: number; body: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'zh-TW,zh;q=0.9',
      },
      signal: controller.signal,
      redirect: 'follow',
    });

    const body = await response.text();
    return { status: response.status, body };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchWithRetry(
  entry: NewsIndexEntry,
  force: boolean,
): Promise<ManifestEntry | ManifestFailure> {
  const rawPath = `data/raw/political-career/2026/news/${entry.newsId}.html`;
  const absolutePath = join(ROOT, rawPath);

  if (!force && existsSync(absolutePath)) {
    const buffer = readFileSync(absolutePath);
    return {
      newsId: entry.newsId,
      url: entry.url,
      httpStatus: 200,
      byteLength: buffer.byteLength,
      sha256: sha256(buffer),
      rawPath,
      retrievedAt: new Date().toISOString(),
      candidateIds: entry.candidateIds,
      profileSourceIds: entry.sourceIds,
      profileTitles: [entry.profileTitle],
    };
  }

  let lastError = 'unknown error';

  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      const { status, body } = await fetchOnce(entry.url);

      if (status !== 200) {
        lastError = `HTTP ${status}`;
        throw new Error(lastError);
      }

      if (body.length < 4_000) {
        lastError = `unexpectedly short body (${body.length} bytes)`;
        throw new Error(lastError);
      }

      writeFileSync(absolutePath, body, 'utf8');
      const buffer = Buffer.from(body, 'utf8');

      return {
        newsId: entry.newsId,
        url: entry.url,
        httpStatus: status,
        byteLength: buffer.byteLength,
        sha256: sha256(buffer),
        rawPath,
        retrievedAt: new Date().toISOString(),
        candidateIds: entry.candidateIds,
        profileSourceIds: entry.sourceIds,
        profileTitles: [entry.profileTitle],
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
    }
  }

  return {
    newsId: entry.newsId,
    url: entry.url,
    attempts: ATTEMPTS,
    error: lastError,
  };
}

async function main(): Promise<void> {
  const force = process.argv.includes('--force');

  mkdirSync(NEWS_ROOT, { recursive: true });
  mkdirSync(dirname(MANIFEST_PATH), { recursive: true });

  const enrichment = JSON.parse(
    readFileSync(ENRICHMENT_PATH, 'utf8'),
  ) as EnrichmentDataset;

  const index = buildIndex(enrichment.sourceSnapshots);
  const entries = [...index.values()].sort((a, b) =>
    a.newsId.localeCompare(b.newsId),
  );

  console.log(
    `[political-career] retained ${entries.length} unique council news pages from ${enrichment.sourceSnapshots.length} source snapshots`,
  );

  const retained: ManifestEntry[] = [];
  const failures: ManifestFailure[] = [];
  let cursor = 0;
  let completed = 0;

  const worker = async (): Promise<void> => {
    while (cursor < entries.length) {
      const entry = entries[cursor];
      cursor += 1;

      if (!entry) return;

      const result = await fetchWithRetry(entry, force);

      if ('error' in result) {
        failures.push(result);
      } else {
        retained.push(result);
      }

      completed += 1;
      if (completed % 25 === 0 || completed === entries.length) {
        console.log(
          `[political-career] ${completed}/${entries.length} pages processed (${failures.length} failed)`,
        );
      }
    }
  };

  await Promise.all(
    Array.from({ length: CONCURRENCY }, () => worker()),
  );

  retained.sort((a, b) => a.newsId.localeCompare(b.newsId));
  failures.sort((a, b) => a.newsId.localeCompare(b.newsId));

  const manifest = {
    datasetId: 'kaohsiung-2026-political-career-news',
    publisher: '高雄市議會',
    fetchedAt: new Date().toISOString(),
    requestedPageCount: entries.length,
    retainedPageCount: retained.length,
    failedPageCount: failures.length,
    entries: retained,
    failures,
  };

  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  console.log(
    `[political-career] retained ${retained.length} pages, ${failures.length} failures → data/raw/political-career/2026/news-manifest.json`,
  );

  if (failures.length > 0) {
    console.log(
      `[political-career] failures: ${failures
        .slice(0, 10)
        .map((failure) => `${failure.newsId} (${failure.error})`)
        .join(', ')}`,
    );
  }
}

await main();
