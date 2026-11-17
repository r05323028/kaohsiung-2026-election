import { describe, expect, it } from 'vitest';
import financialInput from '../../../data/normalized/2026/candidate-property-declaration-financial-summaries.json';
import normalizedInput from '../../../data/normalized/2026/candidate-property-declaration-sources.json';
import verificationInput from '../../../data/normalized/2026/candidate-property-declaration-verification.json';
import {
  PROPERTY_DECLARATION_FINANCIAL_CATEGORIES,
  PropertyDeclarationFinancialCategorySummarySchema,
  validatePropertyDeclarationFinancialSummaryDataset,
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
    ).toBe(684);
    expect(
      dataset.records.filter(
        (record) => record.summaryStatus === 'partially-verified',
      ),
    ).toHaveLength(96);
    expect(
      dataset.records.filter(
        (record) => record.summaryStatus === 'unavailable',
      ),
    ).toHaveLength(8);
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
        verificationStatus: 'independently-verified',
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
        verificationStatus: 'independently-verified',
        verificationMethod: 'dual-render-local-ocr-agreement',
      }),
    ).toThrow();
  });

  it('validates the privacy-safe two-pass verification manifest', () => {
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
    ).toBe(684);
    expect(verification.records[0]?.pdfSha256).toMatch(/^[a-f0-9]{64}$/);
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
