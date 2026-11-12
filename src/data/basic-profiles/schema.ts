import { z } from 'zod';

export const BASIC_PROFILE_DATASET_ID =
  'kaohsiung-2026-candidate-basic-profiles-publication';
export const BASIC_PROFILE_POLICY_VERSION =
  'basic-profile-machine-verification-v1';
export const BASIC_PROFILE_POLICY_NAME = '獨立查核基本資料政策 v1';

export const BasicProfileFieldSchema = z.enum([
  'education',
  'professional-experience',
  'public-service',
  'current-position',
  'official-website',
  'biographical-note',
]);
export type BasicProfileField = z.infer<typeof BasicProfileFieldSchema>;

export const BASIC_PROFILE_FIELDS = BasicProfileFieldSchema.options;

export const BasicProfileFieldLabels: Record<BasicProfileField, string> = {
  education: '學歷',
  'professional-experience': '專業與工作經歷',
  'public-service': '公共服務經歷',
  'current-position': '目前職務',
  'official-website': '官方網站或公開頁面',
  'biographical-note': '其他可查證背景',
};

export const BasicProfileSourceClassSchema = z.enum([
  'kcc-current-member-directory',
  'kcc-member-profile',
  'moi-local-official-detail',
  'legislative-yuan',
  'cec-election-bulletin',
  'government-record',
  'university-record',
  'candidate-official-site',
  'candidate-social-profile',
  'political-party-site',
  'reputable-news',
  'wikipedia-reference',
]);
export type BasicProfileSourceClass = z.infer<
  typeof BasicProfileSourceClassSchema
>;

export const BASIC_PROFILE_SOURCE_CLASS_LABELS: Record<
  BasicProfileSourceClass,
  string
> = {
  'kcc-current-member-directory': '高雄市議會本屆議員名錄',
  'kcc-member-profile': '高雄市議會議員簡介',
  'moi-local-official-detail': '內政部地方公職人員資訊',
  'legislative-yuan': '立法院',
  'cec-election-bulletin': '中央選舉委員會選舉公報',
  'government-record': '政府機關公開紀錄',
  'university-record': '學校公開紀錄',
  'candidate-official-site': '候選人官方網站',
  'candidate-social-profile': '候選人公開社群頁面',
  'political-party-site': '政黨官方網站',
  'reputable-news': '新聞媒體報導',
  'wikipedia-reference': '維基百科（僅供查找線索）',
};

export const BasicProfileAttributionSchema = z.enum([
  'institutional-record',
  'candidate-statement',
  'independently-corroborated',
]);
export type BasicProfileAttribution = z.infer<
  typeof BasicProfileAttributionSchema
>;

export const BASIC_PROFILE_ATTRIBUTION_LABELS: Record<
  BasicProfileAttribution,
  string
> = {
  'institutional-record': '機構紀錄',
  'candidate-statement': '候選人自行填列',
  'independently-corroborated': '獨立佐證',
};

export const BasicProfileCurrentStatusSchema = z.enum([
  'current',
  'historical',
  'unknown',
]);

export const BasicProfileVerdictSchema = z.enum([
  'verified',
  'partially-supported',
  'insufficient-evidence',
  'conflicting-evidence',
  'wrong-identity',
  'outdated',
  'source-unavailable',
]);
export type BasicProfileVerdict = z.infer<typeof BasicProfileVerdictSchema>;

const YearSchema = z
  .string()
  .regex(/^\d{4}(-\d{2})?$/)
  .nullable();

export const BasicProfileEvidenceSchema = z
  .object({
    sourceId: z.string().min(1).max(120),
    sourceClass: BasicProfileSourceClassSchema,
    publisher: z.string().min(1).max(120),
    url: z.url().max(500),
    publishedAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
    retrievedAt: z.iso.datetime(),
    excerpt: z.string().min(10).max(1600),
    page: z.number().int().positive().nullable(),
    snapshotSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
  })
  .strict();

export const BasicProfileVerificationSchema = z
  .object({
    decisionId: z.string().min(1).max(120),
    verdict: z.literal('verified'),
    verifiedAt: z.iso.datetime(),
    verifierRunId: z.string().min(1).max(120),
    rationale: z.string().min(10).max(800),
  })
  .strict();

export const BasicProfileClaimSchema = z
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
    evidence: BasicProfileEvidenceSchema,
    verification: BasicProfileVerificationSchema,
  })
  .strict()
  .superRefine((claim, ctx) => {
    if (claim.currentStatus === 'current' && claim.validTo !== null) {
      ctx.addIssue({
        code: 'custom',
        path: ['validTo'],
        message: 'A current claim must not carry an end date.',
      });
    }
    if (
      claim.currentStatus === 'historical' &&
      claim.validTo === null &&
      claim.field === 'current-position'
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['validTo'],
        message: 'A historical current-position claim needs an end date.',
      });
    }
    if (
      claim.field === 'official-website' &&
      claim.currentStatus === 'historical'
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['currentStatus'],
        message: 'Official links cannot be historical claims.',
      });
    }
    if (
      claim.field === 'current-position' &&
      claim.attribution === 'candidate-statement'
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['attribution'],
        message:
          'Current positions require institutional or corroborated evidence.',
      });
    }
    if (
      claim.validFrom !== null &&
      claim.validTo !== null &&
      claim.validTo < claim.validFrom
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['validTo'],
        message: 'validTo cannot precede validFrom.',
      });
    }
  });

export type BasicProfileClaim = z.infer<typeof BasicProfileClaimSchema>;

export const BasicProfileCandidateCoverageSchema = z
  .object({
    candidateId: z.string().min(1),
    displayName: z.string().min(1),
    districtId: z.string().min(1),
    districtLabel: z.string().min(1),
    claimCount: z.number().int().nonnegative(),
    fields: z.array(BasicProfileFieldSchema),
    status: z.enum(['published', 'no-verified-claims']),
    gapFields: z.array(BasicProfileFieldSchema),
  })
  .strict();

export const BasicProfilePublicationSummarySchema = z
  .object({
    candidateCount: z.number().int().nonnegative(),
    candidatesWithPublishedClaims: z.number().int().nonnegative(),
    publishedClaimCount: z.number().int().nonnegative(),
    byField: z.record(BasicProfileFieldSchema, z.number().int().nonnegative()),
    bySourceClass: z.record(
      BasicProfileSourceClassSchema,
      z.number().int().nonnegative(),
    ),
    byDistrict: z.record(z.string(), z.number().int().nonnegative()),
  })
  .strict();

export const BasicProfilePublicationSchema = z
  .object({
    datasetId: z.literal(BASIC_PROFILE_DATASET_ID),
    schemaVersion: z.literal('1'),
    policyVersion: z.literal(BASIC_PROFILE_POLICY_VERSION),
    policyName: z.literal(BASIC_PROFILE_POLICY_NAME),
    snapshotDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    generatedAt: z.iso.datetime(),
    note: z.string().min(1).max(1200),
    claims: z.array(BasicProfileClaimSchema),
    candidates: z.array(BasicProfileCandidateCoverageSchema),
    summary: BasicProfilePublicationSummarySchema,
    checksum: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export type BasicProfilePublication = z.infer<
  typeof BasicProfilePublicationSchema
>;

export type BasicProfilePublicationInput = Omit<
  BasicProfilePublication,
  'checksum'
>;
