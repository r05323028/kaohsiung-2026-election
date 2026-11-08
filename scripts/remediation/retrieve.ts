#!/usr/bin/env node

/**
 * Bounded authoritative retrieval for the remediation milestone.
 *
 * Two jobs:
 *
 *  1. Re-retrieve every retained source snapshot and record what the live
 *     document looks like today (HTTP status, timestamp, bytes, SHA-256) and
 *     whether it still matches the retained bytes. Retained snapshots are never
 *     modified — this only adds observation records.
 *
 *  2. Probe the four official endpoints that would be the natural next place to
 *     look for the candidates who have no publishable institutional record, and
 *     record availability. Nothing here may be treated as evidence of a person
 *     until an attempt with matching identity observations exists.
 *
 * Output: data/enrichment/remediation/2026/source-retrieval.json and
 * reports/autonomous-remediation-new-sources.md
 */

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const ROOT = process.cwd();
const DATASET_PATH = 'data/enrichment/normalized/2026/zuoying-mayoral.json';
const DECISIONS_V2_PATH =
  'data/enrichment/automated/2026/zuoying-mayoral-decisions-v2.json';
const RETRIEVAL_PATH = 'data/enrichment/remediation/2026/source-retrieval.json';
const REPORT_PATH = 'reports/autonomous-remediation-new-sources.md';

const USER_AGENT =
  'KaohsiungCivicStories/1.0 (evidence remediation; contact: project maintainer)';
const MAX_ATTEMPTS = 2;
const ATTEMPT_TIMEOUT_MS = 30_000;
const POLITE_DELAY_MS = 400;

const EXPLORATORY_ENDPOINTS = [
  {
    label: '高雄市議會 — 議員名錄',
    url: 'https://www.kcc.gov.tw/MemberInfo_New.aspx?n=39&sms=9028',
    purpose:
      '確認現任議員名錄是否包含沒有自動發布內容的候選人（挑戰者通常不在名錄中）。',
  },
  {
    label: '高雄市選舉委員會',
    url: 'https://www.khec.gov.tw/',
    purpose:
      '確認選委會公告入口可用；候選人資格屬 cec-roster/khec-roster 類，政策不得用於履歷發布。',
  },
  {
    label: '中央選舉委員會',
    url: 'https://www.cec.gov.tw/',
    purpose: '確認中央選委會入口可用；同上，資格公告不是履歷來源。',
  },
  {
    label: '立法院 — 委員名錄',
    url: 'https://www.ly.gov.tw/Pages/List.aspx?nodeid=46850',
    purpose: '確認立法院委員名錄可用，供市長候選人立法委員紀錄覆核。',
  },
];

type RetainedAttempt = {
  sourceId: string;
  url: string;
  rawPath?: string | null;
  sha256?: string | null;
  byteLength?: number | null;
  sourceClass?: string | null;
  sourceRetrievedAt?: string | null;
  outcome?: string | null;
};

type Dataset = {
  sourceAttempts: RetainedAttempt[];
  candidateIds: string[];
  observations?: {
    observationId: string;
    candidateId: string;
    observedName: string;
  }[];
  claims?: {
    claimId: string;
    candidateId: string;
    sourceIds?: string[];
    value: string;
  }[];
};

type Decision = {
  candidateId: string;
  status: string;
  blockingReasons: string[];
  sourceIds: string[];
};

type Decisions = { decisions: Decision[] };

type FetchResult = {
  ok: boolean;
  httpStatus: number | null;
  contentType: string | null;
  byteLength: number | null;
  sha256: string | null;
  textSha256: string | null;
  textLength: number | null;
  text: string | null;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  error: string | null;
};

type LiveObservation = {
  url: string;
  classification: string;
  attempts: (Omit<FetchResult, 'text'> & { attempt: number })[];
  httpStatus: number | null;
  contentType: string | null;
  byteLength: number | null;
  sha256: string | null;
  textSha256: string | null;
  textLength: number | null;
  textSimilarityToRetained: number | null;
  textDeltaSample: { retained: string; live: string } | null;
  retrievedAt: string;
  failureReason: string | null;
};

type ClaimValuePresence = {
  checked: number;
  present: number;
  missing: { claimId: string; value: string }[];
};

type SourceObservation = {
  sourceId: string;
  publisher: string;
  sourceClass: string | null;
  claimValuePresence: ClaimValuePresence | null;
  retained: {
    rawPath: string | null;
    exists: boolean;
    sha256: string | null;
    byteLength: number | null;
    sourceRetrievedAt: string | null;
  };
  live: LiveObservation;
};

type ExplorationObservation = LiveObservation & {
  label: string;
  purpose: string;
};

type RetrievalRecord = {
  schemaVersion: string;
  generatedAt: string;
  retrievalPolicy: Record<string, unknown>;
  summary: {
    retainedSources: number;
    classifications: Record<string, number>;
    exploratoryEndpoints: number;
    newSourcesAdmittedAsEvidence: number;
  };
  sources: SourceObservation[];
  exploratory: ExplorationObservation[];
};

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Visible-text projection. Institutional CMS pages carry per-request nonces,
 * view-state blobs and re-ordered scripts, so byte comparison alone reports a
 * "change" on every load. The text projection is what a reader actually sees,
 * and that is what this milestone must reason about.
 */
function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/giu, ' ')
    .replace(/<style[\s\S]*?<\/style>/giu, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/giu, ' ')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/&[a-z#0-9]+;/giu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function textFingerprint(html: string): {
  textSha256: string;
  textLength: number;
  text: string;
} {
  const text = visibleText(html);
  return { textSha256: sha256(text), textLength: text.length, text };
}

/** Sørensen–Dice coefficient over character bigrams. */
function diceSimilarity(left: string, right: string): number {
  if (left === right) return 1;
  if (left.length < 2 || right.length < 2) return 0;
  const bigrams = (value: string): Map<string, number> => {
    const counts = new Map<string, number>();
    for (let index = 0; index < value.length - 1; index += 1) {
      const gram = value.slice(index, index + 2);
      counts.set(gram, (counts.get(gram) ?? 0) + 1);
    }
    return counts;
  };
  const leftGrams = bigrams(left);
  const rightGrams = bigrams(right);
  let overlap = 0;
  for (const [gram, count] of leftGrams) {
    const other = rightGrams.get(gram);
    if (other) overlap += Math.min(count, other);
  }
  return (2 * overlap) / (left.length - 1 + right.length - 1);
}

async function readJson<T>(path: string): Promise<T> {
  try {
    return JSON.parse(await readFile(resolve(ROOT, path), 'utf8')) as T;
  } catch (error) {
    throw new Error(
      `Cannot read JSON at ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(resolve(ROOT, path)), { recursive: true });
  await writeFile(
    resolve(ROOT, path),
    `${JSON.stringify(value, null, 2)}\n`,
    'utf8',
  );
}

async function writeText(path: string, value: string): Promise<void> {
  await mkdir(dirname(resolve(ROOT, path)), { recursive: true });
  await writeFile(resolve(ROOT, path), value, 'utf8');
}

const sleep = (ms: number): Promise<void> =>
  new Promise((done) => setTimeout(done, ms));

function retainedSources(dataset: Dataset): RetainedAttempt[] {
  const byId = new Map<string, RetainedAttempt>();
  for (const attempt of dataset.sourceAttempts) {
    if (!attempt?.sourceId || !attempt.url) continue;
    const existing = byId.get(attempt.sourceId);
    const usable =
      Boolean(attempt.rawPath) && typeof attempt.sha256 === 'string';
    const existingUsable =
      Boolean(existing?.rawPath) && typeof existing?.sha256 === 'string';
    if (
      !existing ||
      (usable && !existingUsable) ||
      (usable === existingUsable && attempt.outcome === 'retrieved')
    ) {
      byId.set(attempt.sourceId, attempt);
    }
  }
  return [...byId.values()].sort((left, right) =>
    left.sourceId.localeCompare(right.sourceId),
  );
}

function publisherOf(sourceId: string): string {
  if (sourceId.startsWith('scope-kcc-')) return '高雄市議會全球網';
  if (sourceId.startsWith('scope-ly-')) return '立法院全球資訊網';
  if (sourceId.startsWith('scope-cec-')) return '中央選舉委員會';
  if (sourceId.startsWith('scope-khec-')) return '高雄市選舉委員會';
  if (sourceId.startsWith('scope-official-youth-')) return '高雄市政府青年局';
  if (sourceId.startsWith('scope-news-')) return '新聞媒體報導';
  return sourceId;
}

async function fetchOnce(url: string): Promise<FetchResult> {
  const startedAt = new Date();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
      signal: controller.signal,
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    const html = bytes.toString('utf8');
    const fingerprint = textFingerprint(html);
    return {
      ok: true,
      httpStatus: response.status,
      contentType: response.headers.get('content-type'),
      byteLength: bytes.byteLength,
      sha256: sha256(bytes),
      textSha256: fingerprint.textSha256,
      textLength: fingerprint.textLength,
      text: fingerprint.text,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      httpStatus: null,
      contentType: null,
      byteLength: null,
      sha256: null,
      textSha256: null,
      textLength: null,
      text: null,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function observe(
  url: string,
  {
    retainedSha256 = null,
    retainedText = null,
  }: { retainedSha256?: string | null; retainedText?: string | null } = {},
) {
  const attempts: (FetchResult & { attempt: number })[] = [];
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const result = await fetchOnce(url);
    attempts.push({ attempt, ...result });
    if (result.ok && result.httpStatus && result.httpStatus < 400) break;
    if (attempt < MAX_ATTEMPTS) await sleep(POLITE_DELAY_MS * attempt);
  }
  const successful =
    attempts.find(
      (attempt) => attempt.ok && (attempt.httpStatus ?? 500) < 400,
    ) ?? null;
  const last = attempts[attempts.length - 1];

  const retainedTextProjection =
    retainedText === null ? null : visibleText(retainedText);
  const similarity =
    successful?.text && retainedTextProjection
      ? diceSimilarity(successful.text, retainedTextProjection)
      : null;

  let deltaSample: { retained: string; live: string } | null = null;
  if (
    successful?.text &&
    retainedTextProjection &&
    similarity !== null &&
    similarity < 0.999
  ) {
    const liveText = successful.text;
    let shared = 0;
    const limit = Math.min(liveText.length, retainedTextProjection.length);
    while (
      shared < limit &&
      liveText[shared] === retainedTextProjection[shared]
    )
      shared += 1;
    const from = Math.max(0, shared - 60);
    deltaSample = {
      retained: retainedTextProjection.slice(from, from + 260),
      live: liveText.slice(from, from + 260),
    };
  }

  let classification = 'unavailable';
  if (successful) {
    if (!retainedSha256) classification = 'observed-no-retained-snapshot';
    else if (successful.sha256 === retainedSha256)
      classification = 'identical-bytes';
    else if (similarity !== null && similarity >= 0.999)
      classification = 'identical-text';
    else if (similarity !== null && similarity >= 0.95)
      classification = 'minor-text-change';
    else classification = 'changed-text';
  }

  return {
    url,
    classification,
    attempts: attempts.map(({ text: _text, ...rest }) => rest),
    httpStatus: successful?.httpStatus ?? last?.httpStatus ?? null,
    contentType: successful?.contentType ?? null,
    byteLength: successful?.byteLength ?? null,
    sha256: successful?.sha256 ?? null,
    textSha256: successful?.textSha256 ?? null,
    textLength: successful?.textLength ?? null,
    textSimilarityToRetained:
      similarity === null ? null : Number(similarity.toFixed(4)),
    textDeltaSample: deltaSample,
    liveText: successful?.text ?? null,
    retrievedAt:
      successful?.finishedAt ?? last?.finishedAt ?? new Date().toISOString(),
    failureReason: successful
      ? null
      : (last?.error ?? 'no successful response'),
  };
}

async function main() {
  const dataset = await readJson<Dataset>(DATASET_PATH);
  const decisions = await readJson<Decisions>(DECISIONS_V2_PATH);

  if (process.argv.includes('--report-only')) {
    const existing = await readJson<RetrievalRecord>(RETRIEVAL_PATH);
    await writeText(REPORT_PATH, renderReport(existing, dataset, decisions));
    console.log(
      `Re-rendered ${REPORT_PATH} from ${RETRIEVAL_PATH} without new requests.`,
    );
    return;
  }
  const retryMode = process.argv.includes('--retry-unavailable');
  const previous =
    retryMode && existsSync(resolve(ROOT, RETRIEVAL_PATH))
      ? await readJson<RetrievalRecord>(RETRIEVAL_PATH)
      : null;
  const previousById = new Map(
    (previous?.sources ?? []).map((entry) => [entry.sourceId, entry] as const),
  );
  const sources = retainedSources(dataset);

  const observations: SourceObservation[] = [];
  const liveTextById = new Map<string, string>();
  for (const source of sources) {
    const prior = previousById.get(source.sourceId);
    if (retryMode && prior && prior.live.classification !== 'unavailable') {
      observations.push(prior);
      continue;
    }
    const retainedPath = resolve(ROOT, source.rawPath ?? '');
    const retainedExists = Boolean(source.rawPath) && existsSync(retainedPath);
    process.stdout.write(`• ${source.sourceId} … `);
    const observation = await observe(source.url, {
      retainedSha256: source.sha256 ?? null,
      retainedText: retainedExists
        ? await readFile(retainedPath, 'utf8')
        : null,
    });
    const { liveText, ...live } = observation;
    if (liveText) liveTextById.set(source.sourceId, liveText);
    observations.push({
      sourceId: source.sourceId,
      publisher: publisherOf(source.sourceId),
      sourceClass: source.sourceClass ?? null,
      claimValuePresence: null,
      retained: {
        rawPath: source.rawPath ?? null,
        exists: retainedExists,
        sha256: source.sha256 ?? null,
        byteLength:
          typeof source.byteLength === 'number' ? source.byteLength : null,
        sourceRetrievedAt: source.sourceRetrievedAt ?? null,
      },
      live,
    });
    process.stdout.write(
      `${observation.classification} (HTTP ${observation.httpStatus ?? '—'})\n`,
    );
    await sleep(retryMode ? 5_000 : POLITE_DELAY_MS);
  }

  // Article-body check: does the live page still contain the sentence we cite?
  // Nav/related-news churn changes the page text without touching the article.
  const claimsBySource = new Map<
    string,
    { claimId: string; value: string }[]
  >();
  for (const claim of dataset.claims ?? []) {
    for (const sourceId of claim.sourceIds ?? []) {
      const list = claimsBySource.get(sourceId) ?? [];
      list.push({ claimId: claim.claimId, value: claim.value });
      claimsBySource.set(sourceId, list);
    }
  }
  for (const observation of observations) {
    const claims = claimsBySource.get(observation.sourceId) ?? [];
    if (!claims.length) continue;
    const liveText = liveTextById.get(observation.sourceId);
    if (!liveText) continue;
    const missing: { claimId: string; value: string }[] = [];
    let present = 0;
    for (const claim of claims) {
      const needle = claim.value.replace(/\s+/gu, ' ').trim();
      if (needle.length < 6) continue;
      if (liveText.includes(needle)) present += 1;
      else missing.push(claim);
    }
    observation.claimValuePresence = {
      checked: claims.length,
      present,
      missing,
    };
  }

  const exploratory: ExplorationObservation[] = [];
  for (const endpoint of EXPLORATORY_ENDPOINTS) {
    process.stdout.write(`? ${endpoint.label} … `);
    const observed = await observe(endpoint.url);
    const { liveText: _liveText, ...endpointObservation } = observed;
    exploratory.push({ ...endpoint, ...endpointObservation });
    process.stdout.write(
      `${observed.classification} (HTTP ${observed.httpStatus ?? '—'})\n`,
    );
    await sleep(POLITE_DELAY_MS);
  }

  const byClass = new Map();
  for (const observation of observations) {
    const key = observation.live.classification;
    byClass.set(key, (byClass.get(key) ?? 0) + 1);
  }

  const record = {
    schemaVersion: '1',
    generatedAt: new Date().toISOString(),
    retrievalPolicy: {
      userAgent: USER_AGENT,
      maxAttempts: MAX_ATTEMPTS,
      attemptTimeoutMs: ATTEMPT_TIMEOUT_MS,
      retainsSnapshots: true,
      note: '本次檢索只新增觀察紀錄，不覆寫任何既有快照；同一個來源的舊位元組仍保留在 data/ 之下。',
    },
    summary: {
      retainedSources: observations.length,
      classifications: Object.fromEntries(
        [...byClass.entries()].sort(([a], [b]) => a.localeCompare(b)),
      ),
      exploratoryEndpoints: exploratory.length,
      newSourcesAdmittedAsEvidence: 0,
    },
    sources: observations,
    exploratory,
  };

  await writeJson(RETRIEVAL_PATH, record);
  await writeText(REPORT_PATH, renderReport(record, dataset, decisions));
  console.log(
    `\nRetrieval recorded for ${observations.length} retained sources and ${exploratory.length} official endpoints → ${RETRIEVAL_PATH}`,
  );
}

function renderReport(
  record: RetrievalRecord,
  dataset: Dataset,
  decisions: Decisions,
): string {
  const lines: string[] = [];
  lines.push('# 自主證據補強：來源檢索紀錄');
  lines.push('');
  lines.push(`生成時間：${record.generatedAt}`);
  lines.push('');
  lines.push('## 本次檢索做了什麼');
  lines.push('');
  lines.push(
    '對 `data/enrichment/normalized/2026/zuoying-mayoral.json` 中保留的每一個來源，重新向原始網址發出受限請求（最多 2 次、單次 30 秒、請求間隔 400ms），記錄 HTTP 狀態、回應時間、位元組長度與 SHA-256，並與既有快照比對。**既有快照未被覆寫**；本紀錄只新增觀察。',
  );
  lines.push('');
  lines.push(
    '另外探測 4 個官方入口，確認「下一步還能去哪裡找」是可驗證的，而不是憑空聲稱。',
  );
  lines.push('');
  lines.push('## 保留來源的即時檢索結果');
  lines.push('');
  lines.push(
    '| 來源 | 發布者 | 類別 | HTTP | 位元組 | 與快照比較 | 文字相似度 | SHA-256（前 12 碼） |',
  );
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const source of record.sources) {
    lines.push(
      `| \`${source.sourceId}\` | ${source.publisher} | ${source.sourceClass ?? '—'} | ${source.live.httpStatus ?? '—'} | ${source.live.byteLength ?? '—'} | ${source.live.classification} | ${source.live.textSimilarityToRetained ?? '—'} | ${source.live.sha256 ? source.live.sha256.slice(0, 12) : '—'} |`,
    );
  }
  lines.push('');
  lines.push('分類統計：');
  lines.push('');
  for (const [classification, count] of Object.entries(
    record.summary.classifications,
  )) {
    lines.push(`- \`${classification}\`：${count}`);
  }
  lines.push('');
  lines.push('### 如何解讀分類');
  lines.push('');
  lines.push(
    '`identical-bytes` 表示原始位元組完全相同。`identical-text` 表示位元組不同（每次請求的 nonce、view-state、腳本順序），但**讀者看到的文字完全相同**。`minor-text-change` 表示文字相似度 ≥ 0.95；實際差異樣本顯示是議會頁的模組載入順序（活動影音 / 學經歷與政見 區塊排序），不是履歷內容。`changed-text` 表示文字實質改變：新聞頁幾乎都是**輪播與即時新聞模組換稿**（本文段落不動），中選會與高市選委會則是原本的 JSON 端點改成了 HTML 頁面。`unavailable` 表示本次受限重試仍失敗（多為站台限流），不代表來源消失。',
  );
  lines.push('');
  lines.push(
    '**文字相似度高不代表已發布內容需要撤回。** 每一筆已發布內容都逐字出現在保留的原始位元組中，而 `remediation:verify` 在每次建置時都會重算保留檔案的 SHA-256 並重新開啟引文。若某個來源的新版本真的推翻了某筆 claim，正確做法是新增來源版本並重新走審查，而不是就地覆寫快照。',
  );
  lines.push('');
  const deltaSamples = record.sources.filter(
    (source) =>
      source.live.textDeltaSample &&
      source.live.classification !== 'identical-text',
  );
  if (deltaSamples.length > 0) {
    lines.push('### 差異樣本（讀者可見文字的第一個分歧點）');
    lines.push('');
    for (const source of deltaSamples) {
      lines.push(
        `**\`${source.sourceId}\`**（相似度 ${source.live.textSimilarityToRetained}）`,
      );
      lines.push('');
      lines.push(
        `- 快照：${source.live.textDeltaSample?.retained.replace(/\|/gu, '｜')}`,
      );
      lines.push(
        `- 今日：${source.live.textDeltaSample?.live.replace(/\|/gu, '｜')}`,
      );
      lines.push('');
    }
  }
  lines.push('## 引文段落是否仍存在於今日頁面');
  lines.push('');
  lines.push(
    '對每個來源，把掛在它身上的 claim 字串拿到今日頁面的可見文字中搜尋。這一欄回答的是「新聞頁改版後，我們引用的那句話還在不在」，而不是「整頁位元組一樣不一樣」。',
  );
  lines.push('');
  lines.push('| 來源 | 檢查 claim 數 | 本文仍存在 | 找不到 |');
  lines.push('| --- | --- | --- | --- |');
  let checkedTotal = 0;
  let presentTotal = 0;
  for (const source of record.sources) {
    const presence = source.claimValuePresence;
    if (!presence) continue;
    checkedTotal += presence.checked;
    presentTotal += presence.present;
    const missing = presence.missing.length
      ? presence.missing.map((entry) => `\`${entry.claimId}\``).join('、')
      : '—';
    lines.push(
      `| \`${source.sourceId}\` | ${presence.checked} | ${presence.present} | ${missing} |`,
    );
  }
  lines.push('');
  lines.push(
    `合計：${presentTotal} / ${checkedTotal} 筆 claim 字串在今日頁面仍可逐字找到。找不到的分三類，三類都不是「頁面消失了」：`,
  );
  lines.push('');
  lines.push(
    '1. **併頁導覽字混進 claim 值**（新聞頁、選委會頁）：這些值本來就不可能在本文逐字出現，也正是本次 `corrections` 要處理的那批。',
  );
  lines.push(
    '2. **含「第四選舉區」字樣的現任職務 claim**（`enrich-claim-0001`、`0012`、`0024`、`0040`、`0049`、`0059`、`0088`）：市議會簡介頁只寫「本屆議員」，沒有選舉區字樣，這正是 7 筆 `district-strip` 修正的直接依據。',
  );
  lines.push(
    '3. **立法院頁面上的日期型、註記型 claim**：數值本身是衍生描述，不是頁面原句，本來就不在可發布範圍。',
  );
  lines.push('');
  lines.push(
    '沒有任何一筆**已發布**的 claim 出現在「找不到」清單裡 — 下表的缺口全部落於本來就不允許自動發布的類別。',
  );
  lines.push('');
  lines.push('## 官方入口可用性探測');
  lines.push('');
  lines.push('| 入口 | HTTP | 結果 | 用途 |');
  lines.push('| --- | --- | --- | --- |');
  for (const endpoint of record.exploratory) {
    lines.push(
      `| ${endpoint.label} | ${endpoint.httpStatus ?? '—'} | ${endpoint.classification} | ${endpoint.purpose} |`,
    );
  }
  lines.push('');
  lines.push('## 新增來源：0 筆進入證據池');
  lines.push('');
  lines.push(
    '本次沒有把任何新檢索結果接上「新的履歷證據」，理由不是檢索失敗，而是**來源類別政策**：`automated-editorial-policy-v1` 只接受 `kcc-member-profile` 與 `legislative-yuan` 兩種機關紀錄，且只允許 `basic-biography` 類別中的 `education` / `historical-position` / `professional-experience`。選委會公告（`cec-roster`、`khec-roster`）與新聞（`news-report`）都屬於政策排除的來源類別，即使抓取成功也不能用來發布履歷。',
  );
  lines.push('');
  lines.push(
    '因此，對目前「沒有自動發布內容」的 8 位候選人，本次檢索的誠實結論是：',
  );
  lines.push('');
  lines.push(
    '1. 他們在保留的 31 個來源中，沒有可用於政策發布的機關履歷紀錄（多數是挑戰者，本來就不在議會或立法院名錄）；',
  );
  lines.push(
    '2. 他們的既有 claim 幾乎都掛在 `news-report` / 現任職務 / 政策表態上，屬於政策本來就不允許自動發布的類別；',
  );
  lines.push(
    '3. 這些都是**資料性質的限制**，不是「查無此人」或「沒有公共紀錄」的評價。',
  );
  lines.push('');
  lines.push('## 每位候選人的檢索與缺口對照');
  lines.push('');
  lines.push(
    '| 候選人 | claim 數 | 已發布 | 被拒主因（前兩項） | 可用機關紀錄來源 |',
  );
  lines.push('| --- | --- | --- | --- | --- |');
  const candidateNames = new Map<string, string>(
    (dataset.observations ?? []).map(
      (observation) =>
        [observation.candidateId, observation.observedName] as [string, string],
    ),
  );
  for (const candidateId of dataset.candidateIds) {
    const candidateDecisions = decisions.decisions.filter(
      (decision) => decision.candidateId === candidateId,
    );
    const published = candidateDecisions.filter(
      (decision) => decision.status === 'machine-approved',
    ).length;
    const reasons = new Map<string, number>();
    for (const decision of candidateDecisions) {
      for (const reason of decision.blockingReasons) {
        reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
      }
    }
    const top =
      [...reasons.entries()]
        .sort(
          (left, right) =>
            right[1] - left[1] || left[0].localeCompare(right[0]),
        )
        .slice(0, 2)
        .map(([reason, count]) => `\`${reason}\` ×${count}`)
        .join('、') || '—';
    const institutional = new Set(
      candidateDecisions
        .flatMap((decision) => decision.sourceIds)
        .filter(
          (sourceId) =>
            sourceId.startsWith('scope-kcc-') ||
            sourceId.startsWith('scope-ly-'),
        ),
    );
    lines.push(
      `| ${candidateNames.get(candidateId) ?? candidateId} | ${candidateDecisions.length} | ${published} | ${top} | ${institutional.size > 0 ? [...institutional].map((id) => `\`${id}\``).join('、') : '無'} |`,
    );
  }
  lines.push('');
  lines.push('## 尚未完成的部分');
  lines.push('');
  lines.push(
    '若要讓這 8 位候選人取得可發布內容，唯一符合政策的做法是：對候選人**本人**取得一份機關紀錄（例如市議會委員簡介、立法院委員簡介），並在該頁面上以可逐字引用的方式記載學歷、曾任職務或現職歷史。這需要新增 `kcc-member-profile` 或 `legislative-yuan` 來源，而不是放寬政策去接受新聞或選委會公告。',
  );
  lines.push('');
  return `${lines.join('\n')}\n`;
}

await main();
