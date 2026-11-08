import { useMemo, useState } from 'react';
import type { IndependentAIAuditReport } from '../data/enrichment/ai-audit';

interface Props {
  report: IndependentAIAuditReport;
}

type StatusFilter = 'all' | 'machine-verified' | 'needs-review' | 'unsupported';

export default function ScopedEnrichmentAuditPanel({ report }: Props) {
  const [status, setStatus] = useState<StatusFilter>('all');
  const [selectedClaimId, setSelectedClaimId] = useState(
    report.findings[0]?.claimId ?? '',
  );
  const filteredFindings = useMemo(
    () =>
      report.findings.filter(
        (finding) => status === 'all' || finding.firstPassStatus === status,
      ),
    [report.findings, status],
  );
  const selected =
    filteredFindings.find((finding) => finding.claimId === selectedClaimId) ??
    filteredFindings[0];

  return (
    <section
      className="editorial-review__section scoped-ai-audit"
      data-testid="scoped-ai-audit-panel"
    >
      <div className="editorial-review__list-heading">
        <div>
          <span className="eyebrow">INDEPENDENT EVIDENCE AUDIT</span>
          <h2>範圍履歷證據雙重機器審計</h2>
        </div>
        <span className="editorial-review__badge">
          {report.summary.claimCount} 筆主張
        </span>
      </div>
      <p className="scoped-ai-audit__notice">
        此面板只顯示離線重新開啟來源的機器審計，不是人類審查、核准或出版。ACP
        獨立代理無法取得檔案工具，因此第二道結果是獨立規則式機器重開，限制已記錄於報告。
      </p>
      <div
        className="scoped-ai-audit__summary"
        data-testid="scoped-ai-audit-summary"
      >
        <span>
          首輪 machine-verified：
          {report.summary.firstPass['machine-verified'] ?? 0}
        </span>
        <span>
          首輪 needs-review：{report.summary.firstPass['needs-review'] ?? 0}
        </span>
        <span>
          首輪 unsupported：{report.summary.firstPass.unsupported ?? 0}
        </span>
        <span>雙輪一致：{report.summary.comparison.agree}</span>
        <span>雙輪差異：{report.summary.comparison.disagree}</span>
      </div>
      <label>
        審計狀態
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as StatusFilter)}
          data-testid="scoped-ai-audit-filter"
        >
          <option value="all">全部 {report.summary.claimCount}</option>
          <option value="machine-verified">machine-verified</option>
          <option value="needs-review">needs-review</option>
          <option value="unsupported">unsupported</option>
        </select>
      </label>
      <div className="scoped-ai-audit__grid">
        <div
          className="scoped-ai-audit__list"
          role="listbox"
          aria-label="證據審計主張"
        >
          {filteredFindings.map((finding) => (
            <button
              type="button"
              role="option"
              aria-selected={finding.claimId === selected?.claimId}
              className={`scoped-ai-audit__item${finding.claimId === selected?.claimId ? ' is-selected' : ''}`}
              key={finding.claimId}
              onClick={() => setSelectedClaimId(finding.claimId)}
            >
              <strong>{finding.claimId}</strong>
              <span>
                {finding.firstPassStatus} · {finding.comparison}
              </span>
            </button>
          ))}
        </div>
        <div
          className="scoped-ai-audit__detail"
          data-testid="scoped-ai-audit-detail"
        >
          {selected ? (
            <>
              <h3>{selected.claimId}</h3>
              <p>{selected.rationale}</p>
              <p>
                <strong>第二道機器審計：</strong>
                {selected.secondPassRationale}
              </p>
              <dl>
                <div>
                  <dt>首輪</dt>
                  <dd>{selected.firstPassStatus}</dd>
                </div>
                <div>
                  <dt>第二輪</dt>
                  <dd>{selected.secondPassStatus}</dd>
                </div>
                <div>
                  <dt>比較</dt>
                  <dd>{selected.comparison}</dd>
                </div>
                <div>
                  <dt>來源重開</dt>
                  <dd>{selected.checks.sourceReopened}</dd>
                </div>
                <div>
                  <dt>證據支援</dt>
                  <dd>{selected.checks.evidenceSupport}</dd>
                </div>
                <div>
                  <dt>時間性</dt>
                  <dd>{selected.checks.temporal}</dd>
                </div>
              </dl>
              <p>
                <strong>Source IDs：</strong>
                {selected.sourceIds.join('、')}
              </p>
              <p>
                <strong>Evidence IDs：</strong>
                {selected.evidenceIds.join('、')}
              </p>
              {selected.blockers.length > 0 ? (
                <ul>
                  {selected.blockers.map((blocker) => (
                    <li key={blocker}>{blocker}</li>
                  ))}
                </ul>
              ) : (
                <p>此機器審計未產生額外 blocker；仍不代表人類核准。</p>
              )}
            </>
          ) : (
            <p>沒有符合篩選條件的主張。</p>
          )}
        </div>
      </div>
    </section>
  );
}
