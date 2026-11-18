import type {
  PropertyDeclarationFinancialCategory,
  PropertyDeclarationFinancialCategorySummary,
  PropertyDeclarationFinancialSummary,
  PropertyDeclarationFinancialSummarySources,
  PropertyDeclarationFinancialSummaryStatus,
  PropertyDeclarationFinancialVerificationStatus,
  PropertyDeclarationGazetteRecord,
} from './schema';
import {
  PROPERTY_DECLARATION_FINANCIAL_CATEGORIES,
  PROPERTY_DECLARATION_GAZETTE_ATTRIBUTION,
  PROPERTY_DECLARATION_GAZETTE_LICENSE,
} from './schema';

const CIVIL_FALLBACK_NOTE =
  '官方欄位優先；無法自官方文件安全確定的個別欄位，使用 2026 民間版選舉公報備援資料並標示來源。衝突不會覆寫已確認的官方值。';

function amountsDiffer(official: number, civil: number): boolean {
  return Math.abs(official - civil) > 1;
}

function verificationStatusForSources(
  totalSource: PropertyDeclarationFinancialCategorySummary['fieldSources']['total'],
  countSource: PropertyDeclarationFinancialCategorySummary['fieldSources']['entryCount'],
): PropertyDeclarationFinancialVerificationStatus {
  const usesOfficial =
    totalSource === 'official-cec' || countSource === 'official-cec';
  const usesCivil =
    totalSource === 'civil-gazette' || countSource === 'civil-gazette';
  if (usesOfficial && usesCivil) return 'mixed-source-evidenced';
  if (usesCivil) return 'civil-gazette-evidenced';
  return 'page-evidenced';
}

function summaryStatusForCategories(
  categories: PropertyDeclarationFinancialCategorySummary[],
): PropertyDeclarationFinancialSummaryStatus {
  const resolved = categories.filter(
    (category) => category.verificationStatus !== 'not-determined',
  ).length;
  const officialOnly = categories.filter(
    (category) => category.verificationStatus === 'page-evidenced',
  ).length;
  const civilOnly = categories.filter(
    (category) => category.verificationStatus === 'civil-gazette-evidenced',
  ).length;
  const mixed = categories.filter(
    (category) => category.verificationStatus === 'mixed-source-evidenced',
  ).length;
  if (resolved === 0) return 'unavailable';
  if (resolved < categories.length) return 'partially-verified';
  if (civilOnly === 0 && mixed === 0) return 'page-evidenced';
  if (officialOnly === 0 && mixed === 0) return 'civil-gazette-verified';
  return 'mixed-source-verified';
}

function civilSource(
  gazette: PropertyDeclarationGazetteRecord,
): NonNullable<PropertyDeclarationFinancialSummarySources['civil']> {
  return {
    publisher: '台灣前進',
    url: gazette.propertyCardUrl,
    retrievedAt: gazette.retrievedAt,
    attribution: PROPERTY_DECLARATION_GAZETTE_ATTRIBUTION,
    license: PROPERTY_DECLARATION_GAZETTE_LICENSE,
  };
}

function emptyCategory(
  category: PropertyDeclarationFinancialCategory,
): PropertyDeclarationFinancialCategorySummary {
  return {
    category,
    status: 'not-determined',
    totalTwd: null,
    entryCount: null,
    evidencePages: [],
    fieldSources: { total: null, entryCount: null },
    sourceConflict: false,
    verificationStatus: 'not-determined',
    verificationMethod: null,
  };
}

function fromGazetteCategory(
  category: PropertyDeclarationFinancialCategory,
  gazette: PropertyDeclarationGazetteRecord,
): PropertyDeclarationFinancialCategorySummary {
  const source = gazette.categories.find((item) => item.category === category);
  if (!source || source.status === 'not-determined') {
    return emptyCategory(category);
  }
  return {
    category,
    status: 'reported',
    totalTwd: source.totalTwd,
    entryCount: source.entryCount,
    evidencePages: [],
    fieldSources: {
      total: source.totalTwd === null ? null : 'civil-gazette',
      entryCount: source.entryCount === null ? null : 'civil-gazette',
    },
    sourceConflict: false,
    verificationStatus: 'civil-gazette-evidenced',
    verificationMethod: 'civil-gazette-structured-source-resolution',
  };
}

function mergeCategory(
  official: PropertyDeclarationFinancialCategorySummary,
  gazette: PropertyDeclarationGazetteRecord | null,
): PropertyDeclarationFinancialCategorySummary {
  const source = gazette?.categories.find(
    (item) => item.category === official.category,
  );
  let totalTwd = official.totalTwd;
  let entryCount = official.entryCount;
  let totalSource = official.fieldSources.total;
  let countSource = official.fieldSources.entryCount;
  let sourceConflict = official.sourceConflict;

  if (source?.status === 'reported') {
    if (official.status === 'none-reported') {
      if (source.totalTwd !== null && source.totalTwd > 0) {
        sourceConflict = true;
      }
      if (source.entryCount !== null && source.entryCount > 0) {
        sourceConflict = true;
      }
    } else {
      if (source.totalTwd !== null) {
        if (totalTwd === null) {
          totalTwd = source.totalTwd;
          totalSource = 'civil-gazette';
        } else if (amountsDiffer(totalTwd, source.totalTwd)) {
          sourceConflict = true;
        }
      }
      if (source.entryCount !== null) {
        if (entryCount === null) {
          entryCount = source.entryCount;
          countSource = 'civil-gazette';
        } else if (entryCount !== source.entryCount) {
          sourceConflict = true;
        }
      }
    }
  }

  const status =
    official.status === 'not-determined' &&
    (totalTwd !== null || entryCount !== null)
      ? 'reported'
      : official.status;

  if (status === 'not-determined') {
    return emptyCategory(official.category);
  }

  const verificationStatus = verificationStatusForSources(
    totalSource,
    countSource,
  );
  const verificationMethod =
    verificationStatus === 'civil-gazette-evidenced'
      ? 'civil-gazette-structured-source-resolution'
      : verificationStatus === 'mixed-source-evidenced'
        ? 'mixed-official-and-civil-source-resolution'
        : official.verificationMethod;

  return {
    category: official.category,
    status,
    totalTwd,
    entryCount,
    evidencePages: official.evidencePages,
    fieldSources: { total: totalSource, entryCount: countSource },
    sourceConflict,
    verificationStatus,
    verificationMethod,
  };
}

export function resolvePropertyDeclarationFinancialSummary(
  official: PropertyDeclarationFinancialSummary | null,
  gazette: PropertyDeclarationGazetteRecord | null,
): PropertyDeclarationFinancialSummary | null {
  if (!official && !gazette) return null;

  if (!official) {
    if (!gazette) return null;
    const categories = PROPERTY_DECLARATION_FINANCIAL_CATEGORIES.map(
      (category) => fromGazetteCategory(category, gazette),
    );
    return {
      summaryStatus: summaryStatusForCategories(categories),
      verifiedCategoryCount: categories.filter(
        (category) => category.verificationStatus !== 'not-determined',
      ).length,
      categories,
      sources: { official: null, civil: civilSource(gazette) },
      note: CIVIL_FALLBACK_NOTE,
    };
  }

  const categories = official.categories.map((category) =>
    mergeCategory(category, gazette),
  );
  const usesCivil = categories.some(
    (category) =>
      category.fieldSources.total === 'civil-gazette' ||
      category.fieldSources.entryCount === 'civil-gazette' ||
      category.sourceConflict,
  );
  return {
    summaryStatus: summaryStatusForCategories(categories),
    verifiedCategoryCount: categories.filter(
      (category) => category.verificationStatus !== 'not-determined',
    ).length,
    categories,
    sources: {
      official: official.sources.official,
      civil: usesCivil && gazette ? civilSource(gazette) : null,
    },
    note: usesCivil ? official.note + ' ' + CIVIL_FALLBACK_NOTE : official.note,
  };
}
