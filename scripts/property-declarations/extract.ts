import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import normalizedInput from '../../data/normalized/2026/candidate-property-declaration-sources.json';
import verificationInput from '../../data/normalized/2026/candidate-property-declaration-verification.json';
import {
  type PropertyDeclarationNormalizedRow,
  validatePropertyDeclarationNormalizedDataset,
  validatePropertyDeclarationVerificationDataset,
} from '../../src/data/property-declarations/schema';

const EXTRACTOR_SCHEMA_VERSION = 1;
const DEFAULT_OUT_DIR = path.join(
  process.cwd(),
  '.cache/reports/property-declarations/extraction',
);
const OFFICIAL_PDF_PREFIX = 'https://pdps-dec.cec.gov.tw/release/formal/files/';

type Mode = 'all' | 'candidate' | 'pdf';

export type ExtractArgs = {
  mode: Mode;
  candidateIds: string[];
  pdfPath: string | null;
  pdfDir: string | null;
  download: boolean;
  force: boolean;
  outDir: string;
  scale: number;
  maxPages: number | null;
};

type ExtractionTask = {
  candidateId: string | null;
  rowId: string;
  pdfFileName: string;
  pdfUrl: string;
};

type ExtractedPage = {
  pageNumber: number;
  source: 'text-layer' | 'ocr';
  tool: string;
  text: string;
  lines: Array<{ text: string; confidence: number | null }>;
};

type ExtractedPdf = {
  schemaVersion: number;
  pdfSha256: string;
  physicalPageCount: number;
  extractedPageCount: number;
  pages: ExtractedPage[];
};

type IndexEntry = {
  candidateId: string | null;
  rowId: string;
  pdfFileName: string;
  pdfUrl: string;
  pdfSha256: string;
  physicalPageCount: number;
  extractedPageCount: number;
  outputFile: string;
  textPageCount: number;
  ocrPageCount: number;
  tools: string[];
};

type ExtractionIndex = {
  schemaVersion: number;
  entries: IndexEntry[];
};

function fail(message: string): never {
  throw new Error('[property-declarations:extract] ' + message);
}

function usage(): string {
  return [
    'Usage:',
    '  npm run property-declarations:extract -- --all --pdf-dir <dir>',
    '  npm run property-declarations:extract -- --candidate <id[,id]> --pdf-dir <dir>',
    '  npm run property-declarations:extract -- --pdf <file>',
    '',
    'Options:',
    '  --all                 Extract every uniquely source-linked candidate.',
    '  --candidate <ids>     Extract one or more canonical candidate IDs.',
    '  --pdf <file>          Extract one local PDF.',
    '  --pdf-dir <dir>       Resolve <candidateId>__<NNNN>.pdf or <NNNN>.pdf.',
    '  --download            Download missing official PDFs into the cache.',
    '  --out <dir>           Cache directory (default .cache/reports/property-declarations/extraction).',
    '  --scale <number>      OCR render scale (default 3).',
    '  --max-pages <number>  Limit pages for a focused retry.',
    '  --force               Re-extract even when the cached hash matches.',
    '',
    'The command writes page text and line boxes only. It never publishes values.',
  ].join('\n');
}

export function parseArgs(argv: string[]): ExtractArgs {
  let mode: Mode | null = null;
  const candidateIds: string[] = [];
  let pdfPath: string | null = null;
  let pdfDir: string | null = null;
  let download = false;
  let force = false;
  let outDir = DEFAULT_OUT_DIR;
  let scale = 3;
  let maxPages: number | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }
    if (arg === '--all') {
      if (mode && mode !== 'all') fail('choose exactly one extraction mode');
      mode = 'all';
      continue;
    }
    if (
      arg === '--candidate' ||
      arg === '--pdf' ||
      arg === '--pdf-dir' ||
      arg === '--out' ||
      arg === '--scale' ||
      arg === '--max-pages'
    ) {
      const value = argv[index + 1];
      if (!value) fail('missing value for ' + arg);
      index += 1;
      if (arg === '--candidate') {
        if (mode && mode !== 'candidate')
          fail('choose exactly one extraction mode');
        mode = 'candidate';
        candidateIds.push(
          ...value
            .split(',')
            .map((item) => item.trim())
            .filter((item) => item.length > 0),
        );
      } else if (arg === '--pdf') {
        if (mode && mode !== 'pdf') fail('choose exactly one extraction mode');
        mode = 'pdf';
        pdfPath = value;
      } else if (arg === '--pdf-dir') {
        pdfDir = value;
      } else if (arg === '--out') {
        outDir = path.resolve(value);
      } else if (arg === '--scale') {
        scale = Number(value);
      } else if (arg === '--max-pages') {
        maxPages = Number(value);
      }
      continue;
    }
    if (arg === '--download') {
      download = true;
      continue;
    }
    if (arg === '--force') {
      force = true;
      continue;
    }
    fail('unknown argument: ' + arg);
  }

  if (!mode) fail('choose --all, --candidate or --pdf.\n' + usage());
  if (mode === 'candidate' && candidateIds.length === 0)
    fail('--candidate requires at least one candidate ID');
  if (!Number.isFinite(scale) || scale <= 0) fail('--scale must be positive');
  if (maxPages !== null && (!Number.isInteger(maxPages) || maxPages <= 0))
    fail('--max-pages must be a positive integer');
  if (mode === 'pdf' && !pdfPath) fail('--pdf requires a file path');

  return {
    mode,
    candidateIds,
    pdfPath,
    pdfDir,
    download,
    force,
    outDir,
    scale,
    maxPages,
  };
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function assertOfficialPdfUrl(value: string): void {
  if (!value.startsWith(OFFICIAL_PDF_PREFIX)) {
    fail('PDF URL is outside the official CEC PDPS allowlist: ' + value);
  }
  const parsed = new URL(value);
  if (
    parsed.protocol !== 'https:' ||
    parsed.hostname !== 'pdps-dec.cec.gov.tw' ||
    !parsed.pathname.startsWith('/release/formal/files/')
  ) {
    fail('PDF URL is outside the official CEC PDPS origin: ' + value);
  }
}

function taskKey(task: ExtractionTask): string {
  return (
    (task.candidateId ?? 'unmatched:' + task.rowId) + ':' + task.pdfFileName
  );
}

function outputName(task: ExtractionTask): string {
  const owner =
    task.candidateId ??
    'unmatched-' + task.rowId.replace(/[^a-zA-Z0-9_-]/g, '-');
  return owner + '__' + task.pdfFileName.replace(/\.pdf$/i, '') + '.json';
}

function tasksForCandidate(
  rows: PropertyDeclarationNormalizedRow[],
  candidateIds: string[],
): ExtractionTask[] {
  const byCandidate = new Map<string, PropertyDeclarationNormalizedRow>();
  for (const row of rows) {
    if (row.matchStatus !== 'matched' || !row.candidateId) continue;
    if (byCandidate.has(row.candidateId)) {
      fail('candidate has more than one matched row: ' + row.candidateId);
    }
    byCandidate.set(row.candidateId, row);
  }
  return candidateIds.map((candidateId) => {
    const row = byCandidate.get(candidateId);
    if (!row) fail('candidate is not uniquely source-linked: ' + candidateId);
    return {
      candidateId,
      rowId: row.rowId,
      pdfFileName: row.pdfFileName,
      pdfUrl: row.pdfUrl,
    };
  });
}

function tasksForAll(
  rows: PropertyDeclarationNormalizedRow[],
): ExtractionTask[] {
  const candidateIds = rows
    .filter((row) => row.matchStatus === 'matched' && row.candidateId)
    .map((row) => row.candidateId as string);
  return tasksForCandidate(rows, candidateIds);
}

function taskForPdf(
  rows: PropertyDeclarationNormalizedRow[],
  filePath: string,
): ExtractionTask {
  const fileName = path.basename(filePath);
  const prefixed = /^([^_]+)__(\d+\.pdf)$/.exec(fileName);
  const candidateId = prefixed?.[1] ?? null;
  const matches = rows.filter(
    (row) => row.pdfFileName === (prefixed?.[2] ?? fileName),
  );
  if (candidateId) {
    const row = matches.find((item) => item.candidateId === candidateId);
    if (!row)
      fail('PDF filename candidate does not match a retained source row');
    return {
      candidateId,
      rowId: row.rowId,
      pdfFileName: row.pdfFileName,
      pdfUrl: row.pdfUrl,
    };
  }
  if (matches.length === 1) {
    const row = matches[0];
    if (!row) fail('unreachable');
    return {
      candidateId: row.candidateId,
      rowId: row.rowId,
      pdfFileName: row.pdfFileName,
      pdfUrl: row.pdfUrl,
    };
  }
  return {
    candidateId: null,
    rowId: 'local-' + fileName.replace(/[^a-zA-Z0-9_-]/g, '-'),
    pdfFileName: fileName,
    pdfUrl: '',
  };
}

async function localPdfPath(
  task: ExtractionTask,
  args: ExtractArgs,
): Promise<string> {
  if (args.mode === 'pdf' && args.pdfPath) return path.resolve(args.pdfPath);
  if (args.pdfDir) {
    const candidates = task.candidateId
      ? [
          path.join(args.pdfDir, task.candidateId + '__' + task.pdfFileName),
          path.join(args.pdfDir, task.pdfFileName),
        ]
      : [path.join(args.pdfDir, task.pdfFileName)];
    for (const candidate of candidates) {
      try {
        const info = await stat(candidate);
        if (info.isFile()) return candidate;
      } catch {
        // Try the next deterministic lookup.
      }
    }
  }
  if (args.download && task.pdfUrl) {
    assertOfficialPdfUrl(task.pdfUrl);
    if (!/^\d+\.pdf$/.test(task.pdfFileName)) {
      fail('official PDF filename is not in the expected numeric form');
    }
    const officialUrl = new URL(OFFICIAL_PDF_PREFIX + task.pdfFileName);
    if (officialUrl.toString() !== task.pdfUrl) {
      fail('PDF URL does not exactly match the official filename allowlist');
    }
    const target = path.join(args.outDir, 'pdfs', task.pdfFileName);
    await mkdir(path.dirname(target), { recursive: true });
    const response = await fetch(officialUrl);
    if (!response.ok)
      fail('failed to download ' + task.pdfUrl + ': ' + response.status);
    assertOfficialPdfUrl(response.url);
    const bytes = new Uint8Array(await response.arrayBuffer());
    await writeFile(target, bytes);
    return target;
  }
  fail(
    'no local PDF for ' +
      (task.candidateId ?? task.pdfFileName) +
      '; pass --pdf-dir <dir> or --download',
  );
}

async function readIndex(indexPath: string): Promise<ExtractionIndex> {
  try {
    const parsed = JSON.parse(
      await readFile(indexPath, 'utf8'),
    ) as ExtractionIndex;
    if (
      parsed.schemaVersion !== EXTRACTOR_SCHEMA_VERSION ||
      !Array.isArray(parsed.entries)
    ) {
      fail('cached extraction index has an unsupported schema');
    }
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { schemaVersion: EXTRACTOR_SCHEMA_VERSION, entries: [] };
    }
    throw error;
  }
}

async function writeIndex(
  indexPath: string,
  entries: IndexEntry[],
): Promise<void> {
  const sorted = [...entries].sort((left, right) =>
    taskKey(left).localeCompare(taskKey(right)),
  );
  await mkdir(path.dirname(indexPath), { recursive: true });
  await writeFile(
    indexPath,
    JSON.stringify(
      { schemaVersion: EXTRACTOR_SCHEMA_VERSION, entries: sorted },
      null,
      2,
    ) + '\n',
  );
}

function runExtractor(
  python: string,
  pdfPath: string,
  outputPath: string,
  args: ExtractArgs,
): void {
  const command = [
    path.join(process.cwd(), 'scripts/property-declarations/extract_pdf.py'),
    '--pdf',
    pdfPath,
    '--out',
    outputPath,
    '--scale',
    String(args.scale),
  ];
  if (args.maxPages !== null)
    command.push('--max-pages', String(args.maxPages));
  const result = spawnSync(python, command, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    fail(
      'Python extraction failed for ' +
        pdfPath +
        '\n' +
        (result.stderr || result.stdout || 'unknown error'),
    );
  }
}

function indexEntryFromExtraction(
  task: ExtractionTask,
  extracted: ExtractedPdf,
  outputFile: string,
): IndexEntry {
  return {
    candidateId: task.candidateId,
    rowId: task.rowId,
    pdfFileName: task.pdfFileName,
    pdfUrl: task.pdfUrl,
    pdfSha256: extracted.pdfSha256,
    physicalPageCount: extracted.physicalPageCount,
    extractedPageCount: extracted.extractedPageCount,
    outputFile,
    textPageCount: extracted.pages.filter(
      (page) => page.source === 'text-layer',
    ).length,
    ocrPageCount: extracted.pages.filter((page) => page.source === 'ocr')
      .length,
    tools: [...new Set(extracted.pages.map((page) => page.tool))].sort(),
  };
}

export async function main(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const normalized =
    validatePropertyDeclarationNormalizedDataset(normalizedInput);
  const verification =
    validatePropertyDeclarationVerificationDataset(verificationInput);
  const verificationByCandidate = new Map(
    verification.records.map((record) => [record.candidateId, record]),
  );
  const tasks =
    args.mode === 'all'
      ? tasksForAll(normalized.rows)
      : args.mode === 'candidate'
        ? tasksForCandidate(normalized.rows, args.candidateIds)
        : [taskForPdf(normalized.rows, args.pdfPath as string)];

  await mkdir(args.outDir, { recursive: true });
  const indexPath = path.join(args.outDir, 'index.json');
  const index = await readIndex(indexPath);
  const entries = new Map(
    index.entries.map((entry) => [taskKey(entry), entry]),
  );
  const python = process.env.PYTHON ?? 'python3';
  let extractedCount = 0;
  let skippedCount = 0;

  for (const task of tasks) {
    if (!task.pdfUrl) {
      const expected = verificationByCandidate.get(task.candidateId ?? '');
      if (expected) {
        fail('unmatched PDF unexpectedly has a verification record');
      }
    } else {
      assertOfficialPdfUrl(task.pdfUrl);
    }
    const pdfPath = await localPdfPath(task, args);
    const pdfBytes = await readFile(pdfPath);
    const pdfSha256 = sha256(pdfBytes);
    const expected = task.candidateId
      ? verificationByCandidate.get(task.candidateId)
      : undefined;
    if (expected && expected.pdfSha256 !== pdfSha256) {
      fail(
        'PDF SHA-256 changed for ' +
          task.candidateId +
          '; create a new snapshot and re-run source review instead of overwriting provenance.',
      );
    }
    const outputFile = outputName(task);
    const outputPath = path.join(args.outDir, outputFile);
    const previous = entries.get(taskKey(task));
    if (
      !args.force &&
      previous &&
      previous.pdfSha256 === pdfSha256 &&
      previous.extractedPageCount ===
        (args.maxPages === null
          ? previous.physicalPageCount
          : Math.min(previous.physicalPageCount, args.maxPages))
    ) {
      skippedCount += 1;
      continue;
    }

    runExtractor(python, pdfPath, outputPath, args);
    const extracted = JSON.parse(
      await readFile(outputPath, 'utf8'),
    ) as ExtractedPdf;
    if (extracted.schemaVersion !== EXTRACTOR_SCHEMA_VERSION) {
      fail('extractor returned an unsupported schema for ' + pdfPath);
    }
    if (extracted.pdfSha256 !== pdfSha256) {
      fail('extractor hash does not match the local PDF for ' + pdfPath);
    }
    if (
      expected &&
      extracted.physicalPageCount !== expected.physicalPageCount
    ) {
      fail(
        'PDF page count changed for ' +
          task.candidateId +
          ': expected ' +
          expected.physicalPageCount +
          ', got ' +
          extracted.physicalPageCount,
      );
    }
    entries.set(
      taskKey(task),
      indexEntryFromExtraction(task, extracted, outputFile),
    );
    extractedCount += 1;
  }

  await writeIndex(indexPath, [...entries.values()]);
  console.log(
    'Extracted ' +
      extractedCount +
      ' PDF(s), skipped ' +
      skippedCount +
      ' cached PDF(s); ' +
      entries.size +
      ' cache entries in ' +
      path.relative(process.cwd(), args.outDir) +
      '.',
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
