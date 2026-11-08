import { z } from 'zod';

const DateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const SlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const CandidateStatusSchema = z.enum([
  'qualified',
  'number-drawn',
  'pending-review',
  'withdrawn',
  'unavailable',
]);
const FormalStatusSchema = z.enum([
  'formally-announced',
  'pending-announcement',
  'changed',
  'blocked',
]);
const PartyStatusSchema = z.enum(['published', 'not-published', 'unavailable']);

export const OfficialSourceSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  publisher: z.string().min(1),
  url: z.url(),
  publicationDate: DateOnlySchema.nullable(),
  retrievalDate: DateOnlySchema,
  verificationStatus: z.enum([
    'Verified',
    'Pending review',
    'Insufficient information',
  ]),
  note: z.string().min(1),
});

export const OfficialDistrictSchema = z.object({
  id: z.string().min(1),
  slug: SlugSchema,
  name: z.string().min(1),
  districtLabel: z.string().min(1),
  electionType: z.enum(['mayoral', 'city-council', 'indigenous-council']),
  constituencyType: z.enum([
    'citywide-mayor',
    'ordinary-council',
    'indigenous-council',
  ]),
  description: z.string().min(1),
  scopeNote: z.string().min(1),
  sourceIds: z.array(z.string().min(1)).min(1),
  publicationStatus: z.enum(['approved', 'pending-review', 'unavailable']),
});

export const OfficialCandidateSchema = z.object({
  id: z.string().min(1),
  slug: SlugSchema,
  displayName: z.string().min(1),
  shortName: z.string().min(1),
  birthDate: DateOnlySchema.optional(),
  cecDirectoryName: z.string().min(1).optional(),
  districtId: z.string().min(1),
  electionYear: z.literal(2026),
  electionType: z.enum(['mayoral', 'city-council', 'indigenous-council']),
  candidateNumber: z.string().min(1),
  candidateNumberStatus: z.enum(['drawn', 'final', 'not-published']),
  candidateNumberIsFinal: z.boolean(),
  candidateStatus: CandidateStatusSchema.default('qualified'),
  formalStatus: FormalStatusSchema.default('pending-announcement'),
  qualificationStatus: z.enum(['approved', 'pending-review', 'unavailable']),
  publicationStatus: z.enum(['approved', 'pending-review', 'unavailable']),
  partyStatus: PartyStatusSchema.default('not-published'),
  politicalParty: z.string().min(1).nullable().default(null),
  currentPosition: z.string().min(1),
  portraitReference: z.string().min(1),
  summary: z.string().min(1),
  sourceIds: z.array(z.string().min(1)).min(1),
});

export const OfficialDatasetSchema = z.object({
  datasetId: z.literal('kaohsiung-2026-local-election'),
  snapshotDate: DateOnlySchema,
  election: z.object({
    year: z.literal(2026),
    rocYear: z.literal(115),
    electionDate: DateOnlySchema,
    mayoralAnnouncementScheduled: DateOnlySchema,
    councilAnnouncementScheduled: DateOnlySchema,
    status: z.literal('partial-before-final-announcements'),
  }),
  sources: z.array(OfficialSourceSchema).min(1),
  districts: z.array(OfficialDistrictSchema).min(1),
  candidates: z.array(OfficialCandidateSchema),
  pendingReview: z.array(
    z.object({
      sourceId: z.string().min(1),
      scope: z.string().min(1),
      reason: z.string().min(1),
      expectedResolutionDate: DateOnlySchema,
    }),
  ),
});

export type OfficialSource = z.infer<typeof OfficialSourceSchema>;
export type OfficialDistrict = z.infer<typeof OfficialDistrictSchema>;
export type OfficialCandidate = z.infer<typeof OfficialCandidateSchema>;
export type OfficialDataset = z.infer<typeof OfficialDatasetSchema>;

export function validateOfficialDataset(input: unknown): OfficialDataset {
  const parsed = OfficialDatasetSchema.safeParse(input);
  if (!parsed.success) {
    const details = parsed.error.issues.map(
      (issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`,
    );
    throw new Error(
      `Official dataset validation failed:\n${details.join('\n')}`,
    );
  }
  const dataset = parsed.data;
  const unique = (label: string, ids: string[]) => {
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    if (duplicates.length > 0)
      throw new Error(
        `Official dataset has duplicate ${label}: ${[...new Set(duplicates)].join(', ')}`,
      );
  };
  unique(
    'source IDs',
    dataset.sources.map((source) => source.id),
  );
  unique(
    'district IDs',
    dataset.districts.map((district) => district.id),
  );
  unique(
    'candidate IDs',
    dataset.candidates.map((candidate) => candidate.id),
  );
  const sourceIds = new Set(dataset.sources.map((source) => source.id));
  const districtIds = new Set(dataset.districts.map((district) => district.id));
  for (const district of dataset.districts) {
    for (const sourceId of district.sourceIds)
      if (!sourceIds.has(sourceId))
        throw new Error(
          `District ${district.id} references missing source ${sourceId}.`,
        );
  }
  const candidateNumbersByDistrict = new Map<string, Map<string, string>>();
  for (const candidate of dataset.candidates) {
    if (!districtIds.has(candidate.districtId))
      throw new Error(
        `Candidate ${candidate.id} references missing district ${candidate.districtId}.`,
      );
    for (const sourceId of candidate.sourceIds)
      if (!sourceIds.has(sourceId))
        throw new Error(
          `Candidate ${candidate.id} references missing source ${sourceId}.`,
        );
    if (
      candidate.candidateNumberStatus !== 'final' &&
      candidate.candidateNumberIsFinal
    )
      throw new Error(
        `Candidate ${candidate.id} marks a non-final number as final.`,
      );
    if (candidate.partyStatus === 'published' && !candidate.politicalParty)
      throw new Error(
        `Candidate ${candidate.id} marks party as published without a party value.`,
      );
    if (
      candidate.partyStatus !== 'published' &&
      candidate.politicalParty !== null
    )
      throw new Error(
        `Candidate ${candidate.id} includes a party value while party status is ${candidate.partyStatus}.`,
      );
    const districtNumbers =
      candidateNumbersByDistrict.get(candidate.districtId) ?? new Map();
    const existingCandidateId = districtNumbers.get(candidate.candidateNumber);
    if (existingCandidateId)
      throw new Error(
        `District ${candidate.districtId} has duplicate candidate number ${candidate.candidateNumber} for ${existingCandidateId} and ${candidate.id}.`,
      );
    districtNumbers.set(candidate.candidateNumber, candidate.id);
    candidateNumbersByDistrict.set(candidate.districtId, districtNumbers);
    const preliminaryDrawn =
      candidate.candidateStatus === 'number-drawn' &&
      candidate.formalStatus === 'pending-announcement';
    if (
      candidate.publicationStatus === 'approved' &&
      candidate.qualificationStatus !== 'approved' &&
      !preliminaryDrawn
    )
      throw new Error(
        `Candidate ${candidate.id} is published without approved qualification or preliminary drawn status.`,
      );
  }
  for (const pending of dataset.pendingReview)
    if (!sourceIds.has(pending.sourceId))
      throw new Error(
        `Pending review ${pending.scope} references missing source ${pending.sourceId}.`,
      );
  return dataset;
}
