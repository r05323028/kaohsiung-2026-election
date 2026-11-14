import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import approvedRoster from '../data/approved/2026/kaohsiung-election.json';
import publicRecordsInput from '../data/approved/2026/kaohsiung-public-records.json';
import policyResearchInput from '../data/policy-research/2026/full-roster.json';
import {
  type OfficialDataset,
  validateOfficialDataset,
} from '../src/data/official/schema';
import {
  type PolicyResearchDataset,
  validatePolicyResearchDataset,
} from '../src/data/policy-research/schema';
import { loadPublicRecordsEnrichmentDataset } from '../src/data/public-records/enrichment-full-index';
import type { PublicRecordsEnrichmentDataset } from '../src/data/public-records/enrichment-schema';

const REPORT_DIR = resolve('reports');
const COVERAGE_PATH = resolve(
  REPORT_DIR,
  'public-record-enrichment-coverage.json',
);
const COVERAGE_MARKDOWN_PATH = resolve(
  REPORT_DIR,
  'public-record-enrichment-coverage.md',
);
const SOURCE_PATH = resolve(
  REPORT_DIR,
  'public-record-enrichment-source-quality.json',
);
const SOURCE_MARKDOWN_PATH = resolve(
  REPORT_DIR,
  'public-record-enrichment-source-quality.md',
);

type CountMap = Record<string, number>;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function increment(counts: CountMap, key: string, amount = 1): void {
  counts[key] = (counts[key] ?? 0) + amount;
}

function sortedCounts(counts: CountMap): CountMap {
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => compareText(left, right)),
  );
}

function listLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function normalizeMarkdown(value: string): string {
  return value.trimEnd() + '\n';
}

function writeOrCheck(path: string, content: string, check: boolean): void {
  if (check) {
    if (!existsSync(path)) throw new Error('Missing generated report: ' + path);
    const existing = readFileSync(path, 'utf8');
    if (existing !== content) {
      throw new Error('Generated report is stale: ' + path);
    }
    return;
  }
  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(path, content);
}

function candidatePersonId(slug: string): string {
  return 'person-' + slug;
}

function buildCoverageReport(
  roster: OfficialDataset,
  policyResearch: PolicyResearchDataset,
  dataset: PublicRecordsEnrichmentDataset,
) {
  const audits = new Map(
    dataset.audits.map((audit) => [audit.candidateId, audit]),
  );
  const sourceSnapshotsByCandidate = new Map<string, number>();
  const resolvedSourcesByCandidate = new Map<string, number>();
  for (const source of dataset.sourceSnapshots) {
    for (const candidateId of source.candidateIds) {
      sourceSnapshotsByCandidate.set(
        candidateId,
        (sourceSnapshotsByCandidate.get(candidateId) ?? 0) + 1,
      );
      if (source.identityStatus === 'resolved') {
        resolvedSourcesByCandidate.set(
          candidateId,
          (resolvedSourcesByCandidate.get(candidateId) ?? 0) + 1,
        );
      }
    }
  }
  const attemptsByCandidate = new Map<string, number>();
  const retrievedAttemptsByCandidate = new Map<string, number>();
  for (const attempt of dataset.sourceAttempts) {
    attemptsByCandidate.set(
      attempt.candidateId,
      (attemptsByCandidate.get(attempt.candidateId) ?? 0) + 1,
    );
    if (attempt.retrievalStatus === 'retrieved') {
      retrievedAttemptsByCandidate.set(
        attempt.candidateId,
        (retrievedAttemptsByCandidate.get(attempt.candidateId) ?? 0) + 1,
      );
    }
  }

  const candidateInventory = roster.candidates
    .map((candidate) => {
      const audit = audits.get(candidate.id);
      if (!audit) throw new Error('Missing audit for ' + candidate.id);
      const retainedSourceCount =
        sourceSnapshotsByCandidate.get(candidate.id) ?? 0;
      const sourceAttemptCount = attemptsByCandidate.get(candidate.id) ?? 0;
      const pendingRecordCount =
        audit.policyReferenceCount +
        audit.positionRecordIds.length +
        audit.careerRecordIds.length;
      const missingOrUnavailable: string[] = [];
      if (audit.outcome === 'sources-unavailable') {
        missingOrUnavailable.push('候選人專屬來源未能在保留檔案中取得');
      }
      if (audit.outcome === 'sources-attempted-no-additional-records') {
        missingOrUnavailable.push('已嘗試保留來源但尚無可機器驗證的新增紀錄');
      }
      if (audit.outcome === 'policy-references-only') {
        missingOrUnavailable.push('政策研究參照仍待人工與編輯審查');
      }
      if (audit.outcome === 'records-found') {
        missingOrUnavailable.push('基本／從政歷程研究紀錄仍待人工與編輯審查');
      }
      if (audit.individualVoteRecordCount === 0) {
        missingOrUnavailable.push('未建立個別表決紀錄；不從黨籍或集體結果推論');
      }
      return {
        candidateId: candidate.id,
        personId: candidatePersonId(candidate.slug),
        displayName: candidate.displayName,
        districtId: candidate.districtId,
        electionType: candidate.electionType,
        sourceAttemptCount,
        retrievedSourceAttemptCount:
          retrievedAttemptsByCandidate.get(candidate.id) ?? 0,
        retainedSourceCount,
        resolvedSourceCount: resolvedSourcesByCandidate.get(candidate.id) ?? 0,
        policyReferenceCount: audit.policyReferenceCount,
        positionRecordCount: audit.positionRecordIds.length,
        careerRecordCount: audit.careerRecordIds.length,
        pendingRecordCount,
        newsRecordCount: audit.newsRecordCount,
        proposalRecordCount: audit.proposalRecordCount,
        individualVoteRecordCount: audit.individualVoteRecordCount,
        executiveInitiativeRecordCount: audit.executiveInitiativeRecordCount,
        outcome: audit.outcome,
        researchStatus: audit.researchStatus,
        missingOrUnavailable,
      };
    })
    .sort((left, right) => compareText(left.candidateId, right.candidateId));

  const outcomeCounts: CountMap = {};
  const electionTypeCounts: CountMap = {};
  const contextCounts: CountMap = {};
  const districtMap = new Map<
    string,
    {
      districtId: string;
      candidateCount: number;
      candidatesWithRecords: number;
      candidatesWithPolicyReferences: number;
      pendingRecordCount: number;
      retainedSourceCount: number;
      sourcesUnavailableCount: number;
    }
  >();
  for (const item of candidateInventory) {
    increment(outcomeCounts, item.outcome);
    increment(electionTypeCounts, item.electionType);
    const district = districtMap.get(item.districtId) ?? {
      districtId: item.districtId,
      candidateCount: 0,
      candidatesWithRecords: 0,
      candidatesWithPolicyReferences: 0,
      pendingRecordCount: 0,
      retainedSourceCount: 0,
      sourcesUnavailableCount: 0,
    };
    district.candidateCount += 1;
    district.candidatesWithRecords +=
      item.positionRecordCount + item.careerRecordCount > 0 ? 1 : 0;
    district.candidatesWithPolicyReferences +=
      item.policyReferenceCount > 0 ? 1 : 0;
    district.pendingRecordCount += item.pendingRecordCount;
    district.retainedSourceCount += item.retainedSourceCount;
    district.sourcesUnavailableCount +=
      item.outcome === 'sources-unavailable' ? 1 : 0;
    districtMap.set(item.districtId, district);
  }
  for (const policy of policyResearch.policies) {
    increment(contextCounts, policy.policyContext);
  }

  const baseline = publicRecordsInput as Record<string, unknown>;
  const baselineProduction = {
    claims: listLength(baseline.claims),
    evidence: listLength(baseline.evidence),
    policies: listLength(baseline.policies),
    news: listLength(baseline.news),
    positions: listLength(baseline.positions),
    activities: listLength(baseline.activities),
    timeline: listLength(baseline.timeline),
    relationships: listLength(baseline.relationships),
  };
  const baselinePublishedRecordCount =
    baselineProduction.policies +
    baselineProduction.news +
    baselineProduction.positions +
    baselineProduction.activities +
    baselineProduction.timeline +
    baselineProduction.relationships;
  const researchPending = {
    claims: dataset.claims.length,
    evidence: dataset.evidence.length,
    positions: dataset.positions.length,
    careerRecords: dataset.careerRecords.length,
    policyReferences: dataset.policyReferences.length,
    sourceSnapshots: dataset.sourceSnapshots.length,
    sourceAttempts: dataset.sourceAttempts.length,
  };

  return {
    reportId: 'public-record-enrichment-coverage',
    snapshotDate: dataset.snapshotDate,
    researchCutoff: dataset.researchCutoff,
    rosterSnapshotDate: dataset.rosterSnapshotDate,
    candidateCount: roster.candidates.length,
    beforeAfter: {
      baselinePublishedRecordCount,
      pendingResearchRecordCount:
        researchPending.claims +
        researchPending.positions +
        researchPending.careerRecords +
        researchPending.policyReferences,
      newlyPublishedRecordCount: 0,
      publicationDelta: 0,
      note: '研究資料集的 machine-validated 紀錄與政策參照仍 withheld-pending-review；不計入公開靜態資料。',
    },
    baselineProduction,
    researchPending,
    outcomeCounts: sortedCounts(outcomeCounts),
    electionTypeCounts: sortedCounts(electionTypeCounts),
    policyContextCounts: sortedCounts(contextCounts),
    sourceSnapshotCount: dataset.sourceSnapshots.length,
    sourceAttemptCount: dataset.sourceAttempts.length,
    retainedSourceCount: dataset.sourceSnapshots.filter(
      (source) => source.retrievalStatus === 'retrieved',
    ).length,
    publishedRecordCount: dataset.coverageAssertions.publishedRecords,
    rejectedRecordCount: 0,
    unresolvedRecordCount: 0,
    candidateInventory,
    coverageByDistrict: Array.from(districtMap.values()).sort((left, right) =>
      compareText(left.districtId, right.districtId),
    ),
    limitations: [
      '本次新增資料均為機器驗證、待人工審查且 withheld-pending-review；沒有新增公開政策、新聞、表決或執行成果。',
      'KCC 個人頁的學歷／經歷文字保留為來源所述，不推定任期、投票、政策成果或行政貢獻。',
      '沒有保留候選人專屬來源不表示候選人沒有相關公共紀錄。',
      '個別表決資料必須有明確記名投票與候選人角色證據；本資料集不從黨籍、公開發言或集體結果推論。',
      '研究截止日為 2026-11-09；來源檔案的實際公開時間仍依各來源頁面與保存 metadata 為準。',
    ],
    assertions: {
      everyRosterCandidateHasAudit:
        candidateInventory.length === roster.candidates.length,
      noPendingRecordPublished:
        dataset.coverageAssertions.publishedRecords === 0,
      noVotesInferred: dataset.coverageAssertions.individualVoteRecords === 0,
      noExecutiveInitiativesAdded:
        dataset.coverageAssertions.executiveInitiativeRecords === 0,
    },
  };
}

function buildSourceQualityReport(
  roster: OfficialDataset,
  dataset: PublicRecordsEnrichmentDataset,
) {
  const sourceRetrievalStatusCounts: CountMap = {};
  const sourceTierCounts: CountMap = {};
  const sourceIdentityStatusCounts: CountMap = {};
  const publisherCounts: CountMap = {};
  const attemptStatusCounts: CountMap = {};
  const attemptTierCounts: CountMap = {};
  const missingReasonCounts: CountMap = {};
  let retainedBytes = 0;
  for (const source of dataset.sourceSnapshots) {
    increment(sourceRetrievalStatusCounts, source.retrievalStatus);
    increment(sourceTierCounts, source.tier);
    increment(sourceIdentityStatusCounts, source.identityStatus);
    increment(publisherCounts, source.publisher);
    if (source.byteLength !== null) retainedBytes += source.byteLength;
  }
  for (const attempt of dataset.sourceAttempts) {
    increment(attemptStatusCounts, attempt.retrievalStatus);
    increment(attemptTierCounts, attempt.tier);
  }
  for (const audit of dataset.audits) {
    if (audit.outcome === 'sources-unavailable') {
      increment(missingReasonCounts, 'sources-unavailable');
    }
    if (audit.outcome === 'sources-attempted-no-additional-records') {
      increment(
        missingReasonCounts,
        'retrieved-without-machine-verifiable-record',
      );
    }
    if (audit.outcome === 'identity-conflict') {
      increment(missingReasonCounts, 'identity-conflict');
    }
  }
  const resolvedCandidates = new Set(
    dataset.sourceSnapshots.flatMap((source) =>
      source.identityStatus === 'resolved' ? source.candidateIds : [],
    ),
  );
  const candidateSourceCounts = roster.candidates.map((candidate) => {
    const attempts = dataset.sourceAttempts.filter(
      (attempt) => attempt.candidateId === candidate.id,
    );
    const sources = dataset.sourceSnapshots.filter((source) =>
      source.candidateIds.includes(candidate.id),
    );
    return {
      candidateId: candidate.id,
      displayName: candidate.displayName,
      sourceAttemptCount: attempts.length,
      retrievedAttemptCount: attempts.filter(
        (attempt) => attempt.retrievalStatus === 'retrieved',
      ).length,
      retainedSourceCount: sources.length,
      resolvedSourceCount: sources.filter(
        (source) => source.identityStatus === 'resolved',
      ).length,
      sourceUnavailable: attempts.every(
        (attempt) => attempt.retrievalStatus !== 'retrieved',
      ),
    };
  });

  return {
    reportId: 'public-record-enrichment-source-quality',
    snapshotDate: dataset.snapshotDate,
    researchCutoff: dataset.researchCutoff,
    candidateCount: roster.candidates.length,
    candidatesWithResolvedSources: resolvedCandidates.size,
    sourceSnapshotCount: dataset.sourceSnapshots.length,
    sourceRetrievalStatusCounts: sortedCounts(sourceRetrievalStatusCounts),
    sourceTierCounts: sortedCounts(sourceTierCounts),
    sourceIdentityStatusCounts: sortedCounts(sourceIdentityStatusCounts),
    sourcePublisherCounts: sortedCounts(publisherCounts),
    sourceAttemptCount: dataset.sourceAttempts.length,
    sourceAttemptStatusCounts: sortedCounts(attemptStatusCounts),
    sourceAttemptTierCounts: sortedCounts(attemptTierCounts),
    retainedByteCount: retainedBytes,
    retainedSourceHashValidation: {
      validatedBy: 'scripts/validate-public-records-enrichment.ts',
      retrievedSourceCount: dataset.sourceSnapshots.filter(
        (source) => source.retrievalStatus === 'retrieved',
      ).length,
      allRetrievedSourcesHaveMatchingSizeAndSha256: true,
    },
    sourceReferenceCount:
      dataset.evidence.length +
      dataset.positions.length +
      dataset.careerRecords.length +
      dataset.policyReferences.length,
    evidenceRecordCount: dataset.evidence.length,
    pendingReviewCounts: {
      claims: dataset.claims.length,
      positions: dataset.positions.length,
      careerRecords: dataset.careerRecords.length,
      policyReferences: dataset.policyReferences.length,
      publishedRecords: 0,
    },
    missingReasonCounts: sortedCounts(missingReasonCounts),
    identityOrAttributionConflicts: [],
    candidateSourceInventory: candidateSourceCounts.sort((left, right) =>
      compareText(left.candidateId, right.candidateId),
    ),
    limitations: [
      'source retrieval and checksum validation do not constitute human review or editorial approval.',
      'blocked, failed, and not-attempted retrievals are preserved as process states, not negative evidence.',
      'candidate-specific source availability is reported separately from policy or public-record absence.',
      'all 668 upstream policy records are references only and remain withheld-pending-review.',
    ],
  };
}

function markdownTable(
  headers: string[],
  rows: Array<Array<string | number | boolean>>,
): string[] {
  const lines = [
    '| ' + headers.join(' | ') + ' |',
    '| ' + headers.map(() => '---').join(' | ') + ' |',
  ];
  for (const row of rows) {
    lines.push('| ' + row.map((value) => String(value)).join(' | ') + ' |');
  }
  return lines;
}

function coverageMarkdown(
  report: ReturnType<typeof buildCoverageReport>,
): string {
  const lines = [
    '# 公共紀錄 enrichment coverage',
    '',
    '- 研究截止日：' + report.researchCutoff,
    '- roster snapshot：' + report.rosterSnapshotDate,
    '- 候選人：' + report.candidateCount,
    '- 新增公開紀錄：' + report.beforeAfter.newlyPublishedRecordCount,
    '- 待審查研究紀錄：' + report.beforeAfter.pendingResearchRecordCount,
    '',
    '## 前後狀態',
    '',
  ];
  lines.push(
    ...markdownTable(
      ['指標', '數量'],
      [
        [
          '既有 production public records',
          report.beforeAfter.baselinePublishedRecordCount,
        ],
        ['本次待審查 claims', report.researchPending.claims],
        ['本次待審查 positions', report.researchPending.positions],
        ['本次待審查 career records', report.researchPending.careerRecords],
        ['政策參照（仍 withheld）', report.researchPending.policyReferences],
        ['新增公開 records', report.beforeAfter.newlyPublishedRecordCount],
      ],
    ),
  );
  lines.push('', '## 候選人研究結果', '');
  lines.push(
    ...markdownTable(
      ['結果', '候選人數'],
      Object.entries(report.outcomeCounts).map(([key, value]) => [key, value]),
    ),
  );
  lines.push('', '## 選區 coverage', '');
  lines.push(
    ...markdownTable(
      ['選區', '候選人', '有紀錄', '政策參照', '待審查紀錄', '來源不可用'],
      report.coverageByDistrict.map((item) => [
        item.districtId,
        item.candidateCount,
        item.candidatesWithRecords,
        item.candidatesWithPolicyReferences,
        item.pendingRecordCount,
        item.sourcesUnavailableCount,
      ]),
    ),
  );
  lines.push('', '## Candidate inventory', '');
  lines.push(
    ...markdownTable(
      [
        '候選人',
        '選區',
        '結果',
        '來源嘗試',
        '保留來源',
        '政策參照',
        '職歷紀錄',
        '狀態',
      ],
      report.candidateInventory.map((item) => [
        item.displayName,
        item.districtId,
        item.outcome,
        item.sourceAttemptCount,
        item.retainedSourceCount,
        item.policyReferenceCount,
        item.positionRecordCount + item.careerRecordCount,
        item.researchStatus,
      ]),
    ),
  );
  lines.push('', '## 限制', '');
  for (const limitation of report.limitations) lines.push('- ' + limitation);
  return normalizeMarkdown(lines.join('\n'));
}

function sourceMarkdown(
  report: ReturnType<typeof buildSourceQualityReport>,
): string {
  const lines = [
    '# 公共紀錄 source quality',
    '',
    '- 研究截止日：' + report.researchCutoff,
    '- 候選人：' + report.candidateCount,
    '- source snapshots：' + report.sourceSnapshotCount,
    '- source attempts：' + report.sourceAttemptCount,
    '- checksum 驗證通過的 retrieved snapshots：' +
      report.retainedSourceHashValidation.retrievedSourceCount,
    '',
    '## Retrieval status',
    '',
  ];
  lines.push(
    ...markdownTable(
      ['狀態', '數量'],
      Object.entries(report.sourceRetrievalStatusCounts).map(([key, value]) => [
        key,
        value,
      ]),
    ),
  );
  lines.push('', '## Source tiers', '');
  lines.push(
    ...markdownTable(
      ['tier', 'snapshots'],
      Object.entries(report.sourceTierCounts).map(([key, value]) => [
        key,
        value,
      ]),
    ),
  );
  lines.push('', '## Missing / unavailable states', '');
  lines.push(
    ...markdownTable(
      ['狀態', '候選人數'],
      Object.entries(report.missingReasonCounts).map(([key, value]) => [
        key,
        value,
      ]),
    ),
  );
  lines.push('', '## Candidate source inventory', '');
  lines.push(
    ...markdownTable(
      ['候選人', '嘗試', 'retrieved', '保留來源', 'resolved', '來源不可用'],
      report.candidateSourceInventory.map((item) => [
        item.displayName,
        item.sourceAttemptCount,
        item.retrievedAttemptCount,
        item.retainedSourceCount,
        item.resolvedSourceCount,
        item.sourceUnavailable,
      ]),
    ),
  );
  lines.push('', '## Limitations', '');
  for (const limitation of report.limitations) lines.push('- ' + limitation);
  return normalizeMarkdown(lines.join('\n'));
}

function main(): void {
  const check = process.argv.includes('--check');
  const roster = validateOfficialDataset(approvedRoster);
  const policyResearch = validatePolicyResearchDataset(policyResearchInput);
  const dataset = loadPublicRecordsEnrichmentDataset();
  if (roster.candidates.length !== 106) {
    throw new Error('Expected 106 canonical candidates');
  }
  const coverage = buildCoverageReport(roster, policyResearch, dataset);
  const sourceQuality = buildSourceQualityReport(roster, dataset);
  writeOrCheck(COVERAGE_PATH, JSON.stringify(coverage, null, 2) + '\n', check);
  writeOrCheck(COVERAGE_MARKDOWN_PATH, coverageMarkdown(coverage), check);
  writeOrCheck(
    SOURCE_PATH,
    JSON.stringify(sourceQuality, null, 2) + '\n',
    check,
  );
  writeOrCheck(SOURCE_MARKDOWN_PATH, sourceMarkdown(sourceQuality), check);
  if (!check) {
    console.log(
      'Generated public-record coverage: ' +
        coverage.candidateCount +
        ' candidates, ' +
        dataset.claims.length +
        ' claims, ' +
        dataset.positions.length +
        ' positions, ' +
        dataset.careerRecords.length +
        ' career records, ' +
        dataset.policyReferences.length +
        ' pending policy references, 0 published.',
    );
  } else {
    console.log('Validated public-record coverage reports.');
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
