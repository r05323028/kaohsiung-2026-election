import { policyTypeForContext } from '../src/data/policy-research/schema';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { validateOfficialDataset } from '../src/data/official/schema';
import {
  POLICY_CATEGORIES,
  type PolicyCategory,
  type PolicyContext,
  type PolicyResearchDataset,
  type PolicySourceSnapshot,
  type SourceTier,
  validatePolicyResearchDataset,
} from '../src/data/policy-research/schema';

const ROOT = process.cwd();
const SNAPSHOT_DATE = '2026-11-09';
const TIMESTAMP = '2026-11-09T00:00:00.000Z';
const KCC_TIMESTAMP = '2026-11-06T00:00:00.000Z';
const ROSTER_PATH = 'data/approved/2026/kaohsiung-election.json';
const OUTPUT_PATH = 'data/policy-research/2026/full-roster.json';
const SUMMARY_PATH = 'data/policy-research/2026/summary.json';
const REPORT_JSON_PATH = 'reports/2026-policy-enrichment.json';
const REPORT_MD_PATH = 'reports/2026-policy-enrichment.md';

type Candidate = {
  id: string;
  slug: string;
  displayName: string;
  districtId: string;
  electionType: 'mayoral' | 'city-council' | 'indigenous-council';
  politicalParty?: string | null;
  cecDirectoryName?: string | null;
};

type District = {
  id: string;
  districtLabel: string;
};

type KccMeta = {
  memberId: string;
  displayName: string;
  districtNumber: number;
  url: string;
};

type ParsedPolicy = {
  title: string;
  statement: string;
  group?: string;
  locator: string;
  statementDate: string | null;
};

type ReportCandidate = {
  candidateId: string;
  personId: string;
  displayName: string;
  districtId: string;
  districtLabel: string;
  electionType: Candidate['electionType'];
  outcome: string;
  policyCount: number;
  sourceCount: number;
  note: string;
};

function absolute(path: string): string {
  return join(ROOT, path);
}

function readText(path: string): string {
  return readFileSync(absolute(path), 'utf8');
}

function writeJson(path: string, value: unknown): void {
  const fullPath = absolute(path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, `${JSON.stringify(value, null, 2)}\n`);
}

function htmlDecode(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function textFromHtml(value: string): string {
  return htmlDecode(
    value
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p\s*>/gi, '\n')
      .replace(/<\/li\s*>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t\r\f]+/g, ' ')
    .replace(/\n+/g, '\n')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .trim();
}

function hashFile(path: string): string {
  return createHash('sha256')
    .update(readFileSync(absolute(path)))
    .digest('hex');
}

function fileSize(path: string): number {
  return statSync(absolute(path)).size;
}

function personId(candidate: Candidate): string {
  return `person-${candidate.slug}`;
}

function districtNumber(districtId: string): number | null {
  const match = districtId.match(/(?:council-|flat-|mountain-)(\d+)/);
  return match?.[1] ? Number(match[1]) : null;
}

function chineseNumber(value: string): number | null {
  const digits: Record<string, number> = {
    零: 0,
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10,
  };
  if (/^\d+$/.test(value)) return Number(value);
  if (value === '十') return 10;
  if (value.startsWith('十')) return 10 + (digits[value[1] ?? ''] ?? 0);
  if (value.endsWith('十')) return (digits[value[0] ?? ''] ?? 0) * 10;
  if (value.length === 2 && value[1] === '十')
    return (digits[value[0] ?? ''] ?? 0) * 10;
  if (value.length === 2 && value[0] !== '十' && value[1] !== '十')
    return (digits[value[0] ?? ''] ?? 0) * 10 + (digits[value[1] ?? ''] ?? 0);
  return digits[value] ?? null;
}

function firstDate(value: string): string | null {
  const iso = value.match(/20\d{2}-\d{1,2}-\d{1,2}/);
  if (iso?.[0]) {
    const [year, month, day] = iso[0].split('-').map(Number) as [
      number,
      number,
      number,
    ];
    return `${year.toString().padStart(4, '0')}-${month
      .toString()
      .padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
  }
  const chinese = value.match(/(20\d{2})年(\d{1,2})月(\d{1,2})日/);
  if (!chinese) return null;
  return `${chinese[1] ?? ''}-${(chinese[2] ?? '').padStart(2, '0')}-${(chinese[3] ?? '').padStart(2, '0')}`;
}

function splitAtomic(
  statement: string,
): Array<{ label: string; text: string }> {
  const normalized = statement.replace(/\s+/g, ' ').trim();
  const marker = /(?:^|\s)(\d+|[一二三四五六七八九十百]+)[、.．]\s*/g;
  const matches = [...normalized.matchAll(marker)];
  if (matches.length < 2) return [{ label: '', text: normalized }];
  return matches
    .map((match, index) => {
      const start = (match.index ?? 0) + match[0].length;
      const end = matches[index + 1]?.index ?? normalized.length;
      const label = match[1] ?? `${index + 1}`;
      return { label, text: normalized.slice(start, end).trim() };
    })
    .filter((item) => item.text.length > 0)
    .flatMap((item) => {
      const bullets = item.text
        .split(/\s*✅\s*/)
        .map((text) => text.trim())
        .filter((text) => text.length > 0);
      if (bullets.length <= 1) return [item];
      return bullets.map((text, index) => ({
        label: `${item.label}.${index + 1}`,
        text,
      }));
    });
}

function sourceIdForPath(path: string): string {
  return `policy-source-${relative('data', path)
    .replace(/\\/g, '/')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()}`;
}

function policyCategories(group: string, statement: string): PolicyCategory[] {
  const value = `${group} ${statement}`;
  const categories: PolicyCategory[] = [];
  const add = (category: PolicyCategory) => {
    if (!categories.includes(category)) categories.push(category);
  };
  if (
    /交通|鐵路|捷運|道路|機車|人行|單車|自行車|通勤|交流道|國道|高鐵|港口|機場/.test(
      value,
    )
  )
    add('transportation-and-mobility');
  if (
    /住宅|住房|社宅|租屋|購屋|都市更新|都更|老屋|土地|社區營造|眷村/.test(value)
  )
    add('housing-and-urban-development');
  if (
    /產業|企業|投資|商業|經濟|工業|科技園區|招商|勞工|石化|就業市場/.test(value)
  )
    add('economic-development-and-industry');
  if (/教育|學校|校園|教師|學生|教學|雙語|AI 實戰力/.test(value))
    add('education');
  if (/育兒|托育|幼兒|幼兒園|生育|家庭|親子/.test(value))
    add('childcare-and-family-support');
  if (/醫療|健康|衛生|醫護|醫院/.test(value)) add('healthcare');
  if (/長照|長輩|老人|樂齡|照護|社福|福利/.test(value))
    add('social-welfare-and-long-term-care');
  if (/環境|永續|減碳|綠|污染|水質|公園|氣候|高溫|垃圾|生態/.test(value))
    add('environment-and-sustainability');
  if (/治安|警消|消防|防災|安全|毒駕|酒駕|災害/.test(value))
    add('public-safety-and-disaster-preparedness');
  if (/青年|就業|創業|職涯|實習/.test(value)) add('youth-and-employment');
  if (/農|漁|漁業|農業|漁民/.test(value)) add('agriculture-and-fisheries');
  if (/文化|觀光|旅遊|運動|體育|演唱會|音樂|原住民族|原住民/.test(value))
    add('culture-tourism-and-sports');
  if (/原住民族|原住民|部落|族語/.test(value)) add('indigenous-affairs');
  if (/AI|人工智慧|數位|智慧城市|科技|資料|治理/.test(value))
    add('digital-governance-and-technology');
  if (/透明|監督|行政|市政|議會|政府/.test(value))
    add('government-transparency-and-administration');
  if (categories.length === 0) add('other');
  return categories;
}

function sourceSnapshot(
  sourceId: string,
  url: string,
  publisher: string,
  title: string,
  role: PolicySourceSnapshot['role'],
  tier: SourceTier,
  rawPath: string | null,
  retrievedAt: string | null,
  candidateIds: string[],
  identityStatus: PolicySourceSnapshot['identityStatus'],
  identityBasis: string[],
  note: string,
  httpStatus: number | null = rawPath ? 200 : null,
): PolicySourceSnapshot {
  return {
    sourceId,
    url,
    publisher,
    title,
    role,
    tier,
    retrievalStatus: rawPath ? 'retrieved' : 'blocked',
    httpStatus,
    contentType: rawPath ? 'text/html; charset=utf-8' : null,
    rawPath,
    byteLength: rawPath ? fileSize(rawPath) : null,
    sha256: rawPath ? hashFile(rawPath) : null,
    retrievedAt,
    candidateIds,
    identityStatus,
    identityBasis,
    note,
  };
}

function parseKccDirectory(): Map<string, KccMeta> {
  const result = new Map<string, KccMeta>();
  for (const page of readdirSync(
    absolute('data/biographies/raw/2026-11-06/kcc/pages'),
  )
    .filter((name) => name.endsWith('.html'))
    .sort()) {
    const html = readText(`data/biographies/raw/2026-11-06/kcc/pages/${page}`);
    const pattern =
      /<a[^>]+href="([^"]*msn=(\d+))"[^>]*>[\s\S]*?<div class="name">([^<]+)<\/div>[\s\S]*?<div[^>]*>第\s*<span>(\d+)<\/span>\s*選區<\/div>/g;
    for (const match of html.matchAll(pattern)) {
      const memberId = match[2];
      const displayName = htmlDecode(match[3]?.trim() ?? '');
      const number = Number(match[4]);
      if (memberId && displayName && Number.isInteger(number)) {
        result.set(memberId, {
          memberId,
          displayName,
          districtNumber: number,
          url: `https://www.kcc.gov.tw/MemberInfo_New.aspx?n=39&sms=9028&msn=${memberId}`,
        });
      }
    }
  }
  return result;
}

function parseKccPolicies(path: string, meta: KccMeta): ParsedPolicy[] {
  const html = readText(path);
  const match = html.match(
    /<h4>\s*服務政見：<\/h4>([\s\S]*?)(?:<\/div>\s*<\/li>)/,
  );
  if (!match?.[1]) return [];
  const text = textFromHtml(match[1]);
  return splitAtomic(text).map((item) => {
    const parts = item.text.split('：');
    const title =
      parts.length > 1
        ? (parts[0] ?? '').trim()
        : `${meta.displayName}服務政見`;
    return {
      title: item.label ? `${title}（第${item.label}項）` : title,
      statement: item.text,
      locator: `服務政見：${item.label || title}`,
      statementDate: null,
    };
  });
}

function parseKmtPage(
  path: string,
  candidates: Candidate[],
): {
  candidate: Candidate | undefined;
  policies: ParsedPolicy[];
  sourceName: string;
  districtNumber: number | null;
} {
  const html = readText(path);
  const sourceName = basename(path, '.html');
  const titleMatch = html.match(
    /<h1[^>]*class="candidate-heading-name"[^>]*>([\s\S]*?)<\/h1>/i,
  );
  const metaName = html.match(/候選人([^，。]+)[，。]/);
  const observedName = htmlDecode(
    textFromHtml(titleMatch?.[1] ?? metaName?.[1] ?? ''),
  )
    .replace(/^\d+/, '')
    .replace(/[（(][^）)]*[）)]$/, '')
    .trim();
  const districtMatch = html.match(/第([0-9一二三四五六七八九十百]+)選區/);
  const number = districtMatch?.[1] ? chineseNumber(districtMatch[1]) : null;
  const candidate = candidates.find((item) => {
    if (
      item.displayName !== observedName &&
      item.cecDirectoryName !== observedName
    )
      return false;
    const expectedNumber = districtNumber(item.districtId);
    return item.electionType === 'mayoral' || expectedNumber === number;
  });
  const policies: ParsedPolicy[] = [];
  const groupPattern =
    /<section[^>]*data-policy-group="([^"]+)"[^>]*>([\s\S]*?)<\/section>/gi;
  for (const groupMatch of html.matchAll(groupPattern)) {
    const group = htmlDecode(groupMatch[1] ?? '');
    const body = groupMatch[2] ?? '';
    const detailPattern =
      /<details[^>]*class="[^"]*policy-accordion[^"]*"[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/details>/gi;
    for (const detailMatch of body.matchAll(detailPattern)) {
      const detailId = detailMatch[1] ?? sourceName;
      const detail = detailMatch[2] ?? '';
      const titleMatch = detail.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
      const title = textFromHtml(titleMatch?.[1] ?? '未命名政策');
      const detailText = textFromHtml(
        detail.replace(titleMatch?.[0] ?? '', ''),
      );
      const segments = splitAtomic(detailText);
      segments.forEach((segment, index) => {
        policies.push({
          title: segment.label
            ? `${title}（第${segment.label}項）`
            : segments.length > 1
              ? `${title}（第${index + 1}項）`
              : title,
          statement: segment.text,
          group,
          locator: `#${detailId}`,
          statementDate: firstDate(detailText),
        });
      });
    }
  }
  return { candidate, policies, sourceName, districtNumber: number };
}

function parseZenolaiPage(
  path: string,
  candidate: Candidate | undefined,
): ParsedPolicy[] {
  const html = readText(path);
  const heading = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const pageTitle = textFromHtml(heading?.[1] ?? basename(path, '.html'));
  const main = html.match(/<main[\s\S]*?<\/main>/i)?.[0] ?? html;
  const pageText = textFromHtml(main).replace(/\s+/g, ' ').trim();
  if (!candidate || !pageText) return [];

  const items = [...main.matchAll(/<(p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map((match) =>
      textFromHtml(match[2] ?? '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(
      (item) =>
        item.length >= 15 &&
        !/^20\d{2}-\d{2}-\d{2}$/.test(item) &&
        !item.includes('回列表') &&
        !item.includes('更多政策'),
    );
  const atomic = items.flatMap((item) => splitAtomic(item));
  const sourceItems =
    atomic.length > 0 ? atomic : [{ label: '', text: pageText }];
  return sourceItems.map((segment, index) => {
    const titleMatch = segment.text.match(/^([^：:|｜]{2,40})\s*[：:|｜]/);
    const inferredTitle = titleMatch?.[1]?.trim();
    const title = inferredTitle
      ? inferredTitle
      : segment.label
        ? `${pageTitle}（第${segment.label}項）`
        : sourceItems.length > 1
          ? `${pageTitle}（第${index + 1}項）`
          : pageTitle;
    return {
      title,
      statement: segment.text,
      group: basename(path, '.html').replace(/^policy-/, ''),
      locator: `h1:${pageTitle}`,
      statementDate: firstDate(pageText),
    };
  });
}

function makePolicy(
  candidate: Candidate,
  districts: Map<string, District>,
  parsed: ParsedPolicy,
  source: PolicySourceSnapshot,
  context: PolicyContext,
  evidenceType:
    | 'candidate-authored-policy'
    | 'party-candidate-policy'
    | 'institutional-service-policy',
  index: number,
): {
  policy: PolicyResearchDataset['policies'][number];
  evidence: PolicyResearchDataset['evidence'][number];
} {
  const sourcePart = source.sourceId.replace(/^policy-source-/, '').slice(-48);
  const policyId = `policy-${candidate.slug}-${sourcePart}-${index + 1}`;
  const evidenceId = `evidence-${policyId}`;
  const district = districts.get(candidate.districtId);
  const geographicScope =
    candidate.electionType === 'mayoral' ? 'citywide' : 'district';
  const geographicLabel =
    candidate.electionType === 'mayoral'
      ? '高雄市全市'
      : (district?.districtLabel ?? candidate.districtId);
  const contextLabel =
    context === '2026-election-commitment'
      ? '候選人／政黨 2026 選舉政策頁提出'
      : '高雄市議會現任議員服務政見頁列出';
  const policy = {
    policyId,
    candidateId: candidate.id,
    personId: personId(candidate),
    title: parsed.title,
    neutralSummary: `${contextLabel}「${parsed.title}」；本紀錄保留原文範圍與條件，不將主張描述為已完成成果。`,
    originalStatement: parsed.statement,
    categories: policyCategories(parsed.group ?? '', parsed.statement),
    geographicScope: geographicScope as 'citywide' | 'district',
    geographicLabel,
    statementDate: parsed.statementDate,
    policyContext: context,
    electionYear:
      context === '2026-election-commitment' ? (2026 as const) : null,
    sourceId: source.sourceId,
    evidenceId,
    evidenceType,
    type: policyTypeForContext(context, parsed.title),
    verificationStatus: 'machine-validated' as const,
    reviewStatus: 'pending-human-review' as const,
    publicationStatus: 'withheld-pending-review' as const,
    claimIds: [`claim-${policyId}`],
    evidenceIds: [evidenceId],
    duplicateOf: null,
    conflictIds: [],
  };
  const evidence = {
    evidenceId,
    policyId,
    sourceId: source.sourceId,
    evidenceType,
    locator: parsed.locator,
    quotedText: parsed.statement,
    supports: 'supports' as const,
    identityStatus: 'resolved' as const,
    attributionStatus: 'attributed' as const,
  };
  return { policy, evidence };
}

function sourceUrlForKmt(file: string): string {
  const name = basename(file, '.html');
  if (name === 'home') return 'https://2026.kmtks.org.tw/';
  if (name === 'council') return 'https://2026.kmtks.org.tw/Council';
  if (name === 'mayor') return 'https://2026.kmtks.org.tw/mayor';
  return `https://2026.kmtks.org.tw/Council/${name}`;
}

function sourceUrlForZenolai(file: string): string {
  const name = basename(file, '.html');
  if (name === 'home') return 'https://www.zenolai.tw/';
  const suffix = name.replace(/^policy-?/, '').replace(/-/g, '/');
  return suffix
    ? `https://www.zenolai.tw/policy/${suffix}`
    : 'https://www.zenolai.tw/policy';
}

function loadRoster() {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readText(ROSTER_PATH));
  } catch (error) {
    throw new Error(
      `Failed to parse canonical roster at ${ROSTER_PATH}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error },
    );
  }
  return validateOfficialDataset(parsed);
}

function buildSummary(dataset: PolicyResearchDataset) {
  return {
    datasetId: dataset.datasetId,
    snapshotDate: dataset.snapshotDate,
    researchCutoff: dataset.researchCutoff,
    candidateCount: dataset.candidateCount,
    audits: dataset.audits.map((audit) => ({
      candidateId: audit.candidateId,
      outcome: audit.outcome,
      researchStatus: audit.researchStatus,
      policyCount: audit.policyIds.length,
      publishedPolicyCount: 0,
      note: audit.note,
    })),
  };
}

function main(): void {
  const roster = loadRoster();
  if (roster.candidates.length !== 106)
    throw new Error(
      `Expected 106 candidates in canonical roster, got ${roster.candidates.length}.`,
    );
  const candidates: Candidate[] = roster.candidates.map((candidate) => ({
    id: candidate.id,
    slug: candidate.slug,
    displayName: candidate.displayName,
    districtId: candidate.districtId,
    electionType: candidate.electionType,
    politicalParty: candidate.politicalParty,
    cecDirectoryName: candidate.cecDirectoryName ?? null,
  }));
  const districts = new Map<string, District>(
    roster.districts.map((district) => [
      district.id,
      { id: district.id, districtLabel: district.districtLabel },
    ]),
  );
  const candidatesByName = new Map(
    candidates.map((candidate) => [candidate.displayName, candidate]),
  );
  const kccDirectory = parseKccDirectory();
  const sourceSnapshots: PolicySourceSnapshot[] = [];
  const sourceById = new Map<string, PolicySourceSnapshot>();
  const policies: PolicyResearchDataset['policies'] = [];
  const evidence: PolicyResearchDataset['evidence'] = [];
  const candidateSourceIds = new Map<string, Set<string>>();
  const candidateAttemptIds = new Map<string, string[]>();
  const attemptedAt = TIMESTAMP;

  const addSource = (source: PolicySourceSnapshot) => {
    sourceSnapshots.push(source);
    sourceById.set(source.sourceId, source);
    for (const candidateId of source.candidateIds) {
      const ids = candidateSourceIds.get(candidateId) ?? new Set<string>();
      ids.add(source.sourceId);
      candidateSourceIds.set(candidateId, ids);
    }
    return source;
  };

  const addAttempt = (
    candidate: Candidate,
    source: PolicySourceSnapshot | null,
    sourceRole: string,
    tier: SourceTier,
    url: string | null,
    retrievalStatus:
      | 'retrieved'
      | 'blocked'
      | 'not-found'
      | 'not-attempted'
      | 'failed',
    identityStatus:
      | 'resolved'
      | 'pending-review'
      | 'unresolved'
      | 'not-applicable',
    resultNote: string,
  ) => {
    const attemptId = `policy-attempt-${candidate.slug}-${(candidateAttemptIds.get(candidate.id)?.length ?? 0) + 1}`;
    const attempt = {
      attemptId,
      candidateId: candidate.id,
      personId: personId(candidate),
      sourceId: source?.sourceId ?? null,
      sourceRole,
      tier,
      url,
      attemptedAt,
      retrievalStatus,
      identityStatus,
      isNegativeEvidence: false as const,
      resultNote,
    };
    const ids = candidateAttemptIds.get(candidate.id) ?? [];
    ids.push(attemptId);
    candidateAttemptIds.set(candidate.id, ids);
    return attempt;
  };

  const sourceAttempts: PolicyResearchDataset['sourceAttempts'] = [];

  const kmtFiles = readdirSync(absolute('data/raw/policy/2026/kmt'))
    .filter((file) => file.endsWith('.html'))
    .sort();
  for (const file of kmtFiles) {
    const path = `data/raw/policy/2026/kmt/${file}`;
    const parsed = parseKmtPage(path, candidates);
    const candidateIds = parsed.candidate ? [parsed.candidate.id] : [];
    const sourceId = sourceIdForPath(path);
    const source = addSource(
      sourceSnapshot(
        sourceId,
        sourceUrlForKmt(file),
        '中國國民黨高雄市選舉資訊網',
        parsed.candidate
          ? `${parsed.candidate.displayName}候選人頁`
          : file === 'mayor.html'
            ? '高雄市長候選人政策頁'
            : '高雄市選舉資訊網',
        file === 'home.html' || file === 'council.html'
          ? 'party-candidate-page'
          : parsed.policies.length > 0
            ? 'candidate-operated-campaign-site'
            : 'party-candidate-page',
        'tier-1-primary',
        path,
        TIMESTAMP,
        candidateIds,
        parsed.candidate
          ? 'resolved'
          : file === 'home.html' || file === 'council.html'
            ? 'not-applicable'
            : 'unresolved',
        parsed.candidate
          ? [
              `頁面候選人姓名：${parsed.candidate.displayName}`,
              `選區數字：${parsed.districtNumber ?? '市長'}`,
            ]
          : [],
        parsed.policies.length > 0
          ? '直接保留之官方候選人政策頁；政策內容待人工與編輯審查後方可出版。'
          : '直接保留之官方黨／候選人頁；未解析到可直接引用的政策卡片，不代表候選人沒有政策。',
      ),
    );
    if (parsed.candidate) {
      sourceAttempts.push(
        addAttempt(
          parsed.candidate,
          source,
          'candidate-specific-party-page',
          'tier-1-primary',
          source.url,
          'retrieved',
          'resolved',
          parsed.policies.length > 0
            ? '已取得候選人／政黨頁；可作為政策研究證據，尚未通過人工出版審查。'
            : '已取得候選人／政黨頁，但未解析到可直接引用的政策卡片；不推論沒有政策。',
        ),
      );
    }
    if (parsed.candidate && parsed.policies.length > 0) {
      for (const [index, policy] of parsed.policies.entries()) {
        const record = makePolicy(
          parsed.candidate,
          districts,
          policy,
          source,
          '2026-election-commitment',
          file === 'mayor.html'
            ? 'candidate-authored-policy'
            : 'party-candidate-policy',
          index,
        );
        policies.push(record.policy);
        evidence.push(record.evidence);
      }
    }
  }

  const zenolaiFiles = readdirSync(absolute('data/raw/policy/2026/zenolai'))
    .filter((file) => file.endsWith('.html'))
    .sort();
  const lai = candidatesByName.get('賴瑞隆');
  for (const file of zenolaiFiles) {
    const path = `data/raw/policy/2026/zenolai/${file}`;
    const parsedPolicies =
      /^policy-(?:vision|ai|youth|culture|education)-\d+\.html$/.test(file)
        ? parseZenolaiPage(path, lai)
        : [];
    const sourceId = sourceIdForPath(path);
    const source = addSource(
      sourceSnapshot(
        sourceId,
        sourceUrlForZenolai(file),
        '賴瑞隆競選總部',
        `賴瑞隆政策頁：${basename(file, '.html')}`,
        'candidate-operated-campaign-site',
        'tier-1-primary',
        path,
        TIMESTAMP,
        lai ? [lai.id] : [],
        lai ? 'resolved' : 'unresolved',
        lai ? ['官方網站首頁與政策頁均標示賴瑞隆'] : [],
        '候選人競選總部政策頁；政策內容待人工與編輯審查後方可出版。',
      ),
    );
    if (lai) {
      sourceAttempts.push(
        addAttempt(
          lai,
          source,
          'candidate-operated-policy-page',
          'tier-1-primary',
          source.url,
          'retrieved',
          'resolved',
          '已取得賴瑞隆競選總部政策頁；原文保留，尚未通過人工出版審查。',
        ),
      );
      for (const [index, policy] of parsedPolicies.entries()) {
        const record = makePolicy(
          lai,
          districts,
          policy,
          source,
          '2026-election-commitment',
          'candidate-authored-policy',
          policies.filter((item) => item.candidateId === lai.id).length + index,
        );
        policies.push(record.policy);
        evidence.push(record.evidence);
      }
    }
  }

  const blockedSources = [
    sourceSnapshot(
      'policy-seed-tpp-councilor',
      'https://www.tpp.org.tw/election2026/candidates.php?tab=councilor',
      '台灣民眾黨',
      '2026 候選人頁（候選人議員分頁）',
      'party-candidate-page',
      'tier-1-primary',
      null,
      null,
      [],
      'not-applicable',
      [],
      '直接請求遭 Cloudflare 403；未將阻擋結果視為沒有政策。',
      403,
    ),
    sourceSnapshot(
      'policy-seed-kochihen',
      'https://kochihen2026.tw/',
      '柯志恩競選／候選人網站',
      '柯志恩候選人網站',
      'candidate-operated-campaign-site',
      'tier-1-primary',
      null,
      null,
      [],
      'unresolved',
      [],
      '直接請求遭 Cloudflare 403；已使用可取得的官方黨候選人政策頁替代，不將阻擋結果視為沒有政策。',
      403,
    ),
  ];
  blockedSources.forEach(addSource);

  for (const [memberId, meta] of kccDirectory) {
    const path = `data/biographies/raw/2026-11-06/kcc/profiles/${memberId}.html`;
    if (!existsSync(absolute(path))) continue;
    const candidate = candidates.find(
      (item) =>
        item.displayName === meta.displayName &&
        districtNumber(item.districtId) === meta.districtNumber,
    );
    const sourceId = `policy-kcc-profile-${memberId}`;
    const parsedPolicies = parseKccPolicies(path, meta);
    const source = addSource(
      sourceSnapshot(
        sourceId,
        meta.url,
        '高雄市議會',
        `高雄市議會議員服務政見：${meta.displayName}`,
        'institutional-member-profile',
        'tier-2-authoritative',
        path,
        KCC_TIMESTAMP,
        candidate ? [candidate.id] : [],
        candidate ? 'resolved' : 'unresolved',
        candidate
          ? [
              `議會目錄姓名：${meta.displayName}`,
              `議會目錄選區：第${meta.districtNumber}選區`,
            ]
          : [],
        candidate
          ? '議會現任議員個人頁服務政見；分類為目前／歷史政策位置，不自動視為 2026 競選承諾或已完成成果。'
          : '議會個人頁未能以姓名與選區同時對應本次 2026 roster；不納入候選人政策紀錄。',
      ),
    );
    if (candidate) {
      sourceAttempts.push(
        addAttempt(
          candidate,
          source,
          'institutional-member-profile',
          'tier-2-authoritative',
          source.url,
          'retrieved',
          'resolved',
          parsedPolicies.length > 0
            ? '已以姓名與數字選區雙重匹配議會個人頁；服務政見保留為現任／歷史位置，待人工審查。'
            : '已以姓名與數字選區雙重匹配議會個人頁，但未解析到服務政見段落。',
        ),
      );
      for (const [index, policy] of parsedPolicies.entries()) {
        const record = makePolicy(
          candidate,
          districts,
          policy,
          source,
          'current-position',
          'institutional-service-policy',
          index,
        );
        policies.push(record.policy);
        evidence.push(record.evidence);
      }
    }
  }

  for (const candidate of candidates) {
    const sourceIds = [
      ...(candidateSourceIds.get(candidate.id) ?? new Set<string>()),
    ];
    if (sourceIds.length === 0) {
      sourceAttempts.push(
        addAttempt(
          candidate,
          null,
          'bounded-candidate-policy-discovery',
          'tier-1-primary',
          null,
          'not-attempted',
          'not-applicable',
          '在保留的官方候選人／政黨來源集合中沒有找到可核驗的候選人專屬政策端點；這不是沒有政策的證據。',
        ),
      );
    }
  }

  const policiesByCandidate = new Map<string, typeof policies>();
  for (const policy of policies) {
    const current = policiesByCandidate.get(policy.candidateId) ?? [];
    current.push(policy);
    policiesByCandidate.set(policy.candidateId, current);
  }

  const audits = candidates.map((candidate) => {
    const candidatePolicies = policiesByCandidate.get(candidate.id) ?? [];
    const candidateAttempts = candidateAttemptIds.get(candidate.id) ?? [];
    const has2026 = candidatePolicies.some(
      (policy) => policy.policyContext === '2026-election-commitment',
    );
    const hasHistorical = candidatePolicies.some(
      (policy) => policy.policyContext !== '2026-election-commitment',
    );
    const candidateSources = [
      ...(candidateSourceIds.get(candidate.id) ?? new Set<string>()),
    ];
    let outcome:
      | 'verified-records'
      | 'current-or-historical-only'
      | 'no-verifiable-policy-found'
      | 'sources-unavailable'
      | 'evidence-requires-review'
      | 'candidate-identity-unresolved';
    let note: string;
    if (has2026) {
      outcome = 'verified-records';
      note = `已取得 ${candidatePolicies.length} 筆候選人／政黨直接政策原文；全部仍為 pending-human-review，未進入公開核准資料。`;
    } else if (hasHistorical) {
      outcome = 'current-or-historical-only';
      note = `已取得 ${candidatePolicies.length} 筆議會服務政見；其時間脈絡不是 2026 競選承諾，全部仍待人工審查。`;
    } else if (candidateSources.length === 0) {
      outcome = 'sources-unavailable';
      note =
        '保留來源集合中沒有可對應的候選人政策頁；部分來源可能受限或未公開，不將此結果解讀為候選人沒有政策。';
    } else {
      outcome = 'no-verifiable-policy-found';
      note =
        '已完成限定官方來源檢索，但未找到可直接核驗的候選人政策紀錄；這不是候選人沒有政策的證據。';
    }
    const district = districts.get(candidate.districtId);
    return {
      candidateId: candidate.id,
      personId: personId(candidate),
      displayName: candidate.displayName,
      districtId: candidate.districtId,
      districtLabel: district?.districtLabel ?? candidate.districtId,
      electionType: candidate.electionType,
      sourceAttemptIds: candidateAttempts,
      policyIds: candidatePolicies.map((policy) => policy.policyId),
      evidenceIds: candidatePolicies.map((policy) => policy.evidenceId),
      outcome,
      researchStatus: 'completed' as const,
      note,
    };
  });

  const dataset = validatePolicyResearchDataset({
    datasetId: 'kaohsiung-2026-policy-research',
    snapshotDate: SNAPSHOT_DATE,
    researchCutoff: SNAPSHOT_DATE,
    rosterSnapshotDate: '2026-11-05',
    candidateCount: candidates.length,
    categories: [...POLICY_CATEGORIES],
    sourceSnapshots,
    sourceAttempts,
    policies,
    evidence,
    audits,
    conflicts: [],
    review: {
      status: 'pending-human-review',
      reviewerId: null,
      reviewedAt: null,
      approvedPolicyCount: 0,
      publishedPolicyCount: 0,
    },
  });

  writeJson(OUTPUT_PATH, dataset);
  writeJson(SUMMARY_PATH, buildSummary(dataset));
  writeJson(REPORT_JSON_PATH, buildReport(dataset, candidates, districts));
  writeFileSync(
    absolute(REPORT_MD_PATH),
    buildMarkdownReport(dataset, candidates, districts),
  );
  console.log(
    `Generated full-roster policy research: ${candidates.length} candidates, ${policies.length} policy records, ${sourceSnapshots.length} retained sources, 0 published.`,
  );
}

function buildReport(
  dataset: PolicyResearchDataset,
  candidates: Candidate[],
  districts: Map<string, District>,
) {
  const categoryCounts = Object.fromEntries(
    POLICY_CATEGORIES.map((category) => [
      category,
      dataset.policies.filter((policy) => policy.categories.includes(category))
        .length,
    ]),
  );
  const tierCounts = Object.fromEntries(
    [
      'tier-1-primary',
      'tier-2-authoritative',
      'tier-3-reporting',
      'tier-4-discovery',
    ].map((tier) => [
      tier,
      dataset.sourceSnapshots.filter(
        (source) =>
          source.tier === tier && source.retrievalStatus === 'retrieved',
      ).length,
    ]),
  );
  const districtCounts = Object.fromEntries(
    [...new Set(candidates.map((candidate) => candidate.districtId))].map(
      (districtId) => [
        districtId,
        {
          districtLabel: districts.get(districtId)?.districtLabel ?? districtId,
          candidateCount: candidates.filter(
            (candidate) => candidate.districtId === districtId,
          ).length,
          investigatedCount: dataset.audits.filter(
            (audit) => audit.districtId === districtId,
          ).length,
          policyRecordCount: dataset.policies.filter((policy) => {
            const audit = dataset.audits.find(
              (item) => item.candidateId === policy.candidateId,
            );
            return audit?.districtId === districtId;
          }).length,
        },
      ],
    ),
  );
  const candidateInventory: ReportCandidate[] = dataset.audits.map((audit) => ({
    candidateId: audit.candidateId,
    personId: audit.personId,
    displayName: audit.displayName,
    districtId: audit.districtId,
    districtLabel: audit.districtLabel,
    electionType: audit.electionType,
    outcome: audit.outcome,
    policyCount: audit.policyIds.length,
    sourceCount: audit.sourceAttemptIds.length,
    note: audit.note,
  }));
  return {
    reportType: 'full-roster-policy-enrichment',
    generatedAt: TIMESTAMP,
    researchCutoff: dataset.researchCutoff,
    totalCandidatesInvestigated: candidates.length,
    candidatesWithVerified2026Policies: dataset.audits.filter(
      (audit) => audit.outcome === 'verified-records',
    ).length,
    candidatesWithOnlyCurrentOrHistoricalPositions: dataset.audits.filter(
      (audit) => audit.outcome === 'current-or-historical-only',
    ).length,
    candidatesWithNoVerifiablePolicyFound: dataset.audits.filter(
      (audit) => audit.outcome === 'no-verifiable-policy-found',
    ).length,
    candidatesWithSourcesUnavailable: dataset.audits.filter(
      (audit) => audit.outcome === 'sources-unavailable',
    ).length,
    outcomeCounts: Object.fromEntries(
      [...new Set(dataset.audits.map((audit) => audit.outcome))].map(
        (outcome) => [
          outcome,
          dataset.audits.filter((audit) => audit.outcome === outcome).length,
        ],
      ),
    ),
    totalPolicyRecordsDiscovered: dataset.policies.length,
    machineValidatedPolicyCount: dataset.policies.length,
    pendingHumanReviewPolicyCount: dataset.policies.length,
    approvedPolicyCount: 0,
    publishedPolicyCount: 0,
    rejectedPolicyCount: 0,
    unresolvedPolicyCount: 0,
    sourceSnapshotCount: dataset.sourceSnapshots.length,
    sourceAttemptCount: dataset.sourceAttempts.length,
    sourceDistributionByTier: tierCounts,
    missingSourceReasons: {
      noRetainedCandidateSpecificSource: dataset.audits.filter(
        (audit) => audit.outcome === 'sources-unavailable',
      ).length,
      retrievedCandidateSourceWithoutVerifiablePolicy: dataset.audits.filter(
        (audit) => audit.outcome === 'no-verifiable-policy-found',
      ).length,
      blockedExternalSources: dataset.sourceSnapshots.filter(
        (source) => source.retrievalStatus === 'blocked',
      ).length,
    },
    policyCountByCategory: categoryCounts,
    policyCountByContext: {
      '2026-election-commitment': dataset.policies.filter(
        (policy) => policy.policyContext === '2026-election-commitment',
      ).length,
      'current-position': dataset.policies.filter(
        (policy) => policy.policyContext === 'current-position',
      ).length,
      'historical-position': dataset.policies.filter(
        (policy) => policy.policyContext === 'historical-position',
      ).length,
      'public-record-achievement': dataset.policies.filter(
        (policy) => policy.policyContext === 'public-record-achievement',
      ).length,
      'context-unknown': dataset.policies.filter(
        (policy) => policy.policyContext === 'context-unknown',
      ).length,
    },
    coverageByDistrict: districtCounts,
    candidateInventory,
    identityOrAttributionConflicts: dataset.conflicts,
    remainingManualReviewRequirements: [
      '人工逐筆確認候選人身份、選區、發言歸屬與政策原文範圍。',
      '人工確認 2026 競選承諾與現任／歷史服務政見的時間脈絡。',
      '編輯確認中性摘要、分類、去重與衝突處理。',
      '在 reviewerId、reviewedAt 與 editorial approval 真實存在前，所有政策維持 withheld-pending-review。',
    ],
    integrityAssertions: {
      everyRosterCandidateInvestigated: dataset.audits.length === 106,
      unsupportedPoliciesGenerated: false,
      nameOnlyMatchesPublished: false,
      reviewerMetadataInvented: false,
      rejectedOrUnresolvedPublished: false,
      candidateRankingProduced: false,
    },
  };
}

function buildMarkdownReport(
  dataset: PolicyResearchDataset,
  candidates: Candidate[],
  districts: Map<string, District>,
): string {
  const report = buildReport(dataset, candidates, districts);
  const lines = [
    '# 2026 高雄候選人政策研究覆蓋報告',
    '',
    `研究截止：${dataset.researchCutoff}；候選人 roster 快照：${dataset.rosterSnapshotDate}`,
    '',
    '## 邊界與出版狀態',
    '',
    '- 本報告記錄 106 位候選人的限定來源研究，不把找不到政策解讀為沒有政策。',
    '- 2026 競選承諾、現任／歷史服務政見與公共成果分開標示。',
    '- 所有政策紀錄目前為 machine-validated、pending-human-review、withheld-pending-review。',
    '- 因沒有真實人工審查與編輯核准 metadata，公開核准與出版數均為 0；本次沒有繞過既有 publication gate。',
    '',
    '## 總覽',
    '',
    `- investigated candidates: ${report.totalCandidatesInvestigated}`,
    `- candidates with verified 2026 policies: ${report.candidatesWithVerified2026Policies}`,
    `- candidates with only current/historical positions: ${report.candidatesWithOnlyCurrentOrHistoricalPositions}`,
    `- candidates with no verifiable policy found: ${report.candidatesWithNoVerifiablePolicyFound}`,
    `- candidates with sources unavailable: ${report.candidatesWithSourcesUnavailable}`,
    `- policy records discovered: ${report.totalPolicyRecordsDiscovered}`,
    `- machine-validated / pending human review: ${report.machineValidatedPolicyCount} / ${report.pendingHumanReviewPolicyCount}`,
    `- approved / published / rejected / unresolved: ${report.approvedPolicyCount} / ${report.publishedPolicyCount} / ${report.rejectedPolicyCount} / ${report.unresolvedPolicyCount}`,
    '',
    '## 來源層級分布',
    '',
    ...Object.entries(report.sourceDistributionByTier).map(
      ([tier, count]) => `- ${tier}: ${count}`,
    ),
    '',
    '## 來源缺口',
    '',
    `- no retained candidate-specific source: ${report.missingSourceReasons.noRetainedCandidateSpecificSource}`,
    `- retrieved candidate source without verifiable policy: ${report.missingSourceReasons.retrievedCandidateSourceWithoutVerifiablePolicy}`,
    `- blocked external sources: ${report.missingSourceReasons.blockedExternalSources}`,
    `- identity or attribution conflicts: ${report.identityOrAttributionConflicts.length}`,
    '',
    '## 政策分類分布',
    '',
    ...Object.entries(report.policyCountByCategory).map(
      ([category, count]) => `- ${category}: ${count}`,
    ),
    '',
    '## 政策脈絡分布',
    '',
    ...Object.entries(report.policyCountByContext).map(
      ([context, count]) => `- ${context}: ${count}`,
    ),
    '',
    '## 候選人清單',
    '',
    '| 候選人 | 選區 | 研究結果 | 政策筆數 | 來源嘗試 |',
    '| --- | --- | --- | ---: | ---: |',
    ...report.candidateInventory.map(
      (item) =>
        `| ${item.displayName} | ${item.districtLabel} | ${item.outcome} | ${item.policyCount} | ${item.sourceCount} |`,
    ),
    '',
    '## 剩餘人工審查',
    '',
    ...report.remainingManualReviewRequirements.map((item) => `- ${item}`),
    '',
    '## 限制',
    '',
    '- TPP 議員候選人頁與柯志恩候選人站在本次直接請求遭 Cloudflare 403；未把阻擋結果當作負面證據。',
    '- KMT council 頁面多數只提供候選人基本介紹，沒有可直接引用的政策卡片；這些頁面被保留為來源嘗試，不代表候選人沒有政策。',
    '- KCC 服務政見是現任議員機關個人頁內容，不自動轉成 2026 競選承諾，也不視為完成成果。',
    '',
  ];
  return `${lines.join('\n').trimEnd()}\n`;
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
