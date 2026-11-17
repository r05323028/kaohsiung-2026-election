import { describe, expect, it } from 'vitest';
import financialInput from '../../../data/normalized/2026/candidate-property-declaration-financial-summaries.json';
import verificationInput from '../../../data/normalized/2026/candidate-property-declaration-verification.json';
import {
  validatePropertyDeclarationFinancialSummaryDataset,
  validatePropertyDeclarationVerificationDataset,
} from './schema';
import { assertPropertyDeclarationFinancialEvidence } from './verification';

const candidateId =
  'official-candidate-2026-district-kaohsiung-council-06-b48fe8fe';

function loadDatasets() {
  return {
    financial:
      validatePropertyDeclarationFinancialSummaryDataset(financialInput),
    verification:
      validatePropertyDeclarationVerificationDataset(verificationInput),
  };
}

function findCategory(
  financial: ReturnType<
    typeof validatePropertyDeclarationFinancialSummaryDataset
  >,
) {
  const record = financial.records.find(
    (candidate) => candidate.candidateId === candidateId,
  );
  const category = record?.categories.find(
    (item) => item.category === 'securities',
  );
  if (!category) throw new Error('Expected securities category fixture.');
  return category;
}

describe('property declaration verification parity', () => {
  it('accepts the committed financial and verification datasets', () => {
    const { financial, verification } = loadDatasets();
    expect(() =>
      assertPropertyDeclarationFinancialEvidence(verification, financial),
    ).not.toThrow();
  });

  it('rejects a total that no longer matches the verification agreement', () => {
    const { financial, verification } = loadDatasets();
    const category = findCategory(financial);
    category.totalTwd = (category.totalTwd ?? 0) + 1;
    expect(() =>
      assertPropertyDeclarationFinancialEvidence(verification, financial),
    ).toThrow('Verification agreement values drifted');
  });

  it('rejects an entry count that no longer matches the verification agreement', () => {
    const { financial, verification } = loadDatasets();
    const category = findCategory(financial);
    category.entryCount = (category.entryCount ?? 0) + 1;
    expect(() =>
      assertPropertyDeclarationFinancialEvidence(verification, financial),
    ).toThrow('Verification agreement values drifted');
  });

  it('rejects evidence pages that no longer match the verification agreement', () => {
    const { financial, verification } = loadDatasets();
    const category = findCategory(financial);
    category.evidencePages = [99];
    expect(() =>
      assertPropertyDeclarationFinancialEvidence(verification, financial),
    ).toThrow('Verification agreement values drifted');
  });
});
