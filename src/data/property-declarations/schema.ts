import { z } from 'zod';

export const PROPERTY_DECLARATIONS_NORMALIZED_DATASET_ID =
  'kaohsiung-2026-candidate-property-declarations-sources';
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

export const PropertyDeclarationCandidateRecordSchema = z
  .object({
    candidateId: z.string().min(1),
    displayName: z.string().min(1),
    electionType: PropertyDeclarationElectionTypeSchema,
    districtId: z.string().min(1),
    status: PropertyDeclarationStatusSchema,
    identity: PropertyDeclarationIdentitySchema,
    documents: z.array(PropertyDeclarationDocumentSchema),
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

export function validatePropertyDeclarationDataset(
  input: unknown,
): PropertyDeclarationPublishedDataset {
  return PropertyDeclarationPublishedDatasetSchema.parse(input);
}
