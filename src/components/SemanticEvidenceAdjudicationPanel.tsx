import { useMemo, useState } from 'react';
import type {
  SemanticFindingResult,
  SemanticReviewReport,
  SemanticVerdict,
} from '../data/enrichment/semantic-review';

interface Props {
  report: SemanticReviewReport;
}

type Filter = 'all' | SemanticVerdict | 'disagreement';

const verdictLabels: Record<SemanticVerdict, string> = {
  supported: 'supported',
  'partially-supported': 'partially-supported',
  'insufficient-evidence': 'insufficient-evidence',
  contradicted: 'contradicted',
  'wrong-identity': 'wrong-identity',
};

const resultByInvocation = (report: SemanticReviewReport) =>
  new Map(
    report.invocations
      .filter((invocation) => invocation.result)
      .map((invocation) => [
        invocation.invocationId,
        invocation.result as SemanticFindingResult,
      ]),
  );

export default function SemanticEvidenceAdjudicationPanel({ report }: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedClaimId, setSelectedClaimId] = useState(
    report.comparisons[0]?.claimId ?? '',
  );
  const results = useMemo(() => resultByInvocation(report), [report]);
  const rows = useMemo(
    () =>
      report.comparisons.filter((comparison) => {
        if (filter === 'all') return true;
        if (filter === 'disagreement')
          return comparison.agreement !== 'full-agreement';
        const result = results.get(comparison.reviewerAInvocationId);
        return result?.verdict === filter;
      }),
    [filter, report.comparisons, results],
  );
  const selected =
    rows.find((comparison) => comparison.claimId === selectedClaimId) ??
    rows[0];
  const selectedA = selected
    ? results.get(selected.reviewerAInvocationId)
    : undefined;
  const selectedB = selected
    ? results.get(selected.reviewerBInvocationId)
    : undefined;

  return (
    <section
      className="editorial-review__section semantic-adjudication"
      data-testid="semantic-adjudication-panel"
    >
      <div className="editorial-review__list-heading">
        <div>
          <span className="eyebrow">MODEL SEMANTIC ADJUDICATION</span>
          <h2>來源證據語意判讀（機器輔助）</h2>
        </div>
        <span className="editorial-review__badge">
          {report.packetCount} 筆主張
        </span>
      </div>
      <p className="scoped-ai-audit__notice">
        這是分開執行的 Reviewer A／B
        模型結果與引用檢查，不是人類審查、核准、身分決定或出版。所有差異仍需授權編輯處理。
      </p>
      <div
        className="scoped-ai-audit__summary"
        data-testid="semantic-adjudication-summary"
      >
        <span>Reviewer A 有效：{report.summary.reviewerASuccessful}</span>
        <span>Reviewer B 有效：{report.summary.reviewerBSuccessful}</span>
        <span>配對：{report.summary.completedPairs}</span>
        <span>差異：{report.summary.disagreements}</span>
        <span>失敗／無法使用：{report.summary.failedInvocations}</span>
        <span>人類核准：0</span>
        <span>出版：0</span>
      </div>
      <label>
        模型判讀篩選
        <select
          value={filter}
          onChange={(event) => setFilter(event.target.value as Filter)}
          data-testid="semantic-adjudication-filter"
        >
          <option value="all">全部 {report.packetCount}</option>
          {(Object.keys(verdictLabels) as SemanticVerdict[]).map((verdict) => (
            <option value={verdict} key={verdict}>
              {verdictLabels[verdict]}
            </option>
          ))}
          <option value="disagreement">需要比較／人工決定</option>
        </select>
      </label>
      <div className="scoped-ai-audit__grid">
        <div
          className="scoped-ai-audit__list"
          role="listbox"
          aria-label="語意判讀主張"
        >
          {rows.map((comparison) => (
            <button
              type="button"
              role="option"
              aria-selected={comparison.claimId === selected?.claimId}
              className={`scoped-ai-audit__item${comparison.claimId === selected?.claimId ? ' is-selected' : ''}`}
              key={comparison.claimId}
              onClick={() => setSelectedClaimId(comparison.claimId)}
            >
              <strong>{comparison.claimId}</strong>
              <span>{comparison.agreement}</span>
            </button>
          ))}
        </div>
        <div
          className="scoped-ai-audit__detail"
          data-testid="semantic-adjudication-detail"
        >
          {selected && selectedA && selectedB ? (
            <>
              <h3>{selected.claimId}</h3>
              <p>
                <strong>比較：</strong>
                {selected.agreement}；
                {selected.requiresHumanDecision
                  ? '需要人類決定'
                  : '不需人類決定'}
              </p>
              <p>{selected.adjudicationRecommendation}</p>
              <dl>
                <div>
                  <dt>Reviewer A</dt>
                  <dd>{selectedA.verdict}</dd>
                </div>
                <div>
                  <dt>Reviewer B</dt>
                  <dd>{selectedB.verdict}</dd>
                </div>
                <div>
                  <dt>身分</dt>
                  <dd>
                    {selectedA.identityAssessment}／
                    {selectedB.identityAssessment}
                  </dd>
                </div>
                <div>
                  <dt>歸因</dt>
                  <dd>
                    {selectedA.attributionAssessment}／
                    {selectedB.attributionAssessment}
                  </dd>
                </div>
                <div>
                  <dt>時間性</dt>
                  <dd>
                    {selectedA.temporalAssessment.assessment}／
                    {selectedB.temporalAssessment.assessment}
                  </dd>
                </div>
              </dl>
              <div>
                <h4>Reviewer A 引用</h4>
                <ul>
                  {selectedA.evidence.map((citation) => (
                    <li key={`a-${citation.evidenceId}-${citation.excerpt}`}>
                      <code>{citation.sourceId}</code>／
                      <code>{citation.evidenceId}</code>：{citation.excerpt}
                    </li>
                  ))}
                </ul>
                <h4>Reviewer B 引用</h4>
                <ul>
                  {selectedB.evidence.map((citation) => (
                    <li key={`b-${citation.evidenceId}-${citation.excerpt}`}>
                      <code>{citation.sourceId}</code>／
                      <code>{citation.evidenceId}</code>：{citation.excerpt}
                    </li>
                  ))}
                </ul>
              </div>
              {selected.disputedPropositions.length > 0 ? (
                <ul>
                  {selected.disputedPropositions.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p>兩份判讀沒有列出額外爭點；仍需人類確認。</p>
              )}
            </>
          ) : (
            <p>沒有符合篩選條件的模型判讀。</p>
          )}
        </div>
      </div>
    </section>
  );
}
