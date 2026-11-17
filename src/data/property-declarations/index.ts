import publishedInput from '../../../data/published/2026/candidate-property-declarations.json';
import type { PropertyDeclarationPublicFinancialSummary } from './public-copy';
import {
  type PropertyDeclarationCandidateRecord,
  type PropertyDeclarationDocument,
  type PropertyDeclarationFinancialSummary,
  type PropertyDeclarationPublishedDataset,
  validatePropertyDeclarationDataset,
} from './schema';

const propertyDeclarationSnapshot: PropertyDeclarationPublishedDataset =
  validatePropertyDeclarationDataset(publishedInput);

type PublicPropertyDeclarationDocument = Pick<
  PropertyDeclarationDocument,
  | 'listedName'
  | 'pdfFileName'
  | 'pdfUrl'
  | 'listingPageId'
  | 'listingPageUrl'
  | 'sourcePageId'
  | 'privacyNote'
>;

export type PropertyDeclarationReadModel = Omit<
  PropertyDeclarationCandidateRecord,
  'documents' | 'financialSummary'
> & {
  documents: PublicPropertyDeclarationDocument[];
  financialSummary: PropertyDeclarationPublicFinancialSummary | null;
};

function toPublicFinancialSummary(
  summary: PropertyDeclarationFinancialSummary | null,
): PropertyDeclarationPublicFinancialSummary | null {
  if (!summary) return null;
  return {
    ...summary,
    categories: summary.categories.map(
      ({
        verificationStatus: _verificationStatus,
        verificationMethod: _verificationMethod,
        ...category
      }) => category,
    ),
  };
}

function toPublicPropertyDeclaration(
  record: PropertyDeclarationCandidateRecord,
): PropertyDeclarationReadModel {
  return {
    ...record,
    documents: record.documents.map(
      ({ retention: _retention, pdfSha256: _pdfSha256, ...document }) =>
        document,
    ),
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
    partialSummaries:
      propertyDeclarationSnapshot.coverage.financialSummaryPartialCount,
    unavailableSummaries:
      propertyDeclarationSnapshot.coverage.financialSummaryUnavailableCount,
  };
}
