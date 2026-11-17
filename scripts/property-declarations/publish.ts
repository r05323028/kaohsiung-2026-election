import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import rosterInput from '../../data/approved/2026/kaohsiung-election.json';
import normalizedInput from '../../data/normalized/2026/candidate-property-declaration-sources.json';
import {
  type PropertyDeclarationCandidateRecord,
  type PropertyDeclarationDocument,
  type PropertyDeclarationNormalizedRow,
  validatePropertyDeclarationNormalizedDataset,
} from '../../src/data/property-declarations/schema';

const OUTPUT_PATH = path.join(
  process.cwd(),
  'data/published/2026/candidate-property-declarations.json',
);
const PRIVACY_NOTE =
  'PDF bytes are not retained; this record exposes only the official URL, listing-page source and source-reconciliation status. Sensitive fields such as addresses, identity numbers, accounts, amounts and individual property details are intentionally not reproduced.';
const normalized =
  validatePropertyDeclarationNormalizedDataset(normalizedInput);
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
      };
    }
    if (rows.length > 1 || rows.some((row) => row.matchStatus !== 'matched')) {
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
          note: 'Multiple or otherwise ambiguous official listing rows remain unassigned to this candidate. No individual PDF link is published until the source identity is unique.',
        },
        documents: [],
      };
    }
    const row = rows[0];
    if (!row) throw new Error('Expected one source row for ' + candidate.id);
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
        note: 'The official listing name was reconciled to the canonical candidate by name, district and election type. The linked PDF itself is not retained or transcribed.',
      },
      documents: [documentFromRow(row)],
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
  },
  note: 'This privacy-safe publication contains only official CEC property-declaration listing links and conservative source-reconciliation states for the canonical 2026 Kaohsiung candidate roster. It does not reproduce addresses, identity numbers, accounts, amounts or individual property details; an ambiguous or unavailable link is not evidence that no declaration or property exists.',
};
await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
await writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n');
console.log(
  'Published property declaration links for ' +
    records.length +
    ' candidates: ' +
    sourceLinkedCount +
    ' linked, ' +
    ambiguousCount +
    ' ambiguous, ' +
    sourceUnavailableCount +
    ' unavailable.',
);
