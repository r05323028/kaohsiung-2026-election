import type { CouncilRoster } from './council';
import type { OfficialCandidate, OfficialDataset } from './schema';

export type ConstituencyReconciliation = {
  districtId: string;
  districtNumber: number;
  officialSourceRows: number;
  normalizedRows: number;
  approvedRows: number;
  publishedRows: number;
  pendingRows: number;
  missingCandidates: string[];
  unexpectedCandidates: string[];
  duplicateCandidates: string[];
  numberMismatches: string[];
  partyMismatches: string[];
  constituencyMismatches: string[];
  status: 'complete' | 'partial' | 'failed';
};

export type ReconciliationReport = {
  reportVersion: '2.0.0';
  datasetId: string;
  snapshotDate: string;
  status: 'partial' | 'ready';
  sources: {
    qualification: string;
    drawing: string;
    drawingAlias: string;
    constituency: string;
  };
  sourceAliases: Array<{
    sourceId: string;
    aliasOf: string;
    disposition: 'duplicate-alias';
  }>;
  counts: {
    cecQualifiedMayors: number;
    approvedMayors: number;
    matchedMayors: number;
    pendingReviewScopes: number;
    officialDistricts: number;
    councilConstituencies: number;
    councilSourceRows: number;
    councilNormalizedRows: number;
    councilApprovedRows: number;
    councilPublishedRows: number;
  };
  mayorMatches: string[];
  councilConstituencies: ConstituencyReconciliation[];
  discrepancies: string[];
  pendingReview: OfficialDataset['pendingReview'];
  publication: {
    approvedCandidateCount: number;
    approvedDistrictCount: number;
    finalAnnouncementsPending: string[];
    councilCandidatesPublished: boolean;
    councilRosterStatus: 'preliminary-drawn-non-final' | 'not-published';
  };
};

function namesByNumber(
  candidates: OfficialCandidate[],
): Map<string, OfficialCandidate> {
  return new Map(
    candidates.map((candidate) => [candidate.candidateNumber, candidate]),
  );
}

function reconcileConstituency(
  roster: CouncilRoster['constituencies'][number],
  candidates: OfficialCandidate[],
): ConstituencyReconciliation {
  const approvedByNumber = namesByNumber(candidates);
  const expectedNumbers = roster.rows.map((row) => row.candidateNumber);
  const expectedNames = new Map(
    roster.rows.map((row) => [row.candidateNumber, row.displayName]),
  );
  const missingCandidates = expectedNumbers
    .filter((number) => !approvedByNumber.has(number))
    .map((number) => `${number} ${expectedNames.get(number) ?? ''}`.trim());
  const unexpectedCandidates = [...approvedByNumber.entries()]
    .filter(
      ([number, candidate]) =>
        expectedNames.get(number) !== candidate.displayName,
    )
    .map(([number, candidate]) => `${number} ${candidate.displayName}`);
  const numberMismatches = candidates.flatMap((candidate) => {
    const expected = roster.rows.find(
      (row) => row.displayName === candidate.displayName,
    );
    return expected && expected.candidateNumber !== candidate.candidateNumber
      ? [
          `${candidate.displayName}: expected ${expected.candidateNumber}, got ${candidate.candidateNumber}`,
        ]
      : [];
  });
  const partyMismatches = candidates
    .filter(
      (candidate) =>
        candidate.partyStatus === 'published' ||
        candidate.politicalParty !== null,
    )
    .map((candidate) => `${candidate.displayName}: source has no party field`);
  const constituencyMismatches = candidates
    .filter((candidate) => candidate.districtId !== roster.districtId)
    .map((candidate) => `${candidate.displayName}: ${candidate.districtId}`);
  const duplicateNames = candidates
    .map((candidate) => candidate.displayName)
    .filter((name, index, all) => all.indexOf(name) !== index);
  const duplicateCandidates = [...new Set(duplicateNames)];
  const failed =
    missingCandidates.length > 0 ||
    unexpectedCandidates.length > 0 ||
    duplicateCandidates.length > 0 ||
    numberMismatches.length > 0 ||
    partyMismatches.length > 0 ||
    constituencyMismatches.length > 0;
  return {
    districtId: roster.districtId,
    districtNumber: roster.districtNumber,
    officialSourceRows: roster.rows.length,
    normalizedRows: roster.rows.length,
    approvedRows: candidates.length,
    publishedRows: candidates.filter(
      (candidate) => candidate.publicationStatus === 'approved',
    ).length,
    pendingRows: candidates.filter(
      (candidate) => candidate.publicationStatus !== 'approved',
    ).length,
    missingCandidates,
    unexpectedCandidates,
    duplicateCandidates,
    numberMismatches,
    partyMismatches,
    constituencyMismatches,
    status: failed ? 'failed' : 'complete',
  };
}

export function reconcileOfficialData(
  dataset: OfficialDataset,
  cecNames: string[],
  councilRoster?: CouncilRoster,
): ReconciliationReport {
  const approvedMayors = dataset.candidates.filter(
    (candidate) => candidate.electionType === 'mayoral',
  );
  const approvedMayorNames = approvedMayors.map(
    (candidate) => candidate.displayName,
  );
  const approvedSet = new Set(approvedMayorNames);
  const cecSet = new Set(cecNames);
  const mayorMatches = cecNames.filter((name) => approvedSet.has(name));
  const discrepancies = [
    ...cecNames
      .filter((name) => !approvedSet.has(name))
      .map((name) => `CEC qualified mayor missing from approved data: ${name}`),
    ...approvedMayorNames
      .filter((name) => !cecSet.has(name))
      .map(
        (name) =>
          `Approved mayor missing from CEC qualification source: ${name}`,
      ),
  ];
  const councilCandidates = dataset.candidates.filter(
    (candidate) => candidate.electionType !== 'mayoral',
  );
  const councilConstituencies = councilRoster
    ? councilRoster.constituencies.map((constituency) =>
        reconcileConstituency(
          constituency,
          councilCandidates.filter(
            (candidate) => candidate.districtId === constituency.districtId,
          ),
        ),
      )
    : [];
  if (councilRoster) {
    const expectedDistrictByName = new Map(
      councilRoster.constituencies.flatMap((constituency) =>
        constituency.rows.map((row) => [
          row.displayName,
          constituency.districtId,
        ]),
      ),
    );
    for (const candidate of councilCandidates) {
      const expectedDistrictId = expectedDistrictByName.get(
        candidate.displayName,
      );
      if (!expectedDistrictId || expectedDistrictId === candidate.districtId)
        continue;
      const expectedConstituency = councilConstituencies.find(
        (constituency) => constituency.districtId === expectedDistrictId,
      );
      expectedConstituency?.constituencyMismatches.push(
        `${candidate.displayName}: expected ${expectedDistrictId}, got ${candidate.districtId}`,
      );
      if (expectedConstituency) expectedConstituency.status = 'failed';
    }
  }
  for (const constituency of councilConstituencies) {
    for (const value of [
      ...constituency.missingCandidates,
      ...constituency.unexpectedCandidates,
      ...constituency.numberMismatches,
      ...constituency.partyMismatches,
      ...constituency.constituencyMismatches,
    ])
      discrepancies.push(`District ${constituency.districtNumber}: ${value}`);
  }
  return {
    reportVersion: '2.0.0',
    datasetId: dataset.datasetId,
    snapshotDate: dataset.snapshotDate,
    status:
      dataset.pendingReview.length > 0 ||
      discrepancies.length > 0 ||
      councilConstituencies.some(
        (constituency) => constituency.status === 'failed',
      )
        ? 'partial'
        : 'ready',
    sources: {
      qualification: 'source-cec-central-65213',
      drawing: 'source-khec-65366',
      drawingAlias: 'source-khec-65368',
      constituency: 'source-cec-central-63625',
    },
    sourceAliases: [
      {
        sourceId: 'source-khec-65368',
        aliasOf: 'source-khec-65366',
        disposition: 'duplicate-alias',
      },
    ],
    counts: {
      cecQualifiedMayors: cecNames.length,
      approvedMayors: approvedMayors.length,
      matchedMayors: mayorMatches.length,
      pendingReviewScopes: dataset.pendingReview.length,
      officialDistricts: dataset.districts.length,
      councilConstituencies: councilConstituencies.length,
      councilSourceRows: councilConstituencies.reduce(
        (sum, constituency) => sum + constituency.officialSourceRows,
        0,
      ),
      councilNormalizedRows: councilConstituencies.reduce(
        (sum, constituency) => sum + constituency.normalizedRows,
        0,
      ),
      councilApprovedRows: councilConstituencies.reduce(
        (sum, constituency) => sum + constituency.approvedRows,
        0,
      ),
      councilPublishedRows: councilConstituencies.reduce(
        (sum, constituency) => sum + constituency.publishedRows,
        0,
      ),
    },
    mayorMatches,
    councilConstituencies,
    discrepancies,
    pendingReview: dataset.pendingReview,
    publication: {
      approvedCandidateCount: dataset.candidates.filter(
        (candidate) => candidate.publicationStatus === 'approved',
      ).length,
      approvedDistrictCount: dataset.districts.filter(
        (district) => district.publicationStatus === 'approved',
      ).length,
      finalAnnouncementsPending: [
        '高雄市長候選人正式公告（預定 2026-11-12）',
        '高雄市議員候選人正式公告（預定 2026-11-17）',
      ],
      councilCandidatesPublished: councilCandidates.length > 0,
      councilRosterStatus:
        councilCandidates.length > 0
          ? 'preliminary-drawn-non-final'
          : 'not-published',
    },
  };
}

export function reconciliationMarkdown(report: ReconciliationReport): string {
  const pending = report.pendingReview.length
    ? report.pendingReview
        .map(
          (item) =>
            `- ${item.scope}: ${item.reason}（預定處理日 ${item.expectedResolutionDate}）`,
        )
        .join('\n')
    : '- None.';
  const discrepancies = report.discrepancies.length
    ? report.discrepancies.map((item) => `- ${item}`).join('\n')
    : '- None.';
  const matched = report.mayorMatches.map((name) => `- ${name}`).join('\n');
  const constituencyRows = report.councilConstituencies
    .map(
      (item) =>
        `| ${item.districtNumber} | ${item.officialSourceRows} | ${item.normalizedRows} | ${item.approvedRows} | ${item.publishedRows} | ${item.pendingRows} | ${item.status} |`,
    )
    .join('\n');
  return [
    '# 2026 高雄選舉資料 reconciliation report',
    '',
    `- Snapshot: ${report.snapshotDate}`,
    `- Status: ${report.status}`,
    `- Sources: qualification ${report.sources.qualification}; drawing ${report.sources.drawing}; alias ${report.sources.drawingAlias}; constituency ${report.sources.constituency}`,
    '- Article 65368 is a duplicate bulletin alias for article 65366 and is not independent evidence.',
    '',
    '## Counts',
    '',
    '| Metric | Count |',
    '| --- | ---: |',
    `| CEC qualified mayor names | ${report.counts.cecQualifiedMayors} |`,
    `| Approved mayor profiles | ${report.counts.approvedMayors} |`,
    `| Matched mayor names | ${report.counts.matchedMayors} |`,
    `| Official districts | ${report.counts.officialDistricts} |`,
    `| Council constituencies | ${report.counts.councilConstituencies} |`,
    `| Council source rows | ${report.counts.councilSourceRows} |`,
    `| Council normalized rows | ${report.counts.councilNormalizedRows} |`,
    `| Council approved rows | ${report.counts.councilApprovedRows} |`,
    `| Council published rows | ${report.counts.councilPublishedRows} |`,
    `| Pending review scopes | ${report.counts.pendingReviewScopes} |`,
    '',
    '## Council constituency coverage',
    '',
    '| District | Source | Normalized | Approved | Published | Pending | Status |',
    '| ---: | ---: | ---: | ---: | ---: | ---: | --- |',
    constituencyRows || '| — | 0 | 0 | 0 | 0 | 0 | not-published |',
    '',
    '## Publication decision',
    '',
    `The approved slice publishes ${report.publication.approvedCandidateCount} source-backed candidate profiles across ${report.publication.approvedDistrictCount} districts. The council roster is ${report.publication.councilRosterStatus}; all displayed numbers remain drawn/non-final and the formal council announcement is still pending.`,
    '',
    `Final-announcement blockers: ${report.publication.finalAnnouncementsPending.join('；')}。`,
    '',
    '## Matched mayor names',
    '',
    matched || '- None.',
    '',
    '## Pending review',
    '',
    pending,
    '',
    '## Discrepancies',
    '',
    discrepancies,
    '',
  ].join('\n');
}
