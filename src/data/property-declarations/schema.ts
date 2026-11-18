import { z } from 'zod';

export const PROPERTY_DECLARATIONS_NORMALIZED_DATASET_ID =
  'kaohsiung-2026-candidate-property-declarations-sources';
export const PROPERTY_DECLARATIONS_FINANCIAL_SUMMARIES_DATASET_ID =
  'kaohsiung-2026-candidate-property-declaration-financial-summaries';
export const PROPERTY_DECLARATIONS_VERIFICATION_DATASET_ID =
  'kaohsiung-2026-candidate-property-declaration-verification';
export const PROPERTY_DECLARATIONS_PUBLISHED_DATASET_ID =
  'kaohsiung-2026-candidate-property-declarations';
export const PROPERTY_DECLARATIONS_GAZETTE_DATASET_ID =
  'kaohsiung-2026-candidate-property-declaration-gazette';
export const PROPERTY_DECLARATIONS_SCHEMA_VERSION = '1';
export const PROPERTY_DECLARATIONS_SNAPSHOT_DATE = '2026-11-17';
export const PROPERTY_DECLARATIONS_GAZETTE_SNAPSHOT_DATE = '2026-11-18';
export const PROPERTY_DECLARATION_GAZETTE_ATTRIBUTION =
  '資料來源：台灣前進《2026 民間版選舉公報》';
export const PROPERTY_DECLARATION_GAZETTE_LICENSE = 'CC BY 4.0';

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
const GazetteCandidateUrlSchema = z
  .url()
  .refine(
    (value) =>
      value.startsWith('https://gazette2026.taiwangogo.tw/candidates/') &&
      !value.includes('/cards/'),
    {
      message: 'Civil gazette candidate URLs must use the gazette domain.',
    },
  );
const GazettePropertyCardUrlSchema = z
  .url()
  .refine(
    (value) =>
      value.startsWith('https://gazette2026.taiwangogo.tw/candidates/') &&
      value.endsWith('/cards/property/'),
    {
      message: 'Civil gazette property URLs must use the gazette domain.',
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

export const PropertyDeclarationFieldSourceSchema = z.enum([
  'official-cec',
  'civil-gazette',
]);
export type PropertyDeclarationFieldSource = z.infer<
  typeof PropertyDeclarationFieldSourceSchema
>;

export const PropertyDeclarationFinancialFieldSourcesSchema = z
  .object({
    total: PropertyDeclarationFieldSourceSchema.nullable(),
    entryCount: PropertyDeclarationFieldSourceSchema.nullable(),
  })
  .strict();
export type PropertyDeclarationFinancialFieldSources = z.infer<
  typeof PropertyDeclarationFinancialFieldSourcesSchema
>;

export const PropertyDeclarationFinancialVerificationStatusSchema = z.enum([
  'page-evidenced',
  'civil-gazette-evidenced',
  'mixed-source-evidenced',
  'not-determined',
]);
export type PropertyDeclarationFinancialVerificationStatus = z.infer<
  typeof PropertyDeclarationFinancialVerificationStatusSchema
>;

export const PropertyDeclarationFinancialVerificationMethodSchema = z
  .enum([
    'dual-render-local-ocr-agreement',
    'multi-engine-local-ocr-and-page-cross-check',
    'visual-page-review-with-gazette-cross-check',
    'civil-gazette-structured-source-resolution',
    'mixed-official-and-civil-source-resolution',
  ])
  .nullable();
export type PropertyDeclarationFinancialVerificationMethod = z.infer<
  typeof PropertyDeclarationFinancialVerificationMethodSchema
>;

export const PropertyDeclarationOfficialFinancialSourceSchema = z
  .object({
    publisher: z.literal('中央選舉委員會'),
    pdfFileName: z.string().regex(/^\d+\.pdf$/),
    url: OfficialPdfUrlSchema,
  })
  .strict();

export const PropertyDeclarationCivilGazetteSourceSchema = z
  .object({
    publisher: z.literal('台灣前進'),
    url: GazettePropertyCardUrlSchema,
    retrievedAt: DateOnlySchema,
    attribution: z.literal(PROPERTY_DECLARATION_GAZETTE_ATTRIBUTION),
    license: z.literal(PROPERTY_DECLARATION_GAZETTE_LICENSE),
  })
  .strict();

export const PropertyDeclarationFinancialSummarySourcesSchema = z
  .object({
    official: PropertyDeclarationOfficialFinancialSourceSchema.nullable(),
    civil: PropertyDeclarationCivilGazetteSourceSchema.nullable(),
  })
  .strict();
export type PropertyDeclarationFinancialSummarySources = z.infer<
  typeof PropertyDeclarationFinancialSummarySourcesSchema
>;

export const PropertyDeclarationGazetteTotalBasisSchema = z.enum([
  'declared-item-sum',
  'count-only-amounts-withheld',
  'unvalued',
]);
export type PropertyDeclarationGazetteTotalBasis = z.infer<
  typeof PropertyDeclarationGazetteTotalBasisSchema
>;

export const PropertyDeclarationGazetteCategorySchema = z
  .object({
    category: PropertyDeclarationFinancialCategorySchema,
    status: z.enum(['reported', 'not-determined']),
    totalTwd: z
      .number()
      .nonnegative()
      .refine(Number.isFinite, { message: 'Total must be finite.' })
      .nullable(),
    entryCount: z.number().int().nonnegative().nullable(),
    totalBasis: PropertyDeclarationGazetteTotalBasisSchema.nullable(),
    valuedItemCount: z.number().int().nonnegative(),
    unvaluedItemCount: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.status === 'not-determined') {
      if (
        value.totalTwd !== null ||
        value.entryCount !== null ||
        value.totalBasis !== null ||
        value.valuedItemCount !== 0 ||
        value.unvaluedItemCount !== 0
      ) {
        context.addIssue({
          code: 'custom',
          message:
            'Not-determined gazette categories must not expose values or counts.',
        });
      }
      return;
    }
    if (value.entryCount === null || value.entryCount === 0) {
      context.addIssue({
        code: 'custom',
        message: 'Reported gazette categories require positive entry counts.',
      });
    }
    if (
      value.entryCount !== null &&
      value.valuedItemCount + value.unvaluedItemCount !== value.entryCount
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Gazette item counts must add up to the entry count.',
      });
    }
    if (value.totalBasis === 'declared-item-sum') {
      if (value.totalTwd === null || value.unvaluedItemCount !== 0) {
        context.addIssue({
          code: 'custom',
          message:
            'Declared gazette totals require a value and no unvalued items.',
        });
      }
      return;
    }
    if (value.totalTwd !== null) {
      context.addIssue({
        code: 'custom',
        message:
          'Count-only or unvalued gazette categories must not expose a total.',
      });
    }
  });

export const PropertyDeclarationGazetteMatchEvidenceSchema = z
  .object({
    gazetteRegion: z.string().min(1),
    gazetteBallotNumber: z.number().int().positive(),
    rosterDistrictId: z.string().min(1),
    rosterElectionType: z.enum([
      'mayoral',
      'city-council',
      'indigenous-council',
    ]),
    rosterCandidateNumber: z.string().min(1),
  })
  .strict();

export const PropertyDeclarationGazetteRecordSchema = z
  .object({
    candidateId: z.string().min(1),
    displayName: z.string().min(1),
    gazetteCandidateId: z.uuid(),
    gazetteName: z.string().min(1),
    matchMethod: z.literal('district+ballot-number'),
    matchEvidence: PropertyDeclarationGazetteMatchEvidenceSchema,
    nameExact: z.boolean(),
    candidateUrl: GazetteCandidateUrlSchema,
    propertyCardUrl: GazettePropertyCardUrlSchema,
    retrievedAt: DateOnlySchema,
    sourcePageSha256: Sha256Schema,
    declarationDate: DateOnlySchema.nullable(),
    officialPdfFileName: z
      .string()
      .regex(/^\d+\.pdf$/)
      .nullable(),
    officialPdfSha256: Sha256Schema.nullable(),
    sourceDocumentSha256: Sha256Schema.nullable(),
    categories: z.array(PropertyDeclarationGazetteCategorySchema),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.categories.length !==
      PROPERTY_DECLARATION_FINANCIAL_CATEGORIES.length
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Gazette records must cover all financial categories.',
      });
    }
    if (
      new Set(value.categories.map((item) => item.category)).size !==
      value.categories.length
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Gazette categories must be unique.',
      });
    }
    if (
      String(value.matchEvidence.gazetteBallotNumber) !==
      value.matchEvidence.rosterCandidateNumber
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'Gazette ballot number must match the canonical roster candidate number.',
      });
    }
    if (
      (value.officialPdfFileName === null) !==
      (value.officialPdfSha256 === null)
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'Gazette official PDF file name and SHA-256 must both be present or absent.',
      });
    }
  });

export const PropertyDeclarationGazetteDatasetSchema = z
  .object({
    datasetId: z.literal(PROPERTY_DECLARATIONS_GAZETTE_DATASET_ID),
    schemaVersion: z.literal(PROPERTY_DECLARATIONS_SCHEMA_VERSION),
    snapshotDate: DateOnlySchema,
    source: z
      .object({
        publisher: z.literal('台灣前進'),
        url: z.url(),
        attribution: z.literal(PROPERTY_DECLARATION_GAZETTE_ATTRIBUTION),
        license: z.literal(PROPERTY_DECLARATION_GAZETTE_LICENSE),
        retrievedAt: DateOnlySchema,
        note: z.string().min(1),
      })
      .strict(),
    records: z.array(PropertyDeclarationGazetteRecordSchema),
    note: z.string().min(1),
  })
  .strict();

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
    fieldSources: PropertyDeclarationFinancialFieldSourcesSchema,
    sourceConflict: z.boolean(),
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
        value.fieldSources.total !== null ||
        value.fieldSources.entryCount !== null ||
        value.sourceConflict ||
        value.verificationStatus !== 'not-determined' ||
        value.verificationMethod !== null
      ) {
        context.addIssue({
          code: 'custom',
          message:
            'Not-determined financial categories must not expose values, evidence or sources.',
        });
      }
      return;
    }

    if (
      value.verificationStatus === 'not-determined' ||
      value.verificationMethod === null
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'Published financial category values require a stated source-aware verification method.',
      });
    }

    if (
      (value.verificationStatus === 'page-evidenced' ||
        value.verificationStatus === 'mixed-source-evidenced') &&
      value.evidencePages.length === 0
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'Page-evidenced and mixed-source categories require official page evidence.',
      });
    }

    if (
      (value.totalTwd === null) !== (value.fieldSources.total === null) ||
      (value.entryCount === null) !== (value.fieldSources.entryCount === null)
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'Each financial field source must be present exactly when its value is present.',
      });
    }

    if (
      value.status === 'none-reported' &&
      (value.fieldSources.total === 'civil-gazette' ||
        value.fieldSources.entryCount === 'civil-gazette')
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'None-reported financial categories require an official explicit zero.',
      });
    }

    const sources = [
      value.fieldSources.total,
      value.fieldSources.entryCount,
    ].filter(
      (source): source is PropertyDeclarationFieldSource => source !== null,
    );
    const usesOfficial = sources.includes('official-cec');
    const usesCivil = sources.includes('civil-gazette');
    if (value.sourceConflict && !usesOfficial) {
      context.addIssue({
        code: 'custom',
        message:
          'Source conflicts require an official field to remain primary.',
      });
    }
    if (value.verificationStatus === 'page-evidenced' && usesCivil) {
      context.addIssue({
        code: 'custom',
        message: 'Page-evidenced categories must use official fields only.',
      });
    }
    if (
      value.verificationStatus === 'civil-gazette-evidenced' &&
      (!usesCivil || usesOfficial)
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'Civil-gazette-evidenced categories must use civil fields only.',
      });
    }
    if (
      value.verificationStatus === 'mixed-source-evidenced' &&
      (!usesCivil || !usesOfficial)
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'Mixed-source categories require both official and civil fields.',
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
      ((value.totalTwd !== null && value.totalTwd !== 0) ||
        (value.entryCount !== null && value.entryCount !== 0))
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'None-reported financial categories must not claim positive values or entries.',
      });
    }

    if (
      value.status === 'none-reported' &&
      !(value.totalTwd === 0 || value.entryCount === 0)
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'None-reported financial categories require an explicit zero total or entry count.',
      });
    }
  });

export type PropertyDeclarationFinancialCategorySummary = z.infer<
  typeof PropertyDeclarationFinancialCategorySummarySchema
>;

export const PropertyDeclarationFinancialSummaryStatusSchema = z.enum([
  'page-evidenced',
  'civil-gazette-verified',
  'mixed-source-verified',
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
    sources: PropertyDeclarationFinancialSummarySourcesSchema,
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

    const resolved = value.categories.filter(
      (item) => item.verificationStatus !== 'not-determined',
    ).length;
    const officialOnly = value.categories.filter(
      (item) => item.verificationStatus === 'page-evidenced',
    ).length;
    const civilOnly = value.categories.filter(
      (item) => item.verificationStatus === 'civil-gazette-evidenced',
    ).length;
    const mixed = value.categories.filter(
      (item) => item.verificationStatus === 'mixed-source-evidenced',
    ).length;
    if (value.verifiedCategoryCount !== resolved) {
      context.addIssue({
        code: 'custom',
        message:
          'verifiedCategoryCount does not match resolved category states.',
      });
    }

    const expectedStatus =
      resolved === 0
        ? 'unavailable'
        : resolved < value.categories.length
          ? 'partially-verified'
          : civilOnly === 0 && mixed === 0
            ? 'page-evidenced'
            : officialOnly === 0 && mixed === 0
              ? 'civil-gazette-verified'
              : 'mixed-source-verified';
    if (value.summaryStatus !== expectedStatus) {
      context.addIssue({
        code: 'custom',
        message:
          'Financial summary status does not match resolved category coverage.',
      });
    }

    const usesOfficial = value.categories.some(
      (item) =>
        item.fieldSources.total === 'official-cec' ||
        item.fieldSources.entryCount === 'official-cec',
    );
    const usesCivil = value.categories.some(
      (item) =>
        item.fieldSources.total === 'civil-gazette' ||
        item.fieldSources.entryCount === 'civil-gazette',
    );
    if (usesOfficial && value.sources.official === null) {
      context.addIssue({
        code: 'custom',
        message: 'Official category values require an official source link.',
      });
    }
    if (usesCivil && value.sources.civil === null) {
      context.addIssue({
        code: 'custom',
        message:
          'Civil-gazette category values require a civil source link and attribution.',
      });
    }
    if (value.sources.official === null && value.sources.civil === null) {
      context.addIssue({
        code: 'custom',
        message: 'Financial summaries require at least one published source.',
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
    status: PropertyDeclarationFinancialCategoryStatusSchema,
    totalTwd: z
      .number()
      .nonnegative()
      .refine(Number.isFinite, { message: 'Total must be finite.' })
      .nullable(),
    entryCount: z.number().int().nonnegative().nullable(),
    evidencePages: z.array(z.number().int().positive()),
    fieldSources: PropertyDeclarationFinancialFieldSourcesSchema,
    sourceConflict: z.boolean(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.outcome === 'not-determined') {
      if (
        value.status !== 'not-determined' ||
        value.totalTwd !== null ||
        value.entryCount !== null ||
        value.evidencePages.length > 0 ||
        value.fieldSources.total !== null ||
        value.fieldSources.entryCount !== null ||
        value.sourceConflict
      ) {
        context.addIssue({
          code: 'custom',
          message:
            'Not-determined verification agreements must not contain values or evidence.',
        });
      }
      return;
    }

    if (value.status === 'not-determined') {
      context.addIssue({
        code: 'custom',
        message: 'Agreed verification categories require a reported state.',
      });
      return;
    }

    if (value.evidencePages.length === 0) {
      context.addIssue({
        code: 'custom',
        message: 'Agreed verification categories require page evidence.',
      });
    }

    if (
      value.fieldSources.total !== 'official-cec' &&
      value.fieldSources.entryCount !== 'official-cec'
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'Agreed official verification categories require an official field source.',
      });
    }
    if (value.sourceConflict) {
      context.addIssue({
        code: 'custom',
        message: 'Official verification agreements must not carry conflicts.',
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
          'Reported verification categories require a total or entry count.',
      });
    }

    if (value.status === 'reported' && value.entryCount === 0) {
      context.addIssue({
        code: 'custom',
        message:
          'Reported verification categories must not claim zero entries.',
      });
    }

    if (value.status === 'none-reported') {
      if (
        (value.totalTwd !== null && value.totalTwd !== 0) ||
        (value.entryCount !== null && value.entryCount !== 0)
      ) {
        context.addIssue({
          code: 'custom',
          message:
            'None-reported verification categories must not claim positive values or entries.',
        });
      }
      if (!(value.totalTwd === 0 || value.entryCount === 0)) {
        context.addIssue({
          code: 'custom',
          message:
            'None-reported verification categories require an explicit zero.',
        });
      }
    }
  });

export const PropertyDeclarationVerificationRecordSchema = z
  .object({
    candidateId: z.string().min(1),
    pdfFileName: z.string().regex(/^\d+\.pdf$/),
    pdfUrl: OfficialPdfUrlSchema,
    pdfSha256: Sha256Schema,
    physicalPageCount: z.number().int().positive(),
    primaryPass: PropertyDeclarationVerificationPassSchema,
    comparisonPass: PropertyDeclarationVerificationPassSchema,
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
  .strict()
  .superRefine((value, context) => {
    if (value.status === 'source-linked') {
      if (
        value.financialSummary !== null &&
        value.financialSummary.sources.official === null
      ) {
        context.addIssue({
          code: 'custom',
          message:
            'Source-linked candidates require an official summary source.',
        });
      }
      return;
    }

    if (value.status === 'ambiguous-source' && value.financialSummary) {
      if (value.documents.length !== 0) {
        context.addIssue({
          code: 'custom',
          message:
            'Ambiguous-source candidates must not publish an unassigned official document.',
        });
      }
      if (value.financialSummary.sources.official !== null) {
        context.addIssue({
          code: 'custom',
          message:
            'Ambiguous-source civil fallback must not claim an official document source.',
        });
      }
      if (
        value.financialSummary.categories.some(
          (category) =>
            category.verificationStatus !== 'not-determined' &&
            category.verificationStatus !== 'civil-gazette-evidenced',
        )
      ) {
        context.addIssue({
          code: 'custom',
          message:
            'Ambiguous-source candidates may publish civil fallback categories only.',
        });
      }
      return;
    }

    if (value.financialSummary !== null) {
      context.addIssue({
        code: 'custom',
        message:
          'Unavailable-source candidates must not publish a financial summary.',
      });
    }
  });

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
    financialSummaryOfficialCategoryCount: z.number().int().nonnegative(),
    financialSummaryCivilFallbackCategoryCount: z.number().int().nonnegative(),
    financialSummaryMixedSourceCategoryCount: z.number().int().nonnegative(),
    financialSummarySourceConflictCount: z.number().int().nonnegative(),
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
export type PropertyDeclarationGazetteCategory = z.infer<
  typeof PropertyDeclarationGazetteCategorySchema
>;
export type PropertyDeclarationGazetteRecord = z.infer<
  typeof PropertyDeclarationGazetteRecordSchema
>;
export type PropertyDeclarationGazetteDataset = z.infer<
  typeof PropertyDeclarationGazetteDatasetSchema
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

export function validatePropertyDeclarationGazetteDataset(
  input: unknown,
): PropertyDeclarationGazetteDataset {
  return PropertyDeclarationGazetteDatasetSchema.parse(input);
}

export function validatePropertyDeclarationDataset(
  input: unknown,
): PropertyDeclarationPublishedDataset {
  return PropertyDeclarationPublishedDatasetSchema.parse(input);
}
