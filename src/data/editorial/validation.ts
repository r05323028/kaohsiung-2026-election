import {
  activeDecisions,
  type EditorialDecision,
  type EditorialDecisionSet,
  type EditorialReviewPacket,
  type ReviewerRegistry,
} from './schema';

const decisionStates: Record<
  EditorialDecision['decision'],
  EditorialDecision['resultingState']
> = {
  approve: 'approved',
  reject: 'rejected',
  'request-clarification': 'needs_evidence_review',
  dispute: 'disputed',
  defer: 'unreviewed',
  'confirm-same': 'approved',
  'confirm-different': 'rejected',
  'insufficient-evidence': 'needs_identity_review',
  'reject-match': 'rejected',
};

export function validateEditorialDecisionIntegrity(
  decisionSet: EditorialDecisionSet,
  registry: ReviewerRegistry,
  packet: EditorialReviewPacket,
): EditorialDecision[] {
  const ids = new Set<string>();
  const claimById = new Map(
    packet.claims.map((claim) => [claim.claimId, claim]),
  );
  const conflictById = new Map(
    packet.conflicts.map((conflict) => [conflict.conflictId, conflict]),
  );
  const candidateIds = new Set(
    packet.candidates.map((candidate) => candidate.candidateId),
  );

  for (const decision of decisionSet.decisions) {
    if (ids.has(decision.decisionId)) {
      throw new Error(
        `Duplicate editorial decision ID ${decision.decisionId}.`,
      );
    }
    ids.add(decision.decisionId);
    const reviewer = registry.reviewers.find(
      (candidate) => candidate.reviewerId === decision.reviewerId,
    );
    if (!reviewer) {
      throw new Error(
        `Decision ${decision.decisionId} references unknown reviewer ${decision.reviewerId}.`,
      );
    }
    if (!reviewer.active) {
      throw new Error(`Reviewer ${decision.reviewerId} is inactive.`);
    }
    const requiredAction =
      decision.subjectType === 'identity'
        ? 'identity-review'
        : decision.decision === 'approve'
          ? 'editorial-approval'
          : 'claim-review';
    if (!reviewer.authorizedActions.includes(requiredAction)) {
      throw new Error(
        `Reviewer ${decision.reviewerId} is not authorized for ${requiredAction}.`,
      );
    }
    if (decision.resultingState !== decisionStates[decision.decision]) {
      throw new Error(
        `Decision ${decision.decisionId} has state ${decision.resultingState}, expected ${decisionStates[decision.decision]}.`,
      );
    }
    if (decision.subjectType === 'claim') {
      const claim = claimById.get(decision.subjectId);
      if (!claim) {
        throw new Error(
          `Decision ${decision.decisionId} references missing claim ${decision.subjectId}.`,
        );
      }
      if (claim.candidateId !== decision.candidateId) {
        throw new Error(
          `Decision ${decision.decisionId} candidate does not match claim ${decision.subjectId}.`,
        );
      }
    } else {
      const conflict = conflictById.get(decision.subjectId);
      const candidateSubject = decision.subjectId.startsWith('candidate:')
        ? decision.subjectId.slice('candidate:'.length)
        : null;
      if (
        !conflict &&
        (!candidateSubject || !candidateIds.has(candidateSubject))
      ) {
        throw new Error(
          `Decision ${decision.decisionId} references missing identity subject ${decision.subjectId}.`,
        );
      }
      if (conflict && conflict.candidateId !== decision.candidateId) {
        throw new Error(
          `Decision ${decision.decisionId} candidate does not match conflict ${decision.subjectId}.`,
        );
      }
      if (candidateSubject && candidateSubject !== decision.candidateId) {
        throw new Error(
          `Decision ${decision.decisionId} candidate does not match identity subject ${decision.subjectId}.`,
        );
      }
    }
    if (decision.supersedesDecisionId) {
      const superseded = decisionSet.decisions.find(
        (candidate) => candidate.decisionId === decision.supersedesDecisionId,
      );
      if (!superseded) {
        throw new Error(
          `Decision ${decision.decisionId} supersedes missing decision ${decision.supersedesDecisionId}.`,
        );
      }
      if (
        superseded.subjectType !== decision.subjectType ||
        superseded.subjectId !== decision.subjectId
      ) {
        throw new Error(
          `Decision ${decision.decisionId} cannot supersede a different subject.`,
        );
      }
      const supersededByAnotherDecision = decisionSet.decisions.some(
        (candidate) =>
          candidate.decisionId !== decision.decisionId &&
          candidate.supersedesDecisionId === decision.supersedesDecisionId,
      );
      if (supersededByAnotherDecision) {
        throw new Error(
          `Decision ${decision.decisionId} can only supersede the current active decision ${decision.supersedesDecisionId}.`,
        );
      }
    }
    const sourceIds = new Set<string>();
    for (const version of decision.evidenceVersions) {
      if (sourceIds.has(version.sourceId)) {
        throw new Error(
          `Decision ${decision.decisionId} repeats source version ${version.sourceId}.`,
        );
      }
      sourceIds.add(version.sourceId);
    }
  }

  for (const decision of decisionSet.decisions) {
    const visited = new Set<string>();
    let cursor: string | null = decision.decisionId;
    while (cursor) {
      if (visited.has(cursor)) {
        throw new Error(
          `Editorial decision supersede cycle includes ${cursor}.`,
        );
      }
      visited.add(cursor);
      const current = decisionSet.decisions.find(
        (candidate) => candidate.decisionId === cursor,
      );
      cursor = current?.supersedesDecisionId ?? null;
    }
  }

  const active = activeDecisions(decisionSet.decisions);
  const activeBySubject = new Map<string, EditorialDecision>();
  for (const decision of active) {
    const key = `${decision.subjectType}:${decision.subjectId}`;
    if (activeBySubject.has(key)) {
      throw new Error(
        `Multiple active contradictory decisions exist for ${key}.`,
      );
    }
    activeBySubject.set(key, decision);
  }
  return active;
}
