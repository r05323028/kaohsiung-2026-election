import type {
  PolicyCareerActivityLink,
  PolicyCareerHistoricalRecord,
} from '../data/policy-career';
import type {
  GovernmentProject,
  IndividualVote,
  LegislativeProposal,
  OfficeTerm,
  PoliticalCareerView,
  VotingRecord,
} from '../data/political-career';

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

const positionTypeLabels: Record<string, string> = {
  'elected-office': '民選公職',
  'government-employment': '政府任用',
  'legislative-office': '立法機關',
  'council-office': '議會',
};

const employmentTypeLabels: Record<string, string> = {
  elected: '民選',
  appointed: '任命',
  'civil-service': '公務人員',
  contract: '約聘',
  unknown: '進用方式未載明',
};

const projectRoleLabels: Record<string, string> = {
  initiated: '發起',
  managed: '主責執行',
  participated: '參與',
  oversaw: '督導',
};

const projectStatusLabels: Record<string, string> = {
  completed: '已完成',
  ongoing: '持續進行',
  planned: '規劃中',
  'not-implemented': '未執行',
  unknown: '狀態未載明',
};

const proposerRoleLabels: Record<string, string> = {
  primary: '主提案',
  'co-proposer': '共同提案',
  'co-sponsor': '連署',
};

const voteTypeLabels: Record<string, string> = {
  'roll-call': '記名表決',
  voice: '口頭表決',
  other: '其他表決',
};

const individualVoteLabels: Record<IndividualVote, string> = {
  for: '贊成',
  against: '反對',
  abstain: '棄權',
  absent: '缺席',
  'not-recorded': '未列入記名名單',
  unknown: '未個別記錄',
};

type DatePrecision = 'day' | 'month' | 'year' | 'term' | null;

const precisionLabels: Record<string, string> = {
  day: '',
  month: '（僅載明月份）',
  year: '（僅載明年份）',
  term: '（僅載明屆次）',
  undated: '（日期未載明）',
};

function formatPartialDate(date: string, precision: DatePrecision): string {
  return date + (precision ? (precisionLabels[precision] ?? '') : '');
}

const officeStatusLabels: Record<OfficeTerm['status'], string> = {
  current: '現任',
  former: '曾任',
  unknown: '狀態未載明',
};

function termPeriod(term: OfficeTerm): string {
  if (!term.startDate && !term.endDate) return '起訖日期未載明';
  const start = term.startDate
    ? formatPartialDate(term.startDate, term.startDatePrecision)
    : '起日未載明';
  const end = term.endDate
    ? formatPartialDate(term.endDate, term.endDatePrecision)
    : term.status === 'current'
      ? '迄今'
      : '迄日未載明';
  return start + '—' + end;
}

function projectPeriod(project: GovernmentProject): string {
  if (project.startDate && project.endDate) {
    const start = formatPartialDate(
      project.startDate,
      project.startDatePrecision,
    );
    const end = formatPartialDate(project.endDate, project.endDatePrecision);
    return start === end ? start : start + '—' + end;
  }
  if (project.startDate) {
    return formatPartialDate(project.startDate, project.startDatePrecision);
  }
  if (project.endDate) {
    return formatPartialDate(project.endDate, project.endDatePrecision);
  }
  return project.positionPeriod ?? '期間未載明';
}

function voteTally(vote: VotingRecord): string | null {
  if (!vote.tally) return null;
  const { attending, for: forCount, against, abstain } = vote.tally;
  const parts: string[] = [];
  if (attending !== null) parts.push('出席 ' + String(attending));
  if (forCount !== null) parts.push('贊成 ' + String(forCount));
  if (against !== null) parts.push('反對 ' + String(against));
  if (abstain !== null) parts.push('棄權 ' + String(abstain));
  return parts.length > 0 ? parts.join('・') : null;
}

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
      title={source.title}
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

function ProjectRecord({
  project,
  view,
}: {
  project: GovernmentProject;
  view: PoliticalCareerView;
}) {
  return (
    <li className="career-record" data-testid="career-project">
      <div className="content-card__meta">
        <span className="status-chip">政府專案</span>
        <span>{projectPeriod(project)}</span>
        <span>{projectRoleLabels[project.roleType] ?? project.roleType}</span>
        <span
          className={
            'status-chip career-record__status career-record__status--' +
            project.status
          }
        >
          {projectStatusLabels[project.status] ?? project.status}
        </span>
      </div>
      <strong>{project.title}</strong>
      <p>{project.agency}</p>
      {project.outcome ? <p>{project.outcome}</p> : null}
      <div className="content-card__meta">
        <TimelineSource view={view} sourceId={project.sourceId} />
      </div>
    </li>
  );
}

function ProposalRecord({
  proposal,
  view,
}: {
  proposal: LegislativeProposal;
  view: PoliticalCareerView;
}) {
  const date = proposal.latestProgressDate ?? proposal.proposedAt;
  return (
    <li className="career-record" data-testid="career-proposal">
      <div className="content-card__meta">
        <span className="status-chip">立法提案</span>
        <span>
          {date
            ? (proposal.latestProgressDate ? '進度 ' : '提案 ') + date
            : '日期未載明'}
        </span>
        <span>
          {proposerRoleLabels[proposal.proposerRole] ?? proposal.proposerRole}
        </span>
        <span className="status-chip">{proposal.legislativeStatus}</span>
      </div>
      <strong>{proposal.title}</strong>
      <p>
        {proposal.institution}
        {proposal.billNumber ? '・' + proposal.billNumber : ''}
      </p>
      {proposal.laws.length > 0 ? (
        <p>
          <strong>涉及法律：</strong>
          {proposal.laws.join('、')}
        </p>
      ) : null}
      <div className="content-card__meta">
        <TimelineSource view={view} sourceId={proposal.sourceId} />
      </div>
    </li>
  );
}

function VoteRecord({
  vote,
  view,
}: {
  vote: VotingRecord;
  view: PoliticalCareerView;
}) {
  const tally = voteTally(vote);
  return (
    <li className="career-record" data-testid="career-vote">
      <div className="content-card__meta">
        <span className="status-chip">表決</span>
        <span>{vote.votedAt}</span>
        <span>{voteTypeLabels[vote.voteType] ?? vote.voteType}</span>
      </div>
      <strong>{vote.motionTitle}</strong>
      <p className="career-record__vote">
        <strong>個人表決：</strong>
        <span
          className={
            'vote-chip vote-chip--' + vote.individualVote.replace(/-/g, '')
          }
        >
          {individualVoteLabels[vote.individualVote]}
        </span>
        {vote.voteType === 'roll-call' ? null : (
          <span>（未產生個別表決紀錄）</span>
        )}
      </p>
      {tally ? <p>{tally}</p> : null}
      <div className="content-card__meta">
        <TimelineSource view={view} sourceId={vote.sourceId} />
      </div>
    </li>
  );
}

type ServiceRecords = {
  projects: GovernmentProject[];
  proposals: LegislativeProposal[];
  votes: VotingRecord[];
  projectTotal: number;
  proposalTotal: number;
  voteTotal: number;
};

function ServiceRecordList({
  records,
  view,
}: {
  records: ServiceRecords;
  view: PoliticalCareerView;
}) {
  const hidden = (total: number, shown: number): string | null =>
    total > shown ? `另有 ${String(total - shown)} 筆紀錄未列於本頁。` : null;
  return (
    <div className="career-term__records">
      {records.projects.length > 0 ? (
        <section>
          <h6>政府專案（{records.projectTotal}）</h6>
          <ol className="career-term__list">
            {records.projects.map((project) => (
              <ProjectRecord key={project.id} project={project} view={view} />
            ))}
          </ol>
          {hidden(records.projectTotal, records.projects.length) ? (
            <p className="career-term__more">
              {hidden(records.projectTotal, records.projects.length)}
            </p>
          ) : null}
        </section>
      ) : null}
      {records.proposals.length > 0 ? (
        <section>
          <h6>立法提案（{records.proposalTotal}）</h6>
          <ol className="career-term__list">
            {records.proposals.map((proposal) => (
              <ProposalRecord
                key={proposal.id}
                proposal={proposal}
                view={view}
              />
            ))}
          </ol>
          {hidden(records.proposalTotal, records.proposals.length) ? (
            <p className="career-term__more">
              {hidden(records.proposalTotal, records.proposals.length)}
            </p>
          ) : null}
        </section>
      ) : null}
      {records.votes.length > 0 ? (
        <section>
          <h6>表決紀錄（{records.voteTotal}）</h6>
          <ol className="career-term__list">
            {records.votes.map((vote) => (
              <VoteRecord key={vote.id} vote={vote} view={view} />
            ))}
          </ol>
          {hidden(records.voteTotal, records.votes.length) ? (
            <p className="career-term__more">
              {hidden(records.voteTotal, records.votes.length)}
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function CareerSummary({ view }: { view: PoliticalCareerView }) {
  const items: { label: string; value: number }[] = [
    { label: '公職任期', value: view.officeTerms.length },
    { label: '政府專案', value: view.coverage.governmentProjectCount },
    { label: '立法提案', value: view.proposalTotal },
    { label: '表決紀錄', value: view.votingTotal },
    { label: '議會活動', value: view.activities.length },
  ].filter((item) => item.value > 0);
  if (items.length === 0) return null;
  return (
    <ul className="career-summary">
      {items.map((item) => (
        <li key={item.label}>
          <strong>{item.value}</strong>
          <span>{item.label}</span>
        </li>
      ))}
    </ul>
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
  const { activities, officeTerms, coverage, recordsWithoutPosition } = view;
  const hasAnyRecord =
    officeTerms.length > 0 ||
    activities.length > 0 ||
    view.proposalTotal > 0 ||
    view.votingTotal > 0 ||
    coverage.governmentProjectCount > 0;
  const years = [
    ...new Set(activities.map((activity) => yearOf(activity.date))),
  ].sort();
  const orphanTotal =
    recordsWithoutPosition.projectTotal +
    recordsWithoutPosition.proposalTotal +
    recordsWithoutPosition.voteTotal;

  if (!hasAnyRecord) {
    return (
      <section
        data-testid="political-career-timeline"
        aria-label={`${candidateName}的從政歷程`}
      >
        <section className="content-card career-empty">
          <p data-testid="political-career-empty">
            目前尚無可查證的從政歷程資料。
          </p>
        </section>
        {commitmentCount > 0 && onOpenPolicies ? (
          <section className="content-card" data-testid="commitments-pointer">
            <h4>政策主張（未來承諾）</h4>
            <p>
              另有 {commitmentCount}{' '}
              項競選承諾與政策目標，屬尚未發生的主張，列於「政策主張」頁。
            </p>
            <button
              type="button"
              className="source-chip"
              onClick={onOpenPolicies}
            >
              前往政策主張
            </button>
          </section>
        ) : null}
        <details className="content-card career-limitations">
          <summary>資料範圍與限制</summary>
          <ul>
            {view.limitations.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
        </details>
      </section>
    );
  }

  return (
    <section
      data-testid="political-career-timeline"
      aria-label={`${candidateName}的從政歷程`}
    >
      <CareerSummary view={view} />

      {officeTerms.length > 0 ? (
        <section className="content-card career-timeline-block">
          <h4>從政時間軸</h4>
          <p>由新到舊排列；各項專案、提案與表決紀錄列於對應任期之下。</p>
          <ol className="career-terms">
            {officeTerms.map((term) => {
              const records = view.recordsByPosition[term.id];
              const hasRecords =
                records !== undefined &&
                records.projectTotal +
                  records.proposalTotal +
                  records.voteTotal >
                  0;
              return (
                <li key={term.id} className="career-term">
                  <header className="career-term__header">
                    <div className="career-term__heading">
                      <h5>{term.officeTitle}</h5>
                      <span>{term.organization}</span>
                    </div>
                    <div className="content-card__meta">
                      <span className="status-chip">
                        {positionTypeLabels[term.positionType] ??
                          term.positionType}
                      </span>
                      {term.employmentType ? (
                        <span>
                          {employmentTypeLabels[term.employmentType] ??
                            term.employmentType}
                        </span>
                      ) : null}
                      <span>{term.termLabel}</span>
                      <span>{termPeriod(term)}</span>
                      <span
                        className={
                          term.status === 'current'
                            ? 'status-chip status-chip--current'
                            : 'status-chip'
                        }
                      >
                        {officeStatusLabels[term.status]}
                      </span>
                    </div>
                    <div className="content-card__meta">
                      {term.sourceIds.map((sourceId) => (
                        <TimelineSource
                          key={sourceId}
                          view={view}
                          sourceId={sourceId}
                        />
                      ))}
                    </div>
                  </header>
                  {hasRecords && records ? (
                    <ServiceRecordList records={records} view={view} />
                  ) : null}
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}

      {orphanTotal > 0 ? (
        <section className="content-card">
          <h4>其他已查證紀錄</h4>
          <ServiceRecordList records={recordsWithoutPosition} view={view} />
        </section>
      ) : null}

      {activities.length > 0 ? (
        <section className="content-card career-timeline-block">
          <h4>議會與市政活動</h4>
          <p>
            議員服務政見頁、議會新聞稿與機關文件中可逐字核對的質詢與參與紀錄。
            已檢索 {coverage.searchedSourceIds.length}{' '}
            個來源；未載明日期者不列入。
          </p>
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
        </section>
      ) : null}

      {commitmentCount > 0 ? (
        <section className="content-card" data-testid="commitments-pointer">
          <h4>政策主張（未來承諾）</h4>
          <p>
            另有 {commitmentCount}{' '}
            項競選承諾與政策目標，屬尚未發生的主張，列於「政策主張」頁，不重複列在此處。
          </p>
          {onOpenPolicies ? (
            <button
              type="button"
              className="source-chip"
              onClick={onOpenPolicies}
            >
              前往政策主張
            </button>
          ) : null}
        </section>
      ) : null}

      <details className="content-card career-limitations">
        <summary>資料範圍與限制</summary>
        <ul>
          {view.limitations.map((limitation) => (
            <li key={limitation}>{limitation}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}
