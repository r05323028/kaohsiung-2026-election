import { z } from 'zod';
import { BiographyPublishedClaimSchema } from './schema';

const IsoTimestampSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/);
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const BiographyPublicationSnapshotSchema = z.object({
  datasetId: z.literal('kaohsiung-2026-candidate-biographies-publication'),
  snapshotDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  generatedAt: IsoTimestampSchema,
  schemaVersion: z.literal('1'),
  approvedClaimIds: z.array(z.string().min(1)),
  sourceVersions: z.array(
    z.object({ sourceId: z.string().min(1), sha256: Sha256Schema }),
  ),
  decisionIds: z.array(z.string().min(1)),
  records: z.array(BiographyPublishedClaimSchema),
  checksum: Sha256Schema,
  note: z.string().min(1),
});

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
  if (!result.success)
    throw new Error(
      `Publication snapshot validation failed:\n${formatIssues(result.error.issues)}`,
    );
  return result.data;
}
