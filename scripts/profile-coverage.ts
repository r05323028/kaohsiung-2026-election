import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { officialCandidateProfiles } from '../src/data/official';
import type { CandidateProfileView } from '../src/data/view';

const REPORT_DIR = resolve('reports');
const COVERAGE_PATH = resolve(REPORT_DIR, 'candidate-profile-coverage.json');
const COVERAGE_MARKDOWN_PATH = resolve(
  REPORT_DIR,
  'candidate-profile-coverage.md',
);
const SOURCE_PATH = resolve(
  REPORT_DIR,
  'candidate-profile-source-quality.json',
);
const SOURCE_MARKDOWN_PATH = resolve(
  REPORT_DIR,
  'candidate-profile-source-quality.md',
);

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

const PROFILE_TAB_LABELS = [
  '基本資料',
  '政策主張',
  '相關新聞',
  '從政歷程',
  '家族從政關係',
] as const;

type CandidateInventory = {
  candidateId: string;
  slug: string;
  name: string;
  district: string;
  electionType: string;
  structurallySupported: boolean;
  verifiedBasicInfo: boolean;
  rosterSourceCount: number;
  publishedPolicyCount: number;
  pendingPolicyCount: number;
  publishedNewsCount: number;
  publishedCareerRecordCount: number;
  publishedPositionCount: number;
  publishedActivityCount: number;
  publishedTimelineCount: number;
  automatedHistoricalClaimCount: number;
  formerLegislator: boolean;
  hasVerifiedProposal: boolean;
  hasVerifiedIndividualVote: boolean;
  formerExecutive: boolean;
  hasVerifiedExecutiveInitiative: boolean;
  policyResearchOutcome: string;
  missingOrUnavailable: string[];
};

type CoverageReport = {
  reportId: 'candidate-profile-five-section-coverage';
  snapshotDate: string;
  profileTabs: readonly string[];
  totalCandidates: number;
  candidatesStructurallySupported: number;
  candidatesWithVerifiedBasicInformation: number;
  candidatesWithVerifiedPolicyStatements: number;
  candidatesWithPendingPolicyResearch: number;
  candidatesWithVerifiedNews: number;
  formerLegislatorsWithVerifiedProposals: number;
  formerLegislatorsWithVerifiedIndividualVotingRecords: number;
  formerExecutivesWithVerifiedPolicyInitiatives: number;
  publishedPolicyCount: number;
  pendingPolicyCount: number;
  publishedNewsCount: number;
  publishedCareerRecordCount: number;
  unavailableCandidateResearchCount: number;
  recordsRejectedForInsufficientEvidence: number;
  recordsPendingHumanReview: number;
  identityOrAttributionConflictCount: number;
  individualVoteRecordCount: number;
  coverageByDistrict: Array<{
    district: string;
    candidateCount: number;
    candidatesWithVerifiedBasicInformation: number;
    publishedPolicyCount: number;
    pendingPolicyCount: number;
    publishedNewsCount: number;
    publishedCareerRecordCount: number;
  }>;
  candidateInventory: CandidateInventory[];
  limitations: string[];
};

type SourceQualityReport = {
  reportId: 'candidate-profile-source-quality';
  snapshotDate: string;
  totalCandidates: number;
  candidatesWithAtLeastOneSource: number;
  sourceReferenceCount: number;
  uniqueSourceCount: number;
  sourceVerificationStatusCounts: Record<string, number>;
  sourcePublisherCounts: Record<string, number>;
  publishedRecordCount: number;
  publishedRecordWithEvidenceCount: number;
  publishedRecordWithResolvedSourcesCount: number;
  sourceReferenceIssues: string[];
  identityOrAttributionConflictCount: number;
  recordReviewStatusCounts: Record<string, number>;
  recordVerificationStatusCounts: Record<string, number>;
  rejectedOrInsufficientRecordCount: number;
  limitations: string[];
};

function increment(
  counts: Record<string, number>,
  key: string,
  amount = 1,
): void {
  counts[key] = (counts[key] ?? 0) + amount;
}

function createCounts(): Record<string, number> {
  return {};
}

function isPublishedRecord(record: {
  publicationStatus: string;
  verificationStatus: string;
}): boolean {
  return (
    record.publicationStatus === 'approved-source-backed' &&
    record.verificationStatus === 'Verified'
  );
}

function publicCareerRecordCount(candidate: CandidateProfileView): number {
  const bundle = candidate.publicRecords;
  if (!bundle) return 0;
  return (
    bundle.positions.filter(isPublishedRecord).length +
    bundle.activities.filter(isPublishedRecord).length +
    bundle.timeline.filter(isPublishedRecord).length
  );
}

function profileInventory(candidate: CandidateProfileView): CandidateInventory {
  const bundle = candidate.publicRecords;
  const positions = bundle?.positions.filter(isPublishedRecord) ?? [];
  const activities = bundle?.activities.filter(isPublishedRecord) ?? [];
  const news = bundle?.news.filter(isPublishedRecord) ?? [];
  const policies = bundle?.policies.filter(isPublishedRecord) ?? [];
  const timeline = bundle?.timeline.filter(isPublishedRecord) ?? [];
  const pendingPolicyCount = candidate.policyResearch?.policyCount ?? 0;
  const automatedHistoricalClaimCount =
    candidate.automatedPublication?.claims.length ?? 0;
  const missingOrUnavailable: string[] = [];

  if (candidate.sources.length === 0)
    missingOrUnavailable.push('未保留可供查閱的候選人來源');
  if (policies.length === 0) missingOrUnavailable.push('尚無已核准政策紀錄');
  if (news.length === 0) missingOrUnavailable.push('尚無已核准新聞紀錄');
  if (
    activities.length === 0 &&
    positions.length === 0 &&
    timeline.length === 0
  )
    missingOrUnavailable.push('尚無已核准從政歷程紀錄');
  if (pendingPolicyCount > 0)
    missingOrUnavailable.push('政策研究紀錄仍待人工／編輯審查');
  if (candidate.policyResearch?.outcome === 'sources-unavailable')
    missingOrUnavailable.push('候選人特定政策來源未保留或無法取得');
  if (candidate.policyResearch?.outcome === 'no-verifiable-policy-found')
    missingOrUnavailable.push('已完成研究嘗試但未找到足夠可查證政策');

  const hasVerifiedProposal = activities.some(
    (activity) => activity.activityType === 'legislative-proposal',
  );
  const hasVerifiedExecutiveInitiative = activities.some(
    (activity) => activity.activityType === 'government-project',
  );

  return {
    candidateId: candidate.candidacy.id,
    slug: candidate.candidacy.slug,
    name: candidate.person.displayName,
    district: candidate.district.name,
    electionType: candidate.candidacy.electionType,
    structurallySupported: true,
    verifiedBasicInfo:
      candidate.sources.length > 0 &&
      candidate.candidacy.publicationStatus === 'approved',
    rosterSourceCount: candidate.sources.length,
    publishedPolicyCount: policies.length,
    pendingPolicyCount,
    publishedNewsCount: news.length,
    publishedCareerRecordCount: publicCareerRecordCount(candidate),
    publishedPositionCount: positions.length,
    publishedActivityCount: activities.length,
    publishedTimelineCount: timeline.length,
    automatedHistoricalClaimCount,
    formerLegislator: Boolean(
      candidate.candidacy.currentPosition.includes('議員') ||
        positions.some((position) => position.organization.includes('議會')),
    ),
    hasVerifiedProposal,
    hasVerifiedIndividualVote: false,
    formerExecutive: Boolean(
      candidate.candidacy.currentPosition.includes('市長') ||
        positions.some((position) =>
          /部長|局長|首長|副市長/.test(position.title),
        ),
    ),
    hasVerifiedExecutiveInitiative,
    policyResearchOutcome:
      candidate.policyResearch?.outcome ?? 'not-researched',
    missingOrUnavailable,
  };
}

function collectRecords(candidate: CandidateProfileView) {
  const bundle = candidate.publicRecords;
  if (!bundle) return [];
  return [
    ...bundle.positions,
    ...bundle.policies,
    ...bundle.activities,
    ...bundle.news,
    ...bundle.relationships,
    ...bundle.timeline,
  ];
}

function buildReports() {
  const inventories = officialCandidateProfiles
    .map(profileInventory)
    .sort((a, b) => compareText(a.candidateId, b.candidateId));
  const totalCandidates = inventories.length;
  const publishedPolicyCount = inventories.reduce(
    (sum, item) => sum + item.publishedPolicyCount,
    0,
  );
  const pendingPolicyCount = inventories.reduce(
    (sum, item) => sum + item.pendingPolicyCount,
    0,
  );
  const publishedNewsCount = inventories.reduce(
    (sum, item) => sum + item.publishedNewsCount,
    0,
  );
  const publishedCareerRecordCount = inventories.reduce(
    (sum, item) => sum + item.publishedCareerRecordCount,
    0,
  );

  const districts = new Map<
    string,
    {
      candidateCount: number;
      candidatesWithVerifiedBasicInformation: number;
      publishedPolicyCount: number;
      pendingPolicyCount: number;
      publishedNewsCount: number;
      publishedCareerRecordCount: number;
    }
  >();
  for (const item of inventories) {
    const district = districts.get(item.district) ?? {
      candidateCount: 0,
      candidatesWithVerifiedBasicInformation: 0,
      publishedPolicyCount: 0,
      pendingPolicyCount: 0,
      publishedNewsCount: 0,
      publishedCareerRecordCount: 0,
    };
    district.candidateCount += 1;
    district.candidatesWithVerifiedBasicInformation += item.verifiedBasicInfo
      ? 1
      : 0;
    district.publishedPolicyCount += item.publishedPolicyCount;
    district.pendingPolicyCount += item.pendingPolicyCount;
    district.publishedNewsCount += item.publishedNewsCount;
    district.publishedCareerRecordCount += item.publishedCareerRecordCount;
    districts.set(item.district, district);
  }

  let publishedRecordCount = 0;
  let publishedRecordWithEvidenceCount = 0;
  let publishedRecordWithResolvedSourcesCount = 0;
  let rejectedOrInsufficientRecordCount = 0;
  let recordsPendingHumanReview = 0;
  let identityOrAttributionConflictCount = 0;
  const individualVoteRecordCount = 0;
  const sourceReferenceIssues: string[] = [];
  const recordReviewStatusCounts = createCounts();
  const recordVerificationStatusCounts = createCounts();

  for (const candidate of officialCandidateProfiles) {
    const bundle = candidate.publicRecords;
    if (!bundle) continue;
    identityOrAttributionConflictCount += bundle.conflicts.length;
    const candidateSourceIds = new Set(
      candidate.sources.map((source) => source.id),
    );
    const claimIds = new Set(bundle.claims.map((claim) => claim.claimId));
    const evidenceById = new Map(
      bundle.evidence.map((evidence) => [evidence.evidenceId, evidence]),
    );

    for (const record of collectRecords(candidate)) {
      increment(recordReviewStatusCounts, record.reviewStatus);
      increment(recordVerificationStatusCounts, record.verificationStatus);
      if (
        record.reviewStatus === 'rejected' ||
        record.verificationStatus === 'Insufficient information'
      )
        rejectedOrInsufficientRecordCount += 1;
      if (record.reviewStatus === 'pending-review')
        recordsPendingHumanReview += 1;
      if (!isPublishedRecord(record)) continue;
      publishedRecordCount += 1;
      const evidence = record.evidenceIds
        .map((evidenceId) => evidenceById.get(evidenceId))
        .filter((item) => item !== undefined);
      if (evidence.length === record.evidenceIds.length) {
        publishedRecordWithEvidenceCount += 1;
      } else {
        sourceReferenceIssues.push(`${record.id}: references missing evidence`);
      }
      if (evidence.every((item) => candidateSourceIds.has(item.sourceId))) {
        publishedRecordWithResolvedSourcesCount += 1;
      } else {
        sourceReferenceIssues.push(
          `${record.id}: evidence source is not attached to candidate`,
        );
      }
      for (const claimId of record.claimIds) {
        if (!claimIds.has(claimId))
          sourceReferenceIssues.push(
            `${record.id}: references missing claim ${claimId}`,
          );
      }
    }
    for (const evidence of bundle.evidence) {
      if (!candidateSourceIds.has(evidence.sourceId)) {
        sourceReferenceIssues.push(
          `${evidence.evidenceId}: source ${evidence.sourceId} is not attached to candidate`,
        );
      }
    }
  }

  const sourceVerificationStatusCounts = createCounts();
  const sourcePublisherCounts = createCounts();
  const seenSourceIds = new Set<string>();
  let sourceReferenceCount = 0;
  for (const candidate of officialCandidateProfiles) {
    sourceReferenceCount += candidate.sources.length;
    for (const source of candidate.sources) {
      if (!seenSourceIds.has(source.id)) {
        seenSourceIds.add(source.id);
        increment(sourceVerificationStatusCounts, source.verificationStatus);
        increment(sourcePublisherCounts, source.publisher);
      }
    }
  }

  const coverage: CoverageReport = {
    reportId: 'candidate-profile-five-section-coverage',
    snapshotDate: '2026-11-09',
    profileTabs: PROFILE_TAB_LABELS,
    totalCandidates,
    candidatesStructurallySupported: inventories.filter(
      (item) => item.structurallySupported,
    ).length,
    candidatesWithVerifiedBasicInformation: inventories.filter(
      (item) => item.verifiedBasicInfo,
    ).length,
    candidatesWithVerifiedPolicyStatements: inventories.filter(
      (item) => item.publishedPolicyCount > 0,
    ).length,
    candidatesWithPendingPolicyResearch: inventories.filter(
      (item) => item.pendingPolicyCount > 0,
    ).length,
    candidatesWithVerifiedNews: inventories.filter(
      (item) => item.publishedNewsCount > 0,
    ).length,
    formerLegislatorsWithVerifiedProposals: inventories.filter(
      (item) => item.hasVerifiedProposal,
    ).length,
    formerLegislatorsWithVerifiedIndividualVotingRecords: inventories.filter(
      (item) => item.hasVerifiedIndividualVote,
    ).length,
    formerExecutivesWithVerifiedPolicyInitiatives: inventories.filter(
      (item) => item.hasVerifiedExecutiveInitiative,
    ).length,
    publishedPolicyCount,
    pendingPolicyCount,
    publishedNewsCount,
    publishedCareerRecordCount,
    unavailableCandidateResearchCount: inventories.filter((item) =>
      item.missingOrUnavailable.some((reason) => reason.includes('來源未保留')),
    ).length,
    recordsRejectedForInsufficientEvidence: rejectedOrInsufficientRecordCount,
    recordsPendingHumanReview: recordsPendingHumanReview,
    identityOrAttributionConflictCount,
    individualVoteRecordCount,
    coverageByDistrict: [...districts.entries()]
      .map(([district, counts]) => ({ district, ...counts }))
      .sort((a, b) => compareText(a.district, b.district)),
    candidateInventory: inventories,
    limitations: [
      '政策研究與候選人傳記讀模型中的待審紀錄未進入公開內容；pending count 只用於覆蓋報告。',
      '現有公開資料集沒有可查證的個別點名表決紀錄；未由黨籍、發言或集體結果推論投票。',
      '相關新聞僅呈現已核准的公開新聞，依發布日期排序，不標示正負面或做編輯評價。',
      '候選人特定來源缺漏、無法取得或未完成身份核對時，報告保留缺口，不將缺口解讀為沒有相關事實。',
      '現有 production roster 的基本資料來源與公共紀錄來源分屬不同驗證層級；本報告不將候選人自述當作履行成效。',
    ],
  };

  const sourceQuality: SourceQualityReport = {
    reportId: 'candidate-profile-source-quality',
    snapshotDate: '2026-11-09',
    totalCandidates,
    candidatesWithAtLeastOneSource: officialCandidateProfiles.filter(
      (candidate) => candidate.sources.length > 0,
    ).length,
    sourceReferenceCount,
    uniqueSourceCount: seenSourceIds.size,
    sourceVerificationStatusCounts,
    sourcePublisherCounts,
    publishedRecordCount,
    publishedRecordWithEvidenceCount,
    publishedRecordWithResolvedSourcesCount,
    sourceReferenceIssues: [...new Set(sourceReferenceIssues)].sort((a, b) =>
      compareText(a, b),
    ),
    identityOrAttributionConflictCount,
    recordReviewStatusCounts,
    recordVerificationStatusCounts,
    rejectedOrInsufficientRecordCount,
    limitations: [
      '來源品質統計以 profile read model 可查閱的來源 metadata 為準；原始快照與 SHA-256 仍由各 ingestion pipeline 保存。',
      '公開紀錄的 publicationStatus 與 claim/evidence reviewStatus 是不同閘門；本報告不把來源核取自動等同人工編輯核准。',
      '候選人政策研究中的待審 claims 未算入 publishedRecordCount。',
      '目前沒有獨立的 vote record schema 或公開個別點名表決資料。',
    ],
  };

  return { coverage, sourceQuality };
}

function markdownCoverage(report: CoverageReport): string {
  const rows = report.candidateInventory
    .map(
      (item) =>
        `| ${item.name} | ${item.district} | ${item.verifiedBasicInfo ? '是' : '否'} | ${item.publishedPolicyCount} | ${item.pendingPolicyCount} | ${item.publishedNewsCount} | ${item.publishedCareerRecordCount} | ${item.policyResearchOutcome} |`,
    )
    .join('\n');
  return `# 候選人五區塊覆蓋報告

- 快照日期：${report.snapshotDate}
- 候選人總數：${report.totalCandidates}
- 五區塊結構完整：${report.candidatesStructurallySupported}
- 有來源的基本資料：${report.candidatesWithVerifiedBasicInformation}
- 已核准政策紀錄：${report.publishedPolicyCount} 筆／${report.candidatesWithVerifiedPolicyStatements} 位
- 待審政策研究：${report.pendingPolicyCount} 筆／${report.candidatesWithPendingPolicyResearch} 位
- 已核准新聞：${report.publishedNewsCount} 筆／${report.candidatesWithVerifiedNews} 位（依發布日期排序）
- 有查證提案的前立法者：${report.formerLegislatorsWithVerifiedProposals} 位
- 有查證個別表決紀錄：${report.formerLegislatorsWithVerifiedIndividualVotingRecords} 位
- 有查證行政政策推動：${report.formerExecutivesWithVerifiedPolicyInitiatives} 位
- 已核准從政紀錄：${report.publishedCareerRecordCount} 筆
- 來源不足／不可用的候選人研究：${report.unavailableCandidateResearchCount} 位
- 因證據不足拒絕的紀錄：${report.recordsRejectedForInsufficientEvidence} 筆
- 待人工審查紀錄：${report.recordsPendingHumanReview} 筆
- 身份／歸屬衝突：${report.identityOrAttributionConflictCount} 筆

## 分區覆蓋

| 選區 | 候選人 | 基本資料 | 已核准政策 | 待審政策 | 已核准新聞 | 已核准從政紀錄 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
${report.coverageByDistrict
  .map(
    (item) =>
      `| ${item.district} | ${item.candidateCount} | ${item.candidatesWithVerifiedBasicInformation} | ${item.publishedPolicyCount} | ${item.pendingPolicyCount} | ${item.publishedNewsCount} | ${item.publishedCareerRecordCount} |`,
  )
  .join('\n')}

## 候選人明細

| 候選人 | 選區 | 基本資料 | 已核准政策 | 待審政策 | 已核准新聞 | 從政紀錄 | 政策研究結果 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
${rows}

## 限制與缺口

${report.limitations.map((item) => `- ${item}`).join('\n')}
`;
}

function markdownSourceQuality(report: SourceQualityReport): string {
  const statusRows = Object.entries(report.sourceVerificationStatusCounts)
    .sort(([a], [b]) => compareText(a, b))
    .map(([key, value]) => `| ${key} | ${value} |`)
    .join('\n');
  const publisherRows = Object.entries(report.sourcePublisherCounts)
    .sort(([a], [b]) => compareText(a, b))
    .map(([key, value]) => `| ${key} | ${value} |`)
    .join('\n');
  return `# 候選人五區塊來源品質報告

- 快照日期：${report.snapshotDate}
- 候選人總數：${report.totalCandidates}
- 至少一筆來源的候選人：${report.candidatesWithAtLeastOneSource}
- Profile source reference 次數：${report.sourceReferenceCount}
- 不重複來源數：${report.uniqueSourceCount}
- 已核准且有 evidence 的紀錄：${report.publishedRecordWithEvidenceCount}/${report.publishedRecordCount}
- 已核准且 evidence source 可由候選人來源解析的紀錄：${report.publishedRecordWithResolvedSourcesCount}/${report.publishedRecordCount}
- 來源 reference 問題：${report.sourceReferenceIssues.length}
- 身份／歸屬衝突：${report.identityOrAttributionConflictCount}
- 因證據不足拒絕的紀錄：${report.rejectedOrInsufficientRecordCount}

## 來源驗證狀態

| 狀態 | 數量 |
| --- | ---: |
${statusRows}

## 來源出版者

| 出版者 | 不重複來源數 |
| --- | ---: |
${publisherRows}

## Record review status

${
  Object.entries(report.recordReviewStatusCounts)
    .sort(([a], [b]) => compareText(a, b))
    .map(([key, value]) => `- ${key}：${value}`)
    .join('\n') || '- 無公開紀錄'
}

## Record verification status

${
  Object.entries(report.recordVerificationStatusCounts)
    .sort(([a], [b]) => compareText(a, b))
    .map(([key, value]) => `- ${key}：${value}`)
    .join('\n') || '- 無公開紀錄'
}

## 限制

${report.limitations.map((item) => `- ${item}`).join('\n')}
${report.sourceReferenceIssues.length > 0 ? `\n## Source reference issues\n\n${report.sourceReferenceIssues.map((item) => `- ${item}`).join('\n')}\n` : ''}
`;
}

function normalizeMarkdown(value: string): string {
  return `${value.trimEnd()}\n`;
}

function writeReports(): void {
  const { coverage, sourceQuality } = buildReports();
  mkdirSync(REPORT_DIR, { recursive: true });
  const coverageJson = `${JSON.stringify(coverage, null, 2)}\n`;
  const coverageMarkdown = normalizeMarkdown(markdownCoverage(coverage));
  const sourceJson = `${JSON.stringify(sourceQuality, null, 2)}\n`;
  const sourceMarkdown = normalizeMarkdown(
    markdownSourceQuality(sourceQuality),
  );
  if (process.argv.includes('--check')) {
    const expected = [
      [COVERAGE_PATH, coverageJson],
      [COVERAGE_MARKDOWN_PATH, coverageMarkdown],
      [SOURCE_PATH, sourceJson],
      [SOURCE_MARKDOWN_PATH, sourceMarkdown],
    ] as const;
    for (const [path, value] of expected) {
      if (!existsSync(path) || readFileSync(path, 'utf8') !== value) {
        throw new Error(`Profile report is stale or missing: ${path}`);
      }
    }
    return;
  }
  writeFileSync(COVERAGE_PATH, coverageJson);
  writeFileSync(COVERAGE_MARKDOWN_PATH, coverageMarkdown);
  writeFileSync(SOURCE_PATH, sourceJson);
  writeFileSync(SOURCE_MARKDOWN_PATH, sourceMarkdown);
  console.log(
    `Generated profile coverage reports: ${coverage.totalCandidates} candidates, ${sourceQuality.publishedRecordCount} published records, ${coverage.pendingPolicyCount} pending policies.`,
  );
}

writeReports();
