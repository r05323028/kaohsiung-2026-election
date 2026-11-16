import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  type PoliticalFamilyVerificationCorrections,
  validatePoliticalFamilyVerificationCorrections,
} from '../src/data/political-family/corrections';
import {
  validatePoliticalFamilyPublication,
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
  positionSourceIds: string[];
  career: unknown;
  positions: unknown;
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
  relation?: string;
  status: 'verified' | 'rejected' | 'unresolved';
  rationale: string;
  sourceIds?: string[];
  kinshipSourceIds?: string[];
  positionSourceIds?: string[];
  sources?: JsonObject[];
  career?: unknown;
  positions?: unknown;
  independentReview?: JsonObject;
  correction?: {
    previousStatus: 'verified' | 'rejected' | 'unresolved';
    removedClaims: JsonObject[];
    reason: string;
    reviewedAgainst: string[];
    appliedAt: string;
  };
};
type FindingInput = {
  generatedAt: string;
  researchers: string[];
  rows: RawRow[];
  relations: RawRelation[];
  verification: VerificationRecord[];
  sources: SourceRecord[];
};
type AffiliationStatus =
  | 'current-officeholder'
  | 'former-officeholder'
  | 'current-candidate'
  | 'former-candidate'
  | 'political-appointee'
  | 'party-official'
  | 'historical-status-unknown';
type Affiliation = {
  id: string;
  organization: string;
  listingStatus: 'listed' | 'otc' | 'unlisted' | 'unknown' | null;
  organizationType:
    | 'government'
    | 'legislature'
    | 'political_organization'
    | 'corporation'
    | 'business_group'
    | 'foundation'
    | 'nonprofit';
  positionTitle: string;
  positionCategory:
    | 'political'
    | 'public_office'
    | 'executive'
    | 'board'
    | 'organizational_leadership';
  status: AffiliationStatus;
  startDate: string | null;
  endDate: string | null;
  sourceIds: string[];
};
type Person = {
  id: string;
  displayName: string;
  candidateId?: string;
  affiliations: Affiliation[];
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
  verificationStatus: 'verified' | 'pending-verification' | 'rejected';
  kinshipSourceIds: string[];
  positionSourceIds: string[];
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
const correctionsPath = join(
  root,
  'data/research/2026/political-family/verification-corrections.json',
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
  if (/姻親|岳|公公|婆婆|媳婦|女婿|in-law/i.test(relation)) return 'in-laws';
  if (/曾祖|祖父|祖母|外祖|孫|grand/i.test(relation)) {
    return 'grandparent-grandchild';
  }
  if (
    /配偶|丈夫|妻子|太太|老婆|老公|先生|husband|wife|spouse/i.test(relation)
  ) {
    return 'spouses';
  }
  if (/叔|伯|姑|姨|舅|甥|姪|侄|uncle|aunt|nephew|niece/i.test(relation)) {
    return 'uncle-aunt-niece-nephew';
  }
  if (/表|堂|cousin/i.test(relation)) return 'cousins';
  if (/兄|弟|姊|姐|妹|sibling|brother|sister/i.test(relation)) {
    return 'siblings';
  }
  if (/父|母|爸|媽|爹|娘|father|mother|dad|mom/i.test(relation)) {
    return 'parent-child';
  }
  if (/子|女|兒|囝|son|daughter|child/i.test(relation)) return 'parent-child';
  return 'other';
}

function candidateSideLabel(relation: string): string {
  if (/姻親|岳|公公|婆婆|媳婦|女婿|in-law/i.test(relation)) return '姻親';
  if (/曾祖|祖父|祖母|外祖|孫|grand/i.test(relation)) return '孫輩／祖輩';
  if (
    /配偶|丈夫|妻子|太太|老婆|老公|先生|husband|wife|spouse/i.test(relation)
  ) {
    return '配偶';
  }
  if (/叔|伯|姑|姨|舅|甥|姪|侄|uncle|aunt|nephew|niece/i.test(relation)) {
    return '姪甥／叔伯姑姨';
  }
  if (/表|堂|cousin/i.test(relation)) return '表堂親';
  if (/兄|弟|姊|姐|妹|sibling|brother|sister/i.test(relation)) {
    return '兄弟姊妹';
  }
  if (/父|母|爸|媽|爹|娘|father|mother|dad|mom/i.test(relation)) return '子女';
  if (/子|女|兒|囝|son|daughter|child/i.test(relation)) return '父母';
  return '候選人親屬';
}

type OrganizationTypeValue = Affiliation['organizationType'];
type PositionCategoryValue = Affiliation['positionCategory'];

function normalizeOrganizationType(
  value: unknown,
): OrganizationTypeValue | null {
  const text = stringValue(value)
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  const alias: Record<string, OrganizationTypeValue> = {
    government: 'government',
    public_agency: 'government',
    administration: 'government',
    legislature: 'legislature',
    parliament: 'legislature',
    council: 'legislature',
    political_organization: 'political_organization',
    political_party: 'political_organization',
    party: 'political_organization',
    corporation: 'corporation',
    company: 'corporation',
    listed_company: 'corporation',
    public_company: 'corporation',
    business_group: 'business_group',
    conglomerate: 'business_group',
    group: 'business_group',
    foundation: 'foundation',
    nonprofit: 'nonprofit',
    non_profit: 'nonprofit',
    ngo: 'nonprofit',
    npo: 'nonprofit',
  };
  return alias[text] ?? null;
}

function inferOrganizationType(
  organization: string,
  positionTitle: string,
): OrganizationTypeValue {
  const text = organization + ' ' + positionTitle;
  if (/立法院|議會|議長|議員|立法委員|國會|市議會|縣議會/.test(text))
    return 'legislature';
  if (/黨|政黨|黨部|競選總部|後援會/.test(text))
    return 'political_organization';
  if (/基金會|文教基金|慈善基金/.test(text)) return 'foundation';
  if (
    /協會|公會|工會|學會|社團|聯盟|紅十字|扶輪|獅子會|宗親會|同鄉會|NPO|NGO|非營利/.test(
      text,
    )
  )
    return 'nonprofit';
  if (/集團|控股公司|企業集團/.test(text)) return 'business_group';
  if (
    /股份有限公司|有限公司|公司|企業|實業|工業|科技|建設|開發|投資|銀行|金控|證券|保險|營造|貿易|生技|食品|紡織|鋼鐵|電子|商行/.test(
      text,
    )
  )
    return 'corporation';
  return 'government';
}

function normalizePositionCategory(
  value: unknown,
): PositionCategoryValue | null {
  const text = stringValue(value)
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  const alias: Record<string, PositionCategoryValue> = {
    political: 'political',
    party: 'political',
    public_office: 'public_office',
    publicoffice: 'public_office',
    elected: 'public_office',
    appointed: 'public_office',
    executive: 'executive',
    management: 'executive',
    board: 'board',
    director: 'board',
    organizational_leadership: 'organizational_leadership',
    leadership: 'organizational_leadership',
  };
  return alias[text] ?? null;
}

function inferPositionCategory(
  positionTitle: string,
  organizationType: OrganizationTypeValue,
): PositionCategoryValue {
  if (/董事長|副董事長|董事|監察人|常務董事|獨立董事|常董/.test(positionTitle))
    return 'board';
  if (
    /總經理|副總經理|總裁|執行長|財務長|營運長|技術長|發言人|經理|執行副總|CEO|COO|CFO/.test(
      positionTitle,
    )
  )
    return 'executive';
  if (
    /理事長|會長|秘書長|創辦人|執行秘書|總幹事|召集人|常務理事|常務監事/.test(
      positionTitle,
    )
  )
    return organizationType === 'corporation' ||
      organizationType === 'business_group'
      ? 'executive'
      : 'organizational_leadership';
  if (
    /議員|立法委員|市長|縣長|鄉長|鎮長|區長|代表|議長|副議長|主席|總統|副總統|村長|里長/.test(
      positionTitle,
    )
  )
    return 'public_office';
  if (/部長|主委|主任委員|政務委員|次長|局長|處長|署長/.test(positionTitle))
    return 'public_office';
  if (/黨主席|中常委|評議委員|黨部/.test(positionTitle)) return 'political';
  return 'organizational_leadership';
}

function affiliationStatus(
  value: unknown,
  positionTitle: string,
): AffiliationStatus {
  const text = stringValue(value).toLowerCase();
  const direct: Record<string, AffiliationStatus> = {
    'current-officeholder': 'current-officeholder',
    'former-officeholder': 'former-officeholder',
    'current-candidate': 'current-candidate',
    'former-candidate': 'former-candidate',
    'political-appointee': 'political-appointee',
    'party-official': 'party-official',
    'historical-status-unknown': 'historical-status-unknown',
  };
  if (direct[text]) return direct[text];
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
  if (/議員|市長|縣長|鄉長|代表|立委|院長/.test(positionTitle)) {
    return 'historical-status-unknown';
  }
  return 'historical-status-unknown';
}

function listingStatusFor(
  organizationType: string,
  raw: string,
): 'listed' | 'otc' | 'unlisted' | 'unknown' | null {
  if (
    organizationType !== 'corporation' &&
    organizationType !== 'business_group'
  ) {
    return null;
  }
  if (raw === 'listed' || raw === 'twse') return 'listed';
  if (raw === 'otc' || raw === 'tpex') return 'otc';
  if (raw === 'unlisted') return 'unlisted';
  return 'unknown';
}

function affiliationRecords(
  rawRelation: RawRelation,
  relativeId: string,
  additionalSourceIds: string[] = [],
): Affiliation[] {
  const entries: unknown[] = [];
  if (rawRelation.career !== undefined && rawRelation.career !== null) {
    entries.push(
      ...(Array.isArray(rawRelation.career)
        ? rawRelation.career
        : [rawRelation.career]),
    );
  }
  if (rawRelation.positions !== undefined && rawRelation.positions !== null) {
    entries.push(
      ...(Array.isArray(rawRelation.positions)
        ? rawRelation.positions
        : [rawRelation.positions]),
    );
  }
  const records: Affiliation[] = [];
  entries.forEach((item, index) => {
    const entry = objectValue(item);
    if (Object.keys(entry).length === 0) return;
    const positionTitle = stringValue(
      entry.positionTitle,
      stringValue(
        entry.officeTitle,
        stringValue(entry.office, stringValue(entry.title, '職務')),
      ),
    );
    const organization = stringValue(
      entry.organizationName,
      stringValue(entry.organization, '來源未標示組織'),
    );
    const organizationType =
      normalizeOrganizationType(entry.organizationType) ??
      inferOrganizationType(organization, positionTitle);
    const positionCategory =
      normalizePositionCategory(entry.positionCategory) ??
      inferPositionCategory(positionTitle, organizationType);
    const ownSourceIds = [
      ...stringArray(entry.sourceIds),
      ...objectArray(entry.sources).map((source) => stringValue(source.id)),
    ].filter(Boolean);
    const sourceIds = [...new Set([...ownSourceIds, ...additionalSourceIds])];
    if (sourceIds.length === 0) return;
    records.push({
      id:
        'affiliation-' +
        hash(
          relativeId + '|' + organization + '|' + positionTitle + '|' + index,
        ),
      organization,
      organizationType,
      positionTitle,
      positionCategory,
      listingStatus: listingStatusFor(
        organizationType,
        stringValue(entry.listingStatus, ''),
      ),
      status: affiliationStatus(entry.status, positionTitle),
      startDate: dateOnly(entry.startDate ?? entry.start),
      endDate: dateOnly(entry.endDate ?? entry.end),
      sourceIds,
    });
  });
  return records;
}

function relationIdentitySignature(relation: RawRelation): string[] {
  const entries = [
    ...(Array.isArray(relation.career) ? relation.career : [relation.career]),
    ...(Array.isArray(relation.positions)
      ? relation.positions
      : [relation.positions]),
  ];
  return [
    ...new Set(
      entries
        .map((item) => {
          const entry = objectValue(item);
          if (Object.keys(entry).length === 0) return '';
          const organization = stringValue(
            entry.organizationName,
            stringValue(entry.organization),
          );
          const title = stringValue(
            entry.positionTitle,
            stringValue(
              entry.officeTitle,
              stringValue(entry.office, stringValue(entry.title)),
            ),
          );
          return organization + '|' + title;
        })
        .filter(Boolean),
    ),
  ].sort();
}

function stableRelationKey(relation: RawRelation): string {
  const explicitKey = stringValue(relation.claimId, stringValue(relation.id));
  return (
    explicitKey ||
    `${relation.candidateId}|${relation.relativeName}|${relation.relation}`
  );
}

const networkDir = join(root, 'data/research/2026/political-family/networks');

function inlineSourceId(
  value: unknown,
  addSource: (source: JsonObject) => void,
): string | null {
  const source = objectValue(value);
  const url = stringValue(source.url);
  if (!/^https?:\/\//.test(url)) return null;
  const id = stringValue(
    source.id,
    'source-' + hash(url + '|' + stringValue(source.title)),
  );
  addSource({ ...source, id });
  return id;
}

function normalizeNetworkRelation(
  relation: JsonObject,
  candidateId: string,
  addSource: (source: JsonObject) => void,
): RawRelation {
  const kinshipId = inlineSourceId(relation.kinship, addSource);
  const kinshipIds = [
    ...stringArray(relation.kinshipSourceIds),
    ...(kinshipId ? [kinshipId] : []),
  ];
  const positions = objectArray(relation.positions).map((position) => {
    const sourceIds = [
      ...stringArray(position.sourceIds),
      ...objectArray(position.sources)
        .map((source) => inlineSourceId(source, addSource))
        .filter((id): id is string => Boolean(id)),
      ...(position.source ? [inlineSourceId(position.source, addSource)] : []),
    ].filter((id): id is string => Boolean(id));
    return { ...position, sourceIds };
  });
  const positionSourceIds = [
    ...new Set([
      ...stringArray(relation.positionSourceIds),
      ...positions.flatMap((position) => stringArray(position.sourceIds)),
    ]),
  ];
  return {
    ...relation,
    candidateId,
    relativeName: stringValue(relation.relativeName),
    relation: stringValue(
      relation.relationLabel,
      stringValue(relation.relation, '親屬'),
    ),
    kinshipSourceIds: [...new Set(kinshipIds)],
    positionSourceIds,
    career: relation.career ?? null,
    positions,
    researchOrigin: 'network',
  } as RawRelation;
}

function outcomeRank(outcome: string): number {
  if (outcome === 'verified-relations-found' || outcome === 'relations-found') {
    return 3;
  }
  if (outcome === 'unresolved') return 2;
  return 1;
}

function dedupeRelations(relations: RawRelation[]): RawRelation[] {
  const byKey = new Map<string, RawRelation>();
  for (const relation of relations) {
    const key =
      relation.candidateId +
      '|' +
      relation.relativeName.trim() +
      '|' +
      String(relation.relation).trim();
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, relation);
      continue;
    }
    byKey.set(key, {
      ...existing,
      kinshipSourceIds: [
        ...new Set([
          ...stringArray(existing.kinshipSourceIds),
          ...stringArray(relation.kinshipSourceIds),
        ]),
      ],
      positionSourceIds: [
        ...new Set([
          ...stringArray(existing.positionSourceIds),
          ...stringArray(relation.positionSourceIds),
        ]),
      ],
      career: existing.career ?? relation.career,
      positions: [
        ...objectArray(existing.positions),
        ...objectArray(relation.positions),
      ],
    });
  }
  return [...byKey.values()];
}

function mergeRows(rows: RawRow[]): RawRow[] {
  const byCandidate = new Map<string, RawRow>();
  for (const row of rows) {
    const existing = byCandidate.get(row.candidateId);
    if (!existing) {
      byCandidate.set(row.candidateId, {
        ...row,
        relations: objectArray(row.relations) as RawRelation[],
      });
      continue;
    }
    byCandidate.set(row.candidateId, {
      ...existing,
      searchedAt: stringValue(row.searchedAt, stringValue(existing.searchedAt)),
      queries: [
        ...new Set([
          ...stringArray(existing.queries),
          ...stringArray(row.queries),
        ]),
      ],
      urlsAttempted: [
        ...new Set([
          ...stringArray(existing.urlsAttempted),
          ...stringArray(row.urlsAttempted),
        ]),
      ],
      outcome:
        outcomeRank(row.outcome) > outcomeRank(existing.outcome)
          ? row.outcome
          : existing.outcome,
      relations: dedupeRelations([
        ...objectArray(existing.relations),
        ...objectArray(row.relations),
      ] as RawRelation[]),
      rejectedOrAmbiguousClaims: [
        ...objectArray(existing.rejectedOrAmbiguousClaims),
        ...objectArray(row.rejectedOrAmbiguousClaims),
      ],
      rejectedFindings: [
        ...objectArray(existing.rejectedFindings),
        ...objectArray(row.rejectedFindings),
      ],
    });
  }
  return [...byCandidate.values()];
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
  const addSource = (value: JsonObject) => {
    const source = normalizeSource(
      value,
      stringValue(value.id, stringValue(value.sourceId)),
    );
    if (source) sources.push(source);
  };
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
        addSource(sourceValue);
      }
      researchers.push(file);
    } catch (error) {
      if (!isMissingFile(error)) throw error;
      // Missing batches are rejected by the complete-roster assertion below.
    }
  }
  let networkFiles: string[] = [];
  try {
    networkFiles = readdirSync(networkDir)
      .filter((entry) => /^batch-\d{2}\.json$/.test(entry))
      .sort();
  } catch (error) {
    if (!isMissingFile(error)) throw error;
  }
  for (const file of networkFiles) {
    const document = readJsonDocument(join(networkDir, file));
    const input = Array.isArray(document) ? {} : document;
    const sourceRows = Array.isArray(document)
      ? document
      : objectArray(input.rows ?? input.candidates);
    for (const row of sourceRows) {
      const candidateId = stringValue(row.candidateId);
      if (!candidateId) continue;
      rows.push({
        ...row,
        candidateId,
        sequence: Number(row.sequence ?? 0),
        displayName: stringValue(row.displayName),
        outcome:
          stringValue(row.outcome) === 'relations-found'
            ? 'verified-relations-found'
            : stringValue(row.outcome),
        relations: objectArray(row.relations)
          .map((relation) =>
            normalizeNetworkRelation(relation, candidateId, addSource),
          )
          .filter((relation) => relation.relativeName),
        rejectedOrAmbiguousClaims: objectArray(
          row.rejectedOrAmbiguousClaims ?? row.rejectedFindings,
        ),
      } as RawRow);
    }
    for (const sourceValue of objectArray(
      input.sources ?? input.sourceCatalog,
    )) {
      addSource(sourceValue);
    }
    researchers.push('networks/' + file);
  }
  return {
    rows: mergeRows(rows).sort((left, right) => left.sequence - right.sequence),
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
    relation: stringValue(value.relation),
    status: status as VerificationRecord['status'],
    rationale: stringValue(value.rationale, '獨立查核未提供足夠公開證據。'),
    sourceIds: stringArray(value.sourceIds),
    kinshipSourceIds: stringArray(value.kinshipSourceIds),
    positionSourceIds: stringArray(
      value.positionSourceIds ?? value.careerSourceIds,
    ),
    sources: objectArray(value.sources),
    career: value.career,
    positions: value.positions,
    ...(Object.keys(review).length > 0 ? { independentReview: review } : {}),
  };
}

function independentReviewSourceIds(record: VerificationRecord): string[] {
  // Source checks are fetch telemetry, not citations. Only ids that are also
  // declared with publisher/URL on the record may flow into the public source
  // list, otherwise the affiliation would reference a source that does not
  // exist in the dataset.
  const declared = new Set(
    objectArray(record.sources)
      .map((source) => stringValue(source.id, stringValue(source.sourceId)))
      .filter(Boolean),
  );
  return objectArray(record.independentReview?.sourceChecks)
    .map((check) => stringValue(check.sourceId))
    .filter((id) => id.length > 0 && declared.has(id));
}

function readCorrections(): PoliticalFamilyVerificationCorrections {
  return validatePoliticalFamilyVerificationCorrections(
    readJson(correctionsPath),
  );
}

function readVerification(
  corrections: PoliticalFamilyVerificationCorrections,
): VerificationRecord[] {
  const paths = [
    verificationPath,
    join(
      root,
      'data/research/2026/political-family/verification-networks.json',
    ),
  ];
  // Later files supersede earlier ones: a fresh independent check of the
  // same candidate/relative pair replaces the legacy verdict instead of
  // producing two conflicting records for one relationship.
  const byKey = new Map<string, VerificationRecord>();
  for (const path of paths) {
    let input: JsonObject;
    try {
      input = readJson(path);
    } catch (error) {
      if (isMissingFile(error)) continue;
      throw error;
    }
    const values = objectArray(input.relations ?? input.records);
    if (values.length === 0 && path === verificationPath) {
      throw new Error('Verification file contains no records: ' + path);
    }
    for (const value of values) {
      const record = parseVerificationRecord(value);
      byKey.set(
        record.candidateId + String.fromCharCode(124) + record.relativeName,
        record,
      );
    }
  }
  for (const correction of corrections.records) {
    const key =
      correction.candidateId +
      String.fromCharCode(124) +
      correction.relativeName;
    const record = byKey.get(key);
    if (!record) {
      throw new Error(
        'Correction targets a missing verification record: ' +
          correction.candidateId +
          ' / ' +
          correction.relativeName,
      );
    }
    const positionSourceIds =
      correction.positionSource === 'correction-record'
        ? stringArray(correction.positionSourceIds)
        : stringArray(record.positionSourceIds);
    byKey.set(key, {
      ...record,
      status: 'verified',
      positions:
        correction.positionSource === 'correction-record'
          ? correction.positions
          : record.positions,
      positionSourceIds,
      sourceIds: [
        ...new Set([...stringArray(record.sourceIds), ...positionSourceIds]),
      ],
      correction: {
        previousStatus: record.status,
        removedClaims: correction.removedClaims,
        reason: correction.reason,
        reviewedAgainst: correction.reviewedAgainst,
        appliedAt: corrections.appliedAt,
      },
    });
  }
  const records = [...byKey.values()];
  if (records.length === 0) {
    throw new Error('No independent verification records were found.');
  }
  return records;
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
const {
  rows: mergedRows,
  researchers,
  sources: batchSources,
} = readResearchRows();
const corrections = readCorrections();
const candidateCorrections = new Map(
  corrections.candidateOutcomes.map((correction) => [
    correction.candidateId,
    correction,
  ]),
);
const rows = mergedRows.map((row) => {
  const correction = candidateCorrections.get(row.candidateId);
  return correction ? { ...row, outcome: correction.outcome } : row;
});
const mergedRowByCandidate = new Map(
  mergedRows.map((row) => [row.candidateId, row]),
);
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
const proposedRelations: RawRelation[] = [];

for (const row of rows) {
  for (const relationValue of objectArray(row.relations)) {
    const relation = relationValue as RawRelation;
    proposedRelations.push({
      ...relation,
      candidateId: row.candidateId,
      relativeName: stringValue(relation.relativeName),
      relation: stringValue(relation.relation),
      kinshipSourceIds: stringArray(relation.kinshipSourceIds),
      positionSourceIds: stringArray(
        relation.positionSourceIds ?? relation.careerSourceIds,
      ),
      career: relation.career,
      positions: relation.positions,
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

const SCHEMA_RELATION_TYPES = new Set([
  'parent-child',
  'spouses',
  'siblings',
  'grandparent-grandchild',
  'uncle-aunt-niece-nephew',
  'cousins',
  'in-laws',
  'other',
]);

/** Direction class of a kinship label, used to catch contradictory claims. */
function relationDirection(label: string): string {
  const text = label.trim();
  if (SCHEMA_RELATION_TYPES.has(text)) return 'other';
  if (/岳|公公|婆婆|婿|媳|in-law/i.test(text)) return 'in-law';
  if (/祖|孫|外祖|grand/i.test(text)) return 'grand';
  if (/配偶|丈夫|妻子|太太|先生|老婆|老公|husband|wife|spouse/i.test(text)) {
    return 'spouse';
  }
  if (/父|母|爸|媽|爹|娘|father|mother|dad|mom/i.test(text)) return 'parent';
  if (/子|女|兒|囝|son|daughter|child/i.test(text)) return 'child';
  if (/兄|弟|姊|姐|妹|sibling|brother|sister/i.test(text)) return 'sibling';
  if (/叔|伯|姑|姨|舅|甥|姪|侄|uncle|aunt|nephew|niece/i.test(text)) {
    return 'uncle';
  }
  if (/表|堂|cousin/i.test(text)) return 'cousin';
  return 'other';
}

/**
 * The same named person cannot be both the candidate's father and the
 * candidate's son. Collect those contradictions so nothing ambiguous is
 * published under a guessed direction.
 */
function contradictionKeys(relations: RawRelation[]): Set<string> {
  const byName = new Map<string, { key: string; direction: string }[]>();
  for (const relation of relations) {
    const key = relationProposalKey(relation);
    const name = relation.candidateId + '|' + relation.relativeName.trim();
    const list = byName.get(name) ?? [];
    list.push({ key, direction: relationDirection(relation.relation) });
    byName.set(name, list);
  }
  const conflicted = new Set<string>();
  for (const list of byName.values()) {
    const directions = new Set(list.map((item) => item.direction));
    if (directions.size > 1) {
      for (const item of list) conflicted.add(item.key);
    }
  }
  return conflicted;
}

function relationProposalKey(relation: RawRelation): string {
  return (
    relation.candidateId +
    '|' +
    relation.relativeName.trim() +
    '|' +
    String(relation.relation).trim()
  );
}

/**
 * Legacy researcher batches and the network batches sometimes describe the
 * same kinship from opposite sides (father vs son). The verifier record is
 * the authority on direction and type, so choose exactly one proposal per
 * candidate+relative pair before contradiction detection. Already approved
 * proposals always win so regeneration cannot silently drop a published ID.
 */
function canonicalizeRelationInputs(
  relations: RawRelation[],
  verificationByKey: Map<string, VerificationRecord>,
): RawRelation[] {
  const groups = new Map<string, RawRelation[]>();
  for (const relation of relations) {
    const key =
      relation.candidateId +
      '|' +
      relation.relativeName.trim().normalize('NFC');
    const group = groups.get(key) ?? [];
    group.push(relation);
    groups.set(key, group);
  }
  const selected: RawRelation[] = [];
  for (const group of groups.values()) {
    const first = group[0];
    if (!first) continue;
    const record = verificationByKey.get(
      first.candidateId + '|' + first.relativeName.trim(),
    );
    let candidates = group;
    if (record) {
      const verifiedType = relationshipType(String(record.relation ?? ''));
      if (verifiedType !== 'other') {
        const typed = candidates.filter(
          (relation) => relationshipType(relation.relation) === verifiedType,
        );
        if (typed.length > 0) candidates = typed;
      }
      const verifiedDirection = relationDirection(
        String(record.relation ?? ''),
      );
      if (verifiedDirection !== 'other') {
        const directed = candidates.filter(
          (relation) =>
            relationDirection(relation.relation) === verifiedDirection,
        );
        if (directed.length > 0) candidates = directed;
      }
    }
    const score = (relation: RawRelation): number => {
      let value = 0;
      if (relation.researchOrigin === 'network') value += 20;
      if (relationshipType(relation.relation) !== 'other') value += 5;
      if (relationDirection(relation.relation) !== 'other') value += 2;
      if (/[㐀-鿿]/.test(relation.relation)) value += 3;
      value += stringArray(relation.positionSourceIds).length * 0.1;
      value += stringArray(relation.kinshipSourceIds).length * 0.05;
      return value;
    };
    candidates.sort((a, b) => {
      const delta = score(b) - score(a);
      if (delta !== 0) return delta;
      return relationProposalKey(a).localeCompare(relationProposalKey(b));
    });
    const best = candidates[0];
    if (best) selected.push(best);
  }
  return selected;
}

const verification = readVerification(corrections);
for (const record of verification) {
  for (const sourceValue of objectArray(record.sources)) {
    const source = normalizeSource(
      sourceValue,
      stringValue(sourceValue.id, stringValue(sourceValue.sourceId)),
    );
    if (source) sourceMap.set(source.id, source);
  }
}

const verificationByKey = new Map<string, VerificationRecord>();
for (const record of verification) {
  const key = record.candidateId + '|' + record.relativeName;
  if (verificationByKey.has(key)) {
    throw new Error('Ambiguous duplicate verification record for ' + key + '.');
  }
  verificationByKey.set(key, record);
}
const correctionByKey = new Map(
  corrections.records.map((record) => [
    record.candidateId + String.fromCharCode(124) + record.relativeName,
    record,
  ]),
);
const appliedCorrectionKeys = new Set<string>();
const relationInputs = canonicalizeRelationInputs(
  proposedRelations,
  verificationByKey,
).map((relation) => {
  const key =
    relation.candidateId +
    String.fromCharCode(124) +
    relation.relativeName.trim();
  const correction = correctionByKey.get(key);
  if (!correction) return relation;
  const record = verificationByKey.get(key);
  if (!record) {
    throw new Error('Correction has no verification record for ' + key + '.');
  }
  const actualRelationshipId =
    'family-relation-' + hash(stableRelationKey(relation));
  if (actualRelationshipId !== correction.relationshipId) {
    throw new Error(
      'Correction relationship id mismatch for ' +
        key +
        ': expected ' +
        correction.relationshipId +
        ', generated ' +
        actualRelationshipId +
        '.',
    );
  }
  appliedCorrectionKeys.add(key);
  return {
    ...relation,
    positions:
      correction.positionSource === 'correction-record'
        ? (correction.positions ?? [])
        : record.positions,
    positionSourceIds:
      correction.positionSource === 'correction-record'
        ? stringArray(correction.positionSourceIds)
        : stringArray(record.positionSourceIds),
  };
});
for (const correction of corrections.records) {
  const key =
    correction.candidateId + String.fromCharCode(124) + correction.relativeName;
  if (!appliedCorrectionKeys.has(key)) {
    throw new Error(
      'Correction was not applied because no canonical relation matched: ' +
        key,
    );
  }
  const record = verificationByKey.get(key);
  if (!record) throw new Error('Correction has no verification record: ' + key);
  const declaredSourceIds = new Set([
    ...stringArray(record.sourceIds),
    ...stringArray(record.kinshipSourceIds),
    ...stringArray(record.positionSourceIds),
  ]);
  for (const position of correction.positions ?? []) {
    for (const sourceId of stringArray(position.sourceIds)) {
      if (!declaredSourceIds.has(sourceId)) {
        throw new Error(
          'Correction position source is not declared on the verifier record: ' +
            key +
            ' / ' +
            sourceId,
        );
      }
    }
  }
  for (const sourceId of stringArray(correction.positionSourceIds)) {
    if (!declaredSourceIds.has(sourceId)) {
      throw new Error(
        'Correction position source is not declared on the verifier record: ' +
          key +
          ' / ' +
          sourceId,
      );
    }
  }
  const sourceUrls = new Set(
    objectArray(record.sources)
      .map((source) => stringValue(source.url))
      .filter(Boolean),
  );
  for (const url of correction.reviewedAgainst) {
    if (!sourceUrls.has(url)) {
      throw new Error(
        'Correction reviewedAgainst URL is not in the verifier sources: ' +
          key +
          ' / ' +
          url,
      );
    }
  }
}
const conflictedRelationKeys = contradictionKeys(relationInputs);

const allSources = [...sourceMap.values()];
const sourceIds = new Set(allSources.map((source) => source.id));
const candidatePeople: Person[] = roster.map((candidate) => ({
  id: `person-${candidate.slug}`,
  displayName: candidate.displayName,
  candidateId: candidate.id,
  affiliations: [],
}));
const peopleById = new Map(
  candidatePeople.map((person) => [person.id, person]),
);
const relationships: Relationship[] = [];
const unresolvedFindings: UnresolvedFinding[] = [];
const relativeIdentityByName = new Map<
  string,
  { id: string; signature: Set<string> }
>();

for (const relation of relationInputs) {
  const relativeName = relation.relativeName.trim();
  const candidate = roster.find((item) => item.id === relation.candidateId);
  if (!candidate || !relativeName) continue;
  const identityKey = relativeName.normalize('NFC');
  const signature = relationIdentitySignature(relation);
  const knownIdentity = relativeIdentityByName.get(identityKey);
  const identityConflict = Boolean(
    knownIdentity &&
      knownIdentity.signature.size > 0 &&
      signature.length > 0 &&
      !signature.some((entry) => knownIdentity.signature.has(entry)),
  );
  const relativeId =
    knownIdentity?.id ?? `political-person-${hash(identityKey)}`;
  relativeIdentityByName.set(identityKey, {
    id: relativeId,
    signature: new Set([...(knownIdentity?.signature ?? []), ...signature]),
  });
  const verificationRecord = verificationByKey.get(
    `${relation.candidateId}|${relativeName}`,
  );
  const positionSourceIds = [
    ...new Set([
      ...stringArray(
        verificationRecord?.positionSourceIds ?? relation.positionSourceIds,
      ),
      ...(verificationRecord
        ? independentReviewSourceIds(verificationRecord)
        : []),
    ]),
  ];
  const career = affiliationRecords(relation, relativeId, positionSourceIds);
  const existing = peopleById.get(relativeId);
  if (existing) {
    const known = new Map(existing.affiliations.map((item) => [item.id, item]));
    for (const item of career) known.set(item.id, item);
    existing.affiliations = [...known.values()];
  } else {
    peopleById.set(relativeId, {
      id: relativeId,
      displayName: relation.relativeName,
      affiliations: career,
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
    ...new Set([...kinshipSourceIds, ...positionSourceIds]),
  ];
  // A verification record only covers the exact sources it checked. Newly
  // proposed sources (for example a fresh research batch) need their own
  // independent re-check before they can inherit an earlier verdict.
  const verifiedSources = new Set([
    ...stringArray(verificationRecord?.kinshipSourceIds),
    ...stringArray(verificationRecord?.positionSourceIds),
    ...stringArray(verificationRecord?.sourceIds),
  ]);
  const conflicted = conflictedRelationKeys.has(relationProposalKey(relation));
  // The verifier checks a direction too. A record claiming the opposite
  // direction (for example child where the proposal says parent) cannot
  // certify this proposal even when the name matches.
  const recordDirection = relationDirection(
    String(verificationRecord?.relation ?? ''),
  );
  const labelDirection = relationDirection(String(relation.relation));
  const directionMismatch = Boolean(
    verificationRecord &&
      recordDirection !== 'other' &&
      labelDirection !== 'other' &&
      recordDirection !== labelDirection,
  );
  const verified =
    !conflicted &&
    !directionMismatch &&
    verificationRecord?.status === 'verified' &&
    kinshipSourceIds.length > 0 &&
    positionSourceIds.length > 0 &&
    combinedSourceIds.every((id) => sourceIds.has(id)) &&
    [...kinshipSourceIds, ...positionSourceIds].every((id) =>
      verifiedSources.has(id),
    );
  const status: Relationship['verificationStatus'] =
    verified && !identityConflict
      ? 'verified'
      : verificationRecord?.status === 'rejected'
        ? 'rejected'
        : 'pending-verification';
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
    positionSourceIds,
    sourceIds: combinedSourceIds,
  });

  if (status !== 'verified') {
    const reason =
      (conflicted
        ? '同一候選人的同一姓名出現方向矛盾的親屬主張，身分與關係方向待來源確認。'
        : undefined) ??
      (directionMismatch
        ? '獨立查核記錄的親屬方向與研究主張相反，關係方向待來源確認。'
        : undefined) ??
      (identityConflict
        ? '同一姓名在其他候選人脈絡中出現不同的職務指紋，身分待來源複查。'
        : undefined) ??
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

// The same relative can be proposed twice (legacy researcher files plus a
// network batch). One relationship id must appear once, with the strongest
// verification outcome, or candidate assignment counts break.
const relationshipRank: Record<Relationship['verificationStatus'], number> = {
  verified: 3,
  'pending-verification': 2,
  rejected: 1,
};
const relationshipById = new Map<string, Relationship>();
for (const relationship of relationships) {
  const previous = relationshipById.get(relationship.id);
  if (
    !previous ||
    relationshipRank[relationship.verificationStatus] >
      relationshipRank[previous.verificationStatus]
  ) {
    relationshipById.set(relationship.id, relationship);
  }
}
relationships.length = 0;
relationships.push(...relationshipById.values());

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
    const legacyCorrection = candidateCorrections.get(row.candidateId);
    const suppressionText = [
      stringValue(finding.subjectName),
      stringValue(finding.subject),
      stringValue(finding.finding),
      stringValue(finding.claim),
    ].join(' ');
    if (
      legacyCorrection?.suppressLegacyFindingSubjects.some((subject) =>
        suppressionText.includes(subject),
      )
    ) {
      continue;
    }
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
      ?.affiliations.filter((career) =>
        relationship.positionSourceIds.some((id) =>
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
              ...relation.positionSourceIds,
            ]),
          ...verification
            .filter((record) => record.candidateId === candidate.id)
            .flatMap((record) => [
              ...stringArray(record.sourceIds),
              ...stringArray(record.kinshipSourceIds),
              ...stringArray(record.positionSourceIds),
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
  const proposedRelationshipIds = candidateRelations.map(
    (relationship) => relationship.id,
  );
  const researchStatus =
    publishedRelationIds.length > 0
      ? 'verified-relations-found'
      : proposedRelationshipIds.length > 0 ||
          !row ||
          row.outcome === 'unresolved'
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
        (relationship) =>
          relationship.verificationStatus === 'pending-verification',
      )
      .map((relationship) => relationship.id),
    rejectedRelationshipIds: candidateRelations
      .filter((relationship) => relationship.verificationStatus === 'rejected')
      .map((relationship) => relationship.id),
    unresolvedFindingIds: candidateFindings,
    note:
      researchStatus === 'verified-relations-found'
        ? '已取得親屬關係與每個職務的獨立來源支持。'
        : researchStatus === 'unresolved'
          ? '已提出親屬或職務線索，仍在獨立查核，尚無可公開的已核實關係。'
          : '目前尚無已查證且符合收錄條件的親屬資料。',
  };
});

const researchDataset = {
  datasetId: 'kaohsiung-2026-political-family-research',
  schemaVersion: '2',
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
const publicationEligibleRelationships = verifiedRelationships.filter(
  (relationship) => {
    const person = peopleById.get(relationship.personBId);
    return Boolean(
      person?.affiliations.some((affiliation) =>
        affiliation.sourceIds.some((sourceId) =>
          relationship.positionSourceIds.includes(sourceId),
        ),
      ),
    );
  },
);
const publicationEligibleRelationshipIds = new Set(
  publicationEligibleRelationships.map((relationship) => relationship.id),
);
const verifiedWithoutPosition = verifiedRelationships
  .filter(
    (relationship) => !publicationEligibleRelationshipIds.has(relationship.id),
  )
  .map((relationship) => {
    const person = peopleById.get(relationship.personBId);
    return {
      relationshipId: relationship.id,
      candidateId: relationship.personAId,
      relativeName: person?.displayName ?? null,
      relationshipLabel: relationship.relationshipLabel,
      reason:
        '親屬關係已通過獨立查核，但查無符合收錄條件的政商職務，保留在研究層，不進入公開圖層。',
    };
  });
writeJson(
  join(root, '.cache/reports/political-family-verified-without-position.json'),
  {
    generatedAt,
    datasetId: 'kaohsiung-2026-political-family-verified-without-position',
    withheld: verifiedWithoutPosition,
  },
);
if (verifiedWithoutPosition.length > 0) {
  console.warn(
    'verified but no qualifying position: ' +
      verifiedWithoutPosition.length +
      ' (see .cache/reports/political-family-verified-without-position.json)',
  );
}
const publicationCandidates = roster.map((candidate) => {
  const relationIds = publicationEligibleRelationships
    .filter(
      (relationship) => relationship.personAId === `person-${candidate.slug}`,
    )
    .map((relationship) => relationship.id);
  const row = rowByCandidate.get(candidate.id);
  const hasProposedRelation =
    Boolean(row) &&
    ((row?.relations ?? []).length > 0 || row?.outcome === 'unresolved');
  const status = relationIds.length
    ? 'verified-relations-found'
    : hasProposedRelation
      ? 'unresolved'
      : 'searched-no-verified-relations';
  return {
    candidateId: candidate.id,
    researchStatus: status,
    relationshipIds: relationIds,
    note:
      status === 'verified-relations-found'
        ? '已核實的家族政商關係。'
        : status === 'unresolved'
          ? '已提出親屬或職務線索，仍在獨立查核，尚無可公開的已核實關係。'
          : '目前尚無已查證且符合收錄條件的親屬資料。',
  };
});
const publicationRelationPeople = new Set(
  publicationEligibleRelationships.flatMap((relationship) => [
    relationship.personAId,
    relationship.personBId,
  ]),
);
const publicCareerSourcesByPerson = new Map<string, Set<string>>();
for (const relationship of publicationEligibleRelationships) {
  const sources =
    publicCareerSourcesByPerson.get(relationship.personBId) ??
    new Set<string>();
  for (const sourceId of relationship.positionSourceIds) sources.add(sourceId);
  publicCareerSourcesByPerson.set(relationship.personBId, sources);
}
const publicationPeople = [...peopleById.values()]
  .filter((person) => publicationRelationPeople.has(person.id))
  .map((person) => {
    const allowedSources = publicCareerSourcesByPerson.get(person.id);
    if (!allowedSources) return person;
    return {
      ...person,
      affiliations: person.affiliations.filter((career) =>
        career.sourceIds.some((sourceId) => allowedSources.has(sourceId)),
      ),
    };
  });
// A published position source has to belong to a position that also survived
// publication; otherwise the relationship would cite evidence the site does not
// show. Relations whose every position lost its source stay unpublished.
const publishedAffiliationSources = new Map(
  publicationPeople.map((person) => [
    person.id,
    new Set(
      person.affiliations.flatMap((affiliation) => affiliation.sourceIds),
    ),
  ]),
);
const publicationRelationships = publicationEligibleRelationships
  .map((relationship) => {
    const allowed = publishedAffiliationSources.get(relationship.personBId);
    if (!allowed) return relationship;
    const positionSourceIds = relationship.positionSourceIds.filter((id) =>
      allowed.has(id),
    );
    if (!positionSourceIds.length) return null;
    return {
      ...relationship,
      positionSourceIds,
      sourceIds: [
        ...new Set([...relationship.kinshipSourceIds, ...positionSourceIds]),
      ],
    };
  })
  .filter((relationship): relationship is NonNullable<typeof relationship> =>
    Boolean(relationship),
  );
const publicationRelationshipIds = new Set(
  publicationRelationships.map((relationship) => relationship.id),
);
const correctionRelationships = corrections.records.map((correction) => {
  const key =
    correction.candidateId + String.fromCharCode(124) + correction.relativeName;
  const record = verificationByKey.get(key);
  const relationship = relationshipById.get(correction.relationshipId);
  const candidate = roster.find((item) => item.id === correction.candidateId);
  return {
    relationshipId: correction.relationshipId,
    candidateId: correction.candidateId,
    displayName: candidate?.displayName ?? null,
    relativeName: correction.relativeName,
    previousStatus: record?.correction?.previousStatus ?? null,
    status: record?.status ?? null,
    published: publicationRelationshipIds.has(correction.relationshipId),
    positionSource: correction.positionSource,
    removedClaims: correction.removedClaims,
    appliedPositions: record?.positions ?? null,
    reason: correction.reason,
    reviewedAgainst: correction.reviewedAgainst,
    kinshipSourceIds: relationship?.kinshipSourceIds ?? [],
    positionSourceIds: relationship?.positionSourceIds ?? [],
  };
});
const correctionCandidateOutcomes = corrections.candidateOutcomes.map(
  (outcome) => {
    const candidate = roster.find((item) => item.id === outcome.candidateId);
    const previous = mergedRowByCandidate.get(outcome.candidateId);
    const research = candidateResearch.find(
      (item) => item.candidateId === outcome.candidateId,
    );
    return {
      candidateId: outcome.candidateId,
      displayName: candidate?.displayName ?? null,
      previousOutcome: previous?.outcome ?? null,
      outcome: outcome.outcome,
      researchStatus: research?.researchStatus ?? null,
      reason: outcome.reason,
      suppressedFindingSubjects: outcome.suppressLegacyFindingSubjects,
    };
  },
);
const correctionReport = {
  reportType: 'political-family-verification-corrections',
  generatedAt,
  appliedAt: corrections.appliedAt,
  reviewerRole: corrections.reviewerRole,
  note: corrections.note,
  summary: {
    correctedRelationships: correctionRelationships.length,
    verifiedAfterCorrection: correctionRelationships.filter(
      (item) => item.status === 'verified',
    ).length,
    publishedAfterCorrection: correctionRelationships.filter(
      (item) => item.published,
    ).length,
    candidateOutcomes: correctionCandidateOutcomes.length,
  },
  relationships: correctionRelationships,
  candidateOutcomes: correctionCandidateOutcomes,
};
const correctionLines = correctionRelationships
  .map(
    (item) =>
      '- ' +
      item.relationshipId +
      ': ' +
      (item.displayName ?? item.candidateId) +
      ' — ' +
      item.relativeName +
      '; previous=' +
      String(item.previousStatus) +
      ', status=' +
      String(item.status) +
      ', published=' +
      (item.published ? 'yes' : 'no') +
      '; removed=' +
      item.removedClaims
        .map((claim) => claim.organization + ' ' + claim.positionTitle)
        .join('、'),
  )
  .join('\n');
const correctionOutcomeLines = correctionCandidateOutcomes
  .map(
    (item) =>
      '- ' +
      (item.displayName ?? item.candidateId) +
      ': ' +
      String(item.previousOutcome) +
      ' → ' +
      item.outcome,
  )
  .join('\n');
// People are published only when a published relationship still points at them.
const publishedPersonIds = new Set(
  publicationRelationships.flatMap((relationship) => [
    relationship.personAId,
    relationship.personBId,
  ]),
);
const publishedPeople = publicationPeople.filter((person) =>
  publishedPersonIds.has(person.id),
);
const unpublishedCandidates = publicationCandidates.map((candidate) => ({
  ...candidate,
  relationshipIds: candidate.relationshipIds.filter((id) =>
    publicationRelationshipIds.has(id),
  ),
}));
const publicationSourceIds = new Set([
  ...publicationRelationships.flatMap((relationship) => relationship.sourceIds),
  ...publishedPeople.flatMap((person) =>
    person.affiliations.flatMap((affiliation) => affiliation.sourceIds),
  ),
]);
const publicClaimIds = new Set<string>();
for (const relationship of publicationRelationships) {
  publicClaimIds.add(`claim-${relationship.id}-kinship`);
  const person = publishedPeople.find(
    (item) => item.id === relationship.personBId,
  );
  for (const career of person?.affiliations ?? []) {
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
  schemaVersion: '2',
  sources: publicationSources,
  people: publishedPeople,
  relationships: publicationRelationships,
  candidates: unpublishedCandidates,
  note: '公開層只包含通過獨立查核、且親屬與職務均有來源支持的關係；發布資格由來源與關係完整性規則決定，內容變更透過 Pull Request 審查。',
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
  publishedRelationshipCount: publicationRelationships.length,
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
  publishedRelationships: publicationRelationships.map((relationship) => ({
    ...relationship,
    sourceLinks: relationship.sourceIds
      .map((sourceId) => sourceMap.get(sourceId))
      .filter((source): source is SourceRecord => Boolean(source))
      .map(({ id, publisher, title, url }) => ({ id, publisher, title, url })),
  })),
};
writeJson(join(root, '.cache/reports/political-family-research.json'), report);

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
const publishedLines = publicationEligibleRelationships
  .map(
    (relation) =>
      `- ${relation.id}: ${relation.personAId} — ${relation.relationshipLabel} — ${relation.personBId}; kinship sources ${sourceLinks(relation.kinshipSourceIds)}; career sources ${sourceLinks(relation.positionSourceIds)}.`,
  )
  .join('\n');
writeJson(
  join(root, '.cache/reports/political-family-corrections.json'),
  correctionReport,
);

const candidateNameById = new Map(
  roster.map((candidate) => [candidate.id, candidate.displayName]),
);
const verificationLines = verification
  .map(
    (record) =>
      `### ${candidateNameById.get(record.candidateId) ?? record.candidateId} — ${record.relativeName}\n\n- Status: ${record.status}\n- Rationale: ${record.rationale}\n- Kinship sources: ${sourceLinks(stringArray(record.kinshipSourceIds)) || 'none'}\n- Career sources: ${sourceLinks(stringArray(record.positionSourceIds)) || 'none'}`,
  )
  .join('\n\n');
writeText(
  join(root, '.cache/reports/political-family-research.md'),
  `# Political family research\n\n- Snapshot: ${snapshotDate}\n- Research cutoff: ${researchDate}\n- Candidates in canonical roster: ${roster.length}\n- Candidate research rows: ${rowByCandidate.size}/${roster.length} (raw rows: ${rows.length})\n- Proposed relations: ${relationships.length}\n- Published relations: ${publicationEligibleRelationships.length}\n- Distinct sources: ${allSources.length}\n\n## Published relationships\n\n${publishedLines || '尚無通過獨立查核的公開關係。'}\n\n## Candidate coverage matrix\n\n| Candidate | Candidate ID | Status | Published relations | Note |\n|---|---|---:|---:|---|\n${matrix}\n`,
);
writeText(
  join(root, '.cache/reports/political-family-verification.md'),
  `# Political family verification\n\n每筆公開關係必須同時具備：明確親屬來源、政治職涯來源、正確身分辨識，以及獨立查核結果。\n\n- Researchers: ${researchers.join(', ') || '尚未匯入'}\n- Independent verification records: ${verification.length}\n- Verified and published relationships: ${publicationEligibleRelationships.length}\n- Withheld or unresolved findings: ${unresolvedFindings.length}\n\n公開層採 fail-closed 原則；缺少獨立查核或任一證據面向時，不會進入公開圖表。\n\n## Verification records\n\n${verificationLines || '尚無獨立查核紀錄。'}\n\n## Correction pass\n\nApplied ${corrections.appliedAt}. Reviewer role: ${corrections.reviewerRole}. Corrections remove unsupported claims; they are agent evidence corrections, not human editorial review.\n\n${correctionLines || '尚無更正紀錄。'}\n\n### Candidate outcome corrections\n\n${correctionOutcomeLines || '尚無候選人狀態更正。'}\n`,
);
const publishedAffiliations = publishedPeople.flatMap(
  (person) => person.affiliations,
);

writeText(
  join(root, '.cache/reports/political-family-coverage.md'),
  `# Political family coverage\n\n## Summary\n\n- Canonical roster: ${roster.length} candidates\n- Research audit rows: ${rowByCandidate.size}/${roster.length} (raw rows: ${rows.length})\n- Verified-relations-found: ${candidateResearch.filter((item) => item.researchStatus === 'verified-relations-found').length}\n- Searched with no publishable relation: ${candidateResearch.filter((item) => item.researchStatus === 'searched-no-verified-relations').length}\n- Unresolved: ${candidateResearch.filter((item) => item.researchStatus === 'unresolved').length}\n- Proposed relations: ${relationships.length}\n- Published relations: ${publicationRelationships.length}\n- Published relatives: ${publishedPeople.filter((person) => !person.candidateId).length}\n- Published affiliations by category: ${
    publishedAffiliations.length === 0
      ? 'none'
      : [...new Set(publishedAffiliations.map((item) => item.positionCategory))]
          .sort()
          .map(
            (category) =>
              category +
              '=' +
              publishedAffiliations.filter(
                (item) => item.positionCategory === category,
              ).length,
          )
          .join(', ')
  }\n- Published affiliations by organization type: ${
    publishedAffiliations.length === 0
      ? 'none'
      : [...new Set(publishedAffiliations.map((item) => item.organizationType))]
          .sort()
          .map(
            (type) =>
              type +
              '=' +
              publishedAffiliations.filter(
                (item) => item.organizationType === type,
              ).length,
          )
          .join(', ')
  }\n- Published listings: ${publishedAffiliations.filter((item) => item.listingStatus).length}\n\n## Correction pass\n\n- Relationships corrected: ${correctionReport.summary.correctedRelationships}\n- Verified after correction: ${correctionReport.summary.verifiedAfterCorrection}\n- Published after correction: ${correctionReport.summary.publishedAfterCorrection}\n- Candidate outcomes reclassified: ${correctionReport.summary.candidateOutcomes}\n\n## Candidate-by-candidate matrix\n\n| Sequence | Candidate | Candidate ID | Status | Note |\n|---:|---|---|---|---|\n${roster
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
      publishedRelations: publicationRelationships.length,
      sources: allSources.length,
      verifierRecords: verification.length,
    },
    null,
    2,
  ),
);
