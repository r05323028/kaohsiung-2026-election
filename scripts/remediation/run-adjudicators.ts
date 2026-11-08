/**
 * adjudication-materiality-v2 runner.
 *
 * Builds fresh independent reviewer prompts from the retained v1 semantic
 * packets and executes them in separate `pi` processes. Every invocation is
 * recorded with its prompt hash, raw output, parsed finding, usage, and run
 * metadata. Nothing is re-run without new information (a failed parse produces
 * a repair prompt that contains the parse error, which is new information).
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  ADJUDICATION_POLICY_VERSION,
  ADJUDICATOR_ROLE_REVIEWER,
  AdjudicatorFindingSchema,
  type AdjudicatorInvocation,
  type AdjudicatorRole,
  assertAdjudicatorCitations,
} from '../../src/data/enrichment/adjudicator-review';
import type {
  SemanticEvidencePacket,
  SemanticReviewReport,
} from '../../src/data/enrichment/semantic-review';
import {
  PATHS,
  ROOT,
  readJson,
  sha256,
  sourcePublisher,
  writeJson,
  writeText,
} from './lib';

const MANIFEST_PATH =
  'data/enrichment/semantic-review/2026/adjudicator-manifest.json';
const PROMPT_DIR = 'data/enrichment/semantic-review/2026/adjudicator-prompts';
const PROVIDER = 'opencode-go';
const MODEL = 'deepseek-v4.1-flash';
const THINKING = 'medium';
const RUNNER = 'pi-cli-adjudicator-v2';

type ManifestEntry = {
  invocationId: string;
  adjudicatorRole: AdjudicatorRole;
  reviewerRole: 'reviewer-a' | 'reviewer-b';
  claimId: string;
  candidateId: string;
  packetId: string;
  packetSha256: string;
  promptPath: string;
  promptSha256: string;
  attempt: number;
};

type Manifest = {
  schemaVersion: '1';
  adjudicationPolicyVersion: string;
  createdAt: string;
  claims: string[];
  entries: ManifestEntry[];
};

const args = process.argv.slice(2);
const command = args[0] ?? 'status';
const flag = (name: string): string | null => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? (args[index + 1] ?? null) : null;
};

const abs = (relative: string): string => path.join(ROOT, relative);

const semantic = readJson<SemanticReviewReport>(PATHS.semanticReport);
const packetById = new Map(
  semantic.packets.map((packet) => [packet.claimId, packet]),
);

const cohortPaths = (): string[] => {
  const report = readJson<{
    claims: Array<{
      claimId: string;
      status: string;
      rootCauses: string[];
      semantic: {
        materiality: { material: boolean };
        correctionProposed: boolean;
      };
    }>;
  }>(PATHS.rootCauses);
  const policyCauses = new Set([
    'identity-wrong-subject',
    'semantic-identity-unconfirmed',
    'evidence-duplicate-overlap',
    'evidence-citation-not-direct',
    'source-not-retrieved',
    'semantic-verdict-not-supported',
    'wording-correction-proposed',
  ]);
  return report.claims
    .filter(
      (claim) =>
        claim.status === 'machine-rejected' ||
        claim.status === 'machine-approved',
    )
    .filter((claim) =>
      claim.rootCauses.every(
        (cause) =>
          cause === 'semantic-disagreement' || !cause.startsWith('unmapped:'),
      ),
    )
    .filter((claim) =>
      claim.rootCauses.every(
        (cause) => !cause.startsWith('policy-') && !policyCauses.has(cause),
      ),
    )
    .filter((claim) => !claim.semantic.correctionProposed)
    .map((claim) => claim.claimId);
};

const evidenceBlock = (packet: SemanticEvidencePacket): string =>
  packet.evidence
    .map(
      (item) =>
        `[evidenceId: ${item.evidenceId} | sourceId: ${item.sourceId} | location: ${item.documentLocation}]\n${item.excerpt}`,
    )
    .join('\n\n');

const identityBlock = (packet: SemanticEvidencePacket): string =>
  packet.identity
    .map(
      (item) =>
        `- observedName=${item.observedName}; jurisdiction=${item.jurisdiction}; observedOffice=${item.observedOffice}; matchBasis=${item.matchBasis}`,
    )
    .join('\n');

const sharedContext = (packet: SemanticEvidencePacket): string => {
  const claim = packet.claim;
  const source = packet.source;
  return `You are an independent evidence reviewer for a civic election-information website (Kaohsiung 2026). You did not see any other reviewer's verdict, and you must judge only from the material printed below. Use no outside knowledge about this person.

## Claim under review
- claimId: ${packet.claimId}
- candidate: ${packet.candidateName} (${packet.electionType}${packet.districtId ? `, ${packet.districtId}` : ''}; status ${packet.candidateStatus})
- category / type: ${claim.category} / ${claim.claimType}
- section title on the site: ${claim.title}
- CLAIM WORDING (this exact string would be published): "${claim.value}"
- organization field: ${claim.organization ?? 'none'}
- attribution: ${claim.attribution} (source dependency: ${claim.sourceDependency})
- claim status: ${claim.currentStatus}; temporal precision: ${claim.temporalPrecision}
- source publication date: ${claim.sourcePublicationDate ?? 'not stated by the source'}
- claim validity window: ${claim.validFrom ?? '—'} .. ${claim.validTo ?? '—'}

## Source
- publisher: ${sourcePublisher(source.sourceId)} (sourceId ${source.sourceId})
- url: ${source.url}
- http status at retrieval: ${source.httpStatus ?? 'unknown'}
- retained snapshot: ${source.rawPath} (sha256 ${source.sha256}, ${source.byteLength} bytes)
- timestamp quality: ${source.timestampQuality}

## Retained page text (plain-text projection of the saved snapshot; may contain site navigation)
"""
${source.sourceTextContext}
"""

## Evidence excerpt recorded by the ingestion pipeline (verbatim slice of the retained snapshot)
"""
${evidenceBlock(packet)}
"""

## Identity observation recorded by the ingestion pipeline
${identityBlock(packet)}

## Rules for judging
1. The claim wording must be DIRECTLY supported by the material above, for THIS person. Text that belongs to site navigation, an unrelated sidebar, an unrelated person, or a different section is not support.
2. Do not upgrade, soften, or extrapolate. If the page lists "英國基爾大學碩士" then "英國基爾大學碩士" is supported; "基爾大學博士" or "留學英國" would not be.
3. Check that the person named in the material is the candidate above (office and jurisdiction must match), not merely an identical name.
4. Judge temporal meaning only as far as the wording asserts it. An undated list entry that makes no date claim does not need a date; wording that asserts "current", "現任", a year, or a range needs the source to support it.
5. A material concern is something that would make publication misleading: wrong person, overstated scope of a role, candidate statement presented as an institutional fact, invented date, source text that actually says something else. Style, brevity, missing context that does not change meaning, and "more research could be done" are NOT material concerns.
6. Quote verbatim: your evidence excerpts must be copied character-for-character from the material above (a contiguous substring), 20-300 characters long.
`;
};

const taskBlock = (role: AdjudicatorRole): string =>
  role === 'established-verifier'
    ? `## Your task (established-verification role)
Verify support, then stop. Confirm (a) the wording appears in the material as a statement about this candidate, (b) identity is unambiguous, (c) temporal meaning is not overstated, (d) no material concern exists. Return verdict "supported" only when a reader who saw only this source would agree with the exact published wording. If the material supports only part of the wording, return "partially-supported" and name the excess in materialConcern.
`
    : `## Your task (adversarial role)
Try to break this claim before anyone publishes it. Actively look for: (a) scope inflation — a party/campaign role or a republished press line presented as a personal credential; (b) person mismatch — same name, different person, different district, or an entry from another member's page; (c) date drift — a wording that asserts currency, a term number, or a year the material does not fix; (d) quote drift — the recorded excerpt is site chrome, a news list headline, or about somebody else. Only if the claim survives all four attacks may you return "supported". Any surviving doubt that would mislead a reader goes in materialConcern; cosmetic doubts go in limitations.
`;

const outputSpec = (packet: SemanticEvidencePacket): string => `## Output
Return ONE JSON object and nothing else (no markdown fence, no commentary):
{"claimId":"${packet.claimId}","verdict":"supported|partially-supported|insufficient-evidence|contradicted|wrong-identity","identityAssessment":"confirmed|uncertain|wrong-identity","attributionAssessment":"<short free text, e.g. source-supports-institutional-record>","temporalAssessment":{"requiresDate":<boolean>,"sourceSupportsTemporalWording":<boolean>,"assessment":"<short free text>"},"evidence":[{"sourceId":"${packet.source.sourceId}","evidenceId":"<one of the evidenceIds listed above>","location":"<where in the material>","excerpt":"<verbatim substring>","relationship":"supports|partially-supports|contradicts|context"}],"rationale":"<2-4 sentences>","materialConcern":<null or "<the concrete misleading claim a reader would take away>">,"limitations":["<short notes>"]}
`;

const buildPrompt = (
  packet: SemanticEvidencePacket,
  role: AdjudicatorRole,
): string =>
  `${sharedContext(packet)}\n${taskBlock(role)}\n${outputSpec(packet)}`;

const buildRepairPrompt = (
  packet: SemanticEvidencePacket,
  role: AdjudicatorRole,
  previousRaw: string,
  error: string,
): string =>
  `${sharedContext(packet)}\n${taskBlock(role)}\n${outputSpec(packet)}
## Repair notice
Your previous reply could not be parsed as the required JSON object. Error: ${error}
Previous reply:
"""
${previousRaw.slice(0, 4000)}
"""
Return only a corrected JSON object that satisfies every rule above.`;

const loadManifest = (): Manifest | null => {
  const file = abs(MANIFEST_PATH);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as Manifest;
  } catch (error) {
    throw new Error(
      `Adjudicator manifest is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

const loadInvocations = (): AdjudicatorInvocation[] => {
  const file = abs(PATHS.adjudicatorInvocations);
  if (!fs.existsSync(file)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as {
      invocations: AdjudicatorInvocation[];
    };
    return parsed.invocations;
  } catch (error) {
    throw new Error(
      `Adjudicator invocation record is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

const saveInvocations = (invocations: AdjudicatorInvocation[]): void => {
  const sorted = [...invocations].sort((a, b) =>
    a.invocationId.localeCompare(b.invocationId),
  );
  writeJson(PATHS.adjudicatorInvocations, {
    schemaVersion: '1',
    adjudicationPolicyVersion: ADJUDICATION_POLICY_VERSION,
    createdAt: sorted[0]?.startedAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    invocations: sorted,
  });
};

const parseAssistantJson = (
  stdout: string,
): {
  text: string;
  sessionId: string | null;
  responseId: string | null;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    costUsd: number;
  } | null;
} => {
  let sessionId: string | null = null;
  let responseId: string | null = null;
  let text = '';
  let usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    costUsd: number;
  } | null = null;
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
    if (event.type === 'message_end') {
      const message = event.message as
        | {
            role?: string;
            content?: Array<{ type?: string; text?: string }>;
            usage?: Record<string, unknown>;
            responseId?: string;
          }
        | undefined;
      if (message?.role === 'assistant') {
        const parts = (message.content ?? []).filter(
          (part) => part.type === 'text',
        );
        const joined = parts
          .map((part) => part.text ?? '')
          .join('\n')
          .trim();
        if (joined) text = joined;
        if (typeof message.responseId === 'string')
          responseId = message.responseId;
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
            totalTokens:
              raw.totalTokens ?? (raw.input ?? 0) + (raw.output ?? 0),
            costUsd: raw.cost?.total ?? 0,
          };
      }
    }
  }
  return { text, sessionId, responseId, usage };
};

type JsonObject = Record<string, unknown>;

const extractJson = (text: string): JsonObject => {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?/u, '')
    .replace(/```$/u, '')
    .trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start)
    throw new Error('no JSON object found in reply');
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed.slice(start, end + 1)) as unknown;
  } catch (error) {
    throw new Error(
      'reply JSON does not parse: ' +
        (error instanceof Error ? error.message : String(error)),
    );
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
    throw new Error('reply JSON is not an object');
  return parsed as JsonObject;
};

const planCommand = (): void => {
  const claims = cohortPaths();
  const entries: ManifestEntry[] = [];
  for (const claimId of claims) {
    const packet = packetById.get(claimId);
    if (!packet) throw new Error(`Missing packet for ${claimId}.`);
    for (const role of Object.keys(
      ADJUDICATOR_ROLE_REVIEWER,
    ) as AdjudicatorRole[]) {
      const prompt = buildPrompt(packet, role);
      const promptPath = `${PROMPT_DIR}/${role}/${claimId}.txt`;
      writeText(promptPath, prompt);
      entries.push({
        invocationId: `adjudicator-${role}-${claimId}-a1`,
        adjudicatorRole: role,
        reviewerRole: ADJUDICATOR_ROLE_REVIEWER[role],
        claimId,
        candidateId: packet.candidateId,
        packetId: packet.packetId,
        packetSha256: packet.packetSha256,
        promptPath,
        promptSha256: sha256(prompt),
        attempt: 1,
      });
    }
  }
  const manifest: Manifest = {
    schemaVersion: '1',
    adjudicationPolicyVersion: ADJUDICATION_POLICY_VERSION,
    createdAt: new Date().toISOString(),
    claims,
    entries,
  };
  writeJson(MANIFEST_PATH, manifest);
  console.log(
    JSON.stringify({ claims: claims.length, entries: entries.length }, null, 1),
  );
};

const runPi = (
  prompt: string,
  cwd: string,
): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
}> =>
  new Promise((resolve) => {
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
        THINKING,
        '--model',
        `${PROVIDER}/${MODEL}`,
        '--',
        prompt,
      ],
      { cwd, stdio: ['ignore', 'pipe', 'pipe'] },
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
      resolve({
        stdout,
        stderr,
        exitCode: code,
        durationMs: Date.now() - started,
      });
    });
    child.on('error', (error) => {
      resolve({
        stdout,
        stderr: `${stderr}\n${error.message}`,
        exitCode: null,
        durationMs: Date.now() - started,
      });
    });
  });

const runEntries = async (
  entries: ManifestEntry[],
  concurrency: number,
): Promise<void> => {
  const invocations = loadInvocations();
  const done = new Set(
    invocations
      .filter((item) => item.status === 'completed')
      .map((item) => item.invocationId),
  );
  const pending = entries.filter((entry) => !done.has(entry.invocationId));
  console.log(`pending ${pending.length} of ${entries.length}`);
  let cursor = 0;
  let failures = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const index = cursor++;
      const entry = pending[index];
      if (!entry) return;
      const packet = packetById.get(entry.claimId);
      if (!packet) throw new Error(`Missing packet for ${entry.claimId}.`);
      const prompt = fs.readFileSync(abs(entry.promptPath), 'utf8');
      const startedAt = new Date().toISOString();
      const outcome = await runPi(prompt, ROOT);
      const parsed = parseAssistantJson(outcome.stdout);
      let result = null as null | ReturnType<
        typeof AdjudicatorFindingSchema.parse
      >;
      let failureReason: string | null = null;
      try {
        if (!parsed.text) throw new Error('empty assistant reply');
        const candidate = AdjudicatorFindingSchema.parse(
          extractJson(parsed.text),
        );
        assertAdjudicatorCitations(packet, candidate);
        result = candidate;
      } catch (error) {
        failureReason = error instanceof Error ? error.message : String(error);
      }
      if (outcome.exitCode !== 0 && !failureReason)
        failureReason = `pi exited with ${outcome.exitCode}`;
      const invocation: AdjudicatorInvocation = {
        invocationId: entry.invocationId,
        adjudicationPolicyVersion: ADJUDICATION_POLICY_VERSION,
        adjudicatorRole: entry.adjudicatorRole,
        reviewerRole: entry.reviewerRole,
        claimId: entry.claimId,
        candidateId: entry.candidateId,
        packetId: entry.packetId,
        packetSha256: entry.packetSha256,
        promptPath: entry.promptPath,
        promptSha256: entry.promptSha256,
        provider: PROVIDER,
        model: MODEL,
        runner: `${RUNNER}/${THINKING}`,
        sessionId: parsed.sessionId,
        responseId: parsed.responseId,
        startedAt,
        finishedAt: new Date().toISOString(),
        durationMs: outcome.durationMs,
        status: result ? 'completed' : 'failed',
        exitCode: outcome.exitCode,
        rawOutput: parsed.text || outcome.stdout.slice(-4000),
        result,
        outputSha256: result ? sha256(parsed.text) : null,
        usage: parsed.usage,
        failureReason,
      };
      if (!result) failures += 1;
      const current = loadInvocations();
      const next = [
        ...current.filter(
          (item) => item.invocationId !== invocation.invocationId,
        ),
        invocation,
      ];
      saveInvocations(next);
      console.log(
        JSON.stringify({
          invocationId: invocation.invocationId,
          status: invocation.status,
          ms: invocation.durationMs,
          verdict: result?.verdict ?? null,
          materialConcern: result?.materialConcern ?? null,
          failureReason,
        }),
      );
    }
  };
  await Promise.all(
    Array.from({ length: Math.max(1, concurrency) }, () => worker()),
  );
  console.log(JSON.stringify({ processed: pending.length, failures }));
};

const repairCommand = async (concurrency: number): Promise<void> => {
  const manifest = loadManifest();
  if (!manifest) throw new Error('Run `plan` first.');
  const invocations = loadInvocations();
  const failed = invocations.filter((item) => item.status === 'failed');
  const entries: ManifestEntry[] = [];
  for (const failure of failed) {
    const already = manifest.entries.find(
      (entry) =>
        entry.claimId === failure.claimId &&
        entry.adjudicatorRole === failure.adjudicatorRole &&
        entry.attempt === 2,
    );
    if (already) continue;
    const packet = packetById.get(failure.claimId);
    if (!packet) continue;
    const prompt = buildRepairPrompt(
      packet,
      failure.adjudicatorRole,
      failure.rawOutput,
      failure.failureReason ?? 'unknown parse failure',
    );
    const promptPath = `${PROMPT_DIR}/${failure.adjudicatorRole}/${failure.claimId}-attempt2.txt`;
    writeText(promptPath, prompt);
    entries.push({
      invocationId: `adjudicator-${failure.adjudicatorRole}-${failure.claimId}-a2`,
      adjudicatorRole: failure.adjudicatorRole,
      reviewerRole: ADJUDICATOR_ROLE_REVIEWER[failure.adjudicatorRole],
      claimId: failure.claimId,
      candidateId: failure.candidateId,
      packetId: failure.packetId,
      packetSha256: failure.packetSha256,
      promptPath,
      promptSha256: sha256(prompt),
      attempt: 2,
    });
  }
  if (entries.length === 0) {
    console.log('no repair entries');
    return;
  }
  manifest.entries.push(...entries);
  writeJson(MANIFEST_PATH, manifest);
  await runEntries(entries, concurrency);
};

const statusCommand = (): void => {
  const manifest = loadManifest();
  const invocations = loadInvocations();
  const completed = invocations.filter((item) => item.status === 'completed');
  const failed = invocations.filter((item) => item.status === 'failed');
  const byClaim = new Map<string, Set<string>>();
  for (const item of completed) {
    const set = byClaim.get(item.claimId) ?? new Set<string>();
    set.add(item.reviewerRole);
    byClaim.set(item.claimId, set);
  }
  const pairs = [...byClaim.values()].filter((set) => set.size === 2).length;
  const cost = completed.reduce(
    (sum, item) => sum + (item.usage?.costUsd ?? 0),
    0,
  );
  const tokens = completed.reduce(
    (sum, item) => sum + (item.usage?.totalTokens ?? 0),
    0,
  );
  console.log(
    JSON.stringify(
      {
        planned: manifest?.entries.length ?? 0,
        claims: manifest?.claims.length ?? 0,
        completed: completed.length,
        failed: failed.length,
        claimsWithBothRoles: pairs,
        totalTokens: tokens,
        costUsd: Number(cost.toFixed(4)),
        failures: failed.map(
          (item) => `${item.invocationId}: ${item.failureReason}`,
        ),
      },
      null,
      1,
    ),
  );
};

const main = async (): Promise<void> => {
  if (command === 'plan') {
    planCommand();
    return;
  }
  if (command === 'run') {
    const manifest = loadManifest();
    if (!manifest) throw new Error('Run `plan` first.');
    const concurrency = Number(flag('concurrency') ?? '6');
    const limit = flag('limit')
      ? Number(flag('limit'))
      : Number.POSITIVE_INFINITY;
    const invocations = loadInvocations();
    const done = new Set(
      invocations
        .filter((item) => item.status === 'completed')
        .map((item) => item.invocationId),
    );
    const pending = manifest.entries
      .filter((entry) => entry.attempt === 1 && !done.has(entry.invocationId))
      .slice(0, limit);
    await runEntries(pending, concurrency);
    return;
  }
  if (command === 'repair') {
    await repairCommand(Number(flag('concurrency') ?? '4'));
    return;
  }
  if (command === 'status') {
    statusCommand();
    return;
  }
  throw new Error(`Unknown command ${command}`);
};

void main();
