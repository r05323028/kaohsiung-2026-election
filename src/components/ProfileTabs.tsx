import { useEffect, useState } from 'react';
import { type CandidateProfile, isDemoProfile } from '../data';
import type { PublicRecordBundle } from '../data/public-records/schema';
import { withBase } from '../utils/paths';

type ProfileTab =
  | 'basic'
  | 'policies'
  | 'records'
  | 'news'
  | 'history'
  | 'timeline';

const tabs: Array<{ id: ProfileTab; label: string }> = [
  { id: 'basic', label: '基本資料' },
  { id: 'policies', label: '政策主張' },
  { id: 'records', label: '公共紀錄' },
  { id: 'news', label: '新聞' },
  { id: 'history', label: '公共關係史' },
  { id: 'timeline', label: '政治時間軸' },
];

const recordStatusLabel: Record<string, string> = {
  'candidate-claimed': '候選人陳述',
  'independently-documented': '獨立紀錄',
  'needs-review': '待查核',
};

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
  'professional-experience': '專業經歷',
  education: '教育',
  'career-event': '職涯事件',
};

function BiographyStatusCard({ candidate }: { candidate: CandidateProfile }) {
  const biography = candidate.biography;
  if (!biography) return null;
  const approved = biography.status === 'approved';
  return (
    <div className="content-card" data-testid="biography-status">
      <h4>候選人履歷資料狀態</h4>
      {approved ? (
        <p>以下僅列出已完成人工與編輯核准的來源資料。</p>
      ) : (
        <p>
          目前尚無可公開的已核准履歷主張；已取得的資料仍待人工與編輯核對，空白不代表不存在。
        </p>
      )}
      <p>{biography.note}</p>
    </div>
  );
}

function BiographyTimeline({ candidate }: { candidate: CandidateProfile }) {
  const biography = candidate.biography;
  if (!biography || biography.claims.length === 0) return null;
  return (
    <div className="content-card" data-testid="biography-timeline">
      <h4>已核准履歷事件</h4>
      <ol className="timeline">
        {biography.claims.map((claim) => (
          <li key={claim.claimId}>
            <time dateTime={claim.validFrom ?? undefined}>
              {claim.validFrom ?? '日期未標示'}
            </time>
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
            {source.publisher}・{source.verificationStatus}
          </a>
        );
      })}
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
  const groups = new Map<string, typeof claims>();
  for (const claim of claims) {
    const bucket = groups.get(claim.claimType) ?? [];
    bucket.push(claim);
    groups.set(claim.claimType, bucket);
  }
  return (
    <div className="content-card" data-testid="automated-publication">
      <h4>{heading}</h4>
      <p>{publication?.note}</p>
      <p>資料性質：機關紀錄；非人工編輯核准。</p>
      {[...groups].map(([claimType, items]) => (
        <section className="content-card" key={claimType}>
          <div className="content-card__meta">
            <span className="status-chip">機器政策核准</span>
            <h5>{biographyClaimLabels[claimType] ?? claimType}</h5>
          </div>
          <ul className="automated-claim-list">
            {items.map((claim) => (
              <li key={claim.claimId}>
                <strong>{claim.title}</strong>
                <p>{claim.value}</p>
                <p className="content-card__meta">
                  {claim.organization ? (
                    <span>{claim.organization}</span>
                  ) : null}
                  <span>{claim.sourcePublicationDate ?? '日期未標示'}</span>
                </p>
                <AutomatedSourceChips
                  candidate={candidate}
                  sourceIds={claim.sourceIds}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function SourceChips({
  candidate,
  sourceIds,
}: {
  candidate: CandidateProfile;
  sourceIds: string[];
}) {
  return (
    <div className="content-card__meta">
      <span className="sr-only">來源狀態：</span>
      {sourceIds.map((sourceId) => {
        const source = candidate.sources.find((item) => item.id === sourceId);
        if (!source) return null;
        return (
          <a
            className="source-chip"
            href={source.url}
            target="_blank"
            rel="noreferrer"
            key={source.id}
          >
            {source.publisher}・{source.verificationStatus}
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
          {item.quotedText && <blockquote>「{item.quotedText}」</blockquote>}
        </div>
      ))}
      <SourceChips candidate={candidate} sourceIds={sourceIds} />
    </div>
  );
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
              {reviewLabels[position.reviewStatus] ?? position.reviewStatus}
            </span>
          </div>
          <h4>{position.title}</h4>
          <p>
            {position.organization}・
            {position.currentStatus === 'current' ? '目前身分' : '狀態未定'}
          </p>
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

function PublicPolicyCards({ candidate }: { candidate: CandidateProfile }) {
  const policies = candidate.publicRecords?.policies ?? [];
  return (
    <>
      {policies.map((policy) => (
        <article className="content-card" key={policy.id}>
          <div className="content-card__meta">
            <span className="status-chip">{policy.category}</span>
            <span>{policy.publicationDate ?? '日期未標示'}</span>
          </div>
          <h4>{policy.title}</h4>
          <p>
            <strong>原始陳述：</strong>
            {policy.originalStatement}
          </p>
          {policy.neutralSummary && (
            <p>
              <strong>中性摘要：</strong>
              {policy.neutralSummary}
            </p>
          )}
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

function PublicActivityCards({ candidate }: { candidate: CandidateProfile }) {
  const activities = candidate.publicRecords?.activities ?? [];
  return (
    <>
      {activities.map((activity) => (
        <article className="content-card" key={activity.id}>
          <div className="content-card__meta">
            <span className="status-chip">公開參與紀錄</span>
            <span>{activity.eventDate}</span>
          </div>
          <h4>{activity.title}</h4>
          <p>{activity.description}</p>
          <p>
            <strong>紀錄性質：</strong>
            {attributionLabels[activity.attribution] ?? activity.attribution}
          </p>
          {activity.documentedOutcome && (
            <p>
              <strong>機關紀錄結果：</strong>
              {activity.documentedOutcome}
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

function PublicNewsCards({ candidate }: { candidate: CandidateProfile }) {
  const news = candidate.publicRecords?.news ?? [];
  return (
    <>
      {news.map((article) => (
        <article className="content-card" key={article.id}>
          <div className="content-card__meta">
            <span className="status-chip">{article.topicTags.join('・')}</span>
            <span>{article.publicationDate}</span>
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
          {article.editorialSummary && <p>{article.editorialSummary}</p>}
          <ClaimEvidence
            candidate={candidate}
            claimIds={article.claimIds}
            evidenceIds={article.evidenceIds}
          />
        </article>
      ))}
    </>
  );
}

function PublicRelationshipCards({
  candidate,
}: {
  candidate: CandidateProfile;
}) {
  const relationships = candidate.publicRecords?.relationships ?? [];
  return (
    <>
      {relationships.map((relationship) => (
        <article className="content-card" key={relationship.id}>
          <div className="content-card__meta">
            <span className="status-chip">{relationship.relationshipType}</span>
          </div>
          <h4>{relationship.relatedPersonName}</h4>
          <p>{relationship.description}</p>
          <ClaimEvidence
            candidate={candidate}
            claimIds={relationship.claimIds}
            evidenceIds={relationship.evidenceIds}
          />
        </article>
      ))}
    </>
  );
}

function PublicTimeline({ candidate }: { candidate: CandidateProfile }) {
  const events = candidate.publicRecords?.timeline ?? [];
  return (
    <ol className="timeline">
      {events.map((event) => (
        <li key={event.id}>
          <time dateTime={event.eventDate ?? undefined}>
            {event.eventDate ?? '日期未標示'}
          </time>
          <strong>{event.title}</strong>
          <p>{event.description}</p>
          <ClaimEvidence
            candidate={candidate}
            claimIds={event.claimIds}
            evidenceIds={event.evidenceIds}
          />
        </li>
      ))}
    </ol>
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
    <div className="profile-tabpanel" role="tabpanel">
      <div className="profile-section-heading">
        <h3>基本資料</h3>
        <p>資料以人物身分與本次參選分開保存，避免把不同選舉混為一談。</p>
      </div>
      <dl className="info-grid">
        <div className="info-row">
          <dt>姓名</dt>
          <dd>{person.displayName}</dd>
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
          <dt>目前職務</dt>
          <dd>{candidacy.currentPosition}</dd>
        </div>
        <div className="info-row">
          <dt>出生日期（官方資料）</dt>
          <dd>{candidacy.birthDate ?? '目前尚未刊載'}</dd>
        </div>
        <div className="info-row">
          <dt>選舉區</dt>
          <dd>
            {district.name}（{district.districtLabel}）
          </dd>
        </div>
        <div className="info-row">
          <dt>選舉年度／號次</dt>
          <dd>
            {candidacy.electionYear}・{numberLabel}
          </dd>
        </div>
        <div className="info-row">
          <dt>官方肖像參照</dt>
          <dd>{candidacy.portraitReference || '目前尚未提供'}</dd>
        </div>
      </dl>
      <div className="content-card">
        <h4>人物簡介</h4>
        <p>{person.summary}</p>
      </div>
      <div className="content-card">
        <h4>教育與專業經驗</h4>
        <p>
          {person.education.length
            ? person.education.join('、')
            : '目前尚無已查證的資料'}
        </p>
        <p>
          {person.professionalExperience.length
            ? person.professionalExperience.join('；')
            : '目前尚無已查證的資料'}
        </p>
      </div>
      <BiographyStatusCard candidate={candidate} />
      <AutomatedClaimCards
        candidate={candidate}
        categories={['basic-biography']}
        heading="自動核准的低風險履歷資料"
      />
      {candidate.research ? (
        <div className="content-card" data-testid="research-summary">
          <h4>公開資料研究執行狀態</h4>
          <p>
            本批次於 {candidate.research.snapshotDate} 完成機器化名冊比對；
            人工審查狀態：{candidate.research.reviewStatus}。
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
      {candidate.publicRecords?.positions.length ? (
        <PublicPositionCards candidate={candidate} />
      ) : null}
      <div className="content-card">
        <h4>前任職務</h4>
        {candidate.positions.length > 0 ? (
          candidate.positions.map((position) => (
            <p key={position.id}>
              {position.title}・{position.organization}・{position.startDate}—
              {position.endDate ?? '至今'}
            </p>
          ))
        ) : (
          <p>
            {demo
              ? '此示範資料沒有填寫前任職務；空白不代表不存在。'
              : '目前尚無已查證的資料；空白不代表不存在。'}
          </p>
        )}
      </div>
      <div className="content-card">
        <h4>本頁來源</h4>
        {candidate.sources.length > 0 ? (
          candidate.sources.map((source) => (
            <p key={source.id}>
              <a href={source.url} target="_blank" rel="noreferrer">
                {source.publisher}・{source.id}
              </a>
              （{source.verificationStatus}）
            </p>
          ))
        ) : (
          <p>目前尚無已查證的資料。</p>
        )}
      </div>
    </div>
  );
}

const policyResearchOutcomeLabels: Record<string, string> = {
  'verified-records': '已找到候選人政策來源紀錄',
  'current-or-historical-only': '僅找到現任／歷史服務政見',
  'no-verifiable-policy-found': '目前沒有足夠可核實的政策紀錄',
  'sources-unavailable': '候選人專屬來源目前無法取得',
  'evidence-requires-review': '政策證據仍需人工查核',
  'candidate-identity-unresolved': '候選人身分仍待釐清',
};

function PolicyResearchStatus({ candidate }: { candidate: CandidateProfile }) {
  const research = candidate.policyResearch;
  if (!research) return null;

  const outcomeLabel =
    policyResearchOutcomeLabels[research.outcome] ?? research.outcome;
  const detail =
    research.outcome === 'verified-records'
      ? `研究找到 ${research.policyCount} 筆候選人政策紀錄；目前均尚未完成人工與編輯核准。`
      : research.outcome === 'current-or-historical-only'
        ? `研究找到 ${research.policyCount} 筆現任／歷史服務政見；這些內容不自動代表 2026 競選承諾。`
        : research.outcome === 'sources-unavailable'
          ? '已記錄限定來源研究嘗試，但目前無法取得足以核實候選人政策的候選人專屬來源。'
          : '已完成限定來源研究，但目前沒有足以公開的政策紀錄。';

  return (
    <div className="content-card" data-testid="policy-research-status">
      <h4>政策研究狀態：{outcomeLabel}</h4>
      <p>{detail}</p>
      <p>{research.note}</p>
      <p>
        公開政策：{research.publishedPolicyCount}{' '}
        筆。未經人工與編輯核准的研究紀錄不會在本頁公開；資料缺少不表示候選人沒有政策。
      </p>
    </div>
  );
}

function PoliciesTab({ candidate }: { candidate: CandidateProfile }) {
  const demo = isDemoProfile(candidate);
  const publicPolicies = candidate.publicRecords?.policies ?? [];
  return (
    <div className="profile-tabpanel" role="tabpanel">
      <div className="profile-section-heading">
        <h3>政策主張</h3>
        <p>原文與編輯整理分開標示；政策主張不等同於已完成的公共成果。</p>
      </div>
      <PolicyResearchStatus candidate={candidate} />
      <AutomatedClaimCards
        candidate={candidate}
        categories={['policies']}
        heading="自動核准的政策資料"
      />
      {publicPolicies.length > 0 ? (
        <PublicPolicyCards candidate={candidate} />
      ) : candidate.policies.length > 0 ? (
        candidate.policies.map((policy) => (
          <article className="content-card" key={policy.id}>
            <div className="content-card__meta">
              <span className="status-chip">{policy.category}</span>
              <span>{policy.publicationDate}</span>
            </div>
            <h4>{policy.title}</h4>
            <p>
              <strong>候選人原文：</strong>
              {policy.originalStatement}
            </p>
            {policy.plainLanguageSummary && (
              <p>
                <strong>編輯白話摘要：</strong>
                {policy.plainLanguageSummary}
              </p>
            )}
            <SourceChips candidate={candidate} sourceIds={policy.sourceIds} />
          </article>
        ))
      ) : (
        <EmptyContent category="政策主張" demo={demo} />
      )}
    </div>
  );
}

function RecordsTab({ candidate }: { candidate: CandidateProfile }) {
  const demo = isDemoProfile(candidate);
  const publicActivities = candidate.publicRecords?.activities ?? [];
  return (
    <div className="profile-tabpanel" role="tabpanel">
      <div className="profile-section-heading">
        <h3>公共紀錄與成果</h3>
        <p>區分候選人自述、獨立紀錄與待查核狀態，不把缺少資料解讀為否定。</p>
      </div>
      <AutomatedClaimCards
        candidate={candidate}
        categories={['public-records']}
        heading="自動核准的公共紀錄"
      />
      {publicActivities.length > 0 ? (
        <PublicActivityCards candidate={candidate} />
      ) : candidate.records.length > 0 ? (
        candidate.records.map((record) => (
          <article className="content-card" key={record.id}>
            <div className="content-card__meta">
              <span className="status-chip">
                {recordStatusLabel[record.status] ?? record.status}
              </span>
              <span>{record.date}</span>
            </div>
            <h4>{record.title}</h4>
            <p>{record.description}</p>
            <p>
              <strong>目前可確認：</strong>
              {record.documentedOutcome}
            </p>
            <SourceChips candidate={candidate} sourceIds={record.sourceIds} />
          </article>
        ))
      ) : (
        <EmptyContent category="公共紀錄" demo={demo} />
      )}
    </div>
  );
}

function NewsTab({ candidate }: { candidate: CandidateProfile }) {
  const demo = isDemoProfile(candidate);
  const publicNews = candidate.publicRecords?.news ?? [];
  return (
    <div className="profile-tabpanel" role="tabpanel">
      <div className="profile-section-heading">
        <h3>新聞</h3>
        <p>只保存標題、出版者、日期、連結與短摘要，不複製完整新聞文章。</p>
      </div>
      <AutomatedClaimCards
        candidate={candidate}
        categories={['news']}
        heading="自動核准的新聞資料"
      />
      {publicNews.length > 0 ? (
        <PublicNewsCards candidate={candidate} />
      ) : candidate.news.length > 0 ? (
        candidate.news.map((article) => (
          <article className="content-card" key={article.id}>
            <div className="content-card__meta">
              <span className="status-chip">{article.topic}</span>
              <span>{article.publicationDate}</span>
            </div>
            <h4>
              <a href={article.url} target="_blank" rel="noreferrer">
                {article.title}
              </a>
            </h4>
            <p>{article.publisher}</p>
            {article.editorialSummary && <p>{article.editorialSummary}</p>}
            <SourceChips candidate={candidate} sourceIds={article.sourceIds} />
          </article>
        ))
      ) : (
        <EmptyContent category="新聞" demo={demo} />
      )}
    </div>
  );
}

function HistoryTab({ candidate }: { candidate: CandidateProfile }) {
  const demo = isDemoProfile(candidate);
  const publicRelationships = candidate.publicRecords?.relationships ?? [];
  return (
    <div className="profile-tabpanel" role="tabpanel">
      <div className="profile-section-heading">
        <h3>公共關係史</h3>
        <p>
          只記錄有公共利益且有來源的關係；不推論私人家庭資訊或未證實的連結。
        </p>
      </div>
      <AutomatedClaimCards
        candidate={candidate}
        categories={['relationships']}
        heading="自動核准的公共關係資料"
      />
      {publicRelationships.length > 0 ? (
        <PublicRelationshipCards candidate={candidate} />
      ) : candidate.relationships.length > 0 ? (
        candidate.relationships.map((relationship) => (
          <article className="content-card" key={relationship.id}>
            <h4>{relationship.relationshipLabel}</h4>
            <p>{relationship.context}</p>
            <p>
              <strong>編輯備註：</strong>
              {relationship.publicInterestNote}
            </p>
            <SourceChips
              candidate={candidate}
              sourceIds={relationship.sourceIds}
            />
          </article>
        ))
      ) : (
        <EmptyContent category="公共關係史" demo={demo} />
      )}
    </div>
  );
}

function TimelineTab({ candidate }: { candidate: CandidateProfile }) {
  const demo = isDemoProfile(candidate);
  const publicTimeline = candidate.publicRecords?.timeline ?? [];
  return (
    <div className="profile-tabpanel" role="tabpanel">
      <div className="profile-section-heading">
        <h3>政治職涯時間軸</h3>
        <p>時間軸事件以日期與來源呈現，缺少事件不代表事件不存在。</p>
      </div>
      <BiographyTimeline candidate={candidate} />
      <AutomatedClaimCards
        candidate={candidate}
        categories={['timeline']}
        heading="自動核准的時間軸資料"
      />
      {publicTimeline.length > 0 ? (
        <PublicTimeline candidate={candidate} />
      ) : candidate.timeline.length > 0 ? (
        <ol className="timeline">
          {candidate.timeline.map((event) => (
            <li key={event.id}>
              <time dateTime={event.date}>{event.date}</time>
              <strong>{event.title}</strong>
              <p>{event.description}</p>
              <SourceChips candidate={candidate} sourceIds={event.sourceIds} />
            </li>
          ))}
        </ol>
      ) : (
        <EmptyContent category="政治時間軸" demo={demo} />
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
      case 'records':
        return <RecordsTab candidate={candidate} />;
      case 'news':
        return <NewsTab candidate={candidate} />;
      case 'history':
        return <HistoryTab candidate={candidate} />;
      case 'timeline':
        return <TimelineTab candidate={candidate} />;
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
        {tabs.map((tab) => (
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
      {tabs.map((tab) => (
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
