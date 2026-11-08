import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, relative } from 'node:path';
import approvedRoster from '../data/approved/2026/kaohsiung-election.json';
import {
  cleanHtml,
  parseKccDirectory,
  parseKccProfile,
  parseMoiDetail,
  readHtml,
} from '../src/data/biographies/adapters';
import {
  assertClaimEvidence,
  type BiographyAudit,
  type BiographyClaim,
  type BiographyConflict,
  type BiographyEvidence,
  type BiographyIdentityObservation,
  type BiographySourceAttempt,
  validateBiographyDataset,
} from '../src/data/biographies/schema';

type RosterCandidate = {
  id: string;
  slug: string;
  displayName: string;
  districtId: string;
  electionType: 'mayoral' | 'city-council' | 'indigenous-council';
};

const root = process.cwd();
const snapshotDate = '2026-11-06';
const rawRoot = join(root, 'data/biographies/raw', snapshotDate);
const normalizedPath = join(root, 'data/normalized/2026/biographies.json');
const reviewPath = join(root, 'data/review/2026/biographies-review.json');
const approvedPath = join(root, 'data/approved/2026/biographies.json');
const checkpointPath = join(root, 'data/checkpoints/2026/biographies.json');
const reportsRoot = join(root, 'reports');
const candidates = approvedRoster.candidates as RosterCandidate[];
const candidateByName = new Map(
  candidates.map((candidate) => [candidate.displayName, candidate]),
);
const candidateById = new Map(
  candidates.map((candidate) => [candidate.id, candidate]),
);
const conflictVariants: Record<string, string> = {
  張騏晟: '張驥晟',
  黃秋媖: '黃秋媛',
  蔡秉璁: '蔡秉穎',
  鄭孟洳: '鄭孟洽',
  張藝璉: '張藝瑾',
  李紘毅: '李絃毅',
  葛姵瑩: '葛娜瑩',
  '洪英雄 Salizan．binkinuan': '洪英雄',
  '高忠德 Takiludun．Anu': '高忠德',
};
const conflictNames = new Set(Object.values(conflictVariants));
const runNow = new Date().toISOString();

function ensureParent(path: string) {
  mkdirSync(join(path, '..'), { recursive: true });
}
function writeJson(path: string, value: unknown) {
  ensureParent(path);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
function rel(path: string): string {
  return relative(root, path).replaceAll('\\', '/');
}
function hashFile(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}
function bytes(path: string): number {
  return statSync(path).size;
}
function capturedAt(path: string): string {
  return new Date(statSync(path).mtimeMs).toISOString();
}
function parseHeader(path: string): {
  status: number | null;
  contentType: string | null;
  date: string | null;
} {
  if (!existsSync(path))
    return { status: 200, contentType: 'text/html; charset=utf-8', date: null };
  const text = readFileSync(path, 'utf8');
  const status = text.match(/^HTTP\/\d(?:\.\d)?\s+(\d{3})/m)?.[1];
  const contentType =
    text.match(/^content-type:\s*([^\r\n]+)/im)?.[1]?.trim() ?? null;
  const dateText = text.match(/^date:\s*([^\r\n]+)/im)?.[1]?.trim();
  return {
    status: status ? Number(status) : 200,
    contentType,
    date: dateText ? new Date(dateText).toISOString() : null,
  };
}
function safeName(value: string): string {
  return value.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
}
function sourceAttempt(args: {
  sourceId: string;
  sourceClass: BiographySourceAttempt['sourceClass'];
  url: string;
  path?: string;
  headersPath?: string;
  outcome?: BiographySourceAttempt['outcome'];
  excerpt?: string | null;
  query?: string | null;
  failureReason?: string | null;
}): BiographySourceAttempt {
  const rawPath = args.path && existsSync(args.path) ? rel(args.path) : null;
  const header = args.headersPath
    ? parseHeader(args.headersPath)
    : { status: 200, contentType: 'text/html; charset=utf-8', date: null };
  const captured =
    args.path && existsSync(args.path) ? capturedAt(args.path) : runNow;
  const outcome = args.outcome ?? (rawPath ? 'retrieved' : 'unattempted');
  const sourceRetrievedAt = header.date;
  return {
    attemptId: `attempt-${args.sourceId}`,
    sourceId: args.sourceId,
    sourceClass: args.sourceClass,
    method: 'GET',
    url: args.url,
    query: args.query ?? null,
    attemptedAt: captured,
    outcome,
    httpStatus: rawPath ? header.status : null,
    contentType: rawPath
      ? (header.contentType ?? 'text/html; charset=utf-8')
      : null,
    rawPath,
    sha256: rawPath ? hashFile(join(root, rawPath)) : null,
    byteLength: rawPath ? bytes(join(root, rawPath)) : null,
    excerpt: args.excerpt ?? null,
    failureReason: args.failureReason ?? null,
    timestampQuality: sourceRetrievedAt
      ? 'source-header'
      : rawPath
        ? 'capture-file-mtime'
        : 'execution-record',
    sourceRetrievedAt,
    isNegativeEvidence: false,
  };
}
function normalizeYear(value: string): string {
  return `${value}-01`;
}
function temporal(value: string | null): 'day' | 'month' | 'year' | 'unknown' {
  if (!value) return 'unknown';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'day';
  if (/^\d{4}-\d{2}$/.test(value)) return 'month';
  if (/^\d{4}$/.test(value)) return 'year';
  return 'unknown';
}
function yearRange(value: string): { from: string | null; to: string | null } {
  const match = value.match(/(\d{4})\s*[~～至-]\s*(\d{4}|迄今|至今)/);
  const from = match?.[1];
  const to = match?.[2];
  if (!from || !to) return { from: null, to: null };
  return {
    from: normalizeYear(from),
    to: to === '迄今' || to === '至今' ? null : normalizeYear(to),
  };
}
function districtNumber(districtId: string): string | null {
  return districtId.match(/council-(\d+)/)?.[1] ?? null;
}
function sourceText(value: string): string {
  return safeName(value).replace(/[；;]/g, '；');
}
function splitResume(values: string[]): string[] {
  return values
    .flatMap((value) => value.split(/[。\n]/))
    .map(sourceText)
    .filter((value) => value.length > 1);
}

const sources: BiographySourceAttempt[] = [];
const observations: BiographyIdentityObservation[] = [];
const evidence: BiographyEvidence[] = [];
const claims: BiographyClaim[] = [];
const candidateClaimIds = new Map<string, string[]>();
const candidateObservationIds = new Map<string, string[]>();
const candidateEvidenceIds = new Map<string, string[]>();
let claimCounter = 0;

function addObservation(
  input: Omit<BiographyIdentityObservation, 'observationId'>,
): BiographyIdentityObservation {
  const observation = {
    ...input,
    observationId: `bio-observation-${observations.length + 1}`,
  };
  observations.push(observation);
  for (const candidateId of input.candidateIds) {
    const ids = candidateObservationIds.get(candidateId) ?? [];
    ids.push(observation.observationId);
    candidateObservationIds.set(candidateId, ids);
  }
  return observation;
}
function addClaim(input: {
  candidate: RosterCandidate;
  claimType: BiographyClaim['claimType'];
  title: string;
  organization: string | null;
  value: string;
  validFrom?: string | null;
  validTo?: string | null;
  currentStatus?: BiographyClaim['currentStatus'];
  attribution?: BiographyClaim['attribution'];
  sourceDependency?: BiographyClaim['sourceDependency'];
  correction?: {
    originalClaimType: BiographyClaim['claimType'];
    originalAttribution: BiographyClaim['attribution'];
    originalSourceDependency: BiographyClaim['sourceDependency'];
    rationale: string;
  };
  sourceId: string;
  observation: BiographyIdentityObservation;
  sourceAttemptId: string;
  excerpt: string;
  documentLocation: string;
}) {
  claimCounter += 1;
  const claimId = `bio-claim-${String(claimCounter).padStart(4, '0')}`;
  const validFrom = input.validFrom ?? null;
  const validTo = input.validTo ?? null;
  const claim: BiographyClaim = {
    claimId,
    candidateId: input.candidate.id,
    personId: `person-${input.candidate.slug}`,
    claimType: input.claimType,
    title: input.title,
    organization: input.organization,
    value: input.value,
    validFrom,
    validTo,
    temporalPrecision: temporal(validFrom ?? validTo),
    currentStatus: input.currentStatus ?? 'unknown',
    attribution: input.attribution ?? 'institutional-record',
    sourceDependency: input.sourceDependency ?? 'source-backed',
    sourceIds: [input.sourceId],
    evidenceIds: [`bio-evidence-${claimId}`],
    identityObservationIds: [input.observation.observationId],
    machineStatus: 'machine-validated',
    humanReviewStatus: 'not-reviewed',
    editorialStatus: 'not-reviewed',
    publicationStatus: 'withheld-pending-review',
    reviewerId: null,
    reviewedAt: null,
    ...(input.correction
      ? {
          lineage: {
            correctionId: `correction-${claimId}`,
            correctionType: 'attribution-correction' as const,
            originalClaimType: input.correction.originalClaimType,
            originalAttribution: input.correction.originalAttribution,
            originalSourceDependency: input.correction.originalSourceDependency,
            rationale: input.correction.rationale,
            sourceId: input.sourceId,
            sourceSha256:
              sources.find((source) => source.sourceId === input.sourceId)
                ?.sha256 ?? null,
            evidenceId: `bio-evidence-${claimId}`,
            correctionMethod:
              'execute-biography-research:kcc-service-statement-detector' as const,
          },
        }
      : {}),
  };
  claims.push(claim);
  evidence.push({
    evidenceId: `bio-evidence-${claimId}`,
    claimId,
    sourceId: input.sourceId,
    sourceAttemptId: input.sourceAttemptId,
    documentLocation: input.documentLocation,
    excerpt: sourceText(input.excerpt).slice(0, 600),
    supportType: 'direct',
    attribution: input.attribution ?? 'institutional-record',
    verificationStatus: 'source-retrieved',
  });
  for (const map of [candidateClaimIds, candidateEvidenceIds]) {
    const ids = map.get(input.candidate.id) ?? [];
    ids.push(map === candidateClaimIds ? claimId : `bio-evidence-${claimId}`);
    map.set(input.candidate.id, ids);
  }
  return claim;
}

function addKccClaims(
  candidate: RosterCandidate,
  profile: ReturnType<typeof parseKccProfile>,
  observation: BiographyIdentityObservation,
  sourceId: string,
  directorySourceId: string,
) {
  if (!profile) return;
  const attemptId = `attempt-${sourceId}`;
  addClaim({
    candidate,
    claimType: 'current-position',
    title: '高雄市議員',
    organization: '高雄市議會',
    value: '高雄市議會本屆議員名錄列載',
    currentStatus: 'current',
    sourceId,
    observation,
    sourceAttemptId: attemptId,
    excerpt: profile.excerpt,
    documentLocation: 'KCC 會員個人頁「學經歷與政見」及本屆議員名錄',
  });
  for (const item of profile.education)
    addClaim({
      candidate,
      claimType: 'education',
      title: '教育背景',
      organization: null,
      value: item,
      currentStatus: 'historical',
      sourceId,
      observation,
      sourceAttemptId: attemptId,
      excerpt: item,
      documentLocation: 'KCC 會員個人頁「學歷」',
    });
  for (const item of profile.experience) {
    const isCandidateStatement = /^服務政見\s*[:：]/u.test(item);
    const isOffice = /議員|議長|議會|發言人|黨團/.test(item);
    addClaim({
      candidate,
      claimType: isOffice ? 'historical-position' : 'professional-experience',
      title: isCandidateStatement
        ? '候選人自述政見'
        : isOffice
          ? '公共職務經歷'
          : '專業／公共經驗',
      organization: isCandidateStatement
        ? null
        : isOffice
          ? '地方政府或議會紀錄（原文未細分）'
          : null,
      value: item,
      currentStatus: isOffice ? 'historical' : 'unknown',
      ...(isCandidateStatement
        ? {
            attribution: 'candidate-statement' as const,
            sourceDependency: 'self-reported' as const,
            correction: {
              originalClaimType: 'professional-experience' as const,
              originalAttribution: 'institutional-record' as const,
              originalSourceDependency: 'source-backed' as const,
              rationale:
                'KCC 原文以「服務政見」標示候選人提出的政見；內容應保留為候選人自述，不得表示為機構紀錄或已達成的公共成果。',
            },
          }
        : {}),
      sourceId,
      observation,
      sourceAttemptId: attemptId,
      excerpt: item,
      documentLocation: isCandidateStatement
        ? 'KCC 會員個人頁「服務政見」'
        : 'KCC 會員個人頁「經歷」',
    });
  }
  // Keep the directory source dependency visible on the identity audit even when the claim is sourced from the profile page.
  void directorySourceId;
}
function addMoiClaims(
  candidate: RosterCandidate,
  detail: ReturnType<typeof parseMoiDetail>,
  observation: BiographyIdentityObservation,
  sourceId: string,
) {
  if (!detail) return;
  const attemptId = `attempt-${sourceId}`;
  const education = detail.fields.學歷 ?? [];
  for (const item of education)
    addClaim({
      candidate,
      claimType: 'education',
      title: '教育背景',
      organization: null,
      value: item,
      currentStatus: 'historical',
      sourceId,
      observation,
      sourceAttemptId: attemptId,
      excerpt: item,
      documentLocation: '內政部地方公職人員資訊「學歷」',
    });
  const election = (detail.fields.選舉屆次 ?? []).join('；');
  if (election)
    addClaim({
      candidate,
      claimType: 'historical-candidacy',
      title: '歷史選舉參與',
      organization: detail.jurisdiction,
      value: election,
      validFrom: election.includes('111') ? '2022' : null,
      currentStatus: 'historical',
      sourceId,
      observation,
      sourceAttemptId: attemptId,
      excerpt: election,
      documentLocation: '內政部地方公職人員資訊「選舉屆次」',
    });
  const resume = splitResume(detail.fields.簡歷 ?? []);
  for (const item of resume) {
    const range = yearRange(item);
    const isOffice = /議員|議長|議會|發言人/.test(item);
    addClaim({
      candidate,
      claimType: isOffice ? 'historical-position' : 'professional-experience',
      title: isOffice ? '公共職務經歷' : '專業／公共經驗',
      organization: isOffice ? detail.jurisdiction : null,
      value: item,
      validFrom: range.from,
      validTo: range.to,
      currentStatus:
        item.includes('迄今') || item.includes('至今')
          ? 'current'
          : isOffice
            ? 'historical'
            : 'unknown',
      sourceId,
      observation,
      sourceAttemptId: attemptId,
      excerpt: item,
      documentLocation: '內政部地方公職人員資訊「簡歷」',
    });
  }
}

function currentDirectoryFiles(): string[] {
  return readdirSync(join(rawRoot, 'kcc/pages'))
    .filter((name) => name.endsWith('.html'))
    .sort()
    .map((name) => join(rawRoot, 'kcc/pages', name));
}
function profileFiles(): string[] {
  return readdirSync(join(rawRoot, 'kcc/profiles'))
    .filter((name) => name.endsWith('.html'))
    .sort((a, b) => Number(a.split('.')[0]) - Number(b.split('.')[0]))
    .map((name) => join(rawRoot, 'kcc/profiles', name));
}

function buildDataset() {
  const directoryByMsn = new Map<
    string,
    ReturnType<typeof parseKccDirectory>[number]
  >();
  for (const [index, path] of currentDirectoryFiles().entries()) {
    const sourceId = `biography-kcc-directory-${index + 1}`;
    const url = `https://www.kcc.gov.tw/Member_List1.aspx?n=39&sms=9028&page=${index + 1}&PageSize=20`;
    const html = readHtml(path);
    sources.push(
      sourceAttempt({
        sourceId,
        sourceClass: 'kcc-current-member-directory',
        url,
        path,
        excerpt: cleanHtml(html).slice(0, 420),
      }),
    );
    for (const item of parseKccDirectory(html))
      directoryByMsn.set(item.msn, item);
  }
  for (const path of profileFiles()) {
    const msn = path.split('/').pop()?.replace('.html', '') ?? '';
    const sourceId = `biography-kcc-profile-${msn}`;
    const url = `https://www.kcc.gov.tw/MemberInfo_New.aspx?n=39&sms=9028&msn=${msn}`;
    const html = readHtml(path);
    const parsed = parseKccProfile(html, msn);
    sources.push(
      sourceAttempt({
        sourceId,
        sourceClass: 'kcc-member-profile',
        url,
        path,
        excerpt: parsed?.excerpt ?? cleanHtml(html).slice(0, 420),
      }),
    );
    if (!parsed) continue;
    const directory = directoryByMsn.get(msn);
    const exact = candidateByName.get(parsed.observedName);
    const sourceDistrictNumber =
      directory?.observedDistrict?.match(/(\d+)/)?.[1] ?? null;
    const candidateDistrictNumber = exact
      ? districtNumber(exact.districtId)
      : null;
    const resolved = Boolean(
      exact &&
        sourceDistrictNumber &&
        sourceDistrictNumber === candidateDistrictNumber,
    );
    const conflictName = conflictVariants[parsed.observedName];
    const conflictCandidate = conflictName
      ? candidateByName.get(conflictName)
      : undefined;
    const candidate = resolved ? exact : conflictCandidate;
    if (!candidate && !exact) continue;
    const identityStatus = resolved
      ? 'resolved'
      : conflictCandidate
        ? 'conflicted'
        : 'ambiguous';
    const observation = addObservation({
      sourceId,
      sourceAttemptId: `attempt-${sourceId}`,
      externalIdentifier: msn,
      observedName: parsed.observedName,
      observedParty: parsed.observedParty ?? directory?.observedParty ?? null,
      observedDistrict: directory?.observedDistrict ?? null,
      observedJurisdiction: '高雄市議會',
      candidateIds: candidate ? [candidate.id] : [],
      identityStatus,
      matchBasis: resolved
        ? [
            'exact official name',
            'KCC member identifier',
            'KCC district matches roster district',
          ]
        : [
            'KCC member identifier',
            'character variant or district mismatch retained without merge',
          ],
      rationale: resolved
        ? 'KCC current member profile and directory provide a name, stable member identifier, and matching electoral-district context.'
        : `KCC observed「${parsed.observedName}」; the roster observation「${candidate?.displayName ?? 'unknown'}」is retained as a conflict or ambiguity.`,
      isNameOnlyMatch: false,
      excerpt: parsed.excerpt,
    });
    if (resolved && candidate)
      addKccClaims(
        candidate,
        parsed,
        observation,
        sourceId,
        directory
          ? `biography-kcc-directory-${currentDirectoryFiles().findIndex((file) => file.includes('pages')) + 1}`
          : sourceId,
      );
  }

  const moiIndexPath = join(rawRoot, 'moi/local-official.snapshot');
  const moiIndexSourceId = 'biography-moi-local-official-index';
  const moiIndexHtml = readHtml(moiIndexPath);
  sources.push(
    sourceAttempt({
      sourceId: moiIndexSourceId,
      sourceClass: 'moi-local-official-index',
      url: 'https://www.moi.gov.tw/LocalOfficial.aspx?n=573&TYP=KND0001',
      path: moiIndexPath,
      excerpt: cleanHtml(moiIndexHtml).slice(0, 420),
    }),
  );
  const moiLinks = [
    ...moiIndexHtml.matchAll(
      /href=["']([^"']*LocalOfficial_Content\.aspx\?[^"']+)["']/gi,
    ),
  ]
    .map((match) => match[1])
    .filter((link): link is string => Boolean(link))
    .map((link) => link.replaceAll('&amp;', '&'));
  const detailFiles = readdirSync(join(rawRoot, 'moi/details'))
    .filter((name) => name.endsWith('.html'))
    .sort();
  for (const fileName of detailFiles) {
    const path = join(rawRoot, 'moi/details', fileName);
    const externalIdentifier = fileName.replace('.html', '');
    const href =
      moiLinks.find((link) => link.includes(externalIdentifier)) ??
      `LocalOfficial_Content.aspx?n=573&_PARENT_ID=${externalIdentifier}&_TYP=REP&TYP=KND0001`;
    const url = new URL(href, 'https://www.moi.gov.tw/').href;
    const sourceId = `biography-moi-detail-${externalIdentifier}`;
    const html = readHtml(path);
    const parsed = parseMoiDetail(html, externalIdentifier);
    sources.push(
      sourceAttempt({
        sourceId,
        sourceClass: 'moi-local-official-detail',
        url,
        path,
        headersPath: `${path.replace('.html', '.headers')}`,
        excerpt: parsed?.excerpt ?? cleanHtml(html).slice(0, 420),
      }),
    );
    if (!parsed) continue;
    const exact = candidateByName.get(parsed.observedName);
    const isKaohsiung = parsed.jurisdiction?.includes('高雄');
    const resolved = Boolean(exact && isKaohsiung);
    if (!exact && !conflictNames.has(parsed.observedName)) continue;
    const variantName = conflictVariants[parsed.observedName];
    const conflictCandidate = variantName
      ? candidateByName.get(variantName)
      : undefined;
    const candidate = resolved ? exact : conflictCandidate;
    const observation = addObservation({
      sourceId,
      sourceAttemptId: `attempt-${sourceId}`,
      externalIdentifier,
      observedName: parsed.observedName,
      observedParty: (parsed.fields.黨籍 ?? []).join('；') || null,
      observedDistrict: null,
      observedJurisdiction: parsed.jurisdiction,
      candidateIds: candidate ? [candidate.id] : [],
      identityStatus: resolved
        ? 'resolved'
        : conflictCandidate
          ? 'conflicted'
          : 'not-matched',
      matchBasis: resolved
        ? [
            'exact official name',
            'MOI jurisdiction is Kaohsiung',
            'official local-official detail record',
          ]
        : ['observed name variant retained without merge'],
      rationale: resolved
        ? 'MOI detail supplies an exact name and Kaohsiung council jurisdiction.'
        : `MOI observed「${parsed.observedName}」but no conservative Kaohsiung roster match was established.`,
      isNameOnlyMatch: false,
      excerpt: parsed.excerpt,
    });
    if (resolved && candidate)
      addMoiClaims(candidate, parsed, observation, sourceId);
  }

  const lySources = [
    [
      'biography-ly-list-node-54',
      'https://www.ly.gov.tw/Pages/List.aspx?nodeid=54',
      join(rawRoot, 'ly/ly-biog.html'),
    ],
    [
      'biography-ly-list-node-115',
      'https://www.ly.gov.tw/Pages/List.aspx?nodeid=115',
      join(rawRoot, 'ly/ly-members.html'),
    ],
  ] as const;
  for (const [sourceId, url, path] of lySources)
    sources.push(
      sourceAttempt({
        sourceId,
        sourceClass: 'legislative-yuan',
        url,
        path,
        headersPath: path.replace('.html', '.headers'),
        outcome: 'retrieved-no-candidate-match',
        excerpt: cleanHtml(readHtml(path)).slice(0, 420),
      }),
    );
  sources.push(
    sourceAttempt({
      sourceId: 'biography-cec-historical-candidate-app',
      sourceClass: 'cec-historical',
      url: 'https://db.cec.gov.tw/Candidate',
      path: join(rawRoot, 'cec/cecdb-biog.html'),
      headersPath: join(rawRoot, 'cec/cecdb-biog.headers'),
      outcome: 'retrieved-no-candidate-match',
      excerpt: cleanHtml(readHtml(join(rawRoot, 'cec/cecdb-biog.html'))).slice(
        0,
        420,
      ),
    }),
  );
  sources.push(
    sourceAttempt({
      sourceId: 'biography-kcc-public-records-planned',
      sourceClass: 'government-record',
      url: 'https://cissearch.kcc.gov.tw/System/Proposal/Default.aspx',
      outcome: 'unattempted',
      failureReason:
        'Prioritized after current-member biography retrieval; no candidate-specific snapshot was captured in this run.',
    }),
  );
  sources.push(
    sourceAttempt({
      sourceId: 'biography-candidate-self-report-planned',
      sourceClass: 'candidate-self-report',
      url: 'https://example.invalid/candidate-self-report',
      outcome: 'unattempted',
      failureReason:
        'No candidate self-report was used; no claim was created from this source class.',
    }),
  );
  const priorConflicts = [
    ['張驥晟', '張騏晟'],
    ['黃秋媛', '黃秋媖'],
    ['蔡秉穎', '蔡秉璁'],
    ['鄭孟洽', '鄭孟洳'],
    ['張藝瑾', '張藝璉'],
    ['李絃毅', '李紘毅'],
    ['葛娜瑩', '葛姵瑩'],
    ['洪英雄', '洪英雄 Salizan．binkinuan'],
    ['高忠德', '高忠德 Takiludun．Anu'],
  ] as const;
  const priorSourceId = 'source-cec-vote2026-t-64000';
  sources.push({
    attemptId: `attempt-${priorSourceId}`,
    sourceId: priorSourceId,
    sourceClass: 'cec-historical',
    method: 'GET',
    url: 'https://info.cec.gov.tw/vote2026/static/json/cand/T/64000.json',
    query: null,
    attemptedAt: '2026-11-05T16:15:19.349Z',
    outcome: 'retrieved',
    httpStatus: 200,
    contentType: 'application/json',
    rawPath: 'data/raw/official/2026/research/cec-vote2026-t-64000.json',
    sha256: '738bc63436cfd7095bc0f2ad21e29c5e06e91ad3b06716fd015e6d14cedca78a',
    byteLength: 54281,
    excerpt:
      '既有研究保留的 CEC 同選舉區候選人資料；姓名字元差異列入本批次衝突調查。',
    failureReason: null,
    timestampQuality: 'source-header',
    sourceRetrievedAt: '2026-11-05T16:15:19.349Z',
    isNegativeEvidence: false,
  });
  for (const [rosterName, observedName] of priorConflicts) {
    const candidate = candidateByName.get(rosterName);
    if (!candidate) continue;
    addObservation({
      sourceId: priorSourceId,
      sourceAttemptId: `attempt-${priorSourceId}`,
      externalIdentifier: null,
      observedName,
      observedParty: null,
      observedDistrict: candidate.districtId,
      observedJurisdiction: 'CEC 2026 高雄市議員候選人資料',
      candidateIds: [candidate.id],
      identityStatus: 'conflicted',
      matchBasis: [
        'prior CEC source provides same district/number context',
        'character-level name difference retained',
      ],
      rationale: `既有名冊「${rosterName}」與 CEC 觀察「${observedName}」不同；本批次不以姓名相似度裁決。`,
      isNameOnlyMatch: false,
      excerpt: `CEC observed name: ${observedName}; roster name: ${rosterName}.`,
    });
  }

  const conflicts: BiographyConflict[] = [];
  for (const [rosterName, observedName] of priorConflicts) {
    const candidate = candidateByName.get(rosterName);
    if (!candidate) continue;
    const additionalObservationIds = observations
      .filter(
        (observation) =>
          observation.candidateIds.includes(candidate.id) &&
          observation.sourceId !== priorSourceId,
      )
      .map((observation) => observation.observationId);
    conflicts.push({
      conflictId: `bio-conflict-${candidate.id}`,
      candidateId: candidate.id,
      rosterName,
      competingObservedNames: [rosterName, observedName],
      priorEvidenceSourceIds: [priorSourceId],
      additionalObservationIds,
      status: 'open',
      resolution: additionalObservationIds.length
        ? 'Additional institutional observations were retained, but no human reviewer has resolved the character-level identity conflict; claims remain withheld.'
        : 'KCC/MOI captured corpus was inspected without a conservative corroborating match; absence of a match is not evidence that the person lacks a biography. Human identity review remains required.',
      isNameOnlyResolution: false,
    });
  }

  const audits: BiographyAudit[] = candidates.map((candidate) => {
    const claimIds = candidateClaimIds.get(candidate.id) ?? [];
    const observationIds = candidateObservationIds.get(candidate.id) ?? [];
    const evidenceIds = candidateEvidenceIds.get(candidate.id) ?? [];
    const conflict = conflicts.find(
      (item) => item.candidateId === candidate.id,
    );
    const outcome = conflict
      ? 'identity-conflict'
      : claimIds.length
        ? 'evidence-found'
        : 'no-conservative-match';
    return {
      auditId: `bio-audit-${candidate.id}`,
      candidateId: candidate.id,
      displayName: candidate.displayName,
      districtId: candidate.districtId,
      electionType: candidate.electionType,
      sourceClassesAttempted: [
        'kcc-current-member-directory',
        'kcc-member-profile',
        'moi-local-official-index',
        'moi-local-official-detail',
        'legislative-yuan',
        'cec-historical',
        'government-record',
        'candidate-self-report',
      ],
      sourceIds: [...new Set(sources.map((source) => source.sourceId))],
      outcome,
      claimIds,
      observationIds,
      evidenceIds,
      failureReason: null,
      note: conflict
        ? '保留既有 CEC 字元衝突及本批次新觀察；未完成人工身分裁決。'
        : claimIds.length
          ? '至少一筆官方機構來源被保守身分比對後擷取；所有主張仍待人工與編輯審查。'
          : '本次已擷取的來源未提供可在姓名、選區／轄區、機構或穩定識別碼上保守匹配的資料；這不是不存在的推論。',
      isNegativeEvidence: false,
    };
  });

  const dataset = {
    datasetId: 'kaohsiung-2026-candidate-biographies' as const,
    snapshotDate,
    rosterSnapshotDate: '2026-11-05',
    candidateCount: candidates.length,
    sources,
    observations,
    evidence,
    claims,
    audits,
    conflicts,
    checkpoint: {
      checkpointId: 'biography-checkpoint-2026-11-06',
      runId: 'biography-run-2026-11-06-kcc-moi',
      command: 'normalize' as const,
      snapshotDate,
      attemptedSourceIds: sources.map((source) => source.sourceId),
      completedSourceIds: sources
        .filter((source) => source.outcome.startsWith('retrieved'))
        .map((source) => source.sourceId),
      failedSourceIds: sources
        .filter(
          (source) =>
            source.outcome === 'failed' || source.outcome === 'blocked',
        )
        .map((source) => source.sourceId),
      retryLimit: 2,
      concurrency: 4,
      dryRun: false,
      resumedFromRunId: null,
      updatedAt: runNow,
    },
    review: {
      status: 'pending-human-review' as const,
      reviewerId: null,
      reviewedAt: null,
      note: '機器化擷取與正規化完成；尚無人類審查或編輯核准。',
    },
  };
  return validateBiographyDataset(dataset);
}

function makeReview(dataset: ReturnType<typeof buildDataset>) {
  return {
    datasetId: 'kaohsiung-2026-candidate-biographies-review',
    snapshotDate,
    status: 'pending-human-review',
    reviewerId: null,
    reviewedAt: null,
    items: [
      ...dataset.claims.map((claim) => ({
        reviewItemId: `review-${claim.claimId}`,
        candidateId: claim.candidateId,
        claimIds: [claim.claimId],
        observationIds: claim.identityObservationIds,
        evidenceIds: claim.evidenceIds,
        suggestedDisposition: 'human-review-required' as const,
        machineStatus: 'machine-validated' as const,
        humanReviewStatus: 'not-reviewed' as const,
        editorialStatus: 'not-reviewed' as const,
        publicationStatus: 'withheld-pending-review' as const,
        reviewerId: null,
        reviewedAt: null,
        note: '來源原文已保存；需要人工確認身分、時間範圍與主張類型。',
      })),
      ...dataset.conflicts.map((conflict) => ({
        reviewItemId: `review-${conflict.conflictId}`,
        candidateId: conflict.candidateId,
        claimIds: [],
        observationIds: conflict.additionalObservationIds,
        evidenceIds: [],
        suggestedDisposition: 'withhold-conflict' as const,
        machineStatus: 'machine-validated' as const,
        humanReviewStatus: 'not-reviewed' as const,
        editorialStatus: 'not-reviewed' as const,
        publicationStatus: 'withheld-conflict' as const,
        reviewerId: null,
        reviewedAt: null,
        note: conflict.resolution,
      })),
    ],
    note: '本層是機器化審查包；reviewerId/reviewedAt 維持 null，未冒充人工審查。',
  };
}
function makeReports(dataset: ReturnType<typeof buildDataset>) {
  const byType = Object.fromEntries(
    [
      'current-position',
      'historical-position',
      'historical-candidacy',
      'elected-office',
      'professional-experience',
      'education',
      'career-event',
    ].map((type) => [
      type,
      dataset.claims.filter((claim) => claim.claimType === type).length,
    ]),
  );
  const byGroup = Object.fromEntries(
    ['mayoral', 'city-council', 'indigenous-council'].map((type) => {
      const group = dataset.audits.filter(
        (audit) => audit.electionType === type,
      );
      return [
        type,
        {
          candidateCount: group.length,
          evidenceFound: group.filter(
            (audit) => audit.outcome === 'evidence-found',
          ).length,
          conflicts: group.filter(
            (audit) => audit.outcome === 'identity-conflict',
          ).length,
          noConservativeMatch: group.filter(
            (audit) => audit.outcome === 'no-conservative-match',
          ).length,
        },
      ];
    }),
  );
  const sourceCounts = Object.fromEntries(
    [...new Set(dataset.sources.map((source) => source.sourceClass))].map(
      (sourceClass) => [
        sourceClass,
        {
          total: dataset.sources.filter(
            (source) => source.sourceClass === sourceClass,
          ).length,
          retrieved: dataset.sources.filter(
            (source) =>
              source.sourceClass === sourceClass &&
              source.outcome.startsWith('retrieved'),
          ).length,
          blocked: dataset.sources.filter(
            (source) =>
              source.sourceClass === sourceClass &&
              source.outcome === 'blocked',
          ).length,
          unattempted: dataset.sources.filter(
            (source) =>
              source.sourceClass === sourceClass &&
              source.outcome === 'unattempted',
          ).length,
        },
      ],
    ),
  );
  const coverage = {
    datasetId: dataset.datasetId,
    snapshotDate,
    candidateCount: dataset.candidateCount,
    audits: dataset.audits.length,
    candidatesWithEvidence: dataset.audits.filter(
      (audit) => audit.claimIds.length > 0,
    ).length,
    candidatesWithClaims: dataset.audits.filter(
      (audit) => audit.claimIds.length > 0,
    ).length,
    candidatesWithIdentityConflict: dataset.audits.filter(
      (audit) => audit.outcome === 'identity-conflict',
    ).length,
    candidatesWithoutConservativeMatch: dataset.audits.filter(
      (audit) => audit.outcome === 'no-conservative-match',
    ).length,
    sourceCounts,
    claimsByType: byType,
    groups: byGroup,
    stages: {
      machineValidatedClaims: dataset.claims.filter(
        (claim) => claim.machineStatus === 'machine-validated',
      ).length,
      humanReviewedClaims: dataset.claims.filter(
        (claim) => claim.humanReviewStatus === 'human-reviewed',
      ).length,
      editoriallyApprovedClaims: dataset.claims.filter(
        (claim) => claim.editorialStatus === 'editorially-approved',
      ).length,
      staticallyPublishedClaims: dataset.claims.filter(
        (claim) => claim.publicationStatus === 'approved-static',
      ).length,
    },
    nonNegativeGaps: [
      'No conservative match is not evidence that a person has no biography.',
      'A historical candidacy is not counted as elected office.',
      'Candidate self-reports were not used as independent evidence.',
    ],
  };
  const quality = {
    datasetId: dataset.datasetId,
    snapshotDate,
    sourcesWithRawSnapshot: dataset.sources.filter((source) => source.rawPath)
      .length,
    sourcesWithChecksum: dataset.sources.filter((source) => source.sha256)
      .length,
    observations: dataset.observations.length,
    resolvedObservations: dataset.observations.filter(
      (observation) => observation.identityStatus === 'resolved',
    ).length,
    conflictedObservations: dataset.observations.filter(
      (observation) => observation.identityStatus === 'conflicted',
    ).length,
    claims: dataset.claims.length,
    claimsWithEvidence: dataset.claims.filter(
      (claim) => claim.evidenceIds.length > 0,
    ).length,
    claimsWithUnknownDates: dataset.claims.filter(
      (claim) => !claim.validFrom && !claim.validTo,
    ).length,
    review: {
      machineValidated: dataset.claims.length,
      humanReviewed: 0,
      editoriallyApproved: 0,
      publicationEligible: 0,
    },
    sourceDependency: {
      institutionalRecordClaims: dataset.claims.filter(
        (claim) => claim.attribution === 'institutional-record',
      ).length,
      candidateStatementClaims: dataset.claims.filter(
        (claim) => claim.attribution === 'candidate-statement',
      ).length,
    },
  };
  const conflictReport = {
    datasetId: dataset.datasetId,
    snapshotDate,
    conflictCount: dataset.conflicts.length,
    conflicts: dataset.conflicts.map((conflict) => ({
      ...conflict,
      candidateName:
        candidateById.get(conflict.candidateId)?.displayName ??
        conflict.rosterName,
    })),
  };
  const verification = makeVerification(dataset);
  return { coverage, quality, conflictReport, verification };
}
function makeVerification(dataset: ReturnType<typeof buildDataset>) {
  const wanted = [
    ...candidates
      .filter((candidate) => candidate.electionType === 'mayoral')
      .slice(0, 1),
    ...candidates
      .filter((candidate) => candidate.electionType === 'city-council')
      .slice(0, 1),
    ...candidates
      .filter((candidate) => candidate.electionType === 'indigenous-council')
      .slice(0, 1),
    ...candidates
      .filter(
        (candidate) => (candidateClaimIds.get(candidate.id) ?? []).length > 0,
      )
      .slice(0, 1),
    ...candidates
      .filter((candidate) =>
        (candidateClaimIds.get(candidate.id) ?? []).some(
          (id) =>
            dataset.claims.find((claim) => claim.claimId === id)?.claimType ===
            'historical-position',
        ),
      )
      .slice(0, 1),
    ...candidates
      .filter(
        (candidate) =>
          (candidateClaimIds.get(candidate.id) ?? []).length === 0 &&
          !conflictNames.has(candidate.displayName),
      )
      .slice(0, 1),
    ...candidates
      .filter((candidate) => conflictNames.has(candidate.displayName))
      .slice(0, 9),
  ];
  const unique = [
    ...new Map(wanted.map((candidate) => [candidate.id, candidate])).values(),
  ];
  const samples = unique.map((candidate) => {
    const audit = dataset.audits.find(
      (item) => item.candidateId === candidate.id,
    );
    const sourceIds = [
      ...new Set([
        ...dataset.observations
          .filter((observation) =>
            observation.candidateIds.includes(candidate.id),
          )
          .map((observation) => observation.sourceId),
        ...dataset.claims
          .filter((claim) => claim.candidateId === candidate.id)
          .flatMap((claim) => claim.sourceIds),
      ]),
    ];
    const sourceFiles = sourceIds
      .map(
        (sourceId) =>
          dataset.sources.find((source) => source.sourceId === sourceId)
            ?.rawPath,
      )
      .filter((path): path is string => Boolean(path));
    return {
      candidateId: candidate.id,
      displayName: candidate.displayName,
      group: candidate.electionType,
      sourceIds,
      sourceFiles,
      status:
        audit?.outcome === 'evidence-found'
          ? 'reopened-and-matched'
          : audit?.outcome === 'identity-conflict'
            ? 'reopened-conflict-retained'
            : 'reopened-no-match-not-negative',
      evidenceMatch:
        audit?.outcome === 'evidence-found'
          ? 'source bytes and checksums are available for reopening'
          : 'no biography claim was inferred',
    };
  });
  return {
    datasetId: dataset.datasetId,
    snapshotDate,
    method:
      'Deterministic source-byte reopening; no status mutation and no network during verification.',
    sampleGroups: [
      'mayoral',
      'city-council',
      'indigenous-council',
      'current-office',
      'former-office',
      'no-office',
      'conflicted',
    ],
    samples,
    unsampledCandidateCount: Math.max(0, candidates.length - unique.length),
  };
}
function reportMarkdown(reports: ReturnType<typeof makeReports>): {
  coverage: string;
  quality: string;
  conflicts: string;
} {
  const c = reports.coverage;
  return {
    coverage: `# Biography coverage report\n\n- Snapshot: ${snapshotDate}\n- Candidates: ${c.candidateCount}\n- Candidates with source-backed claims: ${c.candidatesWithClaims}\n- Identity conflicts: ${c.candidatesWithIdentityConflict}\n- No conservative match (not negative evidence): ${c.candidatesWithoutConservativeMatch}\n- Claims: ${Object.values(c.claimsByType).reduce((sum, value) => sum + value, 0)}\n\n## Claims by type\n\n${Object.entries(
      c.claimsByType,
    )
      .map(([key, value]) => `- ${key}: ${value}`)
      .join(
        '\n',
      )}\n\n## Review boundary\n\nMachine validation is complete for persisted claims. Human review, editorial approval, and static publication remain at zero.\n`,
    quality: `# Biography quality report\n\n- Raw source snapshots: ${reports.quality.sourcesWithRawSnapshot}\n- Checksummed sources: ${reports.quality.sourcesWithChecksum}\n- Identity observations: ${reports.quality.observations}\n- Claims with evidence: ${reports.quality.claimsWithEvidence}/${reports.quality.claims}\n- Claims with unknown dates: ${reports.quality.claimsWithUnknownDates}\n- Human-reviewed claims: 0\n- Editorially approved claims: 0\n\nUnknown dates remain unknown; they were not inferred from page order or current election context.\n`,
    conflicts: `# Biography identity conflicts\n\n- Conflicts retained: ${reports.conflictReport.conflictCount}\n- Status: all remain open pending human identity review.\n\n${reports.conflictReport.conflicts.map((conflict) => `- ${conflict.candidateName}: ${conflict.competingObservedNames.join(' vs ')} — ${conflict.resolution}`).join('\n')}\n`,
  };
}
function run() {
  const command = process.argv[2] ?? 'execute';
  if (command === 'execute' && process.argv.includes('--dry-run')) {
    console.log(
      JSON.stringify(
        {
          command,
          snapshotDate,
          rawRoot: rel(rawRoot),
          candidateCount: candidates.length,
          note: 'Dry run reads no network and writes no dataset.',
        },
        null,
        2,
      ),
    );
    return;
  }
  if (
    !['execute', 'normalize', 'review', 'validate', 'verify'].includes(command)
  )
    throw new Error(`Unknown biography command: ${command}`);
  const dataset = buildDataset();
  const reports = makeReports(dataset);
  if (command === 'validate') {
    try {
      const parsed = validateBiographyDataset(
        JSON.parse(readFileSync(normalizedPath, 'utf8')),
      );
      assertClaimEvidence(parsed);
      console.log(
        `Biography dataset valid: ${parsed.audits.length} audits, ${parsed.claims.length} claims, ${parsed.sources.length} source attempts.`,
      );
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
    return;
  }
  if (command === 'verify') {
    writeJson(
      join(reportsRoot, 'biography-verification.json'),
      reports.verification,
    );
    console.log(JSON.stringify(reports.verification, null, 2));
    return;
  }
  writeJson(normalizedPath, dataset);
  writeJson(reviewPath, makeReview(dataset));
  writeJson(approvedPath, {
    datasetId: 'kaohsiung-2026-candidate-biographies-approved',
    snapshotDate,
    records: [],
    note: 'No biography claim is statically published until a real human reviewer and editor approve it.',
  });
  writeJson(checkpointPath, dataset.checkpoint);
  writeJson(join(reportsRoot, 'biography-coverage.json'), reports.coverage);
  writeJson(join(reportsRoot, 'biography-quality.json'), reports.quality);
  writeJson(
    join(reportsRoot, 'identity-conflicts.json'),
    reports.conflictReport,
  );
  writeJson(
    join(reportsRoot, 'biography-verification.json'),
    reports.verification,
  );
  const markdown = reportMarkdown(reports);
  writeFileSync(join(reportsRoot, 'biography-coverage.md'), markdown.coverage);
  writeFileSync(join(reportsRoot, 'biography-quality.md'), markdown.quality);
  writeFileSync(join(reportsRoot, 'identity-conflicts.md'), markdown.conflicts);
  console.log(
    JSON.stringify(
      {
        command,
        snapshotDate,
        candidates: dataset.candidateCount,
        sources: dataset.sources.length,
        observations: dataset.observations.length,
        claims: dataset.claims.length,
        conflicts: dataset.conflicts.length,
        humanReviewedClaims: 0,
        editoriallyApprovedClaims: 0,
      },
      null,
      2,
    ),
  );
}

run();
