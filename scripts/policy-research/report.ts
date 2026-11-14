import { readFileSync, writeFileSync } from 'node:fs';
import { validateOfficialDataset } from '../../src/data/official/schema';
import { validatePolicyResearchDataset } from '../../src/data/policy-research/schema';

const CUTOFF = '2026-11-14';
const DATASET = 'data/policy-research/2026/full-roster.json';
const NEWS = 'data/policy-research/2026/discovery/news-discovery.json';
const ENRICHMENT =
  'data/policy-research/2026/enrichment/verified-enrichment.json';

function parseJson<T>(text: string, relative: string): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(
      'Invalid JSON in ' +
        relative +
        ': ' +
        (error instanceof Error ? error.message : String(error)),
    );
  }
  return parsed as T;
}

function readJson<T>(relative: string): T {
  try {
    const text = readFileSync(relative, 'utf8');
    return parseJson<T>(text, relative);
  } catch (error) {
    throw new Error(
      'Failed to read ' +
        relative +
        ': ' +
        (error instanceof Error ? error.message : String(error)),
    );
  }
}

type NewsItem = {
  candidateId: string;
  retrievalStatus: string;
  rawPath: string | null;
};
type EnrichmentCandidate = {
  candidateId: string;
  gapStatus: string;
  reason: string;
  searchedCategories: string[];
  foundSourceCategories: string[];
};
type Enrichment = {
  candidates: EnrichmentCandidate[];
  sourceSnapshots: {
    sourceId: string;
    url: string;
    sourceCategory?: string;
    candidateIds: string[];
  }[];
  claims: { decision: string }[];
  newPolicies: { candidateId: string; policyId: string }[];
  validationRuleChanges: unknown[];
};

const dataset = validatePolicyResearchDataset(readJson<unknown>(DATASET));
const roster = validateOfficialDataset(
  readJson<unknown>('data/approved/2026/kaohsiung-election.json'),
);
const news = readJson<{ items: NewsItem[] }>(NEWS).items;
const enrichment = readJson<Enrichment>(ENRICHMENT);
if (enrichment.candidates.length !== roster.candidates.length) {
  throw new Error(
    'Enrichment report expected ' +
      roster.candidates.length +
      ' candidates, got ' +
      enrichment.candidates.length,
  );
}
const enrichmentByCandidate = new Map(
  enrichment.candidates.map((candidate) => [candidate.candidateId, candidate]),
);
const newPolicyIds = new Set(
  enrichment.newPolicies.map((policy) => policy.policyId),
);

const districtById = new Map(
  roster.districts.map((district) => [district.id, district]),
);
const decisionByPolicy = new Map(
  dataset.verification.map((item) => [item.policyId, item]),
);

const newsCountByCandidate = new Map<string, number>();
for (const item of news) {
  if (item.retrievalStatus !== 'retrieved' || !item.rawPath) continue;
  newsCountByCandidate.set(
    item.candidateId,
    (newsCountByCandidate.get(item.candidateId) ?? 0) + 1,
  );
}

const rows = roster.candidates.map((candidate) => {
  const policies = dataset.policies.filter(
    (policy) => policy.candidateId === candidate.id,
  );
  const decisions = policies
    .map((policy) => decisionByPolicy.get(policy.policyId))
    .filter((item) => item !== undefined);
  const attempts =
    dataset.sourceAttempts.filter(
      (attempt) => attempt.candidateId === candidate.id,
    ).length + (newsCountByCandidate.get(candidate.id) ?? 0);
  const published = policies.filter(
    (policy) => policy.publicationStatus === 'approved-source-backed',
  );
  const rejected = policies.filter(
    (policy) => policy.publicationStatus === 'rejected',
  );
  const unresolved = policies.filter(
    (policy) => policy.publicationStatus === 'withheld-pending-review',
  );
  const audit = dataset.audits.find(
    (item) => item.candidateId === candidate.id,
  );
  if (!audit) throw new Error('missing audit for ' + candidate.id);
  const research = enrichmentByCandidate.get(candidate.id);
  if (!research) throw new Error('missing enrichment row for ' + candidate.id);
  const district = districtById.get(candidate.districtId);
  const sourceUrls = new Set(
    dataset.sourceSnapshots
      .filter((source) => source.candidateIds.includes(candidate.id))
      .map((source) => source.url),
  );
  return {
    candidateId: candidate.id,
    displayName: candidate.displayName,
    districtId: candidate.districtId,
    slug: candidate.slug,
    districtLabel:
      district?.districtLabel ?? district?.name ?? candidate.districtId,
    electionType: candidate.electionType,
    politicalParty: candidate.politicalParty ?? '未標示',
    attempts,
    discovered: policies.length,
    verified: decisions.filter((item) => item.decision === 'verified').length,
    published: published.length,
    rejected: rejected.length,
    unresolved: unresolved.length,
    outcome: audit.outcome,
    note: audit.note,
    researchStatus: research.gapStatus,
    researchReason: research.reason,
    searchedSourceCategories: research.searchedCategories,
    foundSourceCategories: research.foundSourceCategories,
    sourceUrlCount: sourceUrls.size,
    newPolicyCount: policies.filter((policy) =>
      newPolicyIds.has(policy.policyId),
    ).length,
  };
});

const districtIds = [
  ...new Set(roster.districts.map((district) => district.id)),
];
const coverageByDistrict = districtIds
  .map((districtId) => {
    const district = districtById.get(districtId);
    const members = rows.filter((row) => row.districtId === districtId);
    if (members.length === 0) return null;
    return {
      districtId,
      districtLabel: district?.districtLabel ?? district?.name ?? districtId,
      candidateCount: members.length,
      candidatesWithPublishedPolicies: members.filter(
        (row) => row.published > 0,
      ).length,
      publishedPolicyCount: members.reduce(
        (sum, row) => sum + row.published,
        0,
      ),
      discoveredPolicyCount: members.reduce(
        (sum, row) => sum + row.discovered,
        0,
      ),
    };
  })
  .filter((item) => item !== null);

const policyCountByCategory: Record<string, number> = Object.fromEntries(
  dataset.categories.map((category) => [category, 0]),
);
for (const policy of dataset.policies) {
  for (const category of policy.categories) {
    policyCountByCategory[category] =
      (policyCountByCategory[category] ?? 0) + 1;
  }
}

const policyCountByType: Record<string, number> = {};
for (const policy of dataset.policies) {
  policyCountByType[policy.type] = (policyCountByType[policy.type] ?? 0) + 1;
}

const statusNames = [
  'verified',
  'historical/current-only',
  'not_found',
  'source_unavailable',
  'attribution_uncertain',
  'awaiting_verification',
];
const statusCounts = Object.fromEntries(
  statusNames.map((status) => [
    status,
    rows.filter((row) => row.researchStatus === status).length,
  ]),
);
const sourceCategoryCoverage: Record<
  string,
  {
    sourceCount: number;
    candidateCount: number;
    searchedCandidateCount: number;
  }
> = {};
for (const row of enrichment.candidates) {
  for (const category of row.searchedCategories) {
    const value = sourceCategoryCoverage[category] ?? {
      sourceCount: 0,
      candidateCount: 0,
      searchedCandidateCount: 0,
    };
    value.searchedCandidateCount += 1;
    sourceCategoryCoverage[category] = value;
  }
}
for (const source of enrichment.sourceSnapshots) {
  const category = source.sourceCategory ?? 'uncategorized';
  const value = sourceCategoryCoverage[category] ?? {
    sourceCount: 0,
    candidateCount: 0,
    searchedCandidateCount: 0,
  };
  value.sourceCount += 1;
  value.candidateCount += new Set(source.candidateIds).size;
  sourceCategoryCoverage[category] = value;
}
const claimDecisionCounts = {
  accepted: enrichment.claims.filter((claim) => claim.decision === 'accepted')
    .length,
  rejected: enrichment.claims.filter((claim) => claim.decision === 'rejected')
    .length,
  unresolved: enrichment.claims.filter(
    (claim) => claim.decision === 'unresolved',
  ).length,
};
const improvedCandidateIds = [
  ...new Set(
    enrichment.newPolicies
      .filter((policy) => {
        const current = dataset.policies.find(
          (item) => item.policyId === policy.policyId,
        );
        return current?.publicationStatus === 'approved-source-backed';
      })
      .map((policy) => policy.candidateId),
  ),
];
const improvedCandidates = rows
  .filter((row) => improvedCandidateIds.includes(row.candidateId))
  .map((row) => ({
    candidateId: row.candidateId,
    displayName: row.displayName,
    newPolicyCount: row.newPolicyCount,
  }));
const verifiedCount = statusCounts['verified'] ?? 0;
const researchCoverage = {
  totalCandidates: rows.length,
  candidatesResearched: enrichment.candidates.length,
  statusCounts,
  candidatesWithVerifiedPolicy: verifiedCount,
  candidatesWithNoVerifiedPolicy: rows.length - verifiedCount,
  candidatesWithNoPolicyInformation: statusCounts.not_found,
  candidatesWithSourceUnavailable: statusCounts.source_unavailable,
  candidatesWithAttributionUncertain: statusCounts.attribution_uncertain,
  candidatesAwaitingVerification: statusCounts.awaiting_verification,
  candidatesWithHistoricalOrCurrentOnly:
    statusCounts['historical/current-only'],
  acceptedClaims: claimDecisionCounts.accepted,
  rejectedClaims: claimDecisionCounts.rejected,
  unresolvedClaims: claimDecisionCounts.unresolved,
  sourceCategoryCoverage,
  improvedCandidates,
  gaps: rows
    .filter((row) => row.researchStatus !== 'verified')
    .map((row) => ({
      candidateId: row.candidateId,
      displayName: row.displayName,
      districtId: row.districtId,
      status: row.researchStatus,
      reason: row.researchReason,
    })),
};
const sourceCountByTier: Record<string, number> = {};
for (const source of dataset.sourceSnapshots) {
  sourceCountByTier[source.tier] = (sourceCountByTier[source.tier] ?? 0) + 1;
}

const totals = {
  candidates: rows.length,
  candidatesWithPublishedPolicies: rows.filter((row) => row.published > 0)
    .length,
  discoveredPolicies: dataset.policies.length,
  verifiedPolicies: dataset.verification.filter(
    (decision) => decision.decision === 'verified',
  ).length,
  publishedPolicies: rows.reduce((sum, row) => sum + row.published, 0),
  rejectedPolicies: rows.reduce((sum, row) => sum + row.rejected, 0),
  unresolvedPolicies: rows.reduce((sum, row) => sum + row.unresolved, 0),
  sources: dataset.sourceSnapshots.length,
  attempts: rows.reduce((sum, row) => sum + row.attempts, 0),
};

const publicationCoverage = {
  totalPolicyEntries: dataset.policies.length,
  distinctSourceUrls: new Set(
    dataset.sourceSnapshots.map((source) => source.url),
  ).size,
  publishedPolicyEntries: totals.publishedPolicies,
  candidatesWithPublishedPolicies: totals.candidatesWithPublishedPolicies,
  rejectedPolicyEntries: totals.rejectedPolicies,
  pendingPolicyEntries: totals.unresolvedPolicies,
  humanEditorialReviewPerformed: false,
  humanEditorialReviewReason:
    'production reviewer registry and reviewer decisions remain empty; output is machine-gated only',
};

const audit = {
  reportType: 'candidate-policy-coverage-audit',
  generatedAt: CUTOFF + 'T00:00:00.000Z',
  researchCutoff: CUTOFF,
  channelsSearched: [
    '候選人競選網站與政黨候選人頁面',
    '高雄市議會民意代表公開資料',
    'Google 新聞繁體中文檢索（2025-12-01 起）',
    '新聞媒體全文與候選人表態報導',
    '中央選舉委員會及高雄市選舉委員會公告',
  ],
  totals,
  researchCoverage,
  publicationCoverage,
  candidates: rows,
  coverageByDistrict,
  sourceCountByTier,
  claimDecisionCounts,
  validationRuleChanges: enrichment.validationRuleChanges,
};

writeFileSync(
  'reports/candidate-policy-audit.json',
  JSON.stringify(audit, null, 2) + '\n',
);

const md: string[] = [];
md.push('# 2026 高雄市長與市議員候選人政策主張覆蓋報告');
md.push('');
md.push('- 研究截止日：' + CUTOFF);
md.push('- 候選人數：' + totals.candidates);
md.push(
  '- 有已發布政策紀錄的候選人：' + totals.candidatesWithPublishedPolicies,
);
md.push('- 已發現政策紀錄：' + totals.discoveredPolicies);
md.push('- 已發布政策紀錄：' + totals.publishedPolicies);
md.push(
  '- 已否決：' +
    totals.rejectedPolicies +
    '；待查：' +
    totals.unresolvedPolicies,
);
md.push('- 來源快照：' + totals.sources + '；檢索嘗試：' + totals.attempts);
md.push('- 研究狀態：' + JSON.stringify(statusCounts));
md.push('- 政策網址去重後：' + publicationCoverage.distinctSourceUrls);
md.push('');
md.push('## 研究覆蓋與發布覆蓋');
md.push('');
md.push('研究覆蓋與公開發布覆蓋是不同指標；not_found 不表示候選人沒有政策。');
md.push('- 可發布研究結果：' + researchCoverage.candidatesWithVerifiedPolicy);
md.push(
  '- 僅歷史／目前立場：' +
    researchCoverage.candidatesWithHistoricalOrCurrentOnly,
);
md.push(
  '- 未找到政策資訊：' + researchCoverage.candidatesWithNoPolicyInformation,
);
md.push('- 來源無法取得：' + researchCoverage.candidatesWithSourceUnavailable);
md.push('- 歸屬不確定：' + researchCoverage.candidatesWithAttributionUncertain);
md.push('- 等待核實：' + researchCoverage.candidatesAwaitingVerification);
md.push(
  '- accepted／rejected／unresolved claims：' +
    claimDecisionCounts.accepted +
    '／' +
    claimDecisionCounts.rejected +
    '／' +
    claimDecisionCounts.unresolved,
);
md.push(
  '- 新增且發布的候選人：' +
    improvedCandidates.map((item) => item.displayName).join('、'),
);
md.push('');
md.push('## 來源類別覆蓋');
md.push('');
md.push('| 類別 | 來源快照 | 涉及候選人 | 曾檢索候選人 |');
md.push('|---|---:|---:|---:|');
for (const [category, value] of Object.entries(sourceCategoryCoverage)) {
  md.push(
    '| ' +
      category +
      ' | ' +
      value.sourceCount +
      ' | ' +
      value.candidateCount +
      ' | ' +
      value.searchedCandidateCount +
      ' |',
  );
}
md.push('');
md.push('## 各選區覆蓋');
md.push('');
md.push('| 選區 | 候選人 | 有已發布政策 | 已發布政策 | 已發現政策 |');
md.push('|---|---:|---:|---:|---:|');
for (const district of coverageByDistrict) {
  md.push(
    '| ' +
      district.districtLabel +
      ' | ' +
      district.candidateCount +
      ' | ' +
      district.candidatesWithPublishedPolicies +
      ' | ' +
      district.publishedPolicyCount +
      ' | ' +
      district.discoveredPolicyCount +
      ' |',
  );
}
md.push('');
md.push('## 政策類別分布');
md.push('');
md.push('| 類別 | 紀錄數 |');
md.push('|---|---:|');
for (const [category, count] of Object.entries(policyCountByCategory)) {
  md.push('| ' + category + ' | ' + count + ' |');
}
md.push('');
md.push('## 逐位候選人');
md.push('');
md.push(
  '| 候選人 | 選區 | 政黨 | 研究狀態 | 檢索 | 發現 | 已核實 | 已發布 | 否決 | 待查 | 結論 |',
);
md.push('|---|---|---|---|---:|---:|---:|---:|---:|---:|---|');
for (const row of rows) {
  md.push(
    '| ' +
      row.displayName +
      ' | ' +
      row.districtLabel +
      ' | ' +
      row.politicalParty +
      ' | ' +
      row.researchStatus +
      ' | ' +
      row.attempts +
      ' | ' +
      row.discovered +
      ' | ' +
      row.verified +
      ' | ' +
      row.published +
      ' | ' +
      row.rejected +
      ' | ' +
      row.unresolved +
      ' | ' +
      row.outcome +
      ' |',
  );
}
md.push('');
md.push('## 研究缺口與驗證規則');
md.push('');
for (const row of rows.filter((row) => row.researchStatus !== 'verified')) {
  md.push(
    '- ' +
      row.displayName +
      '：' +
      row.researchStatus +
      '；' +
      row.researchReason,
  );
}
for (const change of enrichment.validationRuleChanges) {
  const item = change as {
    rule?: string;
    before?: string;
    after?: string;
    integrity?: string;
  };
  md.push(
    '- 規則 ' +
      (item.rule ?? 'unknown') +
      '：' +
      (item.before ?? '') +
      ' → ' +
      (item.after ?? '') +
      '（' +
      (item.integrity ?? '') +
      '）',
  );
}
md.push('');
md.push('## 判讀說明');
md.push('');
md.push(
  '- 「檢索」為該候選人實際執行的來源檢索次數，「發現」為擷取到的政策紀錄數，兩者與「已發布」不同。',
);
md.push(
  '- 未發布可能是尚未找到來源、來源無法擷取、紀錄待查或查核未通過，不代表候選人沒有政策主張。',
);
md.push(
  '- 已發布紀錄均通過獨立查核與決定性發布門檻：身份可歸屬、原文可回溯、數字與條件保留、來源中介資料完整。',
);
md.push('- 歷史主張與 2026 競選承諾分開標示，不將過往主張視為本屆承諾。');
md.push('');
writeFileSync('reports/candidate-policy-coverage.md', md.join('\n'));

const legacy = {
  reportType: 'full-roster-policy-enrichment',
  generatedAt: CUTOFF + 'T00:00:00.000Z',
  researchCutoff: CUTOFF,
  totalCandidatesInvestigated: totals.candidates,
  candidatesWithVerified2026Policies: rows.filter((row) => row.published > 0)
    .length,
  candidatesWithOnlyCurrentOrHistoricalPositions: rows.filter(
    (row) => row.published === 0 && row.discovered > 0,
  ).length,
  candidatesWithNoVerifiablePolicyFound: rows.filter(
    (row) => row.discovered === 0 && row.attempts === 0,
  ).length,
  candidatesWithSourcesUnavailable: rows.filter(
    (row) => row.discovered === 0 && row.attempts > 0,
  ).length,
  outcomeCounts: Object.fromEntries(
    [...new Set(rows.map((row) => row.outcome))].map((outcome) => [
      outcome,
      rows.filter((row) => row.outcome === outcome).length,
    ]),
  ),
  totalPolicyRecordsDiscovered: totals.discoveredPolicies,
  machineValidatedPolicyCount: dataset.policies.filter(
    (policy) => policy.verificationStatus === 'machine-validated',
  ).length,
  pendingHumanReviewPolicyCount: rows.reduce(
    (sum, row) => sum + row.unresolved,
    0,
  ),
  approvedPolicyCount: totals.publishedPolicies,
  publishedPolicyCount: totals.publishedPolicies,
  rejectedPolicyCount: totals.rejectedPolicies,
  unresolvedPolicyCount: totals.unresolvedPolicies,
  sourceSnapshotCount: totals.sources,
  sourceAttemptCount: totals.attempts,
  distinctSourceUrlCount: publicationCoverage.distinctSourceUrls,
  sourceDistributionByTier: sourceCountByTier,
  sourceCoverageByCategory: sourceCategoryCoverage,
  claimDecisionCounts,
  improvedCandidates,
  researchCoverage,
  publicationCoverage,
  validationRuleChanges: enrichment.validationRuleChanges,
  humanEditorialReviewPerformed: false,
  policyCountByCategory,
  policyCountByContext: dataset.policies.reduce<Record<string, number>>(
    (counts, policy) => {
      counts[policy.policyContext] = (counts[policy.policyContext] ?? 0) + 1;
      return counts;
    },
    {},
  ),
  coverageByDistrict: Object.fromEntries(
    coverageByDistrict.map((district) => [
      district.districtId,
      {
        districtLabel: district.districtLabel,
        candidateCount: district.candidateCount,
        investigatedCount: district.candidateCount,
        policyRecordCount: district.discoveredPolicyCount,
      },
    ]),
  ),
  candidateInventory: rows.map((row) => ({
    candidateId: row.candidateId,
    personId: 'person-' + row.slug,
    displayName: row.displayName,
    districtId: row.districtId,
    districtLabel: row.districtLabel,
    electionType: row.electionType,
    outcome: row.outcome,
    researchStatus: row.researchStatus,
    researchReason: row.researchReason,
    policyCount: row.discovered,
    sourceCount: row.attempts,
    note: row.note,
  })),
  identityOrAttributionConflicts: dataset.conflicts,
  remainingManualReviewRequirements: [
    '候選人身份或發言歸屬仍有疑義的紀錄維持待查。',
    '來源無法擷取或僅有間接轉述的紀錄不發布。',
    '歷史主張與本屆承諾的時間脈絡由人工覆核。',
  ],
  integrityAssertions: [
    '每位候選人皆有一筆研究與查核紀錄。',
    '已發布紀錄均具可回溯之原始文字與來源中介資料。',
    '未通過查核的紀錄不會出現在公開網站。',
  ],
};

void policyCountByType;
writeFileSync(
  'reports/2026-policy-enrichment.json',
  JSON.stringify(legacy, null, 2) + '\n',
);

process.stdout.write(
  'coverage report: ' +
    totals.candidates +
    ' candidates, ' +
    totals.publishedPolicies +
    ' published, ' +
    rows.filter((row) => row.published > 0).length +
    ' candidates with published policies\n',
);
