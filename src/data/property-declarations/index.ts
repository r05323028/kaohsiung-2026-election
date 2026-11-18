import publishedInput from '../../../data/published/2026/candidate-property-declarations.json';
import type {
  PropertyDeclarationPublicFinancialSummary,
  PropertyDeclarationPublicSource,
} from './public-copy';
import {
  type PropertyDeclarationCandidateRecord,
  type PropertyDeclarationDocument,
  type PropertyDeclarationFinancialCategorySummary,
  type PropertyDeclarationFinancialSummary,
  type PropertyDeclarationPublishedDataset,
  validatePropertyDeclarationDataset,
} from './schema';

const propertyDeclarationSnapshot: PropertyDeclarationPublishedDataset =
  validatePropertyDeclarationDataset(publishedInput);

export type PublicPropertyDeclarationDocument = Pick<
  PropertyDeclarationDocument,
  | 'listedName'
  | 'pdfFileName'
  | 'pdfUrl'
  | 'listingPageId'
  | 'listingPageUrl'
  | 'sourcePageId'
  | 'privacyNote'
>;

export type PublicPropertyDeclarationCategory = Pick<
  PropertyDeclarationFinancialCategorySummary,
  | 'category'
  | 'status'
  | 'totalTwd'
  | 'entryCount'
  | 'evidencePages'
  | 'fieldSources'
>;

export type PropertyDeclarationReadModel = Pick<
  PropertyDeclarationCandidateRecord,
  'candidateId' | 'displayName' | 'electionType' | 'districtId' | 'status'
> & {
  identity: PropertyDeclarationCandidateRecord['identity'];
  documents: PublicPropertyDeclarationDocument[];
  financialSummary: PropertyDeclarationPublicFinancialSummary | null;
};

function toPublicFinancialSummary(
  summary: PropertyDeclarationFinancialSummary | null,
): PropertyDeclarationPublicFinancialSummary | null {
  if (!summary) return null;
  return {
    summaryStatus: summary.summaryStatus,
    verifiedCategoryCount: summary.verifiedCategoryCount,
    categories: summary.categories.map((category) => ({
      category: category.category,
      status: category.status,
      totalTwd: category.totalTwd,
      entryCount: category.entryCount,
      evidencePages: category.evidencePages,
      fieldSources: category.fieldSources,
    })),
    sources: summary.sources satisfies PropertyDeclarationPublicSource,
    note: summary.note,
  };
}

function toPublicPropertyDeclaration(
  record: PropertyDeclarationCandidateRecord,
): PropertyDeclarationReadModel {
  return {
    candidateId: record.candidateId,
    displayName: record.displayName,
    electionType: record.electionType,
    districtId: record.districtId,
    status: record.status,
    identity: {
      status: record.identity.status,
      matchMethod: record.identity.matchMethod,
      listedNames: record.identity.listedNames,
      listingPageUrls: record.identity.listingPageUrls,
      note: record.identity.note,
    },
    documents: record.documents.map((document) => ({
      listedName: document.listedName,
      pdfFileName: document.pdfFileName,
      pdfUrl: document.pdfUrl,
      listingPageId: document.listingPageId,
      listingPageUrl: document.listingPageUrl,
      sourcePageId: document.sourcePageId,
      privacyNote: document.privacyNote,
    })),
    financialSummary: toPublicFinancialSummary(record.financialSummary),
  };
}

const recordsByCandidateId = new Map(
  propertyDeclarationSnapshot.records.map((record) => [
    record.candidateId,
    toPublicPropertyDeclaration(record),
  ]),
);

export function getCandidatePropertyDeclaration(
  candidateId: string,
): PropertyDeclarationReadModel | undefined {
  return recordsByCandidateId.get(candidateId);
}

export function propertyDeclarationCoverage(): {
  candidates: number;
  sourceLinked: number;
  ambiguous: number;
  sourceUnavailable: number;
  financialSummaries: number;
  verifiedCategories: number;
  officialCategories: number;
  civilFallbackCategories: number;
  mixedSourceCategories: number;
  sourceConflicts: number;
  partialSummaries: number;
  unavailableSummaries: number;
} {
  return {
    candidates: propertyDeclarationSnapshot.coverage.candidateCount,
    sourceLinked: propertyDeclarationSnapshot.coverage.sourceLinkedCount,
    ambiguous: propertyDeclarationSnapshot.coverage.ambiguousCount,
    sourceUnavailable:
      propertyDeclarationSnapshot.coverage.sourceUnavailableCount,
    financialSummaries:
      propertyDeclarationSnapshot.coverage.financialSummaryCount,
    verifiedCategories:
      propertyDeclarationSnapshot.coverage
        .financialSummaryVerifiedCategoryCount,
    officialCategories:
      propertyDeclarationSnapshot.coverage
        .financialSummaryOfficialCategoryCount,
    civilFallbackCategories:
      propertyDeclarationSnapshot.coverage
        .financialSummaryCivilFallbackCategoryCount,
    mixedSourceCategories:
      propertyDeclarationSnapshot.coverage
        .financialSummaryMixedSourceCategoryCount,
    sourceConflicts:
      propertyDeclarationSnapshot.coverage.financialSummarySourceConflictCount,
    partialSummaries:
      propertyDeclarationSnapshot.coverage.financialSummaryPartialCount,
    unavailableSummaries:
      propertyDeclarationSnapshot.coverage.financialSummaryUnavailableCount,
  };
}
