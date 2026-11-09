import { useEffect, useState } from 'react';
import { isDemoProfile, type PublicCandidateProfile } from '../data';

export type ProfileTab = 'basic' | 'policies' | 'news' | 'career';
type NewsFilter = 'all' | 'positive' | 'negative';
type NewsClassification =
  | 'positive'
  | 'negative'
  | 'neutral'
  | 'disputed'
  | 'unclassified';

export const PROFILE_TABS: ReadonlyArray<{ id: ProfileTab; label: string }> = [
  { id: 'basic', label: '基本資料' },
  { id: 'policies', label: '政策主張' },
  { id: 'news', label: '正負面新聞' },
  { id: 'career', label: '從政歷程' },
];

const attributionLabels: Record<string, string> = {
  'candidate-statement': '候選人／競選團隊陳述',
  'documented-participation': '公開紀錄中的參與',
  'institutional-outcome': '機關紀錄的行政結果',
  'independently-corroborated': '獨立交叉佐證',
  'editorial-context': '背景脈絡',
};

const policyContextLabels: Record<string, string> = {
  'campaign-promise': '競選承諾',
  'formal-proposal': '正式政策提案',
  'legislative-proposal': '立法／議會提案',
  'implemented-policy': '已實施政策',
  commentary: '公共評論',
  'historical-position': '歷史政策立場',
  unknown: '政策性質未標示',
};

const policyStatusLabels: Record<string, string> = {
  proposed: '提案中',
  'under-review': '審議中',
  approved: '已核定',
  'under-implementation': '執行中',
  implemented: '已實施',
  completed: '已完成',
  cancelled: '已取消',
  unknown: '狀態未標示',
};

const newsClassificationLabels: Record<NewsClassification, string> = {
  positive: '正面',
  negative: '負面',
  neutral: '中性脈絡',
  disputed: '爭議／待釐清',
  unclassified: '未分類',
};

interface Props {
  candidate: PublicCandidateProfile;
  initialTab?: ProfileTab;
}

type EmptyStateKey = 'basic' | 'policies' | 'news' | 'career';

const emptyStateLabels: Record<EmptyStateKey, string> = {
  basic: '基本資料：暫無資料',
  policies: '政策主張：暫無公開政策資料',
  news: '正負面新聞：暫無公開新聞資料',
  career: '從政歷程：暫無公開履歷資料',
};

function EmptyContent({ category }: { category: EmptyStateKey }) {
  return (
    <div className="content-card">
      <h4>{emptyStateLabels[category]}</h4>
    </div>
  );
}

const biographyClaimLabels: Record<string, string> = {
  'current-position': '目前職務',
  'historical-position': '歷任職務',
  'historical-candidacy': '歷史參選',
  'elected-office': '當選公職',
  'professional-experience': '專業經驗',
  education: '教育',
  'career-event': '職涯事件',
};

function SourceChips({
  candidate,
  sourceIds,
}: {
  candidate: PublicCandidateProfile;
  sourceIds: string[];
}) {
  const sources = sourceIds
    .map((sourceId) =>
      candidate.sources.find((source) => source.id === sourceId),
    )
    .filter((source): source is PublicCandidateProfile['sources'][number] =>
      Boolean(source),
    );

  if (sources.length === 0) return null;
  return (
    <div className="content-card__meta">
      <span className="sr-only">來源：</span>
      {sources.map((source) => (
        <a
          className="source-chip"
          href={source.url}
          target="_blank"
          rel="noreferrer"
          key={source.id}
        >
          {source.publisher}
        </a>
      ))}
    </div>
  );
}

function AutomatedSourceChips({
  candidate,
  sourceIds,
}: {
  candidate: PublicCandidateProfile;
  sourceIds: string[];
}) {
  const sources = candidate.automatedPublication?.sources ?? [];
  return (
    <div className="content-card__meta">
      {sourceIds.map((sourceId) => {
        const source = sources.find((item) => item.sourceId === sourceId);
        if (!source) return null;
        return (
          <a
            className="source-chip"
            href={source.url}
            target="_blank"
            rel="noreferrer"
            key={source.sourceId}
            aria-label={`${source.publisher}：開啟來源`}
          >
            {source.publisher}
          </a>
        );
      })}
    </div>
  );
}

function ClaimEvidence({
  candidate,
  claimIds,
  evidenceIds,
}: {
  candidate: PublicCandidateProfile;
  claimIds: string[];
  evidenceIds: string[];
}) {
  const bundle = candidate.publicRecords;
  if (!bundle) return null;
  const claims = bundle.claims.filter((claim) =>
    claimIds.includes(claim.claimId),
  );
  const evidence = bundle.evidence.filter((item) =>
    evidenceIds.includes(item.evidenceId),
  );
  const sourceIds = [...new Set(evidence.map((item) => item.sourceId))];
  const attributions = [
    ...new Set(
      claims.map(
        (claim) => attributionLabels[claim.attribution] ?? claim.attribution,
      ),
    ),
  ];

  return (
    <div className="evidence-note">
      {attributions.length > 0 ? (
        <p>
          <strong>資料性質：</strong>
          {attributions.join('、')}
        </p>
      ) : null}
      {evidence.map((item) => (
        <div key={item.evidenceId}>
          <p>{item.documentLocation}</p>
          {item.quotedText ? (
            <blockquote>「{item.quotedText}」</blockquote>
          ) : null}
        </div>
      ))}
      <SourceChips candidate={candidate} sourceIds={sourceIds} />
    </div>
  );
}

function AutomatedClaimCards({
  candidate,
  categories,
  heading,
}: {
  candidate: PublicCandidateProfile;
  categories: string[];
  heading: string;
}) {
  const publication = candidate.automatedPublication;
  const claims =
    publication?.claims.filter((claim) =>
      categories.includes(claim.category),
    ) ?? [];
  if (claims.length === 0) return null;

  return (
    <div className="content-card" data-testid="automated-publication">
      <h4>{heading}</h4>
      <ul className="automated-claim-list">
        {claims.map((claim) => (
          <li key={claim.claimId}>
            <div className="content-card__meta">
              <span className="status-chip">
                {biographyClaimLabels[claim.claimType] ?? claim.claimType}
              </span>
              <span>{claim.sourcePublicationDate ?? '日期未標示'}</span>
            </div>
            <strong>{claim.title}</strong>
            <p>{claim.value}</p>
            {claim.organization ? <p>{claim.organization}</p> : null}
            <AutomatedSourceChips
              candidate={candidate}
              sourceIds={claim.sourceIds}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function BasicTab({ candidate }: { candidate: PublicCandidateProfile }) {
  const { person, candidacy, district } = candidate;
  const demo = isDemoProfile(candidate);
  const numberLabel =
    candidacy.candidateNumberStatus === 'final' && candidacy.candidateNumber
      ? String(candidacy.candidateNumber)
      : '正式號次待公告';
  const roleLabel =
    candidacy.electionType === 'mayoral'
      ? '高雄市長'
      : candidacy.electionType === 'indigenous-council'
        ? '原住民族區域／平地原住民議員'
        : '高雄市議員';

  return (
    <div className="profile-tab-content" data-profile-section="basic">
      <div className="profile-section-heading">
        <h3>基本資料</h3>
      </div>
      <dl className="info-grid">
        <div className="info-row">
          <dt>姓名</dt>
          <dd>{person.displayName}</dd>
        </div>
        <div className="info-row">
          <dt>參選職務</dt>
          <dd>{roleLabel}</dd>
        </div>
        <div className="info-row">
          <dt>登記政黨</dt>
          <dd>{candidacy.politicalParty || '暫無資料'}</dd>
        </div>
        {candidacy.cecDirectoryName ? (
          <div className="info-row">
            <dt>中選會列名</dt>
            <dd>{candidacy.cecDirectoryName}</dd>
          </div>
        ) : null}
        <div className="info-row">
          <dt>選舉區</dt>
          <dd>
            {district.name}（{district.districtLabel}）
          </dd>
        </div>
        <div className="info-row">
          <dt>目前職務</dt>
          <dd>{candidacy.currentPosition || '暫無資料'}</dd>
        </div>
        <div className="info-row">
          <dt>出生日期</dt>
          <dd>{candidacy.birthDate ?? '暫無資料'}</dd>
        </div>
        <div className="info-row">
          <dt>選舉年度</dt>
          <dd>{candidacy.electionYear}</dd>
        </div>
        <div className="info-row">
          <dt>正式號次</dt>
          <dd>{numberLabel}</dd>
        </div>
      </dl>
      <div className="content-card">
        <h4>人物摘要</h4>
        <p>{person.summary || '暫無資料'}</p>
        <SourceChips
          candidate={candidate}
          sourceIds={candidate.sources.map((source) => source.id)}
        />
      </div>
      <div className="content-card">
        <h4>教育與專業背景</h4>
        <p>
          <strong>教育：</strong>
          {person.education.length ? person.education.join('、') : '暫無資料'}
        </p>
        <p>
          <strong>專業經歷：</strong>
          {person.professionalExperience.length
            ? person.professionalExperience.join('；')
            : '暫無資料'}
        </p>
        <SourceChips
          candidate={candidate}
          sourceIds={candidate.sources.map((source) => source.id)}
        />
      </div>
      <div className="content-card">
        <h4>基本資料來源</h4>
        <SourceChips
          candidate={candidate}
          sourceIds={candidate.sources.map((source) => source.id)}
        />
      </div>
      {demo ? <p className="info-note">虛構示範資料。</p> : null}
    </div>
  );
}

function PublicPolicyCards({
  candidate,
}: {
  candidate: PublicCandidateProfile;
}) {
  const policies = candidate.publicRecords?.policies ?? [];
  return (
    <>
      {policies.map((policy) => (
        <article className="content-card" key={policy.id}>
          <div className="content-card__meta">
            <span className="status-chip">{policy.category}</span>
            <span>{policy.publicationDate ?? '日期未標示'}</span>
            <span>
              {policyContextLabels[policy.policyContext ?? 'unknown']}
            </span>
          </div>
          <h4>{policy.title}</h4>
          <p>
            <strong>原始陳述：</strong>
            {policy.originalStatement}
          </p>
          {policy.neutralSummary ? (
            <p>
              <strong>中性摘要：</strong>
              {policy.neutralSummary}
            </p>
          ) : null}
          <p>
            <strong>政策狀態：</strong>
            {policyStatusLabels[policy.policyStatus ?? 'unknown']}
          </p>
          {policy.geographicScope ? (
            <p>
              <strong>適用範圍：</strong>
              {policy.geographicScope}
            </p>
          ) : null}
          <ClaimEvidence
            candidate={candidate}
            claimIds={policy.claimIds}
            evidenceIds={policy.evidenceIds}
          />
        </article>
      ))}
    </>
  );
}

function PoliciesTab({ candidate }: { candidate: PublicCandidateProfile }) {
  const publicPolicies = candidate.publicRecords?.policies ?? [];

  return (
    <div className="profile-tab-content" data-profile-section="policies">
      <div className="profile-section-heading">
        <h3>政策主張</h3>
        <p>政策性質與狀態依來源標示。</p>
      </div>
      <AutomatedClaimCards
        candidate={candidate}
        categories={['policies']}
        heading="歷史政策資料"
      />
      {publicPolicies.length > 0 ? (
        <PublicPolicyCards candidate={candidate} />
      ) : candidate.policies.length > 0 ? (
        candidate.policies.map((policy) => (
          <article className="content-card" key={policy.id}>
            <div className="content-card__meta">
              <span className="status-chip">{policy.category}</span>
              <span>候選人／示範資料陳述</span>
              <span>{policy.publicationDate}</span>
            </div>
            <h4>{policy.title}</h4>
            <p>
              <strong>候選人原文：</strong>
              {policy.originalStatement}
            </p>
            {policy.plainLanguageSummary ? (
              <p>
                <strong>摘要：</strong>
                {policy.plainLanguageSummary}
              </p>
            ) : null}
            <p>
              <strong>政策狀態：</strong>
              來源未標示
            </p>
            <SourceChips candidate={candidate} sourceIds={policy.sourceIds} />
          </article>
        ))
      ) : (
        <EmptyContent category="policies" />
      )}
    </div>
  );
}

function PublicActivityCards({
  candidate,
}: {
  candidate: PublicCandidateProfile;
}) {
  const activities = candidate.publicRecords?.activities ?? [];
  return (
    <>
      {activities.map((activity) => (
        <article className="content-card" key={activity.id}>
          <div className="content-card__meta">
            <span className="status-chip">
              {activity.activityType === 'legislative-proposal'
                ? '立法／議會提案'
                : activity.activityType === 'council-questioning'
                  ? '質詢與監督'
                  : activity.activityType === 'government-project'
                    ? '行政／政府計畫'
                    : '公開活動'}
            </span>
            <span>{activity.eventDate}</span>
          </div>
          <h4>{activity.title}</h4>
          <p>{activity.description}</p>
          <p>
            <strong>組織／職務：</strong>
            {activity.organization}・{activity.role}
          </p>
          <p>
            <strong>紀錄性質：</strong>
            {attributionLabels[activity.attribution] ?? activity.attribution}
          </p>
          {activity.documentedOutcome ? (
            <p>
              <strong>可查證結果：</strong>
              {activity.documentedOutcome}
            </p>
          ) : (
            <p>
              <strong>結果狀態：</strong>來源未標示。
            </p>
          )}
          <ClaimEvidence
            candidate={candidate}
            claimIds={activity.claimIds}
            evidenceIds={activity.evidenceIds}
          />
        </article>
      ))}
    </>
  );
}

function LegacyCareerCards({
  candidate,
}: {
  candidate: PublicCandidateProfile;
}) {
  const positionCards = candidate.positions.map((position) => (
    <article className="content-card" key={position.id}>
      <div className="content-card__meta">
        <span className="status-chip">歷任職務</span>
      </div>
      <h4>{position.title}</h4>
      <p>
        {position.organization}・{position.startDate}—
        {position.endDate ?? '至今'}
      </p>
      <SourceChips
        candidate={candidate}
        sourceIds={candidate.sources.map((source) => source.id)}
      />
    </article>
  ));
  const timelineCards = candidate.timeline.map((event) => (
    <article className="content-card" key={event.id}>
      <div className="content-card__meta">
        <span className="status-chip">{event.category}</span>
        <span>{event.date}</span>
      </div>
      <h4>{event.title}</h4>
      <p>{event.description}</p>
      <SourceChips candidate={candidate} sourceIds={event.sourceIds} />
    </article>
  ));
  return [...positionCards, ...timelineCards];
}

function PublicPositionCards({
  candidate,
}: {
  candidate: PublicCandidateProfile;
}) {
  const positions = candidate.publicRecords?.positions ?? [];
  return (
    <>
      {positions.map((position) => (
        <article className="content-card" key={position.id}>
          <div className="content-card__meta">
            <span className="status-chip">公共職務</span>
            <span>
              {position.currentStatus === 'current'
                ? '目前身分'
                : '歷史／狀態未定'}
            </span>
          </div>
          <h4>{position.title}</h4>
          <p>{position.organization}</p>
          <p>
            {position.startDate ?? '日期未標示'}—
            {position.endDate ?? '日期未標示'}
          </p>
          <ClaimEvidence
            candidate={candidate}
            claimIds={position.claimIds}
            evidenceIds={position.evidenceIds}
          />
        </article>
      ))}
    </>
  );
}

function CareerTab({ candidate }: { candidate: PublicCandidateProfile }) {
  const publicActivities = candidate.publicRecords?.activities ?? [];
  const publicPositions = candidate.publicRecords?.positions ?? [];
  const legacyCards = LegacyCareerCards({ candidate });
  const proposalCount = publicActivities.filter(
    (activity) => activity.activityType === 'legislative-proposal',
  ).length;
  const hasCareer =
    publicActivities.length > 0 ||
    publicPositions.length > 0 ||
    legacyCards.length > 0 ||
    (candidate.biography?.claims.length ?? 0) > 0 ||
    (candidate.automatedPublication?.claims.length ?? 0) > 0;

  return (
    <div className="profile-tab-content" data-profile-section="career">
      <div className="profile-section-heading">
        <h3>從政歷程</h3>
        <p>列出有來源的職務與公共活動。</p>
      </div>
      <AutomatedClaimCards
        candidate={candidate}
        categories={['basic-biography', 'timeline']}
        heading="歷史履歷資料"
      />
      {candidate.biography?.claims.length ? (
        <div className="content-card" data-testid="biography-timeline">
          <h4>履歷事件</h4>
          <ol className="timeline">
            {candidate.biography.claims.map((claim) => (
              <li key={claim.claimId}>
                <time>{claim.validFrom ?? '日期未標示'}</time>
                <strong>
                  {biographyClaimLabels[claim.claimType] ?? claim.claimType}・
                  {claim.title}
                </strong>
                <p>{claim.value}</p>
                {claim.organization ? <p>{claim.organization}</p> : null}
                <SourceChips
                  candidate={candidate}
                  sourceIds={claim.sourceIds}
                />
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      {publicPositions.length > 0 ? (
        <PublicPositionCards candidate={candidate} />
      ) : null}
      {publicActivities.length > 0 ? (
        <PublicActivityCards candidate={candidate} />
      ) : null}
      {legacyCards.length > 0 ? legacyCards : null}
      <section className="content-card" data-testid="legislative-records">
        <div>
          <h4>提案紀錄</h4>
          <p>
            {proposalCount > 0
              ? '已公開 ' + proposalCount + ' 筆提案紀錄'
              : '提案紀錄：暫無公開提案紀錄'}
          </p>
        </div>
        <div>
          <h4>表決紀錄</h4>
          <p>表決紀錄：暫無可查證的個別表決紀錄</p>
        </div>
      </section>
      {!hasCareer ? <EmptyContent category="career" /> : null}
    </div>
  );
}

function NewsEmpty() {
  return (
    <div className="content-card">
      <h4>正負面新聞：暫無公開新聞資料</h4>
    </div>
  );
}

function getNewsClassification(article: {
  classification?: NewsClassification | undefined;
}): NewsClassification {
  return article.classification ?? 'unclassified';
}

function PublicNewsCards({
  candidate,
  filter,
}: {
  candidate: PublicCandidateProfile;
  filter: NewsFilter;
}) {
  const news = (candidate.publicRecords?.news ?? []).filter((article) => {
    const classification = getNewsClassification(article);
    return filter === 'all' || classification === filter;
  });
  return (
    <>
      {news.map((article) => {
        const classification = getNewsClassification(article);
        return (
          <article className="content-card" key={article.id}>
            <div className="content-card__meta">
              <span className="status-chip">
                {newsClassificationLabels[classification]}
              </span>
              <span>{article.publicationDate}</span>
              <span>{article.topicTags.join('・')}</span>
            </div>
            <h4>
              <a href={article.originalUrl} target="_blank" rel="noreferrer">
                {article.headline}
              </a>
            </h4>
            <p>
              {article.publisher}・
              {article.contentType === 'institutional-update'
                ? '機關性更新'
                : article.contentType}
            </p>
            <p>{article.editorialSummary ?? '摘要未提供'}</p>
            <p>
              <strong>分類依據：</strong>
              {article.classificationRationale ?? '未標示'}
            </p>
            <p>
              <strong>事件日期：</strong>
              {article.eventDate ?? '未標示'}
            </p>
            <p>
              <strong>後續狀態：</strong>
              {article.latestStatus ?? '未標示'}
            </p>
            <ClaimEvidence
              candidate={candidate}
              claimIds={article.claimIds}
              evidenceIds={article.evidenceIds}
            />
          </article>
        );
      })}
    </>
  );
}

function LegacyNewsCards({
  candidate,
  filter,
}: {
  candidate: PublicCandidateProfile;
  filter: NewsFilter;
}) {
  const news = filter === 'all' ? candidate.news : [];
  return (
    <>
      {news.map((article) => (
        <article className="content-card" key={article.id}>
          <div className="content-card__meta">
            <span className="status-chip">未分類</span>
            <span>{article.publicationDate}</span>
            <span>{article.topic}</span>
          </div>
          <h4>
            <a href={article.url} target="_blank" rel="noreferrer">
              {article.title}
            </a>
          </h4>
          <p>{article.publisher}</p>
          <p>{article.editorialSummary ?? '摘要未提供'}</p>
          <p>
            <strong>分類依據：</strong>
            未標示
          </p>
          <SourceChips candidate={candidate} sourceIds={article.sourceIds} />
        </article>
      ))}
    </>
  );
}

function NewsTab({ candidate }: { candidate: PublicCandidateProfile }) {
  const [filter, setFilter] = useState<NewsFilter>('all');
  const publicNews = candidate.publicRecords?.news ?? [];
  const legacyNews = candidate.news;
  const visibleCount =
    filter === 'all'
      ? publicNews.length + legacyNews.length
      : publicNews.filter(
          (article) => getNewsClassification(article) === filter,
        ).length;

  return (
    <div className="profile-tab-content" data-profile-section="news">
      <div className="profile-section-heading">
        <h3>正負面新聞</h3>
        <p>新聞依分類呈現，附來源與日期。</p>
      </div>
      <fieldset className="content-card news-filter">
        <legend className="sr-only">新聞分類篩選</legend>
        {(['all', 'positive', 'negative'] as const).map((option) => (
          <button
            className="tab-button"
            data-testid={`news-filter-${option}`}
            key={option}
            type="button"
            aria-pressed={filter === option}
            onClick={() => setFilter(option)}
          >
            {option === 'all'
              ? '全部'
              : option === 'positive'
                ? '正面'
                : '負面'}
          </button>
        ))}
        <span className="info-note">
          目前顯示 {visibleCount} 筆；未分類紀錄只在「全部」中呈現。
        </span>
      </fieldset>
      <AutomatedClaimCards
        candidate={candidate}
        categories={['news']}
        heading="新聞資料"
      />
      {visibleCount > 0 ? (
        <>
          <PublicNewsCards candidate={candidate} filter={filter} />
          <LegacyNewsCards candidate={candidate} filter={filter} />
        </>
      ) : (
        <NewsEmpty />
      )}
    </div>
  );
}

export default function ProfileTabs({
  candidate,
  initialTab = 'basic',
}: Props) {
  const [activeTab, setActiveTab] = useState<ProfileTab>(initialTab);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  const renderTab = (tab: ProfileTab) => {
    switch (tab) {
      case 'policies':
        return <PoliciesTab candidate={candidate} />;
      case 'news':
        return <NewsTab candidate={candidate} />;
      case 'career':
        return <CareerTab candidate={candidate} />;
      default:
        return <BasicTab candidate={candidate} />;
    }
  };

  return (
    <div
      className="profile-tabs"
      data-testid="profile-tabs"
      data-hydrated={hydrated ? 'true' : 'false'}
    >
      <div
        className="profile-tabs__list"
        role="tablist"
        aria-label="候選人資訊分類"
      >
        {PROFILE_TABS.map((tab) => (
          <button
            className="tab-button"
            key={tab.id}
            id={`tab-${candidate.candidacy.slug}-${tab.id}`}
            role="tab"
            type="button"
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${candidate.candidacy.slug}-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {PROFILE_TABS.map((tab) => (
        <div
          className="profile-tabpanel"
          key={tab.id}
          id={`panel-${candidate.candidacy.slug}-${tab.id}`}
          role="tabpanel"
          aria-labelledby={`tab-${candidate.candidacy.slug}-${tab.id}`}
          hidden={activeTab !== tab.id}
        >
          {renderTab(tab.id)}
        </div>
      ))}
    </div>
  );
}
