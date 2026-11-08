import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import datasetInput from '../data/enrichment/normalized/2026/zuoying-mayoral.json';
import semanticInput from '../reports/semantic-review-execution.json';
import {
  AUTOMATED_DATASET_ID,
  AUTOMATED_POLICY_VERSION,
  type AutomatedDecisionSet,
  evaluateAutomatedPolicyEligibility,
  validateAutomatedDecisionSet,
} from '../src/data/enrichment/automated-policy';
import {
  type AutomatedPublicationSnapshot,
  validateAutomatedPublicationSnapshot,
} from '../src/data/enrichment/automated-publication';
import {
  type EnrichmentDataset,
  validateEnrichmentDataset,
} from '../src/data/enrichment/schema';
import {
  assertSemanticFindingCitations,
  type SemanticReviewReport,
  validateSemanticReviewReport,
} from '../src/data/enrichment/semantic-review';

const SNAPSHOT_DATE = '2026-11-07';
const ROOT = process.cwd();
const DECISION_PATH =
  'data/enrichment/automated/2026/zuoying-mayoral-decisions.json';
const PUBLIC_PATH = 'data/published/2026/zuoying-mayoral-automated.json';
const DEFAULT_GENERATED_AT =
  process.env.AUTOMATED_PUBLICATION_GENERATED_AT?.trim() ||
  new Date().toISOString();

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function readJson<T>(path: string): T {
  try {
    return JSON.parse(readFileSync(resolve(ROOT, path), 'utf8')) as T;
  } catch (error) {
    throw new Error(
      `Unable to read JSON ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function writeJson(path: string, value: unknown): void {
  const target = resolve(ROOT, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
}

function normalizeText(value: string): string {
  return value
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
    .replace(/\s+/gu, '')
    .toLocaleLowerCase();
}

function supports(text: string, value: string): boolean {
  const expected = normalizeText(value);
  return expected.length > 0 && normalizeText(text).includes(expected);
}

function sourcePublisher(sourceClass: string): string {
  if (sourceClass === 'kcc-member-profile') return '高雄市議會全球網';
  if (sourceClass === 'legislative-yuan') return '立法院全球資訊網';
  return sourceClass;
}

function sourceNote(sourceClass: string): string {
  return `${sourcePublisher(sourceClass)}原始快照；來源版本由 automated-editorial-policy-v1 離線校驗。`;
}

type Disposition = {
  claimId: string;
  candidateId: string;
  candidateName: string;
  agreement: string;
  verdictA: string;
  verdictB: string;
  differenceDimensions: string[];
  disposition:
    | 'machine-approved'
    | 'excluded-unresolved'
    | 'excluded-policy'
    | 'excluded-wrong-identity';
  reasons: string[];
  correctionProposed: boolean;
};

function buildArtifacts(generatedAt = DEFAULT_GENERATED_AT): {
  decisions: AutomatedDecisionSet;
  snapshot: AutomatedPublicationSnapshot;
  dispositions: Disposition[];
  corrections: Array<Record<string, unknown>>;
  sourceChecks: Array<Record<string, unknown>>;
} {
  const dataset: EnrichmentDataset = validateEnrichmentDataset(datasetInput);
  const semantic: SemanticReviewReport =
    validateSemanticReviewReport(semanticInput);
  if (
    dataset.snapshotDate !== SNAPSHOT_DATE ||
    semantic.snapshotDate !== SNAPSHOT_DATE
  ) {
    throw new Error(
      `Automated publication requires snapshot ${SNAPSHOT_DATE}.`,
    );
  }
  if (semantic.datasetId !== AUTOMATED_DATASET_ID) {
    throw new Error(`Unexpected semantic dataset ${semantic.datasetId}.`);
  }

  const sourceById = new Map(
    dataset.sourceAttempts.map((source) => [source.sourceId, source]),
  );
  const packetByClaimId = new Map(
    semantic.packets.map((packet) => [packet.claimId, packet]),
  );
  const comparisonByClaimId = new Map(
    semantic.comparisons.map((comparison) => [comparison.claimId, comparison]),
  );
  const invocationByKey = new Map(
    semantic.invocations.map((invocation) => [
      `${invocation.reviewerRole}:${invocation.claimId}`,
      invocation,
    ]),
  );
  const duplicateClaimIds = new Set(
    dataset.duplicateGroups.flatMap((group) => group.claimIds),
  );
  const dispositions: Disposition[] = [];
  const corrections: Array<Record<string, unknown>> = [];
  const sourceChecks: Array<Record<string, unknown>> = [];
  const decisions: AutomatedDecisionSet['decisions'] = [];
  const publicRecords: AutomatedPublicationSnapshot['records'] = [];
  const publicSources = new Map<
    string,
    AutomatedPublicationSnapshot['sources'][number]
  >();

  for (const source of dataset.sourceAttempts) {
    if (!source.rawPath || !source.sha256 || source.byteLength === null)
      continue;
    const rawPath = source.rawPath;
    const expectedSha256 = source.sha256;
    const expectedByteLength = source.byteLength;
    const bytes = readFileSync(resolve(ROOT, rawPath));
    const actualSha256 = sha256(bytes);
    const unchanged =
      actualSha256 === expectedSha256 &&
      bytes.byteLength === expectedByteLength;
    sourceChecks.push({
      sourceId: source.sourceId,
      rawPath,
      expectedSha256,
      actualSha256,
      byteLength: bytes.byteLength,
      status: unchanged ? 'unchanged' : 'mismatch',
    });
    if (!unchanged)
      throw new Error(
        `Source ${source.sourceId} changed before automated publication.`,
      );
  }

  for (const claim of dataset.claims) {
    const packet = packetByClaimId.get(claim.claimId);
    const comparison = comparisonByClaimId.get(claim.claimId);
    const invocationA = invocationByKey.get(`reviewer-a:${claim.claimId}`);
    const invocationB = invocationByKey.get(`reviewer-b:${claim.claimId}`);
    if (
      !packet ||
      !comparison ||
      !invocationA ||
      !invocationB ||
      !invocationA.result ||
      !invocationB.result
    ) {
      throw new Error(`Incomplete semantic provenance for ${claim.claimId}.`);
    }
    if (
      invocationA.status !== 'completed' ||
      invocationB.status !== 'completed' ||
      !invocationA.runId ||
      !invocationB.runId
    ) {
      throw new Error(
        `Semantic invocation is not a completed real run for ${claim.claimId}.`,
      );
    }
    const resultA = invocationA.result;
    const resultB = invocationB.result;
    if (
      comparison.agreement !== 'full-agreement' &&
      comparison.agreement !== 'partial-disagreement' &&
      comparison.agreement !== 'same-verdict-different-reasoning' &&
      comparison.agreement !== 'direct-contradiction'
    ) {
      throw new Error(
        `Semantic comparison is unavailable or unsupported for ${claim.claimId}.`,
      );
    }
    const agreement = comparison.agreement;
    assertSemanticFindingCitations(packet, resultA);
    assertSemanticFindingCitations(packet, resultB);

    const sourceVersions = claim.sourceIds.map((sourceId) => {
      const source = sourceById.get(sourceId);
      if (!source?.rawPath || !source.sha256 || source.byteLength === null) {
        throw new Error(
          `Claim ${claim.claimId} has incomplete source ${sourceId}.`,
        );
      }
      const byteLength = source.byteLength;
      const bytes = readFileSync(resolve(ROOT, source.rawPath));
      const actualSha256 = sha256(bytes);
      if (actualSha256 !== source.sha256 || bytes.byteLength !== byteLength) {
        throw new Error(
          `Claim ${claim.claimId} source ${sourceId} failed checksum reopen.`,
        );
      }
      if (
        packet.source.sourceId !== sourceId ||
        packet.source.sha256 !== source.sha256
      ) {
        throw new Error(
          `Semantic packet/source mismatch for ${claim.claimId}.`,
        );
      }
      const text = bytes.toString('utf8');
      for (const evidenceId of claim.evidenceIds) {
        const evidence = dataset.evidence.find(
          (item) => item.evidenceId === evidenceId,
        );
        if (
          !evidence ||
          evidence.sourceId !== sourceId ||
          evidence.supportType !== 'direct'
        ) {
          throw new Error(
            `Claim ${claim.claimId} has invalid direct evidence ${evidenceId}.`,
          );
        }
        if (!supports(text, evidence.excerpt)) {
          throw new Error(
            `Evidence ${evidenceId} cannot be reopened in ${source.rawPath}.`,
          );
        }
      }
      return {
        sourceId,
        sha256: source.sha256,
        byteLength,
        rawPath: source.rawPath,
      };
    });

    const identityObservations = claim.identityObservationIds.map(
      (observationId) => {
        const observation = dataset.observations.find(
          (item) => item.observationId === observationId,
        );
        if (
          !observation ||
          observation.candidateId !== claim.candidateId ||
          !observation.candidateIds.includes(claim.candidateId) ||
          observation.identityStatus !== 'resolved' ||
          observation.isNameOnlyMatch
        ) {
          throw new Error(
            `Claim ${claim.claimId} has invalid identity observation ${observationId}.`,
          );
        }
        return observation;
      },
    );
    if (identityObservations.length === 0)
      throw new Error(`Claim ${claim.claimId} has no identity observation.`);

    const correctionResults = [
      resultA.proposedCorrection,
      resultB.proposedCorrection,
    ].filter((item): item is NonNullable<typeof item> => item !== null);
    const correctionProposed = correctionResults.length > 0;
    if (correctionProposed) {
      corrections.push({
        correctionId: `semantic-correction-${claim.claimId}`,
        claimId: claim.claimId,
        originalWording: claim.value,
        proposals: correctionResults,
        disposition: 'recorded-not-applied',
        reason:
          'automated-editorial-policy-v1 does not publish corrected or disputed wording; the original claim remains withheld and proposals remain audit evidence.',
      });
    }

    const policy = evaluateAutomatedPolicyEligibility(
      dataset,
      claim.claimId,
      {
        packetId: packet.packetId,
        packetSha256: packet.packetSha256,
        reviewerA: {
          invocationId: invocationA.invocationId,
          runId: invocationA.runId,
          model: invocationA.model,
          runner: invocationA.runner,
          verdict: resultA.verdict,
          identityAssessment: resultA.identityAssessment,
          correctionProposed: resultA.proposedCorrection !== null,
        },
        reviewerB: {
          invocationId: invocationB.invocationId,
          runId: invocationB.runId,
          model: invocationB.model,
          runner: invocationB.runner,
          verdict: resultB.verdict,
          identityAssessment: resultB.identityAssessment,
          correctionProposed: resultB.proposedCorrection !== null,
        },
        comparison: agreement,
      },
      sourceById,
      duplicateClaimIds,
    );
    const reasons = [...policy.reasons];
    if (
      agreement === 'partial-disagreement' ||
      agreement === 'direct-contradiction'
    )
      reasons.push('unresolved-semantic-disagreement');
    if (agreement === 'same-verdict-different-reasoning')
      reasons.push('unresolved-semantic-review-difference');
    if (
      resultA.verdict === 'wrong-identity' ||
      resultB.verdict === 'wrong-identity'
    )
      reasons.push('wrong-identity-verdict');
    if (
      agreement === 'full-agreement' &&
      comparison.differenceDimensions.length > 0
    ) {
      reasons.push('nonempty-disagreement-dimensions');
    }
    if (
      !resultA.evidence.some(
        (citation) => citation.relationship === 'supports',
      ) ||
      !resultB.evidence.some((citation) => citation.relationship === 'supports')
    ) {
      reasons.push('semantic-citation-not-direct-support');
    }
    for (const observation of identityObservations) {
      if (!supports(observation.excerpt, observation.observedName))
        reasons.push(`identity-text-not-reopened:${observation.observationId}`);
    }
    const eligible = policy.eligible && reasons.length === 0;
    const status = eligible ? 'machine-approved' : 'machine-rejected';
    const candidateName = packet.candidateName;
    const correctionDisposition = correctionProposed
      ? 'blocked'
      : policy.correctionDisposition;
    const disposition: Disposition = {
      claimId: claim.claimId,
      candidateId: claim.candidateId,
      candidateName,
      agreement,
      verdictA: resultA.verdict,
      verdictB: resultB.verdict,
      differenceDimensions: comparison.differenceDimensions,
      disposition: eligible
        ? 'machine-approved'
        : resultA.identityAssessment === 'wrong-identity' ||
            resultB.identityAssessment === 'wrong-identity'
          ? 'excluded-wrong-identity'
          : agreement !== 'full-agreement'
            ? 'excluded-unresolved'
            : 'excluded-policy',
      reasons,
      correctionProposed,
    };
    dispositions.push(disposition);

    decisions.push({
      decisionId: `automated-decision-${claim.claimId}`,
      claimId: claim.claimId,
      candidateId: claim.candidateId,
      policyVersion: AUTOMATED_POLICY_VERSION,
      status,
      category: claim.category,
      claimType: claim.claimType,
      originalClaimVersion: sha256(canonicalize(claim)),
      originalWording: claim.value,
      publishedWording: eligible ? claim.value : null,
      sourceIds: claim.sourceIds,
      evidenceIds: claim.evidenceIds,
      identityObservationIds: claim.identityObservationIds,
      sourceVersions,
      semantic: {
        packetId: packet.packetId,
        packetSha256: packet.packetSha256,
        reviewerA: {
          invocationId: invocationA.invocationId,
          runId: invocationA.runId,
          model: invocationA.model,
          runner: invocationA.runner,
          verdict: resultA.verdict,
          identityAssessment: resultA.identityAssessment,
          correctionProposed: resultA.proposedCorrection !== null,
        },
        reviewerB: {
          invocationId: invocationB.invocationId,
          runId: invocationB.runId,
          model: invocationB.model,
          runner: invocationB.runner,
          verdict: resultB.verdict,
          identityAssessment: resultB.identityAssessment,
          correctionProposed: resultB.proposedCorrection !== null,
        },
        comparison: agreement,
      },
      verificationMethod:
        'automated-editorial-policy-v1:raw-reopen+sha256+direct-evidence+identity+independent-semantic-review',
      acceptanceRationale: eligible
        ? 'Historical institutional biography fact with direct retained evidence, resolved identity, unchanged source, and two independent supported semantic results with full agreement.'
        : `Excluded by automated-editorial-policy-v1: ${reasons.join('; ')}.`,
      blockingReasons: reasons,
      correctionDisposition,
      correctionIds: correctionProposed
        ? [`semantic-correction-${claim.claimId}`]
        : [],
      generatedAt,
      publicationTimestamp: generatedAt,
      withdrawnAt: null,
      withdrawalReason: null,
    });

    if (eligible) {
      for (const sourceId of claim.sourceIds) {
        const source = sourceById.get(sourceId);
        if (!source) throw new Error(`Missing source ${sourceId}.`);
        publicSources.set(sourceId, {
          sourceId,
          url: source.url,
          publisher: sourcePublisher(source.sourceClass),
          publicationDate: claim.sourcePublicationDate,
          verificationStatus: 'Verified',
          note: sourceNote(source.sourceClass),
        });
      }
      publicRecords.push({
        claimId: claim.claimId,
        candidateId: claim.candidateId,
        category: claim.category,
        claimType: claim.claimType,
        title: claim.title,
        organization: claim.organization,
        value: claim.value,
        sourcePublicationDate: claim.sourcePublicationDate,
        validFrom: claim.validFrom,
        validTo: claim.validTo,
        temporalPrecision: claim.temporalPrecision,
        currentStatus: 'historical',
        attribution: 'institutional-record',
        sourceIds: claim.sourceIds,
        evidenceIds: claim.evidenceIds,
        machineApprovalId: `automated-decision-${claim.claimId}`,
        policyVersion: AUTOMATED_POLICY_VERSION,
        publicationOrigin: 'automated-policy',
      });
    }
  }

  const correctionTargetIds = new Set(corrections.map((item) => item.claimId));
  const disagreementClaims = dispositions.filter(
    (item) => item.agreement === 'partial-disagreement',
  ).length;
  if (disagreementClaims !== 71)
    throw new Error(
      `Expected 71 semantic disagreements, found ${disagreementClaims}.`,
    );
  const decisionSet: AutomatedDecisionSet = {
    schemaVersion: '1',
    datasetId: AUTOMATED_DATASET_ID,
    policyVersion: AUTOMATED_POLICY_VERSION,
    snapshotDate: SNAPSHOT_DATE,
    generatedAt,
    decisions,
    summary: {
      totalClaims: 143,
      machineApproved: decisions.filter(
        (item) => item.status === 'machine-approved',
      ).length,
      machineRejected: decisions.filter(
        (item) => item.status === 'machine-rejected',
      ).length,
      withdrawn: 0,
      correctionTargets: correctionTargetIds.size,
      disagreementClaims: 71,
      humanApproved: 0,
    },
    note: 'Machine decisions are separate from human editorial decisions. No reviewer identity or human approval is present.',
  };
  validateAutomatedDecisionSet(decisionSet);

  const snapshotWithoutChecksum = {
    schemaVersion: '1' as const,
    datasetId: AUTOMATED_DATASET_ID,
    policyVersion: AUTOMATED_POLICY_VERSION,
    snapshotDate: SNAPSHOT_DATE,
    generatedAt,
    records: publicRecords,
    sources: [...publicSources.values()].sort((a, b) =>
      a.sourceId.localeCompare(b.sourceId),
    ),
    withdrawnClaimIds: [],
    note: 'Only machine-approved low-risk historical institutional facts are included. This snapshot is not human editorial approval.',
  };
  const snapshot: AutomatedPublicationSnapshot = {
    ...snapshotWithoutChecksum,
    checksum: sha256(canonicalize(snapshotWithoutChecksum)),
  };
  validateAutomatedPublicationSnapshot(snapshot);
  return {
    decisions: decisionSet,
    snapshot,
    dispositions,
    corrections,
    sourceChecks,
  };
}

function reportMarkdown(artifacts: ReturnType<typeof buildArtifacts>): string {
  const { decisions, snapshot, dispositions, corrections } = artifacts;
  const byCandidate = new Map<
    string,
    { name: string; total: number; approved: number; rejected: number }
  >();
  for (const item of dispositions) {
    const row = byCandidate.get(item.candidateId) ?? {
      name: item.candidateName,
      total: 0,
      approved: 0,
      rejected: 0,
    };
    row.total += 1;
    if (item.disposition === 'machine-approved') row.approved += 1;
    else row.rejected += 1;
    byCandidate.set(item.candidateId, row);
  }
  return [
    '# Automated publication coverage',
    '',
    `- Policy: ${AUTOMATED_POLICY_VERSION}`,
    `- Claims assessed: ${decisions.summary.totalClaims}`,
    `- Machine-approved: ${decisions.summary.machineApproved}`,
    `- Machine-rejected: ${decisions.summary.machineRejected}`,
    `- Public records: ${snapshot.records.length}`,
    `- Correction targets recorded but not applied: ${corrections.length}`,
    '',
    '## Candidate coverage',
    '',
    '| Candidate | Claims | Machine-approved | Rejected |',
    '| --- | ---: | ---: | ---: |',
    ...[...byCandidate.values()].map(
      (row) =>
        `| ${row.name} | ${row.total} | ${row.approved} | ${row.rejected} |`,
    ),
    '',
    'Machine approval is not human editorial approval. Candidates without an eligible record retain neutral unavailable states.',
    '',
  ].join('\n');
}

function writeArtifacts(): void {
  const artifacts = buildArtifacts();
  writeJson(DECISION_PATH, artifacts.decisions);
  writeJson(PUBLIC_PATH, artifacts.snapshot);
  writeJson('reports/automated-policy-audit.json', {
    schemaVersion: '1',
    datasetId: AUTOMATED_DATASET_ID,
    policyVersion: AUTOMATED_POLICY_VERSION,
    snapshotDate: SNAPSHOT_DATE,
    generatedAt: artifacts.decisions.generatedAt,
    decisions: artifacts.decisions.decisions,
    summary: artifacts.decisions.summary,
    note: 'Offline machine adjudication only; not human editorial review.',
  });
  writeJson('reports/automated-disagreement-dispositions.json', {
    schemaVersion: '1',
    datasetId: AUTOMATED_DATASET_ID,
    policyVersion: AUTOMATED_POLICY_VERSION,
    disagreementCount: artifacts.dispositions.filter(
      (item) => item.agreement === 'partial-disagreement',
    ).length,
    dispositions: artifacts.dispositions.filter(
      (item) => item.agreement !== 'full-agreement',
    ),
    note: 'Substantive or unresolved semantic disagreement blocks unattended publication.',
  });
  writeJson('reports/automated-corrections.json', {
    schemaVersion: '1',
    datasetId: AUTOMATED_DATASET_ID,
    correctionTargetCount: artifacts.corrections.length,
    corrections: artifacts.corrections,
    note: 'Correction proposals are retained as audit evidence and are not silently applied to normalized claims.',
  });
  writeJson('reports/automated-withdrawal.json', {
    schemaVersion: '1',
    datasetId: AUTOMATED_DATASET_ID,
    policyVersion: AUTOMATED_POLICY_VERSION,
    sourceChecks: artifacts.sourceChecks,
    withdrawnClaimIds: artifacts.decisions.decisions
      .filter((item) => item.status === 'withdrawn')
      .map((item) => item.claimId),
    withdrawalRules: [
      'source SHA-256 or byte length changes',
      'claim version changes',
      'semantic packet or run provenance changes',
      'identity observation is no longer resolved',
      'policy version is not current',
    ],
    note: 'No withdrawals in this run; validation is fail-closed and preserves prior decision records.',
  });
  writeJson('reports/automated-coverage.json', {
    schemaVersion: '1',
    datasetId: AUTOMATED_DATASET_ID,
    policyVersion: AUTOMATED_POLICY_VERSION,
    candidates: artifacts.dispositions.reduce<
      Record<
        string,
        { total: number; machineApproved: number; machineRejected: number }
      >
    >((result, item) => {
      const row = result[item.candidateId] ?? {
        total: 0,
        machineApproved: 0,
        machineRejected: 0,
      };
      row.total += 1;
      if (item.disposition === 'machine-approved') row.machineApproved += 1;
      else row.machineRejected += 1;
      result[item.candidateId] = row;
      return result;
    }, {}),
    summary: artifacts.decisions.summary,
    publicClaimIds: artifacts.snapshot.records.map((record) => record.claimId),
    note: 'Coverage counts include all 143 scoped claims; absence is not evidence that a fact does not exist.',
  });
  writeFileSync(
    resolve(ROOT, 'reports/automated-disagreement-dispositions.md'),
    [
      '# Automated disagreement dispositions',
      '',
      `All ${artifacts.dispositions.filter((item) => item.agreement === 'partial-disagreement').length} semantic disagreement labels are explicitly excluded from unattended publication.`,
      '',
      ...artifacts.dispositions
        .filter((item) => item.agreement === 'partial-disagreement')
        .map(
          (item) =>
            `- ${item.claimId} ${item.candidateName}: ${item.verdictA} / ${item.verdictB}; disposition **${item.disposition}**; blockers: ${item.reasons.join(', ')}.`,
        ),
      '',
      'No disagreement was resolved by voting. Original evidence and reviewer provenance remain in the semantic review artifacts.',
      '',
    ].join('\n'),
  );
  writeFileSync(
    resolve(ROOT, 'reports/automated-corrections.md'),
    [
      '# Automated correction dispositions',
      '',
      `The ${artifacts.corrections.length} semantic correction targets were inspected. None were silently applied to normalized claims or published wording.`,
      '',
      ...artifacts.corrections.map(
        (item) =>
          `- ${String(item.claimId)}: recorded-not-applied; the original claim remains withheld under policy v1.`,
      ),
      '',
      'Wrong-subject `enrich-claim-0111` is explicitly blocked and is not relinked to 尹立.',
      '',
    ].join('\n'),
  );
  writeFileSync(
    resolve(ROOT, 'reports/automated-policy-coverage.md'),
    reportMarkdown(artifacts),
  );
  console.log(
    `Automated publication complete: ${artifacts.decisions.summary.machineApproved} machine-approved, ${artifacts.decisions.summary.machineRejected} rejected, ${artifacts.snapshot.records.length} published records.`,
  );
}

function validateOutputs(): void {
  const decisions = validateAutomatedDecisionSet(readJson(DECISION_PATH));
  const snapshot = validateAutomatedPublicationSnapshot(readJson(PUBLIC_PATH));
  const expectedChecksum = sha256(
    canonicalize({
      schemaVersion: snapshot.schemaVersion,
      datasetId: snapshot.datasetId,
      policyVersion: snapshot.policyVersion,
      snapshotDate: snapshot.snapshotDate,
      generatedAt: snapshot.generatedAt,
      records: snapshot.records,
      sources: snapshot.sources,
      withdrawnClaimIds: snapshot.withdrawnClaimIds,
      note: snapshot.note,
    }),
  );
  if (snapshot.checksum !== expectedChecksum)
    throw new Error('Automated publication checksum mismatch.');
  if (decisions.summary.machineApproved !== snapshot.records.length)
    throw new Error('Decision/publication count mismatch.');
  const approved = new Set(
    decisions.decisions
      .filter((item) => item.status === 'machine-approved')
      .map((item) => item.claimId),
  );
  for (const record of snapshot.records)
    if (!approved.has(record.claimId))
      throw new Error(
        `Public record ${record.claimId} lacks machine approval.`,
      );
  const artifacts = buildArtifacts(decisions.generatedAt);
  if (canonicalize(artifacts.decisions) !== canonicalize(decisions))
    throw new Error(
      'Decision output is stale relative to current source evidence.',
    );
  if (canonicalize(artifacts.snapshot) !== canonicalize(snapshot))
    throw new Error(
      'Publication snapshot is stale relative to current source evidence.',
    );
  console.log(
    `Automated publication validation passed: ${decisions.decisions.length} decisions, ${snapshot.records.length} public records, ${decisions.summary.disagreementClaims} disagreements blocked.`,
  );
}

const command = process.argv[2] ?? 'execute';
if (
  command === 'execute' ||
  command === 'normalize' ||
  command === 'review' ||
  command === 'report'
)
  writeArtifacts();
else if (command === 'validate' || command === 'verify') validateOutputs();
else throw new Error(`Unknown autonomous publication command: ${command}`);
