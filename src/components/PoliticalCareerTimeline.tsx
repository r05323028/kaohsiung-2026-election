import type {
  PolicyCareerActivityLink,
  PolicyCareerHistoricalRecord,
} from '../data/policy-career';
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

const precisionLabels: Record<string, string> = {
  day: '',
  month: '（僅載明月份）',
  year: '（僅載明年份）',
  undated: '（日期未載明）',
};

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
    <a
      className="source-chip"
      href={source.url}
      target="_blank"
      rel="noreferrer"
    >
      {source.publisher}・{sourceTierLabels[source.tier] ?? source.tier}
    </a>
  );
}

/** Chips that point at the promise a documented action relates to. */
function RelatedPolicyChips({
  links,
  onOpenPolicy,
}: {
  links: { policyId: string; title: string }[];
  onOpenPolicy?: ((policyId: string) => void) | undefined;
}) {
  if (links.length === 0) return null;
  return (
    <p className="career-timeline__links">
      <strong>相關政策主張：</strong>
      {links.map((link) =>
        onOpenPolicy ? (
          <button
            key={link.policyId}
            type="button"
            className="source-chip"
            onClick={() => onOpenPolicy(link.policyId)}
          >
            {link.title}
          </button>
        ) : (
          <span className="source-chip" key={link.policyId}>
            {link.title}
          </span>
        ),
      )}
    </p>
  );
}

/**
 * Historical actions that were published as policy records and moved here.
 *
 * They are kept in their own block because most of them carry no verified day,
 * and because the reader should be able to tell a council record from an
 * action that only a media report documents.
 */
export function PolicyDerivedCareerSection({
  records,
  onOpenPolicy,
}: {
  records: PolicyCareerHistoricalRecord[];
  onOpenPolicy?: ((policyId: string) => void) | undefined;
}) {
  if (records.length === 0) return null;
  return (
    <section className="content-card" data-testid="policy-derived-career">
      <h4>由政策資料移入的歷史行動</h4>
      <p>
        以下紀錄原先列在政策主張頁，經核對後屬於已發生的政治行動，因此移入本頁；
        其日期多半未見於報導，未逕行推定。
      </p>
      <ol className="timeline">
        {records.map((record) => (
          <li key={record.policyId} id={`career-${record.policyId}`}>
            <time dateTime={record.date ?? undefined}>
              {record.date ?? '日期未載明'}
              {precisionLabels[record.datePrecision] ?? ''}
            </time>
            <div className="content-card__meta">
              <span className="status-chip">
                {categoryLabels[record.category] ?? record.category}
              </span>
              <span>
                {actionLabels[record.actionType] ?? record.actionType}
              </span>
            </div>
            <strong>{record.title}</strong>
            <p>{record.description}</p>
            <p>
              <strong>角色：</strong>
              {record.role}
            </p>
            <p>
              <strong>結果：</strong>
              {outcomeLabels[record.outcomeStatus] ?? record.outcomeStatus}
              {record.outcome ? '｜' + record.outcome : ''}
            </p>
            <p className="career-timeline__basis">
              <strong>日期依據：</strong>
              {record.dateBasis}
            </p>
            <div className="content-card__meta">
              {record.sourceUrls.map((url) => (
                <a
                  key={url}
                  className="source-chip"
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                >
                  來源
                </a>
              ))}
            </div>
            <RelatedPolicyChips
              links={record.relatedPolicies}
              onOpenPolicy={onOpenPolicy}
            />
          </li>
        ))}
      </ol>
    </section>
  );
}

export function PoliticalCareerTimeline({
  view,
  candidateName,
  commitmentCount,
  relatedPolicies,
  onOpenPolicies,
  onOpenPolicy,
}: {
  view: PoliticalCareerView;
  candidateName: string;
  /** How many future commitments live on the Policy tab. */
  commitmentCount: number;
  relatedPolicies: Record<string, PolicyCareerActivityLink[]>;
  onOpenPolicies?: (() => void) | undefined;
  onOpenPolicy?: ((policyId: string) => void) | undefined;
}) {
  const { activities, officeTerms, coverage } = view;
  const proposalCount = activities.filter(
    (activity) => activity.category === 'council-proposal',
  ).length;
  const years = [
    ...new Set(activities.map((activity) => yearOf(activity.date))),
  ].sort();

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
                  {term.termNumbers.length > 0 &&
                  term.termLabel.startsWith('第')
                    ? ''
                    : '（屆次未載明）'}
                  ｜{term.status === 'current' ? '現任' : '曾任'}
                </span>
                {term.startDate || term.endDate ? (
                  <span>
                    {term.startDate ?? '起日未載明'}—
                    {term.endDate ?? '迄日未載明'}
                  </span>
                ) : (
                  <span>起訖日期未載明</span>
                )}
                <span className="content-card__meta">
                  {term.sourceIds.map((sourceId) => (
                    <TimelineSource
                      key={sourceId}
                      view={view}
                      sourceId={sourceId}
                    />
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
          已檢索 {coverage.searchedSourceIds.length}{' '}
          個來源；未載明日期者不列入。
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
                      <li
                        key={activity.id}
                        id={`career-${activity.id}`}
                        data-category={activity.category}
                      >
                        <time dateTime={activity.date}>{activity.date}</time>
                        <div className="content-card__meta">
                          <span className="status-chip">
                            {categoryLabels[activity.category] ??
                              activity.category}
                          </span>
                          <span>
                            {actionLabels[activity.actionType] ??
                              activity.actionType}
                          </span>
                          {activity.sessionLabel ? (
                            <span>{activity.sessionLabel}</span>
                          ) : null}
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
                          {outcomeLabels[activity.outcomeStatus] ??
                            activity.outcomeStatus}
                          {activity.outcome ? '｜' + activity.outcome : ''}
                        </p>
                        <p className="career-timeline__basis">
                          <strong>歸屬依據：</strong>
                          {activity.identityBasis}
                        </p>
                        <div className="content-card__meta">
                          <TimelineSource
                            view={view}
                            sourceId={activity.sourceId}
                          />
                        </div>
                        <RelatedPolicyChips
                          links={relatedPolicies[activity.id] ?? []}
                          onOpenPolicy={onOpenPolicy}
                        />
                      </li>
                    ))}
                </ol>
              </section>
            ))}
          </div>
        ) : (
          <p data-testid="political-career-empty">
            {coverage.note ??
              '未取得可歸屬於' +
                candidateName +
                '的從政紀錄；查無紀錄不代表未從事政治活動。'}
          </p>
        )}
      </section>

      <section className="content-card" data-testid="commitments-pointer">
        <h4>政策主張（未來承諾）</h4>
        <p>
          {commitmentCount > 0
            ? `另有 ${commitmentCount} 項競選承諾與政策目標，屬尚未發生的主張，列於「政策主張」頁，不重複列在此處。`
            : '目前未收錄可查證的競選承諾。'}
        </p>
        {commitmentCount > 0 && onOpenPolicies ? (
          <button
            type="button"
            className="source-chip"
            onClick={onOpenPolicies}
          >
            前往政策主張
          </button>
        ) : null}
      </section>

      <section className="content-card" data-testid="legislative-records">
        <h4>提案與表決紀錄</h4>
        <p>
          {proposalCount > 0
            ? '已收錄 ' +
              proposalCount +
              ' 筆議會提案參與紀錄，詳見上方時間軸。'
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
