import { createHash } from 'node:crypto';
import {
  type NewsArticle,
  type NewsDateStatus,
  NewsDateSchema,
  NewsIdentityRiskSchema,
  normalizeHeadline,
  normalizeUrl,
} from './schema';

export const NEWS_SOURCES = {
  ltn: {
    sourceId: 'ltn' as const,
    publisher: '自由時報',
    publisherType: 'national-news' as const,
    searchUrl: (query: string) =>
      'https://search.ltn.com.tw/list?keyword=' + encodeURIComponent(query),
  },
  ettoday: {
    sourceId: 'ettoday' as const,
    publisher: 'ETtoday新聞雲',
    publisherType: 'digital-native' as const,
    searchUrl: (query: string) =>
      'https://www.ettoday.net/news_search/doSearch.php?keywords=' +
      encodeURIComponent(query),
  },
  cna: {
    sourceId: 'cna' as const,
    publisher: '中央社',
    publisherType: 'national-news' as const,
    searchUrl: (query: string) =>
      'https://www.cna.com.tw/search/hysearchws.aspx?q=' + encodeURIComponent(query),
  },
} as const;

export type NewsSourceKey = keyof typeof NEWS_SOURCES;

export type SearchHit = {
  sourceId: NewsSourceKey;
  url: string;
  headline: string;
  publicationDate: string | null;
  snippet: string;
};

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    );
}

function cleanText(value: string): string {
  return decodeEntities(value.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function dateFromCompact(value: string): string | null {
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  if (!match) return null;
  const iso = match[1] + '-' + match[2] + '-' + match[3];
  return NewsDateSchema.safeParse(iso).success ? iso : null;
}

function dateFromSlash(value: string): string | null {
  const match = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(value.trim());
  if (!match) return null;
  return dateFromCompact((match[1] ?? '') + (match[2] ?? '') + (match[3] ?? ''));
}

function dateFromArticleUrl(url: string): string | null {
  const compact = /\/(\d{8})\//.exec(url)?.[1];
  if (compact) return dateFromCompact(compact);
  const cna = /\/(\d{8})\d+\.aspx/.exec(url)?.[1];
  if (cna) return dateFromCompact(cna);
  return null;
}

/** Parses search.ltn.com.tw result list items. */
export function parseLtnSearch(html: string): SearchHit[] {
  const hits: SearchHit[] = [];
  const blocks = html.split('<li>').slice(1);
  for (const block of blocks) {
    const anchor = /<a href="(https:\/\/news\.ltn\.com\.tw\/news\/[^"]+)"[^>]*class="tit"[^>]*title="([^"]*)"/.exec(
      block,
    );
    if (!anchor) continue;
    const date = /<span class="time">([^<]+)<\/span>/.exec(block)?.[1] ?? '';
    const snippet = /<p>([\s\S]*?)<\/p>/.exec(block)?.[1] ?? '';
    hits.push({
      sourceId: 'ltn',
      url: decodeEntities(anchor[1] ?? ''),
      headline: cleanText(decodeEntities(anchor[2] ?? '')),
      publicationDate: dateFromSlash(date),
      snippet: cleanText(snippet),
    });
  }
  return hits;
}

/** Parses ettoday.net keyword search results (date comes from the URL). */
export function parseEttodaySearch(html: string): SearchHit[] {
  const hits: SearchHit[] = [];
  const pattern =
    /href="(https:\/\/www\.ettoday\.net\/news\/\d{8}\/\d+\.htm)"[^>]*>([^<]{4,200})</g;
  for (const match of html.matchAll(pattern)) {
    const url = match[1] ?? '';
    const headline = cleanText(match[2] ?? '');
    if (!headline) continue;
    hits.push({
      sourceId: 'ettoday',
      url,
      headline,
      publicationDate: dateFromArticleUrl(url),
      snippet: '',
    });
  }
  return hits;
}

/** Parses cna.com.tw search JSON-LD result list. */
export function parseCnaSearch(html: string): SearchHit[] {
  const hits: SearchHit[] = [];
  const pattern = /"name":"([^"]{4,240})","url":"(https:\/\/www\.cna\.com\.tw\/news\/[^"]+)"/g;
  for (const match of html.matchAll(pattern)) {
    const headline = cleanText(decodeEntities(match[1] ?? ''));
    const url = decodeEntities(match[2] ?? '');
    if (!headline) continue;
    hits.push({
      sourceId: 'cna',
      url,
      headline,
      publicationDate: dateFromArticleUrl(url),
      snippet: '',
    });
  }
  return hits;
}

export function parseSearchResults(
  sourceId: NewsSourceKey,
  html: string,
): SearchHit[] {
  const seen = new Set<string>();
  const hits =
    sourceId === 'ltn'
      ? parseLtnSearch(html)
      : sourceId === 'ettoday'
        ? parseEttodaySearch(html)
        : parseCnaSearch(html);
  return hits.filter((hit) => {
    const key = normalizeUrl(hit.url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export type ArticleDocument = {
  url: string;
  canonicalUrl: string | null;
  headline: string | null;
  publisher: string | null;
  datePublished: string | null;
  dateModified: string | null;
  description: string | null;
  bodyText: string;
  metadataSource: 'json-ld' | 'open-graph' | 'html';
};

type JsonLdNode = Record<string, unknown>;

function collectJsonLd(html: string): JsonLdNode[] {
  const nodes: JsonLdNode[] = [];
  const pattern = /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
  for (const match of html.matchAll(pattern)) {
    const raw = (match[1] ?? '').trim();
    if (!raw) continue;
    try {
      const parsed: unknown = JSON.parse(raw);
      const queue: unknown[] = Array.isArray(parsed) ? [...parsed] : [parsed];
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item || typeof item !== 'object') continue;
        const node = item as JsonLdNode;
        nodes.push(node);
        const graph = node['@graph'];
        if (Array.isArray(graph)) queue.push(...graph);
      }
    } catch {
      // A malformed JSON-LD block is skipped; the caller falls back to OG tags.
    }
  }
  return nodes;
}

function stringValue(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number') return String(value);
  return null;
}

function publisherName(node: JsonLdNode): string | null {
  const publisher = node.publisher;
  if (typeof publisher === 'string') return publisher;
  if (publisher && typeof publisher === 'object') {
    return stringValue((publisher as JsonLdNode).name);
  }
  return null;
}

function isoDate(value: string | null): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  return NewsDateSchema.safeParse(match[1] + '-' + match[2] + '-' + match[3])
    .success
    ? match[1] + '-' + match[2] + '-' + match[3]
    : null;
}

export function extractArticleDocument(
  html: string,
  url: string,
): ArticleDocument {
  const nodes = collectJsonLd(html);
  const articleNode = nodes.find((node) => {
    const type = node['@type'];
    const types = Array.isArray(type) ? type : [type];
    return types.some((item) =>
      ['NewsArticle', 'Article', 'ReportageNewsArticle', 'BlogPosting'].includes(
        String(item),
      ),
    );
  });
  const meta = (property: string): string | null => {
    const pattern = new RegExp(
      '<meta[^>]+(?:property|name)="' + property + '"[^>]+content="([^"]*)"',
      'i',
    );
    const value = pattern.exec(html)?.[1];
    return value ? decodeEntities(value).trim() || null : null;
  };
  const canonical =
    /<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i.exec(html)?.[1] ?? null;

  const headline =
    stringValue(articleNode?.headline) ??
    stringValue(articleNode?.name) ??
    meta('og:title') ??
    /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ??
    null;
  const publisher =
    (articleNode ? publisherName(articleNode) : null) ??
    meta('og:site_name') ??
    null;
  const datePublished =
    isoDate(stringValue(articleNode?.datePublished)) ??
    isoDate(meta('article:published_time')) ??
    dateFromArticleUrl(url);
  const dateModified =
    isoDate(stringValue(articleNode?.dateModified)) ??
    isoDate(meta('article:modified_time'));
  const description =
    stringValue(articleNode?.description) ?? meta('og:description') ?? null;

  // Article prose: JSON-LD articleBody first, then paragraph harvest, then whole page.
  const articleBody = stringValue(articleNode?.articleBody);
  const paragraphs = cleanText(
    [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
      .map((match) => match[1] ?? '')
      .filter((text) => !/function\s*\(|window\.|document\./.test(text))
      .filter((text) => !/建議使用 Chrome|Google首選/.test(text))
      .map((text) => cleanText(text))
      .filter((text) => text.length > 30)
      .join(' '),
  );
  const bodyText =
    articleBody && articleBody.trim().length > 200
      ? cleanText(articleBody)
      : paragraphs.length > 200
        ? paragraphs
        : cleanText(
            html
              .replace(/<script[\s\S]*?<\/script>/gi, ' ')
              .replace(/<style[\s\S]*?<\/style>/gi, ' ')
              .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
              .replace(/<svg[\s\S]*?<\/svg>/gi, ' '),
          );

  return {
    url,
    canonicalUrl: canonical ? decodeEntities(canonical) : null,
    headline: headline ? cleanText(headline) : null,
    publisher: publisher ? cleanText(publisher) : null,
    datePublished,
    dateModified,
    description: description ? cleanText(description) : null,
    bodyText,
    metadataSource: articleNode ? 'json-ld' : meta('og:title') ? 'open-graph' : 'html',
  };
}

export type CandidateIdentity = {
  candidateId: string;
  name: string;
  aliases: readonly string[];
  districtId: string;
  electionType: string;
  party: string;
  officeLabel: string;
};

const DISTRICT_TOKENS: Record<string, string[]> = {
  'district-kaohsiung-mayor-2026': ['高雄市長', '市長', '高雄'],
  'district-kaohsiung-council-01': ['第1選區', '第一選區', '桃源', '那瑪夏', '甲仙', '六龜', '杉林', '內門', '旗山', '美濃', '茂林'],
  'district-kaohsiung-council-02': ['第2選區', '第二選區', '茄萣', '湖內', '路竹', '阿蓮', '田寮'],
  'district-kaohsiung-council-03': ['第3選區', '第三選區', '岡山', '橋頭', '燕巢', '梓官', '彌陀', '永安'],
  'district-kaohsiung-council-04': ['第4選區', '第四選區', '左營', '楠梓'],
  'district-kaohsiung-council-05': ['第5選區', '第五選區', '大社', '仁武', '鳥松', '大樹'],
  'district-kaohsiung-council-06': ['第6選區', '第六選區', '鼓山', '鹽埕', '旗津'],
  'district-kaohsiung-council-07': ['第7選區', '第七選區', '三民'],
  'district-kaohsiung-council-08': ['第8選區', '第八選區', '新興', '前金', '苓雅'],
  'district-kaohsiung-council-09': ['第9選區', '第九選區', '鳳山'],
  'district-kaohsiung-council-10': ['第10選區', '第十選區', '前鎮', '小港'],
  'district-kaohsiung-council-11': ['第11選區', '第十一選區', '大寮', '林園'],
  'district-kaohsiung-indigenous-flat-12': ['平地原住民', '原住民'],
  'district-kaohsiung-indigenous-mountain-13': ['山地原住民', '原住民'],
  'district-kaohsiung-indigenous-mountain-14': ['山地原住民', '原住民'],
  'district-kaohsiung-indigenous-mountain-15': ['山地原住民', '原住民'],
};

export function contextSignalsFor(
  candidate: CandidateIdentity,
  text: string,
): string[] {
  const signals: string[] = [];
  for (const token of DISTRICT_TOKENS[candidate.districtId] ?? []) {
    if (text.includes(token)) signals.push(token);
  }
  for (const token of ['市議員', '議員', '市議會', '議會', '高雄']) {
    if (text.includes(token)) signals.push(token);
  }
  if (candidate.party && candidate.party.length > 1 && text.includes(candidate.party)) {
    signals.push(candidate.party);
  }
  return [...new Set(signals)];
}

export type IdentityAssessment = NewsArticle['identity'];

export function assessIdentity(
  candidate: CandidateIdentity,
  headline: string,
  bodyText: string,
): IdentityAssessment {
  const names = [candidate.name, ...candidate.aliases];
  const matchedName = names.find((name) => headline.includes(name)) ??
    names.find((name) => bodyText.includes(name));
  if (!matchedName) {
    return {
      matchedName: candidate.name,
      matchedIn: 'body',
      contextSignals: [],
      namesakeRisk: 'high',
      note: '候選人姓名未出現在標題或內文擷取範圍。',
    };
  }
  const inHeadline = headline.includes(matchedName);
  const inBody = bodyText.includes(matchedName);
  const signals = contextSignalsFor(candidate, headline + ' ' + bodyText.slice(0, 4000));
  const shortName = matchedName.length <= 2;
  // A generic token such as 高雄 or 議員 is not enough to clear a name match:
  // 林彥 must not be cleared by an article about 林彥甫 in another city.
  const specificSignals = signals.filter(
    (signal) => !['市議員', '議員', '市議會', '議會', '高雄'].includes(signal),
  );
  const risk =
    inHeadline && specificSignals.length > 0
      ? 'low'
      : inHeadline || signals.length > 0
        ? shortName
          ? 'high'
          : 'medium'
        : 'high';
  return {
    matchedName,
    matchedIn:
      inHeadline && inBody ? 'headline-and-body' : inHeadline ? 'headline' : 'body',
    contextSignals: signals,
    namesakeRisk: NewsIdentityRiskSchema.parse(risk),
    note:
      risk === 'low'
        ? '姓名與選區／職稱線索同時出現於報導。'
        : risk === 'medium'
          ? '姓名出現，但選區／職稱線索不足，需人工確認是否同一人。'
          : '姓名可能與同名人物混淆，未達自動出版標準。',
  };
}

function similar(left: string, right: string): boolean {
  const a = normalizeHeadline(left);
  const b = normalizeHeadline(right);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

export type VerificationInput = {
  claimedHeadline: string;
  claimedPublisher: string;
  claimedDate: string | null;
  document: ArticleDocument;
  identity: IdentityAssessment;
  status: number;
};

export type VerificationOutcome = {
  status: 'verified' | 'failed';
  checks: Array<{
    check:
      | 'source-reachable'
      | 'url-canonical'
      | 'publisher-match'
      | 'headline-match'
      | 'publication-date'
      | 'identity'
      | 'relevance'
      | 'not-duplicate';
    passed: boolean;
    detail: string;
  }>;
  notes: string[];
  dateStatus: NewsDateStatus;
  publicationDate: string | null;
  excerpt: string;
};

export function buildVerification(
  input: VerificationInput,
  candidate: CandidateIdentity,
): VerificationOutcome {
  const { document, identity } = input;
  const checks: VerificationOutcome['checks'] = [];
  const notes: string[] = [];

  checks.push({
    check: 'source-reachable',
    passed: input.status === 200,
    detail: 'HTTP ' + input.status,
  });
  const canonical = document.canonicalUrl ? normalizeUrl(document.canonicalUrl) : null;
  checks.push({
    check: 'url-canonical',
    passed: !canonical || canonical === normalizeUrl(document.url),
    detail: canonical ?? 'no canonical tag',
  });
  checks.push({
    check: 'publisher-match',
    passed:
      !document.publisher ||
      document.publisher.includes(input.claimedPublisher) ||
      input.claimedPublisher.includes(document.publisher),
    detail: 'claimed=' + input.claimedPublisher + ' fetched=' + (document.publisher ?? 'none'),
  });
  checks.push({
    check: 'headline-match',
    passed: !!document.headline && similar(input.claimedHeadline, document.headline),
    detail: 'claimed=' + input.claimedHeadline + ' fetched=' + (document.headline ?? 'none'),
  });

  const fetchedDate = document.datePublished ?? dateFromArticleUrl(document.url);
  const dateStatus: NewsDateStatus = input.claimedDate
    ? fetchedDate
      ? fetchedDate === input.claimedDate
        ? 'confirmed'
        : 'conflicting'
      : 'missing'
    : fetchedDate
      ? 'inferred-from-url'
      : 'missing';
  if (dateStatus === 'conflicting') {
    notes.push('搜尋結果日期與文章頁日期不一致，保留文章頁日期。');
  }
  checks.push({
    check: 'publication-date',
    passed: dateStatus === 'confirmed' || dateStatus === 'inferred-from-url',
    detail: 'claimed=' + (input.claimedDate ?? 'none') + ' fetched=' + (fetchedDate ?? 'none'),
  });
  checks.push({
    check: 'identity',
    passed: identity.namesakeRisk === 'low',
    detail: identity.namesakeRisk + ' / ' + identity.contextSignals.join('、'),
  });
  checks.push({
    check: 'relevance',
    passed:
      document.headline !== null &&
      (document.headline.includes(candidate.name) ||
        document.bodyText.includes(candidate.name)),
    detail: 'name present in fetched document',
  });
  checks.push({
    check: 'not-duplicate',
    passed: true,
    detail: 'dedupe runs in the normalize stage',
  });

  const nameIndex = document.bodyText.indexOf(identity.matchedName);
  const excerptStart = Math.max(0, nameIndex - 220);
  const excerpt =
    nameIndex >= 0
      ? document.bodyText.slice(excerptStart, nameIndex + 480)
      : (document.description ?? document.bodyText.slice(0, 500));

  const status = checks.every((check) => check.passed) ? 'verified' : 'failed';
  return {
    status,
    checks,
    notes,
    dateStatus,
    publicationDate: fetchedDate,
    excerpt: excerpt.trim().slice(0, 900),
  };
}
