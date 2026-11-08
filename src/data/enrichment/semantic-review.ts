import { z } from 'zod';

import type {
  EnrichmentClaim,
  EnrichmentEvidence,
  EnrichmentIdentityObservation,
  EnrichmentSourceAttempt,
} from './schema';

export const SemanticVerdictSchema = z.enum([
  'supported',
  'partially-supported',
  'insufficient-evidence',
  'contradicted',
  'wrong-identity',
]);
export type SemanticVerdict = z.infer<typeof SemanticVerdictSchema>;

export const SemanticExecutionStatusSchema = z.enum([
  'completed',
  'failed',
  'timeout',
  'invalid-output',
  'unavailable',
]);
export type SemanticExecutionStatus = z.infer<
  typeof SemanticExecutionStatusSchema
>;

export const SemanticReviewerRoleSchema = z.enum(['reviewer-a', 'reviewer-b']);
export type SemanticReviewerRole = z.infer<typeof SemanticReviewerRoleSchema>;

const Sha256Schema = z
  .string()
  .regex(/^[a-f0-9]{64}$/u, 'Expected a lowercase SHA-256 digest.');
const IsoDateTimeSchema = z.iso.datetime({ offset: true });

export const SemanticEvidenceCitationSchema = z
  .object({
    sourceId: z.string().min(1),
    evidenceId: z.string().min(1),
    location: z.string().min(1),
    excerpt: z.string().min(1),
    relationship: z.enum([
      'supports',
      'partially-supports',
      'contradicts',
      'context',
    ]),
  })
  .strict();
export type SemanticEvidenceCitation = z.infer<
  typeof SemanticEvidenceCitationSchema
>;

export const SemanticTemporalAssessmentSchema = z
  .object({
    requiresDate: z.boolean(),
    sourceSupportsTemporalWording: z.boolean(),
    assessment: z.string().min(1),
  })
  .strict();
export type SemanticTemporalAssessment = z.infer<
  typeof SemanticTemporalAssessmentSchema
>;

export const SemanticCorrectionSchema = z
  .object({
    originalWording: z.string().min(1),
    proposedWording: z.string().min(1),
    rationale: z.string().min(1),
    sourceIds: z.array(z.string().min(1)).min(1),
    evidenceIds: z.array(z.string().min(1)).min(1),
  })
  .strict();
export type SemanticCorrection = z.infer<typeof SemanticCorrectionSchema>;

export const SemanticFindingResultSchema = z
  .object({
    claimId: z.string().min(1),
    verdict: SemanticVerdictSchema,
    identityAssessment: z.enum(['confirmed', 'uncertain', 'wrong-identity']),
    attributionAssessment: z.string().min(1),
    temporalAssessment: SemanticTemporalAssessmentSchema,
    evidence: z.array(SemanticEvidenceCitationSchema).min(1),
    rationale: z.string().min(1),
    proposedCorrection: SemanticCorrectionSchema.nullable(),
    limitations: z.array(z.string().min(1)),
  })
  .strict();
export type SemanticFindingResult = z.infer<typeof SemanticFindingResultSchema>;

export const SemanticEvidencePacketSchema = z
  .object({
    packetId: z.string().min(1),
    packetSha256: Sha256Schema,
    claimId: z.string().min(1),
    candidateId: z.string().min(1),
    candidateName: z.string().min(1),
    personId: z.string().min(1),
    electionType: z.string().min(1),
    districtId: z.string().nullable(),
    candidateStatus: z.string().min(1),
    formalStatus: z.string().min(1),
    partyStatus: z.string().min(1),
    claim: z
      .object({
        category: z.string().min(1),
        claimType: z.string().min(1),
        title: z.string().min(1),
        organization: z.string().nullable(),
        value: z.string().min(1),
        sourcePublicationDate: z.string().nullable(),
        validFrom: z.string().nullable(),
        validTo: z.string().nullable(),
        temporalPrecision: z.string().min(1),
        currentStatus: z.string().min(1),
        attribution: z.string().min(1),
        sourceDependency: z.string().min(1),
      })
      .strict(),
    source: z
      .object({
        sourceId: z.string().min(1),
        attemptId: z.string().min(1),
        url: z.string().min(1),
        method: z.string().min(1),
        rawPath: z.string().min(1),
        sha256: Sha256Schema,
        byteLength: z.number().int().nonnegative(),
        httpStatus: z.number().int().nullable(),
        sourceRetrievedAt: z.string().nullable(),
        timestampQuality: z.string().min(1),
        rawContext: z.string().min(1),
        sourceTextContext: z.string().min(1),
      })
      .strict(),
    evidence: z
      .array(
        z
          .object({
            evidenceId: z.string().min(1),
            sourceId: z.string().min(1),
            documentLocation: z.string().min(1),
            excerpt: z.string().min(1),
            supportType: z.string().min(1),
            attribution: z.string().min(1),
          })
          .strict(),
      )
      .min(1),
    identity: z
      .array(
        z
          .object({
            observationId: z.string().min(1),
            observedName: z.string().min(1),
            jurisdiction: z.string().min(1),
            observedOffice: z.string().min(1),
            matchBasis: z.string().min(1),
            isNameOnlyMatch: z.literal(false),
          })
          .strict(),
      )
      .min(1),
    packetNotes: z.array(z.string().min(1)),
  })
  .strict();
export type SemanticEvidencePacket = z.infer<
  typeof SemanticEvidencePacketSchema
>;

export const SemanticInvocationSchema = z
  .object({
    invocationId: z.string().min(1),
    runId: z.string().min(1).nullable(),
    reviewerRole: SemanticReviewerRoleSchema,
    claimId: z.string().min(1),
    model: z.string().min(1),
    runner: z.string().min(1),
    sessionId: z.string().nullable(),
    packetId: z.string().min(1),
    packetSha256: Sha256Schema,
    outputSha256: Sha256Schema.nullable(),
    status: SemanticExecutionStatusSchema,
    startedAt: IsoDateTimeSchema,
    finishedAt: IsoDateTimeSchema.nullable(),
    inputTokens: z.number().int().nonnegative().nullable(),
    outputTokens: z.number().int().nonnegative().nullable(),
    cost: z.number().nonnegative().nullable(),
    error: z.string().nullable(),
    rawOutput: z.string().nullable(),
    result: SemanticFindingResultSchema.nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.status === 'completed' &&
      (!value.runId ||
        !value.outputSha256 ||
        !value.result ||
        !value.finishedAt)
    ) {
      ctx.addIssue({
        code: 'custom',
        message:
          'Completed invocations require run ID, output hash, result, and finishedAt.',
      });
    }
    if (value.status !== 'completed' && value.result) {
      ctx.addIssue({
        code: 'custom',
        message:
          'Failed or unavailable invocations cannot contain a semantic result.',
      });
    }
  });
export type SemanticInvocation = z.infer<typeof SemanticInvocationSchema>;

export const SemanticFailedInvocationSchema = z
  .object({
    invocationId: z.string().min(1),
    runId: z.string().min(1).nullable(),
    reviewerRole: SemanticReviewerRoleSchema,
    claimId: z.string().min(1),
    model: z.string().min(1),
    runner: z.string().min(1),
    sessionId: z.string().nullable(),
    packetId: z.string().min(1),
    packetSha256: Sha256Schema,
    outputSha256: Sha256Schema.nullable(),
    status: z.enum(['failed', 'timeout', 'invalid-output', 'unavailable']),
    startedAt: IsoDateTimeSchema,
    finishedAt: IsoDateTimeSchema.nullable(),
    error: z.string().min(1),
    rawOutput: z.string().nullable(),
  })
  .strict();
export type SemanticFailedInvocation = z.infer<
  typeof SemanticFailedInvocationSchema
>;

export const SemanticComparisonSchema = z
  .object({
    claimId: z.string().min(1),
    reviewerAInvocationId: z.string().min(1),
    reviewerBInvocationId: z.string().min(1),
    agreement: z.enum([
      'full-agreement',
      'same-verdict-different-reasoning',
      'partial-disagreement',
      'direct-contradiction',
      'unavailable',
    ]),
    verdictA: SemanticVerdictSchema.nullable(),
    verdictB: SemanticVerdictSchema.nullable(),
    disputedPropositions: z.array(z.string().min(1)),
    differenceDimensions: z.array(
      z.enum([
        'verdict',
        'identity',
        'attribution',
        'temporal',
        'evidence',
        'correction',
        'limitations',
      ]),
    ),
    adjudicationRecommendation: z.string().min(1),
    requiresHumanDecision: z.boolean(),
  })
  .strict();
export type SemanticComparison = z.infer<typeof SemanticComparisonSchema>;

export const SemanticAgentAttemptSchema = z
  .object({
    attemptId: z.string().min(1),
    provider: z.string().min(1),
    model: z.string().min(1),
    status: z.enum(['completed', 'failed', 'unavailable']),
    error: z.string().nullable(),
    findingsProduced: z.number().int().nonnegative(),
    note: z.string().min(1),
  })
  .strict();
export type SemanticAgentAttempt = z.infer<typeof SemanticAgentAttemptSchema>;

export const SemanticReviewReportSchema = z
  .object({
    schemaVersion: z.literal('1'),
    datasetId: z.literal('kaohsiung-2026-zuoying-mayoral-enrichment'),
    snapshotDate: z.iso.date(),
    generatedAt: IsoDateTimeSchema,
    packetCount: z.number().int().nonnegative(),
    packets: z.array(SemanticEvidencePacketSchema),
    invocations: z.array(SemanticInvocationSchema),
    failedInvocations: z.array(SemanticFailedInvocationSchema),
    comparisons: z.array(SemanticComparisonSchema),
    agentAttempts: z.array(SemanticAgentAttemptSchema),
    summary: z
      .object({
        claims: z.number().int().nonnegative(),
        reviewerASuccessful: z.number().int().nonnegative(),
        reviewerBSuccessful: z.number().int().nonnegative(),
        completedPairs: z.number().int().nonnegative(),
        failedInvocations: z.number().int().nonnegative(),
        supported: z.number().int().nonnegative(),
        partiallySupported: z.number().int().nonnegative(),
        insufficientEvidence: z.number().int().nonnegative(),
        contradicted: z.number().int().nonnegative(),
        wrongIdentity: z.number().int().nonnegative(),
        disagreements: z.number().int().nonnegative(),
        corrections: z.number().int().nonnegative(),
        humanApproved: z.literal(0),
        published: z.literal(0),
      })
      .strict(),
    notes: z.array(z.string().min(1)),
  })
  .strict();
export type SemanticReviewReport = z.infer<typeof SemanticReviewReportSchema>;

export const assertSemanticFindingCitations = (
  packet: SemanticEvidencePacket,
  result: SemanticFindingResult,
): void => {
  const evidenceById = new Map(
    packet.evidence.map((item) => [item.evidenceId, item]),
  );
  const allowedTexts = [
    packet.source.sourceTextContext,
    packet.source.rawContext,
    ...packet.evidence.map((item) => item.excerpt),
  ];
  for (const citation of result.evidence) {
    const evidence = evidenceById.get(citation.evidenceId);
    if (!evidence || evidence.sourceId !== citation.sourceId) {
      throw new Error(
        `Citation references an unknown evidence/source pair for ${packet.claimId}.`,
      );
    }
    if (!allowedTexts.some((text) => text.includes(citation.excerpt))) {
      throw new Error(
        `Citation excerpt is not a contiguous substring of packet evidence for ${packet.claimId}.`,
      );
    }
  }
  if (result.proposedCorrection) {
    for (const evidenceId of result.proposedCorrection.evidenceIds) {
      if (!evidenceById.has(evidenceId))
        throw new Error(
          `Correction references unknown evidence ${evidenceId} for ${packet.claimId}.`,
        );
    }
    for (const sourceId of result.proposedCorrection.sourceIds) {
      if (sourceId !== packet.source.sourceId)
        throw new Error(
          `Correction references unknown source ${sourceId} for ${packet.claimId}.`,
        );
    }
  }
};

export const validateSemanticReviewReport = (
  input: unknown,
): SemanticReviewReport => {
  const report = SemanticReviewReportSchema.parse(input);
  if (
    report.packetCount !== report.packets.length ||
    report.summary.claims !== report.packetCount
  ) {
    throw new Error('Semantic report packet and claim counts must match.');
  }
  const claimIds = new Set(report.packets.map((packet) => packet.claimId));
  if (claimIds.size !== report.packetCount)
    throw new Error('Semantic packets must have unique claim IDs.');
  const packetByClaimId = new Map(
    report.packets.map((packet) => [packet.claimId, packet]),
  );
  const invocations = report.invocations;
  const keySet = new Set(
    invocations.map(
      (invocation) => `${invocation.reviewerRole}:${invocation.claimId}`,
    ),
  );
  if (keySet.size !== invocations.length)
    throw new Error(
      'Semantic invocations must be unique by reviewer and claim.',
    );
  for (const invocation of [...invocations, ...report.failedInvocations]) {
    if (!claimIds.has(invocation.claimId))
      throw new Error(
        `Invocation references unknown claim ${invocation.claimId}.`,
      );
    if (
      invocation.packetSha256 !==
      packetByClaimId.get(invocation.claimId)?.packetSha256
    ) {
      throw new Error(
        `Invocation packet checksum mismatch for ${invocation.claimId}.`,
      );
    }
  }
  for (const invocation of invocations) {
    const packet = packetByClaimId.get(invocation.claimId);
    if (!packet || !invocation.result)
      throw new Error(
        `Completed invocation is missing a packet/result for ${invocation.claimId}.`,
      );
    if (invocation.result.claimId !== invocation.claimId)
      throw new Error(`Finding claim ID mismatch for ${invocation.claimId}.`);
    assertSemanticFindingCitations(packet, invocation.result);
  }
  const comparisons = new Set(
    report.comparisons.map((comparison) => comparison.claimId),
  );
  if (comparisons.size !== report.comparisons.length)
    throw new Error('Semantic comparisons must be unique by claim ID.');
  if (
    report.summary.completedPairs !==
    report.comparisons.filter(
      (comparison) => comparison.agreement !== 'unavailable',
    ).length
  ) {
    throw new Error(
      'Semantic completed-pair count does not match comparisons.',
    );
  }
  if (report.summary.failedInvocations !== report.failedInvocations.length) {
    throw new Error(
      'Semantic failed-invocation count does not match failed invocations.',
    );
  }
  return report;
};

export type SemanticClaimInput = EnrichmentClaim;
export type SemanticEvidenceInput = EnrichmentEvidence;
export type SemanticObservationInput = EnrichmentIdentityObservation;
export type SemanticSourceInput = EnrichmentSourceAttempt;
