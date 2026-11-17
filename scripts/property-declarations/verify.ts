import financialInput from '../../data/normalized/2026/candidate-property-declaration-financial-summaries.json';
import verificationInput from '../../data/normalized/2026/candidate-property-declaration-verification.json';
import {
  validatePropertyDeclarationFinancialSummaryDataset,
  validatePropertyDeclarationVerificationDataset,
} from '../../src/data/property-declarations/schema';
import { assertPropertyDeclarationFinancialEvidence } from '../../src/data/property-declarations/verification';

const verification =
  validatePropertyDeclarationVerificationDataset(verificationInput);
const financial =
  validatePropertyDeclarationFinancialSummaryDataset(financialInput);
assertPropertyDeclarationFinancialEvidence(verification, financial);

const agreementCount = verification.records.reduce(
  (total, record) =>
    total +
    record.categoryAgreements.filter((item) => item.outcome === 'agree').length,
  0,
);
console.log(
  '[property-declarations:verify] ' +
    verification.records.length +
    ' source PDFs, ' +
    agreementCount +
    ' category agreements, PDF hashes and page bounds verified.',
);
