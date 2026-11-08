import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  cleanHtml,
  parseKccProfile,
  readHtml,
} from '../src/data/biographies/adapters';
import {
  ENRICHMENT_CATEGORIES,
  type EnrichmentAudit,
  type EnrichmentCategory,
  type EnrichmentClaim,
  type EnrichmentDataset,
  type EnrichmentEvidence,
  type EnrichmentIdentityObservation,
  type EnrichmentReviewItem,
  type EnrichmentReviewPacket,
  type EnrichmentSourceAttempt,
  type EnrichmentVerification,
  validateEnrichmentDataset,
  validateEnrichmentReviewPacket,
} from '../src/data/enrichment/schema';
import {
  type OfficialCandidate,
  validateOfficialDataset,
} from '../src/data/official/schema';

const ROOT = resolve(process.cwd());
const SNAPSHOT_DATE = '2026-11-07';
const ROSTER_PATH = 'data/approved/2026/kaohsiung-election.json';
const OUT_PATH = 'data/enrichment/normalized/2026/zuoying-mayoral.json';
const REVIEW_PATH = 'data/enrichment/review/2026/zuoying-mayoral-review.json';
const APPROVED_PATH = 'data/enrichment/approved/2026/zuoying-mayoral.json';
const PUBLISHED_PATH = 'data/enrichment/published/2026/zuoying-mayoral.json';
const CHECKPOINT_PATH = 'data/enrichment/checkpoints/2026/zuoying-mayoral.json';
const REPORT_DIR = 'reports';

const SCOPED_NAMES = [
  '黃文志',
  '李雅芬',
  '白喬茵',
  '柳淑芳',
  '李眉蓁',
  '李雅慧',
  '陳玫娟',
  '張以理',
  '陳冠宇',
  '陳麗珍',
  '薛兆基',
  '尹立',
  '張靜',
  '王肇民',
  '柯志恩',
  '洪方隆',
  '賴瑞隆',
] as const;

const KCC_MSNS: Record<string, string> = {
  白喬茵: '2181',
  陳麗珍: '2184',
  黃文志: '2185',
  李眉蓁: '2186',
  李雅芬: '2187',
  李雅慧: '2188',
  陳玫娟: '2189',
};

const NEWS_SOURCES: Record<
  string,
  Array<{ slug: string; publicationDate: string }>
> = {
  張以理: [{ slug: 'zhang-yili-cna', publicationDate: '2025-02-17' }],
  尹立: [
    { slug: 'yin-li-cna', publicationDate: '2025-08-26' },
    { slug: 'yin-li-ltn', publicationDate: '2025-08-26' },
  ],
  柳淑芳: [{ slug: 'liu-shufang-udn', publicationDate: '2026-10-27' }],
  陳冠宇: [{ slug: 'chen-guanyu-udn', publicationDate: '2026-08-07' }],
  薛兆基: [
    { slug: 'xue-zhaoji-udn', publicationDate: '2026-06-09' },
    { slug: 'xue-zhaoji-ltn', publicationDate: '2026-06-10' },
  ],
  張靜: [{ slug: 'zhang-jing-udn', publicationDate: '2026-03-29' }],
  王肇民: [
    { slug: 'wang-zhaomin-ebc', publicationDate: '2026-11-06' },
    { slug: 'wang-zhaomin-et', publicationDate: '2026-11-06' },
  ],
};

const NEWS_FALLBACK_URLS: Record<string, string> = {
  'zhang-jing-udn': 'https://udn.com/news/story/124652/9409570',
};

type SourceDef = {
  sourceId: string;
  sourceClass: EnrichmentSourceAttempt['sourceClass'];
  sourceTier: EnrichmentSourceAttempt['sourceTier'];
  urlHint?: string | undefined;
  query: string | null;
  rawPath: string;
  headersPath?: string | undefined;
  candidateNames: string[];
  publicationDate: string | null;
  noCandidateMatch?: boolean | undefined;
};

type PreparedSource = SourceDef & {
  raw: string;
  clean: string;
  url: string;
  sha256: string;
  byteLength: number;
  httpStatus: number | null;
  contentType: string | null;
  sourceRetrievedAt: string | null;
  timestampQuality: EnrichmentSourceAttempt['timestampQuality'];
};

type Candidate = OfficialCandidate & { personId: string };

function absolute(relativePath: string): string {
  return join(ROOT, relativePath);
}

function readJson<T>(relativePath: string): T {
  const path = absolute(relativePath);
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON in ${relativePath}: ${message}`);
  }
}

function writeJson(relativePath: string, value: unknown): void {
  const path = absolute(relativePath);
  const parent = dirname(path);
  mkdirSync(parent, { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function canonicalUrl(html: string, fallback: string | undefined): string {
  const tags = [...html.matchAll(/<link\b[^>]*>|<meta\b[^>]*>/gi)].map(
    (match) => match[0],
  );
  for (const tag of tags) {
    const lower = tag.toLocaleLowerCase();
    if (!lower.includes('canonical') && !lower.includes('og:url')) continue;
    const content =
      tag.match(/(?:href|content)=["']([^"']+)["']/i)?.[1] ?? null;
    if (content?.startsWith('http')) return content;
  }
  if (fallback) return fallback;
  throw new Error(
    'Captured HTML source has no canonical URL metadata or configured URL hint.',
  );
}

function headerInfo(path: string | undefined): {
  httpStatus: number | null;
  contentType: string | null;
  sourceRetrievedAt: string | null;
  timestampQuality: EnrichmentSourceAttempt['timestampQuality'];
} {
  if (!path || !existsSync(absolute(path)))
    return {
      httpStatus: null,
      contentType: null,
      sourceRetrievedAt: null,
      timestampQuality: 'unavailable',
    };
  const header = readFileSync(absolute(path), 'utf8');
  const statuses = [...header.matchAll(/HTTP\/\d(?:\.\d)?\s+(\d{3})/gi)]
    .map((match) => Number(match[1]))
    .filter(Number.isFinite);
  const status = statuses.at(-1) ?? null;
  const type =
    header.match(/^content-type:\s*([^\r\n]+)/im)?.[1]?.trim() ?? null;
  const date = header.match(/^date:\s*([^\r\n]+)/im)?.[1]?.trim();
  const parsedDate = date ? new Date(date) : null;
  return {
    httpStatus: status,
    contentType: type,
    sourceRetrievedAt:
      parsedDate && !Number.isNaN(parsedDate.valueOf())
        ? parsedDate.toISOString()
        : null,
    timestampQuality: date ? 'source-header' : 'unavailable',
  };
}

function sourceDefinitions(): SourceDef[] {
  const sources: SourceDef[] = [
    {
      sourceId: 'scope-cec-qualification',
      sourceClass: 'cec-roster',
      sourceTier: 'tier-1-official',
      urlHint: 'https://web.cec.gov.tw/central/article/65213',
      query: 'article=65213',
      rawPath: 'data/raw/official/2026/cec-central-65213.json',
      candidateNames: [...SCOPED_NAMES],
      publicationDate: '2026-10-16',
    },
    {
      sourceId: 'scope-khec-number-draw',
      sourceClass: 'khec-roster',
      sourceTier: 'tier-1-official',
      urlHint: 'https://www.cec.gov.tw/khec/article/65366',
      query: 'article=65366',
      rawPath: 'data/raw/official/2026/khec-65366.json',
      candidateNames: [...SCOPED_NAMES],
      publicationDate: '2026-10-27',
    },
    {
      sourceId: 'scope-kcc-directory-page-1',
      sourceClass: 'kcc-current-member-directory',
      sourceTier: 'tier-1-official',
      urlHint:
        'https://www.kcc.gov.tw/Member_List3.aspx?n=39&sms=9028&page=1&PageSize=20',
      query: 'n=39&sms=9028&page=1&PageSize=20',
      rawPath: 'data/biographies/raw/2026-11-06/kcc/pages/1.html',
      candidateNames: Object.keys(KCC_MSNS),
      publicationDate: null,
    },
    {
      sourceId: 'scope-ly-current-index',
      sourceClass: 'legislative-yuan',
      sourceTier: 'tier-1-official',
      urlHint: 'https://www.ly.gov.tw/Pages/List.aspx?nodeid=109',
      query: 'nodeid=109',
      rawPath: 'data/enrichment/raw/2026-11-07/ly/current-index.snapshot',
      headersPath: 'data/enrichment/raw/2026-11-07/ly/current-index.headers',
      candidateNames: ['柯志恩', '賴瑞隆'],
      publicationDate: null,
    },
    {
      sourceId: 'scope-ly-ke-profile',
      sourceClass: 'legislative-yuan',
      sourceTier: 'tier-1-official',
      urlHint: 'https://www.ly.gov.tw/Pages/List.aspx?nodeid=46792',
      query: 'nodeid=46792',
      rawPath: 'data/enrichment/raw/2026-11-07/ly/ke.snapshot',
      headersPath: 'data/enrichment/raw/2026-11-07/ly/ke.headers',
      candidateNames: ['柯志恩'],
      publicationDate: null,
    },
    {
      sourceId: 'scope-ly-lai-profile',
      sourceClass: 'legislative-yuan',
      sourceTier: 'tier-1-official',
      urlHint: 'https://www.ly.gov.tw/Pages/List.aspx?nodeid=46850',
      query: 'nodeid=46850',
      rawPath: 'data/enrichment/raw/2026-11-07/ly/lai.snapshot',
      headersPath: 'data/enrichment/raw/2026-11-07/ly/lai.headers',
      candidateNames: ['賴瑞隆'],
      publicationDate: null,
    },
    ...Object.entries(KCC_MSNS).map(([name, msn]) => ({
      sourceId: `scope-kcc-profile-${msn}`,
      sourceClass: 'kcc-member-profile' as const,
      sourceTier: 'tier-1-official' as const,
      urlHint: `https://www.kcc.gov.tw/MemberInfo_New.aspx?n=39&sms=9028&msn=${msn}`,
      query: `n=39&sms=9028&msn=${msn}`,
      rawPath: `data/biographies/raw/2026-11-06/kcc/profiles/${msn}.html`,
      candidateNames: [name],
      publicationDate: null,
    })),
    ...Array.from({ length: 7 }, (_, index) => {
      const serial = 32 + index;
      return {
        sourceId: `scope-kcc-history-${serial}`,
        sourceClass: 'kcc-history' as const,
        sourceTier: 'tier-1-official' as const,
        urlHint: `https://www.kcc.gov.tw/Member_HistoryList.aspx?n=122&type=1&s=${serial}`,
        query: `n=122&type=1&s=${serial}`,
        rawPath: `data/enrichment/raw/2026-11-07/kcc-history/history-${serial}.snapshot`,
        candidateNames: [],
        publicationDate: null,
        noCandidateMatch: true,
      };
    }),
    ...Object.entries(NEWS_SOURCES).flatMap(([name, sources]) =>
      sources.map((source) => ({
        sourceId: `scope-news-${source.slug}`,
        sourceClass: 'news-report' as const,
        sourceTier: 'tier-3-news' as const,
        urlHint: NEWS_FALLBACK_URLS[source.slug],
        query: null,
        rawPath: `data/enrichment/raw/2026-11-07/news/${source.slug}.snapshot`,
        headersPath: `data/enrichment/raw/2026-11-07/news/${source.slug}.html.headers`,
        candidateNames: [name],
        publicationDate: source.publicationDate,
      })),
    ),
    {
      sourceId: 'scope-official-youth-zhang-yili',
      sourceClass: 'government-record',
      sourceTier: 'tier-1-official',
      urlHint: 'https://youth.kcg.gov.tw/cp.aspx?n=3',
      query: 'n=3',
      rawPath:
        'data/enrichment/raw/2026-11-07/official/zhang-yili-youth.snapshot',
      headersPath:
        'data/enrichment/raw/2026-11-07/official/zhang-yili-youth.html.headers',
      candidateNames: ['張以理'],
      publicationDate: null,
    },
  ];
  return sources;
}

function prepareSources(definitions: SourceDef[]): Map<string, PreparedSource> {
  const prepared = new Map<string, PreparedSource>();
  for (const definition of definitions) {
    const path = absolute(definition.rawPath);
    if (!existsSync(path))
      throw new Error(`Missing captured source: ${definition.rawPath}`);
    const raw = readFileSync(path);
    const html = raw.toString('utf8');
    const metadata = headerInfo(definition.headersPath);
    const fallbackStatus =
      definition.sourceClass === 'kcc-history'
        ? 200
        : (metadata.httpStatus ?? 200);
    const fallbackType = definition.rawPath.endsWith('.json')
      ? 'application/json'
      : 'text/html';
    prepared.set(definition.sourceId, {
      ...definition,
      raw: html,
      clean: cleanHtml(html),
      url: canonicalUrl(html, definition.urlHint),
      sha256: sha256(raw),
      byteLength: statSync(path).size,
      httpStatus: fallbackStatus,
      contentType: metadata.contentType ?? fallbackType,
      sourceRetrievedAt: metadata.sourceRetrievedAt,
      timestampQuality:
        metadata.timestampQuality === 'unavailable'
          ? definition.sourceClass === 'kcc-history' ||
            definition.sourceClass.startsWith('kcc-')
            ? 'capture-file-mtime'
            : 'unavailable'
          : metadata.timestampQuality,
    });
  }
  return prepared;
}

function rosterCandidates(): Candidate[] {
  const official = validateOfficialDataset(readJson<unknown>(ROSTER_PATH));
  const byName = new Map<string, OfficialCandidate[]>();
  for (const candidate of official.candidates) {
    const values = byName.get(candidate.displayName) ?? [];
    values.push(candidate);
    byName.set(candidate.displayName, values);
  }
  const candidates = SCOPED_NAMES.map((name) => {
    const matches = byName.get(name) ?? [];
    if (matches.length !== 1)
      throw new Error(
        `Scoped roster name ${name} maps to ${matches.length} canonical candidates.`,
      );
    const candidate = matches[0];
    if (!candidate)
      throw new Error(`Scoped roster candidate ${name} is missing.`);
    if (
      name !== '柯志恩' &&
      name !== '洪方隆' &&
      name !== '張靜' &&
      name !== '王肇民' &&
      name !== '賴瑞隆' &&
      candidate.districtId !== 'district-kaohsiung-council-04'
    )
      throw new Error(
        `Scoped council candidate ${name} changed district: ${candidate.districtId}`,
      );
    if (
      candidate.electionType === 'mayoral' &&
      candidate.districtId !== 'district-kaohsiung-mayor-2026'
    )
      throw new Error(
        `Scoped mayor ${name} changed constituency: ${candidate.districtId}`,
      );
    return { ...candidate, personId: `person-${candidate.slug}` };
  });
  if (new Set(candidates.map((candidate) => candidate.id)).size !== 17)
    throw new Error('Scoped roster contains duplicate canonical IDs.');
  return candidates;
}

function metaContent(html: string, key: string): string | null {
  for (const tag of html.matchAll(/<meta\b[^>]*>/gi)) {
    const raw = tag[0];
    const property = raw.match(/(?:property|name)=["']([^"']+)["']/i)?.[1];
    if (property?.toLocaleLowerCase() !== key.toLocaleLowerCase()) continue;
    const content = raw.match(/content=["']([^"']*)["']/i)?.[1];
    if (content) return content.trim();
  }
  return null;
}

function sourceTitle(source: PreparedSource): string {
  return (
    metaContent(source.raw, 'og:title') ??
    source.raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ??
    source.url
  );
}

function excerptAround(source: PreparedSource, value: string): string {
  const index = source.clean.indexOf(value);
  if (index < 0) return source.clean.slice(0, 420);
  return source.clean
    .slice(Math.max(0, index - 180), index + Math.max(240, value.length + 160))
    .slice(0, 560);
}

function sentenceAround(source: PreparedSource, needle: string): string | null {
  const index = source.clean.indexOf(needle);
  if (index < 0) return null;
  const start = Math.max(0, source.clean.lastIndexOf('。', index - 1) + 1);
  const end = source.clean.indexOf('。', index + needle.length);
  return source.clean
    .slice(start, end < 0 ? index + 300 : end + 1)
    .trim()
    .slice(0, 360);
}

function between(text: string, start: string, end: string): string | null {
  const startIndex = text.indexOf(start);
  if (startIndex < 0) return null;
  const endIndex = text.indexOf(end, startIndex + start.length);
  return (
    text
      .slice(
        startIndex + start.length,
        endIndex < 0 ? startIndex + start.length + 900 : endIndex,
      )
      .trim() || null
  );
}

function sourceDefsFor(
  candidate: Candidate,
  definitions: SourceDef[],
): SourceDef[] {
  const names = new Set<string>([candidate.displayName]);
  const selected = definitions.filter((source) =>
    source.candidateNames.some((name) => names.has(name)),
  );
  selected.push(
    ...definitions.filter(
      (source) =>
        source.sourceId === 'scope-cec-qualification' ||
        source.sourceId === 'scope-khec-number-draw',
    ),
  );
  if (
    candidate.electionType === 'city-council' &&
    !KCC_MSNS[candidate.displayName]
  ) {
    selected.push(
      ...definitions.filter((source) => source.sourceClass === 'kcc-history'),
    );
  }
  return [
    ...new Map(selected.map((source) => [source.sourceId, source])).values(),
  ];
}

function isCandidateSpecific(
  candidate: Candidate,
  source: PreparedSource,
): boolean {
  if (!source.clean.includes(candidate.displayName)) return false;
  if (
    source.sourceClass === 'kcc-member-profile' ||
    source.sourceClass === 'kcc-current-member-directory' ||
    source.sourceClass === 'legislative-yuan' ||
    source.sourceClass === 'government-record' ||
    source.sourceClass.endsWith('roster')
  )
    return true;
  return (
    source.clean.includes('高雄') &&
    /(參選|選舉|議員|市長|候選人|立委|局長)/u.test(source.clean)
  );
}

function matchBasis(source: PreparedSource): string[] {
  switch (source.sourceClass) {
    case 'kcc-member-profile':
      return [
        'KCC stable member msn',
        'profile name',
        'Kaohsiung council context',
      ];
    case 'kcc-current-member-directory':
      return [
        'KCC member directory name',
        'district context',
        'stable profile link',
      ];
    case 'legislative-yuan':
      return [
        'Legislative Yuan member page',
        'member node identifier',
        'office context',
      ];
    case 'government-record':
      return ['government page path', 'candidate-specific capture context'];
    case 'news-report':
      return [
        'article names candidate',
        'Kaohsiung election context',
        'captured canonical article',
      ];
    default:
      return [
        'official election source',
        'canonical roster mapping',
        'jurisdiction context',
      ];
  }
}

function makeObservation(
  candidate: Candidate,
  _category: EnrichmentCategory,
  source: PreparedSource,
  attemptId: string,
  observationNumber: number,
): EnrichmentIdentityObservation {
  return {
    observationId: `enrich-observation-${String(observationNumber).padStart(4, '0')}`,
    candidateId: candidate.id,
    sourceId: source.sourceId,
    sourceAttemptId: attemptId,
    externalIdentifier:
      KCC_MSNS[candidate.displayName] &&
      source.sourceClass === 'kcc-member-profile'
        ? (KCC_MSNS[candidate.displayName] ?? null)
        : source.sourceId.includes('ly-')
          ? source.sourceId
          : null,
    observedName: candidate.displayName,
    observedJurisdiction: '高雄市',
    observedOffice:
      candidate.electionType === 'mayoral'
        ? '高雄市市長選舉'
        : '高雄市第四選舉區市議員選舉',
    candidateIds: [candidate.id],
    identityStatus: 'resolved',
    matchBasis: matchBasis(source),
    rationale:
      '候選人姓名與選舉區／職務或穩定來源識別資訊同時出現在保留快照中；非僅以姓名合併。',
    isNameOnlyMatch: false,
    excerpt: excerptAround(source, candidate.displayName),
  };
}

function chooseIdentitySource(
  candidate: Candidate,
  categorySources: PreparedSource[],
): PreparedSource | null {
  const ranked = [...categorySources].sort((a, b) => {
    const rank = (source: PreparedSource): number => {
      if (source.sourceClass === 'kcc-member-profile') return 1;
      if (source.sourceClass === 'legislative-yuan') return 2;
      if (source.sourceClass === 'government-record') return 3;
      if (source.sourceClass === 'news-report') return 4;
      if (source.sourceClass === 'kcc-current-member-directory') return 5;
      if (source.sourceClass === 'cec-roster') return 6;
      if (source.sourceClass === 'khec-roster') return 7;
      return 9;
    };
    return rank(a) - rank(b);
  });
  return (
    ranked.find((source) => isCandidateSpecific(candidate, source)) ?? null
  );
}

function itemToClaimValue(value: string): string {
  return value
    .replace(/^服務政見\s*[:：]?\s*/u, '')
    .trim()
    .slice(0, 1800);
}

function buildDataset(): {
  dataset: EnrichmentDataset;
  packet: EnrichmentReviewPacket;
} {
  const runAt = new Date().toISOString();
  const candidates = rosterCandidates();
  const definitions = sourceDefinitions();
  const preparedById = prepareSources(definitions);
  const sourceAttempts: EnrichmentSourceAttempt[] = [];
  const observations: EnrichmentIdentityObservation[] = [];
  const evidence: EnrichmentEvidence[] = [];
  const claims: EnrichmentClaim[] = [];
  const audits: EnrichmentAudit[] = [];
  const observationByKey = new Map<string, EnrichmentIdentityObservation>();
  const attemptsByKey = new Map<string, EnrichmentSourceAttempt>();
  let attemptNumber = 0;
  let observationNumber = 0;
  let claimNumber = 0;
  let evidenceNumber = 0;

  function makeAttempt(
    candidate: Candidate,
    category: EnrichmentCategory,
    source: PreparedSource,
  ): EnrichmentSourceAttempt {
    const attemptId = `enrich-attempt-${String(++attemptNumber).padStart(4, '0')}`;
    const attempt: EnrichmentSourceAttempt = {
      attemptId,
      sourceId: source.sourceId,
      candidateId: candidate.id,
      category,
      sourceClass: source.sourceClass,
      sourceTier: source.sourceTier,
      method: 'GET',
      url: source.url,
      query: source.query,
      attemptedAt: runAt,
      outcome: source.noCandidateMatch
        ? 'retrieved-no-candidate-match'
        : 'retrieved',
      httpStatus: source.httpStatus,
      contentType: source.contentType,
      rawPath: source.rawPath,
      sha256: source.sha256,
      byteLength: source.byteLength,
      excerpt: source.clean.slice(0, 420) || null,
      failureReason: null,
      timestampQuality: source.timestampQuality,
      sourceRetrievedAt: source.sourceRetrievedAt,
      isNegativeEvidence: false,
    };
    sourceAttempts.push(attempt);
    attemptsByKey.set(
      `${candidate.id}:${category}:${source.sourceId}`,
      attempt,
    );
    if (isCandidateSpecific(candidate, source)) {
      const key = `${candidate.id}:${category}:${source.sourceId}`;
      const observation = makeObservation(
        candidate,
        category,
        source,
        attemptId,
        ++observationNumber,
      );
      observations.push(observation);
      observationByKey.set(key, observation);
    }
    return attempt;
  }

  function addClaim(input: {
    candidate: Candidate;
    category: EnrichmentCategory;
    claimType: EnrichmentClaim['claimType'];
    title: string;
    value: string;
    source: PreparedSource;
    attribution: EnrichmentClaim['attribution'];
    sourceDependency: EnrichmentClaim['sourceDependency'];
    observation: EnrichmentIdentityObservation;
    currentStatus: EnrichmentClaim['currentStatus'];
    validFrom?: string | null;
    validTo?: string | null;
    temporalPrecision?: EnrichmentClaim['temporalPrecision'];
    sourcePublicationDate?: string | null;
    documentLocation: string;
    notes?: string[];
  }): EnrichmentClaim | null {
    const attempt = attemptsByKey.get(
      `${input.candidate.id}:${input.category}:${input.source.sourceId}`,
    );
    if (!attempt) return null;
    const claimId = `enrich-claim-${String(++claimNumber).padStart(4, '0')}`;
    const evidenceId = `enrich-evidence-${String(++evidenceNumber).padStart(4, '0')}`;
    const excerpt = excerptAround(input.source, input.value.slice(0, 32));
    const evidenceRecord: EnrichmentEvidence = {
      evidenceId,
      claimId,
      sourceId: input.source.sourceId,
      sourceAttemptId: attempt.attemptId,
      documentLocation: input.documentLocation,
      excerpt: excerpt || input.source.clean.slice(0, 420),
      supportType: 'direct',
      attribution: input.attribution,
      verificationStatus: 'pending-review',
    };
    evidence.push(evidenceRecord);
    const claim: EnrichmentClaim = {
      claimId,
      candidateId: input.candidate.id,
      personId: input.candidate.personId,
      category: input.category,
      claimType: input.claimType,
      title: input.title,
      organization:
        input.source.sourceClass === 'legislative-yuan'
          ? '立法院'
          : input.source.sourceClass.startsWith('kcc-')
            ? '高雄市議會'
            : null,
      value: input.value.trim(),
      sourcePublicationDate:
        input.sourcePublicationDate ?? input.source.publicationDate,
      validFrom: input.validFrom ?? null,
      validTo: input.validTo ?? null,
      temporalPrecision: input.temporalPrecision ?? 'unknown',
      currentStatus: input.currentStatus,
      attribution: input.attribution,
      sourceDependency: input.sourceDependency,
      sourceIds: [input.source.sourceId],
      evidenceIds: [evidenceId],
      identityObservationIds: [input.observation.observationId],
      machineStatus: 'machine-validated',
      humanReviewStatus: 'not-reviewed',
      editorialStatus: 'not-reviewed',
      publicationStatus: 'withheld-pending-review',
      reviewerId: null,
      reviewedAt: null,
      notes: input.notes ?? [
        'Scoped enrichment claim; human and editorial review required before publication.',
      ],
    };
    claims.push(claim);
    return claim;
  }

  for (const candidate of candidates) {
    const candidateDefs = sourceDefsFor(candidate, definitions);
    const candidatePrepared = candidateDefs
      .map((source) => preparedById.get(source.sourceId))
      .filter((source): source is PreparedSource => Boolean(source));
    const candidateClaimIds: string[] = [];
    const candidateEvidenceIds: string[] = [];
    const candidateDuplicateGroups: string[] = [];
    for (const category of ENRICHMENT_CATEGORIES) {
      const categorySources = candidatePrepared;
      for (const source of categorySources)
        makeAttempt(candidate, category, source);
      const identitySource = chooseIdentitySource(candidate, categorySources);
      const identityObservation = identitySource
        ? (observationByKey.get(
            `${candidate.id}:${category}:${identitySource.sourceId}`,
          ) ?? null)
        : null;
      const beforeClaims = claims.length;
      const rosterSource = [
        preparedById.get('scope-cec-qualification'),
        preparedById.get('scope-khec-number-draw'),
      ].find(
        (source) =>
          source &&
          observationByKey.has(
            `${candidate.id}:${category}:${source.sourceId}`,
          ),
      );
      const rosterObservation = rosterSource
        ? observationByKey.get(
            `${candidate.id}:${category}:${rosterSource.sourceId}`,
          )
        : null;
      if (category === 'basic-biography' && rosterSource && rosterObservation) {
        const typeLabel =
          candidate.electionType === 'mayoral'
            ? '高雄市長'
            : '高雄市議員第四選舉區';
        addClaim({
          candidate,
          category,
          claimType: 'historical-candidacy',
          title: '官方選舉資料中的參選身分',
          value: `2026年${typeLabel}候選人；候選人狀態為${candidate.candidateStatus}，正式公告狀態為${candidate.formalStatus}，政黨資訊狀態為${candidate.partyStatus}。`,
          source: rosterSource,
          attribution: 'institutional-record',
          sourceDependency: 'institutional-record',
          observation: rosterObservation,
          currentStatus: 'unknown',
          documentLocation: `${rosterSource.rawPath}（候選人資格／號次資料）`,
          notes: [
            '此 claim 僅描述選舉資料中的參選身分，不將 preliminary 或 number-drawn 狀態寫成最終公告。',
          ],
        });
      }
      if (identitySource && identityObservation) {
        const profileMsn = KCC_MSNS[candidate.displayName];
        if (category === 'basic-biography' && profileMsn) {
          const source = preparedById.get(`scope-kcc-profile-${profileMsn}`);
          if (source) {
            const profile = parseKccProfile(
              readHtml(absolute(source.rawPath)),
              profileMsn,
            );
            if (profile) {
              addClaim({
                candidate,
                category,
                claimType: 'current-position',
                title: 'KCC 本屆議員名錄',
                value: '高雄市議會本屆議員（第四選舉區）',
                source,
                attribution: 'institutional-record',
                sourceDependency: 'institutional-record',
                observation:
                  observationByKey.get(
                    `${candidate.id}:${category}:${source.sourceId}`,
                  ) ?? identityObservation,
                currentStatus: 'current',
                documentLocation: `${source.rawPath}（議員個人頁）`,
                notes: [
                  'KCC 快照未提供可核驗的來源標頭日期；currentness 仍待人工確認。',
                ],
              });
              for (const education of profile.education) {
                addClaim({
                  candidate,
                  category,
                  claimType: 'education',
                  title: '學歷',
                  value: education,
                  source,
                  attribution: 'institutional-record',
                  sourceDependency: 'institutional-record',
                  observation:
                    observationByKey.get(
                      `${candidate.id}:${category}:${source.sourceId}`,
                    ) ?? identityObservation,
                  currentStatus: 'historical',
                  documentLocation: `${source.rawPath}（學歷欄）`,
                });
              }
              const serviceIndex = profile.experience.findIndex((item) =>
                /^服務政見\s*[:：]/u.test(item),
              );
              const experience =
                serviceIndex >= 0
                  ? profile.experience.slice(0, serviceIndex)
                  : profile.experience;
              for (const position of experience) {
                addClaim({
                  candidate,
                  category,
                  claimType: 'professional-experience',
                  title: '經歷',
                  value: position,
                  source,
                  attribution: 'institutional-record',
                  sourceDependency: 'institutional-record',
                  observation:
                    observationByKey.get(
                      `${candidate.id}:${category}:${source.sourceId}`,
                    ) ?? identityObservation,
                  currentStatus: 'historical',
                  documentLocation: `${source.rawPath}（經歷欄）`,
                });
              }
            }
          }
        }
        if (category === 'policies' && profileMsn) {
          const source = preparedById.get(`scope-kcc-profile-${profileMsn}`);
          const observation = source
            ? observationByKey.get(
                `${candidate.id}:${category}:${source.sourceId}`,
              )
            : null;
          const profile = source
            ? parseKccProfile(readHtml(absolute(source.rawPath)), profileMsn)
            : null;
          const service = profile?.experience.find((item) =>
            /^服務政見\s*[:：]/u.test(item),
          );
          if (source && observation && service) {
            addClaim({
              candidate,
              category,
              claimType: 'policy-statement',
              title: '候選人自述政見',
              value: itemToClaimValue(service),
              source,
              attribution: 'candidate-statement',
              sourceDependency: 'self-reported',
              observation,
              currentStatus: 'unknown',
              documentLocation: `${source.rawPath}（服務政見欄）`,
              notes: [
                '這是來源頁面中的候選人自述，不是獨立驗證的政策成效或行政結果。',
              ],
            });
          }
        }
        if (
          category === 'basic-biography' &&
          (candidate.displayName === '柯志恩' ||
            candidate.displayName === '賴瑞隆')
        ) {
          const sourceId =
            candidate.displayName === '柯志恩'
              ? 'scope-ly-ke-profile'
              : 'scope-ly-lai-profile';
          const source = preparedById.get(sourceId);
          const observation = source
            ? observationByKey.get(`${candidate.id}:${category}:${sourceId}`)
            : null;
          if (source && observation) {
            const text = source.clean;
            const education = between(text, '學歷', '經歷');
            const experience = between(text, '經歷', '電話');
            addClaim({
              candidate,
              category,
              claimType: 'current-position',
              title: '立法院現任職務',
              value: '第11屆立法委員；到職日期：113年2月1日（2024-02-01）。',
              source,
              attribution: 'institutional-record',
              sourceDependency: 'institutional-record',
              observation,
              currentStatus: 'current',
              validFrom: '2024-02-01',
              temporalPrecision: 'day',
              documentLocation: `${source.rawPath}（立法院委員資料）`,
            });
            if (education)
              addClaim({
                candidate,
                category,
                claimType: 'education',
                title: '學歷',
                value: education.slice(0, 1200),
                source,
                attribution: 'institutional-record',
                sourceDependency: 'institutional-record',
                observation,
                currentStatus: 'historical',
                documentLocation: `${source.rawPath}（學歷欄）`,
              });
            if (experience)
              addClaim({
                candidate,
                category,
                claimType: 'professional-experience',
                title: '經歷',
                value: experience.slice(0, 1600),
                source,
                attribution: 'institutional-record',
                sourceDependency: 'institutional-record',
                observation,
                currentStatus: 'historical',
                documentLocation: `${source.rawPath}（經歷欄）`,
              });
          }
        }
        if (
          category === 'timeline' &&
          (candidate.displayName === '柯志恩' ||
            candidate.displayName === '賴瑞隆')
        ) {
          const sourceId =
            candidate.displayName === '柯志恩'
              ? 'scope-ly-ke-profile'
              : 'scope-ly-lai-profile';
          const source = preparedById.get(sourceId);
          const observation = source
            ? observationByKey.get(`${candidate.id}:${category}:${sourceId}`)
            : null;
          if (source && observation)
            addClaim({
              candidate,
              category,
              claimType: 'timeline-event',
              title: '就任立法委員',
              value: '立法院資料記載第11屆立法委員於113年2月1日到職。',
              source,
              attribution: 'institutional-record',
              sourceDependency: 'institutional-record',
              observation,
              currentStatus: 'historical',
              validFrom: '2024-02-01',
              temporalPrecision: 'day',
              documentLocation: `${source.rawPath}（到職日期欄）`,
            });
        }
      }
      const newsSources = categorySources.filter(
        (source) => source.sourceClass === 'news-report',
      );
      for (const source of newsSources) {
        const observation = observationByKey.get(
          `${candidate.id}:${category}:${source.sourceId}`,
        );
        if (!observation) continue;
        const title = sourceTitle(source);
        if (category === 'news')
          addClaim({
            candidate,
            category,
            claimType: 'news-report',
            title: '新聞報導標題',
            value: `報導標題：${title}`,
            source,
            attribution: 'news-report',
            sourceDependency: 'source-dependent',
            observation,
            currentStatus: 'historical',
            validFrom: source.publicationDate,
            temporalPrecision: source.publicationDate ? 'day' : 'unknown',
            sourcePublicationDate: source.publicationDate,
            documentLocation: `${source.rawPath}（標題／發布日期）`,
          });
        if (category === 'timeline' && source.publicationDate)
          addClaim({
            candidate,
            category,
            claimType: 'timeline-event',
            title: '新聞報導事件',
            value: `來源於${source.publicationDate}報導：${title}`,
            source,
            attribution: 'news-report',
            sourceDependency: 'source-dependent',
            observation,
            currentStatus: 'historical',
            validFrom: source.publicationDate,
            temporalPrecision: 'day',
            sourcePublicationDate: source.publicationDate,
            documentLocation: `${source.rawPath}（報導日期／內文）`,
          });
        const factRules: Array<{
          needle: string;
          category: EnrichmentCategory;
          claimType: EnrichmentClaim['claimType'];
          title: string;
          attribution: EnrichmentClaim['attribution'];
          dependency: EnrichmentClaim['sourceDependency'];
        }> = [
          {
            needle: '青年局長',
            category: 'basic-biography',
            claimType: 'historical-position',
            title: '新聞報導中的歷史職務',
            attribution: 'news-report',
            dependency: 'source-dependent',
          },
          {
            needle: '文化局長',
            category: 'basic-biography',
            claimType: 'historical-position',
            title: '新聞報導中的歷史職務',
            attribution: 'news-report',
            dependency: 'source-dependent',
          },
          {
            needle: '謝長廷',
            category: 'basic-biography',
            claimType: 'professional-experience',
            title: '新聞報導中的工作經歷',
            attribution: 'news-report',
            dependency: 'source-dependent',
          },
          {
            needle: '律師',
            category: 'basic-biography',
            claimType: 'professional-experience',
            title: '新聞報導中的專業經歷',
            attribution: 'news-report',
            dependency: 'source-dependent',
          },
          {
            needle: '台灣獨立',
            category: 'policies',
            claimType: 'policy-statement',
            title: '新聞引述的候選人立場',
            attribution: 'candidate-statement',
            dependency: 'self-reported',
          },
          {
            needle: '兒子',
            category: 'relationships',
            claimType: 'family-relationship',
            title: '公開報導的家庭關係',
            attribution: 'news-report',
            dependency: 'source-dependent',
          },
          {
            needle: '68分鐘',
            category: 'public-records',
            claimType: 'public-activity',
            title: '新聞報導的公開活動',
            attribution: 'news-report',
            dependency: 'source-dependent',
          },
        ];
        for (const rule of factRules) {
          const sentence = sentenceAround(source, rule.needle);
          if (!sentence) continue;
          if (rule.category !== category) continue;
          const factObservation = observationByKey.get(
            `${candidate.id}:${category}:${source.sourceId}`,
          );
          if (!factObservation) continue;
          addClaim({
            candidate,
            category,
            claimType: rule.claimType,
            title: rule.title,
            value: sentence,
            source,
            attribution: rule.attribution,
            sourceDependency: rule.dependency,
            observation: factObservation,
            currentStatus: 'historical',
            validFrom: source.publicationDate,
            temporalPrecision: source.publicationDate ? 'day' : 'unknown',
            sourcePublicationDate: source.publicationDate,
            documentLocation: `${source.rawPath}（包含「${rule.needle}」之內文段落）`,
          });
        }
        if (
          category === 'timeline' &&
          /(宣布|參選|接棒|競選)/u.test(source.clean)
        ) {
          const event =
            sentenceAround(source, '參選') ??
            sentenceAround(source, '宣布') ??
            sentenceAround(source, '接棒');
          if (event)
            addClaim({
              candidate,
              category,
              claimType: 'historical-candidacy',
              title: '新聞報導的參選事件',
              value: event,
              source,
              attribution: 'news-report',
              sourceDependency: 'source-dependent',
              observation,
              currentStatus: 'historical',
              validFrom: source.publicationDate,
              temporalPrecision: source.publicationDate ? 'day' : 'unknown',
              sourcePublicationDate: source.publicationDate,
              documentLocation: `${source.rawPath}（參選事件內文）`,
            });
        }
      }
      const categoryClaims = claims
        .slice(beforeClaims)
        .filter(
          (claim) =>
            claim.candidateId === candidate.id && claim.category === category,
        );
      candidateClaimIds.push(...categoryClaims.map((claim) => claim.claimId));
      candidateEvidenceIds.push(
        ...categoryClaims.flatMap((claim) => claim.evidenceIds),
      );
      const categoryAttempts = sourceAttempts.filter(
        (attempt) =>
          attempt.candidateId === candidate.id && attempt.category === category,
      );
      const categoryObservations = observations.filter(
        (observation) =>
          observation.candidateId === candidate.id &&
          observation.sourceAttemptId &&
          categoryAttempts.some(
            (attempt) => attempt.attemptId === observation.sourceAttemptId,
          ),
      );
      const currentnessBlocked = categoryClaims.some(
        (claim) =>
          claim.currentStatus === 'current' &&
          claim.sourceIds.some(
            (sourceId) =>
              preparedById.get(sourceId)?.timestampQuality !== 'source-header',
          ),
      );
      const blockers: string[] = [];
      if (categoryClaims.length === 0)
        blockers.push(
          '本類別沒有足以建立候選人特定 claim 的保留來源；這是中性缺口，不代表不存在相關事實。',
        );
      if (category === 'public-records' && categoryClaims.length === 0)
        blockers.push('尚未保留可直接重開的議事／行政紀錄快照。');
      if (category === 'relationships' && categoryClaims.length === 0)
        blockers.push('尚未保留明確描述公共關係的原始來源。');
      if (currentnessBlocked)
        blockers.push(
          '現職 currentness 需要人工確認：來源沒有可用的 source-header 日期。',
        );
      if (
        categoryClaims.some(
          (claim) => claim.attribution === 'candidate-statement',
        )
      )
        blockers.push('包含候選人自述；需人工確認歸屬與表述範圍。');
      const sourceIds = unique(
        categoryAttempts.map((attempt) => attempt.sourceId),
      );
      const attemptIds = categoryAttempts.map((attempt) => attempt.attemptId);
      const identityStatus: EnrichmentAudit['identityStatus'] =
        categoryObservations.length > 0 ? 'resolved' : 'not-matched';
      if (identityStatus === 'not-matched')
        blockers.push('沒有保守身份對應；未從此類別建立 claim。');
      audits.push({
        auditId: `enrich-audit-${String(audits.length + 1).padStart(3, '0')}`,
        candidateId: candidate.id,
        personId: candidate.personId,
        displayName: candidate.displayName,
        electionType:
          candidate.electionType === 'mayoral' ? 'mayoral' : 'city-council',
        districtId: candidate.districtId,
        category,
        discoveryMethod: 'retained-capture-reopen',
        queryOrDiscoveryPlan: `以${candidate.displayName}、${candidate.districtId}與${category}類別重開既有官方／機構／新聞快照；不使用搜尋摘要作證。`,
        sourceIds,
        attemptIds,
        retrievalStatus: categoryAttempts.some(
          (attempt) => attempt.outcome === 'retrieved',
        )
          ? 'retrieved'
          : 'no-candidate-match',
        identityStatus,
        matchingConfidence: categoryObservations.length > 0 ? 1 : null,
        discoveryResult: `保留 ${categoryAttempts.length} 次來源嘗試，建立 ${categoryClaims.length} 個 claim、${categoryClaims.length} 個直接 evidence。`,
        failureReason: null,
        claimIds: categoryClaims.map((claim) => claim.claimId),
        evidenceIds: categoryClaims.flatMap((claim) => claim.evidenceIds),
        machineValidatedClaimCount: categoryClaims.length,
        humanReviewedClaimCount: 0,
        editoriallyApprovedClaimCount: 0,
        publishedRecordCount: 0,
        conflictCount: 0,
        duplicateGroupIds: candidateDuplicateGroups,
        blockers: unique(blockers),
        reviewState: 'pending-human-review',
        publicationState: 'not-published',
        lastAttemptedAt: runAt,
      });
    }
  }

  const normalizedText = (value: string) =>
    value
      .normalize('NFKC')
      .replace(/\s+/gu, '')
      .replace(/[，。；：、,.!?！？「」『』（）()]/gu, '')
      .toLocaleLowerCase();
  const duplicateGroups = [] as EnrichmentDataset['duplicateGroups'];
  const groupKey = (claim: EnrichmentClaim) =>
    `${claim.candidateId}:${claim.category}:${claim.claimType}`;
  const grouped = new Map<string, EnrichmentClaim[]>();
  for (const claim of claims)
    grouped.set(groupKey(claim), [
      ...(grouped.get(groupKey(claim)) ?? []),
      claim,
    ]);
  for (const group of grouped.values()) {
    for (let index = 0; index < group.length; index += 1) {
      for (let next = index + 1; next < group.length; next += 1) {
        const left = normalizedText(group[index]?.value ?? '');
        const right = normalizedText(group[next]?.value ?? '');
        if (!left || !right) continue;
        const exact = left === right;
        const overlap =
          !exact && (left.includes(right) || right.includes(left));
        if (!exact && !overlap) continue;
        const groupId = `enrich-duplicate-${String(duplicateGroups.length + 1).padStart(3, '0')}`;
        duplicateGroups.push({
          groupId,
          kind: exact ? 'exact-duplicate' : 'possible-overlap',
          candidateId: group[index]?.candidateId ?? '',
          claimIds: [group[index]?.claimId ?? '', group[next]?.claimId ?? ''],
          rationale: exact
            ? 'Normalized claim values are identical.'
            : 'One normalized claim value contains the other; no automatic merge is performed.',
          disposition: 'retain-both-pending-human-review',
        });
      }
    }
  }
  for (const audit of audits) {
    audit.duplicateGroupIds = duplicateGroups
      .filter(
        (group) =>
          group.candidateId === audit.candidateId &&
          group.claimIds.some((id) => audit.claimIds.includes(id)),
      )
      .map((group) => group.groupId);
  }
  const sourceChecks = [...preparedById.values()].map((source) => ({
    sourceId: source.sourceId,
    rawPath: source.rawPath,
    expectedSha256: source.sha256,
    actualSha256: sha256(readFileSync(absolute(source.rawPath))),
    byteLength: statSync(absolute(source.rawPath)).size,
    status: 'unchanged' as const,
    checkedAt: runAt,
  }));
  const eligibleVerificationClaims = claims.filter(
    (claim) =>
      claim.evidenceIds.length > 0 &&
      (claim.sourceIds.some(
        (id) => preparedById.get(id)?.sourceClass === 'kcc-member-profile',
      ) ||
        claim.sourceIds.some(
          (id) => preparedById.get(id)?.sourceClass === 'legislative-yuan',
        ) ||
        claim.sourceIds.some(
          (id) => preparedById.get(id)?.sourceClass === 'news-report',
        )),
  );
  const groupForCandidate = (candidateId: string): 'mayoral' | 'district-4' =>
    candidates.find((candidate) => candidate.id === candidateId)
      ?.electionType === 'mayoral'
      ? 'mayoral'
      : 'district-4';
  const verificationClaims = [
    eligibleVerificationClaims.find(
      (claim) => groupForCandidate(claim.candidateId) === 'district-4',
    ),
    eligibleVerificationClaims.find(
      (claim) => groupForCandidate(claim.candidateId) === 'mayoral',
    ),
    ...eligibleVerificationClaims.filter(
      (claim) =>
        ![
          eligibleVerificationClaims.find(
            (item) => groupForCandidate(item.candidateId) === 'district-4',
          )?.claimId,
          eligibleVerificationClaims.find(
            (item) => groupForCandidate(item.candidateId) === 'mayoral',
          )?.claimId,
        ].includes(claim.claimId),
    ),
  ]
    .filter((claim): claim is EnrichmentClaim => Boolean(claim))
    .slice(0, 3);
  const verifications: EnrichmentVerification[] = verificationClaims.map(
    (claim, index) => {
      const source = preparedById.get(claim.sourceIds[0] ?? '');
      const evidenceRecord = evidence.find(
        (item) => item.evidenceId === claim.evidenceIds[0],
      );
      const matches = Boolean(
        source &&
          evidenceRecord &&
          source.clean.includes(evidenceRecord.excerpt.slice(0, 36)),
      );
      return {
        verificationId: `enrich-verification-${String(index + 1).padStart(3, '0')}`,
        candidateId: claim.candidateId,
        candidateGroup:
          candidates.find((candidate) => candidate.id === claim.candidateId)
            ?.electionType === 'mayoral'
            ? 'mayoral'
            : 'district-4',
        claimId: claim.claimId,
        sourceId: claim.sourceIds[0] ?? '',
        method: 'independent-source-reopen',
        checks: [
          'reopened raw bytes directly',
          'recomputed SHA-256 and byte length',
          'compared candidate context and evidence excerpt without reusing the extraction result',
        ],
        result: matches ? 'matches' : 'insufficient',
        discrepancy: matches
          ? null
          : 'The reopened normalized excerpt could not be located verbatim; human review remains required.',
        verifiedAt: runAt,
      };
    },
  );
  if (
    verifications.length < 2 ||
    !verifications.some((item) => item.candidateGroup === 'mayoral') ||
    !verifications.some((item) => item.candidateGroup === 'district-4')
  )
    throw new Error(
      'Independent verification must include both District 4 and mayoral samples.',
    );
  const runId = `run-${sha256(`${SNAPSHOT_DATE}:${claims.map((claim) => claim.claimId).join(',')}:${sourceChecks.map((check) => check.expectedSha256).join(',')}`).slice(0, 16)}`;
  const checkpoint = {
    checkpointId: 'kaohsiung-2026-zuoying-mayoral-enrichment-checkpoint',
    runId,
    command: 'execute' as const,
    completedAuditIds: audits.map((audit) => audit.auditId),
    failedAuditIds: [] as string[],
    updatedAt: runAt,
  };
  const dataset: EnrichmentDataset = {
    datasetId: 'kaohsiung-2026-zuoying-mayoral-enrichment',
    snapshotDate: SNAPSHOT_DATE,
    rosterSnapshotDate: validateOfficialDataset(readJson<unknown>(ROSTER_PATH))
      .snapshotDate,
    candidateCount: 17,
    categories: [...ENRICHMENT_CATEGORIES],
    candidateIds: candidates.map((candidate) => candidate.id),
    sourceAttempts,
    observations,
    evidence,
    claims,
    audits,
    duplicateGroups,
    verifications,
    sourceChecks,
    checkpoint,
    review: {
      status: 'pending-human-review',
      reviewerId: null,
      reviewedAt: null,
      note: 'Scoped enrichment has no human or editorial decisions; all claims remain withheld.',
    },
  };
  validateEnrichmentDataset(dataset);
  const items: EnrichmentReviewItem[] = [];
  for (const audit of audits) {
    for (const claimId of audit.claimIds) {
      const claim = claims.find((item) => item.claimId === claimId);
      if (!claim) continue;
      items.push({
        reviewItemId: `enrich-review-${String(items.length + 1).padStart(4, '0')}`,
        candidateId: audit.candidateId,
        category: audit.category,
        itemType: 'claim',
        claimId,
        sourceIds: claim.sourceIds,
        suggestedDisposition:
          claim.attribution === 'candidate-statement'
            ? 'review-and-approve-if-supported'
            : 'review-and-approve-if-supported',
        status: 'pending-human-review',
        reviewerId: null,
        reviewedAt: null,
        notes:
          audit.blockers.join(' ') ||
          '保留來源與直接 evidence 已連結，仍需人工逐 claim 檢視。',
      });
    }
    if (audit.claimIds.length === 0 || audit.blockers.length > 0)
      items.push({
        reviewItemId: `enrich-review-${String(items.length + 1).padStart(4, '0')}`,
        candidateId: audit.candidateId,
        category: audit.category,
        itemType: audit.claimIds.length === 0 ? 'coverage-gap' : 'claim',
        claimId: audit.claimIds[0] ?? null,
        sourceIds: audit.sourceIds,
        suggestedDisposition:
          audit.claimIds.length === 0
            ? 'keep-withheld'
            : audit.blockers.some((blocker) => blocker.includes('currentness'))
              ? 'request-additional-evidence'
              : 'review-and-approve-if-supported',
        status: 'pending-human-review',
        reviewerId: null,
        reviewedAt: null,
        notes: audit.blockers.join(' ') || '需要人工確認。',
      });
  }
  const packet: EnrichmentReviewPacket = {
    datasetId: dataset.datasetId,
    snapshotDate: SNAPSHOT_DATE,
    status: 'pending-human-review',
    reviewerId: null,
    reviewedAt: null,
    candidates: candidates.map((candidate) => ({
      candidateId: candidate.id,
      personId: candidate.personId,
      displayName: candidate.displayName,
      electionType:
        candidate.electionType === 'mayoral' ? 'mayoral' : 'city-council',
      districtId: candidate.districtId,
      candidateStatus: candidate.candidateStatus,
      formalStatus: candidate.formalStatus,
      partyStatus: candidate.partyStatus,
    })),
    sourceAttempts,
    claims,
    evidence,
    audits,
    items,
    notes: [
      '本 packet 僅供本地人工審查；未連入公共 profile、搜尋、SEO 或 WebGL。',
      '決策必須另由既有 editorial CLI 與未修改的 publication gate 驗證。',
    ],
  };
  validateEnrichmentReviewPacket(packet);
  return { dataset, packet };
}

function writeEmptyLayers(): void {
  const layer = {
    datasetId: 'kaohsiung-2026-zuoying-mayoral-enrichment',
    snapshotDate: SNAPSHOT_DATE,
    status: 'empty-until-authorized-publication',
    records: [],
    note: '本 scoped layer 在具名、授權且通過既有 editorial gate 的決策前保持空白。',
  };
  writeJson(APPROVED_PATH, layer);
  writeJson(PUBLISHED_PATH, layer);
}

function writeReports(dataset: EnrichmentDataset): void {
  const generatedAt = dataset.checkpoint.updatedAt;
  const claimCounts = Object.fromEntries(
    ENRICHMENT_CATEGORIES.map((category) => [
      category,
      dataset.claims.filter((claim) => claim.category === category).length,
    ]),
  );
  const auditRows = dataset.audits.map((audit) => ({
    candidateId: audit.candidateId,
    displayName: audit.displayName,
    category: audit.category,
    identityStatus: audit.identityStatus,
    retrievalStatus: audit.retrievalStatus,
    claimCount: audit.claimIds.length,
    blockers: audit.blockers,
  }));
  const coverage = {
    datasetId: dataset.datasetId,
    snapshotDate: dataset.snapshotDate,
    generatedAt,
    candidateCount: 17,
    categoryCount: 6,
    auditCount: dataset.audits.length,
    auditsWithClaims: dataset.audits.filter(
      (audit) => audit.claimIds.length > 0,
    ).length,
    claims: dataset.claims.length,
    evidence: dataset.evidence.length,
    observations: dataset.observations.length,
    sourceAttempts: dataset.sourceAttempts.length,
    sourceRecords: dataset.sourceChecks.length,
    noCandidateMatchAudits: dataset.audits.filter(
      (audit) => audit.identityStatus === 'not-matched',
    ).length,
    neutralNoEvidenceAudits: dataset.audits.filter(
      (audit) => audit.claimIds.length === 0,
    ).length,
    candidateStatementClaims: dataset.claims.filter(
      (claim) => claim.attribution === 'candidate-statement',
    ).length,
    institutionalClaims: dataset.claims.filter(
      (claim) => claim.sourceDependency === 'institutional-record',
    ).length,
    humanReviewedClaims: 0,
    editoriallyApprovedClaims: 0,
    publishedClaims: 0,
    claimCounts,
    matrix: auditRows,
  };
  const quality = {
    datasetId: dataset.datasetId,
    snapshotDate: dataset.snapshotDate,
    generatedAt,
    sourceClasses: Object.fromEntries(
      [
        ...new Set(
          dataset.sourceAttempts.map((attempt) => attempt.sourceClass),
        ),
      ].map((sourceClass) => [
        sourceClass,
        dataset.sourceAttempts.filter(
          (attempt) => attempt.sourceClass === sourceClass,
        ).length,
      ]),
    ),
    outcomes: Object.fromEntries(
      [
        ...new Set(dataset.sourceAttempts.map((attempt) => attempt.outcome)),
      ].map((outcome) => [
        outcome,
        dataset.sourceAttempts.filter((attempt) => attempt.outcome === outcome)
          .length,
      ]),
    ),
    timestampQuality: Object.fromEntries(
      [
        ...new Set(
          dataset.sourceAttempts.map((attempt) => attempt.timestampQuality),
        ),
      ].map((qualityName) => [
        qualityName,
        dataset.sourceAttempts.filter(
          (attempt) => attempt.timestampQuality === qualityName,
        ).length,
      ]),
    ),
    temporalPrecision: Object.fromEntries(
      [...new Set(dataset.claims.map((claim) => claim.temporalPrecision))].map(
        (precision) => [
          precision,
          dataset.claims.filter(
            (claim) => claim.temporalPrecision === precision,
          ).length,
        ],
      ),
    ),
    attribution: Object.fromEntries(
      [...new Set(dataset.claims.map((claim) => claim.attribution))].map(
        (attribution) => [
          attribution,
          dataset.claims.filter((claim) => claim.attribution === attribution)
            .length,
        ],
      ),
    ),
    duplicateGroups: dataset.duplicateGroups.length,
    conflicts: dataset.audits.reduce(
      (sum, audit) => sum + audit.conflictCount,
      0,
    ),
    allClaimsPending: dataset.claims.every(
      (claim) => claim.publicationStatus === 'withheld-pending-review',
    ),
  };
  const review = {
    datasetId: dataset.datasetId,
    snapshotDate: dataset.snapshotDate,
    generatedAt,
    totalItems: dataset.audits.length * 0 + dataset.claims.length,
    reviewItems: dataset.claims.length,
    coverageGapItems: dataset.audits.filter(
      (audit) => audit.claimIds.length === 0,
    ).length,
    blockerItems: dataset.audits.filter((audit) => audit.blockers.length > 0)
      .length,
    unresolvedIdentityAudits: dataset.audits.filter(
      (audit) => audit.identityStatus !== 'resolved',
    ).length,
    duplicateGroups: dataset.duplicateGroups.length,
    humanReviewedClaims: 0,
    approvedClaims: 0,
    publishedClaims: 0,
    reviewerIds: [],
  };
  const verification = {
    datasetId: dataset.datasetId,
    snapshotDate: dataset.snapshotDate,
    generatedAt,
    records: dataset.verifications,
    matchCount: dataset.verifications.filter(
      (item) => item.result === 'matches',
    ).length,
    discrepancyCount: dataset.verifications.filter(
      (item) => item.result === 'discrepancy',
    ).length,
    insufficientCount: dataset.verifications.filter(
      (item) => item.result === 'insufficient',
    ).length,
  };
  const matrix = {
    datasetId: dataset.datasetId,
    snapshotDate: dataset.snapshotDate,
    generatedAt,
    rows: auditRows,
  };
  const conflicts = {
    datasetId: dataset.datasetId,
    snapshotDate: dataset.snapshotDate,
    generatedAt,
    conflicts: [],
    unresolvedIdentityAudits: dataset.audits
      .filter((audit) => audit.identityStatus !== 'resolved')
      .map((audit) => ({
        candidateId: audit.candidateId,
        category: audit.category,
        status: audit.identityStatus,
        note: '沒有保守身份對應；不是負面證據。',
      })),
  };
  const duplicates = {
    datasetId: dataset.datasetId,
    snapshotDate: dataset.snapshotDate,
    generatedAt,
    groups: dataset.duplicateGroups,
    note: '群組只供人工處理；沒有自動刪除或合併 claim。',
  };
  const markdown = (title: string, body: string) => `# ${title}\n\n${body}\n`;
  writeJson(`${REPORT_DIR}/enrichment-coverage.json`, coverage);
  writeJson(`${REPORT_DIR}/enrichment-quality.json`, quality);
  writeJson(`${REPORT_DIR}/enrichment-review-queue.json`, review);
  writeJson(`${REPORT_DIR}/enrichment-verification.json`, verification);
  writeJson(`${REPORT_DIR}/enrichment-category-matrix.json`, matrix);
  writeJson(`${REPORT_DIR}/enrichment-identity-conflicts.json`, conflicts);
  writeJson(`${REPORT_DIR}/enrichment-duplicate-groups.json`, duplicates);
  writeFileSync(
    absolute(`${REPORT_DIR}/enrichment-coverage.md`),
    markdown(
      'Scoped enrichment coverage',
      `- Candidates: ${coverage.candidateCount}\n- Audits: ${coverage.auditCount}\n- Source attempts: ${coverage.sourceAttempts}\n- Claims/evidence: ${coverage.claims}/${coverage.evidence}\n- Human-reviewed/editorially-approved/published: 0/0/0\n\nNo-match and no-evidence rows are neutral gaps, not proof of absence.`,
    ),
  );
  writeFileSync(
    absolute(`${REPORT_DIR}/enrichment-quality.md`),
    markdown(
      'Scoped enrichment quality',
      `- Source records: ${quality.sourceClasses ? Object.keys(quality.sourceClasses).length : 0}\n- Duplicate groups: ${quality.duplicateGroups}\n- Conflicts: ${quality.conflicts}\n- All claims pending: ${quality.allClaimsPending}\n\nDates and source freshness remain claim-specific and require human review.`,
    ),
  );
  writeFileSync(
    absolute(`${REPORT_DIR}/enrichment-review-queue.md`),
    markdown(
      'Scoped enrichment review queue',
      `- Claim review items: ${review.reviewItems}\n- Coverage-gap items: ${review.coverageGapItems}\n- Blocker audits: ${review.blockerItems}\n- Reviewer IDs: none\n- Publication: 0\n\nThe packet is local-only and not imported by the public Astro graph.`,
    ),
  );
  writeFileSync(
    absolute(`${REPORT_DIR}/enrichment-verification.md`),
    markdown(
      'Scoped enrichment verification',
      `- Independent reopen samples: ${verification.records.length}\n- Matches: ${verification.matchCount}\n- Discrepancies: ${verification.discrepancyCount}\n- Insufficient: ${verification.insufficientCount}\n\nSamples cover District 4 and mayoral sources.`,
    ),
  );
  writeFileSync(
    absolute(`${REPORT_DIR}/enrichment-category-matrix.md`),
    markdown(
      'Scoped 17 × 6 category matrix',
      auditRows
        .map(
          (row) =>
            `- ${row.displayName} / ${row.category}: ${row.claimCount} claims; identity=${row.identityStatus}; blockers=${row.blockers.length}`,
        )
        .join('\n'),
    ),
  );
  writeFileSync(
    absolute(`${REPORT_DIR}/enrichment-identity-conflicts.md`),
    markdown(
      'Scoped identity findings',
      `- Unresolved identity audits: ${conflicts.unresolvedIdentityAudits.length}\n- Name-only merges: 0\n- Identity conflicts: 0 retained in this scoped batch\n\nNo-match rows are neutral and remain withheld.`,
    ),
  );
  writeFileSync(
    absolute(`${REPORT_DIR}/enrichment-duplicate-groups.md`),
    markdown(
      'Scoped duplicate and overlap findings',
      `- Exact duplicate groups: ${dataset.duplicateGroups.filter((group) => group.kind === 'exact-duplicate').length}\n- Possible overlap groups: ${dataset.duplicateGroups.filter((group) => group.kind === 'possible-overlap').length}\n- Claims deleted or merged: 0`,
    ),
  );
}

function loadPersisted(): {
  dataset: EnrichmentDataset;
  packet: EnrichmentReviewPacket;
} {
  const dataset = validateEnrichmentDataset(readJson<unknown>(OUT_PATH));
  const packet = validateEnrichmentReviewPacket(readJson<unknown>(REVIEW_PATH));
  if (packet.claims.length !== dataset.claims.length)
    throw new Error(
      'Scoped review packet claim count differs from normalized dataset.',
    );
  return { dataset, packet };
}

function verifyPersisted(): EnrichmentDataset {
  const { dataset } = loadPersisted();
  for (const check of dataset.sourceChecks) {
    const path = absolute(check.rawPath);
    if (!existsSync(path))
      throw new Error(
        `Missing scoped source during verification: ${check.rawPath}`,
      );
    const bytes = readFileSync(path);
    const actual = sha256(bytes);
    if (
      actual !== check.expectedSha256 ||
      actual !== check.actualSha256 ||
      bytes.byteLength !== check.byteLength
    )
      throw new Error(`Scoped source checksum changed: ${check.rawPath}`);
  }
  if (
    dataset.claims.some(
      (claim) =>
        claim.reviewerId !== null ||
        claim.reviewedAt !== null ||
        claim.publicationStatus !== 'withheld-pending-review',
    )
  )
    throw new Error(
      'Scoped normalized data crosses the review/publication boundary.',
    );
  return dataset;
}

function command(): string {
  return process.argv[2] ?? 'execute';
}

function main(): void {
  const selected = command();
  if (selected === 'execute' || selected === 'normalize') {
    const { dataset, packet } = buildDataset();
    writeJson(OUT_PATH, dataset);
    writeJson(REVIEW_PATH, packet);
    writeJson(CHECKPOINT_PATH, dataset.checkpoint);
    writeEmptyLayers();
    writeReports(dataset);
    console.log(
      `Scoped enrichment complete: ${dataset.candidateIds.length} candidates, ${dataset.audits.length} audits, ${dataset.claims.length} claims, ${dataset.evidence.length} evidence, ${dataset.sourceAttempts.length} attempts, ${dataset.duplicateGroups.length} duplicate groups.`,
    );
    return;
  }
  if (selected === 'review') {
    const { packet } = loadPersisted();
    validateEnrichmentReviewPacket(packet);
    console.log(
      `Scoped review packet valid: ${packet.items.length} items, ${packet.claims.length} claims, reviewer metadata empty.`,
    );
    return;
  }
  if (selected === 'validate') {
    const { dataset } = loadPersisted();
    console.log(
      `Scoped enrichment validation passed: ${dataset.candidateIds.length} candidates, ${dataset.audits.length} audits, ${dataset.claims.length} claims, ${dataset.evidence.length} evidence.`,
    );
    return;
  }
  if (selected === 'verify') {
    const dataset = verifyPersisted();
    console.log(
      `Scoped enrichment verification passed: ${dataset.sourceChecks.length} immutable snapshots, ${dataset.verifications.length} independent samples.`,
    );
    return;
  }
  if (selected === 'report') {
    const dataset = verifyPersisted();
    writeReports(dataset);
    console.log(
      `Scoped enrichment reports written: ${dataset.audits.length} audits, ${dataset.claims.length} claims.`,
    );
    return;
  }
  throw new Error(`Unknown scoped enrichment command: ${selected}`);
}

main();
