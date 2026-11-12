import { z } from 'zod';
import {
  BasicProfileAttributionSchema,
  BasicProfileCurrentStatusSchema,
  BasicProfileFieldSchema,
  BasicProfileSourceClassSchema,
  BasicProfileVerdictSchema,
} from '../../src/data/basic-profiles/schema';

const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const IsoDateTimeSchema = z.iso.datetime();
const YearSchema = z
  .string()
  .regex(/^\d{4}(-\d{2})?$/)
  .nullable();

export const BatchSourceSchema = z
  .object({
    sourceId: z.string().min(1).max(120),
    sourceClass: BasicProfileSourceClassSchema,
    publisher: z.string().min(1).max(120),
    url: z.url().max(500),
    publishedAt: IsoDateSchema.nullable(),
    retrievedAt: IsoDateTimeSchema,
    excerpt: z.string().min(10).max(1600),
    page: z.number().int().positive().nullable(),
    snapshotSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
  })
  .strict();

export const ResearcherClaimSchema = z
  .object({
    claimId: z.string().regex(/^bp-[a-z0-9-]{4,120}$/),
    candidateId: z.string().min(1),
    field: BasicProfileFieldSchema,
    value: z.string().min(1).max(240),
    detail: z.string().max(500).nullable(),
    organization: z.string().max(120).nullable(),
    validFrom: YearSchema,
    validTo: YearSchema,
    currentStatus: BasicProfileCurrentStatusSchema,
    attribution: BasicProfileAttributionSchema,
    source: BatchSourceSchema,
    notes: z.string().max(300).nullable(),
  })
  .strict();

export const IdentitySignalSchema = z
  .object({
    type: z.enum([
      'official-roster-name',
      'official-roster-district',
      'official-roster-birth-date',
      'official-roster-party',
      'official-roster-ballot-number',
      'institutional-biographical-record',
      'election-bulletin',
      'other',
    ]),
    value: z.string().min(1).max(200),
    sourceId: z.string().min(1).max(120),
  })
  .strict();

export const ResearcherCandidateSchema = z
  .object({
    candidateId: z.string().min(1),
    displayName: z.string().min(1),
    districtId: z.string().min(1),
    identityStatus: z.enum(['resolved', 'ambiguous', 'conflict']),
    identitySignals: z.array(IdentitySignalSchema).min(2),
    status: z.enum([
      'researching',
      'research-completed',
      'needs-additional-evidence',
      'publication-blocked',
    ]),
    claims: z.array(ResearcherClaimSchema),
    gaps: z.array(z.string().max(200)),
    notes: z.string().max(600).nullable(),
  })
  .strict();

export const ResearcherBatchSchema = z
  .object({
    batchId: z.string().regex(/^batch-\d{2}$/),
    generatedAt: IsoDateTimeSchema,
    researcher: z.literal('candidate-researcher'),
    candidates: z.array(ResearcherCandidateSchema).min(1),
  })
  .strict();

export const ReopenedEvidenceSchema = z
  .object({
    url: z.url().max(500),
    retrievedAt: IsoDateTimeSchema,
    accessible: z.boolean(),
    excerpt: z.string().min(10).max(1600),
    matchesClaim: z.boolean(),
  })
  .strict();

export const VerifierChecksSchema = z
  .object({
    identityMatch: z.boolean(),
    supportsField: z.boolean(),
    dateConsistent: z.boolean(),
    currentStatusCorrect: z.boolean(),
  })
  .strict();

export const VerifierDecisionSchema = z
  .object({
    decisionId: z.string().min(1).max(120),
    claimId: z.string().min(1).max(120),
    candidateId: z.string().min(1),
    verdict: BasicProfileVerdictSchema,
    rationale: z.string().min(10).max(800),
    reopenedEvidence: ReopenedEvidenceSchema,
    checks: VerifierChecksSchema,
    correction: z.string().max(500).nullable(),
  })
  .strict();

export const VerifierBatchSchema = z
  .object({
    batchId: z.string().regex(/^batch-\d{2}$/),
    generatedAt: IsoDateTimeSchema,
    verifier: z.literal('candidate-verifier'),
    decisions: z.array(VerifierDecisionSchema),
  })
  .strict();

export type ResearcherBatch = z.infer<typeof ResearcherBatchSchema>;
export type ResearcherClaim = z.infer<typeof ResearcherClaimSchema>;
export type VerifierBatch = z.infer<typeof VerifierBatchSchema>;
export type VerifierDecision = z.infer<typeof VerifierDecisionSchema>;
