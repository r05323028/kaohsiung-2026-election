import { useEffect, useMemo, useState } from 'react';
import type {
  EditorialDecision,
  EditorialReviewPacket,
  ReviewerRegistry,
} from '../data/editorial';
import type {
  EditorialReleaseBatch,
  ReleaseClaimAudit,
} from '../data/editorial/release';
import type { IndependentAIAuditReport } from '../data/enrichment/ai-audit';
import type {
  ScopedPublicationReadiness,
  ScopedReviewQueueReport,
} from '../data/enrichment/review-publication';
import type { EnrichmentReviewPacket } from '../data/enrichment/schema';
import type { SemanticReviewReport } from '../data/enrichment/semantic-review';
import ScopedEnrichmentAuditPanel from './ScopedEnrichmentAuditPanel';
import ScopedEnrichmentReviewPanel, {
  type ScopedDecisionKind,
} from './ScopedEnrichmentReviewPanel';
import SemanticEvidenceAdjudicationPanel from './SemanticEvidenceAdjudicationPanel';

interface Props {
  packet: EditorialReviewPacket;
  registry: ReviewerRegistry;
  initialDecisions: EditorialDecision[];
  releaseBatch?: EditorialReleaseBatch | undefined;
  releaseAudits?: ReleaseClaimAudit[];
  scopedPacket?: EnrichmentReviewPacket | undefined;
  scopedQueue?: ScopedReviewQueueReport | undefined;
  scopedReadiness?: ScopedPublicationReadiness | undefined;
  scopedAudit?: IndependentAIAuditReport | undefined;
  semanticReport?: SemanticReviewReport | undefined;
}

type ClaimFilterStatus =
  | 'all'
  | 'unreviewed'
  | 'approved'
  | 'rejected'
  | 'disputed'
  | 'needs-review';
type EvidenceFilter = 'all' | 'with-evidence' | 'without-evidence';
type IdentityFilter = 'all' | 'needs-review' | 'resolved';

type DecisionKind =
  | 'approve'
  | 'reject'
  | 'request-clarification'
  | 'dispute'
  | 'defer'
  | 'confirm-same'
  | 'confirm-different'
  | 'insufficient-evidence'
  | 'reject-match';

const claimLabels: Record<string, string> = {
  'current-position': '目前職務',
  'historical-position': '歷任職務',
  'historical-candidacy': '歷史參選',
  'elected-office': '當選公職',
  'professional-experience': '專業經歷',
  education: '教育',
  'career-event': '職涯事件',
};

const decisionLabels: Record<string, string> = {
  approve: '核准主張',
  reject: '拒絕主張',
  'request-clarification': '要求釐清',
  dispute: '標記爭議',
  defer: '暫緩處理',
  'confirm-same': '確認為同一人',
  'confirm-different': '確認為不同人',
  'insufficient-evidence': '身分證據不足',
  'reject-match': '拒絕目前配對',
};

const stateLabels: Record<string, string> = {
  unreviewed: '未審查',
  needs_identity_review: '待身分審查',
  needs_evidence_review: '待證據審查',
  approved: '已核准',
  rejected: '已拒絕',
  disputed: '有爭議',
};

function activeDecisionMap(
  decisions: EditorialDecision[],
): Map<string, EditorialDecision> {
  const superseded = new Set(
    decisions
      .map((decision) => decision.supersedesDecisionId)
      .filter((decisionId): decisionId is string => Boolean(decisionId)),
  );
  return new Map(
    decisions
      .filter((decision) => !superseded.has(decision.decisionId))
      .map((decision) => [
        `${decision.subjectType}:${decision.subjectId}`,
        decision,
      ]),
  );
}

function resultingState(decision: DecisionKind): string {
  if (decision === 'approve' || decision === 'confirm-same') return 'approved';
  if (
    decision === 'reject' ||
    decision === 'confirm-different' ||
    decision === 'reject-match'
  )
    return 'rejected';
  if (decision === 'request-clarification') return 'needs_evidence_review';
  if (decision === 'insufficient-evidence') return 'needs_identity_review';
  if (decision === 'dispute') return 'disputed';
  return 'unreviewed';
}

function sourcePublisher(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '來源網址未解析';
  }
}

function slugify(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

export default function EditorialReviewApp({
  packet,
  registry,
  initialDecisions,
  releaseBatch,
  releaseAudits = [],
  scopedPacket,
  scopedQueue,
  scopedReadiness,
  scopedAudit,
  semanticReport,
}: Props) {
  const [decisions, setDecisions] =
    useState<EditorialDecision[]>(initialDecisions);
  const [scopedDecisions, setScopedDecisions] = useState<EditorialDecision[]>(
    [],
  );
  const [reviewerId, setReviewerId] = useState(
    registry.reviewers[0]?.reviewerId ?? '',
  );
  const [candidateFilter, setCandidateFilter] = useState('all');
  const [electionFilter, setElectionFilter] = useState('all');
  const [districtFilter, setDistrictFilter] = useState('all');
  const [claimTypeFilter, setClaimTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<ClaimFilterStatus>('all');
  const [evidenceFilter, setEvidenceFilter] = useState<EvidenceFilter>('all');
  const [identityFilter, setIdentityFilter] = useState<IdentityFilter>('all');
  const [releaseBatchFilter, setReleaseBatchFilter] = useState<
    'all' | 'selected'
  >('all');
  const [search, setSearch] = useState('');
  const [selectedClaimId, setSelectedClaimId] = useState(
    packet.claims[0]?.claimId ?? '',
  );
  const [rationale, setRationale] = useState('');
  const [confirmation, setConfirmation] = useState(false);
  const [message, setMessage] = useState('');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  const candidatesById = useMemo(
    () =>
      new Map(
        packet.candidates.map((candidate) => [
          candidate.candidateId,
          candidate,
        ]),
      ),
    [packet.candidates],
  );
  const observationsById = useMemo(
    () =>
      new Map(
        packet.observations.map((observation) => [
          observation.observationId,
          observation,
        ]),
      ),
    [packet.observations],
  );
  const evidenceById = useMemo(
    () =>
      new Map(
        packet.evidence.map((evidence) => [evidence.evidenceId, evidence]),
      ),
    [packet.evidence],
  );
  const sourcesById = useMemo(
    () => new Map(packet.sources.map((source) => [source.sourceId, source])),
    [packet.sources],
  );
  const conflictsByCandidate = useMemo(
    () =>
      new Map(
        packet.conflicts.map((conflict) => [conflict.candidateId, conflict]),
      ),
    [packet.conflicts],
  );
  const activeDecisions = useMemo(
    () => activeDecisionMap(decisions),
    [decisions],
  );
  const releaseClaimIds = useMemo(
    () => new Set(releaseBatch?.selectedClaimIds ?? []),
    [releaseBatch],
  );
  const releaseGroupByClaim = useMemo(() => {
    const groups = new Map<string, EditorialReleaseBatch['groups'][number]>();
    for (const group of releaseBatch?.groups ?? []) {
      for (const claimId of group.claimIds) groups.set(claimId, group);
    }
    return groups;
  }, [releaseBatch]);
  const releaseAuditByClaim = useMemo(
    () => new Map(releaseAudits.map((audit) => [audit.claimId, audit])),
    [releaseAudits],
  );

  const filteredClaims = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return packet.claims.filter((claim) => {
      const candidate = candidatesById.get(claim.candidateId);
      if (!candidate) return false;
      if (candidateFilter !== 'all' && claim.candidateId !== candidateFilter)
        return false;
      if (electionFilter !== 'all' && candidate.electionType !== electionFilter)
        return false;
      if (districtFilter !== 'all' && candidate.districtId !== districtFilter)
        return false;
      if (claimTypeFilter !== 'all' && claim.claimType !== claimTypeFilter)
        return false;
      if (
        releaseBatchFilter === 'selected' &&
        !releaseClaimIds.has(claim.claimId)
      )
        return false;
      const claimDecision = activeDecisions.get(`claim:${claim.claimId}`);
      const status = claimDecision?.resultingState ?? 'unreviewed';
      if (statusFilter === 'needs-review' && claimDecision) return false;
      if (
        statusFilter !== 'all' &&
        statusFilter !== 'needs-review' &&
        status !== statusFilter
      )
        return false;
      if (evidenceFilter === 'with-evidence' && claim.evidenceIds.length === 0)
        return false;
      if (evidenceFilter === 'without-evidence' && claim.evidenceIds.length > 0)
        return false;
      const identityNeedsReview =
        claim.identityObservationIds.some(
          (observationId) =>
            observationsById.get(observationId)?.identityStatus !== 'resolved',
        ) ||
        !activeDecisions.has(
          `identity:${conflictsByCandidate.get(claim.candidateId)?.conflictId ?? `candidate:${claim.candidateId}`}`,
        );
      if (identityFilter === 'needs-review' && !identityNeedsReview)
        return false;
      if (identityFilter === 'resolved' && identityNeedsReview) return false;
      if (
        normalizedSearch &&
        !`${candidate.displayName} ${claim.title} ${claim.value} ${claim.organization ?? ''}`
          .toLowerCase()
          .includes(normalizedSearch)
      )
        return false;
      return true;
    });
  }, [
    activeDecisions,
    candidateFilter,
    candidatesById,
    claimTypeFilter,
    conflictsByCandidate,
    districtFilter,
    electionFilter,
    evidenceFilter,
    identityFilter,
    observationsById,
    packet.claims,
    releaseBatchFilter,
    releaseClaimIds,
    search,
    statusFilter,
  ]);

  const selectedClaim =
    filteredClaims.find((claim) => claim.claimId === selectedClaimId) ??
    filteredClaims[0] ??
    null;
  const selectedCandidate = selectedClaim
    ? candidatesById.get(selectedClaim.candidateId)
    : null;
  const selectedConflict = selectedClaim
    ? conflictsByCandidate.get(selectedClaim.candidateId)
    : null;
  const selectedIdentitySubject =
    selectedConflict?.conflictId ??
    (selectedClaim ? `candidate:${selectedClaim.candidateId}` : null);
  const selectedIdentityDecision = selectedIdentitySubject
    ? activeDecisions.get(`identity:${selectedIdentitySubject}`)
    : null;
  const selectedClaimDecision = selectedClaim
    ? activeDecisions.get(`claim:${selectedClaim.claimId}`)
    : null;
  const reviewer = registry.reviewers.find(
    (item) => item.reviewerId === reviewerId,
  );

  function addDecision(
    subjectType: 'claim' | 'identity',
    subjectId: string,
    candidateId: string,
    decision: DecisionKind,
    evidenceVersions: Array<{ sourceId: string; sha256: string }>,
  ) {
    const requiresConfirmation =
      decision === 'approve' || decision === 'confirm-same';
    if (!reviewer) {
      setMessage('尚未設定有效的本地審查者；請先編輯 reviewer-registry.json。');
      return;
    }
    const requiredAction =
      subjectType === 'identity'
        ? 'identity-review'
        : decision === 'approve'
          ? 'editorial-approval'
          : 'claim-review';
    if (!reviewer.authorizedActions.includes(requiredAction)) {
      setMessage(`目前審查者沒有「${requiredAction}」權限。`);
      return;
    }
    if (requiresConfirmation && !confirmation) {
      setMessage('核准或確認同一人前，必須勾選明確確認。');
      return;
    }
    if (
      decision !== 'approve' &&
      decision !== 'confirm-same' &&
      rationale.trim().length < 3
    ) {
      setMessage('拒絕、爭議、暫緩或身分覆寫需要至少 3 個字的理由。');
      return;
    }
    const prior = activeDecisions.get(`${subjectType}:${subjectId}`);
    const newDecision: EditorialDecision = {
      decisionId: `editorial-${subjectType}-${slugify(subjectId)}-${Date.now()}`,
      subjectType,
      subjectId,
      candidateId,
      decision,
      resultingState: resultingState(
        decision,
      ) as EditorialDecision['resultingState'],
      reviewerId,
      decidedAt: new Date().toISOString(),
      rationale: rationale.trim() || '依目前來源與身分證據完成審查。',
      evidenceVersions,
      confirmation: requiresConfirmation,
      decisionSchemaVersion: '1',
      supersedesDecisionId: prior?.decisionId ?? null,
    };
    setDecisions((current) => [...current, newDecision]);
    setRationale('');
    setConfirmation(false);
    setMessage(
      `已暫存${decisionLabels[decision]}決定；請匯出 JSON 後由 CLI 驗證與套用。`,
    );
  }

  function addScopedDecision(
    subjectType: 'claim' | 'identity',
    subjectId: string,
    candidateId: string,
    decision: ScopedDecisionKind,
    evidenceVersions: Array<{ sourceId: string; sha256: string }>,
    scopedRationale: string,
    scopedConfirmation: boolean,
  ) {
    const requiresConfirmation =
      decision === 'approve' || decision === 'confirm-same';
    if (!reviewer) {
      setMessage('尚未設定有效的本地審查者；請先編輯 reviewer-registry.json。');
      return;
    }
    const requiredAction =
      subjectType === 'identity'
        ? 'identity-review'
        : decision === 'approve'
          ? 'editorial-approval'
          : 'claim-review';
    if (!reviewer.authorizedActions.includes(requiredAction)) {
      setMessage(`目前審查者沒有「${requiredAction}」權限。`);
      return;
    }
    if (requiresConfirmation && !scopedConfirmation) {
      setMessage('核准或確認同一人前，必須勾選明確確認。');
      return;
    }
    if (
      decision !== 'approve' &&
      decision !== 'confirm-same' &&
      scopedRationale.trim().length < 3
    ) {
      setMessage('拒絕、爭議、暫緩或身分覆寫需要至少 3 個字的理由。');
      return;
    }
    const prior = [...scopedDecisions]
      .reverse()
      .find(
        (item) =>
          item.subjectType === subjectType && item.subjectId === subjectId,
      );
    const newDecision: EditorialDecision = {
      decisionId: `scoped-editorial-${subjectType}-${slugify(subjectId)}-${Date.now()}`,
      subjectType,
      subjectId,
      candidateId,
      decision,
      resultingState: resultingState(
        decision,
      ) as EditorialDecision['resultingState'],
      reviewerId,
      decidedAt: new Date().toISOString(),
      rationale: scopedRationale.trim() || '依目前來源與身分證據完成審查。',
      evidenceVersions,
      confirmation: requiresConfirmation,
      decisionSchemaVersion: '1',
      supersedesDecisionId: prior?.decisionId ?? null,
    };
    setScopedDecisions((current) => [...current, newDecision]);
    setMessage('已暫存範圍決策；請匯出 JSON 後由範圍 CLI 驗證。');
  }

  function exportScopedDecisions() {
    if (!scopedPacket) return;
    const payload = {
      datasetId: scopedPacket.datasetId,
      snapshotDate: scopedPacket.snapshotDate,
      schemaVersion: '1' as const,
      decisions: scopedDecisions,
      note: 'Exported from the local scoped enrichment review UI. The scoped CLI must validate and apply this file; browser export is not publication.',
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `zuoying-mayoral-decisions-${scopedPacket.snapshotDate}.json`;
    anchor.style.display = 'none';
    document.body.append(anchor);
    anchor.click();
    window.setTimeout(() => {
      URL.revokeObjectURL(url);
      anchor.remove();
    }, 0);
    setMessage('已匯出範圍決策 JSON；尚未寫入 repository，也不會直接發布。');
  }

  function approveClaim() {
    if (!selectedClaim) return;
    const evidenceVersions = selectedClaim.sourceIds.flatMap((sourceId) => {
      const sha256 = sourcesById.get(sourceId)?.sha256;
      return sha256 ? [{ sourceId, sha256 }] : [];
    });
    addDecision(
      'claim',
      selectedClaim.claimId,
      selectedClaim.candidateId,
      'approve',
      evidenceVersions,
    );
  }

  function identityDecision(decision: DecisionKind) {
    if (!selectedClaim || !selectedIdentitySubject) return;
    const evidenceVersions = selectedClaim.sourceIds.flatMap((sourceId) => {
      const sha256 = sourcesById.get(sourceId)?.sha256;
      return sha256 ? [{ sourceId, sha256 }] : [];
    });
    addDecision(
      'identity',
      selectedIdentitySubject,
      selectedClaim.candidateId,
      decision,
      evidenceVersions,
    );
  }

  function exportDecisions() {
    const payload = {
      datasetId: 'kaohsiung-2026-candidate-biographies-editorial-decisions',
      snapshotDate: packet.snapshotDate,
      schemaVersion: '1' as const,
      decisions,
      note: 'Exported from the local editorial review UI. The CLI must validate and apply this file; browser export is not publication.',
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `biography-decisions-${packet.snapshotDate}.json`;
    anchor.style.display = 'none';
    document.body.append(anchor);
    anchor.click();
    window.setTimeout(() => {
      URL.revokeObjectURL(url);
      anchor.remove();
    }, 0);
    setMessage('已匯出決策 JSON；尚未寫入 repository，也不會直接發布。');
  }

  const districts = [
    ...new Set(packet.candidates.map((candidate) => candidate.districtId)),
  ].sort();
  const claimTypes = [
    ...new Set(packet.claims.map((claim) => claim.claimType)),
  ].sort();

  return (
    <main
      className="editorial-review"
      data-testid="editorial-review-app"
      data-hydrated={hydrated}
    >
      <header className="editorial-review__header">
        <div>
          <p className="eyebrow">LOCAL EDITORIAL WORKSPACE</p>
          <h1>候選人履歷編輯審查</h1>
          <p>
            這是本機審查介面，不是登入系統，也不會直接發布。所有決策都要匯出
            JSON，再由 CLI 驗證、套用與產生靜態出版快照。
          </p>
        </div>
        <button
          type="button"
          className="button button--primary"
          onClick={exportDecisions}
        >
          匯出決策 JSON
        </button>
      </header>

      <section className="editorial-review__notice" aria-live="polite">
        <strong>快照 {packet.snapshotDate}</strong>
        <span>
          {packet.claims.length} 筆機器主張・{packet.conflicts.length}{' '}
          筆身分衝突・目前暫存 {decisions.length} 筆決策
        </span>
        {releaseBatch ? (
          <span data-testid="release-batch-summary">
            首批審查批次 {releaseBatch.selectedClaimIds.length} 筆／
            {releaseBatch.candidateIds.length} 位候選人
          </span>
        ) : null}
        {message ? <span>{message}</span> : null}
      </section>

      <section className="editorial-review__filters" aria-label="審查篩選器">
        <label>
          審查者
          <select
            value={reviewerId}
            onChange={(event) => setReviewerId(event.target.value)}
          >
            <option value="">尚未設定</option>
            {registry.reviewers.map((item) => (
              <option key={item.reviewerId} value={item.reviewerId}>
                {item.displayName}（{item.reviewerId}）
              </option>
            ))}
          </select>
        </label>
        <label>
          搜尋
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="姓名、主張標題或內容"
          />
        </label>
        <label>
          候選人
          <select
            value={candidateFilter}
            onChange={(event) => setCandidateFilter(event.target.value)}
          >
            <option value="all">全部候選人</option>
            {packet.candidates.map((candidate) => (
              <option key={candidate.candidateId} value={candidate.candidateId}>
                {candidate.displayName}
              </option>
            ))}
          </select>
        </label>
        <label>
          選舉類型
          <select
            value={electionFilter}
            onChange={(event) => setElectionFilter(event.target.value)}
          >
            <option value="all">全部選舉</option>
            <option value="mayoral">市長</option>
            <option value="city-council">普通市議員</option>
            <option value="indigenous-council">原住民市議員</option>
          </select>
        </label>
        <label>
          選區
          <select
            value={districtFilter}
            onChange={(event) => setDistrictFilter(event.target.value)}
          >
            <option value="all">全部選區</option>
            {districts.map((district) => (
              <option key={district} value={district}>
                {district}
              </option>
            ))}
          </select>
        </label>
        {releaseBatch ? (
          <label data-testid="release-batch-filter">
            審查批次
            <select
              value={releaseBatchFilter}
              onChange={(event) =>
                setReleaseBatchFilter(event.target.value as 'all' | 'selected')
              }
            >
              <option value="all">全部機器主張</option>
              <option value="selected">
                首批釋出審查批次（{releaseBatch.selectedClaimIds.length}）
              </option>
            </select>
          </label>
        ) : null}
        <label>
          主張類型
          <select
            value={claimTypeFilter}
            onChange={(event) => setClaimTypeFilter(event.target.value)}
          >
            <option value="all">全部類型</option>
            {claimTypes.map((type) => (
              <option key={type} value={type}>
                {claimLabels[type] ?? type}
              </option>
            ))}
          </select>
        </label>
        <label>
          審查狀態
          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as ClaimFilterStatus)
            }
          >
            <option value="all">全部狀態</option>
            <option value="needs-review">尚無決策</option>
            <option value="approved">已核准</option>
            <option value="rejected">已拒絕</option>
            <option value="disputed">有爭議</option>
            <option value="needs_evidence_review">待證據審查</option>
          </select>
        </label>
        <label>
          證據
          <select
            value={evidenceFilter}
            onChange={(event) =>
              setEvidenceFilter(event.target.value as EvidenceFilter)
            }
          >
            <option value="all">全部證據</option>
            <option value="with-evidence">有證據</option>
            <option value="without-evidence">無證據</option>
          </select>
        </label>
        <label>
          身分
          <select
            value={identityFilter}
            onChange={(event) =>
              setIdentityFilter(event.target.value as IdentityFilter)
            }
          >
            <option value="all">全部身分</option>
            <option value="needs-review">待身分審查</option>
            <option value="resolved">已有身分決策</option>
          </select>
        </label>
      </section>

      <div className="editorial-review__body">
        <section className="editorial-review__list" aria-label="主張清單">
          <div className="editorial-review__list-heading">
            <strong>待審主張</strong>
            <span>{filteredClaims.length} 筆</span>
          </div>
          {filteredClaims.map((claim) => {
            const candidate = candidatesById.get(claim.candidateId);
            const decision = activeDecisions.get(`claim:${claim.claimId}`);
            const identitySubject =
              conflictsByCandidate.get(claim.candidateId)?.conflictId ??
              `candidate:${claim.candidateId}`;
            const identity = activeDecisions.get(`identity:${identitySubject}`);
            const releaseGroup = releaseGroupByClaim.get(claim.claimId);
            return (
              <button
                type="button"
                className={`editorial-review__item${selectedClaimId === claim.claimId ? ' is-selected' : ''}`}
                key={claim.claimId}
                onClick={() => setSelectedClaimId(claim.claimId)}
              >
                <span className="editorial-review__item-title">
                  {candidate?.displayName}・{claim.title}
                </span>
                <span>
                  {claimLabels[claim.claimType] ?? claim.claimType}・
                  {claim.organization ?? '未標示機關'}
                </span>
                {releaseGroup ? (
                  <span>首批批次・{releaseGroup.groupId}</span>
                ) : null}
                <span className="editorial-review__badges">
                  <small>
                    {stateLabels[decision?.resultingState ?? 'unreviewed']}
                  </small>
                  <small>{identity ? '身分已決' : '待身分'}</small>
                </span>
              </button>
            );
          })}
          {filteredClaims.length === 0 ? (
            <p className="editorial-review__empty">沒有符合篩選條件的主張。</p>
          ) : null}
        </section>

        <section
          className="editorial-review__detail"
          aria-label="主張證據與決策"
        >
          {selectedClaim && selectedCandidate ? (
            <>
              <div className="editorial-review__detail-heading">
                <div>
                  <p className="eyebrow">
                    {selectedCandidate.displayName}・
                    {selectedCandidate.districtId}
                  </p>
                  <h2>{selectedClaim.title}</h2>
                </div>
                <span className="editorial-review__state">
                  {
                    stateLabels[
                      selectedClaimDecision?.resultingState ?? 'unreviewed'
                    ]
                  }
                </span>
              </div>
              <div className="editorial-review__claim-copy">
                <p>{selectedClaim.value}</p>
                <dl>
                  {releaseBatch &&
                  releaseGroupByClaim.has(selectedClaim.claimId) ? (
                    <div data-testid="release-batch-context">
                      <dt>首批審查</dt>
                      <dd>
                        {
                          releaseGroupByClaim.get(selectedClaim.claimId)
                            ?.groupId
                        }
                      </dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>類型</dt>
                    <dd>
                      {claimLabels[selectedClaim.claimType] ??
                        selectedClaim.claimType}
                    </dd>
                  </div>
                  <div>
                    <dt>歸屬</dt>
                    <dd>{selectedClaim.attribution}</dd>
                  </div>
                  <div>
                    <dt>時間</dt>
                    <dd>
                      {selectedClaim.validFrom ?? '未標示'}－
                      {selectedClaim.validTo ?? '未標示'}
                    </dd>
                  </div>
                </dl>
              </div>
              {releaseAuditByClaim.get(selectedClaim.claimId)?.blockers
                .length ? (
                <section
                  className="editorial-review__section"
                  data-testid="release-blockers"
                >
                  <h3>首批釋出審查提示</h3>
                  <p>
                    {releaseAuditByClaim.get(selectedClaim.claimId)?.category}・
                    {
                      releaseAuditByClaim.get(selectedClaim.claimId)
                        ?.temporalConfidence
                    }
                  </p>
                  <ul>
                    {releaseAuditByClaim
                      .get(selectedClaim.claimId)
                      ?.blockers.map((blocker) => (
                        <li key={blocker}>{blocker}</li>
                      ))}
                  </ul>
                </section>
              ) : null}

              <div className="editorial-review__section">
                <h3>身分觀察</h3>
                {selectedClaim.identityObservationIds.map((observationId) => {
                  const observation = observationsById.get(observationId);
                  return observation ? (
                    <article
                      className="editorial-review__evidence"
                      key={observation.observationId}
                    >
                      <strong>
                        {observation.observedName}・{observation.identityStatus}
                      </strong>
                      <p>{observation.rationale}</p>
                      <small>{observation.excerpt}</small>
                    </article>
                  ) : null;
                })}
                <p className="editorial-review__meta">
                  {selectedConflict
                    ? `現有衝突：${selectedConflict.competingObservedNames.join('／')}`
                    : '目前沒有機器標記的候選人衝突；仍須明確確認身分。'}
                </p>
              </div>

              <div className="editorial-review__section">
                <h3>來源證據</h3>
                {selectedClaim.evidenceIds.map((evidenceId) => {
                  const evidence = evidenceById.get(evidenceId);
                  const source = evidence
                    ? sourcesById.get(evidence.sourceId)
                    : null;
                  if (!evidence || !source) return null;
                  return (
                    <article
                      className="editorial-review__evidence"
                      key={evidence.evidenceId}
                    >
                      <strong>
                        {sourcePublisher(source.url)}・{evidence.supportType}
                      </strong>
                      <p>{evidence.excerpt}</p>
                      <small>
                        {evidence.documentLocation}・擷取{' '}
                        {source.sourceRetrievedAt ?? source.attemptedAt}
                        ・SHA-256 {source.sha256 ?? '未保存'}
                      </small>
                      <a href={source.url} target="_blank" rel="noreferrer">
                        開啟原始來源
                      </a>
                    </article>
                  );
                })}
              </div>

              <div className="editorial-review__section">
                <h3>決策歷史</h3>
                {[...decisions]
                  .filter(
                    (decision) =>
                      decision.subjectId === selectedClaim.claimId ||
                      decision.subjectId === selectedIdentitySubject,
                  )
                  .map((decision) => (
                    <article
                      className="editorial-review__history"
                      key={decision.decisionId}
                    >
                      <strong>
                        {decisionLabels[decision.decision] ?? decision.decision}
                        ・{stateLabels[decision.resultingState]}
                      </strong>
                      <span>
                        {decision.reviewerId}・{decision.decidedAt}
                      </span>
                      <p>{decision.rationale}</p>
                    </article>
                  ))}
                {selectedClaimDecision ? (
                  <p className="editorial-review__meta">
                    目前主張決策：
                    {decisionLabels[selectedClaimDecision.decision]}
                  </p>
                ) : null}
                {selectedIdentityDecision ? (
                  <p className="editorial-review__meta">
                    目前身分決策：
                    {decisionLabels[selectedIdentityDecision.decision]}
                  </p>
                ) : null}
              </div>

              <div className="editorial-review__actions">
                <h3>新增決策</h3>
                <label>
                  理由
                  <textarea
                    value={rationale}
                    onChange={(event) => setRationale(event.target.value)}
                    placeholder="拒絕、爭議、暫緩或身分覆寫必填理由"
                  />
                </label>
                <label className="editorial-review__checkbox">
                  <input
                    type="checkbox"
                    checked={confirmation}
                    onChange={(event) => setConfirmation(event.target.checked)}
                  />
                  我確認這項決策是根據目前顯示的來源與身分證據作成
                </label>
                <div className="editorial-review__buttons">
                  <button type="button" onClick={approveClaim}>
                    核准主張
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      addDecision(
                        'claim',
                        selectedClaim.claimId,
                        selectedClaim.candidateId,
                        'request-clarification',
                        [],
                      )
                    }
                  >
                    要求釐清
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      addDecision(
                        'claim',
                        selectedClaim.claimId,
                        selectedClaim.candidateId,
                        'dispute',
                        [],
                      )
                    }
                  >
                    標記爭議
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      addDecision(
                        'claim',
                        selectedClaim.claimId,
                        selectedClaim.candidateId,
                        'reject',
                        [],
                      )
                    }
                  >
                    拒絕主張
                  </button>
                  <button
                    type="button"
                    onClick={() => identityDecision('confirm-same')}
                  >
                    確認同一人
                  </button>
                  <button
                    type="button"
                    onClick={() => identityDecision('confirm-different')}
                  >
                    確認不同人
                  </button>
                </div>
              </div>
            </>
          ) : (
            <p className="editorial-review__empty">請選擇一筆主張。</p>
          )}
        </section>
      </div>
      {scopedPacket && scopedQueue && scopedReadiness ? (
        <ScopedEnrichmentReviewPanel
          packet={scopedPacket}
          queue={scopedQueue}
          readiness={scopedReadiness}
          decisions={scopedDecisions}
          onDecision={addScopedDecision}
          onExport={exportScopedDecisions}
        />
      ) : null}
      {scopedAudit ? <ScopedEnrichmentAuditPanel report={scopedAudit} /> : null}
      {semanticReport ? (
        <SemanticEvidenceAdjudicationPanel report={semanticReport} />
      ) : null}
    </main>
  );
}
