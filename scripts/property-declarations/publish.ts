import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import rosterInput from '../../data/approved/2026/kaohsiung-election.json';
import financialInput from '../../data/normalized/2026/candidate-property-declaration-financial-summaries.json';
import gazetteInput from '../../data/normalized/2026/candidate-property-declaration-gazette.json';
import normalizedInput from '../../data/normalized/2026/candidate-property-declaration-sources.json';
import { resolvePropertyDeclarationFinancialSummary } from '../../src/data/property-declarations/resolve';
import {
  type PropertyDeclarationCandidateRecord,
  type PropertyDeclarationDocument,
  type PropertyDeclarationFinancialSummary,
  type PropertyDeclarationFinancialSummaryRecord,
  type PropertyDeclarationGazetteRecord,
  type PropertyDeclarationNormalizedRow,
  validatePropertyDeclarationFinancialSummaryDataset,
  validatePropertyDeclarationGazetteDataset,
  validatePropertyDeclarationNormalizedDataset,
} from '../../src/data/property-declarations/schema';

const OUTPUT_PATH = path.join(
  process.cwd(),
  'data/published/2026/candidate-property-declarations.json',
);
const PRIVACY_NOTE =
  'PDF bytes are not retained; this record exposes only the official URL, listing-page source and conservative category-level financial summary. Sensitive fields such as addresses, identity numbers, accounts and itemized property details are intentionally not reproduced.';
const normalized =
  validatePropertyDeclarationNormalizedDataset(normalizedInput);
const financial =
  validatePropertyDeclarationFinancialSummaryDataset(financialInput);
const gazette = validatePropertyDeclarationGazetteDataset(gazetteInput);
const roster = rosterInput as {
  candidates: Array<{
    id: string;
    displayName: string;
    cecDirectoryName?: string;
    districtId: string;
    electionType: 'mayoral' | 'city-council' | 'indigenous-council';
  }>;
};

const rowsByCandidate = new Map<string, PropertyDeclarationNormalizedRow[]>();
for (const row of normalized.rows) {
  if (!row.candidateId) continue;
  const rows = rowsByCandidate.get(row.candidateId) ?? [];
  rows.push(row);
  rowsByCandidate.set(row.candidateId, rows);
}

const financialByCandidate = new Map<
  string,
  PropertyDeclarationFinancialSummaryRecord
>();
for (const record of financial.records) {
  if (financialByCandidate.has(record.candidateId)) {
    throw new Error('Duplicate financial summary for ' + record.candidateId);
  }
  financialByCandidate.set(record.candidateId, record);
}

const gazetteByCandidate = new Map<string, PropertyDeclarationGazetteRecord>();
for (const record of gazette.records) {
  if (gazetteByCandidate.has(record.candidateId)) {
    throw new Error('Duplicate gazette record for ' + record.candidateId);
  }
  gazetteByCandidate.set(record.candidateId, record);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function documentFromRow(
  row: PropertyDeclarationNormalizedRow,
): PropertyDeclarationDocument {
  return {
    listedName: row.listedName,
    pdfFileName: row.pdfFileName,
    pdfUrl: row.pdfUrl,
    listingPageId: row.listingPageId,
    listingPageUrl: row.listingPageUrl,
    sourcePageId: row.sourcePageId,
    retention: 'url-only',
    pdfSha256: null,
    privacyNote: PRIVACY_NOTE,
  };
}

function summaryFromRecord(
  record: PropertyDeclarationFinancialSummaryRecord,
): PropertyDeclarationFinancialSummary {
  return {
    summaryStatus: record.summaryStatus,
    verifiedCategoryCount: record.verifiedCategoryCount,
    categories: record.categories,
    sources: record.sources,
    note: record.note,
  };
}

const records: PropertyDeclarationCandidateRecord[] = roster.candidates.map(
  (candidate) => {
    const rows = rowsByCandidate.get(candidate.id) ?? [];
    const listedNames = unique(rows.map((row) => row.listedName));
    const listingPageUrls = unique(rows.map((row) => row.listingPageUrl));
    if (rows.length === 0) {
      return {
        candidateId: candidate.id,
        displayName: candidate.displayName,
        electionType: candidate.electionType,
        districtId: candidate.districtId,
        status: 'source-unavailable',
        identity: {
          status: 'unavailable',
          matchMethod: null,
          listedNames: [],
          listingPageUrls: [],
          note: 'No uniquely reconciled official listing link was retained for this candidate. An unavailable link does not mean the candidate has no property or made no declaration.',
        },
        documents: [],
        financialSummary: null,
      };
    }
    if (rows.length > 1 || rows.some((row) => row.matchStatus !== 'matched')) {
      const civilSummary = resolvePropertyDeclarationFinancialSummary(
        null,
        gazetteByCandidate.get(candidate.id) ?? null,
      );
      return {
        candidateId: candidate.id,
        displayName: candidate.displayName,
        electionType: candidate.electionType,
        districtId: candidate.districtId,
        status: 'ambiguous-source',
        identity: {
          status: 'ambiguous',
          matchMethod: null,
          listedNames,
          listingPageUrls,
          note:
            'Multiple or otherwise ambiguous official listing rows remain unassigned to this candidate. No individual official PDF is selected. ' +
            (civilSummary
              ? 'The civil gazette property card is published only as an explicitly attributed fallback and does not establish which official PDF belongs to this candidate.'
              : 'No financial summary is published until the source identity is unique.'),
        },
        documents: [],
        financialSummary: civilSummary,
      };
    }

    const row = rows[0];
    if (!row) throw new Error('Expected one source row for ' + candidate.id);
    const financialRecord = financialByCandidate.get(candidate.id);
    if (!financialRecord) {
      throw new Error('Missing financial summary for ' + candidate.id);
    }
    if (
      financialRecord.pdfUrl !== row.pdfUrl ||
      financialRecord.pdfFileName !== row.pdfFileName
    ) {
      throw new Error(
        'Financial summary source does not match listing row for ' +
          candidate.id,
      );
    }

    return {
      candidateId: candidate.id,
      displayName: candidate.displayName,
      electionType: candidate.electionType,
      districtId: candidate.districtId,
      status: 'source-linked',
      identity: {
        status: 'matched',
        matchMethod: row.matchMethod,
        listedNames,
        listingPageUrls,
        note: 'The official listing name was reconciled to the canonical candidate by name, district and election type. The linked PDF is not retained; only conservative category-level values independently supported by two offline passes are published.',
      },
      documents: [documentFromRow(row)],
      financialSummary: resolvePropertyDeclarationFinancialSummary(
        summaryFromRecord(financialRecord),
        gazetteByCandidate.get(candidate.id) ?? null,
      ),
    };
  },
);

const sourceLinkedCount = records.filter(
  (record) => record.status === 'source-linked',
).length;
const ambiguousCount = records.filter(
  (record) => record.status === 'ambiguous-source',
).length;
const sourceUnavailableCount = records.filter(
  (record) => record.status === 'source-unavailable',
).length;
const financialSummaries = records.flatMap((record) =>
  record.financialSummary ? [record.financialSummary] : [],
);
const output = {
  datasetId: 'kaohsiung-2026-candidate-property-declarations',
  schemaVersion: '1',
  snapshotDate: normalized.snapshotDate,
  sourcePages: normalized.sourcePages,
  records,
  unmatchedRows: normalized.unmatchedRows,
  coverage: {
    candidateCount: records.length,
    sourceLinkedCount,
    ambiguousCount,
    sourceUnavailableCount,
    declarationRowCount: normalized.rows.length,
    unmatchedRowCount: normalized.unmatchedRows.length,
    financialSummaryCount: financialSummaries.length,
    financialSummaryVerifiedCategoryCount: financialSummaries.reduce(
      (total, summary) => total + summary.verifiedCategoryCount,
      0,
    ),
    financialSummaryOfficialCategoryCount: financialSummaries.reduce(
      (total, summary) =>
        total +
        summary.categories.filter(
          (category) => category.verificationStatus === 'page-evidenced',
        ).length,
      0,
    ),
    financialSummaryCivilFallbackCategoryCount: financialSummaries.reduce(
      (total, summary) =>
        total +
        summary.categories.filter(
          (category) =>
            category.verificationStatus === 'civil-gazette-evidenced',
        ).length,
      0,
    ),
    financialSummaryMixedSourceCategoryCount: financialSummaries.reduce(
      (total, summary) =>
        total +
        summary.categories.filter(
          (category) =>
            category.verificationStatus === 'mixed-source-evidenced',
        ).length,
      0,
    ),
    financialSummarySourceConflictCount: financialSummaries.reduce(
      (total, summary) =>
        total +
        summary.categories.filter((category) => category.sourceConflict).length,
      0,
    ),
    financialSummaryPartialCount: financialSummaries.filter(
      (summary) => summary.summaryStatus === 'partially-verified',
    ).length,
    financialSummaryUnavailableCount: financialSummaries.filter(
      (summary) => summary.summaryStatus === 'unavailable',
    ).length,
  },
  note: 'This privacy-safe publication contains official CEC listing links plus conservative category-level financial totals or entry counts. Official values remain primary when reliably verified; individually unresolved fields may use the 2026 civil election gazette with explicit source attribution. It does not reproduce addresses, identity numbers, accounts, signatures, raw OCR, transcripts or itemized property details; an ambiguous or unavailable link is not evidence that no declaration or property exists.',
};
await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
await writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n');
console.log(
  'Published property declaration data for ' +
    records.length +
    ' candidates: ' +
    sourceLinkedCount +
    ' linked, ' +
    ambiguousCount +
    ' ambiguous, ' +
    sourceUnavailableCount +
    ' unavailable; ' +
    financialSummaries.length +
    ' financial summaries.',
);
