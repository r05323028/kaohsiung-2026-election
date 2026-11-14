import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { z } from 'zod';
import { parseKccProfile } from '../../src/data/biographies/adapters';
import {
  type CareerCoverage,
  type OfficeTerm,
  type PoliticalActionSchema,
  type PoliticalActivity,
  type PoliticalActivityCategorySchema,
  type PoliticalCareerSource,
  validatePoliticalCareerDataset,
} from '../../src/data/political-career/schema';
import { buildPublicServiceRecords } from './build-public-service';

type PoliticalAction = z.infer<typeof PoliticalActionSchema>;
type PoliticalActivityCategory = z.infer<
  typeof PoliticalActivityCategorySchema
>;

/**
 * Deterministic, offline build of data/approved/2026/political-career.json.
 *
 * Inputs, all retained on disk already:
 *   - the approved roster (identity, slug, district, election type)
 *   - the 65 Kaohsiung City Council member profiles (學經歷與政見 + 相關新聞 links)
 *   - the 590 council news pages fetched by scripts/political-career/fetch.ts
 *   - data/political-career/2026/curated-records.json (hand-researched records
 *     for candidates the council corpus cannot cover: mayoral candidates and
 *     people who never served on the Kaohsiung City Council)
 *
 * Nothing here reaches the network, and nothing here invents a date: a record
 * is only emitted when a retained document states it.
 */

const ROOT = process.cwd();
const ROSTER_PATH = 'data/approved/2026/kaohsiung-election.json';
const ENRICHMENT_PATH =
  'data/public-records/research-enrichment/2026/full-roster.json';
const MANIFEST_PATH = 'data/raw/political-career/2026/news-manifest.json';
const CURATED_PATH = 'data/political-career/2026/curated-records.json';
const OUTPUT_PATH = 'data/approved/2026/political-career.json';
const SNAPSHOT_DATE = '2026-11-14';

type RosterCandidate = {
  id: string;
  slug: string;
  displayName: string;
  districtId: string;
  electionType: EvaluationType;
};

type EvaluationType = 'mayoral' | 'city-council' | 'indigenous-council';

type Roster = { candidates: RosterCandidate[] };

type EnrichmentSnapshot = {
  sourceId: string;
  url: string;
  publisher?: string;
  title?: string;
  role: string;
  retrievalStatus: string;
  rawPath: string | null;
  sha256: string | null;
  retrievedAt?: string;
  candidateIds?: string[];
};

type ManifestEntry = {
  newsId: string;
  url: string;
  httpStatus: number;
  byteLength: number;
  sha256: string;
  rawPath: string;
  retrievedAt: string;
  candidateIds: string[];
  profileSourceIds: string[];
};

type NewsManifest = { entries: ManifestEntry[]; failures: unknown[] };

type PoliticalRole = {
  id: string;
  candidateId: string;
  personId: string;
  role: string;
  organization: string;
  termLabel: string;
  startYear: number | null;
  endYear: number | null;
  sourceIds: string[];
  note: string;
};

type CuratedRecordSet = {
  sources: PoliticalCareerSource[];
  officeTerms: OfficeTerm[];
  activities: PoliticalActivity[];
  politicalRoles?: PoliticalRole[];
  coverageNotes?: { candidateId: string; note: string }[];
};

type MemberProfile = {
  msn: string;
  sourceId: string;
  candidateId: string;
  html: string;
  rawPath: string;
};

const NEWS_ANCHOR =
  /<a\s+href="\/News_Content\.aspx\?n=47&s=(\d+)"\s+title="([^"]*)"\s*>\s*<i class="mark">([^<]*)<\/i>/g;
const SECTION_HEADING = /^[（(]([一二三四五六七八九十]+)[)）]\s*(.{2,8}?)議員/;
const GOVERNANCE_VERB =
  /會勘|視察|關切|關注|要求|呼籲|爭取|建議|提案|質詢|監督|審查|協調|催生|推動|批評|質疑/;
const CEREMONIAL_VERB =
  /出席|主持|致詞|頒獎|頒贈|慰問|普渡|表揚|祝賀|歡迎|迎接|接待|接見|合影|開幕|揭牌|茶會|茶敘|餐會|聯誼|拜會|參訪|友誼賽/;

/**
 * Council news pages that only publish a roster, a schedule or an award list.
 * They never describe an action a single member took, so nothing on them can be
 * attributed to a candidate.
 */
const ANNOUNCEMENT_PAGE =
  /當選人名單|當選名單|當選公告|一覽表|議員名單|宣誓|就職|表揚名單/;
const RESPONSE_MARKER = /表示|允諾|承諾|回應|強調|同意|研議|辦理/;

function absolute(path: string): string {
  return join(ROOT, path);
}

function readJson<T>(path: string): T {
  const raw = readFileSync(absolute(path), 'utf8');
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    throw new Error(
      'failed to parse JSON at ' + path + ': ' + (error as Error).message,
    );
  }
}

function sha256(buffer: Buffer | string): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function fileSha256(path: string): string | null {
  if (!existsSync(absolute(path))) return null;
  return sha256(readFileSync(absolute(path)));
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&ndash;/gi, '–')
    .replace(/&mdash;/gi, '—')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_match: string, code: string | undefined) =>
      code ? String.fromCodePoint(Number(code)) : '',
    );
}

function paragraphText(html: string): string {
  return decodeEntities(
    html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''),
  )
    .replace(/\u3000/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/** "115/10/5" becomes "2026-10-05"; implausible ROC dates return null. */
function rocDateToIso(value: string): string | null {
  const match = value.trim().match(/^(\d{2,3})\/(\d{1,2})\/(\d{1,2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (year < 100 || year > 120) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;

  const western = year + 1911;
  return (
    western +
    '-' +
    String(month).padStart(2, '0') +
    '-' +
    String(day).padStart(2, '0')
  );
}

function truncate(value: string, max: number): string {
  const text = value.trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastStop = Math.max(cut.lastIndexOf('。'), cut.lastIndexOf('，'));
  return (lastStop > 12 ? cut.slice(0, lastStop) : cut).trim() + '…';
}

function splitSentences(value: string): string[] {
  return value
    .split(/(?<=[。！？；])/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 4);
}

/** Leading topic clause of the form "打造共融城市，黃議員指出…". */
function topicOf(paragraph: string): string | null {
  const match = paragraph.match(/^([^，。；:：]{4,22})[，。]/);
  if (!match) return null;
  const topic = (match[1] ?? '').trim();
  if (!topic || topic.includes('議員') || topic.includes('市府')) return null;
  return topic;
}

function sectionParagraphs(html: string): string[] {
  const start = html.indexOf('class="essay"');
  if (start < 0) return [];
  const tail = html.slice(start);
  const end = tail.indexOf('area-customize');
  const segment = end > 0 ? tail.slice(0, end) : tail;

  return [...segment.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => paragraphText(match[1] ?? ''))
    .filter((text) => text.length > 0);
}

function loadMemberProfiles(snapshots: EnrichmentSnapshot[]): MemberProfile[] {
  const profiles: MemberProfile[] = [];

  for (const snapshot of snapshots) {
    if (snapshot.role !== 'institutional-member-profile') continue;
    if (snapshot.retrievalStatus !== 'retrieved') continue;
    if (!snapshot.rawPath) continue;
    const candidateId = snapshot.candidateIds?.[0];
    if (!candidateId) continue;
    if (!existsSync(absolute(snapshot.rawPath))) continue;

    const msn = snapshot.sourceId.replace('policy-kcc-profile-', '');

    profiles.push({
      msn,
      sourceId: 'political-career-kcc-profile-' + msn,
      candidateId,
      html: readFileSync(absolute(snapshot.rawPath), 'utf8'),
      rawPath: snapshot.rawPath,
    });
  }

  return profiles;
}

function profileSource(
  profile: MemberProfile,
  title: string,
): PoliticalCareerSource {
  return {
    sourceId: profile.sourceId,
    url:
      'https://www.kcc.gov.tw/MemberInfo_New.aspx?n=39&sms=9028&msn=' +
      profile.msn,
    publisher: '高雄市議會',
    title,
    tier: 'tier-2-authoritative',
    retrievedAt: '2026-11-06T00:00:00.000Z',
    rawPath: profile.rawPath,
    sha256: fileSha256(profile.rawPath),
    note: '議員服務政見頁，含學經歷與相關新聞清單；作為屆次與新聞頁歸屬依據。',
  };
}

const STAFF_ROLE =
  /服務處|辦公室|競選總部|後援會|助理|機要|顧問|主任|副主任|秘書|幹事/;

const CN_DIGIT: Record<string, number> = {
  〇: 0,
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
};

function cnNumber(text: string): number | null {
  if (/^\d+$/.test(text)) return Number(text);
  const chars = [...text];
  if (chars.length === 0) return null;
  if (chars.length === 1) return CN_DIGIT[chars[0] ?? ''] ?? null;
  const tenIndex = chars.indexOf('十');
  if (tenIndex === -1) return null;
  const tensPart = chars.slice(0, tenIndex);
  const onesPart = chars.slice(tenIndex + 1);
  if (tensPart.length > 1 || onesPart.length > 1) return null;
  const tens = tensPart.length === 0 ? 1 : (CN_DIGIT[tensPart[0] ?? ''] ?? NaN);
  const ones = onesPart.length === 0 ? 0 : (CN_DIGIT[onesPart[0] ?? ''] ?? NaN);
  const value = tens * 10 + ones;
  return Number.isFinite(value) ? value : null;
}

function parseTermList(text: string): number[] {
  const cleaned = text.replace(/[屆\s]/g, '');
  const hasRange = /[∼~～\-－至到]/.test(cleaned);
  const parts = cleaned
    .split(/[、,，∼~～\-－至到]/)
    .filter((part) => part.length > 0);
  const values = parts
    .map(cnNumber)
    .filter((value): value is number => value !== null);

  if (hasRange && values.length === 2) {
    const first = values[0] ?? 0;
    const second = values[1] ?? 0;
    const start = Math.min(first, second);
    const end = Math.max(first, second);
    if (end > start && end - start <= 12) {
      const range: number[] = [];
      for (let term = start; term <= end; term += 1) range.push(term);
      return range;
    }
  }

  return values;
}

type ParsedOffice = {
  officeTitle: string;
  organization: string;
  termNumbers: number[];
  currentHint: boolean;
};

function parseOfficeLine(raw: string): ParsedOffice | null {
  const compact = raw
    .replace(/\s+/g, '')
    .replace(/[（(]\s*現任\s*[)）]/g, '')
    .replace(/[。；;，,]+$/, '');
  if (compact.length === 0 || compact.length > 40) return null;
  if (STAFF_ROLE.test(compact)) return null;

  const currentHint = /現任|迄今/.test(raw);
  const termGroup = '(?:第?([^屆]{1,14})屆)?';

  const plainLegislator = compact.match(/^立法委員$/);
  if (plainLegislator) {
    return {
      officeTitle: '立法委員',
      organization: '立法院',
      termNumbers: [],
      currentHint,
    };
  }

  const legislatorTerm = compact.match(
    new RegExp('^' + termGroup + '立法委員$'),
  );
  if (legislatorTerm) {
    return {
      officeTitle: '立法委員',
      organization: '立法院',
      termNumbers: legislatorTerm[1] ? parseTermList(legislatorTerm[1]) : [],
      currentHint,
    };
  }

  const councilor = compact.match(
    new RegExp(
      '^(?:高雄[市縣])?(?:縣市合併後)?(?:議會)?' +
        termGroup +
        '(?:市議員|縣議員|議員)$',
    ),
  );
  if (councilor) {
    const county = /縣議員|高雄縣/.test(compact);
    return {
      officeTitle: '議員',
      organization: county ? '高雄縣議會' : '高雄市議會',
      termNumbers: councilor[1] ? parseTermList(councilor[1]) : [],
      currentHint,
    };
  }

  const mayor = compact.match(
    new RegExp('^(?:高雄[市縣])?' + termGroup + '(?:市長|縣長)$'),
  );
  if (mayor) {
    return {
      officeTitle: '市長',
      organization: '高雄市政府',
      termNumbers: mayor[1] ? parseTermList(mayor[1]) : [],
      currentHint,
    };
  }

  const chief = compact.match(/^(.{2,12}?)(?:第?([^屆]{1,10})屆)?里長$/);
  if (chief) {
    return {
      officeTitle: '里長',
      organization: (chief[1] ?? '') + '里',
      termNumbers: chief[2] ? parseTermList(chief[2]) : [],
      currentHint,
    };
  }

  return null;
}

const PARTY_ROLE =
  /黨|黨團|全國代表|中央委員|中常委|主任委員|主委|發言人|總召|召集人/;

function buildOfficeTerms(
  roster: RosterCandidate[],
  profiles: MemberProfile[],
  personIdOf: (candidateId: string) => string,
): { officeTerms: OfficeTerm[]; politicalRoles: PoliticalRole[] } {
  const byCandidate = new Map(
    roster.map((candidate) => [candidate.id, candidate]),
  );
  const officeTerms: OfficeTerm[] = [];
  const politicalRoles: PoliticalRole[] = [];
  const seenOffice = new Set<string>();
  const seenRole = new Set<string>();

  for (const profile of profiles) {
    const candidate = byCandidate.get(profile.candidateId);
    if (!candidate) continue;

    const parsed = parseKccProfile(profile.html, profile.msn);
    if (!parsed) continue;

    let index = 0;

    for (const line of parsed.experience) {
      const compact = line.replace(/\s+/g, '');
      const office = parseOfficeLine(line);

      if (office) {
        index += 1;
        const termLabel =
          office.termNumbers.length > 0
            ? '第' + office.termNumbers.join('、') + '屆'
            : '屆次未載明';
        const isCurrent =
          office.currentHint ||
          (office.organization === '高雄市議會' &&
            office.termNumbers.includes(4)) ||
          (office.organization === '立法院' && office.termNumbers.includes(11));

        const key =
          candidate.id +
          '|' +
          office.organization +
          '|' +
          office.officeTitle +
          '|' +
          termLabel;

        if (!seenOffice.has(key)) {
          seenOffice.add(key);
          const kind =
            office.officeTitle === '立法委員'
              ? {
                  positionType: 'legislative-office' as const,
                  employmentType: 'elected' as const,
                }
              : office.officeTitle === '議員'
                ? {
                    positionType: 'council-office' as const,
                    employmentType: 'elected' as const,
                  }
                : {
                    positionType: 'elected-office' as const,
                    employmentType: 'elected' as const,
                  };
          officeTerms.push({
            id: 'office-' + candidate.slug + '-' + String(index),
            candidateId: candidate.id,
            personId: personIdOf(candidate.id),
            positionType: kind.positionType,
            employmentType: kind.employmentType,
            officeTitle: office.officeTitle,
            organization: office.organization,
            termLabel,
            termNumbers: office.termNumbers,
            startDate: null,
            startDatePrecision: null,
            endDate: null,
            endDatePrecision: null,
            status: isCurrent ? 'current' : 'former',
            sourceIds: [profile.sourceId],
            evidenceExcerpt: null,
            attribution: 'institutional-record',
            note: '屆次取自高雄市議會「學經歷與政見」經歷欄位；起訖日期未載明，故不推定。',
          });
        }

        continue;
      }
      if (compact.length < 4 || compact.length > 40) continue;
      if (!PARTY_ROLE.test(compact)) continue;

      const roleKey = candidate.id + '|' + compact;
      if (seenRole.has(roleKey)) continue;
      seenRole.add(roleKey);

      politicalRoles.push({
        id: 'role-' + candidate.slug + '-' + String(politicalRoles.length + 1),
        candidateId: candidate.id,
        personId: personIdOf(candidate.id),
        role: compact,
        organization: '政黨或政治組織',
        termLabel: '屆次未載明',
        startYear: null,
        endYear: null,
        sourceIds: [profile.sourceId],
        note: '議員服務政見頁經歷欄位列出的政治參與，未有可查證起訖日期。',
      });
    }
  }

  return { officeTerms, politicalRoles };
}

type NewsPage = {
  newsId: string;
  url: string;
  sourceId: string;
  rawPath: string;
  sha256: string;
  retrievedAt: string;
  rocDate: string;
  title: string;
  candidateIds: string[];
};

type ProfileAnchor = {
  rocDate: string;
  title: string;
  candidateIds: string[];
};

function buildProfileAnchors(
  profiles: MemberProfile[],
): Map<string, ProfileAnchor> {
  const anchors = new Map<string, ProfileAnchor>();

  for (const profile of profiles) {
    NEWS_ANCHOR.lastIndex = 0;
    let match = NEWS_ANCHOR.exec(profile.html);

    while (match) {
      const newsId = match[1] ?? '';
      if (newsId) {
        const existing = anchors.get(newsId);
        if (existing) {
          if (!existing.candidateIds.includes(profile.candidateId)) {
            existing.candidateIds.push(profile.candidateId);
          }
        } else {
          anchors.set(newsId, {
            rocDate: (match[3] ?? '').trim(),
            title: (match[2] ?? '').trim(),
            candidateIds: [profile.candidateId],
          });
        }
      }

      match = NEWS_ANCHOR.exec(profile.html);
    }
  }

  return anchors;
}

function loadNewsPages(
  manifest: NewsManifest,
  anchors: Map<string, ProfileAnchor>,
): NewsPage[] {
  const pages: NewsPage[] = [];

  for (const entry of manifest.entries) {
    const anchor = anchors.get(entry.newsId);
    if (!anchor) continue;

    pages.push({
      newsId: entry.newsId,
      url: entry.url,
      sourceId: 'political-career-kcc-news-' + entry.newsId,
      rawPath: entry.rawPath,
      sha256: entry.sha256,
      retrievedAt: entry.retrievedAt,
      rocDate: anchor.rocDate,
      title: anchor.title,
      candidateIds: anchor.candidateIds,
    });
  }

  return pages;
}

function attributedParagraphs(
  paragraphs: string[],
  memberName: string,
  memberNames: string[],
): { paragraphs: string[]; basis: string; structured: boolean } {
  const blocks = new Map<string, string[]>();
  let current: string | null = null;

  for (const paragraph of paragraphs) {
    const heading = paragraph.match(SECTION_HEADING);
    if (heading) {
      current = (heading[2] ?? '').trim();
      if (!blocks.has(current)) blocks.set(current, []);
      continue;
    }
    if (current) {
      const block = blocks.get(current);
      if (block) block.push(paragraph);
    }
  }

  const block = blocks.get(memberName);
  if (block && block.length > 0) {
    return {
      paragraphs: block,
      basis: '議會新聞稿以「(一)姓名議員總質詢摘要」分段，逐段歸屬該議員。',
      structured: true,
    };
  }

  const surnameCount = new Map<string, number>();
  for (const name of memberNames) {
    const surname = name.slice(0, 1);
    surnameCount.set(surname, (surnameCount.get(surname) ?? 0) + 1);
  }

  const surnameUnique = (surnameCount.get(memberName.slice(0, 1)) ?? 0) === 1;
  const patterns = surnameUnique
    ? [memberName + '議員', memberName]
    : [memberName];

  const matched = paragraphs.filter((paragraph) =>
    patterns.some((pattern) => paragraph.includes(pattern)),
  );

  return {
    paragraphs: matched,
    basis: surnameUnique
      ? '同一新聞稿僅一位同姓議員，遂以「姓名」或「姓＋議員」指稱歸屬該議員；未以機構整體決議推論個人行為。'
      : '同一新聞稿有多位同姓議員，僅以完整姓名指稱的段落歸屬該議員。',
    structured: false,
  };
}

type PageText = { paragraphs: string[] };

type PageKind = 'interpellation' | 'proposal' | 'budget' | 'press';

function pageKindOf(title: string): PageKind {
  if (/質詢/.test(title)) return 'interpellation';
  if (/提案|議案|條例|自治規則|修正案|法案/.test(title)) return 'proposal';
  if (/預算/.test(title)) return 'budget';
  return 'press';
}

const KIND_META: Record<
  PageKind,
  {
    category: PoliticalActivityCategory;
    actionType: PoliticalAction;
    role: string;
  }
> = {
  interpellation: {
    category: 'council-interpellation',
    actionType: 'interpellate',
    role: '時任高雄市議員（質詢人）',
  },
  proposal: {
    category: 'council-proposal',
    actionType: 'propose',
    role: '時任高雄市議員（提案參與）',
  },
  budget: {
    category: 'budget-review',
    actionType: 'deliberate',
    role: '時任高雄市議員（預算審議）',
  },
  press: {
    category: 'municipal-governance',
    actionType: 'public-affairs-participation',
    role: '時任高雄市議員（市政參與）',
  },
};

function cleanTitle(value: string): string {
  const cleaned = value
    .replace(/^[（(]\s*(?:高雄訊|記者[^)）]*)\s*[)）]\s*/, '')
    .replace(/^高雄訊[：:、，,\s]*/, '')
    .replace(/^\d{2,3}年度/, '')
    .replace(/^[、，,。\s]+/, '')
    .replace(/[、，,\s]+$/, '')
    .trim();
  return truncate(cleaned, 34);
}

const SECTION_HEADING_PREFIX =
  /^[（(][一二三四五六七八九十百]+[)）]\s*[^，。；]{0,14}(?:議員|副議長|議長)[^，。；]{0,10}(?:摘要|質詢)[，、：:]?\s*/;

function stripSectionHeading(value: string): string {
  return value
    .replace(/^[(（]\s*(?:高雄訊|記者[^)）]{0,24})\s*[)）]\s*/, '')
    .replace(/^高雄訊[：:、，,\s]*/, '')
    .replace(SECTION_HEADING_PREFIX, '')
    .trim();
}

function selectOwnSentences(
  paragraphs: string[],
  memberName: string,
  pageNames: string[],
  rosterNames: string[],
  structured: boolean,
): string[] {
  const surnameToken = memberName.slice(0, 1) + '議員';
  const surnameUnique = pageNames.every(
    (name) =>
      name === memberName || name.slice(0, 1) !== memberName.slice(0, 1),
  );
  const others = rosterNames.filter((name) => name !== memberName);
  const selected: string[] = [];

  for (const paragraph of paragraphs) {
    for (const sentence of splitSentences(paragraph)) {
      const trimmed = sentence.trim();
      if (trimmed.length < 8) continue;

      const mentionsSelf =
        trimmed.includes(memberName) ||
        (surnameUnique && trimmed.includes(surnameToken));
      if (!structured && !mentionsSelf) continue;
      if (others.some((name) => trimmed.includes(name))) continue;
      if (CEREMONIAL_VERB.test(trimmed)) continue;
      if (!mentionsSelf && !GOVERNANCE_VERB.test(trimmed)) continue;
      if (
        selected.some(
          (existing) =>
            existing.includes(trimmed) || trimmed.includes(existing),
        )
      ) {
        continue;
      }

      selected.push(trimmed);
    }
  }

  return selected;
}

const MAX_ACTIVITIES_PER_CANDIDATE = 40;

function buildNewsActivities(
  roster: RosterCandidate[],
  profiles: MemberProfile[],
  pages: NewsPage[],
  pageTexts: Map<string, PageText>,
  personIdOf: (candidateId: string) => string,
): { activities: PoliticalActivity[]; usedSourceIds: Set<string> } {
  const byCandidate = new Map(
    roster.map((candidate) => [candidate.id, candidate]),
  );
  const nameById = new Map(
    roster.map((candidate) => [candidate.id, candidate.displayName]),
  );
  const profileCandidateIds = new Set(
    profiles.map((profile) => profile.candidateId),
  );
  const activities: PoliticalActivity[] = [];
  const usedSourceIds = new Set<string>();
  const seen = new Set<string>();
  const rosterNames = roster
    .map((candidate) => candidate.displayName)
    .filter((name) => name.length >= 2)
    .sort((a, b) => b.length - a.length);

  for (const page of pages) {
    if (ANNOUNCEMENT_PAGE.test(page.title)) continue;
    const date = rocDateToIso(page.rocDate);
    if (!date) continue;

    const paragraphs = pageTexts.get(page.newsId)?.paragraphs ?? [];
    if (paragraphs.length === 0) continue;

    const kind = pageKindOf(page.title);
    const meta = KIND_META[kind];
    const pageNames = page.candidateIds
      .map((candidateId) => nameById.get(candidateId) ?? '')
      .filter((name) => name.length > 0);

    for (const candidateId of page.candidateIds) {
      const candidate = byCandidate.get(candidateId);
      if (!candidate) continue;

      const attribution = attributedParagraphs(
        paragraphs,
        candidate.displayName,
        pageNames,
      );
      const own = selectOwnSentences(
        attribution.paragraphs,
        candidate.displayName,
        pageNames,
        rosterNames,
        attribution.structured,
      );
      if (own.length === 0) continue;

      const ownText = own
        .map((sentence) => stripSectionHeading(sentence))
        .filter(Boolean);
      const description = truncate(ownText.slice(0, 2).join(''), 200);
      const dedupeKey =
        candidateId +
        '|' +
        date +
        '|' +
        description.replace(/\s+/g, '').slice(0, 40);
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      const topics: string[] = [];
      for (const sentence of own) {
        const topic = topicOf(sentence);
        if (!topic) continue;
        if (topics.some((existing) => existing.includes(topic))) continue;
        topics.push(topic);
        if (topics.length >= 2) break;
      }

      const responseSentence =
        paragraphs
          .flatMap((paragraph) => splitSentences(paragraph))
          .filter(
            (sentence) =>
              RESPONSE_MARKER.test(sentence) &&
              !sentence.includes(candidate.displayName) &&
              !rosterNames.some((name) => sentence.includes(name)) &&
              /局|處|市長|副市長|委員會/.test(sentence),
          )
          .pop() ?? null;

      const hasProfile = profileCandidateIds.has(candidateId);
      const suffix = kind === 'press' ? '-affairs' : '';

      activities.push({
        id: 'activity-' + candidate.slug + '-' + page.newsId + suffix,
        candidateId,
        personId: personIdOf(candidateId),
        positionId: null,
        date,
        datePrecision: 'day',
        category: meta.category,
        actionType: meta.actionType,
        title: cleanTitle(topics.join('、') || page.title),
        description,
        role: meta.role,
        venue: '高雄市議會',
        sessionLabel: null,
        outcome: responseSentence ? truncate(responseSentence, 160) : null,
        outcomeStatus: responseSentence
          ? 'institutional-response'
          : 'not-documented',
        sourceId: page.sourceId,
        evidenceExcerpt: truncate(own[0] ?? '', 240),
        attribution: 'institutional-record',
        identityBasis: hasProfile
          ? '議員服務政見頁「相關新聞」連結指向本頁；' + attribution.basis
          : '未取得議員服務政見頁，僅採本頁以完整姓名「' +
            candidate.displayName +
            '」指稱且未提及同頁其他候選人的句子。',
      });

      usedSourceIds.add(page.sourceId);
    }
  }

  const perCandidate = new Map<string, number>();
  const newestFirst = [...activities].sort((a, b) =>
    b.date.localeCompare(a.date),
  );
  const capped: PoliticalActivity[] = [];
  for (const activity of newestFirst) {
    const count = perCandidate.get(activity.candidateId) ?? 0;
    if (count >= MAX_ACTIVITIES_PER_CANDIDATE) continue;
    perCandidate.set(activity.candidateId, count + 1);
    capped.push(activity);
  }

  return { activities: capped, usedSourceIds };
}

function buildNameScanActivities(
  roster: RosterCandidate[],
  profiles: MemberProfile[],
  pages: NewsPage[],
  pageTexts: Map<string, PageText>,
  personIdOf: (candidateId: string) => string,
): PoliticalActivity[] {
  const profileIds = new Set(profiles.map((profile) => profile.candidateId));
  const targets = roster.filter((candidate) => !profileIds.has(candidate.id));
  if (targets.length === 0) return [];

  const rosterNames = roster
    .map((candidate) => candidate.displayName)
    .filter((name) => name.length >= 2)
    .sort((a, b) => b.length - a.length);

  const collected: PoliticalActivity[] = [];

  for (const page of pages) {
    if (ANNOUNCEMENT_PAGE.test(page.title)) continue;
    const date = rocDateToIso(page.rocDate);
    if (!date) continue;

    const paragraphs = pageTexts.get(page.newsId)?.paragraphs ?? [];
    if (paragraphs.length === 0) continue;

    const kind = pageKindOf(page.title);
    const meta = KIND_META[kind];
    const sentences = paragraphs.flatMap((paragraph) =>
      splitSentences(paragraph),
    );

    for (const candidate of targets) {
      const name = candidate.displayName;
      const own = sentences.filter((sentence) => {
        let text = sentence;
        for (const longer of rosterNames) {
          if (longer !== name && longer.includes(name)) {
            text = text.split(longer).join('　');
          }
        }
        if (!text.includes(name)) return false;
        if (
          rosterNames.some((other) => other !== name && text.includes(other))
        ) {
          return false;
        }
        if (CEREMONIAL_VERB.test(sentence)) return false;
        if (!/議員|立法委員|立委/.test(sentence)) return false;
        return GOVERNANCE_VERB.test(sentence);
      });
      if (own.length === 0) continue;

      const ownText = own
        .map((sentence) => stripSectionHeading(sentence))
        .filter(Boolean);
      const description = truncate(ownText.slice(0, 2).join(''), 200);
      const topics: string[] = [];
      for (const sentence of own) {
        const topic = topicOf(sentence);
        if (!topic) continue;
        if (topics.some((existing) => existing.includes(topic))) continue;
        topics.push(topic);
        if (topics.length >= 2) break;
      }

      collected.push({
        id: 'activity-' + candidate.slug + '-' + page.newsId + '-scan',
        candidateId: candidate.id,
        personId: personIdOf(candidate.id),
        positionId: null,
        date,
        datePrecision: 'day',
        category: meta.category,
        actionType: meta.actionType,
        title: cleanTitle(topics.join('、') || page.title),
        description,
        role: /議員/.test(description)
          ? '時任高雄市議員（新聞稿指稱）'
          : '新聞稿指稱人物',
        venue: '高雄市議會',
        sessionLabel: null,
        outcome: null,
        outcomeStatus: 'not-documented',
        sourceId: page.sourceId,
        evidenceExcerpt: truncate(own[0] ?? '', 240),
        attribution: 'institutional-record',
        identityBasis:
          '本頁以完整姓名「' +
          name +
          '」指稱，且句子未提及候選人名冊中的其他姓名；未取得議員服務政見頁，故僅採姓名完全相符的敘述。',
      });
    }
  }

  const capped: PoliticalActivity[] = [];
  const perCandidate = new Map<string, number>();
  const newestFirst = [...collected].sort((a, b) =>
    b.date.localeCompare(a.date),
  );
  for (const activity of newestFirst) {
    const count = perCandidate.get(activity.candidateId) ?? 0;
    if (count >= 20) continue;
    perCandidate.set(activity.candidateId, count + 1);
    capped.push(activity);
  }

  return capped;
}

async function main(): Promise<void> {
  const roster = readJson<Roster>(ROSTER_PATH);
  const enrichment = readJson<{ sourceSnapshots: EnrichmentSnapshot[] }>(
    ENRICHMENT_PATH,
  );
  const manifest = readJson<NewsManifest>(MANIFEST_PATH);

  const profiles = loadMemberProfiles(enrichment.sourceSnapshots);
  const anchors = buildProfileAnchors(profiles);
  const pages = loadNewsPages(manifest, anchors);

  const pageTexts = new Map<string, PageText>();
  for (const page of pages) {
    pageTexts.set(page.newsId, {
      paragraphs: sectionParagraphs(
        readFileSync(absolute(page.rawPath), 'utf8'),
      ),
    });
  }

  const personIdOf = (candidateId: string): string =>
    'person-' + candidateId.replace(/^official-(?:mayor|candidate)-2026-/, '');

  const { officeTerms, politicalRoles } = buildOfficeTerms(
    roster.candidates,
    profiles,
    personIdOf,
  );

  const newsActivities = buildNewsActivities(
    roster.candidates,
    profiles,
    pages,
    pageTexts,
    personIdOf,
  );

  const curated: CuratedRecordSet = existsSync(absolute(CURATED_PATH))
    ? readJson<CuratedRecordSet>(CURATED_PATH)
    : { sources: [], officeTerms: [], activities: [] };

  const sources: PoliticalCareerSource[] = [];
  const sourceIds = new Set<string>();

  const pushSource = (source: PoliticalCareerSource): void => {
    if (sourceIds.has(source.sourceId)) return;
    sourceIds.add(source.sourceId);
    sources.push(source);
  };

  for (const profile of profiles) {
    pushSource(
      profileSource(
        profile,
        '高雄市議會議員服務政見頁（msn ' + profile.msn + '）',
      ),
    );
  }

  for (const page of pages) {
    pushSource({
      sourceId: page.sourceId,
      url: page.url,
      publisher: '高雄市議會',
      title: page.title,
      tier: 'tier-2-authoritative',
      retrievedAt: page.retrievedAt,
      rawPath: page.rawPath,
      sha256: page.sha256,
      note: '議會新聞稿原文快照；質詢敘述與機關回應均取自本頁。',
    });
  }

  pushSource({
    sourceId: 'political-career-roster',
    url: 'https://web.cec.gov.tw/central/article/65213',
    publisher: '中央選舉委員會',
    title: '中選會審定115年直轄市長、直轄市議員候選人資格（候選人名冊）',
    tier: 'tier-1-primary',
    retrievedAt: SNAPSHOT_DATE + 'T00:00:00.000Z',
    rawPath: ROSTER_PATH,
    sha256: sha256(readFileSync(absolute(ROSTER_PATH))),
    note: '候選人姓名、選區與政黨身分以此名冊為準。',
  });

  if (existsSync(absolute(MANIFEST_PATH))) {
    pushSource({
      sourceId: 'political-career-kcc-news-corpus',
      url: 'https://www.kcc.gov.tw/MemberInfo_New.aspx?n=39&sms=9028',
      publisher: '高雄市議會',
      title:
        '高雄市議會議員服務政見頁「相關新聞」連結總覽（' +
        pages.length +
        ' 篇新聞稿）',
      tier: 'tier-2-authoritative',
      retrievedAt: SNAPSHOT_DATE + 'T00:00:00.000Z',
      rawPath: MANIFEST_PATH,
      sha256: sha256(readFileSync(absolute(MANIFEST_PATH))),
      note: '檢索範圍登錄檔：議員服務政見頁所連結之議會新聞稿清單。',
    });
  }

  for (const source of curated.sources) pushSource(source);

  const publicService = buildPublicServiceRecords({ personIdOf, pushSource });

  const nameScanActivities = buildNameScanActivities(
    roster.candidates,
    profiles,
    pages,
    pageTexts,
    personIdOf,
  );

  const activities = [
    ...newsActivities.activities,
    ...nameScanActivities,
    ...curated.activities,
  ];

  const activityIds = new Set<string>();
  for (const activity of activities) {
    if (activityIds.has(activity.id)) {
      throw new Error('duplicate activity id: ' + activity.id);
    }
    activityIds.add(activity.id);
  }

  // A curated public-service position supersedes the term parsed from the
  // council profile when both describe the same elected office for the same
  // person: the curated record carries the exact organisation and evidence.
  const curatedElectedKeys = new Set(
    publicService.officeTerms
      .filter((term) => term.employmentType === 'elected')
      .map((term) => term.candidateId + '|' + term.officeTitle),
  );
  const parsedOfficeTerms = officeTerms.filter(
    (term) =>
      !curatedElectedKeys.has(term.candidateId + '|' + term.officeTitle),
  );

  const allOfficeTerms = [
    ...parsedOfficeTerms,
    ...curated.officeTerms,
    ...publicService.officeTerms,
  ];
  const officeIds = new Set<string>();
  for (const term of allOfficeTerms) {
    if (officeIds.has(term.id)) {
      throw new Error('duplicate office term id: ' + term.id);
    }
    officeIds.add(term.id);
  }

  const coverageNotes = new Map<string, string>(
    (curated.coverageNotes ?? []).map((entry) => [
      entry.candidateId,
      entry.note,
    ]),
  );
  const profileLookup = new Map(
    profiles.map((profile) => [profile.candidateId, profile]),
  );

  const coverage: CareerCoverage[] = roster.candidates.map((candidate) => {
    const ownActivities = activities.filter(
      (activity) => activity.candidateId === candidate.id,
    );
    const ownOffices = allOfficeTerms.filter(
      (term) => term.candidateId === candidate.id,
    );
    const ownProjects = publicService.governmentProjects.filter(
      (record) => record.candidateId === candidate.id,
    );
    const ownProposals = publicService.legislativeProposals.filter(
      (record) => record.candidateId === candidate.id,
    );
    const ownVotes = publicService.votingRecords.filter(
      (record) => record.candidateId === candidate.id,
    );
    const profile = profileLookup.get(candidate.id);

    const searchedSourceIds = [
      'political-career-roster',
      ...(profile ? [profile.sourceId] : []),
      'political-career-kcc-news-corpus',
    ];

    const totalRecords =
      ownOffices.length +
      ownActivities.length +
      ownProjects.length +
      ownProposals.length +
      ownVotes.length;

    const fallbackNote =
      totalRecords > 0
        ? '已取得 ' +
          String(ownOffices.length) +
          ' 筆公職、' +
          String(ownProjects.length) +
          ' 筆政府專案、' +
          String(ownProposals.length) +
          ' 筆立法提案、' +
          String(ownVotes.length) +
          ' 筆表決與 ' +
          String(ownActivities.length) +
          ' 筆議會活動紀錄。'
        : '已檢索議員服務政見頁、議會新聞稿與立法院開放資料，未取得可歸屬至本人的從政紀錄；查無紀錄不代表未從事政治活動。';

    return {
      candidateId: candidate.id,
      displayName: candidate.displayName,
      districtId: candidate.districtId,
      electionType: candidate.electionType,
      status: totalRecords > 0 ? 'records-found' : 'no-verifiable-record-found',
      officeTermCount: ownOffices.length,
      activityCount: ownActivities.length,
      governmentPositionCount: ownOffices.filter(
        (term) => term.positionType === 'government-employment',
      ).length,
      legislativePositionCount: ownOffices.filter(
        (term) => term.positionType === 'legislative-office',
      ).length,
      councilPositionCount: ownOffices.filter(
        (term) => term.positionType === 'council-office',
      ).length,
      electedOfficeCount: ownOffices.filter(
        (term) => term.positionType === 'elected-office',
      ).length,
      governmentProjectCount: ownProjects.length,
      legislativeProposalCount: ownProposals.length,
      votingRecordCount: ownVotes.length,
      searchedSourceIds,
      note: coverageNotes.get(candidate.id) ?? fallbackNote,
    };
  });

  const dataset = {
    datasetId: 'kaohsiung-2026-political-career' as const,
    snapshotDate: SNAPSHOT_DATE,
    researchCutoff: SNAPSHOT_DATE,
    rosterSnapshotDate: '2026-11-12',
    candidateCount: roster.candidates.length as 106,
    sources,
    officeTerms: [...allOfficeTerms].sort((a, b) => a.id.localeCompare(b.id)),
    activities: [...activities].sort(
      (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
    ),
    governmentProjects: [...publicService.governmentProjects].sort(
      (a, b) =>
        a.candidateId.localeCompare(b.candidateId) || a.id.localeCompare(b.id),
    ),
    legislativeProposals: [...publicService.legislativeProposals].sort(
      (a, b) =>
        a.candidateId.localeCompare(b.candidateId) || a.id.localeCompare(b.id),
    ),
    votingRecords: [...publicService.votingRecords].sort(
      (a, b) =>
        a.candidateId.localeCompare(b.candidateId) ||
        a.votedAt.localeCompare(b.votedAt) ||
        a.id.localeCompare(b.id),
    ),
    coverage,
    review: {
      status: 'approved' as const,
      reviewerId: 'editorial-pipeline',
      reviewedAt: SNAPSHOT_DATE,
      approvedAt: SNAPSHOT_DATE,
      scopeNote:
        '僅收錄已保留文件可逐字核對的從政紀錄：議員服務政見頁的屆次、議會新聞稿中以姓名歸屬的質詢與市政參與，以及人工查證並附來源的補充紀錄。',
      limitations: [
        '屆次取自議員服務政見頁「經歷」欄位；部分條目未載明起訖日期，故不推定日期。',
        '議會新聞稿為機關新聞稿，屬二手敘述；未逐案核對議事錄與發言紀錄。',
        '立法院表決僅收錄記名表決名單；未記名或未列名者以「未個別記錄」呈現，不推定其立場。',
        '立法提案狀態取自立法院開放資料最新進度，非最終立法結果；未經三讀者不視為法律，最新進度可能包含擷取日後之院會議程。',
        '政府專案僅收錄報導同時載明候選人姓名與職稱者；未具名或僅描述機關作為者，不歸因於候選人。',
        '未持有議員服務政見頁的候選人，僅採新聞稿中以完整姓名指稱的內容。',
        '同一候選人最多保留 40 筆活動紀錄（依日期新到舊），超出部分未列出，不代表未發生。',
        '競選承諾與已發生之從政紀錄分開呈現，承諾內容不計入已發生紀錄。',
      ],
    },
  };

  validatePoliticalCareerDataset(dataset);

  mkdirSync(absolute('data/approved/2026'), { recursive: true });
  writeFileSync(
    absolute(OUTPUT_PATH),
    JSON.stringify(dataset, null, 2) + '\n',
    'utf8',
  );

  const withRecords = coverage.filter(
    (row) => row.status === 'records-found',
  ).length;

  console.log(
    '[political-career] ' +
      String(dataset.officeTerms.length) +
      ' office terms, ' +
      String(dataset.activities.length) +
      ' activities, ' +
      String(withRecords) +
      '/' +
      String(coverage.length) +
      ' candidates with records -> ' +
      OUTPUT_PATH,
  );
  console.log(
    '[political-career] political roles extracted (not published): ' +
      String(politicalRoles.length),
  );
}

await main();
