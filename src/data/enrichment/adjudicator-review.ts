/**
 * adjudication-materiality-v2: fresh independent adjudicator review records.
 *
 * Policy v1 (`automated-editorial-policy-v1`) is unchanged. This module only
 * defines the provenance and finding shape for the *additional* independent
 * reviews that a remediated claim must pass before the unchanged publication
 * policy may approve it.
 */
import { z } from 'zod';
import {
  ADJUDICATION_POLICY_VERSION,
  assessMateriality,
  type MaterialityAssessment,
} from './materiality';
import {
  assertSemanticFindingCitations,
  SemanticEvidenceCitationSchema,
  type SemanticEvidencePacket,
  SemanticTemporalAssessmentSchema,
  SemanticVerdictSchema,
} from './semantic-review';

export { ADJUDICATION_POLICY_VERSION };

export const ADJUDICATOR_ROLES = [
  'established-verifier',
  'adversarial-reviewer',
] as const;
export type AdjudicatorRole = (typeof ADJUDICATOR_ROLES)[number];

export const ADJUDICATOR_ROLE_REVIEWER: Record<
  AdjudicatorRole,
  'reviewer-a' | 'reviewer-b'
> = {
  'established-verifier': 'reviewer-a',
  'adversarial-reviewer': 'reviewer-b',
};

const Sha256Schema = z
  .string()
  .regex(/^[a-f0-9]{64}$/u, 'Expected a SHA-256 hex digest.');
const IsoDateTimeSchema = z.iso.datetime({ offset: true });

export const AdjudicatorFindingSchema = z
  .object({
    claimId: z.string().min(1),
    verdict: SemanticVerdictSchema,
    identityAssessment: z.enum(['confirmed', 'uncertain', 'wrong-identity']),
    attributionAssessment: z.string().min(1),
    temporalAssessment: SemanticTemporalAssessmentSchema,
    evidence: z.array(SemanticEvidenceCitationSchema).min(1),
    rationale: z.string().min(1),
    materialConcern: z.string().min(1).nullable(),
    limitations: z.array(z.string().min(1)),
  })
  .strict();
export type AdjudicatorFinding = z.infer<typeof AdjudicatorFindingSchema>;

export const AdjudicatorUsageSchema = z
  .object({
    inputTokens: z.number().int().min(0),
    outputTokens: z.number().int().min(0),
    totalTokens: z.number().int().min(0),
    costUsd: z.number().min(0),
  })
  .strict();
export type AdjudicatorUsage = z.infer<typeof AdjudicatorUsageSchema>;

export const AdjudicatorInvocationSchema = z
  .object({
    invocationId: z.string().min(1),
    adjudicationPolicyVersion: z.literal(ADJUDICATION_POLICY_VERSION),
    adjudicatorRole: z.enum(ADJUDICATOR_ROLES),
    reviewerRole: z.enum(['reviewer-a', 'reviewer-b']),
    claimId: z.string().min(1),
    candidateId: z.string().min(1),
    packetId: z.string().min(1),
    packetSha256: Sha256Schema,
    promptPath: z.string().min(1),
    promptSha256: Sha256Schema,
    provider: z.string().min(1),
    model: z.string().min(1),
    runner: z.string().min(1),
    sessionId: z.string().min(1).nullable(),
    responseId: z.string().min(1).nullable(),
    startedAt: IsoDateTimeSchema,
    finishedAt: IsoDateTimeSchema.nullable(),
    durationMs: z.number().int().min(0),
    status: z.enum(['completed', 'failed']),
    exitCode: z.number().int().nullable(),
    rawOutput: z.string(),
    result: AdjudicatorFindingSchema.nullable(),
    outputSha256: Sha256Schema.nullable(),
    usage: AdjudicatorUsageSchema.nullable(),
    failureReason: z.string().min(1).nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.status === 'completed' &&
      (!value.result || !value.outputSha256 || !value.finishedAt)
    ) {
      ctx.addIssue({
        code: 'custom',
        message:
          'Completed adjudicator invocations require a result, output hash, and finish time.',
      });
    }
    if (value.status !== 'completed' && value.result) {
      ctx.addIssue({
        code: 'custom',
        message: 'Failed adjudicator invocations cannot contain a result.',
      });
    }
    if (
      value.reviewerRole !== ADJUDICATOR_ROLE_REVIEWER[value.adjudicatorRole]
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Adjudicator role must map to its fixed reviewer slot.',
      });
    }
  });
export type AdjudicatorInvocation = z.infer<typeof AdjudicatorInvocationSchema>;

export const AdjudicatorInvocationSetSchema = z
  .object({
    schemaVersion: z.literal('1'),
    adjudicationPolicyVersion: z.literal(ADJUDICATION_POLICY_VERSION),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
    invocations: z.array(AdjudicatorInvocationSchema),
  })
  .strict();
export type AdjudicatorInvocationSet = z.infer<
  typeof AdjudicatorInvocationSetSchema
>;

export const assertAdjudicatorCitations = (
  packet: SemanticEvidencePacket,
  finding: AdjudicatorFinding,
): void => {
  if (finding.claimId !== packet.claimId)
    throw new Error(
      `Adjudicator finding claim ${finding.claimId} does not match packet ${packet.claimId}.`,
    );
  assertSemanticFindingCitations(packet, {
    ...finding,
    proposedCorrection: null,
  });
};

export type AdjudicatedEligibility = {
  eligible: boolean;
  reasons: string[];
  materiality: MaterialityAssessment;
};

/**
 * Combines two fresh independent adjudicator findings. Both must directly
 * support the claim wording for the same subject, neither may raise a material
 * concern, and their remaining differences must be non-material under
 * adjudication-materiality-v2.
 */
export const assessAdjudicatedEligibility = (
  reviewerA: AdjudicatorFinding,
  reviewerB: AdjudicatorFinding,
): AdjudicatedEligibility => {
  const reasons: string[] = [];
  const materiality = assessMateriality(
    { ...reviewerA, proposedCorrection: null },
    { ...reviewerB, proposedCorrection: null },
  );
  if (reviewerA.verdict !== 'supported' || reviewerB.verdict !== 'supported')
    reasons.push('adjudicated-verdict-not-supported');
  if (
    reviewerA.identityAssessment !== 'confirmed' ||
    reviewerB.identityAssessment !== 'confirmed'
  )
    reasons.push('adjudicated-identity-not-confirmed');
  if (reviewerA.materialConcern !== null || reviewerB.materialConcern !== null)
    reasons.push('adjudicated-material-concern');
  for (const [index, finding] of [reviewerA, reviewerB].entries()) {
    const slot = index === 0 ? 'reviewer-a' : 'reviewer-b';
    if (
      finding.temporalAssessment.requiresDate &&
      !finding.temporalAssessment.sourceSupportsTemporalWording
    )
      reasons.push(`adjudicated-temporal-unsupported:${slot}`);
  }
  if (materiality.material) reasons.push('adjudicated-material-difference');
  return { eligible: reasons.length === 0, reasons, materiality };
};
