import type {
  PropertyDeclarationFinancialSummaryDataset,
  PropertyDeclarationVerificationDataset,
} from './schema';

export function assertPropertyDeclarationFinancialEvidence(
  verification: PropertyDeclarationVerificationDataset,
  financial: PropertyDeclarationFinancialSummaryDataset,
): void {
  if (verification.records.length !== financial.records.length) {
    throw new Error(
      'Verification manifest and financial summary record counts differ.',
    );
  }

  const verificationByCandidate = new Map(
    verification.records.map((record) => [record.candidateId, record]),
  );
  for (const financialRecord of financial.records) {
    const verificationRecord = verificationByCandidate.get(
      financialRecord.candidateId,
    );
    if (!verificationRecord) {
      throw new Error(
        'Missing verification manifest record for ' +
          financialRecord.candidateId,
      );
    }
    if (
      verificationRecord.pdfFileName !== financialRecord.pdfFileName ||
      verificationRecord.pdfUrl !== financialRecord.pdfUrl ||
      verificationRecord.physicalPageCount !== financialRecord.physicalPageCount
    ) {
      throw new Error(
        'Verification source metadata drifted for ' +
          financialRecord.candidateId,
      );
    }

    const agreementByCategory = new Map(
      verificationRecord.categoryAgreements.map((agreement) => [
        agreement.category,
        agreement,
      ]),
    );
    for (const category of financialRecord.categories) {
      const agreement = agreementByCategory.get(category.category);
      if (!agreement) {
        throw new Error(
          'Missing verification agreement for ' +
            financialRecord.candidateId +
            '/' +
            category.category,
        );
      }
      const expectedOutcome =
        category.verificationStatus === 'page-evidenced'
          ? 'agree'
          : 'not-determined';
      if (
        agreement.outcome !== expectedOutcome ||
        agreement.status !== category.status ||
        agreement.totalTwd !== category.totalTwd ||
        agreement.entryCount !== category.entryCount ||
        agreement.fieldSources.total !== category.fieldSources.total ||
        agreement.fieldSources.entryCount !==
          category.fieldSources.entryCount ||
        agreement.sourceConflict !== category.sourceConflict ||
        JSON.stringify(agreement.evidencePages) !==
          JSON.stringify(category.evidencePages)
      ) {
        throw new Error(
          'Verification agreement values drifted for ' +
            financialRecord.candidateId +
            '/' +
            category.category,
        );
      }
    }
  }

  if (verificationByCandidate.size !== financial.records.length) {
    throw new Error('Verification manifest contains duplicate or extra IDs.');
  }
}
