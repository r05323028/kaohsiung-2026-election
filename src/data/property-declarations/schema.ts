import { z } from 'zod';

export const PROPERTY_DECLARATIONS_NORMALIZED_DATASET_ID =
  'kaohsiung-2026-candidate-property-declarations-sources';
export const PROPERTY_DECLARATIONS_FINANCIAL_SUMMARIES_DATASET_ID =
  'kaohsiung-2026-candidate-property-declaration-financial-summaries';
export const PROPERTY_DECLARATIONS_VERIFICATION_DATASET_ID =
  'kaohsiung-2026-candidate-property-declaration-verification';
export const PROPERTY_DECLARATIONS_PUBLISHED_DATASET_ID =
  'kaohsiung-2026-candidate-property-declarations';
export const PROPERTY_DECLARATIONS_SCHEMA_VERSION = '1';
export const PROPERTY_DECLARATIONS_SNAPSHOT_DATE = '2026-11-17';

const DateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const IsoTimestampSchema = z.iso.datetime({ offset: true });
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const OfficialPdfUrlSchema = z
  .url()
  .refine(
    (value) =>
      value.startsWith('https://pdps-dec.cec.gov.tw/release/formal/files/') &&
      value.endsWith('.pdf'),
    {
      message: 'Property declaration URLs must be official CEC PDF URLs.',
    },
  );

export const PropertyDeclarationElectionTypeSchema = z.enum([
  'mayoral',
  'city-council',
  'indigenous-council',
]);
export type PropertyDeclarationElectionType = z.infer<
  typeof PropertyDeclarationElectionTypeSchema
>;

export const PropertyDeclarationStatusSchema = z.enum([
  'source-linked',
  'ambiguous-source',
  'source-unavailable',
]);
export type PropertyDeclarationStatus = z.infer<
  typeof PropertyDeclarationStatusSchema
>;

export const PropertyDeclarationMatchMethodSchema = z.enum([
  'display-name-district-election-type',
  'cec-directory-name-district-election-type',
]);
export type PropertyDeclarationMatchMethod = z.infer<
  typeof PropertyDeclarationMatchMethodSchema
>;

export const PropertyDeclarationSourcePageSchema = z
  .object({
    id: z.string().min(1),
    url: z.url(),
    snapshotFile: z.string().min(1),
    retrievalDate: IsoTimestampSchema,
    sha256: Sha256Schema,
  })
  .strict();

export const PropertyDeclarationDocumentSchema = z
  .object({
    listedName: z.string().min(1),
    pdfFileName: z.string().regex(/^\d+\.pdf$/),
    pdfUrl: OfficialPdfUrlSchema,
    listingPageId: z.string().min(1),
    listingPageUrl: z.url(),
    sourcePageId: z.string().min(1),
    retention: z.literal('url-only'),
    pdfSha256: z.null(),
    privacyNote: z.string().min(1),
  })
  .strict();

export const PropertyDeclarationNormalizedRowSchema = z
  .object({
    rowId: z.string().regex(/^pdps-row-\d+$/),
    listedName: z.string().min(1),
    pdfFileName: z.string().regex(/^\d+\.pdf$/),
    pdfUrl: OfficialPdfUrlSchema,
    listingPageId: z.string().min(1),
    listingPageUrl: z.url(),
    sourcePageId: z.string().min(1),
    districtPageNumber: z.number().int().positive().nullable(),
    candidateId: z.string().min(1).nullable(),
    matchStatus: z.enum(['matched', 'ambiguous', 'unmatched']),
    matchMethod: PropertyDeclarationMatchMethodSchema.nullable(),
  })
  .strict();

export const PropertyDeclarationNormalizedDatasetSchema = z
  .object({
    datasetId: z.literal(PROPERTY_DECLARATIONS_NORMALIZED_DATASET_ID),
    schemaVersion: z.literal(PROPERTY_DECLARATIONS_SCHEMA_VERSION),
    snapshotDate: DateOnlySchema,
    sourcePages: z.array(PropertyDeclarationSourcePageSchema).min(1),
    rows: z.array(PropertyDeclarationNormalizedRowSchema),
    unmatchedRows: z.array(z.string().min(1)),
    note: z.string().min(1),
  })
  .strict();

export const PropertyDeclarationIdentitySchema = z
  .object({
    status: z.enum(['matched', 'ambiguous', 'unavailable']),
    matchMethod: PropertyDeclarationMatchMethodSchema.nullable(),
    listedNames: z.array(z.string().min(1)),
    listingPageUrls: z.array(z.url()),
    note: z.string().min(1),
  })
  .strict();

export const PropertyDeclarationFinancialCategorySchema = z.enum([
  'land',
  'building',
  'ship',
  'vehicles',
  'aircraft',
  'cash',
  'deposits',
  'securities',
  'valuable-property',
  'insurance',
  'virtual-assets',
  'claims',
  'debts',
  'business-investment',
]);
export type PropertyDeclarationFinancialCategory = z.infer<
  typeof PropertyDeclarationFinancialCategorySchema
>;

export const PROPERTY_DECLARATION_FINANCIAL_CATEGORIES =
  PropertyDeclarationFinancialCategorySchema.options;

export const PropertyDeclarationFinancialCategoryStatusSchema = z.enum([
  'reported',
  'none-reported',
  'not-determined',
]);
export type PropertyDeclarationFinancialCategoryStatus = z.infer<
  typeof PropertyDeclarationFinancialCategoryStatusSchema
>;

export const PropertyDeclarationFinancialVerificationStatusSchema = z.enum([
  'independently-verified',
  'not-determined',
]);
export type PropertyDeclarationFinancialVerificationStatus = z.infer<
  typeof PropertyDeclarationFinancialVerificationStatusSchema
>;

const PropertyDeclarationFinancialVerificationMethodSchema = z
  .literal('dual-pass-local-ocr-and-source-page-cross-check')
  .nullable();

export const PropertyDeclarationFinancialCategorySummarySchema = z
  .object({
    category: PropertyDeclarationFinancialCategorySchema,
    status: PropertyDeclarationFinancialCategoryStatusSchema,
    totalTwd: z
      .number()
      .nonnegative()
      .refine(Number.isFinite, { message: 'Total must be finite.' })
      .nullable(),
    entryCount: z.number().int().nonnegative().nullable(),
    evidencePages: z.array(z.number().int().positive()),
    verificationStatus: PropertyDeclarationFinancialVerificationStatusSchema,
    verificationMethod: PropertyDeclarationFinancialVerificationMethodSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.status === 'not-determined') {
      if (
        value.totalTwd !== null ||
        value.entryCount !== null ||
        value.evidencePages.length > 0 ||
        value.verificationStatus !== 'not-determined' ||
        value.verificationMethod !== null
      ) {
        context.addIssue({
          code: 'custom',
          message:
            'Not-determined financial categories must not expose values or evidence.',
        });
      }
      return;
    }

    if (
      value.verificationStatus !== 'independently-verified' ||
      value.verificationMethod === null ||
      value.evidencePages.length === 0
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'Published financial category values require independent verification and page evidence.',
      });
    }

    if (
      value.status === 'reported' &&
      value.totalTwd === null &&
      value.entryCount === null
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'Reported financial categories require a verified total or entry count.',
      });
    }

    if (value.status === 'reported' && value.entryCount === 0) {
      context.addIssue({
        code: 'custom',
        message:
          'Reported financial categories must not pair a positive claim with zero entries.',
      });
    }

    if (
      value.status === 'none-reported' &&
      ((value.entryCount !== null && value.entryCount !== 0) ||
        (value.totalTwd !== null && value.totalTwd !== 0))
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'None-reported financial categories may expose only explicit zero totals or zero entry counts.',
      });
    }
  });

export type PropertyDeclarationFinancialCategorySummary = z.infer<
  typeof PropertyDeclarationFinancialCategorySummarySchema
>;

export const PropertyDeclarationFinancialSummaryStatusSchema = z.enum([
  'independently-verified',
  'partially-verified',
  'unavailable',
]);
export type PropertyDeclarationFinancialSummaryStatus = z.infer<
  typeof PropertyDeclarationFinancialSummaryStatusSchema
>;

export const PropertyDeclarationFinancialSummarySchema = z
  .object({
    summaryStatus: PropertyDeclarationFinancialSummaryStatusSchema,
    verifiedCategoryCount: z.number().int().nonnegative(),
    categories: z.array(PropertyDeclarationFinancialCategorySummarySchema),
    note: z.string().min(1),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.categories.length !==
      PROPERTY_DECLARATION_FINANCIAL_CATEGORIES.length
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Financial summaries must contain all official categories.',
      });
    }

    const uniqueCategories = new Set(
      value.categories.map((item) => item.category),
    );
    if (uniqueCategories.size !== value.categories.length) {
      context.addIssue({
        code: 'custom',
        message: 'Financial summary categories must be unique.',
      });
    }

    const independentlyVerified = value.categories.filter(
      (item) => item.verificationStatus === 'independently-verified',
    ).length;
    if (value.verifiedCategoryCount !== independentlyVerified) {
      context.addIssue({
        code: 'custom',
        message:
          'verifiedCategoryCount does not match category verification states.',
      });
    }

    const expectedStatus =
      independentlyVerified === 0
        ? 'unavailable'
        : independentlyVerified === value.categories.length
          ? 'independently-verified'
          : 'partially-verified';
    if (value.summaryStatus !== expectedStatus) {
      context.addIssue({
        code: 'custom',
        message:
          'Financial summary status does not match verified category coverage.',
      });
    }
  });

export type PropertyDeclarationFinancialSummary = z.infer<
  typeof PropertyDeclarationFinancialSummarySchema
>;

export const PropertyDeclarationFinancialSummaryRecordSchema = z
  .intersection(
    z
      .object({
        candidateId: z.string().min(1),
        displayName: z.string().min(1),
        pdfFileName: z.string().regex(/^\d+\.pdf$/),
        pdfUrl: OfficialPdfUrlSchema,
        physicalPageCount: z.number().int().positive(),
      })
      .strict(),
    PropertyDeclarationFinancialSummarySchema,
  )
  .superRefine((value, context) => {
    for (const category of value.categories) {
      if (
        category.evidencePages.some((page) => page > value.physicalPageCount)
      ) {
        context.addIssue({
          code: 'custom',
          message:
            'Financial category evidence pages must not exceed the source PDF page count.',
        });
        break;
      }
    }
  });

export const PropertyDeclarationFinancialSummaryDatasetSchema = z
  .object({
    datasetId: z.literal(PROPERTY_DECLARATIONS_FINANCIAL_SUMMARIES_DATASET_ID),
    schemaVersion: z.literal(PROPERTY_DECLARATIONS_SCHEMA_VERSION),
    snapshotDate: DateOnlySchema,
    records: z.array(PropertyDeclarationFinancialSummaryRecordSchema),
    note: z.string().min(1),
  })
  .strict();

export type PropertyDeclarationFinancialSummaryRecord = z.infer<
  typeof PropertyDeclarationFinancialSummaryRecordSchema
>;
export type PropertyDeclarationFinancialSummaryDataset = z.infer<
  typeof PropertyDeclarationFinancialSummaryDatasetSchema
>;

const PropertyDeclarationVerificationPassSchema = z
  .object({
    tool: z.literal('tesseract'),
    toolVersion: z.string().min(1),
    language: z.literal('chi_tra+eng'),
    pageSegmentationMode: z.literal(12),
    renderScale: z.number().positive(),
  })
  .strict();

const PropertyDeclarationCategoryAgreementSchema = z
  .object({
    category: PropertyDeclarationFinancialCategorySchema,
    outcome: z.enum(['agree', 'not-determined']),
    evidencePages: z.array(z.number().int().positive()),
  })
  .strict();

export const PropertyDeclarationVerificationRecordSchema = z
  .object({
    candidateId: z.string().min(1),
    pdfFileName: z.string().regex(/^\d+\.pdf$/),
    pdfUrl: OfficialPdfUrlSchema,
    pdfSha256: Sha256Schema,
    physicalPageCount: z.number().int().positive(),
    primaryPass: PropertyDeclarationVerificationPassSchema,
    independentPass: PropertyDeclarationVerificationPassSchema,
    categoryAgreements: z.array(PropertyDeclarationCategoryAgreementSchema),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.categoryAgreements.length !==
      PROPERTY_DECLARATION_FINANCIAL_CATEGORIES.length
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Verification records must cover all financial categories.',
      });
    }
    if (
      new Set(value.categoryAgreements.map((item) => item.category)).size !==
      value.categoryAgreements.length
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Verification categories must be unique.',
      });
    }
    for (const agreement of value.categoryAgreements) {
      if (
        agreement.evidencePages.some((page) => page > value.physicalPageCount)
      ) {
        context.addIssue({
          code: 'custom',
          message:
            'Verification evidence pages must not exceed the source PDF page count.',
        });
        break;
      }
    }
  });

export const PropertyDeclarationVerificationDatasetSchema = z
  .object({
    datasetId: z.literal(PROPERTY_DECLARATIONS_VERIFICATION_DATASET_ID),
    schemaVersion: z.literal(PROPERTY_DECLARATIONS_SCHEMA_VERSION),
    snapshotDate: DateOnlySchema,
    records: z.array(PropertyDeclarationVerificationRecordSchema),
    note: z.string().min(1),
  })
  .strict();

export type PropertyDeclarationVerificationRecord = z.infer<
  typeof PropertyDeclarationVerificationRecordSchema
>;
export type PropertyDeclarationVerificationDataset = z.infer<
  typeof PropertyDeclarationVerificationDatasetSchema
>;

export const PropertyDeclarationCandidateRecordSchema = z
  .object({
    candidateId: z.string().min(1),
    displayName: z.string().min(1),
    electionType: PropertyDeclarationElectionTypeSchema,
    districtId: z.string().min(1),
    status: PropertyDeclarationStatusSchema,
    identity: PropertyDeclarationIdentitySchema,
    documents: z.array(PropertyDeclarationDocumentSchema),
    financialSummary: PropertyDeclarationFinancialSummarySchema.nullable(),
  })
  .strict();

export const PropertyDeclarationCoverageSchema = z
  .object({
    candidateCount: z.number().int().nonnegative(),
    sourceLinkedCount: z.number().int().nonnegative(),
    ambiguousCount: z.number().int().nonnegative(),
    sourceUnavailableCount: z.number().int().nonnegative(),
    declarationRowCount: z.number().int().nonnegative(),
    unmatchedRowCount: z.number().int().nonnegative(),
    financialSummaryCount: z.number().int().nonnegative(),
    financialSummaryVerifiedCategoryCount: z.number().int().nonnegative(),
    financialSummaryPartialCount: z.number().int().nonnegative(),
    financialSummaryUnavailableCount: z.number().int().nonnegative(),
  })
  .strict();

export const PropertyDeclarationPublishedDatasetSchema = z
  .object({
    datasetId: z.literal(PROPERTY_DECLARATIONS_PUBLISHED_DATASET_ID),
    schemaVersion: z.literal(PROPERTY_DECLARATIONS_SCHEMA_VERSION),
    snapshotDate: DateOnlySchema,
    sourcePages: z.array(PropertyDeclarationSourcePageSchema).min(1),
    records: z.array(PropertyDeclarationCandidateRecordSchema),
    unmatchedRows: z.array(z.string().min(1)),
    coverage: PropertyDeclarationCoverageSchema,
    note: z.string().min(1),
  })
  .strict();

export type PropertyDeclarationSourcePage = z.infer<
  typeof PropertyDeclarationSourcePageSchema
>;
export type PropertyDeclarationNormalizedRow = z.infer<
  typeof PropertyDeclarationNormalizedRowSchema
>;
export type PropertyDeclarationNormalizedDataset = z.infer<
  typeof PropertyDeclarationNormalizedDatasetSchema
>;
export type PropertyDeclarationDocument = z.infer<
  typeof PropertyDeclarationDocumentSchema
>;
export type PropertyDeclarationCandidateRecord = z.infer<
  typeof PropertyDeclarationCandidateRecordSchema
>;
export type PropertyDeclarationPublishedDataset = z.infer<
  typeof PropertyDeclarationPublishedDatasetSchema
>;

export function validatePropertyDeclarationNormalizedDataset(
  input: unknown,
): PropertyDeclarationNormalizedDataset {
  return PropertyDeclarationNormalizedDatasetSchema.parse(input);
}

export function validatePropertyDeclarationFinancialSummaryDataset(
  input: unknown,
): PropertyDeclarationFinancialSummaryDataset {
  return PropertyDeclarationFinancialSummaryDatasetSchema.parse(input);
}

export function validatePropertyDeclarationVerificationDataset(
  input: unknown,
): PropertyDeclarationVerificationDataset {
  return PropertyDeclarationVerificationDatasetSchema.parse(input);
}

export function validatePropertyDeclarationDataset(
  input: unknown,
): PropertyDeclarationPublishedDataset {
  return PropertyDeclarationPublishedDatasetSchema.parse(input);
}
