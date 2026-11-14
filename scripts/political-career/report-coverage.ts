import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  CareerCoverage,
  PoliticalCareerDataset,
} from '../../src/data/political-career/schema';

const ROOT = resolve('.');
const DATASET_PATH = resolve(ROOT, 'data/approved/2026/political-career.json');
const ROSTER_PATH = resolve(ROOT, 'data/approved/2026/kaohsiung-election.json');
const VERIFICATION_PATH = resolve(
  ROOT,
  'data/political-career/2026/project-verification.json',
);
const MARKDOWN_PATH = resolve(ROOT, 'reports/political-career-coverage.md');
const JSON_PATH = resolve(ROOT, 'reports/political-career-coverage.json');

type Roster = {
  districts: Array<{ id: string; districtLabel: string; name: string }>;
  candidates: Array<{
    id: string;
    displayName: string;
    districtId: string;
    politicalParty: string;
    electionType: string;
  }>;
};

type Verification = {
  datasetId: string;
  verifiedAt: string;
  reviewerNote: string;
  counts: {
    total: number;
    accepted: number;
    uncertain: number;
    rejected: number;
    published: number;
    publishedWithNarrowedClaims: number;
    rejectedFinal: number;
  };
  records: Array<{
    projectId: string;
    candidateName: string;
    projectTitle: string;
    verificationDecision: 'accepted' | 'uncertain' | 'rejected';
    disposition: 'published' | 'published-with-narrowed-claims' | 'rejected';
    reason: string;
  }>;
};

const dataset = JSON.parse(
  readFileSync(DATASET_PATH, 'utf8'),
) as PoliticalCareerDataset;
const roster = JSON.parse(readFileSync(ROSTER_PATH, 'utf8')) as Roster;
const verification = JSON.parse(
  readFileSync(VERIFICATION_PATH, 'utf8'),
) as Verification;

const rosterById = new Map(roster.candidates.map((row) => [row.id, row]));
const districtById = new Map(roster.districts.map((row) => [row.id, row]));

const EXCLUSION_NOTES: Record<string, string> = {
  黃裕庭: '公開資料僅載「連任兩屆里長」，未載里別，無法建立可驗證的職務紀錄。',
  陳雅敏:
    '議長室秘書專委、議員服務處主任等均屬民意機關幕僚職，非民選公職或政府任用職務。',
  湯茹婷: '高雄市政府勞工局經歷未載職稱與期間；立委服務處主任屬幕僚職。',
  巫振興:
    '調解委員與市府委員會委員屬兼任諮詢、調解職務，來源未載任期與完整職稱，暫不列入專任政府職務。',
};

type CandidateRow = Omit<CareerCoverage, 'electionType'> & {
  districtLabel: string;
  party: string;
  electionType: CareerCoverage['electionType'];
};

const rows: CandidateRow[] = dataset.coverage.map((coverage) => {
  const candidate = rosterById.get(coverage.candidateId);
  const district = districtById.get(coverage.districtId);
  return {
    ...coverage,
    districtLabel: district?.districtLabel ?? coverage.districtId,
    party: candidate?.politicalParty ?? '未載明',
    electionType: (candidate?.electionType ??
      coverage.electionType) as CareerCoverage['electionType'],
  };
});

const counts = {
  candidates: rows.length,
  recordsFound: rows.filter((row) => row.status === 'records-found').length,
  noRecords: rows.filter((row) => row.status === 'no-verifiable-record-found')
    .length,
  governmentEmployment: rows.filter((row) => row.governmentPositionCount > 0)
    .length,
  legislativeEmployment: rows.filter((row) => row.legislativePositionCount > 0)
    .length,
  councilEmployment: rows.filter((row) => row.councilPositionCount > 0).length,
  localElected: rows.filter((row) => row.electedOfficeCount > 0).length,
  governmentProjects: rows.filter((row) => row.governmentProjectCount > 0)
    .length,
  legislativeProposals: rows.filter((row) => row.legislativeProposalCount > 0)
    .length,
  votingRecords: rows.filter((row) => row.votingRecordCount > 0).length,
  officeTerms: dataset.officeTerms.length,
  activities: dataset.activities.length,
  projects: dataset.governmentProjects.length,
  proposals: dataset.legislativeProposals.length,
  votes: dataset.votingRecords.length,
  sources: dataset.sources.length,
};
const acceptedRecords =
  counts.officeTerms +
  counts.activities +
  counts.projects +
  counts.proposals +
  counts.votes;
const rejectedRecords = verification.counts.rejectedFinal;

const candidateSlug = (candidateId: string): string =>
  candidateId.replace(/^official-(?:mayor|candidate)-2026-/, '');

const tableCell = (value: string | number): string =>
  String(value).replaceAll('|', '\\|');

const rowLine = (row: CandidateRow): string =>
  [
    '| ',
    tableCell(row.displayName),
    ' | ',
    tableCell(row.districtLabel),
    ' | ',
    tableCell(row.party),
    ' | ',
    row.status === 'records-found' ? '有紀錄' : '查無紀錄',
    ' | ',
    row.officeTermCount,
    ' | ',
    row.governmentPositionCount,
    ' | ',
    row.legislativePositionCount,
    ' | ',
    row.councilPositionCount,
    ' | ',
    row.electedOfficeCount,
    ' | ',
    row.governmentProjectCount,
    ' | ',
    row.legislativeProposalCount,
    ' | ',
    row.votingRecordCount,
    ' | ',
    row.activityCount,
    ' |',
  ].join('');

const rejected = verification.records.filter(
  (record) => record.disposition === 'rejected',
);
const narrowed = verification.records.filter(
  (record) => record.disposition === 'published-with-narrowed-claims',
);
const noRecordRows = rows.filter(
  (row) => row.status === 'no-verifiable-record-found',
);
const excluded = noRecordRows.filter((row) => EXCLUSION_NOTES[row.displayName]);
const undiscovered = noRecordRows.filter(
  (row) => !EXCLUSION_NOTES[row.displayName],
);

const markdown: string[] = [];
markdown.push('# 2026 高雄市長與市議員候選人從政歷程覆蓋報告');
markdown.push('');
markdown.push(
  '- 資料集：`data/approved/2026/political-career.json`（`kaohsiung-2026-political-career`）',
);
markdown.push(
  '- 研究截止：' +
    dataset.researchCutoff +
    '；候選人名冊快照：' +
    dataset.rosterSnapshotDate,
);
markdown.push(
  '- 產生方式：`npx tsx scripts/political-career/report-coverage.ts`',
);
markdown.push(
  '- 專案驗證明細：`data/political-career/2026/project-verification.json`',
);
markdown.push('');
markdown.push('## 總覽');
markdown.push('');
markdown.push('| 指標 | 數值 |');
markdown.push('| --- | ---: |');
markdown.push('| 已處理候選人 | ' + counts.candidates + ' |');
markdown.push('| 有可查證從政紀錄 | ' + counts.recordsFound + ' |');
markdown.push('| 查無可查證從政紀錄 | ' + counts.noRecords + ' |');
markdown.push('| 公職任期紀錄 | ' + counts.officeTerms + ' |');
markdown.push('| 議會與市政活動 | ' + counts.activities + ' |');
markdown.push('| 政府專案 | ' + counts.projects + ' |');
markdown.push('| 立法提案 | ' + counts.proposals + ' |');
markdown.push('| 個別表決紀錄 | ' + counts.votes + ' |');
markdown.push('| 來源 | ' + counts.sources + ' |');
markdown.push(
  '| 已接受紀錄 | ' + acceptedRecords + '（含任期、活動、專案、提案、表決） |',
);
markdown.push('| 已拒絕紀錄 | ' + rejectedRecords + '（均為政府專案） |');
markdown.push('| 未決紀錄 | 0；候選人層級缺口 ' + counts.noRecords + ' 位 |');
markdown.push('');
markdown.push('## 各類紀錄覆蓋');
markdown.push('');
markdown.push('| 紀錄類型 | 至少一筆的候選人數 |');
markdown.push('| --- | ---: |');
markdown.push('| 政府任用職務 | ' + counts.governmentEmployment + ' |');
markdown.push('| 立法機關職務 | ' + counts.legislativeEmployment + ' |');
markdown.push('| 議會職務 | ' + counts.councilEmployment + ' |');
markdown.push('| 民選地方公職 | ' + counts.localElected + ' |');
markdown.push('| 政府專案 | ' + counts.governmentProjects + ' |');
markdown.push('| 立法提案 | ' + counts.legislativeProposals + ' |');
markdown.push('| 個別表決紀錄 | ' + counts.votingRecords + ' |');
markdown.push('');
markdown.push('## 政府專案研究與獨立驗證');
markdown.push('');
markdown.push(
  '共研究 ' +
    verification.counts.total +
    ' 筆專案：' +
    verification.counts.accepted +
    ' 筆通過、' +
    verification.counts.uncertain +
    ' 筆需縮減主張、' +
    verification.counts.rejected +
    ' 筆未通過。最終發布 ' +
    verification.counts.published +
    ' 筆（其中 ' +
    verification.counts.publishedWithNarrowedClaims +
    ' 筆縮減後保留），拒絕 ' +
    verification.counts.rejectedFinal +
    ' 筆。',
);
markdown.push('');
markdown.push('### 未通過驗證的專案');
markdown.push('');
markdown.push('| 候選人 | 專案 | 驗證決定 | 原因 |');
markdown.push('| --- | --- | --- | --- |');
for (const record of rejected) {
  markdown.push(
    '| ' +
      tableCell(record.candidateName) +
      ' | ' +
      tableCell(record.projectTitle) +
      ' | ' +
      (record.verificationDecision === 'rejected' ? '拒絕' : '縮減後仍不足') +
      ' | ' +
      tableCell(record.reason) +
      ' |',
  );
}
markdown.push('');
markdown.push('### 縮減主張後保留的專案');
markdown.push('');
markdown.push('| 候選人 | 專案 | 原因 |');
markdown.push('| --- | --- | --- |');
for (const record of narrowed) {
  markdown.push(
    '| ' +
      tableCell(record.candidateName) +
      ' | ' +
      tableCell(record.projectTitle) +
      ' | ' +
      tableCell(record.reason) +
      ' |',
  );
}
markdown.push('');
markdown.push('## 逐位候選人');
markdown.push('');
markdown.push(
  '| 候選人 | 選區 | 政黨 | 狀態 | 任期 | 政府職務 | 立法職位 | 議會職位 | 民選地方 | 專案 | 提案 | 表決 | 活動 |',
);
markdown.push(
  '| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
);
for (const row of rows) markdown.push(rowLine(row));
markdown.push('');
markdown.push('## 查無可查證從政紀錄（' + counts.noRecords + ' 位）');
markdown.push('');
markdown.push(
  '其中 ' +
    excluded.length +
    ' 位有公開經歷記載，但僅屬幕僚、黨職、競選團隊、社團、兼任諮詢職務或無法辨識職務，依範疇排除；' +
    undiscovered.length +
    ' 位未發現可歸屬於本人的公職、政府專案、立法提案或表決紀錄。',
);
markdown.push('');
markdown.push('| 候選人 | 選區 | 類別 | 說明 |');
markdown.push('| --- | --- | --- | --- |');
for (const row of [...excluded, ...undiscovered]) {
  const note = EXCLUSION_NOTES[row.displayName];
  markdown.push(
    '| ' +
      tableCell(row.displayName) +
      ' | ' +
      tableCell(row.districtLabel) +
      ' | ' +
      (note ? '有記載但未達收錄標準' : '查無紀錄') +
      ' | ' +
      tableCell(
        note ?? '未發現可歸屬於本人的從政紀錄；查無紀錄不代表未從事政治活動。',
      ) +
      ' |',
  );
}
markdown.push('');
markdown.push('## 資料缺口與限制');
markdown.push('');
markdown.push(
  '- 高雄市議會新聞稿與議員簡介僅涵蓋現任議員；挑戰者、前任議員與市長候選人須依賴選舉公報、新聞與其他機關紀錄，' +
    undiscovered.length +
    ' 位仍查無可查證紀錄。',
);
markdown.push(
  '- 高雄市議會未公開可逐人辨識的記名表決名單；目前 327 筆個別表決全部來自立法院記名表決，僅賴瑞隆與柯志恩具備。',
);
markdown.push(
  '- 政府專案須有報導同時載明候選人姓名與職稱才收錄；機關成果若未具名個人，不歸因於候選人，因此專案覆蓋僅 ' +
    counts.governmentProjects +
    ' 位候選人。',
);
markdown.push(
  '- 立法院提案僅涵蓋曾任立法委員的賴瑞隆與柯志恩；其他候選人無立法院席位，不能以黨團或連署名單推定個人提案。',
);
markdown.push(
  '- 任期日期多僅有屆次或年份；資料以 precision 欄位標示，不在 UI 補出未載明的月日。',
);
markdown.push(
  '- 立法院開放資料的最新進度可能晚於研究截止日（例如 2026-11-17 的院會議程），不代表最終立法結果。',
);
markdown.push(
  '- 教育、黨職、競選團隊、民意代表幕僚、社團與私人經歷均不列入從政歷程；' +
    excluded.length +
    ' 位候選人僅有此類記載。',
);
markdown.push('');
markdown.push('---');
markdown.push('');
markdown.push(
  '本報告由資料集與專案驗證檔自動產生；逐筆證據、來源 URL 與快照雜湊保留在資料集中。',
);
markdown.push('');

const json = {
  datasetId: dataset.datasetId,
  generatedFrom: {
    dataset: 'data/approved/2026/political-career.json',
    roster: 'data/approved/2026/kaohsiung-election.json',
    projectVerification: 'data/political-career/2026/project-verification.json',
  },
  researchCutoff: dataset.researchCutoff,
  rosterSnapshotDate: dataset.rosterSnapshotDate,
  totals: {
    candidates: counts.candidates,
    recordsFound: counts.recordsFound,
    noVerifiableRecordFound: counts.noRecords,
    acceptedRecords,
    rejectedRecords,
    unresolvedRecords: 0,
    officeTerms: counts.officeTerms,
    activities: counts.activities,
    governmentProjects: counts.projects,
    legislativeProposals: counts.proposals,
    votingRecords: counts.votes,
    sources: counts.sources,
  },
  typeCoverage: {
    governmentEmployment: counts.governmentEmployment,
    legislativeEmployment: counts.legislativeEmployment,
    councilEmployment: counts.councilEmployment,
    localElected: counts.localElected,
    governmentProjects: counts.governmentProjects,
    legislativeProposals: counts.legislativeProposals,
    votingRecords: counts.votingRecords,
  },
  projectVerification: {
    datasetId: verification.datasetId,
    verifiedAt: verification.verifiedAt,
    counts: verification.counts,
    rejected: rejected.map((record) => ({
      candidateName: record.candidateName,
      projectTitle: record.projectTitle,
      reason: record.reason,
    })),
    narrowed: narrowed.map((record) => ({
      candidateName: record.candidateName,
      projectTitle: record.projectTitle,
      reason: record.reason,
    })),
  },
  candidates: rows.map((row) => ({
    candidateId: row.candidateId,
    slug: candidateSlug(row.candidateId),
    displayName: row.displayName,
    districtId: row.districtId,
    districtLabel: row.districtLabel,
    electionType: row.electionType,
    party: row.party,
    status: row.status,
    officeTermCount: row.officeTermCount,
    governmentPositionCount: row.governmentPositionCount,
    legislativePositionCount: row.legislativePositionCount,
    councilPositionCount: row.councilPositionCount,
    electedOfficeCount: row.electedOfficeCount,
    governmentProjectCount: row.governmentProjectCount,
    legislativeProposalCount: row.legislativeProposalCount,
    votingRecordCount: row.votingRecordCount,
    activityCount: row.activityCount,
    noRecordCategory: EXCLUSION_NOTES[row.displayName]
      ? 'excluded-scope'
      : row.status === 'no-verifiable-record-found'
        ? 'no-records-discovered'
        : null,
    note: EXCLUSION_NOTES[row.displayName] ?? row.note,
  })),
};

writeFileSync(MARKDOWN_PATH, markdown.join('\n'));
writeFileSync(JSON_PATH, JSON.stringify(json, null, 2) + '\n');
console.log(
  '[political-career:report] ' +
    String(counts.candidates) +
    ' candidates, ' +
    String(counts.recordsFound) +
    ' with records, ' +
    String(counts.noRecords) +
    ' without; accepted ' +
    String(acceptedRecords) +
    ', rejected ' +
    String(rejectedRecords),
);
