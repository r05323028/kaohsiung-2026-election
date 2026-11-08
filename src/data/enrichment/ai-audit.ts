import { z } from 'zod';

const DateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const IsoTimestampSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/);

export const IndependentAuditStatusSchema = z.enum([
  'machine-verified',
  'needs-review',
  'unsupported',
]);
export type IndependentAuditStatus = z.infer<
  typeof IndependentAuditStatusSchema
>;

export const IndependentPassStatusSchema = z.enum([
  ...IndependentAuditStatusSchema.options,
  'unavailable',
]);
export type IndependentPassStatus = z.infer<typeof IndependentPassStatusSchema>;

export const AuditCheckSchema = z.object({
  sourceReopened: z.enum(['unchanged', 'mismatch', 'unavailable']),
  evidenceSupport: z.enum([
    'direct-and-reopened',
    'direct-but-reopen-uncertain',
    'not-supported',
  ]),
  identity: z.enum(['resolved', 'ambiguous', 'conflicted', 'not-matched']),
  attribution: z.enum(['consistent', 'mismatch', 'needs-review']),
  temporal: z.enum(['dated', 'unknown', 'currentness-needs-review']),
  overstatement: z.enum(['not-detected', 'needs-review', 'unsupported']),
});
export type AuditCheck = z.infer<typeof AuditCheckSchema>;

export const AuditCorrectionSchema = z.object({
  correctionId: z.string().min(1),
  field: z.string().min(1),
  proposedValue: z.string().min(1),
  rationale: z.string().min(1),
  sourceIds: z.array(z.string().min(1)).min(1),
  evidenceIds: z.array(z.string().min(1)).min(1),
  status: z.literal('suggested-needs-human-confirmation'),
});
export type AuditCorrection = z.infer<typeof AuditCorrectionSchema>;

export const IndependentAuditFindingSchema = z.object({
  findingId: z.string().min(1),
  claimId: z.string().min(1),
  candidateId: z.string().min(1),
  category: z.string().min(1),
  claimType: z.string().min(1),
  firstPassStatus: IndependentAuditStatusSchema,
  firstPassMethod: z.literal('reopen-and-rule-audit-v1'),
  secondPassStatus: IndependentPassStatusSchema,
  secondPassMethod: z.enum([
    'independent-reopen-and-rule-audit-v1',
    'unavailable-agent-review',
  ]),
  comparison: z.enum(['agree', 'disagree', 'unavailable']),
  rationale: z.string().min(1),
  secondPassRationale: z.string().min(1),
  sourceIds: z.array(z.string().min(1)).min(1),
  evidenceIds: z.array(z.string().min(1)).min(1),
  identityObservationIds: z.array(z.string().min(1)).min(1),
  checks: AuditCheckSchema,
  blockers: z.array(z.string().min(1)),
  corrections: z.array(AuditCorrectionSchema),
});
export type IndependentAuditFinding = z.infer<
  typeof IndependentAuditFindingSchema
>;

export const IndependentAgentAttemptSchema = z.object({
  status: z.enum(['unavailable', 'completed']),
  agent: z.string().min(1),
  runId: z.string().min(1),
  resultPath: z.string().min(1),
  limitation: z.string().min(1),
});
export type IndependentAgentAttempt = z.infer<
  typeof IndependentAgentAttemptSchema
>;

export const IndependentAIAuditReportSchema = z.object({
  reportId: z.literal('kaohsiung-2026-zuoying-mayoral-independent-ai-review'),
  datasetId: z.literal('kaohsiung-2026-zuoying-mayoral-enrichment'),
  snapshotDate: DateOnlySchema,
  generatedAt: IsoTimestampSchema,
  methods: z.object({
    firstPass: z.literal('reopen-and-rule-audit-v1'),
    secondPass: z.literal('independent-reopen-and-rule-audit-v1'),
    rawSourcePolicy: z.literal('read-only-reopen-with-sha256-and-byte-length'),
  }),
  independentAgentAttempt: IndependentAgentAttemptSchema,
  independentAgentAttempts: z.array(IndependentAgentAttemptSchema).min(1),
  findings: z.array(IndependentAuditFindingSchema).length(143),
  summary: z.object({
    claimCount: z.literal(143),
    firstPass: z.record(z.string(), z.number().int().nonnegative()),
    secondPass: z.record(z.string(), z.number().int().nonnegative()),
    comparison: z.object({
      agree: z.number().int().nonnegative(),
      disagree: z.number().int().nonnegative(),
      unavailable: z.number().int().nonnegative(),
    }),
    sourceReopenMismatches: z.number().int().nonnegative(),
    unsupportedClaims: z.number().int().nonnegative(),
    needsReviewClaims: z.number().int().nonnegative(),
    correctionCount: z.number().int().nonnegative(),
    blockerCount: z.number().int().nonnegative(),
  }),
  notes: z.array(z.string().min(1)).min(1),
});
export type IndependentAIAuditReport = z.infer<
  typeof IndependentAIAuditReportSchema
>;

export function validateIndependentAuditReport(
  input: unknown,
): IndependentAIAuditReport {
  const parsed = IndependentAIAuditReportSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(
      `Independent AI audit validation failed:\n${parsed.error.issues
        .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
        .join('\n')}`,
    );
  }
  const ids = parsed.data.findings.map((finding) => finding.claimId);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicateIds.length > 0) {
    throw new Error(
      `Independent AI audit has duplicate claim IDs: ${[...new Set(duplicateIds)].join(', ')}`,
    );
  }
  const tally = (values: string[]): Record<string, number> =>
    values.reduce<Record<string, number>>((counts, value) => {
      counts[value] = (counts[value] ?? 0) + 1;
      return counts;
    }, {});
  const expectedFirst = tally(
    parsed.data.findings.map((finding) => finding.firstPassStatus),
  );
  const expectedSecond = tally(
    parsed.data.findings.map((finding) => finding.secondPassStatus),
  );
  const expectedComparison = tally(
    parsed.data.findings.map((finding) => finding.comparison),
  );
  if (parsed.data.summary.claimCount !== parsed.data.findings.length) {
    throw new Error(
      'Independent AI audit summary claim count does not match findings.',
    );
  }
  const countsMatch = (
    expected: Record<string, number>,
    actual: Record<string, number>,
    keys: string[],
  ): boolean =>
    keys.every((key) => (expected[key] ?? 0) === (actual[key] ?? 0)) &&
    Object.keys(actual).every((key) => keys.includes(key));
  if (
    !countsMatch(expectedFirst, parsed.data.summary.firstPass, [
      'machine-verified',
      'needs-review',
      'unsupported',
    ])
  ) {
    throw new Error(
      'Independent AI audit first-pass counts do not match findings.',
    );
  }
  if (
    !countsMatch(expectedSecond, parsed.data.summary.secondPass, [
      'machine-verified',
      'needs-review',
      'unsupported',
      'unavailable',
    ])
  ) {
    throw new Error(
      'Independent AI audit second-pass counts do not match findings.',
    );
  }
  if (
    parsed.data.summary.comparison.agree +
      parsed.data.summary.comparison.disagree +
      parsed.data.summary.comparison.unavailable !==
    143
  ) {
    throw new Error(
      'Independent AI audit comparison counts must cover all 143 claims.',
    );
  }
  if (
    !countsMatch(expectedComparison, parsed.data.summary.comparison, [
      'agree',
      'disagree',
      'unavailable',
    ])
  ) {
    throw new Error(
      'Independent AI audit comparison counts do not match findings.',
    );
  }
  const expectedCorrections = parsed.data.findings.reduce(
    (count, finding) => count + finding.corrections.length,
    0,
  );
  const expectedBlockers = parsed.data.findings.reduce(
    (count, finding) => count + finding.blockers.length,
    0,
  );
  if (parsed.data.summary.correctionCount !== expectedCorrections) {
    throw new Error(
      'Independent AI audit correction count does not match findings.',
    );
  }
  if (parsed.data.summary.blockerCount !== expectedBlockers) {
    throw new Error(
      'Independent AI audit blocker count does not match findings.',
    );
  }
  if (
    parsed.data.summary.unsupportedClaims !== (expectedFirst.unsupported ?? 0)
  ) {
    throw new Error(
      'Independent AI audit unsupported count does not match findings.',
    );
  }
  if (
    parsed.data.summary.needsReviewClaims !==
    (expectedFirst['needs-review'] ?? 0)
  ) {
    throw new Error(
      'Independent AI audit needs-review count does not match findings.',
    );
  }
  if (
    parsed.data.summary.sourceReopenMismatches !==
    parsed.data.findings.filter(
      (finding) => finding.checks.sourceReopened === 'mismatch',
    ).length
  ) {
    throw new Error(
      'Independent AI audit source mismatch count does not match findings.',
    );
  }
  return parsed.data;
}
