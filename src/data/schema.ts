import { z } from 'zod';

const DateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must use YYYY-MM-DD.');
const SlugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Must be a URL-safe slug.');
const DemoFlagSchema = z.literal(true);
const HexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Must be a six-digit hex color.');

export const ElectionTypeSchema = z.enum([
  'mayoral',
  'city-council',
  'indigenous-council',
]);
export const ConstituencyTypeSchema = z.enum([
  'citywide-mayor',
  'ordinary-council',
  'indigenous-council',
]);
export const VerificationStatusSchema = z.enum([
  'Verified',
  'Pending review',
  'Disputed',
  'Insufficient information',
]);
export const PublicRecordStatusSchema = z.enum([
  'candidate-claimed',
  'independently-documented',
  'needs-review',
]);
export const TimelineCategorySchema = z.enum([
  'education',
  'career',
  'public-service',
  'election',
  'other',
]);
export const CharacterAccessorySchema = z.enum([
  'none',
  'glasses',
  'scarf',
  'hat',
]);

export const PositionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  organization: z.string().min(1),
  startDate: DateOnlySchema,
  endDate: DateOnlySchema.nullable(),
  isDemo: DemoFlagSchema,
});

export const PersonSchema = z.object({
  id: z.string().min(1),
  slug: SlugSchema,
  displayName: z.string().min(1),
  shortName: z.string().min(1),
  summary: z.string().min(1),
  education: z.array(z.string().min(1)).min(1),
  professionalExperience: z.array(z.string().min(1)).min(1),
  previousPositions: z.array(PositionSchema),
  isDemo: DemoFlagSchema,
});

export const ElectoralDistrictSchema = z.object({
  id: z.string().min(1),
  slug: SlugSchema,
  name: z.string().min(1),
  electionType: ElectionTypeSchema,
  constituencyType: ConstituencyTypeSchema,
  districtLabel: z.string().min(1),
  description: z.string().min(1),
  scopeNote: z.string().min(1),
  isDemo: DemoFlagSchema,
});

export const CandidacySchema = z.object({
  id: z.string().min(1),
  slug: SlugSchema,
  personId: z.string().min(1),
  districtId: z.string().min(1),
  electionYear: z.number().int().min(1900).max(2200),
  electionType: ElectionTypeSchema,
  candidateNumber: z.string().min(1),
  politicalParty: z.string().min(1),
  cecDirectoryName: z.string().min(1).optional(),
  currentPosition: z.string().min(1),
  portraitReference: z.string().min(1),
  isDemo: DemoFlagSchema,
});

export const EvidenceSourceSchema = z.object({
  id: z.string().min(1),
  url: z.url(),
  publisher: z.string().min(1),
  publicationDate: DateOnlySchema.nullable(),
  retrievalDate: DateOnlySchema,
  verificationStatus: VerificationStatusSchema,
  relatedEntityIds: z.array(z.string().min(1)),
  note: z.string().min(1),
  isDemo: DemoFlagSchema,
});

export const PolicySchema = z.object({
  id: z.string().min(1),
  personId: z.string().min(1),
  title: z.string().min(1),
  category: z.string().min(1),
  originalStatement: z.string().min(1),
  plainLanguageSummary: z.string().nullable(),
  publicationDate: DateOnlySchema,
  sourceIds: z.array(z.string().min(1)).min(1),
  isDemo: DemoFlagSchema,
});

export const PublicRecordSchema = z.object({
  id: z.string().min(1),
  personId: z.string().min(1),
  title: z.string().min(1),
  recordType: z.string().min(1),
  description: z.string().min(1),
  documentedOutcome: z.string().min(1),
  date: DateOnlySchema,
  status: PublicRecordStatusSchema,
  sourceIds: z.array(z.string().min(1)).min(1),
  isDemo: DemoFlagSchema,
});

export const NewsArticleSchema = z.object({
  id: z.string().min(1),
  personId: z.string().min(1),
  title: z.string().min(1),
  publisher: z.string().min(1),
  publicationDate: DateOnlySchema,
  url: z.url(),
  topic: z.string().min(1),
  editorialSummary: z.string().nullable(),
  sourceIds: z.array(z.string().min(1)).min(1),
  isDemo: DemoFlagSchema,
});

export const PersonRelationshipSchema = z.object({
  id: z.string().min(1),
  fromPersonId: z.string().min(1),
  toPersonId: z.string().min(1),
  relationshipLabel: z.string().min(1),
  context: z.string().min(1),
  publicInterestNote: z.string().min(1),
  sourceIds: z.array(z.string().min(1)).min(1),
  isDemo: DemoFlagSchema,
});

export const TimelineEventSchema = z.object({
  id: z.string().min(1),
  personId: z.string().min(1),
  title: z.string().min(1),
  date: DateOnlySchema,
  description: z.string().min(1),
  category: TimelineCategorySchema,
  sourceIds: z.array(z.string().min(1)).min(1),
  isDemo: DemoFlagSchema,
});

export const CharacterVisualConfigSchema = z.object({
  candidacyId: z.string().min(1),
  renderer: z.enum(['procedural', 'glb']),
  modelAsset: z.string().nullable(),
  position: z.tuple([z.number(), z.number(), z.number()]),
  rotation: z.number(),
  palette: z.object({
    skin: HexColorSchema,
    hair: HexColorSchema,
    top: HexColorSchema,
    bottom: HexColorSchema,
    accessory: HexColorSchema,
  }),
  accessory: CharacterAccessorySchema,
  animation: z.object({
    idle: z.string().min(1),
    greeting: z.string().min(1),
    reducedMotion: z.string().min(1),
  }),
  isDemo: DemoFlagSchema,
});

export const DemoDatasetSchema = z.object({
  people: z.array(PersonSchema).min(1),
  candidacies: z.array(CandidacySchema).min(1),
  districts: z.array(ElectoralDistrictSchema).min(1),
  positions: z.array(PositionSchema),
  policies: z.array(PolicySchema),
  publicRecords: z.array(PublicRecordSchema),
  newsArticles: z.array(NewsArticleSchema),
  relationships: z.array(PersonRelationshipSchema),
  timelineEvents: z.array(TimelineEventSchema),
  sources: z.array(EvidenceSourceSchema).min(1),
  characterVisuals: z.array(CharacterVisualConfigSchema).min(1),
});

export type Person = z.infer<typeof PersonSchema>;
export type Candidacy = z.infer<typeof CandidacySchema>;
export type ElectoralDistrict = z.infer<typeof ElectoralDistrictSchema>;
export type Position = z.infer<typeof PositionSchema>;
export type Policy = z.infer<typeof PolicySchema>;
export type PublicRecord = z.infer<typeof PublicRecordSchema>;
export type NewsArticle = z.infer<typeof NewsArticleSchema>;
export type PersonRelationship = z.infer<typeof PersonRelationshipSchema>;
export type TimelineEvent = z.infer<typeof TimelineEventSchema>;
export type EvidenceSource = z.infer<typeof EvidenceSourceSchema>;
export type CharacterVisualConfig = z.infer<typeof CharacterVisualConfigSchema>;
export type DemoDataset = z.infer<typeof DemoDatasetSchema>;
export type DemoDatasetInput = z.input<typeof DemoDatasetSchema>;

function checkUniqueIds(
  collectionName: string,
  ids: string[],
  errors: string[],
) {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) errors.push(`${collectionName}: duplicate id "${id}".`);
    seen.add(id);
  }
}

function checkReferences(
  label: string,
  ownerId: string,
  sourceIds: string[],
  sourceIdsSet: Set<string>,
  errors: string[],
) {
  for (const sourceId of sourceIds) {
    if (!sourceIdsSet.has(sourceId))
      errors.push(
        `${label} "${ownerId}" references missing source "${sourceId}".`,
      );
  }
}

export function validateDataset(input: DemoDatasetInput): DemoDataset {
  const parsed = DemoDatasetSchema.safeParse(input);
  if (!parsed.success) {
    const details = parsed.error.issues.map(
      (issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`,
    );
    throw new Error(
      `Demo data schema validation failed:\n${details.join('\n')}`,
    );
  }

  const dataset = parsed.data;
  const errors: string[] = [];
  const peopleIds = new Set(dataset.people.map((person) => person.id));
  const districtIds = new Set(dataset.districts.map((district) => district.id));
  const sourceIds = new Set(dataset.sources.map((source) => source.id));
  const candidacyIds = new Set(
    dataset.candidacies.map((candidacy) => candidacy.id),
  );

  checkUniqueIds(
    'people',
    dataset.people.map((item) => item.id),
    errors,
  );
  checkUniqueIds(
    'candidacies',
    dataset.candidacies.map((item) => item.id),
    errors,
  );
  checkUniqueIds(
    'districts',
    dataset.districts.map((item) => item.id),
    errors,
  );
  checkUniqueIds(
    'sources',
    dataset.sources.map((item) => item.id),
    errors,
  );
  checkUniqueIds(
    'characterVisuals',
    dataset.characterVisuals.map((item) => item.candidacyId),
    errors,
  );

  for (const candidacy of dataset.candidacies) {
    if (!peopleIds.has(candidacy.personId))
      errors.push(
        `Candidacy "${candidacy.id}" references missing person "${candidacy.personId}".`,
      );
    if (!districtIds.has(candidacy.districtId))
      errors.push(
        `Candidacy "${candidacy.id}" references missing district "${candidacy.districtId}".`,
      );
  }

  for (const visual of dataset.characterVisuals) {
    if (!candidacyIds.has(visual.candidacyId))
      errors.push(
        `Character visual "${visual.candidacyId}" references missing candidacy.`,
      );
  }

  for (const policy of dataset.policies) {
    if (!peopleIds.has(policy.personId))
      errors.push(
        `Policy "${policy.id}" references missing person "${policy.personId}".`,
      );
    checkReferences('Policy', policy.id, policy.sourceIds, sourceIds, errors);
  }
  for (const record of dataset.publicRecords) {
    if (!peopleIds.has(record.personId))
      errors.push(
        `Public record "${record.id}" references missing person "${record.personId}".`,
      );
    checkReferences(
      'Public record',
      record.id,
      record.sourceIds,
      sourceIds,
      errors,
    );
  }
  for (const article of dataset.newsArticles) {
    if (!peopleIds.has(article.personId))
      errors.push(
        `News article "${article.id}" references missing person "${article.personId}".`,
      );
    checkReferences(
      'News article',
      article.id,
      article.sourceIds,
      sourceIds,
      errors,
    );
  }
  for (const relationship of dataset.relationships) {
    if (!peopleIds.has(relationship.fromPersonId))
      errors.push(
        `Relationship "${relationship.id}" references missing person "${relationship.fromPersonId}".`,
      );
    if (!peopleIds.has(relationship.toPersonId))
      errors.push(
        `Relationship "${relationship.id}" references missing person "${relationship.toPersonId}".`,
      );
    checkReferences(
      'Relationship',
      relationship.id,
      relationship.sourceIds,
      sourceIds,
      errors,
    );
  }
  for (const event of dataset.timelineEvents) {
    if (!peopleIds.has(event.personId))
      errors.push(
        `Timeline event "${event.id}" references missing person "${event.personId}".`,
      );
    checkReferences(
      'Timeline event',
      event.id,
      event.sourceIds,
      sourceIds,
      errors,
    );
  }

  for (const source of dataset.sources) {
    for (const relatedId of source.relatedEntityIds) {
      const knownId = new Set([
        ...dataset.people.map((item) => item.id),
        ...dataset.candidacies.map((item) => item.id),
        ...dataset.districts.map((item) => item.id),
        ...dataset.policies.map((item) => item.id),
        ...dataset.publicRecords.map((item) => item.id),
        ...dataset.newsArticles.map((item) => item.id),
        ...dataset.relationships.map((item) => item.id),
        ...dataset.timelineEvents.map((item) => item.id),
      ]).has(relatedId);
      if (!knownId)
        errors.push(
          `Source "${source.id}" references unknown entity "${relatedId}".`,
        );
    }
  }

  const demoCollections = [
    ['people', dataset.people],
    ['candidacies', dataset.candidacies],
    ['districts', dataset.districts],
    ['positions', dataset.positions],
    ['policies', dataset.policies],
    ['publicRecords', dataset.publicRecords],
    ['newsArticles', dataset.newsArticles],
    ['relationships', dataset.relationships],
    ['timelineEvents', dataset.timelineEvents],
    ['sources', dataset.sources],
    ['characterVisuals', dataset.characterVisuals],
  ] as const;
  for (const [collectionName, items] of demoCollections) {
    for (const item of items) {
      if (!item.isDemo)
        errors.push(
          `${collectionName}: item is not marked as fictional demo data.`,
        );
    }
  }

  if (errors.length > 0)
    throw new Error(
      `Demo data referential validation failed:\n${errors.join('\n')}`,
    );
  return dataset;
}
