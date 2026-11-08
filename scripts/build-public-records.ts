import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  parseKccMemberProfile,
  parseKccNewsArticle,
  sourceContainsText,
} from '../src/data/public-records/adapters';
import {
  type Claim,
  type Evidence,
  type IdentityResolution,
  type NewsRecord,
  type PositionRecord,
  type PublicActivityRecord,
  type PublicRecordsDataset,
  type TimelineEventRecord,
  validatePublicRecordsDataset,
} from '../src/data/public-records/schema';

const root = process.cwd();
const snapshotDate = '2026-11-05';
const liPersonId = 'person-kaohsiung-council-04-a7ed58d6';
const wangPersonId = 'person-kaohsiung-council-12-1a977b21';
const laiPersonId = 'person-lai-rui-long-2026';
const liCandidateId =
  'official-candidate-2026-district-kaohsiung-council-04-fa7345e8';
const wangCandidateId =
  'official-candidate-2026-district-kaohsiung-indigenous-flat-12-0f37f5cd';
const laiCandidateId = 'official-mayor-lai-rui-long-2026';

const sources = {
  liMember: 'source-kcc-member-2186-li-meizhen',
  wangMember: 'source-kcc-member-2230-wang-yixiong',
  li17284: 'source-kcc-news-17284',
  li17102: 'source-kcc-news-17102',
  wang17293: 'source-kcc-news-17293',
  wang17093: 'source-kcc-news-17093',
} as const;

const sourcePath = (file: string) =>
  path.join(root, 'data/raw/official/2026/public-records', file);

const rawPaths = {
  [sources.liMember]: sourcePath('kcc-member-2186-li-meizhen.snapshot'),
  [sources.wangMember]: sourcePath('kcc-member-2230-wang-yixiong.snapshot'),
  [sources.li17284]: sourcePath('kcc-news-17284.html'),
  [sources.li17102]: sourcePath('kcc-news-17102.html'),
  [sources.wang17293]: sourcePath('kcc-news-17293.html'),
  [sources.wang17093]: sourcePath('kcc-news-17093.html'),
};

const raw = Object.fromEntries(
  await Promise.all(
    Object.entries(rawPaths).map(async ([sourceId, file]) => [
      sourceId,
      await readFile(file, 'utf8'),
    ]),
  ),
) as Record<string, string>;

const rawText = (sourceId: string): string => {
  const value = raw[sourceId];
  if (!value) throw new Error(`Missing retained snapshot for ${sourceId}.`);
  return value;
};

const liProfile = parseKccMemberProfile(
  rawText(sources.liMember),
  sources.liMember,
);
const wangProfile = parseKccMemberProfile(
  rawText(sources.wangMember),
  sources.wangMember,
);
if (
  liProfile.displayName !== '李眉蓁' ||
  wangProfile.displayName !== '王義雄' ||
  !liProfile.isCurrentMemberPage ||
  !wangProfile.isCurrentMemberPage
) {
  throw new Error(
    'KCC member snapshots did not resolve the selected identities.',
  );
}

const articles = [
  parseKccNewsArticle(rawText(sources.li17284), sources.li17284, '李眉蓁'),
  parseKccNewsArticle(rawText(sources.li17102), sources.li17102, '李眉蓁'),
  parseKccNewsArticle(rawText(sources.wang17293), sources.wang17293, '王義雄'),
  parseKccNewsArticle(rawText(sources.wang17093), sources.wang17093, '王義雄'),
];
if (articles.some((article) => !article.mentionsCandidate)) {
  throw new Error(
    'A selected KCC news snapshot does not mention its candidate.',
  );
}

const quotes = {
  li17284:
    '市府應面對找得到工作卻看不到加薪、薪水增加追不上居住成本、想成家又擔心租期和育兒安排等問題，也應建立青年創業集資平台。',
  li17102: '捷運紫線卡關，北高雄交通建設不能再等。',
  wang17293:
    '回顧歷年政策推動，王義雄議員今(13)日總質詢指出，遺憾陳其邁市長施政對原住民重要議題不夠尊重',
  wang17093:
    '對原住民的承諾不能只是「研議中」，王義雄議員今(12)日總質詢批評原民會主委上任至今只會辦活動、未見政績',
} as const;
for (const [key, quote] of Object.entries(quotes)) {
  const sourceId = sources[key as keyof typeof quotes];
  if (!sourceContainsText(rawText(sourceId), quote)) {
    throw new Error(
      `Expected source quote was not found in ${sourceId}: ${quote}`,
    );
  }
}

const claimReview = {
  attribution: 'documented-participation' as const,
  verificationStatus: 'Verified' as const,
  reviewStatus: 'pending-review' as const,
};

const claims: Claim[] = [
  {
    claimId: 'claim-li-current-council-position',
    subjectId: liPersonId,
    predicate: 'holds-current-institutional-position',
    claimType: 'position-held',
    object: { title: '高雄市議員', organization: '高雄市議會' },
    qualifiers: { sourceIdentifier: 'msn=2186', asOf: snapshotDate },
    validFrom: null,
    validTo: null,
    assertedAt: snapshotDate,
    ...claimReview,
    evidenceIds: ['evidence-li-member-profile'],
  },
  {
    claimId: 'claim-wang-current-council-position',
    subjectId: wangPersonId,
    predicate: 'holds-current-institutional-position',
    claimType: 'position-held',
    object: { title: '高雄市議員', organization: '高雄市議會' },
    qualifiers: { sourceIdentifier: 'msn=2230', asOf: snapshotDate },
    validFrom: null,
    validTo: null,
    assertedAt: snapshotDate,
    ...claimReview,
    evidenceIds: ['evidence-wang-member-profile'],
  },
  {
    claimId: 'claim-li-questioning-17284',
    subjectId: liPersonId,
    predicate: 'participated-in-council-questioning',
    claimType: 'council-questioning',
    object: {
      title: '黃香菽、李眉蓁、吳利成議員總質詢摘要',
      organization: '高雄市議會',
      topic: '人口減少、青年就業與居住成本；捷運紫線與北高交通',
    },
    qualifiers: { sourceArticle: '17284' },
    validFrom: null,
    validTo: null,
    assertedAt: '2026-10-06',
    ...claimReview,
    evidenceIds: ['evidence-li-news-17284'],
  },
  {
    claimId: 'claim-li-questioning-17102',
    subjectId: liPersonId,
    predicate: 'participated-in-council-questioning',
    claimType: 'council-questioning',
    object: {
      title: '李眉蓁、黃香菽、陳美雅、陳善慧、何權峰、李亞築議員總質詢摘要',
      organization: '高雄市議會',
      topic: '捷運紫線與北高雄交通建設',
    },
    qualifiers: { sourceArticle: '17102' },
    validFrom: null,
    validTo: null,
    assertedAt: '2026-05-22',
    ...claimReview,
    evidenceIds: ['evidence-li-news-17102'],
  },
  {
    claimId: 'claim-wang-questioning-17293',
    subjectId: wangPersonId,
    predicate: 'participated-in-council-questioning',
    claimType: 'council-questioning',
    object: {
      title: '黃彥毓、鍾易仲、王義雄、簡煥宗、王耀裕、李雅慧議員總質詢摘要',
      organization: '高雄市議會',
      topic: '原住民族議題、文化節與公共建設',
    },
    qualifiers: { sourceArticle: '17293' },
    validFrom: null,
    validTo: null,
    assertedAt: '2026-10-13',
    ...claimReview,
    evidenceIds: ['evidence-wang-news-17293'],
  },
  {
    claimId: 'claim-wang-questioning-17093',
    subjectId: wangPersonId,
    predicate: 'participated-in-council-questioning',
    claimType: 'council-questioning',
    object: {
      title: '郭建盟、林義迪、陳玫娟、黃文益、王義雄議員總質詢摘要',
      organization: '高雄市議會',
      topic: '原住民族權益、原民會政策執行與公共服務',
    },
    qualifiers: { sourceArticle: '17093' },
    validFrom: null,
    validTo: null,
    assertedAt: '2026-05-12',
    ...claimReview,
    evidenceIds: ['evidence-wang-news-17093'],
  },
];

const evidence: Evidence[] = [
  {
    evidenceId: 'evidence-li-member-profile',
    sourceId: sources.liMember,
    claimId: 'claim-li-current-council-position',
    evidenceType: 'institutional-profile',
    supportType: 'supports',
    documentLocation: '官方頁面標題「本屆議員-李眉蓁」',
    quotedText: '本屆議員-李眉蓁',
    retrievedAt: snapshotDate,
    verificationStatus: 'Verified',
    reviewStatus: 'pending-review',
  },
  {
    evidenceId: 'evidence-wang-member-profile',
    sourceId: sources.wangMember,
    claimId: 'claim-wang-current-council-position',
    evidenceType: 'institutional-profile',
    supportType: 'supports',
    documentLocation: '官方頁面標題「本屆議員-王義雄」',
    quotedText: '本屆議員-王義雄',
    retrievedAt: snapshotDate,
    verificationStatus: 'Verified',
    reviewStatus: 'pending-review',
  },
  {
    evidenceId: 'evidence-li-news-17284',
    sourceId: sources.li17284,
    claimId: 'claim-li-questioning-17284',
    evidenceType: 'official-news',
    supportType: 'supports',
    documentLocation: '「李眉蓁議員總質詢摘要」段落',
    quotedText: quotes.li17284,
    retrievedAt: snapshotDate,
    verificationStatus: 'Verified',
    reviewStatus: 'pending-review',
  },
  {
    evidenceId: 'evidence-li-news-17102',
    sourceId: sources.li17102,
    claimId: 'claim-li-questioning-17102',
    evidenceType: 'official-news',
    supportType: 'supports',
    documentLocation: '「李眉蓁議員總質詢摘要」段落',
    quotedText: quotes.li17102,
    retrievedAt: snapshotDate,
    verificationStatus: 'Verified',
    reviewStatus: 'pending-review',
  },
  {
    evidenceId: 'evidence-wang-news-17293',
    sourceId: sources.wang17293,
    claimId: 'claim-wang-questioning-17293',
    evidenceType: 'official-news',
    supportType: 'supports',
    documentLocation: '「王義雄議員總質詢摘要」段落',
    quotedText: quotes.wang17293,
    retrievedAt: snapshotDate,
    verificationStatus: 'Verified',
    reviewStatus: 'pending-review',
  },
  {
    evidenceId: 'evidence-wang-news-17093',
    sourceId: sources.wang17093,
    claimId: 'claim-wang-questioning-17093',
    evidenceType: 'official-news',
    supportType: 'supports',
    documentLocation: '「王義雄議員總質詢摘要」段落',
    quotedText: quotes.wang17093,
    retrievedAt: snapshotDate,
    verificationStatus: 'Verified',
    reviewStatus: 'pending-review',
  },
];

const reviewFields = {
  verificationStatus: 'Verified' as const,
  reviewStatus: 'pending-review' as const,
  publicationStatus: 'approved-source-backed' as const,
};

const positions: PositionRecord[] = [
  {
    id: 'position-li-current-council-member',
    personId: liPersonId,
    title: '高雄市議員',
    organization: '高雄市議會',
    startDate: null,
    endDate: null,
    currentStatus: 'current',
    lastVerifiedAt: snapshotDate,
    ...reviewFields,
    claimIds: ['claim-li-current-council-position'],
    evidenceIds: ['evidence-li-member-profile'],
  },
  {
    id: 'position-wang-current-council-member',
    personId: wangPersonId,
    title: '高雄市議員',
    organization: '高雄市議會',
    startDate: null,
    endDate: null,
    currentStatus: 'current',
    lastVerifiedAt: snapshotDate,
    ...reviewFields,
    claimIds: ['claim-wang-current-council-position'],
    evidenceIds: ['evidence-wang-member-profile'],
  },
];

const activity = (
  id: string,
  personId: string,
  title: string,
  eventDate: string,
  description: string,
  claimId: string,
  evidenceId: string,
): PublicActivityRecord => ({
  id,
  personId,
  activityType: 'council-questioning',
  title,
  eventDate,
  organization: '高雄市議會',
  role: '議員總質詢',
  description,
  documentedOutcome: null,
  attribution: 'documented-participation',
  ...reviewFields,
  claimIds: [claimId],
  evidenceIds: [evidenceId],
});

const activities: PublicActivityRecord[] = [
  activity(
    'activity-li-questioning-17284',
    liPersonId,
    '黃香菽、李眉蓁、吳利成議員總質詢摘要',
    '2026-10-06',
    '官方摘要記錄李眉蓁就人口減少、薪資與居住成本、青年創業及捷運紫線與北高交通提出質詢。這是公開參與紀錄，不等同於政策已完成或由個人單獨促成結果。',
    'claim-li-questioning-17284',
    'evidence-li-news-17284',
  ),
  activity(
    'activity-li-questioning-17102',
    liPersonId,
    '李眉蓁、黃香菽、陳美雅、陳善慧、何權峰、李亞築議員總質詢摘要',
    '2026-05-22',
    '官方摘要記錄李眉蓁針對捷運紫線與北高雄交通建設提出質詢。這是公開參與紀錄，不等同於工程核定或完成。',
    'claim-li-questioning-17102',
    'evidence-li-news-17102',
  ),
  activity(
    'activity-wang-questioning-17293',
    wangPersonId,
    '黃彥毓、鍾易仲、王義雄、簡煥宗、王耀裕、李雅慧議員總質詢摘要',
    '2026-10-13',
    '官方摘要記錄王義雄就原住民族議題、文化節與公共建設提出質詢。這是公開參與紀錄，不等同於行政成果已由個人完成。',
    'claim-wang-questioning-17293',
    'evidence-wang-news-17293',
  ),
  activity(
    'activity-wang-questioning-17093',
    wangPersonId,
    '郭建盟、林義迪、陳玫娟、黃文益、王義雄議員總質詢摘要',
    '2026-05-12',
    '官方摘要記錄王義雄追蹤原住民族權益與原民會政策執行情形。這是公開參與紀錄，不等同於相關政策或預算已完成。',
    'claim-wang-questioning-17093',
    'evidence-wang-news-17093',
  ),
];

const news: NewsRecord[] = [
  {
    id: 'news-kcc-17284-li',
    personIds: [liPersonId],
    headline: '黃香菽、李眉蓁、吳利成議員總質詢摘要',
    publisher: '高雄市議會',
    originalUrl: 'https://www.kcc.gov.tw/News_Content.aspx?n=47&s=17284',
    publicationDate: '2026-10-06',
    topicTags: ['議會質詢', '交通', '居住'],
    editorialSummary:
      '高雄市議會發布的機關性摘要，記錄李眉蓁在該次總質詢提出的議題；本頁不將質詢內容改寫成政策承諾或行政成果。',
    contentType: 'institutional-update',
    sourceDependencies: [sources.li17284],
    duplicateOf: null,
    ...reviewFields,
    claimIds: ['claim-li-questioning-17284'],
    evidenceIds: ['evidence-li-news-17284'],
  },
  {
    id: 'news-kcc-17102-li',
    personIds: [liPersonId],
    headline: '李眉蓁、黃香菽、陳美雅、陳善慧、何權峰、李亞築議員總質詢摘要',
    publisher: '高雄市議會',
    originalUrl: 'https://www.kcc.gov.tw/News_Content.aspx?n=47&s=17102',
    publicationDate: '2026-05-22',
    topicTags: ['議會質詢', '交通'],
    editorialSummary:
      '高雄市議會發布的機關性摘要，記錄李眉蓁針對捷運紫線與北高雄交通提出質詢；不代表工程已核定或完成。',
    contentType: 'institutional-update',
    sourceDependencies: [sources.li17102],
    duplicateOf: null,
    ...reviewFields,
    claimIds: ['claim-li-questioning-17102'],
    evidenceIds: ['evidence-li-news-17102'],
  },
  {
    id: 'news-kcc-17293-wang',
    personIds: [wangPersonId],
    headline: '黃彥毓、鍾易仲、王義雄、簡煥宗、王耀裕、李雅慧議員總質詢摘要',
    publisher: '高雄市議會',
    originalUrl: 'https://www.kcc.gov.tw/News_Content.aspx?n=47&s=17293',
    publicationDate: '2026-10-13',
    topicTags: ['議會質詢', '原住民族'],
    editorialSummary:
      '高雄市議會發布的機關性摘要，記錄王義雄針對原住民族議題與公共建設提出質詢；不將質詢視為行政成果。',
    contentType: 'institutional-update',
    sourceDependencies: [sources.wang17293],
    duplicateOf: null,
    ...reviewFields,
    claimIds: ['claim-wang-questioning-17293'],
    evidenceIds: ['evidence-wang-news-17293'],
  },
  {
    id: 'news-kcc-17093-wang',
    personIds: [wangPersonId],
    headline: '郭建盟、林義迪、陳玫娟、黃文益、王義雄議員總質詢摘要',
    publisher: '高雄市議會',
    originalUrl: 'https://www.kcc.gov.tw/News_Content.aspx?n=47&s=17093',
    publicationDate: '2026-05-12',
    topicTags: ['議會質詢', '原住民族', '公共服務'],
    editorialSummary:
      '高雄市議會發布的機關性摘要，記錄王義雄追蹤原住民族權益與政策執行；不將質詢視為政策已完成。',
    contentType: 'institutional-update',
    sourceDependencies: [sources.wang17093],
    duplicateOf: null,
    ...reviewFields,
    claimIds: ['claim-wang-questioning-17093'],
    evidenceIds: ['evidence-wang-news-17093'],
  },
];

const timeline: TimelineEventRecord[] = [
  {
    id: 'timeline-li-current-council-member',
    personId: liPersonId,
    eventDate: null,
    title: '官方議員頁面列示本屆議員身分',
    category: 'public-office',
    description:
      '高雄市議會官方頁面以「本屆議員-李眉蓁」列示其機構身分；頁面未提供可供本資料集確認的完整任期起日。',
    ...reviewFields,
    claimIds: ['claim-li-current-council-position'],
    evidenceIds: ['evidence-li-member-profile'],
  },
  {
    id: 'timeline-wang-current-council-member',
    personId: wangPersonId,
    eventDate: null,
    title: '官方議員頁面列示本屆議員身分',
    category: 'public-office',
    description:
      '高雄市議會官方頁面以「本屆議員-王義雄」列示其機構身分；頁面未提供可供本資料集確認的完整任期起日。',
    ...reviewFields,
    claimIds: ['claim-wang-current-council-position'],
    evidenceIds: ['evidence-wang-member-profile'],
  },
  ...activities.map((item) => ({
    id: `timeline-${item.id}`,
    personId: item.personId,
    eventDate: item.eventDate,
    title: item.title,
    category: 'public-activity' as const,
    description: item.description,
    verificationStatus: item.verificationStatus,
    reviewStatus: item.reviewStatus,
    publicationStatus: item.publicationStatus,
    claimIds: item.claimIds,
    evidenceIds: item.evidenceIds,
  })),
];

const identityResolutions: IdentityResolution[] = [
  {
    resolutionId: 'identity-li-kcc-member-2186',
    personId: liPersonId,
    sourceId: sources.liMember,
    sourceIdentifier: 'msn=2186',
    observedName: liProfile.displayName,
    matchBasis: [
      'KCC source-specific member identifier msn=2186',
      'exact name match to approved 2026 candidacy 李眉蓁',
      'ordinary-council district 4 context retained separately',
    ],
    status: 'resolved',
    evidenceIds: ['evidence-li-member-profile'],
  },
  {
    resolutionId: 'identity-wang-kcc-member-2230',
    personId: wangPersonId,
    sourceId: sources.wangMember,
    sourceIdentifier: 'msn=2230',
    observedName: wangProfile.displayName,
    matchBasis: [
      'KCC source-specific member identifier msn=2230',
      'exact name match to approved 2026 candidacy 王義雄',
      'indigenous flat constituency context retained separately',
    ],
    status: 'resolved',
    evidenceIds: ['evidence-wang-member-profile'],
  },
];

const dataset: PublicRecordsDataset = {
  datasetId: 'kaohsiung-2026-public-records',
  snapshotDate,
  selectedCandidateIds: [laiCandidateId, liCandidateId, wangCandidateId],
  selectedPersonIds: [laiPersonId, liPersonId, wangPersonId],
  sourceIds: Object.values(sources),
  claims,
  evidence,
  positions,
  policies: [],
  activities,
  news,
  relationships: [],
  timeline,
  identityResolutions,
  conflicts: [],
  review: {
    status: 'pending-human-review',
    reviewerId: null,
    reviewedAt: null,
    note: '官方機構快照與摘要已完成離線來源核對；尚未有可記錄的人工審核者或審核時間，因此所有公開項目仍標示待人工覆核。賴瑞隆在本切片沒有足夠的公共紀錄來源，保留為中性空白。',
  },
};

validatePublicRecordsDataset(dataset, new Set(Object.values(sources)));

const reviewPacket = {
  datasetId: dataset.datasetId,
  snapshotDate,
  reviewStatus: dataset.review.status,
  reviewerId: null,
  reviewedAt: null,
  disposition: 'source-checked-pending-human-review',
  selectedCandidates: [
    {
      candidateId: laiCandidateId,
      personId: laiPersonId,
      displayName: '賴瑞隆',
      categories: {
        positions: 'unavailable',
        policies: 'unavailable',
        activities: 'unavailable',
        news: 'unavailable',
        relationships: 'unavailable',
        timeline: 'unavailable',
      },
    },
    {
      candidateId: liCandidateId,
      personId: liPersonId,
      displayName: '李眉蓁',
      categories: {
        positions: 'pending-review',
        policies: 'unavailable',
        activities: 'pending-review',
        news: 'pending-review',
        relationships: 'unavailable',
        timeline: 'pending-review',
      },
    },
    {
      candidateId: wangCandidateId,
      personId: wangPersonId,
      displayName: '王義雄',
      categories: {
        positions: 'pending-review',
        policies: 'unavailable',
        activities: 'pending-review',
        news: 'pending-review',
        relationships: 'unavailable',
        timeline: 'pending-review',
      },
    },
  ],
  claims: claims.map((claim) => ({
    claimId: claim.claimId,
    subjectId: claim.subjectId,
    evidenceIds: claim.evidenceIds,
    disposition: 'pending-human-review',
    rationale: '來源文字與候選人身分已由離線適配器核對；尚無人工審核者可記錄。',
  })),
  notes: [
    'KCC member pages provide current institutional identity only; their party text is not copied into the 2026 candidacy record.',
    'KCC questioning summaries support documented participation, not personal achievement, policy completion, or administrative outcome.',
    'No family or political relationship is published because no qualifying evidence was captured in this representative slice.',
  ],
};

const output = (relative: string, value: unknown) =>
  writeFile(
    path.join(root, relative),
    `${JSON.stringify(value, null, 2)}\n`,
    'utf8',
  );
await mkdir(path.join(root, 'data/normalized/2026'), { recursive: true });
await mkdir(path.join(root, 'data/review/2026'), { recursive: true });
await mkdir(path.join(root, 'data/approved/2026'), { recursive: true });
await output('data/normalized/2026/kaohsiung-public-records.json', dataset);
await output('data/review/2026/public-records-review.json', reviewPacket);
await output('data/approved/2026/kaohsiung-public-records.json', dataset);
console.log(
  `Generated public-record slice for ${dataset.selectedCandidateIds.length} selected candidates: ${dataset.activities.length} activities, ${dataset.news.length} news records, ${dataset.positions.length} positions.`,
);
