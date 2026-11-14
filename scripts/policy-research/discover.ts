import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import rosterInput from '../../data/approved/2026/kaohsiung-election.json';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const ROOT = process.cwd();
const RAW_DIR = path.join(ROOT, 'data/raw/policy/2026/news');
const DISCOVERY_DIR = path.join(ROOT, 'data/policy-research/2026/discovery');
const CANDIDATES_PATH = path.join(DISCOVERY_DIR, 'news-candidates.json');
const ITEMS_PATH = path.join(DISCOVERY_DIR, 'news-discovery.json');
const WINDOW_START = Date.parse('2025-12-01T00:00:00Z');
const RETRIEVED_AT = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
const OTHER_CITIES = [
  '台北',
  '新北',
  '桃園',
  '台中',
  '台南',
  '基隆',
  '新竹',
  '嘉義',
  '屏東',
  '宜蘭',
  '花蓮',
  '台東',
  '澎湖',
  '金門',
  '馬祖',
  '苗栗',
  '彰化',
  '南投',
  '雲林',
];

type Candidate = {
  id: string;
  displayName: string;
  districtId: string;
  electionType: string;
};

type RawItem = {
  title: string;
  link: string;
  publishedAt: string | null;
  publisher: string;
};

type DiscoveryCandidate = {
  candidateId: string;
  query: string;
  headline: string;
  publisher: string;
  publishedAt: string | null;
  googleNewsUrl: string;
};

type DiscoveryItem = DiscoveryCandidate & {
  resolvedUrl: string | null;
  httpStatus: number | null;
  retrievalStatus: 'retrieved' | 'blocked' | 'failed' | 'not-found';
  rawPath: string | null;
  sha256: string | null;
  byteLength: number | null;
  note: string;
};

const decode = (value: string): string =>
  value
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');

const stripTags = (value: string): string =>
  decode(value.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();

async function rssItems(query: string): Promise<RawItem[]> {
  const url =
    'https://news.google.com/rss/search?q=' +
    encodeURIComponent(query) +
    '&hl=zh-TW&gl=TW&ceid=TW:zh-Hant';
  const response = await fetch(url, {
    headers: { 'user-agent': UA },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) return [];
  const xml = await response.text();
  const items: RawItem[] = [];
  for (const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const body = match[1] ?? '';
    const title = stripTags(
      (body.match(/<title>([\s\S]*?)<\/title>/) ?? [])[1] ?? '',
    );
    const link = (
      (body.match(/<link>([\s\S]*?)<\/link>/) ?? [])[1] ?? ''
    ).trim();
    const date = (
      (body.match(/<pubDate>([\s\S]*?)<\/pubDate>/) ?? [])[1] ?? ''
    ).trim();
    const publisher = stripTags(
      (body.match(/<source[^>]*>([\s\S]*?)<\/source>/) ?? [])[1] ?? '',
    );
    if (!title || !link) continue;
    const parsed = date ? Date.parse(date) : Number.NaN;
    items.push({
      title,
      link,
      publishedAt: Number.isNaN(parsed)
        ? null
        : new Date(parsed).toISOString().slice(0, 10),
      publisher: publisher || 'unknown',
    });
  }
  return items;
}

function collectRows(value: unknown, depth = 0): unknown[][] | null {
  if (depth > 4 || !Array.isArray(value)) return null;
  if (value[0] === 'wrb.fr') return [value];
  const rows: unknown[][] = [];
  for (const entry of value) {
    const found = collectRows(entry, depth + 1);
    if (found) rows.push(...found);
  }
  return rows.length > 0 ? rows : null;
}

async function resolveNewsLink(link: string): Promise<string | null> {
  let id: string | undefined;
  try {
    id = new URL(link).pathname.split('/').pop();
  } catch {
    return null;
  }
  if (!id) return null;
  const page = await fetch('https://news.google.com/rss/articles/' + id, {
    headers: { 'user-agent': UA },
    signal: AbortSignal.timeout(20000),
  });
  if (!page.ok) return null;
  const html = await page.text();
  const signature = (html.match(/data-n-a-sg="([^"]+)"/) ?? [])[1];
  const timestamp = (html.match(/data-n-a-ts="([^"]+)"/) ?? [])[1];
  if (!signature || !timestamp) return null;
  const inner = JSON.stringify([
    'garturlreq',
    [
      [
        'X',
        'X',
        ['X', 'X'],
        null,
        null,
        1,
        1,
        'US:en',
        null,
        1,
        null,
        null,
        null,
        null,
        null,
        0,
        1,
      ],
      'X',
      'X',
      1,
      [2, 3, 4, 8],
      1,
      0,
      timestamp,
      0,
      0,
      null,
      0,
    ],
    id,
    Number(timestamp),
    signature,
  ]);
  const body =
    'f.req=' + encodeURIComponent(JSON.stringify([[['Fbv4je', inner]]]));
  const response = await fetch(
    'https://news.google.com/_/DotsSplashUi/data/batchexecute',
    {
      method: 'POST',
      headers: {
        'user-agent': UA,
        'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      body,
      signal: AbortSignal.timeout(20000),
    },
  );
  if (!response.ok) return null;
  const text = await response.text();
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('[[')) continue;
    try {
      const rows = collectRows(JSON.parse(trimmed));
      if (!rows) continue;
      for (const row of rows) {
        if (
          row[0] !== 'wrb.fr' ||
          row[1] !== 'Fbv4je' ||
          typeof row[2] !== 'string'
        )
          continue;
        const payload: unknown = JSON.parse(row[2]);
        if (
          Array.isArray(payload) &&
          payload[0] === 'garturlres' &&
          typeof payload[1] === 'string'
        ) {
          return payload[1];
        }
      }
    } catch {
      // keepalive or partial line
    }
  }
  return null;
}

const CJK = /[\u3400-\u9fff]/;

function extractArticleText(html: string): string {
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<aside[\s\S]*?<\/aside>/gi, ' ');
  const chunks = cleaned
    .split(/<\/(?:p|div|li|h[1-6]|section|article|td)>|<br\s*\/?>/i)
    .map((chunk) => stripTags(chunk))
    .filter((chunk) => chunk.length >= 24 && CJK.test(chunk));
  const seen = new Set<string>();
  const paragraphs: string[] = [];
  for (const chunk of chunks) {
    if (seen.has(chunk)) continue;
    seen.add(chunk);
    paragraphs.push(chunk);
  }
  return paragraphs.join('\n');
}

function parseJson<T>(raw: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    throw new Error(
      'Invalid JSON: ' +
        (error instanceof Error ? error.message : String(error)),
    );
  }
}

function assertPublicHttpUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('invalid URL ' + value);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('unsupported protocol ' + parsed.protocol);
  }
  const host = parsed.hostname;
  const blocked =
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host.endsWith('.local') ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  if (blocked) throw new Error('blocked host ' + host);
  return parsed.toString();
}

function slugFor(url: string): string {
  return createHash('sha256').update(url).digest('hex').slice(0, 16);
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    for (const key of [...parsed.searchParams.keys()]) {
      if (key.startsWith('utm_') || key === 'oc' || key === 'fbclid') {
        parsed.searchParams.delete(key);
      }
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

function isRelevant(candidate: Candidate, item: RawItem): boolean {
  if (!item.publishedAt) return false;
  const published = Date.parse(item.publishedAt + 'T00:00:00Z');
  if (Number.isNaN(published) || published < WINDOW_START) return false;
  if (!item.title.includes(candidate.displayName)) return false;
  const mentionsKaohsiung =
    item.title.includes('高雄') || item.title.includes('高市');
  const mentionsOtherCity = OTHER_CITIES.some((city) =>
    item.title.includes(city),
  );
  if (mentionsOtherCity && !mentionsKaohsiung) return false;
  return true;
}

function queriesFor(candidate: Candidate): string[] {
  const name = '"' + candidate.displayName + '"';
  const office = candidate.electionType === 'mayoral' ? '市長' : '議員';
  const queries = [name + ' 政見', name + ' 政策', name + ' 高雄 ' + office];
  if (candidate.districtId.includes('indigenous'))
    queries.push(name + ' 原住民 政見');
  return queries;
}

function capFor(candidate: Candidate): number {
  return candidate.electionType === 'mayoral' ? 30 : 12;
}

async function pool<T, R>(
  values: T[],
  limit: number,
  worker: (value: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let cursor = 0;
  const run = async (): Promise<void> => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      const value = values[index];
      if (value === undefined) return;
      results[index] = await worker(value);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, values.length) }, run),
  );
  return results;
}

async function runDiscovery(
  selected: Candidate[],
): Promise<DiscoveryCandidate[]> {
  const output: DiscoveryCandidate[] = [];
  for (const candidate of selected) {
    const cap = capFor(candidate);
    const perCandidate: DiscoveryCandidate[] = [];
    const seen = new Set<string>();
    for (const query of queriesFor(candidate)) {
      let items: RawItem[] = [];
      try {
        items = await rssItems(query);
      } catch {
        items = [];
      }
      for (const item of items) {
        if (!isRelevant(candidate, item)) continue;
        if (seen.has(item.link)) continue;
        seen.add(item.link);
        perCandidate.push({
          candidateId: candidate.id,
          query,
          headline: item.title.replace(/\s+-\s+[^-]+$/, '').trim(),
          publisher: item.publisher,
          publishedAt: item.publishedAt,
          googleNewsUrl: item.link,
        });
      }
      if (perCandidate.length >= cap) break;
    }
    output.push(...perCandidate.slice(0, cap));
    process.stdout.write(
      candidate.displayName + ': ' + Math.min(perCandidate.length, cap) + '\n',
    );
  }
  return output;
}

async function fetchOne(entry: DiscoveryCandidate): Promise<DiscoveryItem> {
  const record: DiscoveryItem = {
    ...entry,
    resolvedUrl: null,
    httpStatus: null,
    retrievalStatus: 'failed',
    rawPath: null,
    sha256: null,
    byteLength: null,
    note: '',
  };
  try {
    const resolved = await resolveNewsLink(entry.googleNewsUrl);
    if (!resolved) {
      record.retrievalStatus = 'not-found';
      record.note = 'Google News 連結解析失敗';
      return record;
    }
    record.resolvedUrl = normalizeUrl(resolved);
    const response = await fetch(assertPublicHttpUrl(record.resolvedUrl), {
      headers: { 'user-agent': UA, 'accept-language': 'zh-TW,zh;q=0.9' },
      redirect: 'follow',
      signal: AbortSignal.timeout(25000),
    });
    record.httpStatus = response.status;
    if (!response.ok) {
      record.retrievalStatus = 'blocked';
      record.note = 'HTTP ' + response.status;
      return record;
    }
    const html = await response.text();
    const text = extractArticleText(html);
    if (text.length < 200) {
      record.retrievalStatus = 'blocked';
      record.note = '無法擷取可用正文（可能為付費牆或腳本渲染）';
      return record;
    }
    const stored = [entry.headline, '', text].join('\n');
    const relative = path.join(
      'data/raw/policy/2026/news',
      slugFor(record.resolvedUrl) + '.txt',
    );
    await writeFile(path.join(ROOT, relative), stored, 'utf8');
    record.rawPath = relative.split(path.sep).join('/');
    record.sha256 = createHash('sha256').update(stored).digest('hex');
    record.byteLength = Buffer.byteLength(stored, 'utf8');
    record.retrievalStatus = 'retrieved';
    record.note = '正文擷取成功';
    return record;
  } catch (error) {
    record.retrievalStatus = 'failed';
    record.note = error instanceof Error ? error.message : 'unknown error';
    return record;
  }
}

async function main(): Promise<void> {
  const stageArg = process.argv.find((arg) => arg.startsWith('--stage='));
  const stage = stageArg ? stageArg.slice('--stage='.length) : 'all';
  const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
  const candidateArg = process.argv.find((arg) =>
    arg.startsWith('--candidate='),
  );
  const all = rosterInput.candidates as Candidate[];
  const filtered = candidateArg
    ? all.filter(
        (candidate) =>
          candidate.id === candidateArg.slice('--candidate='.length),
      )
    : all;
  const selected = limitArg
    ? filtered.slice(0, Number(limitArg.slice(8)))
    : filtered;

  await mkdir(RAW_DIR, { recursive: true });
  await mkdir(DISCOVERY_DIR, { recursive: true });

  let queued: DiscoveryCandidate[] = [];
  if (stage !== 'fetch') {
    queued = await runDiscovery(selected);
    await writeFile(
      CANDIDATES_PATH,
      JSON.stringify(
        {
          datasetId: 'kaohsiung-2026-policy-news-candidates',
          retrievedAt: RETRIEVED_AT,
          windowStart: '2025-12-01',
          candidatesProcessed: selected.length,
          items: queued,
        },
        null,
        2,
      ) + '\n',
      'utf8',
    );
  } else {
    const stored = parseJson<{ items: DiscoveryCandidate[] }>(
      await readFile(CANDIDATES_PATH, 'utf8'),
    );
    queued = stored.items;
  }

  if (stage === 'discovery') {
    process.stdout.write('discovery queued ' + queued.length + ' items\n');
    return;
  }

  const fetched = await pool(queued, 8, fetchOne);
  const counts: Record<string, number> = {};
  for (const item of fetched)
    counts[item.retrievalStatus] = (counts[item.retrievalStatus] ?? 0) + 1;
  await writeFile(
    ITEMS_PATH,
    JSON.stringify(
      {
        datasetId: 'kaohsiung-2026-policy-news-discovery',
        retrievedAt: RETRIEVED_AT,
        windowStart: '2025-12-01',
        candidatesProcessed: selected.length,
        items: fetched,
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );
  process.stdout.write(
    'fetched ' + fetched.length + ' items ' + JSON.stringify(counts) + '\n',
  );
}

await main();
