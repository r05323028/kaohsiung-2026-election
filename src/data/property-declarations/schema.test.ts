import { describe, expect, it } from 'vitest';
import financialInput from '../../../data/normalized/2026/candidate-property-declaration-financial-summaries.json';
import gazetteInput from '../../../data/normalized/2026/candidate-property-declaration-gazette.json';
import normalizedInput from '../../../data/normalized/2026/candidate-property-declaration-sources.json';
import verificationInput from '../../../data/normalized/2026/candidate-property-declaration-verification.json';
import {
  PROPERTY_DECLARATION_FINANCIAL_CATEGORIES,
  PROPERTY_DECLARATION_GAZETTE_ATTRIBUTION,
  PropertyDeclarationFinancialCategorySummarySchema,
  PropertyDeclarationGazetteCategorySchema,
  validatePropertyDeclarationFinancialSummaryDataset,
  validatePropertyDeclarationGazetteDataset,
  validatePropertyDeclarationNormalizedDataset,
  validatePropertyDeclarationVerificationDataset,
} from './schema';

describe('property declaration normalized schema', () => {
  it('validates the deterministic official source map', () => {
    const dataset =
      validatePropertyDeclarationNormalizedDataset(normalizedInput);
    expect(dataset.sourcePages).toHaveLength(20);
    expect(dataset.rows).toHaveLength(107);
    expect(dataset.unmatchedRows).toEqual([]);
  });

  it('keeps unmatched rows representable without inventing an identity', () => {
    const dataset =
      validatePropertyDeclarationNormalizedDataset(normalizedInput);
    const first = dataset.rows[0];
    expect(first).toBeDefined();
    if (!first) return;

    const unresolved = {
      ...first,
      candidateId: null,
      matchStatus: 'unmatched' as const,
      matchMethod: null,
    };
    const validated = validatePropertyDeclarationNormalizedDataset({
      ...dataset,
      rows: [unresolved, ...dataset.rows.slice(1)],
      unmatchedRows: [first.rowId],
    });
    expect(validated.rows[0]?.candidateId).toBeNull();
    expect(validated.rows[0]?.matchStatus).toBe('unmatched');
  });
});

describe('property declaration financial summary schema', () => {
  it('validates all 105 sanitized source-linked summaries', () => {
    const dataset =
      validatePropertyDeclarationFinancialSummaryDataset(financialInput);
    expect(dataset.records).toHaveLength(105);
    expect(
      dataset.records.every(
        (record) =>
          record.categories.length ===
          PROPERTY_DECLARATION_FINANCIAL_CATEGORIES.length,
      ),
    ).toBe(true);
    expect(
      dataset.records.reduce(
        (total, record) => total + record.verifiedCategoryCount,
        0,
      ),
    ).toBe(764);
    expect(
      dataset.records.filter(
        (record) => record.summaryStatus === 'partially-verified',
      ),
    ).toHaveLength(100);
    expect(
      dataset.records.filter(
        (record) => record.summaryStatus === 'unavailable',
      ),
    ).toHaveLength(0);
  });

  it('does not allow not-determined values or page evidence', () => {
    expect(() =>
      PropertyDeclarationFinancialCategorySummarySchema.parse({
        category: 'land',
        status: 'not-determined',
        totalTwd: null,
        entryCount: null,
        evidencePages: [3],
        verificationStatus: 'not-determined',
        verificationMethod: null,
      }),
    ).toThrow();
  });

  it('rejects a reported category with a positive total and zero entries', () => {
    expect(() =>
      PropertyDeclarationFinancialCategorySummarySchema.parse({
        category: 'securities',
        status: 'reported',
        totalTwd: 110000,
        entryCount: 0,
        evidencePages: [7],
        verificationStatus: 'page-evidenced',
        verificationMethod: 'dual-render-local-ocr-agreement',
      }),
    ).toThrow();
  });

  it('rejects a none-reported category with a positive total', () => {
    expect(() =>
      PropertyDeclarationFinancialCategorySummarySchema.parse({
        category: 'land',
        status: 'none-reported',
        totalTwd: 110000,
        entryCount: 0,
        evidencePages: [3],
        verificationStatus: 'page-evidenced',
        verificationMethod: 'dual-render-local-ocr-agreement',
      }),
    ).toThrow();
  });

  it('validates the privacy-safe page-evidence verification manifest', () => {
    const verification =
      validatePropertyDeclarationVerificationDataset(verificationInput);
    expect(verification.records).toHaveLength(105);
    expect(
      verification.records.reduce(
        (total, record) =>
          total +
          record.categoryAgreements.filter(
            (agreement) => agreement.outcome === 'agree',
          ).length,
        0,
      ),
    ).toBe(764);
    expect(verification.records[0]?.pdfSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('accepts the visual page-review method for recovered categories', () => {
    const dataset =
      validatePropertyDeclarationFinancialSummaryDataset(financialInput);
    const recovered = dataset.records.find(
      (record) =>
        record.candidateId ===
        'official-candidate-2026-district-kaohsiung-council-01-fb74ce74',
    );
    expect(
      recovered?.categories.every(
        (category) =>
          category.verificationMethod ===
            'visual-page-review-with-gazette-cross-check' ||
          category.verificationMethod === null,
      ),
    ).toBe(true);
  });

  it('allows explicit zero values without turning unknowns into zero', () => {
    const dataset =
      validatePropertyDeclarationFinancialSummaryDataset(financialInput);
    const noneReported = dataset.records
      .flatMap((record) => record.categories)
      .find((category) => category.status === 'none-reported');
    expect(noneReported).toBeDefined();
    expect(noneReported?.totalTwd === 0 || noneReported?.entryCount === 0).toBe(
      true,
    );
  });
});

describe('civil gazette property declaration schema', () => {
  it('validates the declared-amount gazette snapshot', () => {
    const dataset = validatePropertyDeclarationGazetteDataset(gazetteInput);
    expect(dataset.records).toHaveLength(106);
    expect(dataset.source.attribution).toBe(
      PROPERTY_DECLARATION_GAZETTE_ATTRIBUTION,
    );
    expect(
      dataset.records.every(
        (record) =>
          record.categories.length ===
          PROPERTY_DECLARATION_FINANCIAL_CATEGORIES.length,
      ),
    ).toBe(true);
    expect(
      dataset.records.reduce(
        (total, record) =>
          total +
          record.categories.filter((category) => category.status === 'reported')
            .length,
        0,
      ),
    ).toBe(599);
    expect(
      dataset.records.reduce(
        (total, record) =>
          total +
          record.categories.filter((category) => category.totalTwd !== null)
            .length,
        0,
      ),
    ).toBe(205);
  });

  it('keeps gazette identities unique and independent of display names', () => {
    const dataset = validatePropertyDeclarationGazetteDataset(gazetteInput);
    expect(
      new Set(dataset.records.map((record) => record.candidateId)).size,
    ).toBe(106);
    expect(
      new Set(dataset.records.map((record) => record.gazetteCandidateId)).size,
    ).toBe(106);
    expect(
      dataset.records.every(
        (record) =>
          record.matchMethod === 'district+ballot-number' &&
          String(record.matchEvidence.gazetteBallotNumber) ===
            record.matchEvidence.rosterCandidateNumber,
      ),
    ).toBe(true);
    const hong = dataset.records.find(
      (record) =>
        record.candidateId ===
        'official-candidate-2026-district-kaohsiung-indigenous-mountain-14-c9a9596c',
    );
    expect(hong?.displayName).toBe('洪英雄');
    expect(hong?.officialPdfFileName).toBeNull();
    expect(hong?.officialPdfSha256).toBeNull();
  });

  it('rejects a reported gazette category without a positive entry count', () => {
    expect(() =>
      PropertyDeclarationGazetteCategorySchema.parse({
        category: 'land',
        status: 'reported',
        totalTwd: null,
        entryCount: 0,
        totalBasis: 'count-only-amounts-withheld',
        valuedItemCount: 0,
        unvaluedItemCount: 0,
      }),
    ).toThrow();
  });

  it('rejects an inferred total when the gazette withholds amounts', () => {
    expect(() =>
      PropertyDeclarationGazetteCategorySchema.parse({
        category: 'building',
        status: 'reported',
        totalTwd: 1_800_000,
        entryCount: 2,
        totalBasis: 'count-only-amounts-withheld',
        valuedItemCount: 2,
        unvaluedItemCount: 0,
      }),
    ).toThrow();
  });

  it('accepts a declared total only when every item is valued', () => {
    expect(() =>
      PropertyDeclarationGazetteCategorySchema.parse({
        category: 'deposits',
        status: 'reported',
        totalTwd: 2_000_000,
        entryCount: 2,
        totalBasis: 'declared-item-sum',
        valuedItemCount: 1,
        unvaluedItemCount: 1,
      }),
    ).toThrow();
  });
});
