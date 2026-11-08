import { useMemo, useState } from 'react';
import type { EditorialDecision } from '../data/editorial';
import type {
  ScopedPublicationReadiness,
  ScopedReviewQueueReport,
} from '../data/enrichment/review-publication';
import type {
  EnrichmentReviewPacket,
  EnrichmentSourceAttempt,
} from '../data/enrichment/schema';

export type ScopedDecisionKind =
  | 'approve'
  | 'reject'
  | 'request-clarification'
  | 'dispute'
  | 'defer'
  | 'confirm-same'
  | 'confirm-different'
  | 'insufficient-evidence'
  | 'reject-match';

interface Props {
  packet: EnrichmentReviewPacket;
  queue: ScopedReviewQueueReport;
  readiness: ScopedPublicationReadiness;
  decisions: EditorialDecision[];
  onDecision: (
    subjectType: 'claim' | 'identity',
    subjectId: string,
    candidateId: string,
    decision: ScopedDecisionKind,
    evidenceVersions: Array<{ sourceId: string; sha256: string }>,
    rationale: string,
    confirmation: boolean,
  ) => void;
  onExport: () => void;
}

type GroupFilter = 'all' | 'district-4' | 'mayoral';
type ReadinessFilter =
  | 'all'
  | 'ready-for-human-review'
  | 'blocked'
  | 'requires-additional-evidence';

const decisionLabels: Record<string, string> = {
  approve: '核准主張',
  reject: '拒絕主張',
  'request-clarification': '要求補充證據',
  dispute: '標記爭議',
  defer: '暫緩處理',
  'confirm-same': '確認同一人',
  'confirm-different': '確認不同人',
  'insufficient-evidence': '身分證據不足',
  'reject-match': '拒絕目前配對',
};

function currentDecision(
  decisions: EditorialDecision[],
  subjectType: 'claim' | 'identity',
  subjectId: string,
): EditorialDecision | undefined {
  return [...decisions]
    .reverse()
    .find(
      (decision) =>
        decision.subjectType === subjectType &&
        decision.subjectId === subjectId,
    );
}

function sourceMap(
  sources: EnrichmentSourceAttempt[],
): Map<string, EnrichmentSourceAttempt> {
  return new Map(sources.map((source) => [source.sourceId, source]));
}

export default function ScopedEnrichmentReviewPanel({
  packet,
  queue,
  readiness,
  decisions,
  onDecision,
  onExport,
}: Props) {
  const [groupFilter, setGroupFilter] = useState<GroupFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [readinessFilter, setReadinessFilter] =
    useState<ReadinessFilter>('all');
  const [selectedItemId, setSelectedItemId] = useState(
    queue.items[0]?.reviewItemId ?? '',
  );
  const [rationale, setRationale] = useState('');
  const [confirmation, setConfirmation] = useState(false);
  const sources = useMemo(() => sourceMap(packet.sourceAttempts), [packet]);
  const candidates = useMemo(
    () =>
      new Map(
        packet.candidates.map((candidate) => [
          candidate.candidateId,
          candidate,
        ]),
      ),
    [packet.candidates],
  );
  const categories = useMemo(
    () => [...new Set(queue.items.map((item) => item.category))].sort(),
    [queue.items],
  );
  const filteredItems = useMemo(
    () =>
      queue.items.filter((item) => {
        const candidate = candidates.get(item.candidateId);
        const group =
          candidate?.electionType === 'mayoral' ? 'mayoral' : 'district-4';
        if (groupFilter !== 'all' && group !== groupFilter) return false;
        if (categoryFilter !== 'all' && item.category !== categoryFilter)
          return false;
        if (readinessFilter !== 'all' && item.readiness !== readinessFilter)
          return false;
        return true;
      }),
    [candidates, categoryFilter, groupFilter, queue.items, readinessFilter],
  );
  const selectedItem =
    filteredItems.find((item) => item.reviewItemId === selectedItemId) ??
    filteredItems[0] ??
    null;
  const selectedCandidate = selectedItem
    ? candidates.get(selectedItem.candidateId)
    : undefined;
  const selectedDecision = selectedItem?.claimId
    ? currentDecision(decisions, 'claim', selectedItem.claimId)
    : undefined;
  const selectedIdentityDecision = selectedItem
    ? currentDecision(
        decisions,
        'identity',
        `candidate:${selectedItem.candidateId}`,
      )
    : undefined;
  const selectedSources = selectedItem
    ? selectedItem.sourceIds
        .map((sourceId) => sources.get(sourceId))
        .filter((source): source is EnrichmentSourceAttempt => Boolean(source))
    : [];
  const readinessLabel = {
    'ready-for-human-review': '可供人工審查',
    blocked: '已阻擋',
    'requires-additional-evidence': '需要補充證據',
  } as const;

  function submitClaimDecision(decision: ScopedDecisionKind) {
    if (!selectedItem?.claimId) return;
    const evidenceVersions = selectedItem.sourceIds.flatMap((sourceId) => {
      const sha256 = sources.get(sourceId)?.sha256;
      return sha256 ? [{ sourceId, sha256 }] : [];
    });
    onDecision(
      'claim',
      selectedItem.claimId,
      selectedItem.candidateId,
      decision,
      evidenceVersions,
      rationale,
      confirmation,
    );
  }

  function submitIdentityDecision(decision: ScopedDecisionKind) {
    if (!selectedItem) return;
    const evidenceVersions = selectedItem.sourceIds.flatMap((sourceId) => {
      const sha256 = sources.get(sourceId)?.sha256;
      return sha256 ? [{ sourceId, sha256 }] : [];
    });
    onDecision(
      'identity',
      `candidate:${selectedItem.candidateId}`,
      selectedItem.candidateId,
      decision,
      evidenceVersions,
      rationale,
      confirmation,
    );
  }

  return (
    <section
      className="scoped-enrichment-review"
      data-testid="scoped-enrichment-panel"
    >
      <header className="scoped-enrichment-review__header">
        <div>
          <p className="eyebrow">SCOPED ENRICHMENT · LOCAL ONLY</p>
          <h2>左營／市長範圍審查</h2>
          <p>
            {readiness.summary.totalClaims} 筆主張・{packet.candidates.length}{' '}
            位候選人・
            {readiness.categoryMatrix.length}{' '}
            個類別審查格。這裡只準備人工審查，不代表核准或出版。
          </p>
        </div>
        <button
          type="button"
          className="button button--primary"
          onClick={onExport}
        >
          匯出範圍決策 JSON
        </button>
      </header>
      <div className="scoped-enrichment-review__summary" aria-live="polite">
        <span>可供審查 {queue.summary.readyForHumanReview}</span>
        <span>已阻擋 {queue.summary.blocked}</span>
        <span>需補證據 {queue.summary.requiresAdditionalEvidence}</span>
        <span>目前決策 {decisions.length}</span>
      </div>
      <fieldset className="scoped-enrichment-review__filters">
        <legend className="scoped-enrichment-review__legend">
          左營與市長範圍篩選器
        </legend>
        <label>
          候選範圍
          <select
            data-testid="scoped-group-filter"
            value={groupFilter}
            onChange={(event) =>
              setGroupFilter(event.target.value as GroupFilter)
            }
          >
            <option value="all">全部範圍</option>
            <option value="district-4">第 4 選區</option>
            <option value="mayoral">市長</option>
          </select>
        </label>
        <label>
          資訊類別
          <select
            data-testid="scoped-category-filter"
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
          >
            <option value="all">全部類別</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>
        <label>
          審查準備度
          <select
            data-testid="scoped-readiness-filter"
            value={readinessFilter}
            onChange={(event) =>
              setReadinessFilter(event.target.value as ReadinessFilter)
            }
          >
            <option value="all">全部狀態</option>
            <option value="ready-for-human-review">可供人工審查</option>
            <option value="blocked">已阻擋</option>
            <option value="requires-additional-evidence">需補充證據</option>
          </select>
        </label>
      </fieldset>
      <div className="scoped-enrichment-review__body">
        <section
          className="scoped-enrichment-review__list"
          aria-label="範圍審查清單"
        >
          <div className="scoped-enrichment-review__list-heading">
            <strong>範圍審查項目</strong>
            <span>{filteredItems.length} 筆</span>
          </div>
          {filteredItems.map((item) => (
            <button
              type="button"
              className={`scoped-enrichment-review__item${selectedItem?.reviewItemId === item.reviewItemId ? ' is-selected' : ''}`}
              key={item.reviewItemId}
              onClick={() => setSelectedItemId(item.reviewItemId)}
            >
              <strong>
                {item.displayName}・{item.claimId ?? '類別缺口'}
              </strong>
              <span>
                {item.category}・{readinessLabel[item.readiness]}
              </span>
              <small>
                {item.claimWording ??
                  '目前沒有候選人特定主張；這是中性資料缺口。'}
              </small>
            </button>
          ))}
          {filteredItems.length === 0 ? (
            <p className="scoped-enrichment-review__empty">
              沒有符合篩選條件的項目。
            </p>
          ) : null}
        </section>
        <section
          className="scoped-enrichment-review__detail"
          aria-label="範圍主張證據"
        >
          {selectedItem && selectedCandidate ? (
            <>
              <div className="scoped-enrichment-review__detail-heading">
                <div>
                  <p className="eyebrow">
                    {selectedCandidate.displayName}・
                    {selectedCandidate.districtId}
                  </p>
                  <h3>{selectedItem.claimWording ?? '類別資料缺口'}</h3>
                </div>
                <span className="editorial-review__state">
                  {readinessLabel[selectedItem.readiness]}
                </span>
              </div>
              <dl className="scoped-enrichment-review__metadata">
                <div>
                  <dt>類別</dt>
                  <dd>{selectedItem.category}</dd>
                </div>
                <div>
                  <dt>歸屬</dt>
                  <dd>{selectedItem.attribution ?? '尚無主張歸屬'}</dd>
                </div>
                <div>
                  <dt>時間</dt>
                  <dd>{selectedItem.temporalStatus}</dd>
                </div>
                <div>
                  <dt>身分</dt>
                  <dd>{selectedItem.identityStatus}</dd>
                </div>
                <div>
                  <dt>穩定 Claim ID</dt>
                  <dd>{selectedItem.claimId ?? '無'}</dd>
                </div>
              </dl>
              {selectedItem.evidenceExcerpt ? (
                <article className="scoped-enrichment-review__evidence">
                  <h4>原始證據摘錄</h4>
                  <p>{selectedItem.evidenceExcerpt}</p>
                </article>
              ) : (
                <p className="scoped-enrichment-review__neutral">
                  本項沒有保留候選人特定證據；這不代表相關事實不存在。
                </p>
              )}
              {selectedItem.blockingIssues.length > 0 ? (
                <section className="scoped-enrichment-review__blockers">
                  <h4>阻擋原因</h4>
                  <ul>
                    {selectedItem.blockingIssues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                </section>
              ) : null}
              <section className="scoped-enrichment-review__sources">
                <h4>來源與版本</h4>
                {selectedSources.map((source) => (
                  <article key={`${source.sourceId}-${source.attemptId}`}>
                    <strong>{source.sourceId}</strong>
                    <small>
                      {source.timestampQuality}・SHA-256{' '}
                      {source.sha256 ?? '未保存'}
                    </small>
                    <a href={source.url} target="_blank" rel="noreferrer">
                      開啟原始來源
                    </a>
                  </article>
                ))}
                {selectedSources.length === 0 ? (
                  <p>本項沒有可開啟的來源。</p>
                ) : null}
              </section>
              <section className="scoped-enrichment-review__actions">
                <h4>範圍決策（仍須 CLI 驗證）</h4>
                <p>
                  目前決策：
                  {selectedDecision
                    ? decisionLabels[selectedDecision.decision]
                    : '尚無'}
                  ；身分：
                  {selectedIdentityDecision
                    ? decisionLabels[selectedIdentityDecision.decision]
                    : '尚無'}
                </p>
                <label>
                  理由
                  <textarea
                    value={rationale}
                    onChange={(event) => setRationale(event.target.value)}
                    placeholder="拒絕、爭議、暫緩或身分覆寫需要理由"
                  />
                </label>
                <label className="editorial-review__checkbox">
                  <input
                    type="checkbox"
                    checked={confirmation}
                    onChange={(event) => setConfirmation(event.target.checked)}
                  />
                  我確認這項範圍決策根據目前顯示的來源與身分證據作成
                </label>
                <div className="editorial-review__buttons">
                  {selectedItem.claimId ? (
                    <button
                      type="button"
                      onClick={() => submitClaimDecision('approve')}
                    >
                      核准範圍主張
                    </button>
                  ) : null}
                  {selectedItem.claimId ? (
                    <button
                      type="button"
                      onClick={() =>
                        submitClaimDecision('request-clarification')
                      }
                    >
                      要求補充證據
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => submitIdentityDecision('confirm-same')}
                  >
                    確認範圍身分
                  </button>
                </div>
              </section>
            </>
          ) : (
            <p className="scoped-enrichment-review__empty">
              請選擇範圍審查項目。
            </p>
          )}
        </section>
      </div>
    </section>
  );
}
