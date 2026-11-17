import publishedInput from '../../../data/published/2026/candidate-property-declarations.json';
import {
  type PropertyDeclarationCandidateRecord,
  type PropertyDeclarationDocument,
  type PropertyDeclarationFinancialCategory,
  type PropertyDeclarationFinancialCategorySummary,
  type PropertyDeclarationFinancialSummary,
  type PropertyDeclarationPublishedDataset,
  validatePropertyDeclarationDataset,
} from './schema';

const propertyDeclarationSnapshot: PropertyDeclarationPublishedDataset =
  validatePropertyDeclarationDataset(publishedInput);

type PublicPropertyDeclarationCategorySummary = Omit<
  PropertyDeclarationFinancialCategorySummary,
  'verificationStatus' | 'verificationMethod'
>;

export type PropertyDeclarationPublicFinancialSummary = Omit<
  PropertyDeclarationFinancialSummary,
  'categories'
> & {
  categories: PublicPropertyDeclarationCategorySummary[];
};

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

export const PROPERTY_DECLARATION_PUBLIC_NOTE =
  '本頁僅呈現中選會財產申報公開查閱平台的官方文件連結、來源對帳狀態與經雙重離線擷取交叉核對的類別摘要；不轉錄地址、身分證字號、金融帳戶、簽名或個別財產標的。';

export const PROPERTY_DECLARATION_FINANCIAL_NOTE =
  '類別摘要只保留兩次離線擷取結果一致、且有官方文件頁碼證據的總額或申報筆數；衝突、辨識不足或無法安全確定的欄位維持「未能確定」，不以空白推論為零。';

export const PROPERTY_DECLARATION_FINANCIAL_CATEGORY_LABELS: Record<
  PropertyDeclarationFinancialCategory,
  string
> = {
  land: '土地',
  building: '建物',
  ship: '船舶',
  vehicles: '汽車及其他交通工具',
  aircraft: '航空器',
  cash: '現金',
  deposits: '存款',
  securities: '有價證券',
  'valuable-property': '具有相當價值之財產',
  insurance: '保險',
  'virtual-assets': '虛擬資產',
  claims: '債權',
  debts: '債務',
  'business-investment': '事業投資',
};

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
