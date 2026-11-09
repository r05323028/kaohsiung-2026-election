import { useEffect, useState } from 'react';
import { type CandidateProfile, isDemoProfile } from '../data';
import type { PublicRecordBundle } from '../data/public-records/schema';
import { withBase } from '../utils/paths';

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
  'editorial-context': '編輯脈絡',
};

const reviewLabels: Record<string, string> = {
  approved: '已核准',
  'pending-review': '待人工審查',
  rejected: '不予採用',
  'needs-clarification': '需要釐清',
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
  candidate: CandidateProfile;
  initialTab?: ProfileTab;
}

function EmptyContent({ category, demo }: { category: string; demo: boolean }) {
  return (
    <div className="content-card">
      <h4>
        {demo ? `${category}（示範未填寫）` : `目前尚無已查證的${category}資料`}
      </h4>
      <p>
        {demo
          ? '這個虛構示範沒有填寫此分類；缺少資料不表示事件不存在。'
          : '目前的官方核准切片尚未包含此分類。缺少資料不表示事件不存在，後續資料須經來源核對與人工審查。'}
      </p>
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
  candidate: CandidateProfile;
  sourceIds: string[];
}) {
  const sources = sourceIds
    .map((sourceId) =>
      candidate.sources.find((source) => source.id === sourceId),
    )
    .filter((source): source is CandidateProfile['sources'][number] =>
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
          {source.publisher}・{source.id}
        </a>
      ))}
    </div>
  );
}

function AutomatedSourceChips({
  candidate,
  sourceIds,
}: {
  candidate: CandidateProfile;
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
          >
            {source.publisher}・來源已驗證
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
  candidate: CandidateProfile;
  claimIds: string[];
  evidenceIds: string[];
}) {
  const bundle: PublicRecordBundle | undefined = candidate.publicRecords;
  if (!bundle) return null;
  const claims = bundle.claims.filter((claim) =>
    claimIds.includes(claim.claimId),
  );
  const evidence = bundle.evidence.filter((item) =>
    evidenceIds.includes(item.evidenceId),
  );
  const sourceIds = [...new Set(evidence.map((item) => item.sourceId))];

  return (
    <div className="evidence-note">
      <p>
        <strong>資料性質：</strong>
        {[
          ...new Set(
            claims.map(
              (claim) =>
                attributionLabels[claim.attribution] ?? claim.attribution,
            ),
          ),
        ].join('、') || '來源紀錄'}
      </p>
      <p>
        <strong>查核狀態：</strong>
        {claims
          .map(
            (claim) =>
              `${claim.verificationStatus}／${reviewLabels[claim.reviewStatus] ?? claim.reviewStatus}`,
          )
          .join('；') || '待人工審查'}
      </p>
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

function BiographyStatusCard({ candidate }: { candidate: CandidateProfile }) {
  const biography = candidate.biography;
  if (!biography) return null;
  return (
    <div className="content-card" data-testid="biography-status">
      <h4>履歷資料狀態</h4>
      <p>
        {biography.status === 'approved'
          ? '以下僅列出已完成身分核對、人工與編輯核准的來源資料。'
          : '目前尚無可公開的已核准履歷主張；已取得的資料仍待人工與編輯核對，空白不代表不存在。'}
      </p>
      <p>{biography.note}</p>
    </div>
  );
}

function AutomatedClaimCards({
  candidate,
  categories,
  heading,
}: {
  candidate: CandidateProfile;
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
      <p>{publication?.note}</p>
      <p>資料性質：機器政策核准；不等同人工編輯核准。</p>
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

function PolicyResearchStatus({ candidate }: { candidate: CandidateProfile }) {
  const research = candidate.policyResearch;
  if (!research) return null;

  const outcomeLabel =
    {
      'verified-records': '已找到候選人政策來源紀錄',
      'current-or-historical-only': '僅找到現任／歷史服務政見',
      'no-verifiable-policy-found': '目前沒有足夠可核實的政策紀錄',
      'sources-unavailable': '候選人專屬來源目前無法取得',
      'evidence-requires-review': '政策證據仍需人工查核',
      'candidate-identity-unresolved': '候選人身分仍待釐清',
    }[research.outcome] ?? research.outcome;

  return (
    <div className="content-card" data-testid="policy-research-status">
      <h4>政策研究狀態：{outcomeLabel}</h4>
      <p>
        {research.outcome === 'verified-records'
          ? `研究找到 ${research.policyCount} 筆候選人政策紀錄；目前均尚未完成人工與編輯核准。`
          : research.outcome === 'current-or-historical-only'
            ? `研究找到 ${research.policyCount} 筆現任／歷史服務政見；這些內容不自動代表 2026 競選承諾。`
            : research.outcome === 'sources-unavailable'
              ? '已記錄限定來源研究嘗試，但目前無法取得足以核實候選人政策的候選人專屬來源。'
              : '已完成限定來源研究，但目前沒有足以公開的政策紀錄。'}
      </p>
      <p>{research.note}</p>
      <p>
        公開政策：{research.publishedPolicyCount}{' '}
        筆。未經人工與編輯核准的研究紀錄不會在本頁公開；資料缺少不表示候選人沒有政策。
      </p>
    </div>
  );
}

function BasicTab({ candidate }: { candidate: CandidateProfile }) {
  const { person, candidacy, district } = candidate;
  const demo = isDemoProfile(candidate);
  const numberLabel =
    candidacy.candidateNumberStatus === 'drawn'
      ? `號次 ${candidacy.candidateNumber}（抽定，非正式公告）`
      : candidacy.candidateNumber
        ? `號次 ${candidacy.candidateNumber}`
        : '號次尚未發布';

  return (
    <div className="profile-tab-content" data-profile-section="basic">
      <div className="profile-section-heading">
        <h3>基本資料</h3>
        <p>身分、參選資訊與背景分開保存；每組欄位均附上名冊或機關來源。</p>
      </div>
      <dl className="info-grid">
        <div className="info-row">
          <dt>姓名</dt>
          <dd>{person.displayName}</dd>
        </div>
        <div className="info-row">
          <dt>本次參選</dt>
          <dd>
            {candidacy.electionYear}年・
            {candidacy.electionType === 'mayoral'
              ? '高雄市長'
              : candidacy.electionType === 'indigenous-council'
                ? '原住民族區域／平地原住民議員'
                : '高雄市議員'}
            <small className="info-note">
              本次參選身分，不等同已當選或已就任。
            </small>
          </dd>
        </div>
        <div className="info-row">
          <dt>政黨／登記資訊</dt>
          <dd>
            {candidacy.politicalParty}
            <small className="info-note">
              中選會選舉專區資料列之政黨／登記欄；不等同黨籍認定。
            </small>
          </dd>
        </div>
        {candidacy.cecDirectoryName ? (
          <div className="info-row">
            <dt>中選會選舉專區列名</dt>
            <dd>
              {candidacy.cecDirectoryName}
              <small className="info-note">
                與高雄市選舉委員會號次抽定表列名有差異；正式公告前待人工比對，未靜默合併。
              </small>
            </dd>
          </div>
        ) : null}
        <div className="info-row">
          <dt>選舉區</dt>
          <dd>
            {district.name}（{district.districtLabel}）
          </dd>
        </div>
        <div className="info-row">
          <dt>目前職務／公開身分</dt>
          <dd>{candidacy.currentPosition}</dd>
        </div>
        <div className="info-row">
          <dt>出生日期</dt>
          <dd>{candidacy.birthDate ?? '目前尚未刊載'}</dd>
        </div>
        <div className="info-row">
          <dt>選舉年度／號次</dt>
          <dd>
            {candidacy.electionYear}・{numberLabel}
          </dd>
        </div>
      </dl>
      <div className="content-card">
        <h4>人物摘要</h4>
        <p>{person.summary}</p>
        <SourceChips
          candidate={candidate}
          sourceIds={
            candidate.candidacy
              ? candidate.sources.map((source) => source.id)
              : []
          }
        />
      </div>
      <div className="content-card">
        <h4>教育與專業背景</h4>
        <p>
          <strong>教育：</strong>
          {person.education.length
            ? person.education.join('、')
            : '目前尚無已查證的資料'}
        </p>
        <p>
          <strong>專業經歷：</strong>
          {person.professionalExperience.length
            ? person.professionalExperience.join('；')
            : '目前尚無已查證的資料'}
        </p>
        <SourceChips
          candidate={candidate}
          sourceIds={candidate.sources.map((source) => source.id)}
        />
      </div>
      <BiographyStatusCard candidate={candidate} />
      {candidate.research ? (
        <div className="content-card" data-testid="research-summary">
          <h4>公開資料研究執行狀態</h4>
          <p>
            本批次於 {candidate.research.snapshotDate}{' '}
            完成機器化名冊比對；人工審查狀態：
            {candidate.research.reviewStatus}。
          </p>
          <p>
            已嘗試 {candidate.research.attemptedCategoryCount}／6 類，已取得來源{' '}
            {candidate.research.retrievedCategoryCount}／6 類；
            {candidate.research.identityStatus === 'conflicted'
              ? '本人物存在官方來源字元差異，尚未裁決。'
              : '目前身分與官方名冊列相符。'}
          </p>
          <p>{candidate.research.note}</p>
        </div>
      ) : null}
      <div className="content-card">
        <h4>基本資料來源</h4>
        <p>
          下列來源支援本頁的名冊身分、參選與選區欄位；不同來源的差異不會被靜默合併。
        </p>
        <SourceChips
          candidate={candidate}
          sourceIds={candidate.sources.map((source) => source.id)}
        />
      </div>
      {demo ? (
        <p className="info-note">
          此人物為虛構示範資料，僅用於展示介面與互動流程。
        </p>
      ) : null}
    </div>
  );
}

function PublicPolicyCards({ candidate }: { candidate: CandidateProfile }) {
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

function PoliciesTab({ candidate }: { candidate: CandidateProfile }) {
  const demo = isDemoProfile(candidate);
  const publicPolicies = candidate.publicRecords?.policies ?? [];

  return (
    <div className="profile-tab-content" data-profile-section="policies">
      <div className="profile-section-heading">
        <h3>政策主張</h3>
        <p>原始主張、政策性質與查核狀態分開呈現；提案不等同已完成成果。</p>
      </div>
      <PolicyResearchStatus candidate={candidate} />
      <AutomatedClaimCards
        candidate={candidate}
        categories={['policies']}
        heading="已自動核准的歷史政策資料"
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
                <strong>編輯白話摘要：</strong>
                {policy.plainLanguageSummary}
              </p>
            ) : null}
            <p>
              <strong>政策狀態：</strong>
              來源未提供執行結果，未將其標示為已完成。
            </p>
            <SourceChips candidate={candidate} sourceIds={policy.sourceIds} />
          </article>
        ))
      ) : (
        <EmptyContent category="政策主張" demo={demo} />
      )}
    </div>
  );
}

function PublicActivityCards({ candidate }: { candidate: CandidateProfile }) {
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
              <strong>結果狀態：</strong>來源未記載可歸因於個人的完成結果。
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

function LegacyCareerCards({ candidate }: { candidate: CandidateProfile }) {
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

function PublicPositionCards({ candidate }: { candidate: CandidateProfile }) {
  const positions = candidate.publicRecords?.positions ?? [];
  return (
    <>
      {positions.map((position) => (
        <article className="content-card" key={position.id}>
          <div className="content-card__meta">
            <span className="status-chip">來源核對職務</span>
            <span>
              {position.currentStatus === 'current'
                ? '目前身分'
                : '歷史／狀態未定'}
            </span>
          </div>
          <h4>{position.title}</h4>
          <p>{position.organization}</p>
          <p>
            {position.startDate ?? '任期起日未在來源頁面標示'}—
            {position.endDate ?? '任期迄日未在來源頁面標示'}
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

function CareerTab({ candidate }: { candidate: CandidateProfile }) {
  const demo = isDemoProfile(candidate);
  const publicActivities = candidate.publicRecords?.activities ?? [];
  const publicPositions = candidate.publicRecords?.positions ?? [];
  const legacyCards = LegacyCareerCards({ candidate });
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
        <p>
          依來源可確認的職務、質詢、提案與公共服務活動整理；未取得個別表決證據時不作任何推論。
        </p>
      </div>
      <BiographyStatusCard candidate={candidate} />
      <AutomatedClaimCards
        candidate={candidate}
        categories={['basic-biography', 'timeline']}
        heading="已自動核准的歷史機關履歷"
      />
      {candidate.biography?.claims.length ? (
        <div className="content-card" data-testid="biography-timeline">
          <h4>已核准履歷事件</h4>
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
                <div className="content-card__meta">
                  {claim.sourceIds.map((sourceId) => (
                    <span className="source-chip" key={sourceId}>
                      來源：{sourceId}
                    </span>
                  ))}
                </div>
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
        <h4>提案與個別表決</h4>
        <p>
          {publicActivities.some(
            (activity) => activity.activityType === 'legislative-proposal',
          )
            ? '本頁列出來源明確連結至候選人的提案紀錄；提案角色與官方狀態依來源保留。'
            : '目前來源未取得可驗證的個人提案紀錄。'}
        </p>
        <p>
          目前來源未提供可查證之個別表決紀錄；不從黨籍、公開發言或集體結果推論個人投票。
        </p>
      </section>
      {!hasCareer ? <EmptyContent category="從政歷程" demo={demo} /> : null}
      {candidate.positions.length === 0 &&
      publicPositions.length === 0 &&
      publicActivities.length === 0 &&
      (candidate.biography?.claims.length ?? 0) === 0 &&
      (candidate.automatedPublication?.claims.length ?? 0) === 0 ? (
        <div className="content-card">
          <h4>沒有可確認的先前公職</h4>
          <p>
            目前沒有已查證的先前公職或行政職務資料；這不代表候選人沒有其他未納入本切片的經歷。
          </p>
        </div>
      ) : null}
    </div>
  );
}

function NewsEmpty({ filter, demo }: { filter: NewsFilter; demo: boolean }) {
  const label = filter === 'positive' ? '正面新聞' : '負面新聞';
  return (
    <div className="content-card">
      <h4>
        {filter === 'all'
          ? demo
            ? '新聞（示範未填寫）'
            : '目前尚無已查證的新聞資料'
          : `目前尚無已查證的${label}資料`}
      </h4>
      <p>
        {filter === 'all'
          ? '缺少資料不表示事件不存在；只有通過來源、身份與出版閘門的紀錄才會顯示。'
          : '現有資料沒有足夠證據依既定標準歸入此分類；不為平衡而製造新聞。'}
      </p>
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
  candidate: CandidateProfile;
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
            <p>{article.editorialSummary ?? '來源未提供編輯摘要。'}</p>
            <p>
              <strong>分類依據：</strong>
              {article.classificationRationale ??
                '現有來源未提供正負面分類；本頁不僅依標題或發布者語氣判定。'}
            </p>
            <p>
              <strong>事件日期：</strong>
              {article.eventDate ?? '未另行標示'}
            </p>
            <p>
              <strong>後續狀態：</strong>
              {article.latestStatus ??
                '目前資料集未提供後續狀態；不將歷史報導改寫為現在事件。'}
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
  candidate: CandidateProfile;
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
          <p>{article.editorialSummary ?? '來源未提供編輯摘要。'}</p>
          <p>
            <strong>分類依據：</strong>
            示範資料未提供足以歸入正面或負面的獨立分類證據。
          </p>
          <SourceChips candidate={candidate} sourceIds={article.sourceIds} />
        </article>
      ))}
    </>
  );
}

function NewsTab({ candidate }: { candidate: CandidateProfile }) {
  const [filter, setFilter] = useState<NewsFilter>('all');
  const demo = isDemoProfile(candidate);
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
        <p>
          新聞分類依可說明的內容與證據，不依發布者語氣；爭議、指控與法律結果必須分開呈現。
        </p>
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
        heading="已自動核准的新聞資料"
      />
      {visibleCount > 0 ? (
        <>
          <PublicNewsCards candidate={candidate} filter={filter} />
          <LegacyNewsCards candidate={candidate} filter={filter} />
        </>
      ) : (
        <NewsEmpty filter={filter} demo={demo} />
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
      <a
        className="secondary-link"
        href={withBase(`/candidates/${candidate.candidacy.slug}/`)}
      >
        開啟完整人物頁 →
      </a>
    </div>
  );
}
