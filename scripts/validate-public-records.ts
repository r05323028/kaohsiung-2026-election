import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import approvedInput from '../data/approved/2026/kaohsiung-public-records.json';
import normalizedInput from '../data/normalized/2026/kaohsiung-public-records.json';
import manifestInput from '../data/official-source-manifest.json';
import { officialDataset } from '../src/data/official';
import {
  parseKccMemberProfile,
  parseKccNewsArticle,
  sourceChangeStatus,
  sourceContainsText,
} from '../src/data/public-records/adapters';
import { validatePublicRecordsDataset } from '../src/data/public-records/schema';

const root = process.cwd();
const snapshotDate = '2026-11-05';
const sourceIds = {
  liMember: 'source-kcc-member-2186-li-meizhen',
  wangMember: 'source-kcc-member-2230-wang-yixiong',
  li17284: 'source-kcc-news-17284',
  li17102: 'source-kcc-news-17102',
  wang17293: 'source-kcc-news-17293',
  wang17093: 'source-kcc-news-17093',
} as const;

const expectedQuotes = {
  li17284:
    '市府應面對找得到工作卻看不到加薪、薪水增加追不上居住成本、想成家又擔心租期和育兒安排等問題，也應建立青年創業集資平台。',
  li17102: '捷運紫線卡關，北高雄交通建設不能再等。',
  wang17293:
    '回顧歷年政策推動，王義雄議員今(13)日總質詢指出，遺憾陳其邁市長施政對原住民重要議題不夠尊重',
  wang17093:
    '對原住民的承諾不能只是「研議中」，王義雄議員今(12)日總質詢批評原民會主委上任至今只會辦活動、未見政績',
} as const;

type ManifestSource = (typeof manifestInput.sources)[number];
const sourceById = new Map<string, ManifestSource>(
  manifestInput.sources.map((source) => [source.id, source]),
);
const manifestSourceIds = new Set(
  manifestInput.sources.map((source) => source.id),
);

type Snapshot = {
  source: ManifestSource;
  bytes: Buffer;
  text: string;
  checksumStatus: 'unchanged' | 'changed';
};

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function readSnapshot(sourceId: string): Promise<Snapshot> {
  const source = sourceById.get(sourceId);
  if (!source) throw new Error(`Missing manifest entry for ${sourceId}.`);
  if (!source.rawPath || !source.sha256) {
    throw new Error(`Manifest source ${sourceId} has no checked-in snapshot.`);
  }
  const bytes = await readFile(path.join(root, source.rawPath));
  const actualSha256 = sha256(bytes);
  const checksumStatus = sourceChangeStatus(source.sha256, actualSha256);
  if (checksumStatus === 'changed') {
    throw new Error(
      `Public-record snapshot checksum mismatch for ${sourceId}: expected ${source.sha256}, got ${actualSha256}.`,
    );
  }
  return { source, bytes, text: bytes.toString('utf8'), checksumStatus };
}

function assertEqual(label: string, left: unknown, right: unknown): void {
  if (JSON.stringify(left) !== JSON.stringify(right)) {
    throw new Error(`${label} is not deterministic or differs between layers.`);
  }
}

const selectedSourceIds = Object.values(sourceIds);
const snapshots = new Map<string, Snapshot>();
for (const sourceId of selectedSourceIds) {
  snapshots.set(sourceId, await readSnapshot(sourceId));
}

const liMember = snapshots.get(sourceIds.liMember);
const wangMember = snapshots.get(sourceIds.wangMember);
if (!liMember || !wangMember) {
  throw new Error('Selected member snapshots were not loaded.');
}
const liProfile = parseKccMemberProfile(liMember.text, sourceIds.liMember);
const wangProfile = parseKccMemberProfile(
  wangMember.text,
  sourceIds.wangMember,
);
assertEqual(
  'Li member adapter output',
  liProfile,
  parseKccMemberProfile(liMember.text, sourceIds.liMember),
);
assertEqual(
  'Wang member adapter output',
  wangProfile,
  parseKccMemberProfile(wangMember.text, sourceIds.wangMember),
);
if (
  liProfile.displayName !== '李眉蓁' ||
  liProfile.memberIdentifier !== '2186' ||
  !liProfile.isCurrentMemberPage ||
  wangProfile.displayName !== '王義雄' ||
  wangProfile.memberIdentifier !== '2230' ||
  !wangProfile.isCurrentMemberPage
) {
  throw new Error('KCC member identity adapter checks failed.');
}

const newsCandidates = {
  [sourceIds.li17284]: '李眉蓁',
  [sourceIds.li17102]: '李眉蓁',
  [sourceIds.wang17293]: '王義雄',
  [sourceIds.wang17093]: '王義雄',
};
for (const [sourceId, candidateName] of Object.entries(newsCandidates)) {
  const snapshot = snapshots.get(sourceId);
  if (!snapshot)
    throw new Error(`Selected news snapshot was not loaded: ${sourceId}.`);
  const first = parseKccNewsArticle(snapshot.text, sourceId, candidateName);
  const second = parseKccNewsArticle(snapshot.text, sourceId, candidateName);
  assertEqual(`${sourceId} adapter output`, first, second);
  if (!first.mentionsCandidate) {
    throw new Error(`${sourceId} does not mention ${candidateName}.`);
  }
  const quote =
    expectedQuotes[
      Object.entries(sourceIds).find(
        ([, value]) => value === sourceId,
      )?.[0] as keyof typeof expectedQuotes
    ];
  if (!quote || !sourceContainsText(snapshot.text, quote)) {
    throw new Error(`Expected retained quote was not found in ${sourceId}.`);
  }
}

const normalized = validatePublicRecordsDataset(
  normalizedInput,
  manifestSourceIds,
);
const approved = validatePublicRecordsDataset(approvedInput, manifestSourceIds);
assertEqual(
  'normalized and approved public-record layers',
  normalized,
  approved,
);
if (
  normalized.snapshotDate !== snapshotDate ||
  approved.snapshotDate !== snapshotDate
) {
  throw new Error('Public-record snapshot dates are inconsistent.');
}

if (
  normalized.selectedCandidateIds.length !==
    normalized.selectedPersonIds.length ||
  new Set(normalized.selectedCandidateIds).size !==
    normalized.selectedCandidateIds.length ||
  new Set(normalized.selectedPersonIds).size !==
    normalized.selectedPersonIds.length
) {
  throw new Error(
    'Selected public-record candidate and person IDs are not aligned.',
  );
}

const candidatesById = new Map(
  officialDataset.candidates.map((candidate) => [candidate.id, candidate]),
);
const selectedCandidates = normalized.selectedCandidateIds.map(
  (candidateId, index) => {
    const personId = normalized.selectedPersonIds[index];
    if (!personId) {
      throw new Error(
        'Public-record candidate is missing a matching person ID: ' +
          candidateId,
      );
    }
    const candidate = candidatesById.get(candidateId);
    if (!candidate || `person-${candidate.slug}` !== personId) {
      throw new Error(
        'Public-record identity is not matched to the canonical profile: ' +
          candidateId,
      );
    }
    return {
      candidateId,
      personId,
      displayName: candidate.displayName,
    };
  },
);

const categories = {
  positions: normalized.positions,
  policies: normalized.policies,
  activities: normalized.activities,
  news: normalized.news,
  relationships: normalized.relationships,
  timeline: normalized.timeline,
} as const;
type Category = keyof typeof categories;
const selectedCandidateSummaries = selectedCandidates.map((candidate) => {
  const counts = Object.fromEntries(
    (Object.keys(categories) as Category[]).map((category) => [
      category,
      categories[category].filter((record) =>
        'personIds' in record
          ? record.personIds.includes(candidate.personId)
          : record.personId === candidate.personId,
      ).length,
    ]),
  ) as Record<Category, number>;
  const unavailableCategories = (Object.keys(counts) as Category[]).filter(
    (category) => counts[category] === 0,
  );
  return {
    ...candidate,
    counts,
    unavailableCategories,
  };
});

const claimsWithEvidence = normalized.claims.filter(
  (claim) => claim.evidenceIds.length > 0,
).length;
const records = Object.values(categories).flat();
const recordsWithEvidence = records.filter(
  (record) => record.evidenceIds.length > 0,
).length;
const pendingRecordCount = records.filter(
  (record) => record.validationStatus !== 'source-backed',
).length;
const pendingClaimCount = normalized.claims.filter(
  (claim) => claim.validationStatus !== 'source-backed',
).length;
const pendingEvidenceCount = normalized.evidence.filter(
  (item) => item.validationStatus !== 'source-backed',
).length;
const sourceChecks = selectedSourceIds.map((sourceId) => {
  const snapshot = snapshots.get(sourceId);
  if (!snapshot) throw new Error(`Missing source check ${sourceId}.`);
  return {
    sourceId,
    sha256: sha256(snapshot.bytes),
    status: snapshot.checksumStatus,
  };
});

const coverageReport = {
  reportVersion: '1.0.0',
  reportType: 'public-record-coverage',
  datasetId: normalized.datasetId,
  snapshotDate,
  scope: 'representative-selected-candidate-slice',
  status: 'source-checked-static',
  selectedCandidateCount: normalized.selectedCandidateIds.length,
  selectedPersonCount: normalized.selectedPersonIds.length,
  sourceSnapshotCount: sourceChecks.length,
  claims: normalized.claims.length,
  evidence: normalized.evidence.length,
  records: {
    positions: normalized.positions.length,
    policies: normalized.policies.length,
    activities: normalized.activities.length,
    news: normalized.news.length,
    relationships: normalized.relationships.length,
    timeline: normalized.timeline.length,
  },
  selectedCandidates: selectedCandidateSummaries,
  unavailableCategoryCount: selectedCandidateSummaries.reduce(
    (total, candidate) => total + candidate.unavailableCategories.length,
    0,
  ),
  notes: [
    'This is a representative slice, not a complete public-record dataset for every candidate.',
    'Unavailable categories are neutral absence states, not claims that no records exist.',
    'KCC institutional summaries document participation and do not establish personal achievements or administrative outcomes.',
  ],
};

const qualityReport = {
  reportVersion: '1.0.0',
  reportType: 'public-record-quality',
  datasetId: normalized.datasetId,
  snapshotDate,
  status: 'source-checked-static',
  sourceIntegrity: {
    checkedSourceCount: sourceChecks.length,
    changedSourceCount: sourceChecks.filter(
      (source) => source.status === 'changed',
    ).length,
    sourceChecks,
  },
  evidenceCoverage: {
    claimCount: normalized.claims.length,
    claimsWithEvidence,
    recordCount: records.length,
    recordsWithEvidence,
    evidenceCount: normalized.evidence.length,
    pendingClaimCount,
    pendingEvidenceCount,
    pendingRecordCount,
  },
  identityResolution: {
    resolvedCount: normalized.identityResolutions.filter(
      (item) => item.status === 'resolved',
    ).length,
    pendingCount: normalized.identityResolutions.filter(
      (item) => item.status === 'pending-verification',
    ).length,
    rejectedCount: normalized.identityResolutions.filter(
      (item) => item.status === 'rejected',
    ).length,
  },
  conflicts: {
    total: normalized.conflicts.length,
    open: normalized.conflicts.filter((item) => item.status === 'open').length,
    resolved: normalized.conflicts.filter((item) => item.status === 'resolved')
      .length,
  },
  publication: {
    datasetStatus: normalized.validation.status,
    publicationMeaning:
      'source-checked-static-display; factual review occurs in GitHub Pull Requests',
  },
  integrityAssertions: {
    partyInferred: false,
    achievementInferred: false,
    relationshipInferred: false,
    rankingProduced: false,
    normalizedMatchesApproved: true,
    selectedCandidatesMatchCanonicalProfiles: true,
  },
};

function coverageMarkdown(report: typeof coverageReport): string {
  const rows = report.selectedCandidates
    .map(
      (candidate) =>
        `| ${candidate.displayName} | ${candidate.counts.positions} | ${candidate.counts.policies} | ${candidate.counts.activities} | ${candidate.counts.news} | ${candidate.counts.relationships} | ${candidate.counts.timeline} | ${candidate.unavailableCategories.length ? candidate.unavailableCategories.join('、') : '—'} |`,
    )
    .join('\n');
  return `# Public-record coverage report\n\n- Dataset: \`${report.datasetId}\`\n- Snapshot: ${report.snapshotDate}\n- Scope: representative selected-candidate slice\n- Status: **source-checked static**\n- Selected candidates: ${report.selectedCandidateCount}\n- Claims: ${report.claims}; evidence items: ${report.evidence}\n\n## Category coverage\n\n| 人物 | 職務 | 政策 | 活動 | 新聞 | 關係 | 時間軸 | 中性空白分類 |\n| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |\n${rows}\n\n## Interpretation\n\n- This report measures the checked-in representative slice; it is not a ranking or completeness claim about candidates.\n- A category with no record is rendered as unavailable and does not imply that no such record exists.\n- The source-backed items describe institutional identity or documented participation. They are not presented as personal achievements, policy completion, or administrative outcomes.\n`;
}

function qualityMarkdown(report: typeof qualityReport): string {
  return `# Public-record quality report\n\n- Dataset: \`${report.datasetId}\`\n- Snapshot: ${report.snapshotDate}\n- Status: **${report.status}**\n- Publication meaning: ${report.publication.publicationMeaning}\n\n## Evidence and source checks\n\n- Sources checked: ${report.sourceIntegrity.checkedSourceCount}; checksum changes: ${report.sourceIntegrity.changedSourceCount}\n- Claims with evidence: ${report.evidenceCoverage.claimsWithEvidence}/${report.evidenceCoverage.claimCount}\n- Records with evidence: ${report.evidenceCoverage.recordsWithEvidence}/${report.evidenceCoverage.recordCount}\n- Pending claims/evidence/records: ${report.evidenceCoverage.pendingClaimCount}/${report.evidenceCoverage.pendingEvidenceCount}/${report.evidenceCoverage.pendingRecordCount}\n- Identity resolutions: ${report.identityResolution.resolvedCount} resolved, ${report.identityResolution.pendingCount} pending, ${report.identityResolution.rejectedCount} rejected\n- Conflicts: ${report.conflicts.total} total, ${report.conflicts.open} open, ${report.conflicts.resolved} resolved\n\n## Integrity boundaries\n\n- Party inferred: no\n- Achievement inferred: no\n- Family or political relationship inferred: no\n- Candidate ranking produced: no\n- Human reviewer: not recorded\n- Human review date: not recorded\n\nThe source-backed layer is eligible for static display because every displayed item has retained official evidence. Content review is performed in the Pull Request that changes the committed dataset.\n`;
}

await mkdir(path.join(root, '.cache/reports'), { recursive: true });
await writeFile(
  path.join(root, '.cache/reports/public-record-coverage.json'),
  `${JSON.stringify(coverageReport, null, 2)}\n`,
  'utf8',
);
await writeFile(
  path.join(root, '.cache/reports/public-record-coverage.md'),
  coverageMarkdown(coverageReport),
  'utf8',
);
await writeFile(
  path.join(root, '.cache/reports/public-record-quality.json'),
  `${JSON.stringify(qualityReport, null, 2)}\n`,
  'utf8',
);
await writeFile(
  path.join(root, '.cache/reports/public-record-quality.md'),
  qualityMarkdown(qualityReport),
  'utf8',
);
console.log(
  `Validated public-record slice: ${normalized.claims.length} claims, ${records.length} records, ${normalized.selectedCandidateIds.length} selected candidates; content review is handled in GitHub Pull Requests.`,
);
