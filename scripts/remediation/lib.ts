import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export const ROOT = process.cwd();

export const PATHS = {
  dataset: 'data/enrichment/normalized/2026/zuoying-mayoral.json',
  review: 'data/enrichment/review/2026/zuoying-mayoral-review.json',
  semanticReport: 'reports/semantic-review-execution.json',
  rootCauses: 'reports/autonomous-remediation-root-causes.json',
  decisions: 'data/enrichment/automated/2026/zuoying-mayoral-decisions.json',
  published: 'data/published/2026/zuoying-mayoral-automated.json',
  remediatedDataset:
    'data/enrichment/remediated/2026/zuoying-mayoral-remediated.json',
  remediationSemanticReport: 'reports/semantic-review-remediated.json',
  remediationDecisions:
    'data/enrichment/automated/2026/zuoying-mayoral-decisions-v2.json',
  adjudicatorInvocations:
    'data/enrichment/semantic-review/2026/adjudicator-invocations.json',
  correctionReviewInvocations:
    'data/enrichment/semantic-review/2026/correction-review-invocations.json',
} as const;

export function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function readJson<T>(path: string): T {
  try {
    return JSON.parse(readFileSync(resolve(ROOT, path), 'utf8')) as T;
  } catch (error) {
    throw new Error(
      `Unable to read JSON ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function writeJson(path: string, value: unknown): void {
  const target = resolve(ROOT, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
}

export function writeText(path: string, value: string): void {
  const target = resolve(ROOT, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, value.endsWith('\n') ? value : `${value}\n`);
}

export function readRaw(path: string): string {
  return readFileSync(resolve(ROOT, path), 'utf8');
}

export const normalizeText = (value: string): string =>
  value
    .replace(/<script[\s\S]*?<\/script>/giu, ' ')
    .replace(/<style[\s\S]*?<\/style>/giu, ' ')
    .replace(/<[^>]*>/gu, ' ')
    .replace(/&nbsp;/giu, ' ')
    .replace(/&amp;/giu, '&')
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>')
    .replace(/&#(\d+);/gu, (_match, digits: string) =>
      String.fromCodePoint(Number(digits)),
    )
    .replace(/&#x([0-9a-f]+);/giu, (_match, digits: string) =>
      String.fromCodePoint(Number.parseInt(digits, 16)),
    )
    .replace(/\s+/gu, ' ')
    .trim();

const compact = (value: string, max: number): string =>
  value.length <= max ? value : `${value.slice(0, max)}…`;

const excerptAround = (
  text: string,
  needles: string[],
  radius: number,
): string => {
  const index =
    needles
      .map((needle) => text.lastIndexOf(needle))
      .find((position) => position >= 0) ?? 0;
  const start = Math.max(0, index - Math.floor(radius / 3));
  return compact(text.slice(start, start + radius), radius);
};

export const PAGE_CHROME_PATTERNS: RegExp[] = [
  /-->/u,
  /&gt;/u,
  /請繼續往下閱讀/u,
  /加入Google首選/u,
  /立刻加入/u,
  /跳到主要內容/u,
  /您的瀏覽器/u,
  /熱門關鍵字/u,
  /會員中心/u,
  /^即時 要聞/u,
  /USE APP/u,
  /字級/u,
];

export function chromeFindings(value: string): string[] {
  return PAGE_CHROME_PATTERNS.filter((pattern) => pattern.test(value)).map(
    (pattern) => pattern.source,
  );
}

export type PacketBuildInput = {
  claim: Record<string, unknown> & {
    claimId: string;
    candidateId: string;
    personId: string;
    category: string;
    title: string;
    value: string;
    sourceIds: string[];
    evidenceIds: string[];
    identityObservationIds: string[];
  };
  candidateName: string;
  candidate: {
    electionType: string | null;
    districtId: string | null;
    candidateStatus: string | null;
    formalStatus: string | null;
    partyStatus: string | null;
  };
  source: Record<string, unknown> & { sourceId: string; rawPath: string };
  evidence: Array<Record<string, unknown>>;
  identity: Array<Record<string, unknown>>;
  rawText: string;
  plainText: string;
  packetId: string;
  packetNotes: string[];
};

/**
 * Faithful re-implementation of the packet builder in
 * scripts/prepare-semantic-review-packets.ts so remediation packets for
 * corrected claims are assembled from the same retained source bytes.
 */
export function buildPacket(input: PacketBuildInput): Record<string, unknown> {
  const { claim, candidateName, candidate, source } = input;
  const rawNeedles = source.sourceId.startsWith('scope-ly-', 0)
    ? ['<h3 class="heading">', 'class="legislatorname"']
    : claim.category === 'news'
      ? ['<article', '<h1', '<title', candidateName]
      : ['學歷', '經歷', '服務政見', candidateName];
  const rawContext = excerptAround(input.rawText, rawNeedles, 5000);
  const sourceTextContext = excerptAround(
    input.plainText,
    [candidateName, claim.value.split(/[；。]/u)[0] ?? '', claim.title],
    3600,
  );
  const evidence = input.evidence.map((item) => ({
    evidenceId: item.evidenceId,
    sourceId: item.sourceId,
    documentLocation: item.documentLocation,
    excerpt: item.excerpt,
    supportType: item.supportType,
    attribution: item.attribution,
  }));
  const withoutHash = {
    packetId: input.packetId,
    claimId: claim.claimId,
    candidateId: claim.candidateId,
    candidateName,
    personId: claim.personId,
    electionType: candidate.electionType ?? 'unknown',
    districtId: candidate.districtId ?? null,
    candidateStatus: candidate.candidateStatus ?? 'unknown',
    formalStatus: candidate.formalStatus ?? 'unknown',
    partyStatus: candidate.partyStatus ?? 'unknown',
    claim: {
      category: claim.category,
      claimType: claim.claimType,
      title: claim.title,
      organization: claim.organization,
      value: claim.value,
      sourcePublicationDate: claim.sourcePublicationDate,
      validFrom: claim.validFrom,
      validTo: claim.validTo,
      temporalPrecision: claim.temporalPrecision,
      currentStatus: claim.currentStatus,
      attribution: claim.attribution,
      sourceDependency: claim.sourceDependency,
    },
    source: {
      sourceId: source.sourceId,
      attemptId: source.attemptId,
      url: source.url,
      method: source.method,
      rawPath: source.rawPath,
      sha256: source.sha256,
      byteLength: source.byteLength,
      httpStatus: source.httpStatus,
      sourceRetrievedAt: source.sourceRetrievedAt,
      timestampQuality: source.timestampQuality,
      rawContext,
      sourceTextContext,
    },
    evidence,
    identity: input.identity.map((item) => ({
      observationId: item.observationId,
      observedName: item.observedName,
      jurisdiction: item.observedJurisdiction ?? 'unknown',
      observedOffice: item.observedOffice,
      matchBasis: (item.matchBasis as string[]).join('; '),
      isNameOnlyMatch: item.isNameOnlyMatch,
    })),
    packetNotes: input.packetNotes,
  };
  return {
    ...withoutHash,
    packetSha256: sha256(Buffer.from(JSON.stringify(withoutHash), 'utf8')),
  };
}

export function sourcePublisher(sourceId: string): string {
  if (sourceId.startsWith('scope-kcc-')) return '高雄市議會全球網';
  if (sourceId.startsWith('scope-ly-')) return '立法院全球資訊網';
  if (sourceId.startsWith('scope-cec-')) return '中央選舉委員會';
  if (sourceId.startsWith('scope-khec-')) return '高雄市選舉委員會';
  if (sourceId.startsWith('scope-news-')) return '新聞媒體報導';
  return sourceId;
}

export const ADJUDICATOR_PROVIDER = 'opencode-go';
export const ADJUDICATOR_MODEL = 'deepseek-v4.1-flash';
export const ADJUDICATOR_THINKING = 'medium';

export type PiUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
};

export type PiReply = {
  text: string;
  sessionId: string | null;
  responseId: string | null;
  usage: PiUsage | null;
};

export function parsePiJsonStream(stdout: string): PiReply {
  let sessionId: string | null = null;
  let responseId: string | null = null;
  let text = '';
  let usage: PiUsage | null = null;
  for (const line of stdout.split('\n')) {
    if (!line.startsWith('{')) continue;
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (event.type === 'session' && typeof event.id === 'string')
      sessionId = event.id;
    if (event.type !== 'message_end') continue;
    const message = event.message as
      | {
          role?: string;
          content?: Array<{ type?: string; text?: string }>;
          usage?: unknown;
          responseId?: string;
        }
      | undefined;
    if (message?.role !== 'assistant') continue;
    const joined = (message.content ?? [])
      .filter((part) => part.type === 'text')
      .map((part) => part.text ?? '')
      .join('\n')
      .trim();
    if (joined) text = joined;
    if (typeof message.responseId === 'string') responseId = message.responseId;
    const raw = message.usage as
      | {
          input?: number;
          output?: number;
          totalTokens?: number;
          cost?: { total?: number };
        }
      | undefined;
    if (raw)
      usage = {
        inputTokens: raw.input ?? 0,
        outputTokens: raw.output ?? 0,
        totalTokens: raw.totalTokens ?? (raw.input ?? 0) + (raw.output ?? 0),
        costUsd: raw.cost?.total ?? 0,
      };
  }
  return { text, sessionId, responseId, usage };
}

export function extractJsonObject(text: string): Record<string, unknown> {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?/u, '')
    .replace(/```$/u, '')
    .trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start)
    throw new Error('reply contains no JSON object');
  return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
}

export const runPiPrompt = (
  prompt: string,
): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
}> =>
  new Promise((resolvePromise) => {
    const started = Date.now();
    const child = spawn(
      'pi',
      [
        '-p',
        '--no-session',
        '--no-tools',
        '--no-extensions',
        '--no-mcp',
        '--no-skills',
        '--no-context-files',
        '--mode',
        'json',
        '--thinking',
        ADJUDICATOR_THINKING,
        '--model',
        `${ADJUDICATOR_PROVIDER}/${ADJUDICATOR_MODEL}`,
        '--',
        prompt,
      ],
      { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('close', (code) => {
      resolvePromise({
        stdout,
        stderr,
        exitCode: code,
        durationMs: Date.now() - started,
      });
    });
    child.on('error', (error: Error) => {
      resolvePromise({
        stdout,
        stderr: `${stderr}\n${error.message}`,
        exitCode: null,
        durationMs: Date.now() - started,
      });
    });
  });
