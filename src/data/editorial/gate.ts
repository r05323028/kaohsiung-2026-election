import type {
  BiographyClaim,
  BiographyDataset,
  BiographyIdentityObservation,
} from '../biographies/schema';
import {
  activeDecisions,
  type EditorialDecision,
  type EditorialDecisionSet,
  type EditorialReviewPacket,
  type PublicationGateEntry,
  type PublicationGateReport,
  type ReviewerRegistry,
} from './schema';
import { validateEditorialDecisionIntegrity } from './validation';

function identitySubjectId(
  dataset: BiographyDataset,
  candidateId: string,
): string {
  const conflict = dataset.conflicts.find(
    (item) => item.candidateId === candidateId,
  );
  return conflict?.conflictId ?? `candidate:${candidateId}`;
}

function sourceHashes(dataset: BiographyDataset): Map<string, string> {
  return new Map(
    dataset.sources.flatMap((source) =>
      source.sha256 ? [[source.sourceId, source.sha256] as const] : [],
    ),
  );
}

function identitySources(
  dataset: BiographyDataset,
  candidateId: string,
  observationsById: Map<string, BiographyIdentityObservation>,
): Set<string> {
  const sourceIds = new Set<string>();
  for (const observation of dataset.observations) {
    if (observation.candidateIds.includes(candidateId))
      sourceIds.add(observation.sourceId);
  }
  const conflict = dataset.conflicts.find(
    (item) => item.candidateId === candidateId,
  );
  for (const sourceId of conflict?.priorEvidenceSourceIds ?? [])
    sourceIds.add(sourceId);
  for (const observationId of conflict?.additionalObservationIds ?? []) {
    const observation = observationsById.get(observationId);
    if (observation) sourceIds.add(observation.sourceId);
  }
  return sourceIds;
}

function activeDecisionMap(
  decisionSet: EditorialDecisionSet,
): Map<string, EditorialDecision> {
  return new Map(
    activeDecisions(decisionSet.decisions).map((decision) => [
      `${decision.subjectType}:${decision.subjectId}`,
      decision,
    ]),
  );
}

function versionMap(decision: EditorialDecision | null): Map<string, string> {
  return new Map(
    decision?.evidenceVersions.map((version) => [
      version.sourceId,
      version.sha256,
    ]) ?? [],
  );
}

function checkCurrentVersions(
  sourceIds: Set<string>,
  decision: EditorialDecision | null,
  hashes: Map<string, string>,
  label: string,
  reasons: string[],
): void {
  const decisionVersions = versionMap(decision);
  if (sourceIds.size === 0) {
    reasons.push(`${label}-evidence-missing`);
    return;
  }
  for (const sourceId of sourceIds) {
    const currentHash = hashes.get(sourceId);
    if (!currentHash) {
      reasons.push(`${label}-source-version-missing:${sourceId}`);
      continue;
    }
    if (decision && decisionVersions.get(sourceId) !== currentHash) {
      reasons.push(`${label}-stale-source-version:${sourceId}`);
    }
  }
  if (
    decision &&
    decision.decision === 'approve' &&
    decisionVersions.size !== sourceIds.size
  ) {
    reasons.push(`${label}-approval-does-not-cover-all-sources`);
  }
  if (
    decision &&
    decision.decision === 'confirm-same' &&
    decisionVersions.size !== sourceIds.size
  ) {
    reasons.push(`${label}-resolution-does-not-cover-all-sources`);
  }
}

function evaluateClaim(
  dataset: BiographyDataset,
  claim: BiographyClaim,
  decisions: Map<string, EditorialDecision>,
  hashes: Map<string, string>,
  observationsById: Map<string, BiographyIdentityObservation>,
  evidenceById: Map<
    string,
    { claimId: string; sourceId: string; supportType: string }
  >,
): PublicationGateEntry {
  const reasons: string[] = [];
  const claimDecision = decisions.get(`claim:${claim.claimId}`) ?? null;
  const identityDecision =
    decisions.get(
      `identity:${identitySubjectId(dataset, claim.candidateId)}`,
    ) ?? null;
  const identitySourceIds = identitySources(
    dataset,
    claim.candidateId,
    observationsById,
  );

  if (!claimDecision) reasons.push('missing-claim-approval');
  if (claimDecision && claimDecision.decision !== 'approve') {
    reasons.push(`claim-state:${claimDecision.resultingState}`);
  }
  if (!identityDecision) reasons.push('missing-identity-resolution');
  if (identityDecision && identityDecision.decision !== 'confirm-same') {
    reasons.push(`identity-state:${identityDecision.resultingState}`);
  }
  if (claim.machineStatus !== 'machine-validated')
    reasons.push('machine-validation-not-passed');
  if (
    claim.attribution === 'candidate-statement' &&
    claim.sourceDependency !== 'self-reported'
  ) {
    reasons.push('candidate-statement-attribution-invalid');
  }

  const claimSourceIds = new Set(claim.sourceIds);
  checkCurrentVersions(
    claimSourceIds,
    claimDecision?.decision === 'approve' ? claimDecision : null,
    hashes,
    'claim',
    reasons,
  );
  if (identityDecision?.decision === 'confirm-same') {
    checkCurrentVersions(
      identitySourceIds,
      identityDecision,
      hashes,
      'identity',
      reasons,
    );
  }

  const evidence = claim.evidenceIds.map((evidenceId) =>
    evidenceById.get(evidenceId),
  );
  if (evidence.some((item) => !item))
    reasons.push('missing-evidence-reference');
  for (const item of evidence) {
    if (!item) continue;
    if (item.claimId !== claim.claimId)
      reasons.push(`evidence-claim-mismatch:${item.claimId}`);
    if (!claimSourceIds.has(item.sourceId))
      reasons.push(`evidence-source-mismatch:${item.sourceId}`);
    if (item.supportType === 'contradicts')
      reasons.push(`contradictory-evidence:${item.sourceId}`);
  }

  const conflict = dataset.conflicts.find(
    (item) => item.candidateId === claim.candidateId,
  );
  if (conflict && identityDecision?.decision !== 'confirm-same') {
    reasons.push(`blocking-identity-conflict:${conflict.conflictId}`);
  }
  for (const observationId of claim.identityObservationIds) {
    const observation = observationsById.get(observationId);
    if (!observation)
      reasons.push(`missing-identity-observation:${observationId}`);
    else if (observation.identityStatus !== 'resolved') {
      reasons.push(`unresolved-identity-observation:${observationId}`);
    }
  }

  const uniqueReasons = [...new Set(reasons)];
  return {
    claimId: claim.claimId,
    candidateId: claim.candidateId,
    eligible: uniqueReasons.length === 0,
    reasons: uniqueReasons,
    decisionId: claimDecision?.decisionId ?? null,
    identityDecisionIds: identityDecision ? [identityDecision.decisionId] : [],
  };
}

export function evaluateEditorialPublicationGate(
  dataset: BiographyDataset,
  decisionSet: EditorialDecisionSet,
  registry: ReviewerRegistry,
  packet: EditorialReviewPacket,
): PublicationGateReport {
  validateEditorialDecisionIntegrity(decisionSet, registry, packet);
  const decisions = activeDecisionMap(decisionSet);
  const hashes = sourceHashes(dataset);
  const observationsById = new Map(
    dataset.observations.map((observation) => [
      observation.observationId,
      observation,
    ]),
  );
  const evidenceById = new Map(
    dataset.evidence.map((evidence) => [evidence.evidenceId, evidence]),
  );
  const entries = dataset.claims.map((claim) =>
    evaluateClaim(
      dataset,
      claim,
      decisions,
      hashes,
      observationsById,
      evidenceById,
    ),
  );
  const blockers: Record<string, number> = {};
  for (const entry of entries) {
    for (const reason of entry.reasons) {
      const key = reason.split(':', 1)[0] ?? reason;
      blockers[key] = (blockers[key] ?? 0) + 1;
    }
  }
  return {
    datasetId: 'kaohsiung-2026-candidate-biographies-publication-gate',
    snapshotDate: dataset.snapshotDate,
    generatedAt: `${dataset.snapshotDate}T00:00:00.000Z`,
    totalClaims: entries.length,
    eligibleClaims: entries.filter((entry) => entry.eligible).length,
    blockedClaims: entries.filter((entry) => !entry.eligible).length,
    entries,
    blockers,
    note: 'A claim is eligible only after explicit identity resolution, evidence review, current source checksums, authorized reviewer approval, and no blocking conflict.',
  };
}
