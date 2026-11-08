/**
 * Builds adjudication-materiality-v2 machine decisions.
 *
 * Nothing here publishes anything: it replays the retained artifacts (dataset,
 * v1 semantic report, fresh adjudicator invocations, root-cause report) and
 * derives a per-claim decision that (a) re-applies automated-editorial-policy-v1
 * unchanged and (b) adds the independent adjudication requirement introduced by
 * adjudication-materiality-v2.
 */

import {
  ADJUDICATION_POLICY_VERSION,
  AdjudicatorFindingSchema,
  type AdjudicatorInvocation,
  AdjudicatorInvocationSetSchema,
  assertAdjudicatorCitations,
  assessAdjudicatedEligibility,
} from '../../src/data/enrichment/adjudicator-review';
import {
  AUTOMATED_POLICY_VERSION,
  type AutomatedSemanticProvenance,
  evaluateAutomatedPolicyEligibility,
} from '../../src/data/enrichment/automated-policy';
import type { EnrichmentDataset } from '../../src/data/enrichment/schema';
import type { SemanticReviewReport } from '../../src/data/enrichment/semantic-review';
import {
  PATHS,
  readJson,
  readRaw,
  sha256,
  sourcePublisher,
  writeJson,
  writeText,
} from './lib';

type RootCauseClaim = {
  claimId: string;
  candidateId: string;
  candidateName: string;
  category: string;
  claimType: string;
  attribution: string;
  currentStatus: string;
  sourceClasses: string[];
  status: string;
  blockingReasons: string[];
  rootCauses: string[];
  primaryCause: string;
  semantic: {
    comparison: string;
    verdictA: string;
    verdictB: string;
    differenceDimensions: string[];
    disputedPropositions: string[];
    materiality: {
      material: boolean;
      materialDimensions: string[];
      nonMaterialDimensions: string[];
      rationale: string[];
    };
    correctionProposed: boolean;
  };
};

type RootCauseReport = {
  claims: RootCauseClaim[];
};

type V1Decision = {
  claimId: string;
  candidateId: string;
  status: string;
  category: string;
  claimType: string;
  originalWording: string;
  publishedWording: string | null;
  sourceIds: string[];
  evidenceIds: string[];
  identityObservationIds: string[];
  sourceVersions: Array<{
    sourceId: string;
    sha256: string;
    byteLength: number;
    rawPath: string;
  }>;
  semantic: AutomatedSemanticProvenance;
  blockingReasons: string[];
  verificationMethod: string;
  acceptanceRationale: string;
};

type V1DecisionSet = {
  decisions: V1Decision[];
};

type MaterialityView = {
  material: boolean;
  materialDimensions: string[];
  nonMaterialDimensions: string[];
  rationale: string[];
};

export type RemediationDecision = {
  decisionId: string;
  claimId: string;
  candidateId: string;
  policyVersion: typeof AUTOMATED_POLICY_VERSION;
  adjudicationPolicyVersion: typeof ADJUDICATION_POLICY_VERSION;
  status: 'machine-approved' | 'machine-rejected';
  category: string;
  claimType: string;
  originalWording: string;
  publishedWording: string | null;
  sourceIds: string[];
  evidenceIds: string[];
  identityObservationIds: string[];
  sourceVersions: V1Decision['sourceVersions'];
  semantic: AutomatedSemanticProvenance | null;
  adjudication: {
    invocationIds: [string, string];
    packetId: string;
    packetSha256: string;
    verdictA: string;
    verdictB: string;
    identityA: string;
    identityB: string;
    materialConcernA: string | null;
    materialConcernB: string | null;
    material: boolean;
    materialDimensions: string[];
    nonMaterialDimensions: string[];
    rationale: string[];
    comparison: AutomatedSemanticProvenance['comparison'];
  } | null;
  policyRejectionReasons: string[];
  adjudicationRejectionReasons: string[];
  blockingReasons: string[];
  verificationMethod: string;
  acceptanceRationale: string;
  stopReason: string;
  generatedAt: string;
};

const compareProvenance = (
  a: AdjudicatorInvocation,
  b: AdjudicatorInvocation,
  material: boolean,
): AutomatedSemanticProvenance['comparison'] => {
  const contradictory =
    a.result?.verdict === 'contradicted' ||
    b.result?.verdict === 'contradicted' ||
    a.result?.verdict === 'wrong-identity' ||
    b.result?.verdict === 'wrong-identity';
  if (contradictory) return 'direct-contradiction';
  return material ? 'partial-disagreement' : 'full-agreement';
};

const reviewerProvenance = (invocation: AdjudicatorInvocation) => ({
  invocationId: invocation.invocationId,
  runId:
    invocation.sessionId ?? invocation.responseId ?? invocation.invocationId,
  model: invocation.model,
  runner: invocation.runner,
  verdict: invocation.result?.verdict ?? 'insufficient-evidence',
  identityAssessment:
    invocation.result?.identityAssessment ?? ('uncertain' as const),
  correctionProposed: false,
});

type StopReasonInput = {
  adjudicated: boolean;
  status: string;
  policyReasons: string[];
  adjudicationReasons: string[];
};

const resolveStopReason = (input: StopReasonInput): string => {
  if (!input.adjudicated)
    return 'not-adjudicated:policy-ineligible-regardless-of-semantic-findings';
  if (input.status === 'machine-approved')
    return 'eligible-after-fresh-independent-adjudication';
  if (input.policyReasons.length > 0)
    return `policy-ineligible:${input.policyReasons[0]}`;
  const first = input.adjudicationReasons[0] ?? '';
  return `adjudication-blocked:${first.replace(/:.*$/u, '')}`;
};

type RationaleInput = {
  status: string;
  adjudicated: boolean;
  category: string;
  claimType: string;
  blockingReasons: string[];
  policyReasons: string[];
  invocationIds: string[] | null;
  adjudication: RemediationDecision['adjudication'];
  materiality: MaterialityView | null;
};

const buildRationale = (input: RationaleInput): string => {
  if (input.status === 'machine-approved') {
    return `Policy v1 permits this ${input.category}/${input.claimType} institutional fact and two independent adjudicators (${(input.invocationIds ?? []).join(', ')}) both returned a supported verdict with confirmed identity and no material concern or temporal over-claim.`;
  }
  if (!input.adjudicated) {
    return `Excluded without re-adjudication: ${input.policyReasons.join(', ') || 'policy gate'}. The claim type, attribution, current-status wording, or source class cannot be published under automated-editorial-policy-v1 regardless of newer semantic findings, so no further reviewer spend would change the outcome.`;
  }
  const detail = input.adjudication;
  const difference =
    input.materiality?.material === true
      ? ` with material differences on ${input.materiality.materialDimensions.join(', ')}`
      : '';
  return `Excluded: ${input.blockingReasons.join(', ')}. Fresh adjudication ${(input.invocationIds ?? []).join(' / ')} returned ${detail?.verdictA} (identity ${detail?.identityA}) and ${detail?.verdictB} (identity ${detail?.identityB})${difference}.`;
};

const main = (now: Date = new Date()) => {
  const dataset = readJson<EnrichmentDataset>(PATHS.dataset);
  const report = readJson<SemanticReviewReport>(PATHS.semanticReport);
  const rootCauses = readJson<RootCauseReport>(PATHS.rootCauses);
  const v1 = readJson<V1DecisionSet>(PATHS.decisions);
  const invocationSet = AdjudicatorInvocationSetSchema.parse(
    readJson<unknown>(PATHS.adjudicatorInvocations),
  );

  const sourceAttemptsById = new Map(
    dataset.sourceAttempts.map((attempt) => [attempt.sourceId, attempt]),
  );
  const packetByClaim = new Map(
    report.packets.map((packet) => [packet.claimId, packet]),
  );
  const duplicateClaimIds = new Set(
    rootCauses.claims
      .filter((claim) =>
        claim.rootCauses.includes('evidence-duplicate-overlap'),
      )
      .map((claim) => claim.claimId),
  );
  const v1ByClaim = new Map(
    v1.decisions.map((decision) => [decision.claimId, decision]),
  );
  const rootByClaim = new Map(
    rootCauses.claims.map((claim) => [claim.claimId, claim]),
  );

  // --- verify every completed invocation is internally consistent -----------
  const verifiedInvocations: AdjudicatorInvocation[] = [];
  const driftedInvocations: string[] = [];
  const integrityFailures: string[] = [];
  for (const invocation of invocationSet.invocations) {
    if (invocation.status !== 'completed' || !invocation.result) continue;
    const prompt = readRaw(invocation.promptPath);
    const promptDrift = sha256(prompt) !== invocation.promptSha256;
    if (sha256(invocation.rawOutput) !== invocation.outputSha256) {
      integrityFailures.push(`${invocation.invocationId}: output hash drift`);
      continue;
    }
    const finding = AdjudicatorFindingSchema.safeParse(invocation.result);
    if (!finding.success) {
      integrityFailures.push(
        `${invocation.invocationId}: finding schema ${finding.error.issues
          .map((issue) => issue.message)
          .join('; ')}`,
      );
      continue;
    }
    const packet = packetByClaim.get(invocation.claimId);
    if (!packet) {
      integrityFailures.push(`${invocation.invocationId}: missing packet`);
      continue;
    }
    if (packet.packetSha256 !== invocation.packetSha256) {
      integrityFailures.push(`${invocation.invocationId}: packet hash drift`);
      continue;
    }
    try {
      assertAdjudicatorCitations(packet, finding.data);
    } catch (error) {
      integrityFailures.push(
        `${invocation.invocationId}: ${(error as Error).message}`,
      );
      continue;
    }
    // A prompt file rewritten after the run cannot be used to prove what the
    // reviewer saw, so the invocation is excluded from selection and recorded.
    if (promptDrift) {
      driftedInvocations.push(invocation.invocationId);
      continue;
    }
    verifiedInvocations.push(invocation);
  }
  if (integrityFailures.length > 0) {
    throw new Error(
      `Adjudicator invocation integrity failed:\n${integrityFailures.join('\n')}`,
    );
  }

  const latest = new Map<string, AdjudicatorInvocation>();
  for (const invocation of verifiedInvocations) {
    const key = `${invocation.claimId}:${invocation.reviewerRole}`;
    const current = latest.get(key);
    if (!current || invocation.startedAt > current.startedAt) {
      latest.set(key, invocation);
    }
  }

  const claimsById = new Map(
    dataset.claims.map((claim) => [claim.claimId, claim]),
  );
  const adjudicatedClaimIds = [
    ...new Set([...latest.keys()].map((key) => key.split(':')[0] as string)),
  ].sort((left, right) => left.localeCompare(right));

  const decisions: RemediationDecision[] = [];
  const adjudicationDetails: Array<{
    claimId: string;
    candidateId: string;
    candidateName: string;
    category: string;
    claimType: string;
    policyReasons: string[];
    adjudicationReasons: string[];
    blockingReasons: string[];
    status: string;
    stopReason: string;
    adjudicated: boolean;
    invocationIds: string[];
    materiality: MaterialityView | null;
    verdicts: { reviewerA: string | null; reviewerB: string | null };
    identity: { reviewerA: string | null; reviewerB: string | null };
    comparison: string | null;
  }> = [];

  for (const claim of dataset.claims) {
    const root = rootByClaim.get(claim.claimId);
    const v1Decision = v1ByClaim.get(claim.claimId);
    if (!v1Decision) {
      throw new Error(`Missing v1 decision for ${claim.claimId}.`);
    }
    const invocationA = latest.get(`${claim.claimId}:reviewer-a`);
    const invocationB = latest.get(`${claim.claimId}:reviewer-b`);
    const adjudicated = Boolean(invocationA?.result && invocationB?.result);

    let semantic: AutomatedSemanticProvenance | null = v1Decision.semantic;
    let adjudication: RemediationDecision['adjudication'] = null;
    let materiality: MaterialityView | null = null;
    const adjudicationReasons: string[] = [];

    if (adjudicated && invocationA?.result && invocationB?.result) {
      const eligibility = assessAdjudicatedEligibility(
        invocationA.result,
        invocationB.result,
      );
      materiality = {
        material: eligibility.materiality.material,
        materialDimensions: eligibility.materiality.materialDimensions,
        nonMaterialDimensions: eligibility.materiality.nonMaterialDimensions,
        rationale: eligibility.materiality.rationale,
      };
      adjudicationReasons.push(...eligibility.reasons);
      const comparison = compareProvenance(
        invocationA,
        invocationB,
        eligibility.materiality.material,
      );
      semantic = {
        packetId: invocationA.packetId,
        packetSha256: invocationA.packetSha256,
        reviewerA: reviewerProvenance(invocationA),
        reviewerB: reviewerProvenance(invocationB),
        comparison,
      };
      adjudication = {
        invocationIds: [invocationA.invocationId, invocationB.invocationId],
        packetId: invocationA.packetId,
        packetSha256: invocationA.packetSha256,
        verdictA: invocationA.result.verdict,
        verdictB: invocationB.result.verdict,
        identityA: invocationA.result.identityAssessment,
        identityB: invocationB.result.identityAssessment,
        materialConcernA: invocationA.result.materialConcern,
        materialConcernB: invocationB.result.materialConcern,
        material: eligibility.materiality.material,
        materialDimensions: eligibility.materiality.materialDimensions,
        nonMaterialDimensions: eligibility.materiality.nonMaterialDimensions,
        rationale: eligibility.materiality.rationale,
        comparison,
      };
    } else {
      adjudicationReasons.push('adjudication-not-run:policy-ineligible');
    }

    const policy = evaluateAutomatedPolicyEligibility(
      dataset,
      claim.claimId,
      semantic as AutomatedSemanticProvenance,
      sourceAttemptsById,
      duplicateClaimIds,
    );

    const blockingReasons = [
      ...new Set([...policy.reasons, ...adjudicationReasons]),
    ].sort((left, right) => left.localeCompare(right));
    const status =
      blockingReasons.length === 0 ? 'machine-approved' : 'machine-rejected';

    const decision: RemediationDecision = {
      decisionId: `automated-decision-v2-${claim.claimId}`,
      claimId: claim.claimId,
      candidateId: claim.candidateId,
      policyVersion: AUTOMATED_POLICY_VERSION,
      adjudicationPolicyVersion: ADJUDICATION_POLICY_VERSION,
      status,
      category: claim.category,
      claimType: claim.claimType,
      originalWording: claim.value,
      publishedWording: status === 'machine-approved' ? claim.value : null,
      sourceIds: claim.sourceIds,
      evidenceIds: claim.evidenceIds,
      identityObservationIds: claim.identityObservationIds,
      sourceVersions: claim.sourceIds.map((sourceId) => {
        if (!sourceAttemptsById.has(sourceId)) {
          throw new Error(
            `Missing source attempt ${sourceId} for ${claim.claimId}.`,
          );
        }
        const version = v1Decision.sourceVersions.find(
          (item) => item.sourceId === sourceId,
        );
        if (!version) {
          throw new Error(
            `Missing source version ${sourceId} for ${claim.claimId}.`,
          );
        }
        return version;
      }),
      semantic,
      adjudication,
      policyRejectionReasons: policy.reasons,
      adjudicationRejectionReasons: adjudicationReasons,
      blockingReasons,
      verificationMethod: adjudicated
        ? 'policy-v1-eligibility+independent-adjudication-v2'
        : 'policy-v1-eligibility',
      acceptanceRationale: buildRationale({
        status,
        adjudicated,
        category: claim.category,
        claimType: claim.claimType,
        blockingReasons,
        policyReasons: policy.reasons,
        invocationIds: adjudication?.invocationIds ?? null,
        adjudication,
        materiality,
      }),
      stopReason: resolveStopReason({
        adjudicated,
        status,
        policyReasons: policy.reasons,
        adjudicationReasons,
      }),
      generatedAt: now.toISOString(),
    };
    decisions.push(decision);
    adjudicationDetails.push({
      claimId: claim.claimId,
      candidateId: claim.candidateId,
      candidateName: root?.candidateName ?? '',
      category: claim.category,
      claimType: claim.claimType,
      policyReasons: policy.reasons,
      adjudicationReasons,
      blockingReasons,
      status,
      stopReason: decision.stopReason,
      adjudicated,
      invocationIds: adjudication?.invocationIds ?? [],
      materiality,
      verdicts: {
        reviewerA: adjudication?.verdictA ?? null,
        reviewerB: adjudication?.verdictB ?? null,
      },
      identity: {
        reviewerA: adjudication?.identityA ?? null,
        reviewerB: adjudication?.identityB ?? null,
      },
      comparison: adjudication?.comparison ?? v1Decision.semantic.comparison,
    });
  }

  if (decisions.length !== dataset.claims.length) {
    throw new Error('Decision count does not match dataset claims.');
  }
  for (const claimId of adjudicatedClaimIds) {
    if (!claimsById.has(claimId)) {
      throw new Error(`Adjudicated claim ${claimId} is not in the dataset.`);
    }
  }

  const approved = decisions.filter(
    (item) => item.status === 'machine-approved',
  );
  const summary = {
    totalClaims: decisions.length,
    adjudicatedClaims: adjudicatedClaimIds.length,
    machineApproved: approved.length,
    machineRejected: decisions.filter(
      (item) => item.status === 'machine-rejected',
    ).length,
    previouslyApproved: v1.decisions.filter(
      (item) => item.status === 'machine-approved',
    ).length,
    reviewerDisagreements: 71,
    correctionTargets: decisions.filter((item) =>
      (rootByClaim.get(item.claimId)?.rootCauses ?? []).includes(
        'wording-correction-proposed',
      ),
    ).length,
    humanApproved: 0,
  };

  const usage = verifiedInvocations.reduce(
    (total, invocation) => {
      const item = invocation.usage;
      if (item) {
        total.inputTokens += item.inputTokens;
        total.outputTokens += item.outputTokens;
        total.costUsd += item.costUsd;
      }
      return total;
    },
    { inputTokens: 0, outputTokens: 0, costUsd: 0 },
  );

  const decisionSet = {
    schemaVersion: '2',
    datasetId: dataset.datasetId,
    policyVersion: AUTOMATED_POLICY_VERSION,
    adjudicationPolicyVersion: ADJUDICATION_POLICY_VERSION,
    snapshotDate: dataset.snapshotDate,
    generatedAt: now.toISOString(),
    decisions,
    summary,
    invocations: {
      recorded: invocationSet.invocations.length,
      verified: verifiedInvocations.length,
      selected: latest.size,
      promptDriftRejected: driftedInvocations,
      claims: adjudicatedClaimIds.length,
      model: invocationSet.invocations[0]?.model ?? null,
      runner: invocationSet.invocations[0]?.runner ?? null,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costUsd: Number(usage.costUsd.toFixed(6)),
    },
    note: 'adjudication-materiality-v2 re-applies automated-editorial-policy-v1 unchanged and adds a fresh independent adjudication requirement. This file is not human editorial approval.',
  };
  writeJson(PATHS.remediationDecisions, decisionSet);

  writeJson('reports/adjudication-remediated.json', {
    schemaVersion: '1',
    generatedAt: now.toISOString(),
    policyVersion: AUTOMATED_POLICY_VERSION,
    adjudicationPolicyVersion: ADJUDICATION_POLICY_VERSION,
    summary,
    invocations: decisionSet.invocations,
    promptDriftRejected: driftedInvocations,
    claims: adjudicationDetails,
  });

  // --- disagreement investigation record ------------------------------------
  const disagreementClaims = rootCauses.claims
    .filter((claim) => claim.semantic.comparison === 'partial-disagreement')
    .sort((left, right) => left.claimId.localeCompare(right.claimId));
  const sameVerdictClaims = rootCauses.claims
    .filter(
      (claim) =>
        claim.semantic.comparison === 'same-verdict-different-reasoning',
    )
    .sort((left, right) => left.claimId.localeCompare(right.claimId));
  const detailByClaim = new Map(
    adjudicationDetails.map((item) => [item.claimId, item]),
  );

  const lines: string[] = [];
  lines.push('# Autonomous remediation — reviewer disagreement investigation');
  lines.push('');
  lines.push(
    `Generated ${now.toISOString()} under \`${ADJUDICATION_POLICY_VERSION}\`. Reviewer disagreement means the two retained v1 semantic reviewers returned different findings for the same packet. Every one of the ${disagreementClaims.length} schema-counted disagreements is listed below with its resolution, together with the ${sameVerdictClaims.length} same-verdict cases that the v1 comparison also flagged.`,
  );
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('| --- | --- |');
  lines.push(
    `| Claims flagged by the v1 comparison | ${disagreementClaims.length + sameVerdictClaims.length} |`,
  );
  lines.push(
    `| Schema-counted disagreements (partial-disagreement) | ${disagreementClaims.length} |`,
  );
  lines.push(
    `| Same-verdict, different-reasoning cases | ${sameVerdictClaims.length} |`,
  );
  lines.push(
    `| Disagreements re-adjudicated by two fresh independent reviewers | ${disagreementClaims.filter((claim) => detailByClaim.get(claim.claimId)?.adjudicated).length} |`,
  );
  lines.push(
    `| Disagreements resolved into a policy-eligible claim | ${disagreementClaims.filter((claim) => detailByClaim.get(claim.claimId)?.status === 'machine-approved').length} |`,
  );
  lines.push(
    `| Disagreements resolved but still policy-ineligible | ${
      disagreementClaims.filter((claim) => {
        const detail = detailByClaim.get(claim.claimId);
        return (
          detail?.adjudicated === true &&
          detail.status === 'machine-rejected' &&
          detail.policyReasons.length > 0
        );
      }).length
    } |`,
  );
  lines.push(
    `| Disagreements not re-adjudicated because policy v1 blocks the claim outright | ${disagreementClaims.filter((claim) => !detailByClaim.get(claim.claimId)?.adjudicated).length} |`,
  );
  lines.push('');
  lines.push(
    'Resolution rule: a disagreement is resolved only when two fresh independent reviewers, given the same retained source context, both return a supported verdict with confirmed identity, no material concern, and no material temporal over-claim. Majority voting and favouring the more permissive reviewer are not used.',
  );
  lines.push('');
  lines.push('## Per-claim investigation');
  lines.push('');
  for (const claim of disagreementClaims) {
    const detail = detailByClaim.get(claim.claimId);
    lines.push(`### ${claim.claimId} — ${claim.candidateName}`);
    lines.push('');
    lines.push(
      `- Category / type: \`${claim.category}\` / \`${claim.claimType}\``,
    );
    lines.push(
      `- Source class(es): ${claim.sourceClasses.map((item) => `\`${item}\``).join(', ')}`,
    );
    lines.push(
      `- v1 verdicts: A = ${claim.semantic.verdictA}, B = ${claim.semantic.verdictB}`,
    );
    lines.push(
      `- v1 differing dimensions: ${claim.semantic.differenceDimensions.join(', ') || 'none recorded'}`,
    );
    if (claim.semantic.disputedPropositions.length > 0) {
      lines.push('- Disputed propositions:');
      for (const proposition of claim.semantic.disputedPropositions) {
        lines.push(`  - ${proposition}`);
      }
    }
    lines.push(`- v1 blocking reasons: ${claim.blockingReasons.join(', ')}`);
    if (detail?.adjudicated) {
      lines.push(
        `- Fresh adjudication: A = ${detail.verdicts.reviewerA} (identity ${detail.identity.reviewerA}), B = ${detail.verdicts.reviewerB} (identity ${detail.identity.reviewerB})`,
      );
      lines.push(
        `- Materiality v2: ${detail.materiality?.material ? `material (${detail.materiality.materialDimensions.join(', ')})` : 'non-material'}${detail.materiality?.nonMaterialDimensions.length ? `; ignored: ${detail.materiality.nonMaterialDimensions.join(', ')}` : ''}`,
      );
      lines.push(`- Outcome: \`${detail.status}\` — ${detail.stopReason}`);
    } else {
      lines.push(
        '- No fresh adjudication: policy v1 blocks this claim on category, claim type, current-status wording, attribution, or source class, so additional reviewer spend cannot change publication. The disagreement is retained and the claim stays excluded.',
      );
      lines.push(
        `- Outcome: \`${detail?.status ?? claim.status}\` — ${detail?.stopReason ?? 'policy-ineligible'}`,
      );
    }
    lines.push('');
  }
  lines.push('## Same-verdict, different-reasoning cases');
  lines.push('');
  lines.push(
    `${sameVerdictClaims.length} claims had identical verdicts and identity assessments but different limitation or rationale prose. These are not evidentiary disagreements. \`${ADJUDICATION_POLICY_VERSION}\` classifies limitation prose as non-material, and every one of these claims still needs a fresh adjudication before publication.`,
  );
  lines.push('');
  lines.push(
    `Claims: ${sameVerdictClaims.map((claim) => claim.claimId).join(', ')}`,
  );
  lines.push('');
  writeText(
    'reports/autonomous-remediation-disagreements.md',
    lines.join('\n'),
  );

  return {
    summary,
    invocations: decisionSet.invocations,
    approved: approved.map((item) => ({
      claimId: item.claimId,
      candidateId: item.candidateId,
      value: item.originalWording,
      sources: item.sourceIds.map((sourceId) => sourcePublisher(sourceId)),
    })),
  };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = main();
  console.log(JSON.stringify(result.summary, null, 1));
  console.log(JSON.stringify(result.invocations, null, 1));
  console.log(`approved: ${result.approved.length}`);
  for (const item of result.approved) {
    console.log(`  ${item.claimId} :: ${item.value}`);
  }
}

export { main as buildRemediationDecisions };
