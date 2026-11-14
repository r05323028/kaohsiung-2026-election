import type { PublishedPolicy } from '../data/policy-research/published-schema';
import type { PoliticalCareerView } from '../data/political-career';

const categoryLabels: Record<string, string> = {
  'public-office-term': '公職任期',
  'election-contest': '選舉參與',
  'council-proposal': '議會提案',
  'council-interpellation': '議會質詢',
  'ordinance-review': '法規審查',
  'budget-review': '預算審議',
  'municipal-governance': '市政參與',
  'public-affairs': '公共事務',
};

const actionLabels: Record<string, string> = {
  'serve-office': '擔任',
  'contest-election': '參選',
  propose: '提案',
  'co-sponsor': '連署',
  interpellate: '提出質詢',
  deliberate: '參與審議',
  approve: '參與表決',
  implement: '執行',
  'public-affairs-participation': '參與',
};

const outcomeLabels: Record<string, string> = {
  'documented-outcome': '已載明結果',
  'institutional-response': '機關回應',
  pending: '進行中',
  'not-documented': '未載明結果',
  'not-applicable': '不適用',
};

const sourceTierLabels: Record<string, string> = {
  'tier-1-primary': '一級原始文件',
  'tier-2-authoritative': '二級機關文件',
  'tier-3-reporting': '媒體報導',
};

const promiseTypes = new Set([
  'manifesto',
  'campaign_proposal',
  'issue_position',
]);

function yearOf(date: string): string {
  return date.slice(0, 4);
}

function TimelineSource({
  view,
  sourceId,
}: {
  view: PoliticalCareerView;
  sourceId: string;
}) {
  const source = view.sources[sourceId];
  if (!source) return null;
  return (
    <a className="source-chip" href={source.url} target="_blank" rel="noreferrer">
      {source.publisher}・{sourceTierLabels[source.tier] ?? source.tier}
    </a>
  );
}

export function PoliticalCareerTimeline({
  view,
  promises,
  candidateName,
}: {
  view: PoliticalCareerView;
  promises: PublishedPolicy[];
  candidateName: string;
}) {
  const { activities, officeTerms, coverage } = view;
  const proposalCount = activities.filter(
    (activity) => activity.category === 'council-proposal',
  ).length;
  const campaignPromises = promises.filter((policy) =>
    promiseTypes.has(policy.type),
  );
  const years = [...new Set(activities.map((activity) => yearOf(activity.date)))].sort();

  return (
    <div data-testid="political-career-timeline">
      <section className="content-card">
        <h4>公職任期</h4>
        {officeTerms.length > 0 ? (
          <ul className="political-career-offices">
            {officeTerms.map((term) => (
              <li key={term.id}>
                <strong>
                  {term.organization}・{term.officeTitle}
                </strong>
                <span>
                  {term.termLabel}
                  {term.termNumbers.length > 0 && term.termLabel.startsWith('第')
                    ? ''
                    : '（屆次未載明）'}
                  ｜{term.status === 'current' ? '現任' : '曾任'}
                </span>
                {term.startDate || term.endDate ? (
                  <span>
                    {term.startDate ?? '起日未載明'}—{term.endDate ?? '迄日未載明'}
                  </span>
                ) : (
                  <span>起訖日期未載明</span>
                )}
                <span className="content-card__meta">
                  {term.sourceIds.map((sourceId) => (
                    <TimelineSource key={sourceId} view={view} sourceId={sourceId} />
                  ))}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p>未取得可查證的公職任期紀錄。</p>
        )}
      </section>

      <section className="content-card">
        <h4>政治活動時間軸</h4>
        <p>
          僅列出可逐字核對的紀錄：議員服務政見頁屆次、議會新聞稿與機關文件。
          已檢索 {coverage.searchedSourceIds.length} 個來源；未載明日期者不列入。
        </p>
        {activities.length > 0 ? (
          <div className="career-timeline">
            {years.map((year) => (
              <section key={year} className="career-timeline__year">
                <h5>{year}</h5>
                <ol className="timeline">
                  {activities
                    .filter((activity) => yearOf(activity.date) === year)
                    .map((activity) => (
                      <li key={activity.id} data-category={activity.category}>
                        <time dateTime={activity.date}>{activity.date}</time>
                        <div className="content-card__meta">
                          <span className="status-chip">
                            {categoryLabels[activity.category] ?? activity.category}
                          </span>
                          <span>{actionLabels[activity.actionType] ?? activity.actionType}</span>
                          {activity.sessionLabel ? <span>{activity.sessionLabel}</span> : null}
                        </div>
                        <strong>{activity.title}</strong>
                        <p>{activity.description}</p>
                        <p>
                          <strong>角色：</strong>
                          {activity.role}
                          {activity.venue ? '・' + activity.venue : ''}
                        </p>
                        <p>
                          <strong>結果：</strong>
                          {outcomeLabels[activity.outcomeStatus] ?? activity.outcomeStatus}
                          {activity.outcome ? '｜' + activity.outcome : ''}
                        </p>
                        <p className="career-timeline__basis">
                          <strong>歸屬依據：</strong>
                          {activity.identityBasis}
                        </p>
                        <div className="content-card__meta">
                          <TimelineSource view={view} sourceId={activity.sourceId} />
                        </div>
                      </li>
                    ))}
                </ol>
              </section>
            ))}
          </div>
        ) : (
          <p data-testid="political-career-empty">
            {coverage.note ??
              '未取得可歸屬於' + candidateName + '的從政紀錄；查無紀錄不代表未從事政治活動。'}
          </p>
        )}
      </section>

      <section className="content-card" data-testid="campaign-promises">
        <h4>競選承諾（尚未發生）</h4>
        <p>
          以下為競選期間提出的主張，屬於未來的政策承諾，不列入上方已發生的從政紀錄。
        </p>
        {campaignPromises.length > 0 ? (
          <ul>
            {campaignPromises.map((policy) => (
              <li key={policy.policyId}>
                <strong>{policy.title}</strong>
                <p>{policy.summary}</p>
                <p className="content-card__meta">
                  {policy.announcedAt ? <span>{policy.announcedAt}</span> : null}
                  {policy.sources.map((source) => (
                    <a
                      className="source-chip"
                      key={source.url}
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {source.publisher}
                    </a>
                  ))}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p>目前未收錄可查證的競選承諾。</p>
        )}
      </section>

      <section className="content-card" data-testid="legislative-records">
        <h4>提案與表決紀錄</h4>
        <p>
          {proposalCount > 0
            ? '已收錄 ' + proposalCount + ' 筆議會提案參與紀錄，詳見上方時間軸。'
            : '提案紀錄：暫無可查證的個別提案紀錄。'}
        </p>
        <p>表決紀錄：暫無可查證的個別表決紀錄。</p>
      </section>

      <details className="content-card career-limitations">
        <summary>資料範圍與限制</summary>
        <ul>
          {view.limitations.map((limitation) => (
            <li key={limitation}>{limitation}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}
