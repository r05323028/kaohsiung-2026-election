import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

type Obj = Record<string, unknown>;
type Value = Obj | Value[] | string | number | boolean | null;
type Category =
  | 'basic-profile'
  | 'biography'
  | 'news'
  | 'public-records'
  | 'political-career'
  | 'policy'
  | 'political-family';
type GapCode =
  | 'none'
  | 'not-attempted'
  | 'source-unavailable'
  | 'insufficient-evidence'
  | 'conflict'
  | 'pending-human-review'
  | 'no-verifiable-record-found';

type SourceSeed = {
  category: Category;
  sourceId?: string | undefined;
  url?: string | undefined;
  publisher?: string | undefined;
  publishedAt?: string | undefined;
  retrievedAt?: string | undefined;
  rawPath?: string | undefined;
  declaredSha256?: string | undefined;
  declaredByteLength?: number | undefined;
  httpStatus?: number | undefined;
  contentType?: string | undefined;
  excerpt?: string | undefined;
  locator?: string | undefined;
  role?: string | undefined;
  canonicalOf?: string | undefined;
};

type Provenance = {
  provenanceId: string;
  category: Category;
  sourceId: string | null;
  canonicalOf: string | null;
  url: string | null;
  publisher: string | null;
  publishedAt: string | null;
  retrievedAt: string | null;
  rawPath: string | null;
  declaredSha256: string | null;
  actualSha256: string | null;
  declaredByteLength: number | null;
  actualByteLength: number | null;
  httpStatus: number | null;
  contentType: string | null;
  excerpt: string | null;
  locator: string | null;
  role: string | null;
  integrity:
    | 'retained-and-hash-checked'
    | 'declared-hash-not-locally-resolvable'
    | 'url-only'
    | 'not-applicable'
    | 'hash-mismatch'
    | 'retained-source-missing'
    | 'retained-bytes-unhashed';
  candidateIds: string[];
  claimIds: string[];
};

type Claim = {
  claimId: string;
  candidateId: string;
  category: Category;
  recordType: string;
  field: string | null;
  value: Value;
  detail: string | null;
  attribution: string | null;
  sourceIds: string[];
  provenanceIds: string[];
  evidenceIds: string[];
  excerpt: string | null;
  verificationStatus: string | null;
  independentCheckStatus: 'checked' | 'not-recorded';
  reviewStatus: string | null;
  editorialApprovalStatus: string | null;
  publicationStatus: string | null;
  machineVerified: boolean;
  independentlyChecked: boolean;
  humanReviewed: boolean;
  editoriallyApproved: boolean;
  approvedLayer: boolean;
  staticallyPublished: boolean;
  disposition:
    | 'published'
    | 'retained-controlled-layer'
    | 'withheld-pending-review'
    | 'blocked'
    | 'research-only';
  isNegativeEvidence: false;
};

type Audit = {
  candidateId: string;
  category: Category;
  attempted: boolean;
  researchStatus: string;
  gapCode: GapCode;
  gapNote: string;
  isNegativeEvidence: false;
  identityStatus: string;
  claimIds: string[];
  evidenceIds: string[];
  sourceIds: string[];
  provenanceIds: string[];
  claimCount: number;
  evidenceCount: number;
  machineVerifiedClaimCount: number;
  independentlyCheckedClaimCount: number;
  humanReviewedClaimCount: number;
  editoriallyApprovedClaimCount: number;
  approvedLayerClaimCount: number;
  staticallyPublishedClaimCount: number;
  stages: {
    researched: boolean;
    machineVerified: boolean;
    independentlyChecked: boolean;
    humanReviewed: boolean;
    editoriallyApproved: boolean;
    approvedLayer: boolean;
    staticallyPublished: boolean;
  };
};

const ROOT = process.cwd();
const OUT = resolve(ROOT, 'reports/candidate-roster-audit');
const ROSTER = 'data/approved/2026/kaohsiung-election.json';
const REVIEWERS = 'data/editorial/reviewer-registry.json';
const DECISIONS = 'data/editorial/decisions/2026/biography-decisions.json';
const CATEGORIES: Category[] = [
  'basic-profile',
  'biography',
  'news',
  'public-records',
  'political-career',
  'policy',
  'political-family',
];
const INPUTS = [
  ROSTER,
  REVIEWERS,
  DECISIONS,
  'data/normalized/2026/basic-profiles.json',
  'data/published/2026/candidate-basic-profiles.json',
  'data/normalized/2026/biographies.json',
  'data/review/2026/biographies-review.json',
  'data/published/2026/candidate-biographies.json',
  'data/normalized/2026/candidate-news.json',
  'data/published/2026/candidate-news.json',
  'data/normalized/2026/candidate-public-record-research.json',
  'data/normalized/2026/full-roster-public-record-coverage.json',
  'data/approved/2026/kaohsiung-public-records.json',
  'data/approved/2026/political-career.json',
  'data/policy-research/2026/full-roster.json',
  'data/published/2026/candidate-policies.json',
  'data/approved/2026/political-family.json',
  'data/published/2026/political-family.json',
];

function obj(value: unknown): Obj {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Obj)
    : {};
}
function list(value: unknown, key: string): unknown[] {
  const v = obj(value)[key];
  return Array.isArray(v) ? v : [];
}
function str(value: unknown, key: string): string | undefined {
  const v = obj(value)[key];
  return typeof v === 'string' ? v : undefined;
}
function num(value: unknown, key: string): number | undefined {
  const v = obj(value)[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}
function firstStr(value: unknown, keys: string[]): string | undefined {
  for (const key of keys) {
    const v = str(value, key);
    if (v) return v;
  }
  return undefined;
}
function firstNum(value: unknown, keys: string[]): number | undefined {
  for (const key of keys) {
    const v = num(value, key);
    if (v !== undefined) return v;
  }
  return undefined;
}
function read(path: string): Obj {
  try {
    const parsed: unknown = JSON.parse(
      readFileSync(resolve(ROOT, path), 'utf8'),
    );
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed)
    ) {
      return parsed as Obj;
    }
    throw new Error('expected a JSON object');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error('Unable to read ' + path + ': ' + message);
  }
}
function optional(path: string): Obj {
  return existsSync(resolve(ROOT, path)) ? read(path) : {};
}
function hashFile(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}
function rel(path: string): string {
  return relative(ROOT, path).split('\\').join('/');
}
function sorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}
function idOf(value: unknown): string | undefined {
  return firstStr(value, ['candidateId', 'candidateID', 'id']);
}
function idsOf(value: unknown, keys: string[]): string[] {
  const result: string[] = [];
  for (const key of keys) {
    for (const v of list(value, key)) {
      if (typeof v === 'string') result.push(v);
    }
  }
  return sorted(result);
}
function claimId(value: unknown, fallback: string): string {
  return (
    firstStr(value, ['claimId', 'policyId', 'articleId', 'id']) ?? fallback
  );
}
function sourceIds(value: unknown): string[] {
  const result = idsOf(value, ['sourceIds', 'sourceIDs']);
  const direct = firstStr(value, ['sourceId', 'sourceID']);
  if (direct) result.push(direct);
  const source = obj(obj(value).source);
  const sourceId = firstStr(source, ['sourceId', 'sourceID', 'id']);
  if (sourceId) result.push(sourceId);
  return sorted(result);
}
function evidenceIds(value: unknown): string[] {
  return idsOf(value, ['evidenceIds', 'evidenceIDs']);
}
function status(value: unknown, keys: string[]): string | undefined {
  return firstStr(value, keys);
}
function publishedStatus(value: string | undefined): boolean {
  return (
    value === 'published' ||
    value === 'approved-source-backed' ||
    value === 'source-backed-static-display' ||
    value === 'public' ||
    value === 'static-published'
  );
}
function machineVerified(value: unknown): boolean {
  const verification = obj(obj(value).verification);
  const values = [
    status(value, ['verificationStatus', 'status', 'verdict']),
    status(verification, ['verdict', 'decision', 'status']),
  ];
  return values.some(
    (v) =>
      v === 'verified' ||
      v === 'Verified' ||
      v === 'machine-validated' ||
      v === 'source-retrieved' ||
      v === 'accepted' ||
      v === 'published',
  );
}
function independentlyChecked(value: unknown): boolean {
  const verification = obj(obj(value).verification);
  const role = firstStr(verification, ['verifierRole', 'role']);
  const decision = firstStr(verification, ['decision', 'verdict', 'status']);
  return (
    role === 'independent-verifier' &&
    (decision === 'verified' ||
      decision === 'accepted' ||
      decision === 'published')
  );
}
function humanReviewed(
  value: unknown,
  reviewerIds: ReadonlySet<string>,
): boolean {
  const row = obj(value);
  const review = obj(row.review);
  const reviewerId =
    firstStr(row, ['reviewerId', 'reviewerID']) ??
    firstStr(review, ['reviewerId', 'reviewerID']);
  return Boolean(reviewerId && reviewerIds.has(reviewerId));
}
function editoriallyApproved(
  value: unknown,
  reviewerIds: ReadonlySet<string>,
): boolean {
  if (!humanReviewed(value, reviewerIds)) return false;
  const row = obj(value);
  const review = obj(row.review);
  return [row, review].some((v) =>
    ['approved', 'editorially-approved', 'published'].includes(
      firstStr(v, ['status', 'decision']) ?? '',
    ),
  );
}
function sourceSeed(
  value: unknown,
  category: Category,
  fallbackId?: string,
): SourceSeed {
  const row = obj(value);
  const source = obj(row.source);
  const rawPath =
    firstStr(row, ['rawPath', 'sourceSnapshotPath', 'snapshotPath']) ??
    firstStr(source, ['rawPath', 'sourceSnapshotPath', 'snapshotPath']);
  const sha =
    firstStr(row, [
      'sha256',
      'sourceSha256',
      'snapshotSha256',
      'documentSha256',
    ]) ??
    firstStr(source, [
      'sha256',
      'sourceSha256',
      'snapshotSha256',
      'documentSha256',
    ]);
  return {
    category,
    sourceId:
      firstStr(row, ['sourceId', 'sourceID', 'id']) ??
      firstStr(source, ['sourceId', 'sourceID', 'id']) ??
      fallbackId,
    url:
      firstStr(row, [
        'url',
        'sourceUrl',
        'canonicalUrl',
        'originalUrl',
        'sourceLink',
      ]) ??
      firstStr(source, ['url', 'sourceUrl', 'canonicalUrl', 'originalUrl']),
    publisher:
      firstStr(row, ['publisher', 'sourcePublisher']) ??
      firstStr(source, ['publisher', 'sourcePublisher']),
    publishedAt:
      firstStr(row, ['publishedAt', 'publicationDate', 'date']) ??
      firstStr(source, ['publishedAt', 'publicationDate', 'date']),
    retrievedAt:
      firstStr(row, ['retrievedAt', 'lastVerifiedAt', 'fetchedAt']) ??
      firstStr(source, ['retrievedAt', 'lastVerifiedAt', 'fetchedAt']),
    rawPath,
    declaredSha256: sha,
    declaredByteLength:
      firstNum(row, ['byteLength', 'bytes', 'contentLength']) ??
      firstNum(source, ['byteLength', 'bytes', 'contentLength']),
    httpStatus:
      firstNum(row, ['httpStatus', 'statusCode']) ??
      firstNum(source, ['httpStatus', 'statusCode']),
    contentType:
      firstStr(row, ['contentType', 'mimeType']) ??
      firstStr(source, ['contentType', 'mimeType']),
    excerpt:
      firstStr(row, ['excerpt', 'quotedText', 'evidenceExcerpt']) ??
      firstStr(source, ['excerpt', 'quotedText', 'evidenceExcerpt']),
    locator:
      firstStr(row, ['page', 'documentLocation', 'locator', 'section']) ??
      firstStr(source, ['page', 'documentLocation', 'locator', 'section']),
    role: firstStr(row, ['role', 'sourceRole']),
    canonicalOf: firstStr(row, ['canonicalOf', 'duplicateOf']),
  };
}
function sourceKey(seed: SourceSeed, fallback: string): string {
  return (
    seed.sourceId ?? seed.url ?? seed.rawPath ?? seed.declaredSha256 ?? fallback
  );
}
function integrity(seed: SourceSeed): Provenance['integrity'] {
  if (!seed.rawPath && seed.declaredSha256)
    return 'declared-hash-not-locally-resolvable';
  if (!seed.rawPath && seed.url) return 'url-only';
  if (!seed.rawPath && !seed.url && !seed.declaredSha256)
    return 'not-applicable';
  if (!seed.rawPath) return 'not-applicable';
  const path = resolve(ROOT, seed.rawPath);
  if (!existsSync(path)) return 'retained-source-missing';
  if (!seed.declaredSha256) return 'retained-bytes-unhashed';
  if (hashFile(path) !== seed.declaredSha256) return 'hash-mismatch';
  if (
    seed.declaredByteLength !== undefined &&
    statSync(path).size !== seed.declaredByteLength
  ) {
    return 'hash-mismatch';
  }
  return 'retained-and-hash-checked';
}
function gap(
  category: Category,
  attempted: boolean,
  rows: Claim[],
  sources: string[],
  badSource: boolean,
): { code: GapCode; note: string } {
  if (badSource) {
    return {
      code: 'source-unavailable',
      note: 'A retained source could not be locally verified; this is not evidence that the fact is absent.',
    };
  }
  if (rows.some((row) => row.verificationStatus === 'conflicting-evidence')) {
    return {
      code: 'conflict',
      note: 'A controlled input records conflicting evidence; no negative conclusion is drawn.',
    };
  }
  if (rows.some((row) => row.disposition === 'withheld-pending-review')) {
    return {
      code: 'pending-human-review',
      note: 'Claims exist but remain withheld pending the documented review gate.',
    };
  }
  if (!attempted) {
    return {
      code: 'not-attempted',
      note: 'No attempt is recorded for this category; this is not negative evidence.',
    };
  }
  if (rows.length === 0 && category === 'political-career') {
    return {
      code: 'no-verifiable-record-found',
      note: 'The controlled career snapshot records no verifiable record found; this is not evidence that no record exists.',
    };
  }
  if (attempted && sources.length === 0 && rows.length === 0) {
    return {
      code: 'source-unavailable',
      note: 'No usable source is retained for the attempt; this is not negative evidence.',
    };
  }
  if (rows.length === 0) {
    return {
      code: 'insufficient-evidence',
      note: 'Research or review did not yield a publishable claim; this is not negative evidence.',
    };
  }
  return { code: 'none', note: '' };
}
function jsonText(value: unknown): string {
  return JSON.stringify(value, null, 2) + '\n';
}

type RosterCategory = 'mayor' | 'ordinary-council' | 'indigenous-council';

function rosterCategory(value: unknown): RosterCategory {
  const electionType = firstStr(value, ['electionType', 'constituencyType']);
  if (electionType === 'mayoral') return 'mayor';
  if (electionType === 'city-council' || electionType === 'ordinary-council') {
    return 'ordinary-council';
  }
  if (electionType === 'indigenous-council') return 'indigenous-council';
  throw new Error(
    'Unsupported canonical roster electionType: ' + String(electionType),
  );
}

function build() {
  const roster = obj(read(ROSTER));
  const candidates = list(roster, 'candidates')
    .map((v) => {
      const row = obj(v);
      return {
        id: idOf(row) ?? '',
        name: firstStr(row, ['displayName']) ?? '',
        category: rosterCategory(row),
        districtId: firstStr(row, ['districtId']) ?? '',
        electionType: firstStr(row, ['electionType']) ?? '',
      };
    })
    .filter((v) => v.id)
    .sort((a, b) => a.id.localeCompare(b.id));
  const candidateIds = candidates.map((v) => v.id);
  const candidateSet = new Set(candidateIds);
  const reviewerRegistry = obj(optional(REVIEWERS));
  const reviewerIds = new Set(
    list(reviewerRegistry, 'reviewers')
      .map((v) => firstStr(v, ['reviewerId', 'id']))
      .filter((v): v is string => Boolean(v)),
  );
  const decisions = obj(optional(DECISIONS));
  const decisionCount = list(decisions, 'decisions').length;

  const basic = obj(read('data/normalized/2026/basic-profiles.json'));
  const basicPublished = obj(
    read('data/published/2026/candidate-basic-profiles.json'),
  );
  const bios = obj(read('data/normalized/2026/biographies.json'));
  const biosPublished = obj(
    read('data/published/2026/candidate-biographies.json'),
  );
  const news = obj(read('data/normalized/2026/candidate-news.json'));
  const newsPublished = obj(read('data/published/2026/candidate-news.json'));
  const publicResearch = obj(
    read('data/normalized/2026/candidate-public-record-research.json'),
  );
  const publicSelected = obj(
    read('data/approved/2026/kaohsiung-public-records.json'),
  );
  const career = obj(read('data/approved/2026/political-career.json'));
  const policy = obj(read('data/policy-research/2026/full-roster.json'));
  const policyPublished = obj(
    read('data/published/2026/candidate-policies.json'),
  );
  const family = obj(read('data/approved/2026/political-family.json'));
  const familyPublished = obj(
    read('data/published/2026/political-family.json'),
  );

  const pubBasic = new Set(
    list(basicPublished, 'claims')
      .map((v) => claimId(v, ''))
      .filter(Boolean),
  );
  const pubBio = new Set(
    list(biosPublished, 'claims')
      .map((v) => claimId(v, ''))
      .filter(Boolean),
  );
  const pubNews = new Set(
    list(newsPublished, 'articles')
      .map((v) => firstStr(v, ['articleId', 'id']) ?? '')
      .filter(Boolean),
  );
  const pubPolicy = new Set(
    list(policyPublished, 'policies')
      .map((v) => firstStr(v, ['policyId', 'id']) ?? '')
      .filter(Boolean),
  );
  const pubFamilyCandidates = new Set(
    list(familyPublished, 'candidates')
      .map((v) => idOf(v) ?? '')
      .filter(Boolean),
  );
  const careerWithRecords = new Set(
    list(career, 'coverage')
      .filter(
        (v) =>
          status(v, ['status', 'researchStatus']) !==
          'no-verifiable-record-found',
      )
      .map((v) => idOf(v) ?? '')
      .filter(Boolean),
  );
  const selectedCandidateIds = list(
    publicSelected,
    'selectedCandidateIds',
  ).filter((v): v is string => typeof v === 'string');
  const selectedPersonIds = list(publicSelected, 'selectedPersonIds').filter(
    (v): v is string => typeof v === 'string',
  );
  const selectedPublic = new Set(selectedCandidateIds);
  const selectedPersonToCandidate = new Map<string, string>();
  for (const value of list(publicResearch, 'audits')) {
    const row = obj(value);
    const candidateId = idOf(row);
    const personId = firstStr(row, ['personId']);
    if (
      candidateId &&
      personId &&
      selectedPublic.has(candidateId) &&
      selectedPersonIds.includes(personId)
    ) {
      const previous = selectedPersonToCandidate.get(personId);
      if (previous && previous !== candidateId) {
        throw new Error(
          'Selected public-record person maps to multiple candidates: ' +
            personId,
        );
      }
      selectedPersonToCandidate.set(personId, candidateId);
    }
  }
  for (const personId of selectedPersonIds) {
    if (!selectedPersonToCandidate.has(personId)) {
      throw new Error(
        'Selected public-record person has no explicit canonical candidate mapping: ' +
          personId,
      );
    }
  }
  const selectedEvidenceById = new Map(
    list(publicSelected, 'evidence')
      .map((value) => {
        const row = obj(value);
        const evidenceId = firstStr(row, ['evidenceId', 'id']);
        return evidenceId ? ([evidenceId, row] as const) : null;
      })
      .filter((value): value is readonly [string, Obj] => value !== null),
  );
  const selectedClaimValues = list(publicSelected, 'claims');
  const selectedClaimIds = selectedClaimValues.map((value) =>
    claimId(value, ''),
  );
  if (
    selectedClaimIds.some((value) => !value) ||
    new Set(selectedClaimIds).size !== selectedClaimIds.length
  ) {
    throw new Error(
      'Selected public-record claims must have unique claimId values',
    );
  }
  const selectedClaimsSeen = new Set<string>();

  const provenance = new Map<string, Provenance>();
  const claims: Claim[] = [];
  const rowsByKey = new Map<string, Claim[]>();
  const attemptedByKey = new Map<string, boolean>();
  const statusByKey = new Map<string, string>();
  const identityByKey = new Map<string, string>();
  const evidenceByKey = new Map<string, string[]>();
  const sourceByKey = new Map<string, string[]>();

  function addSource(
    seed: SourceSeed,
    claimId: string,
    candidateId?: string,
  ): string {
    const provenanceId =
      'provenance:' + seed.category + ':' + sourceKey(seed, claimId);
    const catalogOnly = claimId.startsWith('catalog:');
    const existing = provenance.get(provenanceId);
    if (existing) {
      if (!catalogOnly)
        existing.claimIds = sorted([...existing.claimIds, claimId]);
      if (candidateId)
        existing.candidateIds = sorted([...existing.candidateIds, candidateId]);
      return provenanceId;
    }
    const fullPath = seed.rawPath ? resolve(ROOT, seed.rawPath) : '';
    const exists = Boolean(fullPath && existsSync(fullPath));
    provenance.set(provenanceId, {
      provenanceId,
      category: seed.category,
      sourceId: seed.sourceId ?? null,
      canonicalOf: seed.canonicalOf ?? null,
      url: seed.url ?? null,
      publisher: seed.publisher ?? null,
      publishedAt: seed.publishedAt ?? null,
      retrievedAt: seed.retrievedAt ?? null,
      rawPath: seed.rawPath ?? null,
      declaredSha256: seed.declaredSha256 ?? null,
      actualSha256: exists ? hashFile(fullPath) : null,
      declaredByteLength: seed.declaredByteLength ?? null,
      actualByteLength: exists ? statSync(fullPath).size : null,
      httpStatus: seed.httpStatus ?? null,
      contentType: seed.contentType ?? null,
      excerpt: seed.excerpt ?? null,
      locator: seed.locator ?? null,
      role: seed.role ?? null,
      integrity: integrity(seed),
      candidateIds: candidateId ? [candidateId] : [],
      claimIds: catalogOnly ? [] : [claimId],
    });
    return provenanceId;
  }
  function setMeta(
    category: Category,
    candidateId: string,
    attempted: boolean,
    researchStatus: string,
    identityStatus: string,
    sources: string[] = [],
    evidence: string[] = [],
  ): void {
    const key = candidateId + ':' + category;
    attemptedByKey.set(key, attemptedByKey.get(key) ?? attempted);
    statusByKey.set(key, statusByKey.get(key) ?? researchStatus);
    identityByKey.set(key, identityByKey.get(key) ?? identityStatus);
    evidenceByKey.set(
      key,
      sorted([...(evidenceByKey.get(key) ?? []), ...evidence]),
    );
    sourceByKey.set(key, sorted([...(sourceByKey.get(key) ?? []), ...sources]));
  }
  function addClaim(
    row: Omit<Claim, 'isNegativeEvidence'>,
    attempted = true,
    researchStatus = 'research-completed',
    identityStatus = 'not-recorded',
  ): void {
    const claim: Claim = { ...row, isNegativeEvidence: false };
    claims.push(claim);
    const key = claim.candidateId + ':' + claim.category;
    rowsByKey.set(key, [...(rowsByKey.get(key) ?? []), claim]);
    setMeta(
      claim.category,
      claim.candidateId,
      attempted,
      researchStatus,
      identityStatus,
      claim.sourceIds,
      claim.evidenceIds,
    );
  }
  function catalog(
    category: Category,
    values: unknown[],
  ): Map<string, SourceSeed> {
    const result = new Map<string, SourceSeed>();
    for (const value of values) {
      const seed = sourceSeed(value, category);
      const key = seed.sourceId ?? seed.url;
      if (key) result.set(key, seed);
    }
    return result;
  }

  const bioSources = catalog('biography', list(bios, 'sources'));
  const publicSources = catalog(
    'public-records',
    list(publicResearch, 'sources'),
  );
  const careerSources = catalog('political-career', list(career, 'sources'));
  const policySources = catalog('policy', list(policy, 'sourceSnapshots'));
  const familySources = catalog('political-family', list(family, 'sources'));
  for (const [id, seed] of bioSources)
    addSource(seed, 'catalog:biography:' + id);
  for (const [id, seed] of publicSources)
    addSource(seed, 'catalog:public-records:' + id);
  for (const [id, seed] of careerSources)
    addSource(seed, 'catalog:political-career:' + id);
  for (const [id, seed] of policySources)
    addSource(seed, 'catalog:policy:' + id);
  for (const [id, seed] of familySources)
    addSource(seed, 'catalog:political-family:' + id);

  for (const value of list(bios, 'audits')) {
    const row = obj(value);
    const candidateId = idOf(row);
    if (!candidateId || !candidateSet.has(candidateId)) continue;
    setMeta(
      'biography',
      candidateId,
      true,
      firstStr(row, ['outcome', 'researchStatus']) ?? 'research-completed',
      firstStr(row, ['identityStatus']) ?? 'not-recorded',
      sourceIds(row),
      evidenceIds(row),
    );
  }
  for (const value of list(news, 'coverage')) {
    const row = obj(value);
    const candidateId = idOf(row);
    if (!candidateId || !candidateSet.has(candidateId)) continue;
    const attempts = list(row, 'attempts');
    const researchStatus = firstStr(row, ['status']) ?? 'not-attempted';
    setMeta(
      'news',
      candidateId,
      attempts.length > 0 || researchStatus !== 'not-attempted',
      researchStatus,
      'roster-verified',
    );
  }
  for (const value of list(publicResearch, 'audits')) {
    const row = obj(value);
    const candidateId = idOf(row);
    if (!candidateId || !candidateSet.has(candidateId)) continue;
    const attemptCount = firstNum(row, ['attemptCount']) ?? 0;
    const discoveryStatus =
      firstStr(row, ['discoveryStatus']) ?? 'not-attempted';
    setMeta(
      'public-records',
      candidateId,
      attemptCount > 0 || discoveryStatus !== 'not-attempted',
      discoveryStatus,
      firstStr(row, ['identityStatus']) ?? 'not-recorded',
      firstStr(row, ['sourceConsultedIds']) ? [] : sourceIds(row),
      evidenceIds(row),
    );
  }
  for (const value of list(
    obj(read('data/normalized/2026/full-roster-public-record-coverage.json')),
    'audits',
  )) {
    const row = obj(value);
    const candidateId = idOf(row);
    if (!candidateId || !candidateSet.has(candidateId)) continue;
    const attemptCount = firstNum(row, ['attemptCount']) ?? 0;
    const discoveryStatus =
      firstStr(row, ['discoveryStatus']) ?? 'not-attempted';
    setMeta(
      'public-records',
      candidateId,
      attemptCount > 0 || discoveryStatus !== 'not-attempted',
      discoveryStatus,
      firstStr(row, ['identityStatus']) ?? 'not-recorded',
      idsOf(row, ['sourceConsultedIds']),
      evidenceIds(row),
    );
  }
  for (const value of list(policy, 'audits')) {
    const row = obj(value);
    const candidateId = idOf(row);
    if (!candidateId || !candidateSet.has(candidateId)) continue;
    const attempts = list(row, 'sourceAttemptIds');
    const policyIds = list(row, 'policyIds');
    setMeta(
      'policy',
      candidateId,
      attempts.length > 0 ||
        policyIds.length > 0 ||
        firstStr(row, ['researchStatus']) !== 'not-attempted',
      firstStr(row, ['researchStatus', 'outcome']) ?? 'not-attempted',
      'roster-verified',
      idsOf(row, ['sourceAttemptIds']),
      idsOf(row, ['evidenceIds']),
    );
  }
  for (const value of list(career, 'coverage')) {
    const row = obj(value);
    const candidateId = idOf(row);
    if (!candidateId || !candidateSet.has(candidateId)) continue;
    setMeta(
      'political-career',
      candidateId,
      true,
      firstStr(row, ['status', 'researchStatus']) ?? 'research-completed',
      'roster-verified',
    );
  }

  for (const candidateValue of list(basic, 'candidates')) {
    const candidateRow = obj(candidateValue);
    const candidateId = idOf(candidateRow);
    if (!candidateId || !candidateSet.has(candidateId)) continue;
    setMeta(
      'basic-profile',
      candidateId,
      true,
      firstStr(candidateRow, ['researchStatus', 'finalStatus']) ??
        'research-completed',
      firstStr(candidateRow, ['identityStatus']) ?? 'not-recorded',
    );
    for (const value of list(candidateRow, 'claims')) {
      const row: Obj = { ...obj(value), candidateId };
      const originalId = claimId(row, 'claim-' + candidateId);
      const claimKey = 'basic-profile:' + originalId;
      const source = sourceSeed(obj(row.source), 'basic-profile');
      const provenanceId = addSource(source, claimKey, candidateId);
      const verification = obj(row.verification);
      const verified =
        status(verification, ['verdict', 'status']) === 'verified';
      const published = pubBasic.has(originalId);
      addClaim(
        {
          claimId: claimKey,
          candidateId,
          category: 'basic-profile',
          recordType: 'basic-profile-claim',
          field: firstStr(row, ['field', 'type']) ?? null,
          value: (row.value as Value) ?? null,
          detail: firstStr(row, ['detail', 'description']) ?? null,
          attribution: firstStr(row, ['attribution']) ?? null,
          sourceIds: source.sourceId ? [source.sourceId] : [],
          provenanceIds: [provenanceId],
          evidenceIds: [],
          excerpt: source.excerpt ?? null,
          verificationStatus:
            status(verification, ['verdict', 'status']) ?? null,
          independentCheckStatus: independentlyChecked(row)
            ? 'checked'
            : 'not-recorded',
          reviewStatus: firstStr(row, ['reviewStatus']) ?? null,
          editorialApprovalStatus:
            firstStr(row, ['editorialApprovalStatus']) ?? null,
          publicationStatus: published ? 'published' : 'withheld',
          machineVerified: verified,
          independentlyChecked: independentlyChecked(row),
          humanReviewed: humanReviewed(row, reviewerIds),
          editoriallyApproved: editoriallyApproved(row, reviewerIds),
          approvedLayer: false,
          staticallyPublished: published,
          disposition: published
            ? 'published'
            : verified
              ? 'retained-controlled-layer'
              : 'blocked',
        },
        true,
        firstStr(candidateRow, ['researchStatus']) ?? 'research-completed',
        firstStr(candidateRow, ['identityStatus']) ?? 'not-recorded',
      );
    }
  }

  for (const value of list(bios, 'claims')) {
    const row = obj(value);
    const candidateId = idOf(row);
    if (!candidateId || !candidateSet.has(candidateId)) continue;
    const originalId = claimId(row, 'claim-' + candidateId);
    const claimKey = 'biography:' + originalId;
    const sourceList = sourceIds(row);
    const provenanceIds = sourceList.map((id) =>
      addSource(
        bioSources.get(id) ?? sourceSeed(row, 'biography', id),
        claimKey,
        candidateId,
      ),
    );
    const published = pubBio.has(originalId);
    addClaim({
      claimId: claimKey,
      candidateId,
      category: 'biography',
      recordType: 'biography-claim',
      field: firstStr(row, ['field', 'observationType', 'type']) ?? null,
      value: (row.value as Value) ?? null,
      detail: firstStr(row, ['detail', 'description']) ?? null,
      attribution: firstStr(row, ['attribution']) ?? null,
      sourceIds: sourceList,
      provenanceIds,
      evidenceIds: evidenceIds(row),
      excerpt: firstStr(row, ['excerpt', 'evidenceExcerpt']) ?? null,
      verificationStatus: status(row, ['verificationStatus', 'status']) ?? null,
      independentCheckStatus: 'not-recorded',
      reviewStatus: status(row, ['reviewStatus']) ?? null,
      editorialApprovalStatus: status(row, ['editorialStatus']) ?? null,
      publicationStatus: published ? 'published' : 'withheld-pending-review',
      machineVerified: machineVerified(row),
      independentlyChecked: false,
      humanReviewed: humanReviewed(row, reviewerIds),
      editoriallyApproved: editoriallyApproved(row, reviewerIds),
      approvedLayer: false,
      staticallyPublished: published,
      disposition: published ? 'published' : 'withheld-pending-review',
    });
  }

  for (const value of list(news, 'articles')) {
    const row = obj(value);
    const articleId = firstStr(row, ['articleId', 'id']);
    const articleCandidates = idsOf(row, ['candidateIds']).filter((id) =>
      candidateSet.has(id),
    );
    if (!articleId || articleCandidates.length === 0) continue;
    const seed = sourceSeed(row, 'news', 'article-' + articleId);
    const published = pubNews.has(articleId);
    for (const candidateId of articleCandidates) {
      const claimKey = 'news:' + articleId + ':' + candidateId;
      const provenanceId = addSource(seed, claimKey, candidateId);
      addClaim({
        claimId: claimKey,
        candidateId,
        category: 'news',
        recordType: 'news-article',
        field: 'article',
        value: {
          headline: firstStr(row, ['headline', 'title']) ?? null,
          canonicalUrl: seed.url ?? null,
          publicationDate:
            firstStr(row, ['publicationDate', 'publishedAt']) ?? null,
        },
        detail: firstStr(row, ['summary', 'editorialSummary']) ?? null,
        attribution: firstStr(row, ['attribution']) ?? null,
        sourceIds: seed.sourceId ? [seed.sourceId] : [],
        provenanceIds: [provenanceId],
        evidenceIds: evidenceIds(row),
        excerpt: seed.excerpt ?? null,
        verificationStatus:
          status(row, ['verificationStatus', 'status']) ?? null,
        independentCheckStatus: 'not-recorded',
        reviewStatus: status(row, ['reviewStatus']) ?? null,
        editorialApprovalStatus: status(row, ['editorialStatus']) ?? null,
        publicationStatus: published ? 'published' : 'queued',
        machineVerified: machineVerified(row),
        independentlyChecked: false,
        humanReviewed: false,
        editoriallyApproved: false,
        approvedLayer: false,
        staticallyPublished: published,
        disposition: published ? 'published' : 'research-only',
      });
    }
  }

  for (const value of list(publicResearch, 'claims')) {
    const row = obj(value);
    const candidateId = idOf(row);
    if (!candidateId || !candidateSet.has(candidateId)) continue;
    const originalId = claimId(row, 'claim-' + candidateId);
    const claimKey = 'public-records:' + originalId;
    const sourceList = sourceIds(row);
    const provenanceIds = sourceList.map((id) =>
      addSource(
        publicSources.get(id) ?? sourceSeed(row, 'public-records', id),
        claimKey,
        candidateId,
      ),
    );
    const published =
      selectedPublic.has(candidateId) &&
      publishedStatus(status(row, ['publicationStatus']));
    addClaim({
      claimId: claimKey,
      candidateId,
      category: 'public-records',
      recordType: 'public-record-research-claim',
      field: firstStr(row, ['category', 'field', 'claimType']) ?? null,
      value: (row.value as Value) ?? null,
      detail: firstStr(row, ['description', 'detail']) ?? null,
      attribution: firstStr(row, ['attribution']) ?? null,
      sourceIds: sourceList,
      provenanceIds,
      evidenceIds: evidenceIds(row),
      excerpt: firstStr(row, ['excerpt', 'evidenceExcerpt']) ?? null,
      verificationStatus: status(row, ['verificationStatus', 'status']) ?? null,
      independentCheckStatus: 'not-recorded',
      reviewStatus: status(row, ['reviewStatus']) ?? null,
      editorialApprovalStatus: status(row, ['editorialStatus']) ?? null,
      publicationStatus: published ? 'approved-source-backed' : 'research-only',
      machineVerified: machineVerified(row),
      independentlyChecked: false,
      humanReviewed: false,
      editoriallyApproved: false,
      approvedLayer: published,
      staticallyPublished: published,
      disposition: published ? 'retained-controlled-layer' : 'research-only',
    });
  }

  for (const value of selectedClaimValues) {
    const row = obj(value);
    const originalId = claimId(row, 'selected-claim');
    const personId = firstStr(row, ['subjectId', 'personId']) ?? '';
    const candidateId = selectedPersonToCandidate.get(personId);
    if (!candidateId) {
      throw new Error(
        'Selected public-record claim has no explicit candidate mapping: ' +
          originalId,
      );
    }
    const candidate = candidates.find((v) => v.id === candidateId);
    if (!candidate) {
      throw new Error(
        'Selected public-record claim mapped to unknown canonical candidate: ' +
          candidateId,
      );
    }
    const evidenceList = evidenceIds(row);
    const unresolvedEvidence = evidenceList.filter(
      (id) => !selectedEvidenceById.has(id),
    );
    if (unresolvedEvidence.length > 0) {
      throw new Error(
        'Selected public-record claim has unresolved evidence: ' +
          originalId +
          ' -> ' +
          unresolvedEvidence.join(', '),
      );
    }
    const evidenceSourceIds = evidenceList.flatMap((id) => {
      const evidence = selectedEvidenceById.get(id);
      return evidence ? sourceIds(evidence) : [];
    });
    const sourceList = sorted([...sourceIds(row), ...evidenceSourceIds]);
    if (sourceList.length === 0) {
      throw new Error(
        'Selected public-record claim has no evidence-resolved source: ' +
          originalId,
      );
    }
    if (selectedClaimsSeen.has(originalId)) {
      throw new Error(
        'Selected public-record claim emitted more than once: ' + originalId,
      );
    }
    selectedClaimsSeen.add(originalId);
    const claimKey = 'public-records:selected:' + originalId;
    const provenanceIds = sourceList.map((id) =>
      addSource(
        publicSources.get(id) ?? sourceSeed(row, 'public-records', id),
        claimKey,
        candidate.id,
      ),
    );
    addClaim({
      claimId: claimKey,
      candidateId: candidate.id,
      category: 'public-records',
      recordType: 'selected-public-record-claim',
      field: firstStr(row, ['claimType', 'predicate']) ?? null,
      value: (row.object as Value) ?? null,
      detail: firstStr(row, ['description', 'detail']) ?? null,
      attribution: firstStr(row, ['attribution']) ?? null,
      sourceIds: sourceList,
      provenanceIds,
      evidenceIds: evidenceIds(row),
      excerpt: firstStr(row, ['quotedText', 'excerpt']) ?? null,
      verificationStatus: status(row, ['verificationStatus', 'status']) ?? null,
      independentCheckStatus: 'not-recorded',
      reviewStatus: status(row, ['reviewStatus']) ?? null,
      editorialApprovalStatus: status(row, ['editorialStatus']) ?? null,
      publicationStatus: 'approved-source-backed',
      machineVerified: machineVerified(row),
      independentlyChecked: false,
      humanReviewed: false,
      editoriallyApproved: false,
      approvedLayer: true,
      staticallyPublished: true,
      disposition: 'retained-controlled-layer',
    });
  }

  if (selectedClaimsSeen.size !== selectedClaimIds.length) {
    throw new Error(
      'Selected public-record claims emitted ' +
        String(selectedClaimsSeen.size) +
        ' of ' +
        String(selectedClaimIds.length),
    );
  }

  const careerRecords = [
    ...list(career, 'officeTerms'),
    ...list(career, 'activities'),
    ...list(career, 'governmentProjects'),
    ...list(career, 'legislativeProposals'),
    ...list(career, 'votingRecords'),
  ];
  for (const value of careerRecords) {
    const row = obj(value);
    const candidateId = idOf(row);
    if (!candidateId || !candidateSet.has(candidateId)) continue;
    const originalId = claimId(row, 'record-' + candidateId);
    const claimKey = 'political-career:' + originalId;
    const sourceList = sourceIds(row);
    const provenanceIds = sourceList.map((id) =>
      addSource(
        careerSources.get(id) ?? sourceSeed(row, 'political-career', id),
        claimKey,
        candidateId,
      ),
    );
    const published = careerWithRecords.has(candidateId);
    addClaim({
      claimId: claimKey,
      candidateId,
      category: 'political-career',
      recordType:
        firstStr(row, ['recordType', 'activityType', 'category']) ??
        'career-record',
      field: firstStr(row, ['field', 'title', 'office']) ?? null,
      // SAFETY: source JSON rows are intentionally retained as opaque JSON claim values.
      value: row as unknown as Value,
      detail: firstStr(row, ['description', 'evidenceExcerpt']) ?? null,
      attribution: firstStr(row, ['attribution']) ?? null,
      sourceIds: sourceList,
      provenanceIds,
      evidenceIds: evidenceIds(row),
      excerpt: firstStr(row, ['evidenceExcerpt', 'excerpt']) ?? null,
      verificationStatus: status(row, ['verificationStatus', 'status']) ?? null,
      independentCheckStatus: 'not-recorded',
      reviewStatus: status(row, ['reviewStatus', 'review']) ?? null,
      editorialApprovalStatus: status(row, ['editorialStatus']) ?? null,
      publicationStatus: published ? 'approved-layer' : 'research-only',
      machineVerified: machineVerified(row) || published,
      independentlyChecked: false,
      humanReviewed: humanReviewed(row, reviewerIds),
      editoriallyApproved: editoriallyApproved(row, reviewerIds),
      approvedLayer: published,
      staticallyPublished: published,
      disposition: published ? 'retained-controlled-layer' : 'research-only',
    });
  }

  for (const value of list(policy, 'policies')) {
    const row = obj(value);
    const candidateId = idOf(row);
    if (!candidateId || !candidateSet.has(candidateId)) continue;
    const originalId = claimId(row, 'policy-' + candidateId);
    const claimKey = 'policy:' + originalId;
    const sourceList = sourceIds(row);
    const provenanceIds = sourceList.map((id) =>
      addSource(
        policySources.get(id) ?? sourceSeed(row, 'policy', id),
        claimKey,
        candidateId,
      ),
    );
    const verification = obj(row.verification);
    const published = pubPolicy.has(originalId);
    const withheld =
      status(row, ['publicationStatus', 'reviewStatus']) ===
      'withheld-pending-review';
    addClaim({
      claimId: claimKey,
      candidateId,
      category: 'policy',
      recordType: 'policy',
      field: firstStr(row, ['policyType', 'category', 'title']) ?? null,
      // SAFETY: source JSON rows are intentionally retained as opaque JSON claim values.
      value: row as unknown as Value,
      detail: firstStr(row, ['description', 'summary']) ?? null,
      attribution: firstStr(row, ['attribution']) ?? null,
      sourceIds: sourceList,
      provenanceIds,
      evidenceIds: evidenceIds(row),
      excerpt: firstStr(row, ['excerpt', 'evidenceExcerpt']) ?? null,
      verificationStatus:
        status(verification, ['decision', 'status']) ??
        status(row, ['verificationStatus']) ??
        null,
      independentCheckStatus: independentlyChecked(row)
        ? 'checked'
        : 'not-recorded',
      reviewStatus: status(row, ['reviewStatus']) ?? null,
      editorialApprovalStatus: status(row, ['editorialStatus']) ?? null,
      publicationStatus: published
        ? 'published'
        : withheld
          ? 'withheld-pending-review'
          : 'research-only',
      machineVerified: machineVerified(row),
      independentlyChecked: independentlyChecked(row),
      humanReviewed: humanReviewed(row, reviewerIds),
      editoriallyApproved: editoriallyApproved(row, reviewerIds),
      approvedLayer: published,
      staticallyPublished: published,
      disposition: published
        ? 'published'
        : withheld
          ? 'withheld-pending-review'
          : 'research-only',
    });
  }

  for (const value of list(family, 'candidates')) {
    const row = obj(value);
    const candidateId = idOf(row);
    if (!candidateId || !candidateSet.has(candidateId)) continue;
    const relationshipIds = list(row, 'relationshipIds').filter(
      (v): v is string => typeof v === 'string',
    );
    const claimKey = 'political-family:candidate:' + candidateId;
    const sourceList = sourceIds(row);
    const provenanceIds = sourceList.map((id) =>
      addSource(
        familySources.get(id) ?? sourceSeed(row, 'political-family', id),
        claimKey,
        candidateId,
      ),
    );
    const published = pubFamilyCandidates.has(candidateId);
    const researchStatus =
      status(row, ['researchStatus', 'status']) ?? 'not-attempted';
    addClaim(
      {
        claimId: claimKey,
        candidateId,
        category: 'political-family',
        recordType: 'family-candidate-coverage',
        field: 'relationshipIds',
        value: relationshipIds,
        detail: firstStr(row, ['notes', 'detail']) ?? null,
        attribution: 'controlled-family-research',
        sourceIds: sourceList,
        provenanceIds,
        evidenceIds: evidenceIds(row),
        excerpt: firstStr(row, ['excerpt', 'evidenceExcerpt']) ?? null,
        verificationStatus: researchStatus,
        independentCheckStatus: 'not-recorded',
        reviewStatus: status(row, ['reviewStatus']) ?? null,
        editorialApprovalStatus: status(row, ['editorialStatus']) ?? null,
        publicationStatus: published ? 'published' : 'research-only',
        machineVerified:
          researchStatus === 'verified' || relationshipIds.length > 0,
        independentlyChecked: false,
        humanReviewed: humanReviewed(row, reviewerIds),
        editoriallyApproved: editoriallyApproved(row, reviewerIds),
        approvedLayer: published,
        staticallyPublished: published,
        disposition: published ? 'published' : 'research-only',
      },
      true,
      researchStatus,
      firstStr(row, ['identityStatus']) ?? 'not-recorded',
    );
  }

  const audits: Audit[] = [];
  for (const candidate of candidates) {
    for (const category of CATEGORIES) {
      const key = candidate.id + ':' + category;
      const rows = rowsByKey.get(key) ?? [];
      const attempted = attemptedByKey.get(key) ?? false;
      const sources = sourceByKey.get(key) ?? [];
      const evidence = evidenceByKey.get(key) ?? [];
      const badSource = rows.some((row) =>
        row.provenanceIds.some((id) => {
          const p = provenance.get(id);
          return (
            p?.integrity === 'hash-mismatch' ||
            p?.integrity === 'retained-source-missing'
          );
        }),
      );
      const g = gap(category, attempted, rows, sources, badSource);
      audits.push({
        candidateId: candidate.id,
        category,
        attempted,
        researchStatus: statusByKey.get(key) ?? 'not-attempted',
        gapCode: g.code,
        gapNote: g.note,
        isNegativeEvidence: false,
        identityStatus: identityByKey.get(key) ?? 'not-recorded',
        claimIds: rows.map((row) => row.claimId).sort(),
        evidenceIds: evidence,
        sourceIds: sources,
        provenanceIds: sorted(rows.flatMap((row) => row.provenanceIds)),
        claimCount: rows.length,
        evidenceCount: evidence.length,
        machineVerifiedClaimCount: rows.filter((row) => row.machineVerified)
          .length,
        independentlyCheckedClaimCount: rows.filter(
          (row) => row.independentlyChecked,
        ).length,
        humanReviewedClaimCount: rows.filter((row) => row.humanReviewed).length,
        editoriallyApprovedClaimCount: rows.filter(
          (row) => row.editoriallyApproved,
        ).length,
        approvedLayerClaimCount: rows.filter((row) => row.approvedLayer).length,
        staticallyPublishedClaimCount: rows.filter(
          (row) => row.staticallyPublished,
        ).length,
        stages: {
          researched: attempted,
          machineVerified: rows.some((row) => row.machineVerified),
          independentlyChecked: rows.some((row) => row.independentlyChecked),
          humanReviewed: rows.some((row) => row.humanReviewed),
          editoriallyApproved: rows.some((row) => row.editoriallyApproved),
          approvedLayer: rows.some((row) => row.approvedLayer),
          staticallyPublished: rows.some((row) => row.staticallyPublished),
        },
      });
    }
  }

  const inputFiles = INPUTS.filter((path) => existsSync(resolve(ROOT, path)))
    .sort()
    .map((path) => ({
      path,
      sha256: hashFile(resolve(ROOT, path)),
      byteLength: statSync(resolve(ROOT, path)).size,
    }));

  const rosterSummary = {
    datasetId: firstStr(roster, ['datasetId']) ?? null,
    snapshotDate: firstStr(roster, ['snapshotDate']) ?? null,
    sourcePath: ROSTER,
    candidateCount: candidates.length,
    candidateIds,
    categoryCounts: {
      mayor: candidates.filter((v) => v.category === 'mayor').length,
      ordinaryCouncil: candidates.filter(
        (v) => v.category === 'ordinary-council',
      ).length,
      indigenousCouncil: candidates.filter(
        (v) => v.category === 'indigenous-council',
      ).length,
    },
  };
  const categoryCounts = Object.fromEntries(
    CATEGORIES.map((category) => {
      const categoryRows = audits.filter((row) => row.category === category);
      return [
        category,
        {
          candidates: categoryRows.length,
          attemptedCandidates: categoryRows.filter((row) => row.attempted)
            .length,
          candidatesWithClaims: categoryRows.filter((row) => row.claimCount > 0)
            .length,
          candidatesWithPublishedClaims: categoryRows.filter(
            (row) => row.staticallyPublishedClaimCount > 0,
          ).length,
          claimCount: categoryRows.reduce(
            (sum, row) => sum + row.claimCount,
            0,
          ),
          publishedClaimCount: categoryRows.reduce(
            (sum, row) => sum + row.staticallyPublishedClaimCount,
            0,
          ),
          gapCounts: Object.fromEntries(
            [...new Set(categoryRows.map((row) => row.gapCode))]
              .sort()
              .map((code) => [
                code,
                categoryRows.filter((row) => row.gapCode === code).length,
              ]),
          ),
        },
      ];
    }),
  );
  const coverage = {
    schemaVersion: 1,
    reportId: 'kaohsiung-candidate-roster-enrichment-audit',
    generatedAtPolicy: 'deterministic-from-inputs; no wall-clock timestamp',
    roster: rosterSummary,
    lifecycle: {
      reviewerRegistryPath: REVIEWERS,
      authorizedReviewerCount: reviewerIds.size,
      editorialDecisionPath: DECISIONS,
      editorialDecisionCount: decisionCount,
      humanReviewEvidenceAvailable: reviewerIds.size > 0 && decisionCount > 0,
      policy:
        'machine verification, human review, editorial approval, approved-layer, and static publication remain separate',
    },
    inputFiles,
    categories: CATEGORIES,
    categoryCounts,
    categoryAudits: audits,
    candidateCoverage: candidates.map((candidate) => {
      const rows = audits.filter((row) => row.candidateId === candidate.id);
      return {
        ...candidate,
        categories: rows,
        anyResearched: rows.some((row) => row.attempted),
        anyMachineVerified: rows.some((row) => row.stages.machineVerified),
        anyIndependentlyChecked: rows.some(
          (row) => row.stages.independentlyChecked,
        ),
        anyHumanReviewed: rows.some((row) => row.stages.humanReviewed),
        anyEditoriallyApproved: rows.some(
          (row) => row.stages.editoriallyApproved,
        ),
        anyApprovedLayer: rows.some((row) => row.stages.approvedLayer),
        anyStaticallyPublished: rows.some(
          (row) => row.stages.staticallyPublished,
        ),
      };
    }),
    claims: {
      count: claims.length,
      publishedCount: claims.filter((row) => row.staticallyPublished).length,
      humanReviewedCount: claims.filter((row) => row.humanReviewed).length,
      editoriallyApprovedCount: claims.filter((row) => row.editoriallyApproved)
        .length,
    },
    provenance: {
      count: provenance.size,
      integrityCounts: Object.fromEntries(
        [...new Set([...provenance.values()].map((row) => row.integrity))]
          .sort()
          .map((value) => [
            value,
            [...provenance.values()].filter((row) => row.integrity === value)
              .length,
          ]),
      ),
    },
    semantics: {
      noNegativeEvidence: true,
      missingOrBlockedSourcesAreNeutral: true,
      noHumanApprovalClaimedWithoutRegistryAndDecision: true,
      sourceAliasesAreNotCountedAsIndependent: true,
    },
  };
  const claimsReport = {
    schemaVersion: 1,
    reportId: 'kaohsiung-candidate-claim-audit',
    roster: rosterSummary,
    inputFiles,
    claims: claims.sort((a, b) => a.claimId.localeCompare(b.claimId)),
  };
  const provenanceReport = {
    schemaVersion: 1,
    reportId: 'kaohsiung-candidate-provenance-audit',
    roster: rosterSummary,
    inputFiles,
    sources: [...provenance.values()]
      .map((row) => ({
        ...row,
        candidateIds: sorted(row.candidateIds),
        claimIds: sorted(row.claimIds),
      }))
      .sort((a, b) => a.provenanceId.localeCompare(b.provenanceId)),
  };
  const gaps = audits
    .filter((row) => row.gapCode !== 'none')
    .map((row) => ({
      candidateId: row.candidateId,
      category: row.category,
      gapCode: row.gapCode,
      gapNote: row.gapNote,
      attempted: row.attempted,
      researchStatus: row.researchStatus,
      claimCount: row.claimCount,
      isNegativeEvidence: false,
    }))
    .sort((a, b) =>
      (a.candidateId + a.category).localeCompare(b.candidateId + b.category),
    );
  const gapsReport = {
    schemaVersion: 1,
    reportId: 'kaohsiung-candidate-neutral-gaps',
    roster: rosterSummary,
    inputFiles,
    summary: {
      rowCount: gaps.length,
      byCode: Object.fromEntries(
        [...new Set(gaps.map((row) => row.gapCode))]
          .sort()
          .map((code) => [
            code,
            gaps.filter((row) => row.gapCode === code).length,
          ]),
      ),
      negativeEvidenceRows: gaps.filter((row) => row.isNegativeEvidence).length,
    },
    gaps,
  };

  const md: string[] = [
    '# Candidate roster enrichment audit',
    '',
    '- Roster: ' +
      String(rosterSummary.datasetId) +
      ' (' +
      String(rosterSummary.snapshotDate) +
      ')',
    '- Candidates: ' + String(rosterSummary.candidateCount),
    '- Category audit rows: ' +
      String(audits.length) +
      ' (106 × ' +
      String(CATEGORIES.length) +
      ')',
    '- Claims: ' +
      String(claims.length) +
      '; statically published/controlled claims: ' +
      String(claims.filter((row) => row.staticallyPublished).length),
    '- Provenance rows: ' + String(provenance.size),
    '- Human-reviewed claims: ' +
      String(claims.filter((row) => row.humanReviewed).length) +
      '; editorially approved claims: ' +
      String(claims.filter((row) => row.editoriallyApproved).length),
    '',
    '## Category coverage',
    '',
    '| Category | Attempted candidates | Candidates with claims | Published claims | Gap rows |',
    '| --- | ---: | ---: | ---: | ---: |',
  ];
  for (const category of CATEGORIES) {
    const count = obj(categoryCounts[category]);
    const gapCount = Object.entries(obj(count.gapCounts))
      .filter(([code]) => code !== 'none')
      .reduce<number>(
        (sum, [, value]) => sum + (typeof value === 'number' ? value : 0),
        0,
      );
    md.push(
      '| ' +
        category +
        ' | ' +
        String(count.attemptedCandidates ?? 0) +
        ' | ' +
        String(count.candidatesWithClaims ?? 0) +
        ' | ' +
        String(count.publishedClaimCount ?? 0) +
        ' | ' +
        String(gapCount) +
        ' |',
    );
  }
  md.push(
    '',
    '## Neutral gap semantics',
    '',
    '- not-attempted, source-unavailable, insufficient-evidence, pending-human-review, and no-verifiable-record-found are processing states, not negative evidence.',
    '- The empty reviewer registry and absent editorial decisions mean no claim is labeled human-reviewed or editorially approved.',
    '- Existing approved/published layers are reported as controlled-layer/static publication states; those labels are not rewritten as human approval.',
    '- Political-family rows are candidate coverage/status records; they do not by themselves establish a verified family relationship.',
    '',
    '## Artifact files',
    '',
    '- coverage.json: exact canonical roster/category matrix and recomputed lifecycle counts.',
    '- claims.json: claim-level states and links to evidence/provenance.',
    '- provenance.json: source metadata and local raw hash/byte checks.',
    '- gaps.json: neutral candidate/category gaps.',
    '- audit.md: this concise summary.',
  );

  return {
    coverage,
    claimsReport,
    provenanceReport,
    gapsReport,
    markdown: md.join('\n') + '\n',
  };
}

function write(path: string, value: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value, 'utf8');
}

const result = build();
const artifacts = new Map<string, string>([
  ['coverage.json', jsonText(result.coverage)],
  ['claims.json', jsonText(result.claimsReport)],
  ['provenance.json', jsonText(result.provenanceReport)],
  ['gaps.json', jsonText(result.gapsReport)],
  ['audit.md', result.markdown],
]);
const checkOnly = process.argv.includes('--check');
const stale: string[] = [];
for (const [name, content] of artifacts) {
  const path = resolve(OUT, name);
  if (checkOnly) {
    if (!existsSync(path) || readFileSync(path, 'utf8') !== content)
      stale.push(name);
  } else {
    write(path, content);
  }
}
if (stale.length > 0) {
  console.error(
    'Candidate roster audit artifacts are stale or missing: ' +
      stale.join(', '),
  );
  process.exitCode = 1;
} else if (checkOnly) {
  console.log('Candidate roster audit artifacts are fresh.');
} else {
  console.log(
    'Generated candidate roster audit: ' + rel(resolve(OUT, 'coverage.json')),
  );
}
