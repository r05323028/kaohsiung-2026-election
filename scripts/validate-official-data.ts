import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import approvedInput from '../data/approved/2026/kaohsiung-election.json';
import councilRosterInput from '../data/normalized/2026/kaohsiung-council-roster.json';
import manifestInput from '../data/official-source-manifest.json';
import cecConstituencies from '../data/raw/official/2026/cec-central-63625.json';
import cecRegistration from '../data/raw/official/2026/cec-central-64009.json';
import cecQualification from '../data/raw/official/2026/cec-central-65213.json';
import khecDrawing from '../data/raw/official/2026/khec-65366.json';
import khecAlias from '../data/raw/official/2026/khec-65368.json';
import khecBulletin from '../data/raw/official/2026/khec-bulletin.json';
import cecMayoralDirectory from '../data/raw/official/2026/research/cec-vote2026-c1-64000.json';
import cecCouncilDirectory from '../data/raw/official/2026/research/cec-vote2026-t-64000.json';
import { officialCandidateProfiles } from '../src/data/official';
import {
  parseCecArticleMetadata,
  parseCecCouncilCandidates,
  parseCecMayoralCandidates,
  parseCecQualifiedKaohsiungMayors,
  parseKhecBulletin,
  parseKhecDrawingMetadata,
  sourceChangeStatus,
} from '../src/data/official/adapters';
import {
  khecAliasStatus,
  validateCouncilRoster,
} from '../src/data/official/council';
import {
  reconcileOfficialData,
  reconciliationMarkdown,
} from '../src/data/official/reconcile';
import { validateOfficialDataset } from '../src/data/official/schema';
import type { CandidateProfileView } from '../src/data/view';

type ManifestSource = {
  id: string;
  rawPath?: string | null;
  attachmentPath?: string | null;
  sha256?: string | null;
  attachmentSha256?: string | null;
};

type ResearchAudit = {
  category: string;
  attemptedAt: string | null;
  attemptCount: number;
  resultStatus: string;
  conflictCount: number;
  claimIds: string[];
  evidenceIds: string[];
  reviewStatus: string;
  publicationStatus: string;
};

type ResearchCandidate = {
  candidateId: string;
  categories: ResearchAudit[];
};

type ResearchReport = {
  snapshotDate: string;
  candidates: ResearchCandidate[];
};

const root = process.cwd();
const manifest = manifestInput as { sources: ManifestSource[] };
const dataset = validateOfficialDataset(approvedInput);
const councilRoster = validateCouncilRoster(councilRosterInput);
const constituencyMetadata = parseCecArticleMetadata(
  cecConstituencies,
  'source-cec-central-63625',
);
const registrationMetadata = parseCecArticleMetadata(
  cecRegistration,
  'source-cec-central-64009',
);
const bulletinArticles = parseKhecBulletin(khecBulletin);
const qualifiedMayors = parseCecQualifiedKaohsiungMayors(cecQualification);
const directoryMayors = parseCecMayoralCandidates(cecMayoralDirectory);
const directoryCouncilCandidates =
  parseCecCouncilCandidates(cecCouncilDirectory);
const drawing = parseKhecDrawingMetadata(khecDrawing);
const aliasDrawing = parseKhecDrawingMetadata(khecAlias);
const aliasStatus = khecAliasStatus(
  drawing.fileId,
  aliasDrawing.fileId,
  '9bcbf34a3f18c634b3b619192288a2ff4712ef080d9d05343a90d5cf4a550aa1',
  '9bcbf34a3f18c634b3b619192288a2ff4712ef080d9d05343a90d5cf4a550aa1',
);
if (
  constituencyMetadata.publicationDate !== '2026-08-20' ||
  registrationMetadata.publicationDate !== '2026-08-27' ||
  !bulletinArticles.some((article) => article.articleId === 65366)
)
  throw new Error(
    'Official article metadata does not match retained snapshots.',
  );
if (
  drawing.fileId !== '9bd4f559-e527-4f55-a4ef-21653d340f79' ||
  aliasDrawing.fileId !== drawing.fileId ||
  !drawing.isImageOnly ||
  aliasStatus !== 'duplicate-alias'
)
  throw new Error(
    'KHEC drawing metadata or duplicate alias does not match the retained official files.',
  );
if (
  councilRoster.totalRowCount !== 101 ||
  councilRoster.constituencies.length !== 15 ||
  directoryCouncilCandidates.length !== 101
)
  throw new Error(
    'Council roster must contain 101 rows across 15 constituencies and the CEC directory must contain 101 rows.',
  );

const approvedNames = dataset.candidates
  .filter((candidate) => candidate.electionType === 'mayoral')
  .map((candidate) => candidate.displayName);
const qualifiedNames = qualifiedMayors.map(
  (candidate) => candidate.displayName,
);
if (
  JSON.stringify(approvedNames) !==
  JSON.stringify(['張靜', '王肇民', '柯志恩', '洪方隆', '賴瑞隆'])
)
  throw new Error('Approved mayor order changed unexpectedly.');
if (
  JSON.stringify(qualifiedNames.sort()) !==
  JSON.stringify(approvedNames.slice().sort())
)
  throw new Error('CEC qualified roster does not match approved mayor names.');

const directoryByName = new Map(
  directoryMayors.map((candidate) => [candidate.displayName, candidate]),
);
for (const candidate of dataset.candidates.filter(
  (item) => item.electionType === 'mayoral',
)) {
  const directoryCandidate = directoryByName.get(candidate.displayName);
  if (!directoryCandidate)
    throw new Error(
      `CEC directory is missing approved mayor ${candidate.displayName}.`,
    );
  if (
    candidate.candidateNumber !== directoryCandidate.candidateNumber ||
    candidate.politicalParty !== directoryCandidate.politicalParty ||
    candidate.birthDate !== directoryCandidate.birthDate ||
    !candidate.sourceIds.includes(directoryCandidate.sourceId) ||
    candidate.partyStatus !== 'published'
  )
    throw new Error(
      'Approved identity fields do not match CEC directory for ' +
        candidate.displayName +
        '.',
    );
}

const districtNumberById = new Map(
  councilRoster.constituencies.map((constituency) => [
    constituency.districtId,
    constituency.districtNumber,
  ]),
);
const rosterByKey = new Map<
  string,
  (typeof councilRoster.constituencies)[number]['rows'][number]
>(
  councilRoster.constituencies.flatMap((constituency) =>
    constituency.rows.map((row) => [
      `${constituency.districtNumber}:${row.candidateNumber}`,
      row,
    ]),
  ),
);
const approvedCouncilCandidates = dataset.candidates.filter(
  (candidate) => candidate.electionType !== 'mayoral',
);
const approvedByKey = new Map<
  string,
  (typeof approvedCouncilCandidates)[number]
>(
  approvedCouncilCandidates.flatMap((candidate) => {
    const districtNumber = districtNumberById.get(candidate.districtId);
    return districtNumber === undefined
      ? []
      : [
          [
            `${districtNumber}:${candidate.candidateNumber}`,
            candidate,
          ] as const,
        ];
  }),
);
if (
  approvedCouncilCandidates.length !== 101 ||
  approvedByKey.size !== 101 ||
  rosterByKey.size !== 101
)
  throw new Error(
    'Approved council identity map must contain exactly 101 rows.',
  );

for (const directoryCandidate of directoryCouncilCandidates) {
  const key = `${Number(directoryCandidate.areaCode)}:${directoryCandidate.candidateNumber}`;
  const approvedCandidate = approvedByKey.get(key);
  const rosterRow = rosterByKey.get(key);
  if (!approvedCandidate || !rosterRow)
    throw new Error(`CEC council directory row is unmatched: ${key}.`);
  if (
    approvedCandidate.politicalParty !== directoryCandidate.politicalParty ||
    approvedCandidate.birthDate !== directoryCandidate.birthDate ||
    approvedCandidate.partyStatus !== 'published' ||
    !approvedCandidate.sourceIds.includes(directoryCandidate.sourceId)
  )
    throw new Error(
      `Approved council identity fields do not match CEC directory: ${key} ${approvedCandidate.displayName}.`,
    );
  const hasNameConflict =
    rosterRow.displayName !== directoryCandidate.displayName;
  if (
    hasNameConflict !== Boolean(approvedCandidate.cecDirectoryName) ||
    (hasNameConflict &&
      approvedCandidate.cecDirectoryName !== directoryCandidate.displayName)
  )
    throw new Error(
      `CEC/KHEC source-name conflict metadata does not match: ${key}.`,
    );
}

for (const source of manifest.sources) {
  for (const [field, expected] of [
    ['rawPath', source.sha256],
    ['attachmentPath', source.attachmentSha256],
  ] as const) {
    const relative = source[field];
    if (!relative || !expected) continue;
    const bytes = await readFile(path.join(root, relative));
    const actual = createHash('sha256').update(bytes).digest('hex');
    if (sourceChangeStatus(expected, actual) === 'changed')
      throw new Error(
        `Source checksum mismatch for ${source.id} ${field}: expected ${expected}, got ${actual}.`,
      );
  }
}

const report = reconcileOfficialData(
  dataset,
  qualifiedNames,
  councilRoster,
  directoryCouncilCandidates,
);
if (
  report.counts.councilSourceRows !== 101 ||
  report.counts.councilNormalizedRows !== 101 ||
  report.counts.councilApprovedRows !== 101 ||
  report.counts.councilPublishedRows !== 101 ||
  !report.publication.councilCandidatesPublished ||
  !report.cecCouncil ||
  report.cecCouncil.sourceRows !== 101 ||
  report.cecCouncil.matchedRows !== 101 ||
  report.cecCouncil.missingCandidates.length > 0 ||
  report.cecCouncil.unexpectedCandidates.length > 0 ||
  report.cecCouncil.partyMismatches.length > 0 ||
  report.cecCouncil.birthDateMismatches.length > 0 ||
  report.cecCouncil.sourceNameConflicts.length !== 9
)
  throw new Error(
    'Council roster reconciliation must cover 101 rows with zero structural CEC mismatches and nine pending source-name conflicts.',
  );

let fullRosterResearch: ResearchReport;
try {
  fullRosterResearch = JSON.parse(
    await readFile(
      path.join(root, 'reports/full-roster-research.json'),
      'utf8',
    ),
  ) as ResearchReport;
} catch (error) {
  throw new Error(
    'Unable to read or parse reports/full-roster-research.json: ' +
      (error instanceof Error ? error.message : String(error)),
  );
}
const researchByCandidateId = new Map(
  fullRosterResearch.candidates.map((candidate) => [
    candidate.candidateId,
    candidate,
  ]),
);

const sectionKeys = [
  'biography',
  'policies',
  'public-records',
  'news',
  'public-relationships',
  'timeline',
] as const;
type SectionKey = (typeof sectionKeys)[number];
const researchCategoryBySection: Record<SectionKey, string> = {
  biography: 'positions',
  policies: 'policies',
  'public-records': 'activities',
  news: 'news',
  'public-relationships': 'relationships',
  timeline: 'timeline',
};
const automatedCategoryBySection: Record<SectionKey, string> = {
  biography: 'basic-biography',
  policies: 'policies',
  'public-records': 'public-records',
  news: 'news',
  'public-relationships': 'relationships',
  timeline: 'timeline',
};

type SectionCoverage = {
  researchAttempted: boolean;
  evidenceFound: boolean;
  evidenceRecordCount: number;
  researchClaimCount: number;
  editorialApprovedRecords: number;
  displayedRecords: number;
  researchResultStatus: string;
  researchConflictCount: number;
};

function legacyOrPublicRecordCount(
  publicCount: number,
  legacyCount: number,
): number {
  return publicCount > 0 ? publicCount : legacyCount;
}

function displayedCount(
  profile: CandidateProfileView,
  section: SectionKey,
): number {
  const automatedCount =
    profile.automatedPublication?.claims.filter(
      (claim) => claim.category === automatedCategoryBySection[section],
    ).length ?? 0;
  switch (section) {
    case 'biography': {
      const biographyCount = profile.biography?.claims.length ?? 0;
      const positions = profile.publicRecords?.positions ?? [];
      return (
        automatedCount +
        biographyCount +
        legacyOrPublicRecordCount(positions.length, profile.positions.length)
      );
    }
    case 'policies':
      return (
        automatedCount +
        legacyOrPublicRecordCount(
          profile.publicRecords?.policies.length ?? 0,
          profile.policies.length,
        )
      );
    case 'public-records':
      return (
        automatedCount +
        legacyOrPublicRecordCount(
          profile.publicRecords?.activities.length ?? 0,
          profile.records.length,
        )
      );
    case 'news':
      return (
        automatedCount +
        legacyOrPublicRecordCount(
          profile.publicRecords?.news.length ?? 0,
          profile.news.length,
        )
      );
    case 'public-relationships':
      return (
        automatedCount +
        legacyOrPublicRecordCount(
          profile.publicRecords?.relationships.length ?? 0,
          profile.relationships.length,
        )
      );
    case 'timeline':
      return (
        automatedCount +
        (profile.biography?.claims.length ?? 0) +
        legacyOrPublicRecordCount(
          profile.publicRecords?.timeline.length ?? 0,
          profile.timeline.length,
        )
      );
  }
}

function editorialApprovedCount(
  profile: CandidateProfileView,
  section: SectionKey,
): number {
  if (section === 'biography')
    return (
      profile.biography?.claims.filter(
        (claim) =>
          claim.editorialStatus === 'editorially-approved' &&
          claim.publicationStatus === 'approved-static',
      ).length ?? 0
    );
  const records =
    section === 'policies'
      ? profile.publicRecords?.policies
      : section === 'public-records'
        ? profile.publicRecords?.activities
        : section === 'news'
          ? profile.publicRecords?.news
          : section === 'public-relationships'
            ? profile.publicRecords?.relationships
            : profile.publicRecords?.timeline;
  return (
    records?.filter(
      (record) => record.publicationStatus === 'approved-source-backed',
    ).length ?? 0
  );
}

function getSectionCoverage(
  profile: CandidateProfileView,
  researchCandidate: ResearchCandidate,
  section: SectionKey,
): SectionCoverage {
  const audit = researchCandidate.categories.find(
    (item) => item.category === researchCategoryBySection[section],
  );
  if (!audit)
    throw new Error(
      `Research report is missing ${section} audit for ${profile.person.displayName}.`,
    );
  const researchAttempted =
    audit.attemptCount > 0 || audit.attemptedAt !== null;
  return {
    researchAttempted,
    evidenceFound: audit.evidenceIds.length > 0,
    evidenceRecordCount: audit.evidenceIds.length,
    researchClaimCount: audit.claimIds.length,
    editorialApprovedRecords: editorialApprovedCount(profile, section),
    displayedRecords: displayedCount(profile, section),
    researchResultStatus: audit.resultStatus,
    researchConflictCount: audit.conflictCount,
  };
}

type IdentityCoverage = {
  fieldsPresent: {
    name: boolean;
    district: boolean;
    candidateNumber: boolean;
    partyRegistration: boolean;
    birthDate: boolean;
    sourceReference: boolean;
  };
  presentFieldCount: number;
  totalFieldCount: 6;
  complete: boolean;
  partyRegistrationLabel: string | null;
  sourceIds: string[];
  cecDirectoryName?: string;
  sourceNameConflictPending: boolean;
};

type CandidateCoverage = {
  candidateId: string;
  slug: string;
  displayName: string;
  districtId: string;
  districtNumber: number;
  candidateNumber: string;
  identity: IdentityCoverage;
  sections: Record<SectionKey, SectionCoverage>;
};

const councilProfiles = officialCandidateProfiles.filter(
  (profile) => profile.candidacy.electionType !== 'mayoral',
);
if (councilProfiles.length !== 101)
  throw new Error(
    `Rendered official council profiles must contain 101 candidates, got ${councilProfiles.length}.`,
  );

const candidateCoverage: CandidateCoverage[] = councilProfiles.map(
  (profile) => {
    const candidate = dataset.candidates.find(
      (item) => item.id === profile.candidacy.id,
    );
    if (!candidate)
      throw new Error(
        `Missing approved candidate ${profile.person.displayName}.`,
      );
    const districtNumber = districtNumberById.get(candidate.districtId);
    if (districtNumber === undefined)
      throw new Error(
        `Missing council district number for ${candidate.displayName}.`,
      );
    const researchCandidate = researchByCandidateId.get(candidate.id);
    if (!researchCandidate)
      throw new Error(`Research report is missing ${candidate.displayName}.`);
    const sections = Object.fromEntries(
      sectionKeys.map((section) => [
        section,
        getSectionCoverage(profile, researchCandidate, section),
      ]),
    ) as Record<SectionKey, SectionCoverage>;
    const fieldsPresent = {
      name: profile.person.displayName.length > 0,
      district: profile.district.id === candidate.districtId,
      candidateNumber: profile.candidacy.candidateNumber.length > 0,
      partyRegistration:
        candidate.partyStatus === 'published' &&
        typeof candidate.politicalParty === 'string' &&
        candidate.politicalParty.length > 0,
      birthDate: Boolean(candidate.birthDate),
      sourceReference: candidate.sourceIds.includes(
        'source-cec-vote2026-t-64000',
      ),
    };
    const presentFieldCount =
      Object.values(fieldsPresent).filter(Boolean).length;
    return {
      candidateId: candidate.id,
      slug: candidate.slug,
      displayName: candidate.displayName,
      districtId: candidate.districtId,
      districtNumber,
      candidateNumber: candidate.candidateNumber,
      identity: {
        fieldsPresent,
        presentFieldCount,
        totalFieldCount: 6,
        complete: presentFieldCount === 6,
        partyRegistrationLabel: candidate.politicalParty,
        ...(candidate.cecDirectoryName
          ? { cecDirectoryName: candidate.cecDirectoryName }
          : {}),
        sourceIds: candidate.sourceIds,
        sourceNameConflictPending: Boolean(candidate.cecDirectoryName),
      },
      sections,
    };
  },
);

function aggregateSections(entries: CandidateCoverage[]): Record<
  SectionKey,
  {
    candidateCount: number;
    researchAttemptedCount: number;
    evidenceFoundCount: number;
    evidenceRecordCount: number;
    researchClaimCount: number;
    editorialApprovedRecords: number;
    displayedRecords: number;
  }
> {
  return Object.fromEntries(
    sectionKeys.map((section) => {
      const values = entries.map((entry) => entry.sections[section]);
      return [
        section,
        {
          candidateCount: entries.length,
          researchAttemptedCount: values.filter(
            (value) => value.researchAttempted,
          ).length,
          evidenceFoundCount: values.filter((value) => value.evidenceFound)
            .length,
          evidenceRecordCount: values.reduce(
            (sum, value) => sum + value.evidenceRecordCount,
            0,
          ),
          researchClaimCount: values.reduce(
            (sum, value) => sum + value.researchClaimCount,
            0,
          ),
          editorialApprovedRecords: values.reduce(
            (sum, value) => sum + value.editorialApprovedRecords,
            0,
          ),
          displayedRecords: values.reduce(
            (sum, value) => sum + value.displayedRecords,
            0,
          ),
        },
      ];
    }),
  ) as Record<
    SectionKey,
    {
      candidateCount: number;
      researchAttemptedCount: number;
      evidenceFoundCount: number;
      evidenceRecordCount: number;
      researchClaimCount: number;
      editorialApprovedRecords: number;
      displayedRecords: number;
    }
  >;
}

const coverageByDistrict = councilRoster.constituencies.map((constituency) => {
  const entries = candidateCoverage.filter(
    (candidate) => candidate.districtNumber === constituency.districtNumber,
  );
  if (entries.length !== constituency.rows.length)
    throw new Error(
      `District ${constituency.districtNumber} coverage has ${entries.length} candidates; expected ${constituency.rows.length}.`,
    );
  return {
    districtNumber: constituency.districtNumber,
    districtId: constituency.districtId,
    candidateCount: entries.length,
    completeIdentityBundles: entries.filter(
      (candidate) => candidate.identity.complete,
    ).length,
    sourceNameConflictPendingCount: entries.filter(
      (candidate) => candidate.identity.sourceNameConflictPending,
    ).length,
    sections: aggregateSections(entries),
  };
});

const coverageSummary = {
  councilCandidates: candidateCoverage.length,
  councilDistricts: coverageByDistrict.length,
  identityBundlesComplete: candidateCoverage.filter(
    (candidate) => candidate.identity.complete,
  ).length,
  sourceNameConflictsPending: candidateCoverage.filter(
    (candidate) => candidate.identity.sourceNameConflictPending,
  ).length,
  sections: aggregateSections(candidateCoverage),
};

const coverageReport = {
  reportVersion: '1.0.0',
  reportType: '2026-council-profile-coverage',
  researchCutoff: '2026-11-09',
  rosterSnapshotDate: dataset.snapshotDate,
  researchSnapshotDate: fullRosterResearch.snapshotDate,
  status: 'partial-before-final-announcement',
  sourceIds: ['source-khec-65366', 'source-cec-vote2026-t-64000'],
  identityFieldPolicy:
    'CEC election-directory party/registration and birth fields are source-backed identity data; party/registration is not proof of party membership. KHEC drawn names, identifiers, and non-final number semantics remain canonical.',
  substantivePublicationPolicy:
    'Research evidence and automated basic-biography records are reported separately; pending or unapproved substantive claims are not published.',
  summary: coverageSummary,
  districts: coverageByDistrict,
  candidates: candidateCoverage,
};

function metricCell(metric: SectionCoverage): string {
  return `${metric.displayedRecords}（研${metric.researchAttempted ? '✓' : '—'}／證${metric.evidenceFound ? '✓' : '—'}／編${metric.editorialApprovedRecords}）`;
}

const sectionLabels: Record<SectionKey, string> = {
  biography: '履歷',
  policies: '政策主張',
  'public-records': '公共紀錄',
  news: '新聞',
  'public-relationships': '公共關係史',
  timeline: '時間軸',
};

const summaryRows = sectionKeys
  .map((section) => {
    const metric = coverageSummary.sections[section];
    return `| ${sectionLabels[section]} | ${metric.candidateCount} | ${metric.researchAttemptedCount} | ${metric.evidenceFoundCount} | ${metric.editorialApprovedRecords} | ${metric.displayedRecords} |`;
  })
  .join('\n');
const districtRows = coverageByDistrict
  .map(
    (district) =>
      `| ${district.districtNumber} | ${district.candidateCount} | ${district.completeIdentityBundles} | ${district.sourceNameConflictPendingCount} | ${sectionKeys.map((section) => district.sections[section].displayedRecords).join('／')} |`,
  )
  .join('\n');
const candidateRows = candidateCoverage
  .map(
    (candidate) =>
      `| ${candidate.districtNumber} | ${candidate.candidateNumber} | ${candidate.displayName} | ${candidate.identity.presentFieldCount}/${candidate.identity.totalFieldCount} | ${sectionKeys.map((section) => metricCell(candidate.sections[section])).join(' | ')} |`,
  )
  .join('\n');

const coverageMarkdown = [
  '# 2026 高雄市議員候選人 profile coverage',
  '',
  '- Research cutoff: 2026-11-09',
  `- Roster snapshot: ${dataset.snapshotDate}`,
  `- Research snapshot: ${fullRosterResearch.snapshotDate}`,
  '- Scope: 15 districts, 101 council candidates; mayoral profiles are excluded from the candidate matrix.',
  '- Identity fields: CEC election-directory party/registration and birth fields are source-backed; they do not establish party membership. KHEC drawn names, stable identifiers, and non-final ballot semantics remain canonical.',
  '- Substantive tabs: machine research, pending claims, and automated basic-biography records are not counted as human/editorially approved substantive records.',
  '',
  '## Overall section coverage',
  '',
  '| Section | Candidates | Research attempted | Evidence found | Editorially approved | Displayed records |',
  '| --- | ---: | ---: | ---: | ---: | ---: |',
  summaryRows,
  '',
  'Identity bundles complete: ' +
    `${coverageSummary.identityBundlesComplete}/${coverageSummary.councilCandidates}`,
  '',
  'CEC/KHEC source-name conflicts pending manual reconciliation: ' +
    `${coverageSummary.sourceNameConflictsPending}`,
  '',
  '## District coverage',
  '',
  '| District | Candidates | Complete identity | Name conflicts pending | Displayed records by section（履歷／政策／紀錄／新聞／關係／時間軸） |',
  '| ---: | ---: | ---: | ---: | --- |',
  districtRows,
  '',
  '## Candidate coverage',
  '',
  '| District | Number | Candidate | Identity | 履歷 | 政策主張 | 公共紀錄 | 新聞 | 公共關係史 | 時間軸 |',
  '| ---: | ---: | --- | ---: | --- | --- | --- | --- | --- | --- |',
  candidateRows,
  '',
  '## Interpretation and limitations',
  '',
  '- “Research attempted” and “Evidence found” describe the retained research/audit layer; they do not grant publication approval.',
  '- “Displayed records” is measured from the assembled profile view. The current council slice contains only the identity bundle for all 101 candidates and a small number of automated basic-biography cards; the substantive tabs remain neutral where no approved records exist.',
  '- Nine CEC/KHEC source-name differences, including Indigenous Romanized-name variants, remain a pending human identity reconciliation and were not silently normalized.',
  '- No CEC portrait path is redistributed because image reuse rights were not established.',
  '',
].join('\n');

await mkdir(path.join(root, 'reports'), { recursive: true });
await writeFile(
  path.join(root, 'reports/election-reconciliation.json'),
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8',
);
await writeFile(
  path.join(root, 'reports/election-reconciliation.md'),
  reconciliationMarkdown(report),
  'utf8',
);
await writeFile(
  path.join(root, 'reports/council-profile-coverage.json'),
  `${JSON.stringify(coverageReport, null, 2)}\n`,
  'utf8',
);
await writeFile(
  path.join(root, 'reports/council-profile-coverage.md'),
  coverageMarkdown,
  'utf8',
);
console.log(
  `Validated official snapshot ${dataset.snapshotDate}: ${report.counts.approvedMayors} approved mayors, ${report.counts.councilPublishedRows} preliminary council rows, ${report.counts.officialDistricts} districts, ${report.counts.pendingReviewScopes} pending review scope; CEC council identity ${report.cecCouncil?.matchedRows ?? 0}/101 with ${report.cecCouncil?.sourceNameConflicts.length ?? 0} name conflicts. Coverage report written for ${candidateCoverage.length} council candidates.`,
);
