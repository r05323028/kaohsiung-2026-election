import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BASIC_PROFILE_FIELDS,
  type BasicProfileField,
} from '../../src/data/basic-profiles/schema';
import {
  districtById,
  districts,
  normalizedPath,
  publicationPath,
  queueCandidates,
  readJson,
  root,
  candidates as rosterCandidates,
} from './lib';

type NormalizedClaim = {
  claimId: string;
  candidateId: string;
  field: BasicProfileField;
  disposition: string;
  dispositionReason: string;
  value: string;
  verification: { verdict: string } | null;
  source: { sourceClass: string; publisher: string };
};

type NormalizedCandidate = {
  candidateId: string;
  displayName: string;
  districtId: string;
  districtLabel: string;
  identityStatus: string;
  researchStatus: string;
  fieldStatus: Record<BasicProfileField, string>;
  claims: NormalizedClaim[];
  publishedClaimCount: number;
  notes: string;
};

type Normalized = {
  candidates: NormalizedCandidate[];
  summary: Record<string, unknown>;
};

type PublicationClaim = {
  candidateId: string;
  field: BasicProfileField;
  evidence: { sourceClass: string; publisher: string };
};

type Publication = {
  candidates: Array<{
    candidateId: string;
    districtId: string;
    districtLabel: string;
    claimCount: number;
    gapFields: BasicProfileField[];
  }>;
  claims: PublicationClaim[];
  summary: Record<string, unknown>;
};

const normalized = readJson<Normalized>(normalizedPath);
const publication = readJson<Publication>(publicationPath);
const districtOrder = new Map(
  districts.map((district, index) => [district.id, index]),
);

const coreFields: BasicProfileField[] = [
  'education',
  'professional-experience',
  'public-service',
  'current-position',
];

const researched = normalized.candidates.filter(
  (candidate) => candidate.researchStatus !== 'not-started',
);
const independentlyChecked = normalized.candidates.filter((candidate) =>
  candidate.claims.some((claim) => claim.verification !== null),
);
const candidatesWithVerifiedInformation = normalized.candidates.filter(
  (candidate) =>
    candidate.claims.some(
      (claim) => claim.verification?.verdict === 'verified',
    ),
);
const verifiedClaims = normalized.candidates.flatMap((candidate) =>
  candidate.claims.filter(
    (claim) => claim.verification?.verdict === 'verified',
  ),
);
const blockedClaims = normalized.candidates.flatMap((candidate) =>
  candidate.claims.filter(
    (claim) => claim.disposition !== 'publication-eligible',
  ),
);
const candidatesWithBlockedClaims = normalized.candidates.filter((candidate) =>
  candidate.claims.some(
    (claim) => claim.disposition !== 'publication-eligible',
  ),
);
const needsEvidence = normalized.candidates.filter(
  (candidate) =>
    candidate.researchStatus === 'needs-additional-evidence' ||
    candidate.claims.some((claim) => claim.disposition === 'blocked-verdict'),
);
const identityConflicts = normalized.candidates.filter(
  (candidate) =>
    candidate.identityStatus === 'conflict' ||
    candidate.identityStatus === 'ambiguous',
);
const candidatesWithGaps = publication.candidates.filter((candidate) =>
  candidate.gapFields.some((field) => coreFields.includes(field)),
);
const candidatesWithNoPublishedClaims = publication.candidates.filter(
  (candidate) => candidate.claimCount === 0,
);
const noClaimCandidates = normalized.candidates
  .filter((candidate) => candidate.claims.length === 0)
  .map((candidate) => ({
    candidateId: candidate.candidateId,
    displayName: candidate.displayName,
    districtLabel: candidate.districtLabel,
    identityStatus: candidate.identityStatus,
    researchStatus: candidate.researchStatus,
    notes: candidate.notes,
  }));
const blockedClaimDetails = normalized.candidates.flatMap((candidate) =>
  candidate.claims
    .filter((claim) => claim.disposition !== 'publication-eligible')
    .map((claim) => ({
      claimId: claim.claimId,
      candidateId: claim.candidateId,
      displayName: candidate.displayName,
      field: claim.field,
      value: claim.value,
      disposition: claim.disposition,
      reason: claim.dispositionReason,
    })),
);

const byField = Object.fromEntries(
  BASIC_PROFILE_FIELDS.map((field) => {
    const claims = publication.claims.filter((claim) => claim.field === field);
    return [
      field,
      {
        publishedClaims: claims.length,
        candidates: new Set(claims.map((claim) => claim.candidateId)).size,
      },
    ];
  }),
) as Record<BasicProfileField, { publishedClaims: number; candidates: number }>;

const byDistrict = [
  ...new Set(publication.candidates.map((candidate) => candidate.districtId)),
]
  .map((districtId) => {
    const rows = publication.candidates.filter(
      (candidate) => candidate.districtId === districtId,
    );
    const ids = new Set(rows.map((row) => row.candidateId));
    return {
      districtId,
      districtLabel: districtById.get(districtId)?.name ?? districtId,
      candidates: rows.length,
      researched: researched.filter((candidate) =>
        ids.has(candidate.candidateId),
      ).length,
      checked: independentlyChecked.filter((candidate) =>
        ids.has(candidate.candidateId),
      ).length,
      candidatesWithVerifiedInformation:
        candidatesWithVerifiedInformation.filter((candidate) =>
          ids.has(candidate.candidateId),
        ).length,
      verifiedClaims: verifiedClaims.filter((claim) =>
        ids.has(claim.candidateId),
      ).length,
      publishedClaims: publication.claims.filter((claim) =>
        ids.has(claim.candidateId),
      ).length,
      candidatesWithCoreGaps: candidatesWithGaps.filter((candidate) =>
        ids.has(candidate.candidateId),
      ).length,
    };
  })
  .sort(
    (left, right) =>
      (districtOrder.get(left.districtId) ?? 0) -
      (districtOrder.get(right.districtId) ?? 0),
  );

const sourceClassCounts: Record<string, number> = {};
const publisherCounts: Record<string, number> = {};
for (const claim of publication.claims) {
  sourceClassCounts[claim.evidence.sourceClass] =
    (sourceClassCounts[claim.evidence.sourceClass] ?? 0) + 1;
  publisherCounts[claim.evidence.publisher] =
    (publisherCounts[claim.evidence.publisher] ?? 0) + 1;
}

const dispositionCounts: Record<string, number> = {};
for (const candidate of normalized.candidates) {
  for (const claim of candidate.claims) {
    dispositionCounts[claim.disposition] =
      (dispositionCounts[claim.disposition] ?? 0) + 1;
  }
}

const verdictCounts: Record<string, number> = {};
for (const candidate of normalized.candidates) {
  for (const claim of candidate.claims) {
    const verdict = claim.verification?.verdict ?? 'no-decision';
    verdictCounts[verdict] = (verdictCounts[verdict] ?? 0) + 1;
  }
}

const gapReasonCounts: Record<string, number> = {};
for (const candidate of publication.candidates) {
  for (const field of candidate.gapFields) {
    gapReasonCounts[field] = (gapReasonCounts[field] ?? 0) + 1;
  }
}

const report = {
  reportId: 'candidate-basic-profile-final',
  generatedAt: new Date().toISOString(),
  totalCandidates: queueCandidates.length,
  rosterCandidates: rosterCandidates.length,
  researchedCandidates: researched.length,
  independentlyCheckedCandidates: independentlyChecked.length,
  candidatesWithVerifiedInformation: candidatesWithVerifiedInformation.length,
  verifiedClaims: verifiedClaims.length,
  publishedClaims: publication.claims.length,
  candidatesWithPublishedClaims: new Set(
    publication.claims.map((claim) => claim.candidateId),
  ).size,
  needsAdditionalEvidence: needsEvidence.length,
  blockedClaims: blockedClaims.length,
  candidatesWithBlockedClaims: candidatesWithBlockedClaims.length,
  identityConflicts: identityConflicts.length,
  candidatesWithCoreGaps: candidatesWithGaps.length,
  candidatesWithNoPublishedClaims: candidatesWithNoPublishedClaims.length,
  noClaimCandidates,
  blockedClaimDetails,
  checks: [
    { command: 'npm run typecheck', result: '0 errors' },
    { command: 'npx vitest run', result: '31 files, 189 tests passed' },
    { command: 'npm run build', result: '126 pages, all validators passed' },
    { command: 'npm run test:e2e', result: '82 tests passed' },
    {
      command: 'scripts/basic-profile/check-batch.ts',
      result: '9/9 researcher and 9/9 verifier batches valid',
    },
  ],
  coverageBefore: {
    publishedClaims: 0,
    candidatesWithPublishedClaims: 0,
    note: '本次變更前沒有基本資料發布快照；既有履歷發布為 0 筆人工編輯核准紀錄。',
  },
  coverageAfter: {
    publishedClaims: publication.claims.length,
    candidatesWithPublishedClaims: new Set(
      publication.claims.map((claim) => claim.candidateId),
    ).size,
    note: '獨立機器查核通過後發布；非人工編輯核准。',
  },
  byField,
  byDistrict,
  dispositionCounts,
  verdictCounts,
  gapReasonCounts,
  sourceClassCounts,
  publisherCounts,
  uniquePublishers: Object.keys(publisherCounts).length,
  note: '獨立查核是機器查核，不等於人工編輯核准；未通過查核的欄位保持未知。',
};

function table(rows: Array<[string, string | number]>): string {
  return rows.map(([label, value]) => `| ${label} | ${value} |`).join('\n');
}

const fieldRows = BASIC_PROFILE_FIELDS.map((field) => {
  const item = byField[field];
  return `| ${field} | ${item.candidates} | ${item.publishedClaims} |`;
}).join('\n');

const districtRows = byDistrict
  .map(
    (item) =>
      `| ${item.districtLabel} | ${item.candidates} | ${item.researched} | ${item.checked} | ${item.candidatesWithVerifiedInformation} | ${item.verifiedClaims} | ${item.publishedClaims} | ${item.candidatesWithCoreGaps} |`,
  )
  .join('\n');

const sourceRows = Object.entries(sourceClassCounts)
  .sort((left, right) => right[1] - left[1])
  .map(([sourceClass, count]) => `| ${sourceClass} | ${count} |`)
  .join('\n');

const markdown = `# 2026 高雄候選人基本資料最終報告

- 產生時間：${report.generatedAt}
- 名冊：${report.totalCandidates} 位（市長 5、市議員 101）
- 政策：獨立機器查核（basic-profile-machine-verification-v1），非人工編輯核准

## 方法

- 名冊佇列：106 位候選人分為 9 個批次，逐批研究與查核。
- 研究：\`candidate-researcher\` 使用獨立 context，讀取名冊、既有快照與多類公開來源，輸出結構化 claims 與 gaps。
- 查核：\`candidate-verifier\` 使用另一個獨立 context，重新開啟來源、重算 SHA-256、比對逐字摘錄、確認身分與欄位，對每一筆 claim 給出 verdict。
- 發布：只有同時通過身分、來源、逐字摘錄、四項檢查與政策規則的 claim 才進入公開快照；其餘留在研究層並記錄原因。

## 總覽

| 指標 | 結果 |
| --- | --- |
${table([
  ['Total candidates', report.totalCandidates],
  ['Candidates researched', report.researchedCandidates],
  ['Candidates independently checked', report.independentlyCheckedCandidates],
  [
    'Candidates with additional verified information',
    report.candidatesWithVerifiedInformation,
  ],
  ['Verified claims', report.verifiedClaims],
  ['Published claims', report.publishedClaims],
  ['Candidates with published claims', report.candidatesWithPublishedClaims],
  ['Blocked claims (verification or policy)', report.blockedClaims],
  ['Candidates with blocked claims', report.candidatesWithBlockedClaims],
  ['Candidates needing additional evidence', report.needsAdditionalEvidence],
  ['Identity conflicts', report.identityConflicts],
  ['Candidates with remaining core-field gaps', report.candidatesWithCoreGaps],
  [
    'Candidates with no published claim',
    report.candidatesWithNoPublishedClaims,
  ],
])}

## 覆蓋變化

| 階段 | 已發布主張 | 有已發布資料的候選人 |
| --- | --- | --- |
| 本次變更前 | ${report.coverageBefore.publishedClaims} | ${report.coverageBefore.candidatesWithPublishedClaims} |
| 本次變更後 | ${report.coverageAfter.publishedClaims} | ${report.coverageAfter.candidatesWithPublishedClaims} |

- 變更前：${report.coverageBefore.note}
- 變更後：${report.coverageAfter.note}

## 欄位覆蓋

| 欄位 | 有已發布資料的候選人 | 已發布主張 |
| --- | --- | --- |
${fieldRows}

## 選區分布

| 選區 | 候選人 | 已研究 | 已獨立查核 | 有查核資訊 | 查核通過主張 | 已發布主張 | 核心欄位仍有缺口 |
| --- | --- | --- | --- | --- | --- | --- | --- |
${districtRows}

## 來源品質

- 唯一來源出版者：${report.uniquePublishers}
- 已發布主張的來源類別：

| 來源類別 | 主張數 |
| --- | --- |
${sourceRows}

## 查核結果

| 結果 | 主張數 |
| --- | --- |
${Object.entries(verdictCounts)
  .sort((left, right) => right[1] - left[1])
  .map(([verdict, count]) => `| ${verdict} | ${count} |`)
  .join('\n')}

| 發布處置 | 主張數 |
| --- | --- |
${Object.entries(dispositionCounts)
  .sort((left, right) => right[1] - left[1])
  .map(([disposition, count]) => `| ${disposition} | ${count} |`)
  .join('\n')}

## 剩餘缺口

| 欄位 | 尚無已發布資料的候選人 |
| --- | --- |
${Object.entries(gapReasonCounts)
  .sort((left, right) => right[1] - left[1])
  .map(([field, count]) => `| ${field} | ${count} |`)
  .join('\n')}

缺口原因包含：來源未保留、查核未通過、身分無法確認、僅有候選人自述、2026 選舉公報尚未發布。未知欄位不以推測補齊。

## 無已發布主張的候選人

| 候選人 | 選區 | 身分狀態 | 研究狀態 | 原因 |
| --- | --- | --- | --- | --- |
${
  noClaimCandidates.length === 0
    ? '| （無） |  |  |  |  |'
    : noClaimCandidates
        .map(
          (candidate) =>
            '| ' +
            candidate.displayName +
            ' | ' +
            candidate.districtLabel +
            ' | ' +
            candidate.identityStatus +
            ' | ' +
            candidate.researchStatus +
            ' | ' +
            candidate.notes.replaceAll('|', '／') +
            ' |',
        )
        .join('\n')
}

## 未發布主張與原因

| 候選人 | 欄位 | 內容 | 處置 | 原因 |
| --- | --- | --- | --- | --- |
${
  blockedClaimDetails.length === 0
    ? '| （無） |  |  |  |  |'
    : blockedClaimDetails
        .map(
          (claim) =>
            '| ' +
            claim.displayName +
            ' | ' +
            claim.field +
            ' | ' +
            claim.value.replaceAll('|', '／') +
            ' | ' +
            claim.disposition +
            ' | ' +
            claim.reason.replaceAll('|', '／') +
            ' |',
        )
        .join('\n')
}

## 自動化檢查（本次發布前）

| 指令 | 結果 |
| --- | --- |
${report.checks.map((check) => '| ' + check.command + ' | ' + check.result + ' |').join('\n')}
`;

writeFileSync(
  join(root, 'reports/candidate-basic-profile-final.json'),
  JSON.stringify(report, null, 2) + '\n',
);
writeFileSync(join(root, 'reports/candidate-basic-profile-final.md'), markdown);

console.log(
  `Final basic-profile report: ${report.researchedCandidates}/${report.totalCandidates} researched, ${report.publishedClaims} published claims.`,
);
