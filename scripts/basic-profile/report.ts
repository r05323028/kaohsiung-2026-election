import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BasicProfilePublicationSchema } from '../../src/data/basic-profiles/schema';
import { publicationPath, readJson, root } from './lib';

const publication = BasicProfilePublicationSchema.parse(
  readJson(publicationPath),
);
const normalized = readJson<{
  candidates: Array<{
    candidateId: string;
    displayName: string;
    districtLabel: string;
    identityStatus: string;
    researchStatus: string;
    claims: Array<{ field: string; disposition: string }>;
    gaps: string[];
  }>;
}>(join(root, 'data/normalized/2026/basic-profiles.json'));

const fieldLabels: Record<string, string> = {
  education: '學歷',
  'professional-experience': '專業與工作經歷',
  'public-service': '公共服務經歷',
  'current-position': '目前職務',
  'official-website': '官方網站或公開頁面',
  'biographical-note': '其他可查證背景',
};
const byDistrict = new Map<
  string,
  { total: number; withClaims: number; claims: number }
>();
for (const coverage of publication.candidates) {
  const entry = byDistrict.get(coverage.districtLabel) ?? {
    total: 0,
    withClaims: 0,
    claims: 0,
  };
  entry.total += 1;
  entry.claims += coverage.claimCount;
  if (coverage.claimCount > 0) entry.withClaims += 1;
  byDistrict.set(coverage.districtLabel, entry);
}
const fieldCoverage = Object.entries(publication.summary.byField)
  .map(([field, count]) => {
    const candidatesWithField = new Set(
      publication.claims
        .filter((claim) => claim.field === field)
        .map((claim) => claim.candidateId),
    ).size;
    return `| ${fieldLabels[field] ?? field} | ${count} | ${candidatesWithField} |`;
  })
  .join('\n');
const districtRows = [...byDistrict.entries()]
  .map(
    ([label, entry]) =>
      `| ${label} | ${entry.total} | ${entry.withClaims} | ${entry.claims} |`,
  )
  .join('\n');
const blocked = normalized.candidates.flatMap((candidate) =>
  candidate.claims
    .filter((claim) => claim.disposition !== 'publication-eligible')
    .map((claim) => ({
      candidate: candidate.displayName,
      field: claim.field,
      disposition: claim.disposition,
    })),
);
const dispositionCounts = new Map<string, number>();
for (const item of blocked)
  dispositionCounts.set(
    item.disposition,
    (dispositionCounts.get(item.disposition) ?? 0) + 1,
  );

const markdown = `# 2026 高雄市候選人基本資料研究報告

- 產生時間：${publication.generatedAt}
- 政策：${publication.policyName}（${publication.policyVersion}）
- 名冊候選人：${publication.summary.candidateCount}
- 已完成研究：${normalized.candidates.filter((candidate) => candidate.researchStatus !== 'not-started').length}
- 已獨立查核並公開：${publication.summary.candidatesWithPublishedClaims}
- 公開查核聲明：${publication.summary.publishedClaimCount} 筆
- 未通過查核或待補件：${blocked.length} 筆

## 各選舉區覆蓋

| 選舉區 | 候選人 | 有公開資料 | 公開聲明 |
| --- | ---: | ---: | ---: |
${districtRows}

## 欄位覆蓋

| 欄位 | 公開聲明 | 候選人數 |
| --- | ---: | ---: |
${fieldCoverage}

## 未公開聲明處置

| 處置 | 筆數 |
| --- | ---: |
${[...dispositionCounts.entries()].map(([key, value]) => `| ${key} | ${value} |`).join('\n')}

## 說明

- 「公開」代表通過獨立查核與來源政策，不代表人工編輯核准。
- 未通過查核、來源不足或身分未確認的資料保留在研究層，不進入公開頁面。
- 學歷與經歷若來自選舉公報，屬候選人自行填列，頁面以「候選人自行填列」標示。
- 未知欄位以中性文字呈現，不推測、不補齊。
`;
mkdirSync(join(root, 'reports'), { recursive: true });
writeFileSync(join(root, 'reports/basic-profile-coverage.md'), markdown);
writeFileSync(
  join(root, 'reports/basic-profile-coverage.json'),
  `${JSON.stringify(
    {
      generatedAt: publication.generatedAt,
      summary: publication.summary,
      byDistrict: Object.fromEntries(byDistrict),
      blockedDispositions: Object.fromEntries(dispositionCounts),
      candidates: normalized.candidates.map((candidate) => ({
        candidateId: candidate.candidateId,
        displayName: candidate.displayName,
        districtLabel: candidate.districtLabel,
        identityStatus: candidate.identityStatus,
        researchStatus: candidate.researchStatus,
        claimCount: candidate.claims.length,
        publishedClaimCount: candidate.claims.filter(
          (claim) => claim.disposition === 'publication-eligible',
        ).length,
        gaps: candidate.gaps,
      })),
    },
    null,
    2,
  )}\n`,
);
console.log('Wrote reports/basic-profile-coverage.md and .json');
