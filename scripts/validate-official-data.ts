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
import khecMayorFinal from '../data/raw/official/2026/khec-65759.json';
import khecCouncilFinal from '../data/raw/official/2026/khec-66006.json';
import khecDrawingBulletin from '../data/raw/official/2026/khec-bulletin.json';
import khecFinalBulletin from '../data/raw/official/2026/khec-bulletin-2026-11-19.json';
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
const drawingBulletinArticles = parseKhecBulletin(khecDrawingBulletin);
const finalBulletinArticles = parseKhecBulletin(khecFinalBulletin);
const qualifiedMayors = parseCecQualifiedKaohsiungMayors(cecQualification);
const directoryMayors = parseCecMayoralCandidates(cecMayoralDirectory);
const directoryCouncilCandidates =
  parseCecCouncilCandidates(cecCouncilDirectory);
const drawing = parseKhecDrawingMetadata(khecDrawing);
const aliasDrawing = parseKhecDrawingMetadata(khecAlias);
const mayorFinal = parseKhecDrawingMetadata(khecMayorFinal);
const councilFinal = parseKhecDrawingMetadata(khecCouncilFinal);
const aliasStatus = khecAliasStatus(
  drawing.fileId,
  aliasDrawing.fileId,
  '9bcbf34a3f18c634b3b619192288a2ff4712ef080d9d05343a90d5cf4a550aa1',
  '9bcbf34a3f18c634b3b619192288a2ff4712ef080d9d05343a90d5cf4a550aa1',
);
if (
  constituencyMetadata.publicationDate !== '2026-08-20' ||
  registrationMetadata.publicationDate !== '2026-08-27' ||
  !drawingBulletinArticles.some((article) => article.articleId === 65366) ||
  !finalBulletinArticles.some((article) => article.articleId === 65759) ||
  !finalBulletinArticles.some((article) => article.articleId === 66006)
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
  mayorFinal.beginDate !== '2026-11-12' ||
  mayorFinal.fileId !== 'b18b321c-76a2-43af-aae7-e985402e7300' ||
  !mayorFinal.isImageOnly ||
  councilFinal.beginDate !== '2026-11-17' ||
  councilFinal.fileId !== '1b7d791c-9ae8-4669-8f57-1adf71cc2996' ||
  !councilFinal.isImageOnly
)
  throw new Error(
    'KHEC final-announcement metadata does not match the retained official files.',
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
  report.cecCouncil.sourceNameConflicts.length !== 9 ||
  report.status !== 'ready' ||
  report.counts.pendingVerificationScopes !== 0 ||
  report.publication.councilRosterStatus !== 'formally-announced' ||
  report.publication.finalAnnouncementDates.mayoral !== '2026-11-12' ||
  report.publication.finalAnnouncementDates.council !== '2026-11-17'
)
  throw new Error(
    'Council roster reconciliation must cover 101 rows with zero structural CEC mismatches and nine pending source-name conflicts.',
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

type SectionCoverage = {
  researchAttempted: boolean;
  evidenceFound: boolean;
  evidenceRecordCount: number;
  researchClaimCount: number;
  sourceBackedRecords: number;
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
  const biographyCount = profile.biography?.claims.length ?? 0;
  switch (section) {
    case 'biography': {
      const positions = profile.publicRecords?.positions ?? [];
      return (
        biographyCount +
        legacyOrPublicRecordCount(positions.length, profile.positions.length)
      );
    }
    case 'policies':
      return legacyOrPublicRecordCount(
        profile.publicRecords?.policies.length ?? 0,
        profile.policies.length,
      );
    case 'public-records':
      return legacyOrPublicRecordCount(
        profile.publicRecords?.activities.length ?? 0,
        profile.records.length,
      );
    case 'news':
      return legacyOrPublicRecordCount(
        profile.publicRecords?.news.length ?? 0,
        profile.news.length,
      );
    case 'public-relationships':
      return legacyOrPublicRecordCount(
        profile.publicRecords?.relationships.length ?? 0,
        profile.relationships.length,
      );
    case 'timeline':
      return (
        biographyCount +
        legacyOrPublicRecordCount(
          profile.publicRecords?.timeline.length ?? 0,
          profile.timeline.length,
        )
      );
  }
}

type CoverageRecord = {
  claimIds?: readonly string[];
  evidenceIds?: readonly string[];
  publicationStatus?: string;
};

function recordsForSection(
  profile: CandidateProfileView,
  section: SectionKey,
): readonly CoverageRecord[] {
  const records =
    section === 'biography'
      ? (profile.biography?.claims ?? [])
      : section === 'policies'
        ? (profile.publicRecords?.policies ?? [])
        : section === 'public-records'
          ? (profile.publicRecords?.activities ?? [])
          : section === 'news'
            ? (profile.publicRecords?.news ?? [])
            : section === 'public-relationships'
              ? (profile.publicRecords?.relationships ?? [])
              : (profile.publicRecords?.timeline ?? []);
  return records as readonly CoverageRecord[];
}

function sourceBackedRecordCount(
  profile: CandidateProfileView,
  section: SectionKey,
): number {
  if (section === 'biography') return profile.biography?.claims.length ?? 0;
  return recordsForSection(profile, section).filter(
    (record) => record.publicationStatus === 'source-backed',
  ).length;
}

function getSectionCoverage(
  profile: CandidateProfileView,
  section: SectionKey,
): SectionCoverage {
  const records = recordsForSection(profile, section);
  const evidenceRecordCount = records.reduce(
    (count, record) => count + (record.evidenceIds?.length ?? 0),
    0,
  );
  const researchClaimCount = records.reduce(
    (count, record) => count + (record.claimIds?.length ?? 0),
    0,
  );
  return {
    researchAttempted: records.length > 0,
    evidenceFound: evidenceRecordCount > 0,
    evidenceRecordCount,
    researchClaimCount: researchClaimCount || records.length,
    sourceBackedRecords: sourceBackedRecordCount(profile, section),
    displayedRecords: displayedCount(profile, section),
    researchResultStatus:
      records.length > 0 ? 'evidence-found' : 'no-records-retained',
    researchConflictCount: profile.publicRecords?.conflicts.length ?? 0,
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
    const sections = Object.fromEntries(
      sectionKeys.map((section) => [
        section,
        getSectionCoverage(profile, section),
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
    sourceBackedRecords: number;
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
          sourceBackedRecords: values.reduce(
            (sum, value) => sum + value.sourceBackedRecords,
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
      sourceBackedRecords: number;
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
  researchSnapshotDate: dataset.snapshotDate,
  status: 'formally-announced',
  sourceIds: [
    'source-khec-65759',
    'source-khec-66006',
    'source-cec-vote2026-t-64000',
  ],
  identityFieldPolicy:
    'CEC election-directory party/registration and birth fields are source-backed identity data; party/registration is not proof of party membership. KHEC final-announcement names, identifiers, and final numbers are canonical.',
  substantivePublicationPolicy:
    'Retained research evidence and source-backed records are reported separately; unsupported claims are not published.',
  summary: coverageSummary,
  districts: coverageByDistrict,
  candidates: candidateCoverage,
};

function metricCell(metric: SectionCoverage): string {
  return `${metric.displayedRecords}（研${metric.researchAttempted ? '✓' : '—'}／證${metric.evidenceFound ? '✓' : '—'}／編${metric.sourceBackedRecords}）`;
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
    return `| ${sectionLabels[section]} | ${metric.candidateCount} | ${metric.researchAttemptedCount} | ${metric.evidenceFoundCount} | ${metric.sourceBackedRecords} | ${metric.displayedRecords} |`;
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
  `- Research snapshot: ${dataset.snapshotDate}`,
  '- Scope: 15 districts, 101 council candidates; mayoral profiles are excluded from the candidate matrix.',
  '- Identity fields: CEC election-directory party/registration and birth fields are source-backed; they do not establish party membership. KHEC final-announcement names, stable identifiers, and final ballot numbers are canonical.',
  '- Substantive tabs: Retained research and source-backed records are measured separately; unsupported claims are not displayed.',
  '',
  '## Overall section coverage',
  '',
  '| Section | Candidates | Research attempted | Evidence found | Source-backed | Displayed records |',
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

await mkdir(path.join(root, '.cache/reports'), { recursive: true });
await writeFile(
  path.join(root, '.cache/reports/election-reconciliation.json'),
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8',
);
await writeFile(
  path.join(root, '.cache/reports/election-reconciliation.md'),
  reconciliationMarkdown(report),
  'utf8',
);
await writeFile(
  path.join(root, '.cache/reports/council-profile-coverage.json'),
  `${JSON.stringify(coverageReport, null, 2)}\n`,
  'utf8',
);
await writeFile(
  path.join(root, '.cache/reports/council-profile-coverage.md'),
  coverageMarkdown,
  'utf8',
);
console.log(
  `Validated official snapshot ${dataset.snapshotDate}: ${report.counts.approvedMayors} approved mayors, ${report.counts.councilPublishedRows} formally announced council rows, ${report.counts.officialDistricts} districts, ${report.counts.pendingVerificationScopes} pending source checks; CEC council identity ${report.cecCouncil?.matchedRows ?? 0}/101 with ${report.cecCouncil?.sourceNameConflicts.length ?? 0} name conflicts. Coverage report written for ${candidateCoverage.length} council candidates.`,
);
