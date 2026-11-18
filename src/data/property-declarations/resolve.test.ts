import { describe, expect, it } from 'vitest';
import { resolvePropertyDeclarationFinancialSummary } from './resolve';
import {
  PROPERTY_DECLARATION_FINANCIAL_CATEGORIES,
  type PropertyDeclarationFinancialCategory,
  type PropertyDeclarationFinancialCategorySummary,
  type PropertyDeclarationFinancialSummary,
  type PropertyDeclarationGazetteCategory,
  type PropertyDeclarationGazetteRecord,
} from './schema';

type CategoryInput = Partial<PropertyDeclarationFinancialCategorySummary>;

function categorySummary(
  category: PropertyDeclarationFinancialCategory,
  input: CategoryInput = {},
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
    ...input,
  };
}

function officialSummary(
  inputs: Partial<Record<PropertyDeclarationFinancialCategory, CategoryInput>>,
): PropertyDeclarationFinancialSummary {
  const categories = PROPERTY_DECLARATION_FINANCIAL_CATEGORIES.map((category) =>
    categorySummary(category, inputs[category]),
  );
  return {
    summaryStatus: 'partially-verified',
    verifiedCategoryCount: categories.filter(
      (category) => category.verificationStatus !== 'not-determined',
    ).length,
    categories,
    sources: {
      official: {
        publisher: '中央選舉委員會',
        pdfFileName: '1234.pdf',
        url: 'https://pdps-dec.cec.gov.tw/release/formal/files/1234.pdf',
      },
      civil: null,
    },
    note: '官方摘要說明。',
  };
}

function gazetteCategory(
  category: PropertyDeclarationFinancialCategory,
  input: Partial<PropertyDeclarationGazetteCategory> = {},
): PropertyDeclarationGazetteCategory {
  return {
    category,
    status: 'not-determined',
    totalTwd: null,
    entryCount: null,
    totalBasis: null,
    valuedItemCount: 0,
    unvaluedItemCount: 0,
    ...input,
  };
}

function gazetteRecord(
  inputs: Partial<
    Record<
      PropertyDeclarationFinancialCategory,
      Partial<PropertyDeclarationGazetteCategory>
    >
  >,
): PropertyDeclarationGazetteRecord {
  return {
    candidateId: 'official-mayor-example-2026',
    displayName: '測試候選人',
    gazetteCandidateId: '00000000-0000-4000-8000-000000000001',
    gazetteName: '測試候選人',
    matchMethod: 'district+ballot-number',
    matchEvidence: {
      gazetteRegion: '高雄市',
      gazetteBallotNumber: 1,
      rosterDistrictId: 'district-kaohsiung-mayor-2026',
      rosterElectionType: 'mayoral',
      rosterCandidateNumber: '1',
    },
    nameExact: true,
    candidateUrl:
      'https://gazette2026.taiwangogo.tw/candidates/00000000-0000-4000-8000-000000000001/',
    propertyCardUrl:
      'https://gazette2026.taiwangogo.tw/candidates/00000000-0000-4000-8000-000000000001/cards/property/',
    retrievedAt: '2026-11-18',
    sourcePageSha256: 'a'.repeat(64),
    declarationDate: '2026-08-31',
    officialPdfFileName: null,
    officialPdfSha256: null,
    sourceDocumentSha256: null,
    categories: PROPERTY_DECLARATION_FINANCIAL_CATEGORIES.map((category) =>
      gazetteCategory(category, inputs[category]),
    ),
  };
}

describe('official-first, civil-fallback property resolution', () => {
  it('keeps a verified official value when the civil source agrees', () => {
    const summary = resolvePropertyDeclarationFinancialSummary(
      officialSummary({
        cash: {
          status: 'reported',
          totalTwd: 500_000,
          entryCount: 1,
          evidencePages: [7],
          fieldSources: { total: 'official-cec', entryCount: 'official-cec' },
          verificationStatus: 'page-evidenced',
          verificationMethod: 'dual-render-local-ocr-agreement',
        },
      }),
      gazetteRecord({
        cash: {
          status: 'reported',
          totalTwd: 500_000,
          entryCount: 1,
          totalBasis: 'declared-item-sum',
          valuedItemCount: 1,
          unvaluedItemCount: 0,
        },
      }),
    );
    const cash = summary?.categories.find((item) => item.category === 'cash');
    expect(cash).toMatchObject({
      status: 'reported',
      totalTwd: 500_000,
      entryCount: 1,
      sourceConflict: false,
      verificationStatus: 'page-evidenced',
      fieldSources: { total: 'official-cec', entryCount: 'official-cec' },
    });
    expect(summary?.sources.civil).toBeNull();
  });

  it('fills only the unresolved field and marks the category mixed-source', () => {
    const summary = resolvePropertyDeclarationFinancialSummary(
      officialSummary({
        'valuable-property': {
          status: 'reported',
          totalTwd: 750_000,
          entryCount: null,
          evidencePages: [15],
          fieldSources: { total: 'official-cec', entryCount: null },
          verificationStatus: 'page-evidenced',
          verificationMethod: 'dual-render-local-ocr-agreement',
        },
      }),
      gazetteRecord({
        'valuable-property': {
          status: 'reported',
          totalTwd: 750_000,
          entryCount: 3,
          totalBasis: 'declared-item-sum',
          valuedItemCount: 3,
          unvaluedItemCount: 0,
        },
      }),
    );
    expect(
      summary?.categories.find((item) => item.category === 'valuable-property'),
    ).toMatchObject({
      status: 'reported',
      totalTwd: 750_000,
      entryCount: 3,
      evidencePages: [15],
      sourceConflict: false,
      verificationStatus: 'mixed-source-evidenced',
      fieldSources: { total: 'official-cec', entryCount: 'civil-gazette' },
    });
    expect(summary?.sources.official?.pdfFileName).toBe('1234.pdf');
    expect(summary?.sources.civil?.attribution).toBe(
      '資料來源：台灣前進《2026 民間版選舉公報》',
    );
  });

  it('publishes a civil value without waiting for official OCR', () => {
    const summary = resolvePropertyDeclarationFinancialSummary(
      officialSummary({}),
      gazetteRecord({
        deposits: {
          status: 'reported',
          totalTwd: 2_500_000,
          entryCount: 4,
          totalBasis: 'declared-item-sum',
          valuedItemCount: 4,
          unvaluedItemCount: 0,
        },
      }),
    );
    expect(
      summary?.categories.find((item) => item.category === 'deposits'),
    ).toMatchObject({
      status: 'reported',
      totalTwd: 2_500_000,
      entryCount: 4,
      evidencePages: [],
      sourceConflict: false,
      verificationStatus: 'civil-gazette-evidenced',
      fieldSources: { total: 'civil-gazette', entryCount: 'civil-gazette' },
    });
  });

  it('retains a verified official value and records a civil disagreement', () => {
    const summary = resolvePropertyDeclarationFinancialSummary(
      officialSummary({
        deposits: {
          status: 'reported',
          totalTwd: 500_000,
          entryCount: 1,
          evidencePages: [8],
          fieldSources: { total: 'official-cec', entryCount: 'official-cec' },
          verificationStatus: 'page-evidenced',
          verificationMethod: 'dual-render-local-ocr-agreement',
        },
      }),
      gazetteRecord({
        deposits: {
          status: 'reported',
          totalTwd: 800_000,
          entryCount: 2,
          totalBasis: 'declared-item-sum',
          valuedItemCount: 2,
          unvaluedItemCount: 0,
        },
      }),
    );
    expect(
      summary?.categories.find((item) => item.category === 'deposits'),
    ).toMatchObject({
      totalTwd: 500_000,
      entryCount: 1,
      sourceConflict: true,
      verificationStatus: 'page-evidenced',
      fieldSources: { total: 'official-cec', entryCount: 'official-cec' },
    });
    expect(summary?.sources.civil).not.toBeNull();
  });

  it('does not turn an official explicit zero into a civil value', () => {
    const summary = resolvePropertyDeclarationFinancialSummary(
      officialSummary({
        land: {
          status: 'none-reported',
          totalTwd: 0,
          entryCount: 0,
          evidencePages: [3],
          fieldSources: { total: 'official-cec', entryCount: 'official-cec' },
          verificationStatus: 'page-evidenced',
          verificationMethod: 'dual-render-local-ocr-agreement',
        },
      }),
      gazetteRecord({
        land: {
          status: 'reported',
          totalTwd: 1_000_000,
          entryCount: 2,
          totalBasis: 'declared-item-sum',
          valuedItemCount: 2,
          unvaluedItemCount: 0,
        },
      }),
    );
    expect(
      summary?.categories.find((item) => item.category === 'land'),
    ).toMatchObject({
      status: 'none-reported',
      totalTwd: 0,
      entryCount: 0,
      sourceConflict: true,
      fieldSources: { total: 'official-cec', entryCount: 'official-cec' },
    });
  });

  it('keeps unresolved fields unknown instead of publishing zero', () => {
    const summary = resolvePropertyDeclarationFinancialSummary(
      officialSummary({}),
      gazetteRecord({}),
    );
    expect(
      summary?.categories.every(
        (category) =>
          category.status === 'not-determined' &&
          category.totalTwd === null &&
          category.entryCount === null &&
          category.evidencePages.length === 0 &&
          category.fieldSources.total === null &&
          category.fieldSources.entryCount === null,
      ),
    ).toBe(true);
  });

  it('builds a civil-only summary when the official identity is unusable', () => {
    const summary = resolvePropertyDeclarationFinancialSummary(
      null,
      gazetteRecord({
        building: {
          status: 'reported',
          entryCount: 7,
          totalBasis: 'count-only-amounts-withheld',
          valuedItemCount: 7,
          unvaluedItemCount: 0,
        },
      }),
    );
    expect(summary?.sources.official).toBeNull();
    expect(summary?.sources.civil?.url).toBe(
      'https://gazette2026.taiwangogo.tw/candidates/00000000-0000-4000-8000-000000000001/cards/property/',
    );
    expect(
      summary?.categories.find((item) => item.category === 'building'),
    ).toMatchObject({
      status: 'reported',
      totalTwd: null,
      entryCount: 7,
      evidencePages: [],
      verificationStatus: 'civil-gazette-evidenced',
    });
    expect(
      summary?.categories.find((item) => item.category === 'cash'),
    ).toMatchObject({
      status: 'not-determined',
      totalTwd: null,
      entryCount: null,
    });
  });
});
