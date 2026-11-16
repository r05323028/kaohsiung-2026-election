import { z } from 'zod';
import {
  DateOnlySchema,
  ListingStatusSchema,
  OrganizationTypeSchema,
  PoliticalCareerStatusSchema,
  PositionCategorySchema,
} from './schema';

/**
 * A correction is not a new research claim. It records that an independent
 * verifier's remaining objection was an overreaching position claim, and that
 * dropping that claim leaves a kinship and at least one position with separate
 * evidence. The original verifier output stays untouched.
 */
const CorrectionPositionSchema = z
  .object({
    organization: z.string().min(1),
    organizationType: OrganizationTypeSchema,
    positionTitle: z.string().min(1),
    positionCategory: PositionCategorySchema,
    listingStatus: ListingStatusSchema.nullable().optional(),
    status: PoliticalCareerStatusSchema,
    startDate: DateOnlySchema.nullable(),
    endDate: DateOnlySchema.nullable(),
    sourceIds: z.array(z.string().min(1)).min(1),
  })
  .strict()
  .superRefine((position, context) => {
    if (
      position.startDate &&
      position.endDate &&
      position.startDate > position.endDate
    ) {
      context.addIssue({
        code: 'custom',
        path: ['endDate'],
        message: 'A corrected position cannot end before it starts.',
      });
    }
    if (
      (position.status === 'current-officeholder' ||
        position.status === 'current-candidate') &&
      position.endDate
    ) {
      context.addIssue({
        code: 'custom',
        path: ['endDate'],
        message: 'A current position must not carry an end date.',
      });
    }
  });

const RemovedClaimSchema = z
  .object({
    organization: z.string().min(1),
    positionTitle: z.string().min(1),
    reason: z.string().min(1),
    sourceUrls: z.array(z.url()).min(1),
  })
  .strict();

const CorrectionRecordSchema = z
  .object({
    candidateId: z.string().min(1),
    relationshipId: z.string().regex(/^family-relation-[0-9a-f]{12}$/),
    relativeName: z.string().min(1),
    action: z.literal('verify-after-pruning'),
    positionSource: z.enum(['verification-record', 'correction-record']),
    positions: z.array(CorrectionPositionSchema).min(1).optional(),
    positionSourceIds: z.array(z.string().min(1)).min(1).optional(),
    removedClaims: z.array(RemovedClaimSchema).min(1),
    reason: z.string().min(1),
    reviewedAgainst: z.array(z.url()).min(1),
  })
  .strict()
  .superRefine((record, context) => {
    if (record.positionSource === 'correction-record') {
      if (!record.positions || record.positions.length === 0) {
        context.addIssue({
          code: 'custom',
          path: ['positions'],
          message:
            'A correction-record position source requires explicit positions.',
        });
      }
      if (!record.positionSourceIds || record.positionSourceIds.length === 0) {
        context.addIssue({
          code: 'custom',
          path: ['positionSourceIds'],
          message:
            'A correction-record position source requires explicit source IDs.',
        });
      }
    } else {
      if (record.positions !== undefined) {
        context.addIssue({
          code: 'custom',
          path: ['positions'],
          message:
            'verification-record corrections must not replace the verifier positions.',
        });
      }
      if (record.positionSourceIds !== undefined) {
        context.addIssue({
          code: 'custom',
          path: ['positionSourceIds'],
          message:
            'verification-record corrections must reuse the verifier position sources.',
        });
      }
    }
  });

const CandidateOutcomeCorrectionSchema = z
  .object({
    candidateId: z.string().min(1),
    outcome: z.enum(['searched-no-verified-relations', 'unresolved']),
    reason: z.string().min(1),
    suppressLegacyFindingSubjects: z.array(z.string().min(1)).default([]),
  })
  .strict();

export const PoliticalFamilyVerificationCorrectionsSchema = z
  .object({
    correctionVersion: z.literal('1'),
    datasetId: z.literal(
      'kaohsiung-2026-political-family-verification-corrections',
    ),
    appliedAt: DateOnlySchema,
    reviewerRole: z.literal('agent-evidence-correction'),
    note: z.string().min(1),
    records: z.array(CorrectionRecordSchema),
    candidateOutcomes: z.array(CandidateOutcomeCorrectionSchema).default([]),
  })
  .strict()
  .superRefine((file, context) => {
    const keys = new Set<string>();
    for (const record of file.records) {
      const key = record.candidateId + '|' + record.relativeName;
      if (keys.has(key)) {
        context.addIssue({
          code: 'custom',
          path: ['records'],
          message: 'Duplicate correction for ' + key + '.',
        });
      }
      keys.add(key);
    }
    const candidates = new Set<string>();
    for (const outcome of file.candidateOutcomes) {
      if (candidates.has(outcome.candidateId)) {
        context.addIssue({
          code: 'custom',
          path: ['candidateOutcomes'],
          message:
            'Duplicate candidate outcome correction for ' +
            outcome.candidateId +
            '.',
        });
      }
      candidates.add(outcome.candidateId);
    }
  });

export type PoliticalFamilyVerificationCorrections = z.infer<
  typeof PoliticalFamilyVerificationCorrectionsSchema
>;
export type PoliticalFamilyVerificationCorrection =
  PoliticalFamilyVerificationCorrections['records'][number];
export type PoliticalFamilyCorrectionPosition =
  PoliticalFamilyVerificationCorrection['positions'] extends
    | (infer T)[]
    | undefined
    ? T
    : never;

export function validatePoliticalFamilyVerificationCorrections(
  input: unknown,
): PoliticalFamilyVerificationCorrections {
  const result = PoliticalFamilyVerificationCorrectionsSchema.safeParse(input);
  if (!result.success) {
    throw new Error(
      'Political family verification corrections validation failed:\n' +
        result.error.issues
          .map(
            (issue) =>
              (issue.path.join('.') || '<root>') + ': ' + issue.message,
          )
          .join('\n'),
    );
  }
  return result.data;
}
