import { z } from 'zod';
// The site serves the remediated snapshot (adjudication-materiality-v2).
// data/published/2026/zuoying-mayoral-automated.json stays on disk as the
// v1 publication history and as the withdrawal baseline read by
// scripts/remediation/publish.ts.
import snapshotInput from '../../../data/published/2026/zuoying-mayoral-automated-v2.json';

const DateOnlySchema = z.iso.date();
const IsoTimestampSchema = z.iso.datetime({ offset: true });
const Sha256Schema = z
  .string()
  .regex(/^[a-f0-9]{64}$/u, 'Expected a lowercase SHA-256 digest.');

export const AutomatedPublicClaimSchema = z
  .object({
    claimId: z.string().min(1),
    candidateId: z.string().min(1),
    category: z.string().min(1),
    claimType: z.string().min(1),
    title: z.string().min(1),
    organization: z.string().nullable(),
    value: z.string().min(1),
    sourcePublicationDate: DateOnlySchema.nullable(),
    validFrom: z.string().nullable(),
    validTo: z.string().nullable(),
    temporalPrecision: z.enum(['day', 'month', 'year', 'unknown']),
    currentStatus: z.literal('historical'),
    attribution: z.literal('institutional-record'),
    sourceIds: z.array(z.string().min(1)).min(1),
    evidenceIds: z.array(z.string().min(1)).min(1),
    machineApprovalId: z.string().min(1),
    policyVersion: z.literal('automated-editorial-policy-v1'),
    publicationOrigin: z.literal('automated-policy'),
  })
  .strict();
export type AutomatedPublicClaim = z.infer<typeof AutomatedPublicClaimSchema>;

export const AutomatedPublicSourceSchema = z
  .object({
    sourceId: z.string().min(1),
    url: z.url(),
    publisher: z.string().min(1),
    publicationDate: DateOnlySchema.nullable(),
    verificationStatus: z.literal('Verified'),
    note: z.string().min(1),
  })
  .strict();
export type AutomatedPublicSource = z.infer<typeof AutomatedPublicSourceSchema>;

export const AutomatedPublicationSnapshotSchema = z
  .object({
    schemaVersion: z.literal('1'),
    datasetId: z.literal('kaohsiung-2026-zuoying-mayoral-enrichment'),
    policyVersion: z.literal('automated-editorial-policy-v1'),
    snapshotDate: DateOnlySchema,
    generatedAt: IsoTimestampSchema,
    records: z.array(AutomatedPublicClaimSchema),
    sources: z.array(AutomatedPublicSourceSchema),
    withdrawnClaimIds: z.array(z.string().min(1)),
    checksum: Sha256Schema,
    note: z.string().min(1),
  })
  .strict();
export type AutomatedPublicationSnapshot = z.infer<
  typeof AutomatedPublicationSnapshotSchema
>;

export function validateAutomatedPublicationSnapshot(
  input: unknown,
): AutomatedPublicationSnapshot {
  const parsed = AutomatedPublicationSnapshotSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(
      `Automated publication snapshot validation failed:\n${parsed.error.issues
        .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
        .join('\n')}`,
    );
  }
  const snapshot = parsed.data;
  const claimIds = snapshot.records.map((record) => record.claimId);
  if (new Set(claimIds).size !== claimIds.length) {
    throw new Error(
      'Automated publication snapshot contains duplicate claim IDs.',
    );
  }
  const sourceIds = new Set(snapshot.sources.map((source) => source.sourceId));
  for (const record of snapshot.records) {
    for (const sourceId of record.sourceIds) {
      if (!sourceIds.has(sourceId)) {
        throw new Error(
          `Automated publication record ${record.claimId} is missing source ${sourceId}.`,
        );
      }
    }
  }
  return snapshot;
}

export const automatedPublicationSnapshot =
  validateAutomatedPublicationSnapshot(snapshotInput);

export type AutomatedCandidateReadModel = {
  status: 'published' | 'none';
  claims: AutomatedPublicClaim[];
  sources: AutomatedPublicSource[];
  note: string;
};

export function getAutomatedCandidateReadModel(
  candidateId: string,
): AutomatedCandidateReadModel {
  const claims = automatedPublicationSnapshot.records.filter(
    (record) => record.candidateId === candidateId,
  );
  const used = new Set(claims.flatMap((claim) => claim.sourceIds));
  const sources = automatedPublicationSnapshot.sources.filter((source) =>
    used.has(source.sourceId),
  );
  return {
    status: claims.length > 0 ? 'published' : 'none',
    claims,
    sources,
    note:
      claims.length > 0
        ? '以下內容依 automated-editorial-policy-v1 自動核准；這不是人工編輯核准。'
        : '目前沒有符合 automated-editorial-policy-v1 的可公開資料；空白不代表不存在。',
  };
}
