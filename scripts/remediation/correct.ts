/**
 * Correction pipeline for the 25 claims that carried reviewer-proposed
 * corrections (see reports/autonomous-remediation-root-causes.json).
 *
 * Rules enforced here:
 *  - The original claim and its sources are never modified; a corrected claim
 *    is a NEW derived record with explicit lineage.
 *  - A correction is only applied when the corrected wording is a verbatim
 *    substring of the retained source bytes (deletion-only editing). Paraphrased
 *    reviewer proposals that do not survive that test are recorded as
 *    requires-more-evidence instead of being applied.
 *  - A corrected claim inherits nothing: automated-editorial-policy-v1 is
 *    re-evaluated against the corrected wording, and two fresh independent
 *    model reviews are run over the corrected claim.
 *
 * Usage:
 *   npx tsx scripts/remediation/correct.ts plan
 *   npx tsx scripts/remediation/correct.ts run --concurrency 4
 *   npx tsx scripts/remediation/correct.ts report
 */

import { AdjudicatorFindingSchema } from '../../src/data/enrichment/adjudicator-review';
import {
  buildPacket,
  chromeFindings,
  normalizeText,
  PATHS,
  readJson,
  readRaw,
  sha256,
  writeJson,
  writeText,
} from './lib';

type Json = Record<string, unknown>;

type Claim = Json & {
  claimId: string;
  candidateId: string;
  personId: string;
  category: string;
  claimType: string;
  title: string;
  organization: string | null;
  value: string;
  sourcePublicationDate: string | null;
  validFrom: string | null;
  validTo: string | null;
  temporalPrecision: string;
  currentStatus: string;
  attribution: string;
  sourceDependency: string;
  sourceIds: string[];
  evidenceIds: string[];
  identityObservationIds: string[];
};

type SourceAttempt = Json & {
  attemptId: string;
  sourceId: string;
  category: string;
  sourceClass: string;
  sourceTier: string;
  method: string;
  url: string;
  outcome: string;
  httpStatus: number | null;
  rawPath: string;
  sha256: string;
  byteLength: number;
};

type Dataset = Json & {
  datasetId: string;
  claims: Claim[];
  sourceAttempts: SourceAttempt[];
  evidence: Json[];
  observations: Json[];
};

type RootCauseReport = Json & {
  corrections: Array<{
    claimId: string;
    candidateName: string;
    claimType: string;
    chromePatterns: string[];
  }>;
};

type SemanticReport = Json & {
  invocations: Array<
    Json & { claimId: string; reviewerRole: string; result: Json | null }
  >;
};

const str = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;
const strOrNull = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;

const CANDIDATE_NAME = new Map<string, string>();

const CHROME_TOKEN =
  /(?:-->|請繼續往下閱讀|加入Google首選|立刻加入|跳到主要內容[^\s]*|您的瀏覽器|熱門關鍵字|會員中心|USE APP|字級|即時 要聞)/gu;

const sourceClassOf = (attempt: SourceAttempt | undefined): string =>
  attempt ? attempt.sourceClass : 'unknown';

type EligibilityMirror = { eligible: boolean; reasons: string[] };

// Faithful mirror of the checks in src/data/enrichment/automated-policy.ts, used
// only to answer "would the corrected wording be publishable?".
const PERMITTED_TYPES = new Set([
  'education',
  'historical-position',
  'professional-experience',
]);
const PERMITTED_SOURCE_CLASSES = new Set([
  'kcc-member-profile',
  'legislative-yuan',
]);

function eligibilityMirror(
  claim: Claim,
  attempt: SourceAttempt | undefined,
): EligibilityMirror {
  const reasons: string[] = [];
  if (claim.category !== 'basic-biography')
    reasons.push('category-not-permitted');
  if (!PERMITTED_TYPES.has(claim.claimType))
    reasons.push('claim-type-not-permitted');
  if (!PERMITTED_SOURCE_CLASSES.has(sourceClassOf(attempt)))
    reasons.push(`source-class-not-permitted:${sourceClassOf(attempt)}`);
  if (
    claim.attribution !== 'institutional-record' ||
    claim.sourceDependency !== 'institutional-record'
  )
    reasons.push('institutional-attribution-required');
  if (claim.currentStatus !== 'historical')
    reasons.push('historical-status-required');
  return { eligible: reasons.length === 0, reasons };
}

type CorrectedEntry = {
  correctionId: string;
  claimId: string;
  candidateId: string;
  candidateName: string;
  claimType: string;
  category: string;
  kind:
    | 'district-strip'
    | 'chrome-segment'
    | 'proposal-literal'
    | 'metadata-date'
    | 'blocked-wrong-identity'
    | 'requires-more-evidence';
  originalValue: string;
  correctedValue: string | null;
  defect: string;
  reviewerProposals: string[];
  literalSupport: {
    verified: boolean;
    sourceId: string;
    sourceClass: string;
    rawPath: string;
    sourceSha256: string;
    byteLength: number;
    matchedText: string | null;
    location: string | null;
  };
  metadataCorrection: {
    field: string;
    from: string | null;
    to: string;
    literalEvidence: string;
  } | null;
  publicationEligibilityAfterCorrection: EligibilityMirror;
  disposition:
    | 'applied'
    | 'rejected'
    | 'requires-more-evidence'
    | 'blocked'
    | 'superseded'
    | 'not-applicable';
  dispositionReason: string;
  freshReview: {
    status: 'verified' | 'rejected' | 'not-required';
    invocationIds: string[];
    verdicts: string[];
    identityAssessments: string[];
    materialConcerns: string[];
    reasons: string[];
  };
  lineage: {
    originalClaimSha256: string;
    correctedClaimSha256: string | null;
    derivedAt: string;
    derivedFrom: string;
  };
};

const MANIFEST_DIR = 'data/enrichment/semantic-review/2026';
const PROMPT_DIR = `${MANIFEST_DIR}/correction-prompts`;
const INVOCATION_PATH = PATHS.correctionReviewInvocations;

const dataset = readJson<Dataset>(PATHS.dataset);
const rootCauses = readJson<RootCauseReport>(PATHS.rootCauses);
const semantic = readJson<SemanticReport>(PATHS.semanticReport);

for (const entry of rootCauses.corrections)
  CANDIDATE_NAME.set(entry.claimId, entry.candidateName);

const claimsById = new Map(
  dataset.claims.map((claim) => [claim.claimId, claim]),
);
const attemptBySourceId = new Map<string, SourceAttempt>();
for (const attempt of dataset.sourceAttempts)
  if (attempt.rawPath) attemptBySourceId.set(attempt.sourceId, attempt);

const proposalsByClaim = new Map<string, string[]>();
for (const invocation of semantic.invocations) {
  const proposal = invocation.result?.proposedCorrection as
    | Json
    | null
    | undefined;
  if (!proposal) continue;
  const wording = strOrNull(proposal.proposedWording);
  if (!wording) continue;
  const list = proposalsByClaim.get(invocation.claimId) ?? [];
  if (!list.includes(wording)) list.push(wording);
  proposalsByClaim.set(invocation.claimId, list);
}

const evidenceByClaim = new Map<string, Json[]>();
for (const evidence of dataset.evidence) {
  const claimId = str(evidence.claimId);
  if (!claimId) continue;
  const list = evidenceByClaim.get(claimId) ?? [];
  list.push(evidence);
  evidenceByClaim.set(claimId, list);
}

const observationsByClaim = new Map<string, Json[]>();
for (const observation of dataset.observations) {
  const claimIds = Array.isArray(observation.candidateIds)
    ? observation.candidateIds
    : [];
  for (const claim of dataset.claims) {
    if (!claim.identityObservationIds.includes(str(observation.observationId)))
      continue;
    const list = observationsByClaim.get(claim.claimId) ?? [];
    list.push(observation);
    observationsByClaim.set(claim.claimId, list);
    void claimIds;
  }
}

const ISO_DATE = /\b(20\d{2})-(\d{2})-(\d{2})\b/u;
const slashDate = (iso: string): string => iso.replace(/-/gu, '/');

type PlannedCorrection = {
  claim: Claim;
  attempt: SourceAttempt | undefined;
  plainText: string;
  rawText: string;
  entry: Omit<CorrectedEntry, 'freshReview'>;
  selectedWording: string | null;
};

/**
 * Split a stored value into the contiguous fragments it was assembled from:
 * publisher separators, page-chrome tokens, sentence breaks and the
 * "報導標題：" style prefixes introduced by an earlier normalizer.
 */
const UI_NOISE =
  /(?:Your browser|does not support|browser|https?:\/\/|www\.|Copyright|Javascript|0:00|\bnew\b|留言)/iu;

const LEADING_NOISE =
  /^(?:(?:留言|分享|列印|轉寄|回應|複製|字級|人氣|點閱)\s*|new\s+|Facebook\s+|Plurk\s+|Twitter\s+|line\s+|Email\s+)+/iu;

const cleanFragment = (piece: string): string =>
  piece
    .replace(/^[\s:：\-–—….]+/u, '')
    .replace(LEADING_NOISE, '')
    .replace(/[\s:：\-–—…]+$/u, '')
    .trim();

const fragmentsOf = (value: string): string[] => {
  const cleaned = value.replace(
    /^(?:報導標題|來源於[0-9/\-年月日報導：]+)[:：]\s*/u,
    '',
  );
  return cleaned
    .split(CHROME_TOKEN)
    .flatMap((piece) => piece.split(/[|｜]/u))
    .flatMap((piece) => piece.split(/。/u))
    .map(cleanFragment)
    .filter((piece) => piece.length > 0);
};

function planOne(claimId: string): PlannedCorrection | null {
  const claim = claimsById.get(claimId);
  if (!claim) return null;
  const attempt = attemptBySourceId.get(claim.sourceIds[0] ?? '');
  const rawText = attempt ? readRaw(attempt.rawPath) : '';
  const plainText = normalizeText(rawText);
  const proposals = proposalsByClaim.get(claimId) ?? [];
  const originalValue = claim.value;
  const name = CANDIDATE_NAME.get(claimId) ?? '';
  const isWrongIdentity = claimId === 'enrich-claim-0111';

  // 1) District designation removal (deletion only, whole-string literal test).
  const districtMatch = /（([^）]*選舉區)）/u.exec(originalValue);
  const fullStrip = districtMatch
    ? originalValue.replace(districtMatch[0], '').trim()
    : null;
  const organization = (claim.organization ?? '').trim();
  const orgStrip =
    fullStrip && organization && fullStrip.startsWith(organization)
      ? fullStrip.slice(organization.length).trim()
      : null;
  const districtStripSupported =
    districtMatch !== null &&
    plainText.includes(districtMatch[1] ?? '\u0000') === false;
  const fullStripLiteral = fullStrip !== null && plainText.includes(fullStrip);
  const orgStripLiteral =
    orgStrip !== null && orgStrip.length >= 4 && plainText.includes(orgStrip);

  // 2) Segment selection: keep a contiguous fragment that is verbatim on the page
  //    AND still identifies the candidate.
  const literalFragments = fragmentsOf(originalValue).filter(
    (piece) =>
      piece !== originalValue && piece.length >= 8 && plainText.includes(piece),
  );
  const nameFragments = literalFragments.filter(
    (piece) => name.length > 0 && piece.includes(name) && !UI_NOISE.test(piece),
  );
  // Prefer the publisher-suffix-free head of a fragment ("headline - section - outlet").
  const trimmedHeads = nameFragments
    .map((piece) => piece.split(/\s+-\s+/u)[0]?.trim() ?? piece)
    .filter(
      (piece) =>
        piece.length >= 12 &&
        piece !== '' &&
        piece.includes(name) &&
        plainText.includes(piece) &&
        !UI_NOISE.test(piece),
    );
  const segmentCandidates = [
    ...trimmedHeads.sort((a, b) => b.length - a.length),
    ...nameFragments.sort((a, b) => b.length - a.length),
  ];

  // 3) A reviewer proposal is usable only when it already occurs verbatim.
  const proposalCandidates = proposals
    .filter(
      (proposal) => !ISO_DATE.test(proposal) && plainText.includes(proposal),
    )
    .filter((proposal) => name.length === 0 || proposal.includes(name))
    .sort((a, b) => b.length - a.length);

  const metadataProposal = proposals
    .map((proposal) => ISO_DATE.exec(proposal)?.[0] ?? null)
    .find((date): date is string => date !== null);
  const metadataCorrection =
    metadataProposal &&
    (plainText.includes(metadataProposal) ||
      plainText.includes(slashDate(metadataProposal)))
      ? {
          field: 'sourcePublicationDate',
          from: claim.sourcePublicationDate,
          to: metadataProposal,
          literalEvidence: plainText.includes(metadataProposal)
            ? metadataProposal
            : slashDate(metadataProposal),
        }
      : null;

  const chrome = chromeFindings(originalValue);

  let kind: CorrectedEntry['kind'] = 'requires-more-evidence';
  let correctedValue: string | null = null;
  if (isWrongIdentity) {
    kind = 'blocked-wrong-identity';
  } else if (districtStripSupported && (fullStripLiteral || orgStripLiteral)) {
    kind = 'district-strip';
    correctedValue = fullStripLiteral ? fullStrip : orgStrip;
  } else if (proposalCandidates.length > 0) {
    kind = 'proposal-literal';
    correctedValue = proposalCandidates[0] ?? null;
  } else if (segmentCandidates.length > 0) {
    kind = 'chrome-segment';
    correctedValue = segmentCandidates[0] ?? null;
  } else if (metadataCorrection) {
    kind = 'metadata-date';
  }
  if (correctedValue === originalValue) correctedValue = null;

  const defectParts: string[] = [];
  if (isWrongIdentity)
    defectParts.push(
      'Both reviewers returned verdict=wrong-identity: the stored value describes other people (民進黨前立委劉世芳服務處執行長黃偵琳、前高雄市青年局長張以理), not the candidate the claim is attached to.',
    );
  if (chrome.length > 0)
    defectParts.push(
      `stored value contains publisher page chrome (${chrome.join(', ')})`,
    );
  if (districtMatch && !districtStripSupported)
    defectParts.push(
      `stored value asserts 「${districtMatch[1]}」 but the retained page never contains that district designation`,
    );
  if (correctedValue === null && kind === 'requires-more-evidence')
    defectParts.push(
      `no contiguous fragment of the stored value (and no reviewer proposal) occurs verbatim in the retained source, so every available repair would require authoring new wording`,
    );

  const eligibility = eligibilityMirror(claim, attempt);

  const disposition: CorrectedEntry['disposition'] = isWrongIdentity
    ? 'blocked'
    : correctedValue !== null || metadataCorrection
      ? 'applied'
      : 'requires-more-evidence';

  const dispositionReason = isWrongIdentity
    ? 'Identity cannot be repaired from this source: the retained bytes never describe the candidate, and no replacement wording occurs verbatim in them. The claim stays excluded (and is policy-ineligible as a news-report claim in any case).'
    : correctedValue !== null
      ? `Deletion-only correction applied: 「${correctedValue}」 occurs verbatim in the retained source bytes.`
      : metadataCorrection
        ? `Wording left unchanged; publication date corrected to ${metadataCorrection.to}, which occurs verbatim on the retained page.`
        : 'No correction applied: every reviewer proposal is a paraphrase that does not occur verbatim in the retained source bytes, so applying it would require authoring new content.';

  const entry: Omit<CorrectedEntry, 'freshReview'> = {
    correctionId: `correction-${claimId}`,
    claimId,
    candidateId: claim.candidateId,
    candidateName: name,
    claimType: claim.claimType,
    category: claim.category,
    kind,
    originalValue,
    correctedValue,
    defect: defectParts.join('; '),
    reviewerProposals: proposals,
    literalSupport: {
      verified: correctedValue !== null,
      sourceId: claim.sourceIds[0] ?? '',
      sourceClass: sourceClassOf(attempt),
      rawPath: attempt?.rawPath ?? '',
      sourceSha256: attempt?.sha256 ?? '',
      byteLength: attempt?.byteLength ?? 0,
      matchedText: correctedValue,
      location: correctedValue
        ? `normalized source text index ${plainText.indexOf(correctedValue)}`
        : null,
    },
    metadataCorrection,
    publicationEligibilityAfterCorrection: eligibility,
    disposition,
    dispositionReason,
    lineage: {
      originalClaimSha256: sha256(JSON.stringify(claim)),
      correctedClaimSha256: correctedValue
        ? sha256(JSON.stringify({ ...claim, value: correctedValue }))
        : null,
      derivedAt: new Date().toISOString(),
      derivedFrom: PATHS.dataset,
    },
  };

  return {
    claim,
    attempt,
    plainText,
    rawText,
    entry,
    selectedWording: correctedValue,
  };
}

const ROLE_INSTRUCTIONS: Record<
  'established-verifier' | 'adversarial-reviewer',
  string
> = {
  'established-verifier':
    'Your job: confirm whether the CORRECTED wording is directly supported by the retained source bytes. Establish the strongest defensible reading of the source; if the source does not literally carry the wording, return partially-supported or insufficient-evidence.',
  'adversarial-reviewer':
    'Your job: try to falsify the CORRECTED wording. Look for overreach, unsupported precision, promotional epithets presented as credentials, attribution slipped from "a report said" to "it is so", and any sentence fragment that the source does not actually contain. If a neutral reader would be misled, set materialConcern to a concrete sentence.',
};

function promptFor(
  role: 'established-verifier' | 'adversarial-reviewer',
  planned: PlannedCorrection,
): string {
  const { claim, attempt, plainText, rawText, entry } = planned;
  const corrected = entry.correctedValue ?? claim.value;
  const evidence = (evidenceByClaim.get(claim.claimId) ?? []).map((item) => ({
    evidenceId: str(item.evidenceId),
    sourceId: str(item.sourceId),
    documentLocation: str(item.documentLocation),
    excerpt: str(item.excerpt).slice(0, 900),
  }));
  const index = plainText.indexOf(corrected);
  const windowStart = Math.max(0, index - 900);
  const sourceWindow = plainText.slice(windowStart, windowStart + 2600);
  const rawIndex = Math.max(0, rawText.indexOf(corrected));
  const rawWindow = rawText.slice(
    Math.max(0, rawIndex - 1200),
    Math.max(0, rawIndex - 1200) + 2400,
  );
  return `你是獨立的資料審查者，正在審查筆「修正後」的 2026 高雄市候選人公開資料 claim。

角色：${role}
${ROLE_INSTRUCTIONS[role]}

Claim（修正後文字，這是你必須判斷的對象）：
- claimId: ${claim.claimId}
- 候選人: ${entry.candidateName}
- 類別 / 類型: ${claim.category} / ${claim.claimType}
- 標題: ${claim.title}
- 組織: ${claim.organization ?? '（未提供）'}
- 修正後內容: ${corrected}
- 原始內容（修正前，僅供比對）: ${entry.originalValue}
- 歸因: ${claim.attribution}｜來源依賴: ${claim.sourceDependency}
- 時效狀態: ${claim.currentStatus}
- 發布日期: ${claim.sourcePublicationDate ?? '（未提供）'}

來源（僅能使用這些保留位元組）：
- sourceId: ${claim.sourceIds.join(', ')}
- 來源類別: ${entry.literalSupport.sourceClass}
- URL: ${attempt?.url ?? ''}
- HTTP: ${attempt?.httpStatus ?? 'n/a'}
- rawPath: ${attempt?.rawPath ?? ''}
- sha256: ${attempt?.sha256 ?? ''}

來源純文字視窗（由保留位元組轉換）：
"""
${sourceWindow}
"""

原始 HTML 視窗（節錄）：
"""
${rawWindow}
"""

既有證據紀錄：
${JSON.stringify(evidence, null, 2)}

審查要求：
1. 只有當修正後文字中的每一項主張都能在來源文字中找到時，verdict 才是 supported。
2. evidence 至少一筆；excerpt 必須逐字複製上面提供的來源文字；relationship 只能是 supports、partially-supports、contradicts、context。
3. identityAssessment 只能是 confirmed、uncertain、wrong-identity。
4. temporalAssessment.requiresDate 只有在文字本身含有時間主張時才為 true。
5. 若中性讀者會被誤導，materialConcern 必須是具體字串；否則為 null。
6. 不要因為這是修正後的文字而放寬標準。

只輸出一個 JSON 物件（不要程式碼圍籬、不要說明）：
{"claimId":"${claim.claimId}","verdict":"supported|partially-supported|insufficient-evidence|contradicted|wrong-identity","identityAssessment":"confirmed|uncertain|wrong-identity","attributionAssessment":"...","temporalAssessment":{"requiresDate":false,"sourceSupportsTemporalWording":true,"assessment":"..."},"evidence":[{"sourceId":"${claim.sourceIds[0] ?? ''}","evidenceId":"...","location":"...","excerpt":"...","relationship":"supports"}],"rationale":"...","materialConcern":null,"limitations":[]}`;
}

type CorrectionInvocation = {
  invocationId: string;
  claimId: string;
  candidateId: string;
  adjudicatorRole: 'established-verifier' | 'adversarial-reviewer';
  packetId: string;
  packetSha256: string;
  promptPath: string;
  promptSha256: string;
  provider: string;
  model: string;
  runner: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number;
  status: 'completed' | 'failed';
  exitCode: number | null;
  rawOutput: string;
  result: Json | null;
  outputSha256: string | null;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    costUsd: number;
  } | null;
  failureReason: string | null;
};

const readInvocations = (): {
  schemaVersion: string;
  createdAt: string;
  updatedAt: string;
  invocations: CorrectionInvocation[];
} => {
  try {
    return readJson(INVOCATION_PATH) as {
      schemaVersion: string;
      createdAt: string;
      updatedAt: string;
      invocations: CorrectionInvocation[];
    };
  } catch {
    const now = new Date().toISOString();
    return {
      schemaVersion: '1',
      createdAt: now,
      updatedAt: now,
      invocations: [],
    };
  }
};

const writeInvocations = (store: {
  schemaVersion: string;
  createdAt: string;
  updatedAt: string;
  invocations: CorrectionInvocation[];
}): void => {
  store.updatedAt = new Date().toISOString();
  store.invocations.sort((a, b) =>
    a.invocationId.localeCompare(b.invocationId),
  );
  writeJson(INVOCATION_PATH, store);
};

function correctionPacket(planned: PlannedCorrection): Json {
  const { claim, attempt, plainText, rawText, entry } = planned;
  const corrected = entry.correctedValue ?? claim.value;
  const evidence = evidenceByClaim.get(claim.claimId) ?? [];
  const observations = observationsByClaim.get(claim.claimId) ?? [];
  const packetId = `correction-packet-${claim.claimId}`;
  const built = buildPacket({
    claim: { ...claim, value: corrected },
    candidateName: entry.candidateName,
    candidate: {
      electionType: 'city-council',
      districtId: null,
      candidateStatus: null,
      formalStatus: null,
      partyStatus: null,
    },
    source: (attempt ?? {
      sourceId: claim.sourceIds[0] ?? '',
      rawPath: '',
    }) as Json & {
      sourceId: string;
      rawPath: string;
    },
    evidence,
    identity: observations,
    rawText,
    plainText,
    packetId,
    packetNotes: [
      'Packet assembled for a corrected claim; source bytes are unchanged from the original claim.',
      `Correction kind: ${entry.kind}.`,
      'Corrected wording is a deletion-only substring of the retained source bytes.',
    ],
  });
  // Windowing is a presentation choice; widen it when the corrected wording sits
  // outside the default excerpt window so reviewers can cite it verbatim.
  const source = built.source as Json;
  const sourceTextContext = str(source.sourceTextContext);
  if (!sourceTextContext.includes(corrected)) {
    const index = Math.max(0, plainText.indexOf(corrected));
    source.sourceTextContext = plainText.slice(
      Math.max(0, index - 900),
      Math.max(0, index - 900) + 2600,
    );
  }
  const rawContext = str(source.rawContext);
  if (!rawContext.includes(corrected)) {
    const index = Math.max(0, rawText.indexOf(corrected));
    source.rawContext = rawText.slice(
      Math.max(0, index - 1200),
      Math.max(0, index - 1200) + 2400,
    );
  }
  const withoutHash: Json = { ...built };
  delete withoutHash.packetSha256;
  built.packetSha256 = sha256(JSON.stringify(withoutHash));
  return built;
}

type ReviewOutcome = {
  status: 'verified' | 'rejected' | 'not-required';
  reasons: string[];
  invocationIds: string[];
  verdicts: string[];
  identityAssessments: string[];
  materialConcerns: string[];
};

function evaluateInvocations(
  planned: PlannedCorrection,
  _packet: Json,
  invocations: CorrectionInvocation[],
): ReviewOutcome {
  const mine = invocations.filter(
    (item) => item.claimId === planned.claim.claimId,
  );
  const roles = new Set(mine.map((item) => item.adjudicatorRole));
  const outcome: ReviewOutcome = {
    status: 'not-required',
    reasons: [],
    invocationIds: [],
    verdicts: [],
    identityAssessments: [],
    materialConcerns: [],
  };
  if (planned.entry.correctedValue === null) return outcome;
  outcome.invocationIds = mine.map((item) => item.invocationId);
  if (roles.size < 2) {
    outcome.status = 'rejected';
    outcome.reasons.push('missing-independent-role');
    return outcome;
  }
  for (const item of mine) {
    if (item.status !== 'completed' || !item.result) {
      outcome.status = 'rejected';
      outcome.reasons.push(`invocation-failed:${item.adjudicatorRole}`);
      continue;
    }
    const parsed = AdjudicatorFindingSchema.safeParse(item.result);
    if (!parsed.success) {
      outcome.status = 'rejected';
      outcome.reasons.push(`finding-schema-invalid:${item.adjudicatorRole}`);
      continue;
    }
    outcome.verdicts.push(parsed.data.verdict);
    outcome.identityAssessments.push(parsed.data.identityAssessment);
    if (parsed.data.materialConcern)
      outcome.materialConcerns.push(parsed.data.materialConcern);
    // Citation gate: every cited excerpt must occur verbatim in the retained
    // source bytes of this claim (normalized HTML or normalized plain text).
    // This is stricter than packet-window contiguity and does not depend on the
    // excerpt window chosen for the prompt.
    const sourcePlain = normalizeText(planned.rawText);
    const missing = parsed.data.evidence.filter((citation) => {
      const excerpt = normalizeText(citation.excerpt);
      return excerpt.length === 0 || !sourcePlain.includes(excerpt);
    });
    if (missing.length > 0) {
      outcome.status = 'rejected';
      outcome.reasons.push(
        `citation-not-in-source:${item.adjudicatorRole}:${missing.length}/${parsed.data.evidence.length}`,
      );
      continue;
    }
    const supports = parsed.data.evidence.filter(
      (citation) =>
        citation.relationship === 'supports' ||
        citation.relationship === 'partially-supports',
    );
    if (supports.length === 0) {
      outcome.status = 'rejected';
      outcome.reasons.push(`no-supporting-citation:${item.adjudicatorRole}`);
      continue;
    }
    if (parsed.data.verdict !== 'supported') {
      outcome.status = 'rejected';
      outcome.reasons.push(
        `verdict-${parsed.data.verdict}:${item.adjudicatorRole}`,
      );
    }
    if (parsed.data.identityAssessment !== 'confirmed') {
      outcome.status = 'rejected';
      outcome.reasons.push(
        `identity-${parsed.data.identityAssessment}:${item.adjudicatorRole}`,
      );
    }
    if (parsed.data.materialConcern) {
      outcome.status = 'rejected';
      outcome.reasons.push(`material-concern:${item.adjudicatorRole}`);
    }
  }
  if (outcome.status !== 'rejected') outcome.status = 'verified';
  return outcome;
}

const PLANNED = (): PlannedCorrection[] =>
  rootCauses.corrections
    .map((entry) => planOne(entry.claimId))
    .filter((item): item is PlannedCorrection => item !== null);

const ensureDir = async (path: string): Promise<void> => {
  const { mkdir } = await import('node:fs/promises');
  await mkdir(path, { recursive: true });
};

async function runReviews(concurrency: number): Promise<void> {
  const planned = PLANNED().filter(
    (item) =>
      item.entry.disposition === 'applied' &&
      item.entry.correctedValue !== null,
  );
  const store = readInvocations();
  const promptsDir = `${process.cwd()}/${PROMPT_DIR}`;
  await ensureDir(promptsDir);
  const queue: Array<{
    planned: PlannedCorrection;
    role: 'established-verifier' | 'adversarial-reviewer';
  }> = [];
  for (const item of planned) {
    for (const role of [
      'established-verifier',
      'adversarial-reviewer',
    ] as const) {
      const invocationId = `correction-${role}-${item.claim.claimId}`;
      const existing = store.invocations.find(
        (entry) => entry.invocationId === invocationId,
      );
      if (existing?.status === 'completed') continue;
      queue.push({ planned: item, role });
    }
  }
  console.log(
    `correction reviews: ${planned.length} claims, ${queue.length} pending invocations`,
  );
  let cursor = 0;
  let completed = 0;
  const worker = async (): Promise<void> => {
    while (cursor < queue.length) {
      const index = cursor;
      cursor += 1;
      const { planned: item, role } = queue[index] as (typeof queue)[number];
      const packet = correctionPacket(item);
      const prompt = promptFor(role, item);
      const promptPath = `${PROMPT_DIR}/${item.claim.claimId}-${role}.txt`;
      writeText(promptPath, prompt);
      const invocationId = `correction-${role}-${item.claim.claimId}`;
      const startedAt = new Date().toISOString();
      const {
        runPiPrompt,
        parsePiJsonStream,
        extractJsonObject,
        ADJUDICATOR_PROVIDER,
        ADJUDICATOR_MODEL,
      } = await import('./lib');
      const reply = await runPiPrompt(prompt);
      const parsed = parsePiJsonStream(reply.stdout);
      let result: Json | null = null;
      let failureReason: string | null = null;
      try {
        result = extractJsonObject(parsed.text);
      } catch (error) {
        failureReason = `reply JSON does not parse: ${error instanceof Error ? error.message : String(error)}`;
      }
      const record: CorrectionInvocation = {
        invocationId,
        claimId: item.claim.claimId,
        candidateId: item.claim.candidateId,
        adjudicatorRole: role,
        packetId: str(packet.packetId),
        packetSha256: str(packet.packetSha256),
        promptPath,
        promptSha256: sha256(prompt),
        provider: ADJUDICATOR_PROVIDER,
        model: ADJUDICATOR_MODEL,
        runner: 'pi-cli-correction-review-v1/medium',
        startedAt,
        finishedAt: new Date().toISOString(),
        durationMs: reply.durationMs,
        status:
          failureReason === null && reply.exitCode === 0
            ? 'completed'
            : 'failed',
        exitCode: reply.exitCode,
        rawOutput: parsed.text,
        result,
        outputSha256: reply.stdout ? sha256(reply.stdout) : null,
        usage: parsed.usage,
        failureReason:
          failureReason ??
          (reply.exitCode === 0
            ? null
            : `pi exited ${reply.exitCode ?? 'null'}: ${reply.stderr.slice(-400)}`),
      };
      store.invocations = store.invocations.filter(
        (entry) => entry.invocationId !== invocationId,
      );
      store.invocations.push(record);
      writeInvocations(store);
      completed += 1;
      console.log(
        `  [${completed}/${queue.length}] ${invocationId} → ${record.status}`,
      );
    }
  };
  await Promise.all(
    Array.from({ length: Math.max(1, concurrency) }, () => worker()),
  );
}

function buildArtifacts(): {
  entries: CorrectedEntry[];
  summary: Json;
  report: Json;
} {
  const store = readInvocations();
  const planned = PLANNED();
  const entries: CorrectedEntry[] = [];
  for (const item of planned) {
    let freshReview: CorrectedEntry['freshReview'] = {
      status: 'not-required',
      invocationIds: [],
      verdicts: [],
      identityAssessments: [],
      materialConcerns: [],
      reasons: [],
    };
    if (item.entry.correctedValue !== null) {
      const outcome = evaluateInvocations(
        item,
        correctionPacket(item),
        store.invocations,
      );
      freshReview = {
        status: outcome.status,
        invocationIds: outcome.invocationIds,
        verdicts: outcome.verdicts,
        identityAssessments: outcome.identityAssessments,
        materialConcerns: outcome.materialConcerns,
        reasons: outcome.reasons,
      };
    }
    entries.push({
      ...item.entry,
      freshReview,
      disposition:
        item.entry.disposition === 'applied' &&
        freshReview.status === 'rejected'
          ? 'rejected'
          : item.entry.disposition,
      dispositionReason:
        item.entry.disposition === 'applied' &&
        freshReview.status === 'rejected'
          ? `${item.entry.dispositionReason} Withdrawn from the remediated dataset: fresh independent review did not verify it (${freshReview.reasons.join(', ')}).`
          : item.entry.dispositionReason,
    });
  }
  const count = (predicate: (entry: CorrectedEntry) => boolean): number =>
    entries.filter(predicate).length;
  const applied = entries.filter((entry) => entry.disposition === 'applied');
  const summary: Json = {
    targets: entries.length,
    applied: applied.length,
    appliedWording: count(
      (entry) =>
        entry.disposition === 'applied' && entry.correctedValue !== null,
    ),
    appliedMetadataOnly: count(
      (entry) =>
        entry.disposition === 'applied' && entry.correctedValue === null,
    ),
    rejected: count((entry) => entry.disposition === 'rejected'),
    requiresMoreEvidence: count(
      (entry) => entry.disposition === 'requires-more-evidence',
    ),
    blocked: count((entry) => entry.disposition === 'blocked'),
    superseded: count((entry) => entry.disposition === 'superseded'),
    notApplicable: count((entry) => entry.disposition === 'not-applicable'),
    freshReviewsVerified: count(
      (entry) => entry.freshReview.status === 'verified',
    ),
    freshReviewsRejected: count(
      (entry) => entry.freshReview.status === 'rejected',
    ),
    publicationEligibleAfterCorrection: count(
      (entry) => entry.publicationEligibilityAfterCorrection.eligible,
    ),
    reviewInvocations: store.invocations.length,
    reviewCostUsd: Number(
      store.invocations
        .reduce((total, item) => total + (item.usage?.costUsd ?? 0), 0)
        .toFixed(5),
    ),
  };
  const report = {
    schemaVersion: '1',
    policy: 'correction-lineage-v1',
    generatedAt: new Date().toISOString(),
    datasetDerivedFrom: {
      path: PATHS.dataset,
      sha256: sha256(readRaw(PATHS.dataset)),
    },
    summary,
    corrections: entries,
  };
  return { entries, summary, report };
}

function writeRemediatedDataset(entries: CorrectedEntry[]): void {
  const applied = entries.filter((entry) => entry.disposition === 'applied');
  const claims: Json[] = [];
  for (const entry of applied) {
    const claim = claimsById.get(entry.claimId);
    if (!claim) continue;
    claims.push({
      claimId: claim.claimId,
      candidateId: claim.candidateId,
      category: claim.category,
      claimType: claim.claimType,
      originalValue: entry.originalValue,
      value: entry.correctedValue ?? entry.originalValue,
      sourceIds: claim.sourceIds,
      evidenceIds: claim.evidenceIds,
      identityObservationIds: claim.identityObservationIds,
      sourcePublicationDate:
        entry.metadataCorrection?.to ?? claim.sourcePublicationDate,
      currentStatus: claim.currentStatus,
      attribution: claim.attribution,
      correctionId: entry.correctionId,
      correctionKind: entry.kind,
      publicationStatus: 'withheld-pending-review',
      publicationEligibilityAfterCorrection:
        entry.publicationEligibilityAfterCorrection,
      freshReview: entry.freshReview,
      notes: [
        'Derived record: the original claim in data/enrichment/normalized/2026/zuoying-mayoral.json is unchanged.',
        'A correction never inherits a prior review outcome or approval.',
      ],
    });
  }
  writeJson(PATHS.remediatedDataset, {
    schemaVersion: '1',
    datasetId: dataset.datasetId,
    generatedAt: new Date().toISOString(),
    derivedFrom: {
      path: PATHS.dataset,
      sha256: sha256(readRaw(PATHS.dataset)),
    },
    policy: 'correction-lineage-v1',
    summary: {
      targets: entries.length,
      applied: applied.length,
      published: 0,
      note: 'Corrected records are intentionally not published: automated-editorial-policy-v1 permits only education / historical-position / professional-experience claims sourced from Kaohsiung City Council member profiles or Legislative Yuan profiles, and none of the corrected claims meets those constraints.',
    },
    claims,
    corrections: entries,
  });
}

function markdownTable(entries: CorrectedEntry[]): string {
  const rows = entries.map(
    (entry) =>
      `| ${entry.claimId} | ${entry.candidateName} | ${entry.claimType} | ${entry.kind} | ${entry.disposition} | ${entry.freshReview.status} | ${(entry.correctedValue ?? entry.originalValue).slice(0, 40).replace(/\|/gu, '/')} |`,
  );
  return [
    '| Claim | 候選人 | 類型 | 修正方式 | 處置 | 新審查 | 修正後文字（節錄） |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
  ].join('\n');
}

function writeReports(): void {
  const { entries, summary, report } = buildArtifacts();
  writeRemediatedDataset(entries);
  writeJson('reports/autonomous-remediation-corrections.json', report);
  const byKind = new Map<string, CorrectedEntry[]>();
  for (const entry of entries) {
    const list = byKind.get(entry.kind) ?? [];
    list.push(entry);
    byKind.set(entry.kind, list);
  }
  const sections: string[] = [
    '# Autonomous remediation — claim corrections',
    '',
    `Generated ${report.generatedAt} under policy \`correction-lineage-v1\`. Original claims and retained source bytes are unchanged; every applied correction is a deletion-only substring of the retained source and carries lineage.`,
    '',
    '## Summary',
    '',
    `- Targets: ${summary.targets}`,
    `- Applied: ${summary.applied} (wording ${summary.appliedWording}, metadata-only ${summary.appliedMetadataOnly})`,
    `- Rejected after fresh review: ${summary.rejected}`,
    `- Requires more evidence: ${summary.requiresMoreEvidence}`,
    `- Blocked (wrong identity): ${summary.blocked}`,
    `- Fresh independent reviews: verified ${summary.freshReviewsVerified}, rejected ${summary.freshReviewsRejected}`,
    `- Corrected claims eligible for automated publication: ${summary.publicationEligibleAfterCorrection}`,
    `- Review invocations: ${summary.reviewInvocations}, cost USD ${summary.reviewCostUsd}`,
    '',
    '## Disposition table',
    '',
    markdownTable(entries),
    '',
  ];
  for (const [kind, group] of byKind) {
    sections.push(`## ${kind} (${group.length})`, '');
    for (const entry of group) {
      sections.push(
        `### ${entry.claimId} — ${entry.candidateName}`,
        '',
        `- Original: ${entry.originalValue}`,
        `- Corrected: ${entry.correctedValue ?? '（未變更文字）'}`,
        `- Defect: ${entry.defect || '（未記錄）'}`,
        `- Literal support: ${entry.literalSupport.matchedText ?? 'n/a'} @ ${entry.literalSupport.location ?? 'n/a'} (${entry.literalSupport.sourceId}, sha256 ${entry.literalSupport.sourceSha256.slice(0, 12)}…)`,
        `- Reviewer proposals: ${entry.reviewerProposals.length ? entry.reviewerProposals.join(' ／ ') : '（無）'}`,
        `- Disposition: ${entry.disposition} — ${entry.dispositionReason}`,
        `- Fresh review: ${entry.freshReview.status} (verdicts ${entry.freshReview.verdicts.join(', ') || 'n/a'}; reasons ${entry.freshReview.reasons.join(', ') || 'none'})`,
        `- Policy v1 after correction: ${entry.publicationEligibilityAfterCorrection.eligible ? 'eligible' : `ineligible — ${entry.publicationEligibilityAfterCorrection.reasons.join(', ')}`}`,
        '',
      );
    }
  }
  writeText(
    'reports/autonomous-remediation-corrections.md',
    sections.join('\n'),
  );
  console.log(
    `corrections: targets ${summary.targets}, applied ${summary.applied}, requires-more-evidence ${summary.requiresMoreEvidence}, blocked ${summary.blocked}, rejected ${summary.rejected}`,
  );
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? 'plan';
  if (command === 'plan') {
    const planned = PLANNED();
    for (const item of planned) {
      console.log(
        `${item.entry.claimId} ${item.entry.kind} ${item.entry.disposition} | ${item.entry.originalValue.slice(0, 42)} → ${(item.entry.correctedValue ?? '∅').slice(0, 42)}`,
      );
    }
    return;
  }
  if (command === 'run') {
    const index = process.argv.indexOf('--concurrency');
    const concurrency = index >= 0 ? Number(process.argv[index + 1] ?? '4') : 4;
    await runReviews(concurrency);
    writeReports();
    return;
  }
  if (command === 'report') {
    writeReports();
    return;
  }
  throw new Error(`unknown command ${command}`);
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? (error.stack ?? error.message) : String(error),
  );
  process.exit(1);
});
