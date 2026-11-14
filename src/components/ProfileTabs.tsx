import type { KeyboardEvent } from 'react';
import { useEffect, useState } from 'react';
import { isDemoProfile, type PublicCandidateProfile } from '../data';
import type { BasicProfilePublicClaim } from '../data/basic-profiles';
import {
  BASIC_PROFILE_ATTRIBUTION_LABELS,
  BasicProfileFieldLabels,
} from '../data/basic-profiles/schema';
import { ballotNumberText } from '../data/official/ballot';
import type { PolicyCareerCommitment } from '../data/policy-career';
import {
  PolicyDerivedCareerSection,
  PoliticalCareerTimeline,
} from './PoliticalCareerTimeline';
import PoliticalFamilyGraph from './PoliticalFamilyGraph';
export type ProfileTab = 'basic' | 'policies' | 'news' | 'career' | 'family';

export const PROFILE_TABS: ReadonlyArray<{ id: ProfileTab; label: string }> = [
  { id: 'basic', label: '基本資料' },
  { id: 'policies', label: '政策主張' },
  { id: 'news', label: '相關新聞' },
  { id: 'career', label: '從政歷程' },
  { id: 'family', label: '家族從政關係' },
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

const policyCategoryLabels: Record<string, string> = {
  'transportation-and-mobility': '交通與運輸',
  'housing-and-urban-development': '居住與都市發展',
  'economic-development-and-industry': '經濟與產業',
  education: '教育',
  'childcare-and-family-support': '托育與家庭支持',
  healthcare: '醫療與健康',
  'social-welfare-and-long-term-care': '社會福利與長照',
  'environment-and-sustainability': '環境與永續',
  'public-safety-and-disaster-preparedness': '公共安全與防災',
  'youth-and-employment': '青年與就業',
  'agriculture-and-fisheries': '農業與漁業',
  'culture-tourism-and-sports': '文化、觀光與體育',
  'digital-governance-and-technology': '數位治理與科技',
  'indigenous-affairs': '原住民族事務',
  'government-transparency-and-administration': '政府透明與行政',
  other: '其他',
};

const policyTypeLabels: Record<string, string> = {
  manifesto: '正式政見',
  campaign_proposal: '競選主張',
  issue_position: '議題立場',
  public_statement: '公開發言',
  historical_proposal: '歷史政策主張',
};

const policyCategoryOrder = Object.keys(policyCategoryLabels);

function PolicyCommitmentCards({
  commitments,
  onOpenActivity,
}: {
  commitments: PolicyCareerCommitment[];
  onOpenActivity?: ((activityId: string) => void) | undefined;
}) {
  const groups = new Map<string, PolicyCareerCommitment[]>();
  for (const commitment of commitments) {
    const list = groups.get(commitment.policy.category) ?? [];
    list.push(commitment);
    groups.set(commitment.policy.category, list);
  }
  const ordered = [...groups.entries()].sort(
    (a, b) =>
      policyCategoryOrder.indexOf(a[0]) - policyCategoryOrder.indexOf(b[0]),
  );

  const [activeCategory, setActiveCategory] = useState('all');
  const visible =
    activeCategory === 'all'
      ? ordered
      : ordered.filter(([category]) => category === activeCategory);

  return (
    <div className="policy-archive" data-testid="policy-commitments">
      <fieldset className="policy-filter">
        <legend className="sr-only">依政策主題篩選</legend>
        <button
          type="button"
          aria-pressed={activeCategory === 'all'}
          onClick={() => setActiveCategory('all')}
        >
          全部<span>{commitments.length}</span>
        </button>
        {ordered.map(([category, items]) => (
          <button
            key={category}
            type="button"
            aria-pressed={activeCategory === category}
            onClick={() => setActiveCategory(category)}
          >
            {policyCategoryLabels[category] ?? category}
            <span>{items.length}</span>
          </button>
        ))}
      </fieldset>
      <div className="policy-groups">
        {visible.map(([category, items]) => (
          <details
            className="policy-group"
            key={category}
            open={activeCategory === category || undefined}
          >
            <summary className="policy-group__title">
              <span>{policyCategoryLabels[category] ?? category}</span>
              <span className="policy-group__count">{items.length} 項</span>
            </summary>
            {items.map(({ policy, facet, relatedActivities }) => (
              <article
                className="content-card"
                key={policy.policyId}
                id={'policy-' + policy.policyId}
              >
                <div className="content-card__meta">
                  <span className="status-chip">
                    {policyTypeLabels[policy.type] ?? policy.type}
                  </span>
                  {policy.announcedAt ? (
                    <span>{policy.announcedAt}</span>
                  ) : null}
                  {policy.scope ? <span>{policy.scope}</span> : null}
                </div>
                <h5>{facet?.title ?? policy.title}</h5>
                <p>{facet?.summary ?? policy.summary}</p>
                {relatedActivities.length > 0 ? (
                  <p className="policy-card__links">
                    <strong>相關政治活動：</strong>
                    {relatedActivities.map((activity) =>
                      onOpenActivity ? (
                        <button
                          key={activity.activityId}
                          type="button"
                          className="source-chip"
                          onClick={() => onOpenActivity(activity.activityId)}
                        >
                          {activity.date}・{activity.title}
                        </button>
                      ) : (
                        <span className="source-chip" key={activity.activityId}>
                          {activity.date}・{activity.title}
                        </span>
                      ),
                    )}
                  </p>
                ) : null}
                <details className="policy-card__details">
                  <summary>查看政策細節</summary>
                  {facet ? (
                    <p className="policy-card__note">
                      原始報導同時記載已發生的協調或提案過程；該部分已移至「從政歷程」，
                      此處僅保留尚未完成的承諾，避免同一事實重複呈現。
                    </p>
                  ) : (
                    <>
                      {policy.details ? <p>{policy.details}</p> : null}
                      {policy.implementationDetails.length > 0 ? (
                        <ul>
                          {policy.implementationDetails.map((detail) => (
                            <li key={detail}>{detail}</li>
                          ))}
                        </ul>
                      ) : null}
                      <blockquote>{policy.originalStatement}</blockquote>
                    </>
                  )}
                  <p className="policy-card__sources">
                    <strong>來源：</strong>
                    {policy.sources.map((source) => (
                      <a
                        key={source.url}
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {source.publisher}｜{source.title}
                      </a>
                    ))}
                  </p>
                </details>
              </article>
            ))}
          </details>
        ))}
      </div>
    </div>
  );
}

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

interface Props {
  candidate: PublicCandidateProfile;
  initialTab?: ProfileTab;
}

type EmptyStateKey = 'basic' | 'policies' | 'news' | 'career';

const emptyStateLabels: Record<EmptyStateKey, string> = {
  basic: '基本資料：暫無資料',
  policies: '目前尚未找到可核實的公開政策主張。',
  news: '相關新聞：暫無公開新聞資料',
  career: '從政歷程：暫無公開履歷資料',
};

function EmptyContent({ category }: { category: EmptyStateKey }) {
  return (
    <div className="content-card">
      <h4>{emptyStateLabels[category]}</h4>
      {category === 'policies' ? (
        <p>缺少公開紀錄不代表候選人沒有相關主張。</p>
      ) : null}
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

function basicProfileDateLabel(claim: BasicProfilePublicClaim): string {
  const start = claim.validFrom ?? null;
  const end = claim.validTo ?? null;
  if (!start && !end) return '日期未標示';
  if (claim.currentStatus === 'current') return start ? start + ' 起' : '目前';
  return (start ?? '年份未標示') + '–' + (end ?? '迄今');
}

function BasicProfileSection({
  candidate,
}: {
  candidate: PublicCandidateProfile;
}) {
  const profile = candidate.basicProfile;
  if (!profile) {
    return (
      <div className="content-card" data-testid="basic-profile-empty">
        <h4>學歷與經歷</h4>
        <p>目前尚無可公開的查證資料；空白不代表候選人沒有相關經歷。</p>
      </div>
    );
  }
  const fieldOrder = [
    'current-position',
    'public-service',
    'professional-experience',
    'education',
    'official-website',
    'biographical-note',
  ] as const;
  const groups = fieldOrder
    .map((field) => ({
      field,
      claims: profile.claims.filter((claim) => claim.field === field),
    }))
    .filter((group) => group.claims.length > 0);
  return (
    <div className="content-card" data-testid="basic-profile-verified">
      <h4>公開來源基本資料</h4>
      <p className="info-note">{profile.note}</p>
      {profile.claims.some(
        (claim) => claim.attribution === 'candidate-statement',
      ) ? (
        <p className="info-note">
          「候選人自行填列」表示內容取自選舉公報或議員簡介等候選人提供資料，未另取得獨立佐證。
        </p>
      ) : null}
      {groups.map((group) => (
        <section className="basic-profile-group" key={group.field}>
          <h5>{BasicProfileFieldLabels[group.field]}</h5>
          <ul className="basic-profile-list">
            {group.claims.map((claim) => {
              const isRole =
                claim.field === 'current-position' ||
                claim.field === 'professional-experience' ||
                claim.field === 'public-service';
              const hasDates = Boolean(claim.validFrom || claim.validTo);
              return (
                <li className="basic-profile-item" key={claim.claimId}>
                  <div className="basic-profile-item__value">
                    {claim.field === 'official-website' ? (
                      <a href={claim.value} target="_blank" rel="noreferrer">
                        {claim.value}
                      </a>
                    ) : (
                      <strong>{claim.value}</strong>
                    )}
                  </div>
                  {claim.detail ? <p>{claim.detail}</p> : null}
                  <div className="content-card__meta">
                    {claim.organization ? (
                      <span>{claim.organization}</span>
                    ) : null}
                    {isRole || hasDates ? (
                      <span>{basicProfileDateLabel(claim)}</span>
                    ) : null}
                    {isRole ? (
                      <span className="status-chip">
                        {claim.currentStatus === 'current'
                          ? '現任'
                          : claim.currentStatus === 'historical'
                            ? '歷史'
                            : '狀態未確認'}
                      </span>
                    ) : null}
                    <span>
                      {BASIC_PROFILE_ATTRIBUTION_LABELS[claim.attribution]}
                    </span>
                    <a
                      href={claim.evidence.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {claim.evidence.publisher}
                    </a>
                    {claim.evidence.publishedAt ? (
                      <span>{claim.evidence.publishedAt}</span>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <p className="info-note">
        本頁未列出之欄位，代表目前尚無可公開的查證資料。
      </p>
    </div>
  );
}

function BasicTab({ candidate }: { candidate: PublicCandidateProfile }) {
  const { person, candidacy, district } = candidate;
  const demo = isDemoProfile(candidate);
  const numberLabel = ballotNumberText(candidacy);
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
          <dt>選票號次</dt>
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
      <BasicProfileSection candidate={candidate} />
      {demo &&
      (person.education.length > 0 ||
        person.professionalExperience.length > 0) ? (
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
        </div>
      ) : null}
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

function PoliciesTab({
  candidate,
  onOpenActivity,
}: {
  candidate: PublicCandidateProfile;
  onOpenActivity?: ((activityId: string) => void) | undefined;
}) {
  const career = candidate.policyCareer;
  const commitments = career?.commitments ?? [];
  const publishedPolicies = candidate.publishedPolicies ?? [];
  const publicPolicies = candidate.publicRecords?.policies ?? [];

  return (
    <div className="profile-tab-content" data-profile-section="policies">
      <div className="profile-section-heading">
        <h3>政策主張</h3>
        <p>
          僅列尚未發生的競選承諾與政策目標，依政策主題分組並標示來源；
          已發生的提案、質詢與表決請見「從政歷程」。
        </p>
        {(career?.movedOutCount ?? 0) > 0 ? (
          <p className="profile-note" data-testid="policy-moved-out-note">
            另有 {career?.movedOutCount}{' '}
            筆紀錄經核對屬於已發生的政治行動，已移至「從政歷程」。
          </p>
        ) : null}
      </div>
      {career && commitments.length > 0 ? (
        <PolicyCommitmentCards
          commitments={commitments}
          onOpenActivity={onOpenActivity}
        />
      ) : publishedPolicies.length > 0 ? (
        <PolicyCommitmentCards
          commitments={publishedPolicies.map((policy) => ({
            policy,
            facet: null,
            relatedActivities: [],
          }))}
          onOpenActivity={onOpenActivity}
        />
      ) : (
        <>
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
                <SourceChips
                  candidate={candidate}
                  sourceIds={policy.sourceIds}
                />
              </article>
            ))
          ) : (
            <EmptyContent category="policies" />
          )}
        </>
      )}
    </div>
  );
}

function CareerTab({
  candidate,
  onOpenPolicies,
  onOpenPolicy,
}: {
  candidate: PublicCandidateProfile;
  onOpenPolicies?: () => void;
  onOpenPolicy?: (policyId: string) => void;
}) {
  const career = candidate.politicalCareer;
  const policyCareer = candidate.policyCareer;
  const historicalRecords = policyCareer?.historicalRecords ?? [];
  const hasCareer =
    (career?.activities.length ?? 0) > 0 ||
    (career?.officeTerms.length ?? 0) > 0 ||
    (career?.proposalTotal ?? 0) > 0 ||
    (career?.votingTotal ?? 0) > 0 ||
    (career?.coverage.governmentProjectCount ?? 0) > 0 ||
    historicalRecords.length > 0;

  return (
    <div className="profile-tab-content" data-profile-section="career">
      <div className="profile-section-heading">
        <h3>從政歷程</h3>
        <p>
          僅列已發生的市政參與、議會質詢、提案與公職任期，依時間排序；
          未來承諾列於「政策主張」，學歷與一般經歷列於基本資料。
        </p>
      </div>
      {career ? (
        <PoliticalCareerTimeline
          view={career}
          candidateName={candidate.person.displayName}
          commitmentCount={policyCareer?.commitments.length ?? 0}
          relatedPolicies={policyCareer?.linksByActivityId ?? {}}
          onOpenPolicies={onOpenPolicies}
          onOpenPolicy={onOpenPolicy}
        />
      ) : null}
      <PolicyDerivedCareerSection
        records={historicalRecords}
        onOpenPolicy={onOpenPolicy}
      />
      {!hasCareer ? <EmptyContent category="career" /> : null}
    </div>
  );
}

type NewsCardModel = {
  id: string;
  headline: string;
  publisher: string;
  url: string;
  publicationDate: string;
  topicTags: string[];
  contentType:
    | 'reporting'
    | 'opinion'
    | 'institutional-update'
    | 'unknown'
    | null;
  summary: string | null;
  eventDate: string | null;
  latestStatus: string | null;
  claimIds: string[];
  evidenceIds: string[];
  sourceIds: string[];
};

const contentTypeLabels: Record<string, string> = {
  reporting: '新聞報導',
  opinion: '評論',
  'institutional-update': '機關性更新',
  unknown: '內容類型未標示',
};

/**
 * News is presented as neutral coverage: no sentiment score, label, filter or
 * inclusion rule is derived from coverage tone. Both the approved public-record
 * layer and the legacy profile layer are merged and ordered by publication date.
 */
export function collectNewsCards(
  candidate: PublicCandidateProfile,
): NewsCardModel[] {
  const publicNews: NewsCardModel[] = (candidate.publicRecords?.news ?? []).map(
    (article) => ({
      id: article.id,
      headline: article.headline,
      publisher: article.publisher,
      url: article.originalUrl,
      publicationDate: article.publicationDate,
      topicTags: article.topicTags,
      contentType: article.contentType,
      summary: article.editorialSummary,
      eventDate: article.eventDate ?? null,
      latestStatus: article.latestStatus ?? null,
      claimIds: article.claimIds,
      evidenceIds: article.evidenceIds,
      sourceIds: [],
    }),
  );
  const publishedNews: NewsCardModel[] = (candidate.publishedNews ?? []).map(
    (article) => ({
      id: article.articleId,
      headline: article.headline,
      publisher: article.publisher,
      url: article.url,
      publicationDate: article.publicationDate,
      topicTags: article.topicTags,
      contentType: article.contentType,
      summary: article.summary,
      eventDate: null,
      latestStatus: null,
      claimIds: [],
      evidenceIds: [],
      sourceIds: [],
    }),
  );
  const legacyNews: NewsCardModel[] = candidate.news.map((article) => ({
    id: article.id,
    headline: article.title,
    publisher: article.publisher,
    url: article.url,
    publicationDate: article.publicationDate,
    topicTags: [article.topic],
    contentType: null,
    summary: article.editorialSummary ?? null,
    eventDate: null,
    latestStatus: null,
    claimIds: [],
    evidenceIds: [],
    sourceIds: article.sourceIds,
  }));
  // Code-unit compare, not localeCompare: Node ICU and browsers can collate
  // zh-Hant headlines differently, which changes the SSR/client order.
  return [...publicNews, ...publishedNews, ...legacyNews].sort(
    (left, right) => {
      if (left.publicationDate !== right.publicationDate) {
        return left.publicationDate < right.publicationDate ? 1 : -1;
      }
      if (left.headline === right.headline) return 0;
      return left.headline < right.headline ? -1 : 1;
    },
  );
}

function NewsCards({
  candidate,
  news,
}: {
  candidate: PublicCandidateProfile;
  news: NewsCardModel[];
}) {
  return (
    <>
      {news.map((article) => (
        <article className="content-card" key={article.id}>
          <div className="content-card__meta">
            <span>{article.publicationDate}</span>
            <span>{article.topicTags.join('・')}</span>
            {article.contentType ? (
              <span>{contentTypeLabels[article.contentType]}</span>
            ) : null}
          </div>
          <h4>
            <a href={article.url} target="_blank" rel="noreferrer">
              {article.headline}
            </a>
          </h4>
          <p>{article.publisher}</p>
          <p>{article.summary ?? '摘要未提供'}</p>
          {article.eventDate ? (
            <p>
              <strong>事件日期：</strong>
              {article.eventDate}
            </p>
          ) : null}
          {article.latestStatus ? (
            <p>
              <strong>後續狀態：</strong>
              {article.latestStatus}
            </p>
          ) : null}
          {article.claimIds.length > 0 || article.evidenceIds.length > 0 ? (
            <ClaimEvidence
              candidate={candidate}
              claimIds={article.claimIds}
              evidenceIds={article.evidenceIds}
            />
          ) : null}
          {article.sourceIds.length > 0 ? (
            <SourceChips candidate={candidate} sourceIds={article.sourceIds} />
          ) : null}
        </article>
      ))}
    </>
  );
}

function FamilyTab({ candidate }: { candidate: PublicCandidateProfile }) {
  return <PoliticalFamilyGraph candidate={candidate} />;
}

function NewsTab({ candidate }: { candidate: PublicCandidateProfile }) {
  const news = collectNewsCards(candidate);
  const [publisher, setPublisher] = useState('all');
  const [topic, setTopic] = useState('all');
  const publishers = [...new Set(news.map((article) => article.publisher))];
  const topics = [...new Set(news.flatMap((article) => article.topicTags))];
  const visible = news.filter(
    (article) =>
      (publisher === 'all' || article.publisher === publisher) &&
      (topic === 'all' || article.topicTags.includes(topic)),
  );

  return (
    <div className="profile-tab-content" data-profile-section="news">
      <div className="profile-section-heading">
        <h3>相關新聞</h3>
        <p>
          依發布日期由新至舊呈現，附來源與日期；僅列出已完成驗證與編輯審核的報導。
        </p>
      </div>
      <AutomatedClaimCards
        candidate={candidate}
        categories={['news']}
        heading="新聞資料"
      />
      {news.length > 0 ? (
        <>
          <div className="news-filters" data-testid="news-filters">
            <label>
              媒體
              <select
                value={publisher}
                onChange={(event) => setPublisher(event.target.value)}
              >
                <option value="all">全部</option>
                {publishers.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label>
              主題
              <select
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
              >
                <option value="all">全部</option>
                {topics.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {visible.length > 0 ? (
            <NewsCards candidate={candidate} news={visible} />
          ) : (
            <p className="profile-empty">目前篩選條件沒有符合的新聞。</p>
          )}
        </>
      ) : (
        <EmptyContent category="news" />
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

  const focusTab = (tab: ProfileTab) => {
    setActiveTab(tab);
    document.getElementById(`tab-${candidate.candidacy.slug}-${tab}`)?.focus();
  };

  const scrollToId = (id: string) => {
    if (typeof document === 'undefined') return;
    window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ block: 'center' });
    }, 80);
  };

  const openCareerActivity = (activityId: string) => {
    setActiveTab('career');
    scrollToId('career-' + activityId);
  };

  const openPolicy = (policyId: string) => {
    setActiveTab('policies');
    scrollToId('policy-' + policyId);
  };

  const handleTabKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    currentTab: ProfileTab,
  ) => {
    const currentIndex = PROFILE_TABS.findIndex((tab) => tab.id === currentTab);
    let nextIndex: number | undefined;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (currentIndex + 1) % PROFILE_TABS.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex =
        (currentIndex - 1 + PROFILE_TABS.length) % PROFILE_TABS.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = PROFILE_TABS.length - 1;
    }
    if (nextIndex === undefined) return;
    event.preventDefault();
    const nextTab = PROFILE_TABS[nextIndex];
    if (nextTab) focusTab(nextTab.id);
  };

  const renderTab = (tab: ProfileTab) => {
    switch (tab) {
      case 'policies':
        return (
          <PoliciesTab
            candidate={candidate}
            onOpenActivity={openCareerActivity}
          />
        );
      case 'news':
        return <NewsTab candidate={candidate} />;
      case 'career':
        return (
          <CareerTab
            candidate={candidate}
            onOpenPolicies={() => setActiveTab('policies')}
            onOpenPolicy={openPolicy}
          />
        );
      case 'family':
        return <FamilyTab candidate={candidate} />;
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
            tabIndex={activeTab === tab.id ? 0 : -1}
            onClick={() => setActiveTab(tab.id)}
            onKeyDown={(event) => handleTabKeyDown(event, tab.id)}
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
