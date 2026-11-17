import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import rosterInput from '../data/approved/2026/kaohsiung-election.json';
import financialInput from '../data/normalized/2026/candidate-property-declaration-financial-summaries.json';
import normalizedInput from '../data/normalized/2026/candidate-property-declaration-sources.json';
import verificationInput from '../data/normalized/2026/candidate-property-declaration-verification.json';
import publishedInput from '../data/published/2026/candidate-property-declarations.json';
import {
  PROPERTY_DECLARATION_FINANCIAL_CATEGORIES,
  type PropertyDeclarationFinancialSummaryRecord,
  type PropertyDeclarationNormalizedRow,
  validatePropertyDeclarationDataset,
  validatePropertyDeclarationFinancialSummaryDataset,
  validatePropertyDeclarationNormalizedDataset,
  validatePropertyDeclarationVerificationDataset,
} from '../src/data/property-declarations/schema';
import { assertPropertyDeclarationFinancialEvidence } from '../src/data/property-declarations/verification';

const root = process.cwd();
const normalized =
  validatePropertyDeclarationNormalizedDataset(normalizedInput);
const published = validatePropertyDeclarationDataset(publishedInput);
const financial =
  validatePropertyDeclarationFinancialSummaryDataset(financialInput);
const verification =
  validatePropertyDeclarationVerificationDataset(verificationInput);
assertPropertyDeclarationFinancialEvidence(verification, financial);
const roster = rosterInput as {
  candidates: Array<{
    id: string;
    displayName: string;
    cecDirectoryName?: string;
    districtId: string;
    electionType: 'mayoral' | 'city-council' | 'indigenous-council';
  }>;
};
const rosterById = new Map(
  roster.candidates.map((candidate) => [candidate.id, candidate]),
);
const sourcePagesById = new Map(
  normalized.sourcePages.map((sourcePage) => [sourcePage.id, sourcePage]),
);
const rowsByCandidate = new Map<string, PropertyDeclarationNormalizedRow[]>();

function fail(message: string): never {
  throw new Error('[validate:property-declarations] ' + message);
}

const financialByCandidate = new Map<
  string,
  PropertyDeclarationFinancialSummaryRecord
>();
for (const record of financial.records) {
  if (financialByCandidate.has(record.candidateId))
    fail('duplicate financial summary for ' + record.candidateId);
  financialByCandidate.set(record.candidateId, record);
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function sorted(values: string[]): string[] {
  return [...values].sort();
}

function sameValues(left: string[], right: string[]): boolean {
  return JSON.stringify(sorted(left)) === JSON.stringify(sorted(right));
}

function candidateMatchesRow(
  candidate: (typeof roster.candidates)[number],
  row: PropertyDeclarationNormalizedRow,
): boolean {
  const page = sourcePagesById.get(row.sourcePageId);
  if (!page || page.url !== row.listingPageUrl) return false;
  if (row.listingPageId !== row.sourcePageId) return false;
  if (
    page.id === 'pdps-mayoral-kaohsiung' &&
    candidate.electionType !== 'mayoral'
  )
    return false;
  const districtMatch = /^pdps-council-kaohsiung-(\d{2})$/.exec(page.id);
  if (districtMatch && !candidate.districtId.endsWith('-' + districtMatch[1]))
    return false;
  return (
    row.listedName === candidate.displayName ||
    row.listedName === candidate.cecDirectoryName
  );
}

async function assertNoPropertyPdfBytes(): Promise<void> {
  const directory = path.join(
    root,
    'data/raw/official/2026/property-declarations',
  );
  const entries = await readdir(directory, { recursive: true });
  const pdfs = entries.filter(
    (entry) =>
      typeof entry === 'string' && entry.toLowerCase().endsWith('.pdf'),
  );
  if (pdfs.length > 0)
    fail('property-declarations raw subtree must not retain PDF bytes.');
}

function assertNoSensitiveKeys(value: unknown, pathLabel = '<root>'): void {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      assertNoSensitiveKeys(item, pathLabel + '[' + index + ']');
    }
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (
      /address|identity(number|card)|national.?id|account|bank|amount|debt|parcel|signature|phone|email|spouse|minor|household/i.test(
        key,
      )
    )
      fail('sensitive field key retained at ' + pathLabel + '.' + key);
    assertNoSensitiveKeys(child, pathLabel + '.' + key);
  }
}

for (const sourcePage of normalized.sourcePages) {
  if (!sourcePage.url.startsWith('https://pdps-dec.cec.gov.tw/release/formal/'))
    fail('source page URL is not an official PDPS URL: ' + sourcePage.url);
  const bytes = await readFile(path.resolve(root, sourcePage.snapshotFile));
  if (sha256(bytes) !== sourcePage.sha256)
    fail('source page hash mismatch: ' + sourcePage.snapshotFile);
}

if (normalized.sourcePages.length !== 20)
  fail('expected 20 retained source pages.');
if (normalized.rows.length !== 107)
  fail('expected 107 official declaration rows.');
if (roster.candidates.length !== 106)
  fail('expected 106 canonical candidates.');
if (
  roster.candidates.filter((candidate) => candidate.electionType === 'mayoral')
    .length !== 5 ||
  roster.candidates.filter(
    (candidate) => candidate.electionType === 'city-council',
  ).length !== 91 ||
  roster.candidates.filter(
    (candidate) => candidate.electionType === 'indigenous-council',
  ).length !== 10
)
  fail('canonical election-type coverage changed unexpectedly.');

for (const row of normalized.rows) {
  if (
    !/^https:\/\/pdps-dec\.cec\.gov\.tw\/release\/formal\/files\/\d+\.pdf$/.test(
      row.pdfUrl,
    )
  )
    fail('row has a non-official PDF URL: ' + row.rowId);
  if (!row.pdfUrl.endsWith('/' + row.pdfFileName))
    fail('row PDF filename does not match URL: ' + row.rowId);
  if (row.matchStatus === 'unmatched') {
    if (row.candidateId !== null || row.matchMethod !== null)
      fail('unmatched row must not carry a candidate identity: ' + row.rowId);
    continue;
  }
  if (!row.candidateId || !row.matchMethod)
    fail(
      'matched row must carry a candidate identity and method: ' + row.rowId,
    );
  const candidate = rosterById.get(row.candidateId);
  if (!candidate || !candidateMatchesRow(candidate, row))
    fail('row identity does not match the canonical roster: ' + row.rowId);
  const rows = rowsByCandidate.get(row.candidateId) ?? [];
  rows.push(row);
  rowsByCandidate.set(row.candidateId, rows);
}
if (
  !sameValues(
    normalized.unmatchedRows,
    normalized.rows
      .filter((row) => row.matchStatus === 'unmatched')
      .map((row) => row.rowId),
  )
)
  fail('unmatchedRows does not match normalized row states.');

for (const [candidateId, rows] of rowsByCandidate) {
  const expectedStatus = rows.length > 1 ? 'ambiguous' : 'matched';
  if (rows.some((row) => row.matchStatus !== expectedStatus))
    fail('row ambiguity state is inconsistent for ' + candidateId);
}
if (
  normalized.rows.filter((row) => row.matchStatus === 'matched').length !==
    105 ||
  normalized.rows.filter((row) => row.matchStatus === 'ambiguous').length !==
    2 ||
  normalized.unmatchedRows.length !== 0
)
  fail(
    'expected 105 uniquely matched rows, 2 ambiguous rows and no unmatched rows.',
  );

const rosterIds = roster.candidates.map((candidate) => candidate.id);
const publishedIds = published.records.map((record) => record.candidateId);
if (!sameValues(rosterIds, publishedIds))
  fail('published records must cover exactly the canonical candidate IDs.');
if (published.coverage.candidateCount !== 106)
  fail('published candidate coverage must be 106.');
if (
  published.coverage.declarationRowCount !== normalized.rows.length ||
  published.coverage.unmatchedRowCount !== normalized.unmatchedRows.length
)
  fail('published coverage does not mirror normalized source counts.');

for (const record of published.records) {
  const candidate = rosterById.get(record.candidateId);
  if (!candidate)
    fail('published record references unknown candidate ' + record.candidateId);
  if (
    record.displayName !== candidate.displayName ||
    record.districtId !== candidate.districtId ||
    record.electionType !== candidate.electionType
  )
    fail('published candidate identity drifted for ' + record.candidateId);
  const rows = rowsByCandidate.get(record.candidateId) ?? [];
  const listingPageUrls = unique(rows.map((row) => row.listingPageUrl));
  const listedNames = unique(rows.map((row) => row.listedName));
  if (!sameValues(record.identity.listingPageUrls, listingPageUrls))
    fail('published listing pages drifted for ' + record.candidateId);
  if (!sameValues(record.identity.listedNames, listedNames))
    fail('published listed names drifted for ' + record.candidateId);
  if (rows.length === 0) {
    if (
      record.status !== 'source-unavailable' ||
      record.identity.status !== 'unavailable' ||
      record.documents.length !== 0
    )
      fail(
        'unmatched candidate must remain source-unavailable: ' +
          record.candidateId,
      );
    continue;
  }
  if (rows.length > 1) {
    if (
      record.status !== 'ambiguous-source' ||
      record.identity.status !== 'ambiguous' ||
      record.documents.length !== 0
    )
      fail(
        'ambiguous candidate must not receive a PDF assignment: ' +
          record.candidateId,
      );
    continue;
  }
  const row = rows[0];
  if (!row) fail('expected one source row for ' + record.candidateId);
  if (
    record.status !== 'source-linked' ||
    record.identity.status !== 'matched' ||
    record.identity.matchMethod !== row.matchMethod ||
    record.documents.length !== 1
  )
    fail(
      'unique candidate source was not published as source-linked: ' +
        record.candidateId,
    );
  const document = record.documents[0];
  if (!document) fail('expected one document for ' + record.candidateId);
  if (
    document.pdfUrl !== row.pdfUrl ||
    document.listingPageUrl !== row.listingPageUrl ||
    document.listedName !== row.listedName ||
    document.pdfSha256 !== null ||
    document.retention !== 'url-only'
  )
    fail(
      'published document is not a privacy-safe URL-only projection: ' +
        record.candidateId,
    );
}
if (
  published.coverage.sourceLinkedCount !== 105 ||
  published.coverage.ambiguousCount !== 1 ||
  published.coverage.sourceUnavailableCount !== 0
)
  fail('published source status coverage changed unexpectedly.');

if (verification.records.length !== 105) {
  fail('expected 105 privacy-safe verification records.');
}
if (financial.records.length !== 105) {
  fail(
    'expected 105 financial summary records for unique source-linked candidates.',
  );
}
const uniqueSourceLinkedIds = normalized.rows
  .filter((row) => row.matchStatus === 'matched' && row.candidateId !== null)
  .map((row) => row.candidateId as string);
if (!sameValues([...financialByCandidate.keys()], uniqueSourceLinkedIds)) {
  fail(
    'financial summaries must cover exactly the uniquely matched candidates.',
  );
}

const financialSummaryStatuses = {
  'independently-verified': financial.records.filter(
    (record) => record.summaryStatus === 'independently-verified',
  ).length,
  'partially-verified': financial.records.filter(
    (record) => record.summaryStatus === 'partially-verified',
  ).length,
  unavailable: financial.records.filter(
    (record) => record.summaryStatus === 'unavailable',
  ).length,
};
if (
  financialSummaryStatuses['independently-verified'] !== 1 ||
  financialSummaryStatuses['partially-verified'] !== 96 ||
  financialSummaryStatuses.unavailable !== 8
) {
  fail(
    'financial summary status coverage changed unexpectedly: ' +
      JSON.stringify(financialSummaryStatuses),
  );
}
const verifiedCategoryCount = financial.records.reduce(
  (total, record) => total + record.verifiedCategoryCount,
  0,
);
if (verifiedCategoryCount !== 675) {
  fail('expected 675 independently verified category summaries.');
}

for (const record of financial.records) {
  const candidate = rosterById.get(record.candidateId);
  const row = rowsByCandidate.get(record.candidateId);
  if (
    !candidate ||
    !row ||
    row.length !== 1 ||
    row[0]?.matchStatus !== 'matched'
  )
    fail(
      'financial summary candidate is not uniquely source-linked: ' +
        record.candidateId,
    );
  if (
    !row[0] ||
    record.pdfUrl !== row[0].pdfUrl ||
    record.pdfFileName !== row[0].pdfFileName
  )
    fail('financial summary source drifted for ' + record.candidateId);
  if (record.displayName !== candidate.displayName)
    fail('financial summary display name drifted for ' + record.candidateId);
  const categories = new Set(
    record.categories.map((category) => category.category),
  );
  if (categories.size !== PROPERTY_DECLARATION_FINANCIAL_CATEGORIES.length) {
    fail(
      'financial summary category coverage is incomplete for ' +
        record.candidateId,
    );
  }
}

for (const record of published.records) {
  const financialRecord = financialByCandidate.get(record.candidateId);
  if (record.status === 'source-linked') {
    if (!financialRecord || !record.financialSummary)
      fail(
        'source-linked record is missing its financial summary: ' +
          record.candidateId,
      );
    if (
      record.financialSummary.summaryStatus !== financialRecord.summaryStatus ||
      record.financialSummary.verifiedCategoryCount !==
        financialRecord.verifiedCategoryCount ||
      JSON.stringify(record.financialSummary.categories) !==
        JSON.stringify(financialRecord.categories)
    ) {
      fail('published financial summary drifted for ' + record.candidateId);
    }
  } else if (record.financialSummary !== null) {
    fail(
      'ambiguous or unavailable records must not publish financial summaries: ' +
        record.candidateId,
    );
  }
}
if (
  published.coverage.financialSummaryCount !== 105 ||
  published.coverage.financialSummaryVerifiedCategoryCount !== 675 ||
  published.coverage.financialSummaryPartialCount !== 96 ||
  published.coverage.financialSummaryUnavailableCount !== 8
) {
  fail('published financial summary coverage changed unexpectedly.');
}

assertNoSensitiveKeys(financial);
assertNoSensitiveKeys(published);
await assertNoPropertyPdfBytes();
console.log(
  '[validate:property-declarations] 106 candidates, 105 unique source links, 1 ambiguous source, 0 unavailable; 107 rows and 20 hashed source pages verified.',
);
