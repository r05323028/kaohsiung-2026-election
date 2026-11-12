import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  type PoliticalFamilyPublicationApproval,
  validatePoliticalFamilyPublication,
  validatePoliticalFamilyPublicationApproval,
  validatePoliticalFamilyPublicationReferences,
  validatePoliticalFamilyReferences,
  validatePoliticalFamilyResearch,
} from '../src/data/political-family/schema';

type JsonObject = Record<string, unknown>;
type RawRelation = JsonObject & {
  candidateId: string;
  relativeName: string;
  relation: string;
  kinshipSourceIds: string[];
  careerSourceIds: string[];
  career: unknown;
};
type RawRow = JsonObject & {
  sequence: number;
  candidateId: string;
  displayName: string;
  searchedAt?: string;
  outcome: string;
  queries?: string[];
  urlsAttempted?: string[];
  relations?: RawRelation[];
  rejectedOrAmbiguousClaims?: unknown[];
  rejectedFindings?: unknown[];
  attempted?: unknown[];
};
type RosterCandidate = {
  sequence: number;
  id: string;
  slug: string;
  displayName: string;
  districtId: string;
  electionType: 'mayoral' | 'city-council' | 'indigenous-council';
  politicalParty: string;
};
type SourceRecord = {
  id: string;
  publisher: string;
  title: string;
  url: string;
  publicationDate: string | null;
  retrievedAt: string;
  sourceKind:
    | 'official-record'
    | 'institutional-profile'
    | 'established-news'
    | 'candidate-statement'
    | 'other-public-record';
  supportedClaimIds: string[];
};
type VerificationRecord = {
  candidateId: string;
  relativeName: string;
  status: 'verified' | 'rejected' | 'unresolved';
  rationale: string;
  sourceIds?: string[];
  kinshipSourceIds?: string[];
  careerSourceIds?: string[];
  sources?: JsonObject[];
  career?: unknown;
  independentReview?: JsonObject;
};
type FindingInput = {
  generatedAt: string;
  researchers: string[];
  rows: RawRow[];
  relations: RawRelation[];
  verification: VerificationRecord[];
  sources: SourceRecord[];
};
type PoliticalCareer = {
  id: string;
  officeTitle: string;
  organization: string;
  status:
    | 'current-officeholder'
    | 'former-officeholder'
    | 'current-candidate'
    | 'former-candidate'
    | 'political-appointee'
    | 'party-official'
    | 'historical-status-unknown';
  startDate: string | null;
  endDate: string | null;
  sourceIds: string[];
};
type Person = {
  id: string;
  displayName: string;
  candidateId?: string;
  politicalCareer: PoliticalCareer[];
};
type Relationship = {
  id: string;
  personAId: string;
  personBId: string;
  relationshipType:
    | 'parent-child'
    | 'siblings'
    | 'spouses'
    | 'grandparent-grandchild'
    | 'uncle-aunt-niece-nephew'
    | 'cousins'
    | 'in-laws'
    | 'other';
  relationshipLabel: string;
  personALabel: string;
  personBLabel: string;
  verificationStatus: 'verified' | 'pending-review' | 'rejected';
  kinshipSourceIds: string[];
  careerSourceIds: string[];
  sourceIds: string[];
};
type UnresolvedFinding = {
  id: string;
  candidateId: string;
  subjectName: string;
  reason: string;
  sourceIds: string[];
  disposition: 'withheld';
};

const root = resolve(process.cwd());
const rosterPath = join(
  root,
  'data/research/2026/political-family/roster.json',
);
const rawDir = join(root, 'data/research/2026/political-family/raw');
const findingsPath = join(
  root,
  'data/research/2026/political-family/findings.json',
);
const verificationPath = join(
  root,
  'data/research/2026/political-family/verification.json',
);
const approvalPath = join(
  root,
  'data/research/2026/political-family/publication-approval.json',
);
const snapshotDate = '2026-11-05';
const researchDate = '2026-11-12';
const generatedAt = '2026-11-12T00:00:00.000Z';

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}

function readJson(path: string): JsonObject {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Expected a JSON object.');
    }
    return parsed as JsonObject;
  } catch (error) {
    if (isMissingFile(error)) throw error;
    throw new Error(`Unable to read JSON file: ${path}`, { cause: error });
  }
}

function readJsonDocument(path: string): JsonObject | JsonObject[] {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (Array.isArray(parsed)) return objectArray(parsed);
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Expected a JSON object or array.');
    }
    return parsed as JsonObject;
  } catch (error) {
    if (isMissingFile(error)) throw error;
    throw new Error(`Unable to read JSON file: ${path}`, { cause: error });
  }
}

function objectValue(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function objectArray(value: unknown): JsonObject[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is JsonObject =>
          item !== null && typeof item === 'object' && !Array.isArray(item),
      )
    : [];
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}

function dateOnly(value: unknown): string | null {
  const text = stringValue(value);
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(text);
  return match?.[1] ?? null;
}

function sourceKind(publisher: string): SourceRecord['sourceKind'] {
  if (/議會|立法院|政府|選舉委員會|官方|KCC/i.test(publisher)) {
    return 'official-record';
  }
  if (
    /CNA|中央社|TVBS|聯合|自由|Newtalk|ETtoday|三立|蘋果|報/i.test(publisher)
  ) {
    return 'established-news';
  }
  return 'other-public-record';
}

function normalizeSource(
  raw: JsonObject,
  fallbackId: string,
): SourceRecord | undefined {
  const id = stringValue(raw.id, stringValue(raw.sourceId, fallbackId));
  const url = stringValue(raw.url);
  if (!id || !/^https?:\/\//.test(url)) return undefined;
  const publisher = stringValue(raw.publisher, '公開資料來源');
  const title = stringValue(raw.title, '公開政治資料');
  const publicationDate =
    dateOnly(raw.publicationDate) ??
    dateOnly(raw.publishedAt) ??
    dateOnly(raw.snapshotDate);
  const retrievedAt = dateOnly(raw.retrievedAt) ?? researchDate;
  return {
    id,
    publisher,
    title,
    url,
    publicationDate,
    retrievedAt,
    sourceKind: sourceKind(publisher),
    supportedClaimIds: [],
  };
}

function relationshipType(relation: string): Relationship['relationshipType'] {
  if (/父|母|子|女|兒|媳|婿/.test(relation)) return 'parent-child';
  if (/配偶|丈夫|妻|夫|老婆|先生/.test(relation)) return 'spouses';
  if (/兄|弟|姊|姐|妹|sibling/i.test(relation)) return 'siblings';
  if (/祖父|祖母|孫/.test(relation)) return 'grandparent-grandchild';
  if (
    /叔|伯|姑|姨|舅|外甥|姪|侄|舅舅|外甥女|paternal uncle|uncle|aunt/i.test(
      relation,
    )
  ) {
    return 'uncle-aunt-niece-nephew';
  }
  if (/姻親|岳|媳婦|女婿|in-law/i.test(relation)) return 'in-laws';
  if (/表|堂|cousin/i.test(relation)) return 'cousins';
  return 'other';
}

function candidateSideLabel(relation: string): string {
  if (/父|母/.test(relation)) return '子女';
  if (/子|女|兒/.test(relation)) return '父母';
  if (/配偶|丈夫|妻|夫|老婆|先生/.test(relation)) return '配偶';
  if (/兄|弟|姊|姐|妹|sibling/i.test(relation)) return '兄弟姊妹';
  if (/祖父|祖母|孫/.test(relation)) return '孫輩／祖輩';
  if (/叔|伯|姑|姨|舅|外甥|姪|侄|uncle|aunt/i.test(relation))
    return '姪甥／叔伯姑姨';
  if (/姻親|岳|媳婦|女婿|in-law/i.test(relation)) return '姻親';
  return '候選人親屬';
}

function careerStatus(
  value: unknown,
  officeTitle: string,
): PoliticalCareer['status'] {
  const text = stringValue(value).toLowerCase();
  if (/current|現任|目前|在任/.test(text)) return 'current-officeholder';
  if (/candidate|參選|候選/.test(text)) {
    return /former|曾|前/.test(text) ? 'former-candidate' : 'current-candidate';
  }
  if (/appointee|任命|政務官|副委員長|政府委員/.test(text))
    return 'political-appointee';
  if (/party|黨|黨部/.test(text)) return 'party-official';
  if (/former|前|曾任|歷任|已故|解職|代表|議員|鄉長|縣長|市長/.test(text)) {
    return 'former-officeholder';
  }
  if (/議員|市長|縣長|鄉長|代表|立委|院長/.test(officeTitle)) {
    return 'historical-status-unknown';
  }
  return 'historical-status-unknown';
}

function careerRecords(
  rawRelation: RawRelation,
  relativeId: string,
  additionalSourceIds: string[] = [],
): PoliticalCareer[] {
  const records = Array.isArray(rawRelation.career)
    ? rawRelation.career
    : [rawRelation.career];
  return records.flatMap((item, index) => {
    const career = objectValue(item);
    if (Object.keys(career).length === 0) return [];
    const officeTitle = stringValue(
      career.officeTitle,
      stringValue(career.office, stringValue(career.title, '政治職務')),
    );
    const organization = stringValue(career.organization, '來源未標示組織');
    const sourceIds = [
      ...new Set([
        ...stringArray(rawRelation.careerSourceIds),
        ...additionalSourceIds,
      ]),
    ];
    return [
      {
        id: `career-${hash(`${relativeId}|${officeTitle}|${organization}|${index}`)}`,
        officeTitle,
        organization,
        status: careerStatus(career.status, officeTitle),
        startDate: dateOnly(career.start),
        endDate: dateOnly(career.end),
        sourceIds,
      },
    ];
  });
}

function relationIdentitySignature(relation: RawRelation): string {
  const records = Array.isArray(relation.career)
    ? relation.career
    : [relation.career];
  return records
    .map((item) => {
      const career = objectValue(item);
      return `${stringValue(career.officeTitle, stringValue(career.office, stringValue(career.title)))}|${stringValue(career.organization)}`;
    })
    .filter((value) => value !== '|')
    .sort()
    .join(';');
}

function stableRelationKey(relation: RawRelation): string {
  const explicitKey = stringValue(relation.claimId, stringValue(relation.id));
  return (
    explicitKey ||
    `${relation.candidateId}|${relation.relativeName}|${relation.relation}`
  );
}

function readResearchRows(): {
  rows: RawRow[];
  researchers: string[];
  sources: SourceRecord[];
} {
  const files = [
    'researcher-a1.json',
    'researcher-a2.json',
    'researcher-a3.json',
    'researcher-a4.json',
  ];
  const rows: RawRow[] = [];
  const researchers: string[] = [];
  const sources: SourceRecord[] = [];
  for (const file of files) {
    const path = join(rawDir, file);
    try {
      const document = readJsonDocument(path);
      const input = Array.isArray(document) ? {} : document;
      const sourceRows = (
        Array.isArray(document)
          ? document
          : objectArray(input.rows ?? input.auditRows)
      ) as RawRow[];
      rows.push(...sourceRows);
      for (const sourceValue of objectArray(
        input.sourceCatalog ?? input.sourceMetadata,
      )) {
        const source = normalizeSource(
          sourceValue,
          stringValue(sourceValue.id, stringValue(sourceValue.sourceId)),
        );
        if (source) sources.push(source);
      }
      researchers.push(file);
    } catch (error) {
      if (!isMissingFile(error)) throw error;
      // Missing batches are rejected by the complete-roster assertion below.
    }
  }
  return {
    rows: rows.sort((left, right) => left.sequence - right.sequence),
    researchers,
    sources,
  };
}

function parseVerificationRecord(value: JsonObject): VerificationRecord {
  const candidateId = stringValue(value.candidateId);
  const relativeName = stringValue(value.relativeName);
  const status = stringValue(value.status);
  if (
    !candidateId ||
    !relativeName ||
    !['verified', 'rejected', 'unresolved'].includes(status)
  ) {
    throw new Error(
      'Verification records require candidateId, relativeName, and a valid status.',
    );
  }
  const review = objectValue(value.independentReview);
  return {
    candidateId,
    relativeName,
    status: status as VerificationRecord['status'],
    rationale: stringValue(value.rationale, '獨立查核未提供足夠公開證據。'),
    sourceIds: stringArray(value.sourceIds),
    kinshipSourceIds: stringArray(value.kinshipSourceIds),
    careerSourceIds: stringArray(value.careerSourceIds),
    sources: objectArray(value.sources),
    career: value.career,
    ...(Object.keys(review).length > 0 ? { independentReview: review } : {}),
  };
}

function independentReviewSourceIds(record: VerificationRecord): string[] {
  return objectArray(record.independentReview?.sourceChecks)
    .map((check) => stringValue(check.sourceId))
    .filter(Boolean);
}

function readVerification(): VerificationRecord[] {
  const input = readJson(verificationPath);
  const values = objectArray(input.relations ?? input.records);
  if (values.length === 0) {
    throw new Error(
      `Verification file contains no records: ${verificationPath}`,
    );
  }
  return values.map(parseVerificationRecord);
}

function readApproval(): PoliticalFamilyPublicationApproval {
  return validatePoliticalFamilyPublicationApproval(readJson(approvalPath));
}

function buildFindings(
  rows: RawRow[],
  researchers: string[],
  sources: SourceRecord[],
  relations: RawRelation[],
  verification: VerificationRecord[],
): FindingInput {
  return {
    generatedAt,
    researchers,
    rows,
    relations,
    verification,
    sources,
  };
}

const rosterInput = objectValue(readJson(rosterPath));
const roster = objectArray(rosterInput.candidates).map((candidate) => ({
  ...candidate,
  id: stringValue(candidate.candidateId, stringValue(candidate.id)),
})) as RosterCandidate[];
if (
  roster.length === 0 ||
  roster.some((candidate) => !candidate.id || !candidate.slug)
) {
  throw new Error(
    `Canonical political-family roster is empty or malformed: ${rosterPath}`,
  );
}
const rosterIds = new Set<string>();
for (const candidate of roster) {
  if (rosterIds.has(candidate.id))
    throw new Error(`Duplicate canonical candidate ID: ${candidate.id}`);
  rosterIds.add(candidate.id);
}
const { rows, researchers, sources: batchSources } = readResearchRows();
const duplicateRows = rows
  .map((row) => row.candidateId)
  .filter((candidateId, index, ids) => ids.indexOf(candidateId) !== index);
const unknownRows = rows
  .map((row) => row.candidateId)
  .filter((candidateId) => !rosterIds.has(candidateId));
const rowByCandidate = new Map(rows.map((row) => [row.candidateId, row]));
const missingRows = roster
  .map((candidate) => candidate.id)
  .filter((candidateId) => !rowByCandidate.has(candidateId));
if (
  rows.length !== roster.length ||
  duplicateRows.length > 0 ||
  unknownRows.length > 0 ||
  missingRows.length > 0
) {
  throw new Error(
    `Research coverage must contain exactly one row per canonical candidate. rows=${rows.length}, roster=${roster.length}, duplicates=${[...new Set(duplicateRows)].join(',') || 'none'}, unknown=${[...new Set(unknownRows)].join(',') || 'none'}, missing=${missingRows.join(',') || 'none'}`,
  );
}
const sourceMap = new Map<string, SourceRecord>();
for (const source of batchSources) sourceMap.set(source.id, source);
const relationInputs: RawRelation[] = [];

for (const row of rows) {
  for (const relationValue of objectArray(row.relations)) {
    const relation = relationValue as RawRelation;
    relationInputs.push({
      ...relation,
      candidateId: row.candidateId,
      relativeName: stringValue(relation.relativeName),
      relation: stringValue(relation.relation),
      kinshipSourceIds: stringArray(relation.kinshipSourceIds),
      careerSourceIds: stringArray(relation.careerSourceIds),
      career: relation.career,
    });
    for (const sourceValue of objectArray(relation.sources)) {
      const source = normalizeSource(
        sourceValue,
        stringValue(sourceValue.sourceId),
      );
      if (source) sourceMap.set(source.id, source);
    }
  }
  const rawSources = objectArray(row.sourceCatalog ?? row.sourceMetadata ?? []);
  for (const sourceValue of rawSources) {
    const source = normalizeSource(sourceValue, stringValue(sourceValue.id));
    if (source) sourceMap.set(source.id, source);
  }
}

const verification = readVerification();
for (const record of verification) {
  for (const sourceValue of objectArray(record.sources)) {
    const source = normalizeSource(
      sourceValue,
      stringValue(sourceValue.id, stringValue(sourceValue.sourceId)),
    );
    if (source) sourceMap.set(source.id, source);
  }
}

const allSources = [...sourceMap.values()];
const sourceIds = new Set(allSources.map((source) => source.id));
const candidatePeople: Person[] = roster.map((candidate) => ({
  id: `person-${candidate.slug}`,
  displayName: candidate.displayName,
  candidateId: candidate.id,
  politicalCareer: [],
}));
const peopleById = new Map(
  candidatePeople.map((person) => [person.id, person]),
);
const relationships: Relationship[] = [];
const unresolvedFindings: UnresolvedFinding[] = [];
const verificationByKey = new Map<string, VerificationRecord>();
for (const record of verification) {
  const key = `${record.candidateId}|${record.relativeName}`;
  if (verificationByKey.has(key)) {
    throw new Error(`Ambiguous duplicate verification record for ${key}.`);
  }
  verificationByKey.set(key, record);
}
const relativeIdentityByName = new Map<
  string,
  { id: string; signature: string }
>();

for (const relation of relationInputs) {
  const relativeName = relation.relativeName.trim();
  const candidate = roster.find((item) => item.id === relation.candidateId);
  if (!candidate || !relativeName) continue;
  const identityKey = relativeName.normalize('NFC');
  const signature = relationIdentitySignature(relation);
  const knownIdentity = relativeIdentityByName.get(identityKey);
  if (
    knownIdentity?.signature &&
    signature &&
    knownIdentity.signature !== signature
  ) {
    throw new Error(
      `Ambiguous political-person identity for ${relativeName}: conflicting career fingerprints.`,
    );
  }
  const relativeId =
    knownIdentity?.id ?? `political-person-${hash(identityKey)}`;
  relativeIdentityByName.set(identityKey, {
    id: relativeId,
    signature: knownIdentity?.signature || signature,
  });
  const verificationRecord = verificationByKey.get(
    `${relation.candidateId}|${relativeName}`,
  );
  const careerSourceIds = [
    ...new Set([
      ...stringArray(
        verificationRecord?.careerSourceIds ?? relation.careerSourceIds,
      ),
      ...(verificationRecord
        ? independentReviewSourceIds(verificationRecord)
        : []),
    ]),
  ];
  const career = careerRecords(relation, relativeId, careerSourceIds);
  const existing = peopleById.get(relativeId);
  if (existing) {
    const known = new Map(
      existing.politicalCareer.map((item) => [item.id, item]),
    );
    for (const item of career) known.set(item.id, item);
    existing.politicalCareer = [...known.values()];
  } else {
    peopleById.set(relativeId, {
      id: relativeId,
      displayName: relation.relativeName,
      politicalCareer: career,
    });
  }

  const relationId = `family-relation-${hash(stableRelationKey(relation))}`;
  const kinshipSourceIds = [
    ...new Set([
      ...stringArray(
        verificationRecord?.kinshipSourceIds ?? relation.kinshipSourceIds,
      ),
      ...(verificationRecord ? stringArray(verificationRecord.sourceIds) : []),
    ]),
  ];
  const combinedSourceIds = [
    ...new Set([...kinshipSourceIds, ...careerSourceIds]),
  ];
  const verified =
    verificationRecord?.status === 'verified' &&
    kinshipSourceIds.length > 0 &&
    careerSourceIds.length > 0 &&
    combinedSourceIds.every((id) => sourceIds.has(id));
  const status: Relationship['verificationStatus'] = verified
    ? 'verified'
    : verificationRecord?.status === 'rejected'
      ? 'rejected'
      : 'pending-review';
  relationships.push({
    id: relationId,
    personAId: `person-${candidate.slug}`,
    personBId: relativeId,
    relationshipType: relationshipType(relation.relation),
    relationshipLabel: relation.relation,
    personALabel: candidateSideLabel(relation.relation),
    personBLabel: relation.relation,
    verificationStatus: status,
    kinshipSourceIds,
    careerSourceIds,
    sourceIds: combinedSourceIds,
  });

  if (status !== 'verified') {
    const reason =
      verificationRecord?.rationale ??
      stringArray(relation.contradictions).join('；') ??
      (rowByCandidate.get(relation.candidateId)?.outcome === 'unresolved'
        ? '研究來源存在身分或證據歧義，未公開。'
        : '等待獨立查核，未公開。');
    unresolvedFindings.push({
      id: `family-finding-${hash(relationId)}`,
      candidateId: relation.candidateId,
      subjectName: relation.relativeName,
      reason: reason || '尚未取得足夠的獨立證據。',
      sourceIds: combinedSourceIds.filter((id) => sourceIds.has(id)),
      disposition: 'withheld',
    });
  }
}

for (const row of rows) {
  const rejected = objectArray(
    row.rejectedOrAmbiguousClaims ?? row.rejectedFindings,
  );
  for (const item of rejected) {
    const finding = objectValue(item);
    const subjectName = stringValue(
      finding.subjectName,
      stringValue(finding.finding, '未具名研究發現'),
    );
    unresolvedFindings.push({
      id: `family-finding-${hash(`${row.candidateId}|${subjectName}`)}`,
      candidateId: row.candidateId,
      subjectName,
      reason: stringValue(
        finding.reason,
        stringValue(finding.finding, '來源不足或身分無法安全確認。'),
      ),
      sourceIds: stringArray(finding.sourceIds ?? finding.sourceId).filter(
        (id) => sourceIds.has(id),
      ),
      disposition: 'withheld',
    });
  }
}

for (const source of allSources) {
  source.supportedClaimIds = [];
}
for (const relationship of relationships) {
  const claimIds = [
    `claim-${relationship.id}-kinship`,
    ...(peopleById
      .get(relationship.personBId)
      ?.politicalCareer.filter((career) =>
        relationship.careerSourceIds.some((id) =>
          career.sourceIds.includes(id),
        ),
      )
      .map((career) => `claim-${career.id}`) ?? []),
  ];
  for (const sourceId of relationship.sourceIds) {
    const source = sourceMap.get(sourceId);
    if (source) source.supportedClaimIds.push(...claimIds);
  }
}
for (const source of allSources) {
  source.supportedClaimIds = [...new Set(source.supportedClaimIds)].sort();
}

const searchAudits = roster.map((candidate) => {
  const row = rowByCandidate.get(candidate.id);
  const sourceIdsForRow = row
    ? [
        ...new Set([
          ...relationInputs
            .filter((relation) => relation.candidateId === candidate.id)
            .flatMap((relation) => [
              ...relation.kinshipSourceIds,
              ...relation.careerSourceIds,
            ]),
          ...verification
            .filter((record) => record.candidateId === candidate.id)
            .flatMap((record) => [
              ...stringArray(record.sourceIds),
              ...stringArray(record.kinshipSourceIds),
              ...stringArray(record.careerSourceIds),
              ...independentReviewSourceIds(record),
            ]),
        ]),
      ].filter((id) => sourceIds.has(id))
    : [];
  const rowOutcome = row?.outcome;
  const outcome =
    rowOutcome === 'verified-relations-found' ||
    rowOutcome === 'unresolved' ||
    rowOutcome === 'searched-no-verified-relations'
      ? rowOutcome
      : 'unresolved';
  return {
    id: `family-audit-${candidate.id}`,
    candidateId: candidate.id,
    searchedAt: `${researchDate}T00:00:00.000Z`,
    method: 'independent-source-review' as const,
    searchQueries: row
      ? [
          ...stringArray(row.queries),
          ...objectArray(row.attempted).map((item) => stringValue(item.query)),
        ].filter(Boolean)
      : ['候選人姓名 家族 從政'],
    attemptedUrls: row
      ? [
          ...stringArray(row.urlsAttempted),
          ...objectArray(row.attempted).map((item) => stringValue(item.url)),
        ].filter((url): url is string => /^https?:\/\//.test(url))
      : [],
    sourceIds: sourceIdsForRow,
    independentVerification: relationships.some(
      (relationship) =>
        relationship.personAId === `person-${candidate.slug}` &&
        relationship.verificationStatus === 'verified',
    ),
    outcome,
    notes: !row
      ? '尚未取得此候選人的完整研究記錄，未公開任何關係。'
      : rowOutcome === 'unresolved'
        ? '研究已嘗試，但來源存在身分或證據歧義，尚未公開。'
        : '已完成定向公開資料查找；未將缺乏公開資料解讀為不存在。',
  };
});

const candidateResearch = roster.map((candidate) => {
  const row = rowByCandidate.get(candidate.id);
  const candidateRelations = relationships.filter(
    (relationship) => relationship.personAId === `person-${candidate.slug}`,
  );
  const publishedRelationIds = candidateRelations
    .filter((relationship) => relationship.verificationStatus === 'verified')
    .map((relationship) => relationship.id);
  const candidateFindings = unresolvedFindings
    .filter((finding) => finding.candidateId === candidate.id)
    .map((finding) => finding.id);
  const researchStatus =
    publishedRelationIds.length > 0
      ? 'verified-relations-found'
      : !row || row.outcome === 'unresolved'
        ? 'unresolved'
        : 'searched-no-verified-relations';
  return {
    candidateId: candidate.id,
    personId: `person-${candidate.slug}`,
    displayName: candidate.displayName,
    districtId: candidate.districtId,
    electionType: candidate.electionType,
    researchStatus,
    searchedAt: `${researchDate}T00:00:00.000Z`,
    searchAuditIds: [`family-audit-${candidate.id}`],
    verifiedRelationshipIds: publishedRelationIds,
    pendingRelationshipIds: candidateRelations
      .filter(
        (relationship) => relationship.verificationStatus === 'pending-review',
      )
      .map((relationship) => relationship.id),
    rejectedRelationshipIds: candidateRelations
      .filter((relationship) => relationship.verificationStatus === 'rejected')
      .map((relationship) => relationship.id),
    unresolvedFindingIds: candidateFindings,
    note:
      researchStatus === 'verified-relations-found'
        ? '已取得親屬關係與政治職涯的獨立來源支持。'
        : researchStatus === 'unresolved'
          ? '目前仍在查核家族從政資料，尚無可公開的已核實關係。'
          : '尚無可核實的公開家族從政資料。',
  };
});

const researchDataset = {
  datasetId: 'kaohsiung-2026-political-family-research',
  snapshotDate,
  researchCutoff: researchDate,
  generatedAt,
  rosterDatasetId: stringValue(rosterInput.datasetId),
  candidateCount: roster.length,
  sources: allSources,
  people: [...peopleById.values()].sort((left, right) =>
    left.id.localeCompare(right.id),
  ),
  relationships,
  searchAudits,
  unresolvedFindings: [
    ...new Map(
      unresolvedFindings.map((finding) => [finding.id, finding]),
    ).values(),
  ],
  candidates: candidateResearch,
  note: '研究層保留每位候選人的查找結果；僅獨立查核且具備分離親屬與政治職涯證據的關係進入公開層。',
};

const verifiedRelationships = relationships.filter(
  (
    relationship,
  ): relationship is Relationship & { verificationStatus: 'verified' } =>
    relationship.verificationStatus === 'verified',
);
const approval = readApproval();
const verifiedRelationIds = new Set(
  verifiedRelationships.map((relation) => relation.id),
);
const approvedRelationIds = new Set(approval.approvedRelationshipIds);
const missingApprovals = [...verifiedRelationIds].filter(
  (id) => !approvedRelationIds.has(id),
);
const unexpectedApprovals = [...approvedRelationIds].filter(
  (id) => !verifiedRelationIds.has(id),
);
if (missingApprovals.length > 0 || unexpectedApprovals.length > 0) {
  throw new Error(
    `Publication approval must exactly match independently verified relations. Missing: ${missingApprovals.join(', ') || 'none'}; unexpected: ${unexpectedApprovals.join(', ') || 'none'}.`,
  );
}
const approvedRelationships = verifiedRelationships.filter((relationship) =>
  approvedRelationIds.has(relationship.id),
);
const publicationCandidates = roster.map((candidate) => {
  const relationIds = approvedRelationships
    .filter(
      (relationship) => relationship.personAId === `person-${candidate.slug}`,
    )
    .map((relationship) => relationship.id);
  const row = rowByCandidate.get(candidate.id);
  const status = relationIds.length
    ? 'verified-relations-found'
    : !row || row.outcome === 'unresolved'
      ? 'unresolved'
      : 'searched-no-verified-relations';
  return {
    candidateId: candidate.id,
    researchStatus: status,
    relationshipIds: relationIds,
    note:
      status === 'verified-relations-found'
        ? '已核實的家族從政關係。'
        : status === 'unresolved'
          ? '目前仍在查核家族從政資料，尚無可公開的已核實關係。'
          : '尚無可核實的公開家族從政資料。',
  };
});
const publicationRelationPeople = new Set(
  approvedRelationships.flatMap((relationship) => [
    relationship.personAId,
    relationship.personBId,
  ]),
);
const publicCareerSourcesByPerson = new Map<string, Set<string>>();
for (const relationship of approvedRelationships) {
  const sources =
    publicCareerSourcesByPerson.get(relationship.personBId) ??
    new Set<string>();
  for (const sourceId of relationship.careerSourceIds) sources.add(sourceId);
  publicCareerSourcesByPerson.set(relationship.personBId, sources);
}
const publicationPeople = [...peopleById.values()]
  .filter((person) => publicationRelationPeople.has(person.id))
  .map((person) => {
    const allowedSources = publicCareerSourcesByPerson.get(person.id);
    if (!allowedSources) return person;
    return {
      ...person,
      politicalCareer: person.politicalCareer.filter((career) =>
        career.sourceIds.some((sourceId) => allowedSources.has(sourceId)),
      ),
    };
  });
const publicationSourceIds = new Set(
  approvedRelationships.flatMap((relationship) => relationship.sourceIds),
);
const publicClaimIds = new Set<string>();
for (const relationship of approvedRelationships) {
  publicClaimIds.add(`claim-${relationship.id}-kinship`);
  const person = publicationPeople.find(
    (item) => item.id === relationship.personBId,
  );
  for (const career of person?.politicalCareer ?? []) {
    publicClaimIds.add(`claim-${career.id}`);
  }
}
const publicationSources = allSources
  .filter((source) => publicationSourceIds.has(source.id))
  .map((source) => ({
    ...source,
    supportedClaimIds: source.supportedClaimIds.filter((claimId) =>
      publicClaimIds.has(claimId),
    ),
  }));
const publication = {
  datasetId: 'kaohsiung-2026-political-family-publication',
  snapshotDate,
  generatedAt,
  rosterDatasetId: stringValue(rosterInput.datasetId),
  schemaVersion: '1',
  sources: publicationSources,
  people: publicationPeople,
  relationships: approvedRelationships,
  candidates: publicationCandidates,
  note: '公開層只包含通過獨立查核、且親屬與政治職涯均有來源支持的關係。',
};

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeText(path: string, value: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value.endsWith('\n') ? value : `${value}\n`, 'utf8');
}

const rosterForValidation = roster.map(
  ({ id, slug, displayName, districtId, electionType }) => ({
    id,
    slug,
    displayName,
    districtId,
    electionType,
  }),
);
const validatedResearch = validatePoliticalFamilyResearch(researchDataset);
validatePoliticalFamilyReferences(validatedResearch, rosterForValidation);
const validatedPublication = validatePoliticalFamilyPublication(publication);
validatePoliticalFamilyPublicationReferences(
  validatedPublication,
  rosterForValidation,
);

writeJson(
  findingsPath,
  buildFindings(rows, researchers, allSources, relationInputs, verification),
);
writeJson(
  join(root, 'data/research/2026/political-family/source-manifest.json'),
  {
    datasetId: 'kaohsiung-2026-political-family-research',
    generatedAt,
    snapshotDate,
    sources: allSources,
  },
);
writeJson(
  join(root, 'data/research/2026/political-family/research.json'),
  validatedResearch,
);
writeJson(
  join(root, 'data/approved/2026/political-family.json'),
  validatedPublication,
);
writeJson(
  join(root, 'data/published/2026/political-family.json'),
  validatedPublication,
);

const report = {
  reportType: 'political-family-research',
  generatedAt,
  rosterDatasetId: stringValue(rosterInput.datasetId),
  snapshotDate,
  candidateCount: roster.length,
  researchedCandidateCount: rowByCandidate.size,
  researcherRowCount: rows.length,
  researchCoverageComplete: rowByCandidate.size === roster.length,
  candidatesWithVerifiedRelationships: publicationCandidates.filter(
    (item) => item.researchStatus === 'verified-relations-found',
  ).length,
  candidatesWithoutPublishableRelationships: publicationCandidates.filter(
    (item) => item.researchStatus === 'searched-no-verified-relations',
  ).length,
  unresolvedCandidateCount: publicationCandidates.filter(
    (item) => item.researchStatus === 'unresolved',
  ).length,
  proposedRelationshipCount: relationships.length,
  publishedRelationshipCount: approvedRelationships.length,
  uniqueVerifiedRelativeCount: new Set(
    verifiedRelationships.map((relation) => relation.personBId),
  ).size,
  distinctSourceCount: allSources.length,
  rejectedRelationshipCount: relationships.filter(
    (relation) => relation.verificationStatus === 'rejected',
  ).length,
  unresolvedFindingCount: unresolvedFindings.length,
  candidates: candidateResearch,
  sources: allSources,
  verificationRecords: verification,
  publishedRelationships: approvedRelationships.map((relationship) => ({
    ...relationship,
    sourceLinks: relationship.sourceIds
      .map((sourceId) => sourceMap.get(sourceId))
      .filter((source): source is SourceRecord => Boolean(source))
      .map(({ id, publisher, title, url }) => ({ id, publisher, title, url })),
  })),
};
writeJson(join(root, 'reports/political-family-research.json'), report);

const matrix = candidateResearch
  .map(
    (candidate) =>
      `| ${candidate.displayName} | ${candidate.candidateId} | ${candidate.researchStatus} | ${candidate.verifiedRelationshipIds.length} | ${candidate.note} |`,
  )
  .join('\n');
const sourceLinks = (ids: string[]): string =>
  ids
    .map((id) => {
      const source = sourceMap.get(id);
      return source ? `${id} (${source.url})` : id;
    })
    .join(', ');
const publishedLines = approvedRelationships
  .map(
    (relation) =>
      `- ${relation.id}: ${relation.personAId} — ${relation.relationshipLabel} — ${relation.personBId}; kinship sources ${sourceLinks(relation.kinshipSourceIds)}; career sources ${sourceLinks(relation.careerSourceIds)}.`,
  )
  .join('\n');
const candidateNameById = new Map(
  roster.map((candidate) => [candidate.id, candidate.displayName]),
);
const verificationLines = verification
  .map(
    (record) =>
      `### ${candidateNameById.get(record.candidateId) ?? record.candidateId} — ${record.relativeName}\n\n- Status: ${record.status}\n- Rationale: ${record.rationale}\n- Kinship sources: ${sourceLinks(stringArray(record.kinshipSourceIds)) || 'none'}\n- Career sources: ${sourceLinks(stringArray(record.careerSourceIds)) || 'none'}`,
  )
  .join('\n\n');
writeText(
  join(root, 'reports/political-family-research.md'),
  `# Political family research\n\n- Snapshot: ${snapshotDate}\n- Research cutoff: ${researchDate}\n- Candidates in canonical roster: ${roster.length}\n- Candidate research rows: ${rowByCandidate.size}/${roster.length} (raw rows: ${rows.length})\n- Proposed relations: ${relationships.length}\n- Published relations: ${approvedRelationships.length}\n- Distinct sources: ${allSources.length}\n\n## Published relationships\n\n${publishedLines || '尚無通過獨立查核的公開關係。'}\n\n## Candidate coverage matrix\n\n| Candidate | Candidate ID | Status | Published relations | Note |\n|---|---|---:|---:|---|\n${matrix}\n`,
);
writeText(
  join(root, 'reports/political-family-verification.md'),
  `# Political family verification\n\n每筆公開關係必須同時具備：明確親屬來源、政治職涯來源、正確身分辨識，以及獨立查核結果。\n\n- Researchers: ${researchers.join(', ') || '尚未匯入'}\n- Independent verification records: ${verification.length}\n- Verified and published relationships: ${approvedRelationships.length}\n- Withheld or unresolved findings: ${unresolvedFindings.length}\n\n公開層採 fail-closed 原則；缺少獨立查核或任一證據面向時，不會進入公開圖表。\n\n## Verification records\n\n${verificationLines || '尚無獨立查核紀錄。'}\n`,
);
writeText(
  join(root, 'reports/political-family-coverage.md'),
  `# Political family coverage\n\n## Summary\n\n- Canonical roster: ${roster.length} candidates\n- Research audit rows: ${rowByCandidate.size}/${roster.length} (raw rows: ${rows.length})\n- Verified-relations-found: ${candidateResearch.filter((item) => item.researchStatus === 'verified-relations-found').length}\n- Searched with no publishable relation: ${candidateResearch.filter((item) => item.researchStatus === 'searched-no-verified-relations').length}\n- Unresolved: ${candidateResearch.filter((item) => item.researchStatus === 'unresolved').length}\n\n## Candidate-by-candidate matrix\n\n| Sequence | Candidate | Candidate ID | Status | Note |\n|---:|---|---|---|---|\n${roster
    .map((candidate) => {
      const result = candidateResearch.find(
        (item) => item.candidateId === candidate.id,
      );
      return `| ${candidate.sequence} | ${candidate.displayName} | ${candidate.id} | ${result?.researchStatus ?? 'unresolved'} | ${result?.note ?? '缺少研究記錄'} |`;
    })
    .join('\n')}\n`,
);

console.log(
  JSON.stringify(
    {
      candidateCount: roster.length,
      researchRows: rows.length,
      proposedRelations: relationships.length,
      publishedRelations: approvedRelationships.length,
      sources: allSources.length,
      verifierRecords: verification.length,
    },
    null,
    2,
  ),
);
