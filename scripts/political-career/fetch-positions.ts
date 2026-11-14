import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Retains the pages cited by data/political-career/2026/government-positions.json.
 *
 * Positions are taken from already-verified claims in the published candidate
 * profiles; this script only freezes the page each claim points at so the build
 * can re-check the sha256 offline. Binary responses (the CEC ballot bulletins
 * are PDFs) are stored as bytes rather than decoded text.
 */

const ROOT = process.cwd();
const CURATED_PATH = join(
  ROOT,
  'data/political-career/2026/government-positions.json',
);
const OUTPUT_ROOT = join(ROOT, 'data/raw/political-career/2026/positions');
const MANIFEST_PATH = join(OUTPUT_ROOT, 'positions-manifest.json');
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

type ManifestFailure = { sourceId: string; url: string; reason: string };

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

async function fetchBytes(
  url: string,
): Promise<{ body: Buffer; status: number; contentType: string | null }> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        headers: {
          'user-agent': USER_AGENT,
          accept: 'text/html,application/pdf,*/*',
        },
        redirect: 'follow',
        signal: controller.signal,
      });
      const buffer = Buffer.from(await response.arrayBuffer());
      return {
        body: buffer,
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
      const result = await fetchBytes(source.url);
      const isPdf = (result.contentType ?? '').includes('pdf');
      if (result.status >= 400 || result.body.length < 500) {
        failures.push({
          sourceId: source.sourceId,
          url: source.url,
          reason:
            'http ' +
            String(result.status) +
            ', ' +
            String(result.body.length) +
            ' bytes',
        });
        console.log(
          '[positions] ' +
            source.sourceId +
            ': HTTP ' +
            String(result.status) +
            ' (' +
            String(result.body.length) +
            ' bytes)',
        );
        continue;
      }
      const fileName = source.sourceId + (isPdf ? '.pdf' : '.html');
      const rawPath = join(
        'data/raw/political-career/2026/positions',
        fileName,
      );
      writeFileSync(absolute(rawPath), result.body);
      entries.push({
        sourceId: source.sourceId,
        url: source.url,
        httpStatus: result.status,
        byteLength: result.body.length,
        sha256: createHash('sha256').update(result.body).digest('hex'),
        rawPath,
        retrievedAt,
        contentType: result.contentType,
      });
      console.log(
        '[positions] ' +
          source.sourceId +
          ': HTTP ' +
          String(result.status) +
          ' (' +
          String(result.body.length) +
          ' bytes)',
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      failures.push({ sourceId: source.sourceId, url: source.url, reason });
      console.log('[positions] ' + source.sourceId + ': FAILED ' + reason);
    }
  }

  const manifest: Manifest = {
    datasetId: 'kaohsiung-2026-government-positions-snapshots',
    publisher: '各機關與新聞頁面（見 url）',
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
    '[positions] retained ' +
      String(entries.length) +
      ' pages, ' +
      String(failures.length) +
      ' failed',
  );
  if (failures.length > 0) process.exitCode = 1;
}

await main();
