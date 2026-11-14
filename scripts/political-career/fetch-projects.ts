import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Retains the pages cited by data/political-career/2026/government-projects.json.
 *
 * The build never reaches the network: it reads the HTML snapshots kept here and
 * re-checks the sha256 in projects-manifest.json. A page that cannot be fetched
 * is recorded as a failure instead of being silently dropped, so the build can
 * refuse to publish a project whose evidence no longer resolves.
 */

const ROOT = process.cwd();
const CURATED_PATH = join(
  ROOT,
  'data/political-career/2026/government-projects.json',
);
const OUTPUT_ROOT = join(ROOT, 'data/raw/political-career/2026/projects');
const MANIFEST_PATH = join(OUTPUT_ROOT, 'projects-manifest.json');
const TIMEOUT_MS = 30_000;
const ATTEMPTS = 2;
const USER_AGENT =
  'Mozilla/5.0 (compatible; kaohsiung-2026-election-research/1.0; +https://github.com/r05323028/kaohsiung-2026-election)';

type CuratedSource = {
  sourceId: string;
  url: string;
  publisher: string;
  title: string;
};

type ManifestEntry = {
  sourceId: string;
  url: string;
  httpStatus: number;
  byteLength: number;
  sha256: string;
  rawPath: string;
  retrievedAt: string;
  contentType: string | null;
};

type ManifestFailure = {
  sourceId: string;
  url: string;
  reason: string;
};

type Manifest = {
  datasetId: string;
  publisher: string;
  fetchedAt: string;
  entries: ManifestEntry[];
  failures: ManifestFailure[];
};

function absolute(path: string): string {
  return join(ROOT, path);
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

async function fetchText(
  url: string,
): Promise<{ body: string; status: number; contentType: string | null }> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        headers: {
          'user-agent': USER_AGENT,
          accept: 'text/html,application/xhtml+xml',
        },
        redirect: 'follow',
        signal: controller.signal,
      });
      const buffer = await response.arrayBuffer();
      const body = Buffer.from(buffer).toString('utf8');
      return {
        body,
        status: response.status,
        contentType: response.headers.get('content-type'),
      };
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('fetch failed: ' + url);
}

async function main(): Promise<void> {
  const curated = JSON.parse(readFileSync(CURATED_PATH, 'utf8')) as {
    sources: CuratedSource[];
  };
  mkdirSync(OUTPUT_ROOT, { recursive: true });

  const entries: ManifestEntry[] = [];
  const failures: ManifestFailure[] = [];
  const retrievedAt = new Date().toISOString();

  for (const source of curated.sources) {
    try {
      const result = await fetchText(source.url);
      const body = result.body.replace(/\r\n/g, '\n');
      if (result.status >= 400 || body.length < 500) {
        failures.push({
          sourceId: source.sourceId,
          url: source.url,
          reason:
            'http ' +
            String(result.status) +
            ', ' +
            String(body.length) +
            ' bytes',
        });
        console.log(
          '[projects] ' +
            source.sourceId +
            ': HTTP ' +
            String(result.status) +
            ' (' +
            String(body.length) +
            ' bytes)',
        );
        continue;
      }
      const fileName = source.sourceId + '.html';
      const rawPath = join('data/raw/political-career/2026/projects', fileName);
      writeFileSync(absolute(rawPath), body, 'utf8');
      entries.push({
        sourceId: source.sourceId,
        url: source.url,
        httpStatus: result.status,
        byteLength: Buffer.byteLength(body),
        sha256: sha256(body),
        rawPath,
        retrievedAt,
        contentType: result.contentType,
      });
      console.log(
        '[projects] ' +
          source.sourceId +
          ': HTTP ' +
          String(result.status) +
          ' (' +
          String(Buffer.byteLength(body)) +
          ' bytes)',
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      failures.push({ sourceId: source.sourceId, url: source.url, reason });
      console.log('[projects] ' + source.sourceId + ': FAILED ' + reason);
    }
  }

  const manifest: Manifest = {
    datasetId: 'kaohsiung-2026-government-projects-snapshots',
    publisher: '各專案報導與機關頁面（見 url）',
    fetchedAt: retrievedAt,
    entries,
    failures,
  };
  writeFileSync(
    MANIFEST_PATH,
    JSON.stringify(manifest, null, 2) + '\n',
    'utf8',
  );
  console.log(
    '[projects] retained ' +
      String(entries.length) +
      ' pages, ' +
      String(failures.length) +
      ' failed',
  );
  if (failures.length > 0) process.exitCode = 1;
}

await main();
