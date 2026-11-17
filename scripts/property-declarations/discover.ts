import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

type OfficialCandidate = {
  id: string;
  displayName: string;
  cecDirectoryName?: string;
  districtId: string;
  electionType: 'mayoral' | 'city-council' | 'indigenous-council';
};

type PageDefinition = {
  file: string;
  id: string;
  url: string;
  districtPageNumber: number | null;
};

type RetrievalMetadataFile = {
  retrievedAt: string;
  publisher: string;
  baseUrl: string;
  files: Array<{
    file: string;
    retrievedAt: string;
    bytes: number;
    sha256: string;
  }>;
};

const BASE_URL = 'https://pdps-dec.cec.gov.tw/release/formal/';
const RAW_ROOT = path.join(
  process.cwd(),
  'data/raw/official/2026/property-declarations',
);
const PAGE_ROOT = path.join(RAW_ROOT, 'pages');
const RETRIEVAL_METADATA_PATH = path.join(RAW_ROOT, 'retrieval-metadata.json');
const NORMALIZED_PATH = path.join(
  process.cwd(),
  'data/normalized/2026/candidate-property-declaration-sources.json',
);
const ROSTER_PATH = path.join(
  process.cwd(),
  'data/approved/2026/kaohsiung-election.json',
);
const PAGE_DEFINITIONS: PageDefinition[] = [
  {
    file: 'HomePage.html',
    id: 'pdps-home',
    url: BASE_URL + 'HomePage.html',
    districtPageNumber: null,
  },
  {
    file: 'Page5.html',
    id: 'pdps-mayoral-index',
    url: BASE_URL + 'Page5.html',
    districtPageNumber: null,
  },
  {
    file: 'Page5_02.html',
    id: 'pdps-mayoral-kaohsiung',
    url: BASE_URL + 'Page5_02.html',
    districtPageNumber: null,
  },
  {
    file: 'Page7.html',
    id: 'pdps-council-index',
    url: BASE_URL + 'Page7.html',
    districtPageNumber: null,
  },
  {
    file: 'Page7_02.html',
    id: 'pdps-council-kaohsiung',
    url: BASE_URL + 'Page7_02.html',
    districtPageNumber: null,
  },
  ...Array.from({ length: 15 }, (_, index) => {
    const districtPageNumber = index + 1;
    const suffix = String(districtPageNumber).padStart(2, '0');
    return {
      file: 'Page7_02_' + districtPageNumber + '.html',
      id: 'pdps-council-kaohsiung-' + suffix,
      url: BASE_URL + 'Page7_02_' + districtPageNumber + '.html',
      districtPageNumber,
    };
  }),
];

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parsePdfRows(html: string): Array<{
  listedName: string;
  pdfFileName: string;
  pdfUrl: string;
}> {
  const rows: Array<{
    listedName: string;
    pdfFileName: string;
    pdfUrl: string;
  }> = [];
  const pattern =
    /<a\b[^>]*href\s*=\s*["']([^"']+\.pdf)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(pattern)) {
    const href = match[1];
    const listedName = decodeHtml(match[2] ?? '');
    if (!href || !listedName) continue;
    const pdfFileName = href.split('/').pop();
    if (!pdfFileName || !/^\d+\.pdf$/i.test(pdfFileName)) continue;
    rows.push({
      listedName,
      pdfFileName,
      pdfUrl: new URL(href, BASE_URL).toString(),
    });
  }
  return rows;
}

function candidatesForRow(
  row: { listedName: string },
  page: PageDefinition,
  candidates: OfficialCandidate[],
): Array<{
  candidate: OfficialCandidate;
  matchMethod:
    | 'display-name-district-election-type'
    | 'cec-directory-name-district-election-type';
}> {
  const scoped = candidates.filter((candidate) => {
    if (page.id === 'pdps-mayoral-kaohsiung') {
      return candidate.electionType === 'mayoral';
    }
    if (page.districtPageNumber === null) return false;
    const suffix = String(page.districtPageNumber).padStart(2, '0');
    return candidate.districtId.endsWith('-' + suffix);
  });
  const exact = scoped
    .filter((candidate) => candidate.displayName === row.listedName)
    .map((candidate) => ({
      candidate,
      matchMethod: 'display-name-district-election-type' as const,
    }));
  if (exact.length > 0) return exact;
  return scoped
    .filter((candidate) => candidate.cecDirectoryName === row.listedName)
    .map((candidate) => ({
      candidate,
      matchMethod: 'cec-directory-name-district-election-type' as const,
    }));
}

async function fetchOfficialPage(page: PageDefinition): Promise<Uint8Array> {
  const allowedPage = PAGE_DEFINITIONS.find(
    (candidate) => candidate.id === page.id && candidate.url === page.url,
  );
  if (!allowedPage)
    throw new Error('Page is not in the official PDPS allowlist.');
  const url = new URL(allowedPage.url);
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'pdps-dec.cec.gov.tw' ||
    !url.pathname.startsWith('/release/formal/')
  )
    throw new Error('Page is outside the official PDPS origin.');
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function readMetadata(): Promise<RetrievalMetadataFile> {
  return JSON.parse(
    await readFile(RETRIEVAL_METADATA_PATH, 'utf8'),
  ) as RetrievalMetadataFile;
}

async function main(): Promise<void> {
  const shouldFetch = process.argv.includes('--fetch');
  await mkdir(PAGE_ROOT, { recursive: true });

  const roster = JSON.parse(await readFile(ROSTER_PATH, 'utf8')) as {
    candidates: OfficialCandidate[];
  };

  let metadata: RetrievalMetadataFile;
  if (shouldFetch) {
    const retrievedAt = new Date().toISOString();
    const files: RetrievalMetadataFile['files'] = [];
    for (const page of PAGE_DEFINITIONS) {
      const bytes = await fetchOfficialPage(page);
      await writeFile(path.join(PAGE_ROOT, page.file), bytes);
      files.push({
        file: page.file,
        retrievedAt,
        bytes: bytes.byteLength,
        sha256: sha256(bytes),
      });
    }
    metadata = {
      retrievedAt,
      publisher: '中央選舉委員會選舉公職人員財產申報公開查閱平臺',
      baseUrl: BASE_URL,
      files,
    };
    await writeFile(
      RETRIEVAL_METADATA_PATH,
      JSON.stringify(metadata, null, 2) + '\n',
    );
  } else {
    metadata = await readMetadata();
  }

  const metadataByFile = new Map(
    metadata.files.map((entry) => [entry.file, entry]),
  );
  const sourcePages: Array<{
    id: string;
    url: string;
    snapshotFile: string;
    retrievalDate: string;
    sha256: string;
  }> = [];
  const rows: Array<{
    rowId: string;
    listedName: string;
    pdfFileName: string;
    pdfUrl: string;
    listingPageId: string;
    listingPageUrl: string;
    sourcePageId: string;
    districtPageNumber: number | null;
    candidateId: string | null;
    matchStatus: 'matched' | 'ambiguous' | 'unmatched';
    matchMethod:
      | 'display-name-district-election-type'
      | 'cec-directory-name-district-election-type'
      | null;
  }> = [];

  for (const page of PAGE_DEFINITIONS) {
    const filePath = path.join(PAGE_ROOT, page.file);
    const bytes = await readFile(filePath);
    const metadataEntry = metadataByFile.get(page.file);
    if (!metadataEntry) {
      throw new Error('Missing retrieval metadata for ' + page.file);
    }
    const actualHash = sha256(bytes);
    if (actualHash !== metadataEntry.sha256) {
      throw new Error(
        'Raw property declaration page hash mismatch: ' + page.file,
      );
    }
    sourcePages.push({
      id: page.id,
      url: page.url,
      snapshotFile: path.relative(process.cwd(), filePath),
      retrievalDate: metadataEntry.retrievedAt,
      sha256: actualHash,
    });
    for (const parsedRow of parsePdfRows(bytes.toString())) {
      const matches = candidatesForRow(parsedRow, page, roster.candidates);
      if (matches.length !== 1) {
        rows.push({
          rowId: 'pdps-row-' + parsedRow.pdfFileName.replace('.pdf', ''),
          listedName: parsedRow.listedName,
          pdfFileName: parsedRow.pdfFileName,
          pdfUrl: parsedRow.pdfUrl,
          listingPageId: page.id,
          listingPageUrl: page.url,
          sourcePageId: page.id,
          districtPageNumber: page.districtPageNumber,
          candidateId:
            matches.length === 1 ? (matches[0]?.candidate.id ?? null) : null,
          matchStatus: 'unmatched',
          matchMethod:
            matches.length === 1 ? (matches[0]?.matchMethod ?? null) : null,
        });
        continue;
      }
      const match = matches[0];
      if (!match)
        throw new Error(
          'Expected one matched candidate for ' + parsedRow.pdfFileName,
        );
      rows.push({
        rowId: 'pdps-row-' + parsedRow.pdfFileName.replace('.pdf', ''),
        listedName: parsedRow.listedName,
        pdfFileName: parsedRow.pdfFileName,
        pdfUrl: parsedRow.pdfUrl,
        listingPageId: page.id,
        listingPageUrl: page.url,
        sourcePageId: page.id,
        districtPageNumber: page.districtPageNumber,
        candidateId: match.candidate.id,
        matchStatus: 'matched',
        matchMethod: match.matchMethod,
      });
    }
  }

  const rowsByCandidate = new Map<string, typeof rows>();
  for (const row of rows) {
    if (!row.candidateId) continue;
    const bucket = rowsByCandidate.get(row.candidateId) ?? [];
    bucket.push(row);
    rowsByCandidate.set(row.candidateId, bucket);
  }
  for (const bucket of rowsByCandidate.values()) {
    if (bucket.length > 1) {
      for (const row of bucket) row.matchStatus = 'ambiguous';
    }
  }

  const unmatchedRows = rows
    .filter((row) => row.matchStatus === 'unmatched')
    .map((row) => row.rowId);
  const output = {
    datasetId: 'kaohsiung-2026-candidate-property-declarations-sources',
    schemaVersion: '1',
    snapshotDate: metadata.retrievedAt.slice(0, 10),
    sourcePages,
    rows,
    unmatchedRows,
    note: 'This normalized source map records official listing-page links only. PDF bytes are not retained because the documents contain addresses, identity numbers, financial amounts and other sensitive fields; publication never infers a missing or ambiguous link as an absence of property.',
  };
  await mkdir(path.dirname(NORMALIZED_PATH), { recursive: true });
  await writeFile(NORMALIZED_PATH, JSON.stringify(output, null, 2) + '\n');
  console.log(
    'Discovered ' +
      rows.length +
      ' official declaration links for ' +
      roster.candidates.length +
      ' candidates; ' +
      unmatchedRows.length +
      ' rows unmatched.',
  );
}

await main();
