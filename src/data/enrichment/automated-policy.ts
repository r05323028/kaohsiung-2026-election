import { z } from 'zod';

import type { EnrichmentDataset } from './schema';

export const AUTOMATED_POLICY_VERSION =
  'automated-editorial-policy-v1' as const;
export const AUTOMATED_DATASET_ID =
  'kaohsiung-2026-zuoying-mayoral-enrichment' as const;

const Sha256Schema = z
  .string()
  .regex(/^[a-f0-9]{64}$/u, 'Expected a lowercase SHA-256 digest.');
const DateOnlySchema = z.iso.date();
const IsoTimestampSchema = z.iso.datetime({ offset: true });

export const AutomatedDecisionStatusSchema = z.enum([
  'machine-approved',
  'machine-rejected',
  'withdrawn',
]);
export type AutomatedDecisionStatus = z.infer<
  typeof AutomatedDecisionStatusSchema
>;

export const AutomatedCorrectionDispositionSchema = z.enum([
  'none',
  'recorded-not-applied',
  'blocked',
  'applied-to-public-wording',
]);
export type AutomatedCorrectionDisposition = z.infer<
  typeof AutomatedCorrectionDispositionSchema
>;

export const AutomatedSourceVersionSchema = z
  .object({
    sourceId: z.string().min(1),
    sha256: Sha256Schema,
    byteLength: z.number().int().nonnegative(),
    rawPath: z.string().min(1),
  })
  .strict();
export type AutomatedSourceVersion = z.infer<
  typeof AutomatedSourceVersionSchema
>;

export const AutomatedSemanticReviewerSchema = z
  .object({
    invocationId: z.string().min(1),
    runId: z.string().min(1),
    model: z.string().min(1),
    runner: z.string().min(1),
    verdict: z.enum([
      'supported',
      'partially-supported',
      'insufficient-evidence',
      'contradicted',
      'wrong-identity',
    ]),
    identityAssessment: z.enum(['confirmed', 'uncertain', 'wrong-identity']),
    correctionProposed: z.boolean(),
  })
  .strict();
export type AutomatedSemanticReviewer = z.infer<
  typeof AutomatedSemanticReviewerSchema
>;

export const AutomatedSemanticProvenanceSchema = z
  .object({
    packetId: z.string().min(1),
    packetSha256: Sha256Schema,
    reviewerA: AutomatedSemanticReviewerSchema,
    reviewerB: AutomatedSemanticReviewerSchema,
    comparison: z.enum([
      'full-agreement',
      'partial-disagreement',
      'same-verdict-different-reasoning',
      'direct-contradiction',
    ]),
  })
  .strict();
export type AutomatedSemanticProvenance = z.infer<
  typeof AutomatedSemanticProvenanceSchema
>;

export const AutomatedMachineDecisionSchema = z
  .object({
    decisionId: z.string().min(1),
    claimId: z.string().min(1),
    candidateId: z.string().min(1),
    policyVersion: z.literal(AUTOMATED_POLICY_VERSION),
    status: AutomatedDecisionStatusSchema,
    category: z.string().min(1),
    claimType: z.string().min(1),
    originalClaimVersion: Sha256Schema,
    originalWording: z.string().min(1),
    publishedWording: z.string().min(1).nullable(),
    sourceIds: z.array(z.string().min(1)).min(1),
    evidenceIds: z.array(z.string().min(1)).min(1),
    identityObservationIds: z.array(z.string().min(1)).min(1),
    sourceVersions: z.array(AutomatedSourceVersionSchema).min(1),
    semantic: AutomatedSemanticProvenanceSchema,
    verificationMethod: z.string().min(1),
    acceptanceRationale: z.string().min(1),
    blockingReasons: z.array(z.string().min(1)),
    correctionDisposition: AutomatedCorrectionDispositionSchema,
    correctionIds: z.array(z.string().min(1)),
    generatedAt: IsoTimestampSchema,
    publicationTimestamp: IsoTimestampSchema,
    withdrawnAt: IsoTimestampSchema.nullable(),
    withdrawalReason: z.string().min(1).nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.status === 'machine-approved' &&
      value.publishedWording === null
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['publishedWording'],
        message: 'Machine-approved decisions require public wording.',
      });
    }
    if (
      value.status === 'withdrawn' &&
      (!value.withdrawnAt || !value.withdrawalReason)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['withdrawalReason'],
        message: 'Withdrawn decisions require withdrawal metadata.',
      });
    }
    if (
      value.status !== 'withdrawn' &&
      (value.withdrawnAt || value.withdrawalReason)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['withdrawnAt'],
        message: 'Only withdrawn decisions may contain withdrawal metadata.',
      });
    }
  });
export type AutomatedMachineDecision = z.infer<
  typeof AutomatedMachineDecisionSchema
>;

export const AutomatedDecisionSetSchema = z
  .object({
    schemaVersion: z.literal('1'),
    datasetId: z.literal(AUTOMATED_DATASET_ID),
    policyVersion: z.literal(AUTOMATED_POLICY_VERSION),
    snapshotDate: DateOnlySchema,
    generatedAt: IsoTimestampSchema,
    decisions: z.array(AutomatedMachineDecisionSchema).length(143),
    summary: z
      .object({
        totalClaims: z.literal(143),
        machineApproved: z.number().int().nonnegative(),
        machineRejected: z.number().int().nonnegative(),
        withdrawn: z.number().int().nonnegative(),
        correctionTargets: z.number().int().nonnegative(),
        disagreementClaims: z.literal(71),
        humanApproved: z.literal(0),
      })
      .strict(),
    note: z.string().min(1),
  })
  .strict();
export type AutomatedDecisionSet = z.infer<typeof AutomatedDecisionSetSchema>;

export function validateAutomatedDecisionSet(
  input: unknown,
): AutomatedDecisionSet {
  const parsed = AutomatedDecisionSetSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(
      `Automated decision validation failed:\n${parsed.error.issues
        .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
        .join('\n')}`,
    );
  }
  const decisionSet = parsed.data;
  const ids = decisionSet.decisions.map((decision) => decision.claimId);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicates.length > 0) {
    throw new Error(
      `Automated decisions contain duplicate claims: ${[...new Set(duplicates)].join(', ')}`,
    );
  }
  const counts = decisionSet.decisions.reduce(
    (result, decision) => {
      if (decision.status === 'machine-approved') result.machineApproved += 1;
      if (decision.status === 'machine-rejected') result.machineRejected += 1;
      if (decision.status === 'withdrawn') result.withdrawn += 1;
      return result;
    },
    { machineApproved: 0, machineRejected: 0, withdrawn: 0 },
  );
  if (
    counts.machineApproved !== decisionSet.summary.machineApproved ||
    counts.machineRejected !== decisionSet.summary.machineRejected ||
    counts.withdrawn !== decisionSet.summary.withdrawn
  ) {
    throw new Error(
      'Automated decision summary does not match decision statuses.',
    );
  }
  return decisionSet;
}

export type AutomatedPolicyEligibility = {
  eligible: boolean;
  reasons: string[];
  correctionDisposition: AutomatedCorrectionDisposition;
};

export const PERMITTED_TYPES = new Set([
  'education',
  'historical-position',
  'professional-experience',
]);
export const PERMITTED_SOURCE_CLASSES = new Set([
  'kcc-member-profile',
  'legislative-yuan',
]);

export function evaluateAutomatedPolicyEligibility(
  dataset: EnrichmentDataset,
  claimId: string,
  semantic: AutomatedSemanticProvenance,
  sourceAttemptsById: ReadonlyMap<
    string,
    EnrichmentDataset['sourceAttempts'][number]
  >,
  duplicateClaimIds: ReadonlySet<string>,
): AutomatedPolicyEligibility {
  const claim = dataset.claims.find((item) => item.claimId === claimId);
  if (!claim) throw new Error(`Automated policy cannot find claim ${claimId}.`);
  const reasons: string[] = [];
  if (claim.category !== 'basic-biography')
    reasons.push('category-not-permitted');
  if (!PERMITTED_TYPES.has(claim.claimType))
    reasons.push('claim-type-not-permitted');
  if (
    claim.attribution !== 'institutional-record' ||
    claim.sourceDependency !== 'institutional-record'
  ) {
    reasons.push('institutional-attribution-required');
  }
  if (claim.currentStatus !== 'historical')
    reasons.push('historical-status-required');
  if (claim.machineStatus !== 'machine-validated')
    reasons.push('machine-validation-required');
  if (
    semantic.reviewerA.verdict !== 'supported' ||
    semantic.reviewerB.verdict !== 'supported'
  ) {
    reasons.push('semantic-review-not-fully-supported');
  }
  if (
    semantic.reviewerA.identityAssessment !== 'confirmed' ||
    semantic.reviewerB.identityAssessment !== 'confirmed'
  ) {
    reasons.push('semantic-identity-not-confirmed');
  }
  if (duplicateClaimIds.has(claimId))
    reasons.push('duplicate-or-overlap-review');
  for (const sourceId of claim.sourceIds) {
    const source = sourceAttemptsById.get(sourceId);
    if (source?.outcome !== 'retrieved')
      reasons.push(`source-not-retrieved:${sourceId}`);
    if (source && !PERMITTED_SOURCE_CLASSES.has(source.sourceClass)) {
      reasons.push(`source-class-not-permitted:${source.sourceClass}`);
    }
  }
  if (
    semantic.reviewerA.correctionProposed ||
    semantic.reviewerB.correctionProposed
  ) {
    reasons.push('correction-proposed');
  }
  return {
    eligible: reasons.length === 0,
    reasons,
    correctionDisposition:
      semantic.reviewerA.correctionProposed ||
      semantic.reviewerB.correctionProposed
        ? 'blocked'
        : 'none',
  };
}
