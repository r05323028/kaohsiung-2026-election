import { z } from 'zod';

const CouncilRowSchema = z.object({
  candidateNumber: z.string().regex(/^\d+$/),
  displayName: z.string().min(1),
  sourceLocation: z.string().min(1),
  reviewStatus: z.enum(['source-checked', 'pending', 'blocked']),
  partyStatus: z.enum(['published', 'not-published', 'unavailable']),
});

const CouncilConstituencySchema = z.object({
  districtNumber: z.number().int().min(1).max(15),
  districtId: z.string().min(1),
  sourceId: z.literal('source-khec-65366'),
  rows: z.array(CouncilRowSchema).min(1),
});

export const CouncilRosterSchema = z.object({
  datasetId: z.literal('kaohsiung-2026-council-drawn-roster'),
  snapshotDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sourceId: z.literal('source-khec-65366'),
  sourceAttachmentSha256: z.string().regex(/^[a-f0-9]{64}$/),
  formalAnnouncementScheduled: z.literal('2026-11-17'),
  status: z.literal('preliminary-drawn-non-final'),
  partyFieldPresent: z.literal(false),
  reviewMethod: z.string().min(1),
  constituencies: z.array(CouncilConstituencySchema).length(15),
  totalRowCount: z.literal(101),
});

export type CouncilRow = z.infer<typeof CouncilRowSchema>;
export type CouncilConstituency = z.infer<typeof CouncilConstituencySchema>;
export type CouncilRoster = z.infer<typeof CouncilRosterSchema>;

function unique(label: string, values: string[]): void {
  const duplicates = values.filter(
    (value, index) => values.indexOf(value) !== index,
  );
  if (duplicates.length > 0)
    throw new Error(
      `Council roster has duplicate ${label}: ${[...new Set(duplicates)].join(', ')}`,
    );
}

export function validateCouncilRoster(input: unknown): CouncilRoster {
  const parsed = CouncilRosterSchema.safeParse(input);
  if (!parsed.success) {
    const details = parsed.error.issues.map(
      (issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`,
    );
    throw new Error(
      `Council roster validation failed:\\n${details.join('\\n')}`,
    );
  }
  const roster = parsed.data;
  const districtNumbers = roster.constituencies.map(
    (constituency) => constituency.districtNumber,
  );
  unique('district numbers', districtNumbers.map(String));
  if (districtNumbers.join(',') !== '1,2,3,4,5,6,7,8,9,10,11,12,13,14,15')
    throw new Error(
      'Council roster constituencies must cover districts 1 through 15 in order.',
    );
  const rowKeys: string[] = [];
  let rowCount = 0;
  for (const constituency of roster.constituencies) {
    const numbers = constituency.rows.map((row) => Number(row.candidateNumber));
    const expected = numbers.map((_, index) => index + 1);
    if (numbers.some((number, index) => number !== expected[index]))
      throw new Error(
        `Council district ${constituency.districtNumber} candidate numbers must be sequential starting at 1.`,
      );
    for (const row of constituency.rows) {
      rowKeys.push(`${constituency.districtId}:${row.displayName}`);
      rowCount += 1;
    }
  }
  unique('district/name row keys', rowKeys);
  if (rowCount !== roster.totalRowCount)
    throw new Error(
      `Council roster expected ${roster.totalRowCount} rows, found ${rowCount}.`,
    );
  return roster;
}

function digest(value: string): string {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function councilCandidateStableId(
  electionYear: number,
  districtId: string,
  displayName: string,
): string {
  return `official-candidate-${electionYear}-${districtId}-${digest(`${electionYear}:${districtId}:${displayName}`)}`;
}

export function councilCandidateSlug(
  electionYear: number,
  districtNumber: number,
  displayName: string,
): string {
  return `kaohsiung-council-${String(districtNumber).padStart(2, '0')}-${digest(`${electionYear}:council:${districtNumber}:${displayName}`)}`;
}

export function khecAliasStatus(
  primaryFileId: string,
  aliasFileId: string,
  primaryAttachmentSha256: string,
  aliasAttachmentSha256: string,
): 'duplicate-alias' | 'independent' {
  return primaryFileId === aliasFileId &&
    primaryAttachmentSha256 === aliasAttachmentSha256
    ? 'duplicate-alias'
    : 'independent';
}
