import { z } from 'zod';

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const DateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const PartialDateSchema = z
  .string()
  .regex(/^\d{4}(?:-\d{2})?(?:-\d{2})?$/)
  .nullable();
const IsoTimestampSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/);

export const BiographyClaimTypeSchema = z.enum([
  'current-position',
  'historical-position',
  'historical-candidacy',
  'elected-office',
  'professional-experience',
  'education',
  'career-event',
]);
export type BiographyClaimType = z.infer<typeof BiographyClaimTypeSchema>;

export const BiographyPublishedClaimSchema = z
  .object({
    claimId: z.string().min(1),
    candidateId: z.string().min(1),
    category: z.string().min(1),
    claimType: BiographyClaimTypeSchema,
    title: z.string().min(1),
    organization: z.string().min(1).nullable(),
    value: z.string().min(1),
    sourcePublicationDate: DateOnlySchema.nullable(),
    validFrom: PartialDateSchema,
    validTo: PartialDateSchema,
    temporalPrecision: z.enum(['day', 'month', 'year', 'unknown']),
    currentStatus: z.enum(['current', 'historical', 'unknown']),
    attribution: z.enum([
      'institutional-record',
      'candidate-statement',
      'independently-corroborated',
    ]),
    sourceIds: z.array(z.string().min(1)).min(1),
    evidenceIds: z.array(z.string().min(1)).min(1),
  })
  .strict()
  .superRefine((claim, context) => {
    if (
      claim.claimType === 'historical-candidacy' &&
      claim.currentStatus === 'current'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['currentStatus'],
        message: 'A historical candidacy cannot be current.',
      });
    }
    if (
      claim.claimType === 'elected-office' &&
      claim.attribution === 'candidate-statement'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['attribution'],
        message: 'A self-reported claim cannot establish elected office.',
      });
    }
    if (
      claim.validFrom !== null &&
      claim.validTo !== null &&
      claim.validTo < claim.validFrom
    ) {
      context.addIssue({
        code: 'custom',
        path: ['validTo'],
        message: 'validTo cannot precede validFrom.',
      });
    }
  });

export type BiographyPublishedClaim = z.infer<
  typeof BiographyPublishedClaimSchema
>;

export const BiographySourceSchema = z
  .object({
    sourceId: z.string().min(1),
    url: z.url(),
    publisher: z.string().min(1),
    publicationDate: DateOnlySchema.nullable(),
    verificationStatus: z.string().min(1),
    note: z.string().min(1),
  })
  .strict();

export type BiographySource = z.infer<typeof BiographySourceSchema>;

export const BiographyPublicationSnapshotSchema = z
  .object({
    datasetId: z.literal('kaohsiung-2026-candidate-biographies'),
    schemaVersion: z.literal('1'),
    snapshotDate: DateOnlySchema,
    generatedAt: IsoTimestampSchema,
    records: z.array(BiographyPublishedClaimSchema),
    sources: z.array(BiographySourceSchema),
    checksum: Sha256Schema,
    note: z.string().min(1),
  })
  .strict();

export type BiographyPublicationSnapshot = z.infer<
  typeof BiographyPublicationSnapshotSchema
>;

function formatIssues(
  issues: Array<{ path: PropertyKey[]; message: string }>,
): string {
  return issues
    .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
    .join('\n');
}

export function validateBiographyPublicationSnapshot(
  input: unknown,
): BiographyPublicationSnapshot {
  const result = BiographyPublicationSnapshotSchema.safeParse(input);
  if (!result.success) {
    throw new Error(
      `Biography publication snapshot validation failed:\n${formatIssues(result.error.issues)}`,
    );
  }
  const snapshot = result.data;
  const claimIds = new Set<string>();
  for (const claim of snapshot.records) {
    if (claimIds.has(claim.claimId))
      throw new Error(`Duplicate biography claim ID: ${claim.claimId}.`);
    claimIds.add(claim.claimId);
  }
  const sourceIds = new Set<string>();
  for (const source of snapshot.sources) {
    if (sourceIds.has(source.sourceId))
      throw new Error(`Duplicate biography source ID: ${source.sourceId}.`);
    sourceIds.add(source.sourceId);
  }
  for (const claim of snapshot.records) {
    for (const sourceId of claim.sourceIds) {
      if (!sourceIds.has(sourceId)) {
        throw new Error(
          `Biography claim ${claim.claimId} references missing source ${sourceId}.`,
        );
      }
    }
  }
  // Checksum integrity is verified by the Node-only publication validator.
  return snapshot;
}
