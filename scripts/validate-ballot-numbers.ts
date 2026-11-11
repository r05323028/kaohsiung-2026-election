import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import approvedInput from '../data/approved/2026/kaohsiung-election.json';
import councilRosterInput from '../data/normalized/2026/kaohsiung-council-roster.json';
import normalizedMayorInput from '../data/normalized/2026/kaohsiung-election.json';
import manifestInput from '../data/official-source-manifest.json';
import cecMayoralDirectory from '../data/raw/official/2026/research/cec-vote2026-c1-64000.json';
import {
  candidateProfiles,
  getDistrictCandidates,
  searchIndex,
} from '../src/data';
import {
  getOfficialDistrictCandidates,
  officialCandidateProfiles,
  officialSearchIndex,
} from '../src/data/official';
import { parseCecMayoralCandidates } from '../src/data/official/adapters';
import {
  auditBallotNumbers,
  BALLOT_NUMBER_DRAW_PAGE,
  BALLOT_NUMBER_PUBLICATION_DATE,
  BALLOT_NUMBER_SOURCE_ID,
  type BallotNumberStatus,
  ballotNumberContestKey,
  ballotNumberText,
  formatBallotNumber,
  parseBallotNumber,
} from '../src/data/official/ballot';
import { validateCouncilRoster } from '../src/data/official/council';
import { validateOfficialDataset } from '../src/data/official/schema';

type ApprovedDataset = ReturnType<typeof validateOfficialDataset>;
type Candidate = ApprovedDataset['candidates'][number];
type District = ApprovedDataset['districts'][number];

type OfficialRow = {
  districtId: string;
  districtNumber: number;
  electionType: string;
  candidateNumber: string;
  displayName: string;
  sourceLocation: string;
};

type AuditRow = {
  candidateId: string;
  candidateName: string;
  electionType: string;
  constituency: string;
  ballotNumber: string;
  sourcePage: string;
  verificationStatus: 'verified' | 'verified-source-name-variant' | 'unmatched';
};

type Issue = { code: string; message: string };

const root = process.cwd();
const dataset = validateOfficialDataset(approvedInput);
const roster = validateCouncilRoster(councilRosterInput);
const mayors = parseCecMayoralCandidates(cecMayoralDirectory);
const manifest = manifestInput as {
  sources: {
    id: string;
    title?: string;
    publicationDate?: string;
    url?: string;
    attachmentPath?: string | null;
    attachmentSha256?: string | null;
  }[];
};

const normalizeName = (value: string) =>
  value.normalize('NFKC').replace(/\s+/gu, '').toLowerCase();

const districtById = new Map<string, District>(
  dataset.districts.map((district) => [district.id, district]),
);
const candidatesByKey = new Map<string, Candidate>();
for (const candidate of dataset.candidates)
  candidatesByKey.set(
    `${candidate.districtId}:${candidate.candidateNumber}`,
    candidate,
  );

const officialRows: OfficialRow[] = [
  ...mayors.map((mayor) => ({
    districtId: 'district-kaohsiung-mayor-2026',
    districtNumber: 0,
    electionType: 'mayoral',
    candidateNumber: String(mayor.candidateNumber),
    displayName: mayor.displayName,
    sourceLocation: 'CEC vote2026 C1 市長候選人目錄',
  })),
  ...roster.constituencies.flatMap((constituency) => {
    const district = districtById.get(constituency.districtId);
    if (!district)
      throw new Error(
        `Roster constituency ${constituency.districtId} is missing from the approved dataset.`,
      );
    return constituency.rows.map((row) => ({
      districtId: constituency.districtId,
      districtNumber: constituency.districtNumber,
      electionType: district.electionType,
      candidateNumber: row.candidateNumber,
      displayName: row.displayName,
      sourceLocation: row.sourceLocation,
    }));
  }),
];

const issues: Issue[] = [];
const issue = (code: string, message: string) => {
  issues.push({ code, message });
};

const expectedTableReference = (district: District) =>
  district.electionType === 'mayoral'
    ? `第${BALLOT_NUMBER_DRAW_PAGE}頁・高雄市市長`
    : `第${BALLOT_NUMBER_DRAW_PAGE}頁・${district.districtLabel.split('・')[1] ?? district.districtLabel}`;

const auditRows: AuditRow[] = dataset.candidates.map((candidate) => {
  const district = districtById.get(candidate.districtId);
  const officialRow = candidatesByKey.has(
    `${candidate.districtId}:${candidate.candidateNumber}`,
  )
    ? officialRows.find(
        (row) =>
          row.districtId === candidate.districtId &&
          parseBallotNumber(row.candidateNumber) ===
            parseBallotNumber(candidate.candidateNumber),
      )
    : undefined;
  const names = [candidate.displayName, candidate.cecDirectoryName];
  const verified =
    officialRow !== undefined &&
    names.some(
      (name) =>
        typeof name === 'string' &&
        normalizeName(name) === normalizeName(officialRow.displayName),
    );
  return {
    candidateId: candidate.id,
    candidateName: candidate.displayName,
    electionType: candidate.electionType,
    constituency: district?.districtLabel ?? candidate.districtId,
    ballotNumber: candidate.candidateNumber,
    sourcePage: candidate.candidateNumberSource
      ? String(candidate.candidateNumberSource.page ?? BALLOT_NUMBER_DRAW_PAGE)
      : '—',
    verificationStatus:
      officialRow === undefined
        ? 'unmatched'
        : verified
          ? 'verified'
          : 'verified-source-name-variant',
  };
});

/* 1. Expected roster size and election-type coverage. */
const countByType = new Map<string, number>();
for (const candidate of dataset.candidates)
  countByType.set(
    candidate.electionType,
    (countByType.get(candidate.electionType) ?? 0) + 1,
  );
const expectedCounts: Record<string, number> = {
  mayoral: 5,
  'city-council': 91,
  'indigenous-council': 10,
};
if (dataset.candidates.length !== 106)
  issue(
    'count.total',
    `Expected 106 candidates, found ${dataset.candidates.length}.`,
  );
for (const [type, expected] of Object.entries(expectedCounts)) {
  const actual = countByType.get(type) ?? 0;
  if (actual !== expected)
    issue(
      'count.type',
      `Expected ${expected} ${type} candidates, found ${actual}.`,
    );
}

/* 2. Each candidate keeps a valid number plus explicit provenance. */
const ballotEntries = dataset.candidates.map((candidate) => ({
  candidateId: candidate.id,
  candidateName: candidate.displayName,
  electionType: candidate.electionType,
  districtId: candidate.districtId,
  candidateNumber: candidate.candidateNumber,
  candidateNumberStatus: candidate.candidateNumberStatus as BallotNumberStatus,
}));

const provenanceSource = dataset.sources.find(
  (source) => source.id === BALLOT_NUMBER_SOURCE_ID,
);
if (!provenanceSource)
  issue(
    'source.missing',
    `Ballot source ${BALLOT_NUMBER_SOURCE_ID} is absent from the dataset.`,
  );
if (provenanceSource?.publicationDate !== BALLOT_NUMBER_PUBLICATION_DATE)
  issue(
    'source.publicationDate',
    `Ballot source publication date is ${provenanceSource?.publicationDate ?? 'missing'}, expected ${BALLOT_NUMBER_PUBLICATION_DATE}.`,
  );

const audit = auditBallotNumbers(ballotEntries, {
  hasProvenance: (entry) => {
    const candidate = dataset.candidates.find(
      (item) => item.id === entry.candidateId,
    );
    return (
      candidate?.candidateNumberSource?.sourceId === BALLOT_NUMBER_SOURCE_ID
    );
  },
});
for (const entry of audit.unpublished)
  issue(
    'number.unpublished',
    `${entry.candidateName} (${entry.candidateId}) has no published ballot number.`,
  );
for (const entry of audit.invalid)
  issue('number.invalid', `${entry.candidateName}: ${entry.message}`);
for (const entry of audit.missingProvenance)
  issue('number.provenance', `${entry.candidateName}: ${entry.message}`);
for (const duplicate of audit.duplicates)
  issue(
    'number.duplicate',
    `Contest ${duplicate.contest} repeats ballot number ${duplicate.ballotNumber}: ${duplicate.candidateIds.join(', ')}.`,
  );

for (const candidate of dataset.candidates) {
  const district = districtById.get(candidate.districtId);
  if (!district) {
    issue(
      'district.missing',
      `${candidate.id} references unknown district ${candidate.districtId}.`,
    );
    continue;
  }
  if (candidate.electionType !== district.electionType)
    issue(
      'district.electionType',
      `${candidate.id} is ${candidate.electionType} but its district is ${district.electionType}.`,
    );
  const provenance = candidate.candidateNumberSource;
  if (!provenance) {
    issue(
      'provenance.missing',
      `${candidate.id} has no candidateNumberSource.`,
    );
    continue;
  }
  if (provenance.sourceId !== BALLOT_NUMBER_SOURCE_ID)
    issue(
      'provenance.source',
      `${candidate.id} cites ${provenance.sourceId}, expected ${BALLOT_NUMBER_SOURCE_ID}.`,
    );
  if (provenance.publicationDate !== BALLOT_NUMBER_PUBLICATION_DATE)
    issue(
      'provenance.date',
      `${candidate.id} cites publication date ${provenance.publicationDate}.`,
    );
  if (provenance.page !== BALLOT_NUMBER_DRAW_PAGE)
    issue(
      'provenance.page',
      `${candidate.id} cites page ${provenance.page ?? 'none'}.`,
    );
  if (provenance.tableReference !== expectedTableReference(district))
    issue(
      'provenance.tableReference',
      `${candidate.id} cites "${provenance.tableReference}", expected "${expectedTableReference(district)}".`,
    );
  const finalWithoutStatus =
    candidate.candidateNumberIsFinal &&
    candidate.candidateNumberStatus !== 'final';
  const statusWithoutFinal =
    !candidate.candidateNumberIsFinal &&
    candidate.candidateNumberStatus === 'final';
  if (finalWithoutStatus || statusWithoutFinal)
    issue(
      'number.finalFlag',
      `${candidate.id} disagrees between candidateNumberStatus=${candidate.candidateNumberStatus} and candidateNumberIsFinal=${candidate.candidateNumberIsFinal}.`,
    );
}

/* 3. Official rows are all accounted for, in both directions. */
if (officialRows.length !== 106)
  issue(
    'rows.total',
    `Expected 106 official rows, found ${officialRows.length}.`,
  );
if (
  roster.totalRowCount !== 101 ||
  officialRows.filter((row) => row.electionType !== 'mayoral').length !== 101
)
  issue(
    'rows.roster',
    `Expected 101 council rows, roster declares ${roster.totalRowCount} and expands to ${officialRows.filter((row) => row.electionType !== 'mayoral').length}.`,
  );

const matchedRowKeys = new Set<string>();
for (const row of officialRows) {
  const number = parseBallotNumber(row.candidateNumber);
  if (number === null) {
    issue(
      'rows.invalid',
      `Official row ${row.sourceLocation} carries "${row.candidateNumber}".`,
    );
    continue;
  }
  const candidate = candidatesByKey.get(
    `${row.districtId}:${row.candidateNumber}`,
  );
  if (!candidate) {
    issue(
      'rows.unmatched',
      `Official row ${row.sourceLocation} (${row.displayName}) has no repository candidate.`,
    );
    continue;
  }
  matchedRowKeys.add(candidate.id);
  const names = [candidate.displayName, candidate.cecDirectoryName];
  if (
    !names.some(
      (name) =>
        typeof name === 'string' &&
        normalizeName(name) === normalizeName(row.displayName),
    )
  )
    issue(
      'rows.nameConflict',
      `${candidate.id} is "${candidate.displayName}" but the official row reads "${row.displayName}".`,
    );
}
for (const candidate of dataset.candidates)
  if (!matchedRowKeys.has(candidate.id))
    issue('rows.missing', `${candidate.id} has no official source row.`);

/* 4. Constituency coverage: 11 regular + 4 Indigenous + 1 mayoral contest. */
const contests = new Map<string, number>();
for (const candidate of dataset.candidates) {
  const key = ballotNumberContestKey(candidate);
  contests.set(key, (contests.get(key) ?? 0) + 1);
}
const districtNumberPattern = /-(\d{2})$/;
const regularNumbers = new Set<number>();
const indigenousNumbers = new Set<number>();
for (const district of dataset.districts) {
  const match = districtNumberPattern.exec(district.id);
  if (!match) continue;
  const number = Number(match[1]);
  if (district.electionType === 'indigenous-council')
    indigenousNumbers.add(number);
  else if (district.electionType === 'city-council') regularNumbers.add(number);
}
for (let number = 1; number <= 11; number += 1)
  if (!regularNumbers.has(number))
    issue('coverage.regular', `Regular constituency ${number} is missing.`);
for (let number = 12; number <= 15; number += 1)
  if (!indigenousNumbers.has(number))
    issue(
      'coverage.indigenous',
      `Indigenous constituency ${number} is missing.`,
    );
if (!contests.has('mayoral:district-kaohsiung-mayor-2026'))
  issue('coverage.mayoral', 'The mayoral contest has no candidates.');
if (contests.size !== 16)
  issue('coverage.contests', `Expected 16 contests, found ${contests.size}.`);

/* 5. Generated datasets keep the same identity/number mapping. */
const compareDataset = (
  label: string,
  profiles: readonly {
    candidacy: {
      id: string;
      districtId: string;
      candidateNumber: string;
      candidateNumberStatus?: string;
    };
  }[],
) => {
  if (profiles.length !== dataset.candidates.length)
    issue(
      `${label}.length`,
      `${label} exposes ${profiles.length} candidates, dataset has ${dataset.candidates.length}.`,
    );
  for (const profile of profiles) {
    const candidate = dataset.candidates.find(
      (item) => item.id === profile.candidacy.id,
    );
    if (!candidate) {
      issue(
        `${label}.unknown`,
        `${label} exposes unknown candidate ${profile.candidacy.id}.`,
      );
      continue;
    }
    if (
      profile.candidacy.districtId !== candidate.districtId ||
      parseBallotNumber(profile.candidacy.candidateNumber) !==
        parseBallotNumber(candidate.candidateNumber)
    )
      issue(
        `${label}.mismatch`,
        `${profile.candidacy.id} drifts between dataset and ${label}.`,
      );
  }
};
compareDataset('officialCandidateProfiles', officialCandidateProfiles);
compareDataset('candidateProfiles', candidateProfiles);

/* 6. Numeric ordering in every candidate-facing collection. */
const assertNumericOrder = (
  label: string,
  items: readonly {
    candidacy: { id: string; districtId: string; candidateNumber: string };
  }[],
) => {
  const byDistrict = new Map<
    string,
    { id: string; candidateNumber: string }[]
  >();
  for (const item of items) {
    const list = byDistrict.get(item.candidacy.districtId) ?? [];
    list.push({
      id: item.candidacy.id,
      candidateNumber: item.candidacy.candidateNumber,
    });
    byDistrict.set(item.candidacy.districtId, list);
  }
  for (const [districtId, list] of byDistrict) {
    let previous = 0;
    for (const entry of list) {
      const number = parseBallotNumber(entry.candidateNumber);
      if (number === null) {
        issue(
          `${label}.invalid`,
          `${entry.id} in ${districtId} has no numeric ballot number.`,
        );
        continue;
      }
      if (number < previous)
        issue(
          `${label}.order`,
          `${entry.id} (number ${number}) is out of order after ${previous} in ${districtId}.`,
        );
      previous = number;
    }
    if (list.length >= 10) {
      const indexOf9 = list.findIndex(
        (entry) => parseBallotNumber(entry.candidateNumber) === 9,
      );
      const indexOf10 = list.findIndex(
        (entry) => parseBallotNumber(entry.candidateNumber) === 10,
      );
      if (indexOf9 >= 0 && indexOf10 >= 0 && indexOf10 < indexOf9)
        issue(
          `${label}.lexicographic`,
          `${districtId} sorts号${10} before ${9}, which means string ordering.`,
        );
    }
  }
};

assertNumericOrder('officialCandidateProfiles', officialCandidateProfiles);
assertNumericOrder('candidateProfiles', candidateProfiles);
for (const district of dataset.districts) {
  assertNumericOrder(
    `getDistrictCandidates(${district.slug})`,
    getDistrictCandidates(district.id),
  );
  assertNumericOrder(
    `getOfficialDistrictCandidates(${district.slug})`,
    getOfficialDistrictCandidates(district.id),
  );
}

/* 7. Search records expose the same numbers as the candidate data. */
if (searchIndex.length !== dataset.candidates.length)
  issue('search.length', `searchIndex holds ${searchIndex.length} records.`);
if (officialSearchIndex.length !== dataset.candidates.length)
  issue(
    'search.officialLength',
    `officialSearchIndex holds ${officialSearchIndex.length} records.`,
  );
for (const record of searchIndex) {
  const candidate = dataset.candidates.find((item) => item.id === record.id);
  if (!candidate) {
    issue(
      'search.unknown',
      `searchIndex exposes unknown candidate ${record.id}.`,
    );
    continue;
  }
  if (record.ballotNumber !== formatBallotNumber(candidate.candidateNumber))
    issue(
      'search.ballotNumber',
      `searchIndex number for ${record.id} is "${record.ballotNumber}", expected "${formatBallotNumber(candidate.candidateNumber) ?? 'none'}" (status ${candidate.candidateNumberStatus}).`,
    );
}
for (const record of officialSearchIndex) {
  const candidate = dataset.candidates.find((item) => item.id === record.id);
  if (!candidate) continue;
  if (record.ballotNumber !== formatBallotNumber(candidate.candidateNumber))
    issue(
      'search.officialBallotNumber',
      `officialSearchIndex number for ${record.id} is "${record.ballotNumber}".`,
    );
}

/* 8. Display text stays consistent with the number/status pair. */
for (const candidate of dataset.candidates) {
  const label = ballotNumberText(candidate);
  const number = parseBallotNumber(candidate.candidateNumber);
  if (number === null || label !== `${number} 號`)
    issue(
      'display.text',
      `${candidate.id} renders "${label}" for "${candidate.candidateNumber}".`,
    );
}

/* 9. Cross-check the normalized mayoral slice. */
const normalizedMayors = (
  normalizedMayorInput as {
    candidateRecords: { displayName: string; candidateNumber: string }[];
  }
).candidateRecords;
if (normalizedMayors.length > 0) {
  for (const mayor of normalizedMayors) {
    const candidate = dataset.candidates.find(
      (item) =>
        item.electionType === 'mayoral' &&
        normalizeName(item.displayName) === normalizeName(mayor.displayName),
    );
    if (!candidate) {
      issue(
        'normalized.unknown',
        `Normalized mayoral row ${mayor.displayName} has no candidate.`,
      );
      continue;
    }
    if (
      parseBallotNumber(mayor.candidateNumber) !==
      parseBallotNumber(candidate.candidateNumber)
    )
      issue(
        'normalized.number',
        `Normalized mayoral row ${mayor.displayName} uses ${mayor.candidateNumber}, candidate uses ${candidate.candidateNumber}.`,
      );
  }
}

/* Report assembly. */
const sourceEntry = manifest.sources.find(
  (source) => source.id === BALLOT_NUMBER_SOURCE_ID,
);
let attachmentSha256 = sourceEntry?.attachmentSha256 ?? null;
const attachmentPath = sourceEntry?.attachmentPath ?? null;
if (attachmentPath) {
  try {
    const bytes = await readFile(path.join(root, attachmentPath));
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (digest !== attachmentSha256) {
      issue(
        'source.sha256',
        `Ballot PDF hash ${digest} does not match the manifest (${attachmentSha256 ?? 'missing'}).`,
      );
      attachmentSha256 ??= digest;
    }
  } catch {
    issue('source.attachment', `Ballot PDF ${attachmentPath} cannot be read.`);
  }
}

const coverageRows = [...contests.entries()]
  .map(([contest, count]) => {
    const [electionType = '', districtId = ''] = contest.split(':');
    const district = districtById.get(districtId);
    const candidates = dataset.candidates
      .filter((candidate) => ballotNumberContestKey(candidate) === contest)
      .sort(
        (left, right) =>
          (parseBallotNumber(left.candidateNumber) ?? 0) -
          (parseBallotNumber(right.candidateNumber) ?? 0),
      );
    return {
      contest,
      electionType,
      districtLabel: district?.districtLabel ?? districtId,
      count,
      numbers: candidates
        .map((candidate) => candidate.candidateNumber)
        .join('、'),
    };
  })
  .sort((left, right) => left.contest.localeCompare(right.contest));

const auditTable = auditRows.slice().sort((left, right) => {
  const leftNumber =
    left.electionType === 'mayoral'
      ? 0
      : Number(/第(\d+)選舉區/u.exec(left.constituency)?.[1] ?? 99);
  const rightNumber =
    right.electionType === 'mayoral'
      ? 0
      : Number(/第(\d+)選舉區/u.exec(right.constituency)?.[1] ?? 99);
  if (leftNumber !== rightNumber) return leftNumber - rightNumber;
  return (
    (parseBallotNumber(left.ballotNumber) ?? 0) -
    (parseBallotNumber(right.ballotNumber) ?? 0)
  );
});

const nameObservations = [
  {
    district: '第3選舉區',
    candidateNumber: '2',
    stored: '張驥晟',
    reading: '張騏晟',
  },
  {
    district: '第3選舉區',
    candidateNumber: '5',
    stored: '黃秋媛',
    reading: '黃秋媖',
  },
  {
    district: '第3選舉區',
    candidateNumber: '8',
    stored: '蔡秉穎',
    reading: '蔡秉橞',
  },
  {
    district: '第7選舉區',
    candidateNumber: '9',
    stored: '鄭孟洽',
    reading: '鄭孟洳',
  },
];

const testResultsPath = path.join(
  root,
  'reports/ballot-number-test-results.json',
);
let testResults: {
  generatedAt?: string;
  command?: string;
  entries?: { command: string; status: 'pass' | 'fail'; detail?: string }[];
} | null = null;
try {
  testResults = JSON.parse(await readFile(testResultsPath, 'utf8'));
} catch {
  testResults = null;
}

const ok = issues.length === 0;
const testedAt = new Date().toISOString();

const markdown = [
  '# 2026 高雄市候選人選票號次同步驗證報告',
  '',
  `產生時間：${testedAt}`,
  '',
  '## 1. 權威來源',
  '',
  `- 來源：${sourceEntry?.title ?? '高雄市第5屆市長、市議員選舉候選人姓名號次抽定一覽表'}`,
  '- 發布機關：高雄市選舉委員會（KHEC）',
  `- 官方網址：https://www.cec.gov.tw/khec/article/65366`,
  `- 發布日期：${BALLOT_NUMBER_PUBLICATION_DATE}`,
  `- 附件：${attachmentPath ?? '未登錄'}`,
  `- PDF SHA-256：${attachmentSha256 ?? '未登錄'}`,
  '- 抽定表僅列出「選舉區、候選人姓名、號次」，不含政黨欄位；政黨資料仍以既有來源為準，未由此表推論。',
  '- 號次抽定（2026-10-27）與正式候選人名冊公告（預定 2026-11-17）是兩個獨立程序，本報告不將抽定表描述為正式公告。',
  '',
  '## 2. 方法',
  '',
  '- 以官方 PDF 原始附件逐列核對；本專案保存的逐列抄錄位於 `data/normalized/2026/kaohsiung-council-roster.json`（101 列）與市長候選人目錄（5 列），合計 106 列。',
  '- 身分比對鍵為「選舉類型 + 選舉區 + 正規化姓名（NFKC、去除空白、忽略大小寫）」，並同時要求號次與官方列一致；不以姓名單獨比對，不以陣列順序推論號次。',
  '- 市長、普通議員（第1–11選舉區）、原住民議員（第12–15選舉區）為互斥賽局，號次重複只在同一賽局內視為衝突。',
  '- 每一筆號次都必須帶有 `candidateNumberSource`（來源 ID、2026-10-27、第 1 頁、表格參照）；缺少來源即視為失敗。',
  '',
  '## 3. 覆蓋率',
  '',
  `- 官方列總數：${officialRows.length}（市長 ${mayors.length}、議員 ${officialRows.length - mayors.length}）`,
  `- 已對應候選人：${matchedRowKeys.size}／${dataset.candidates.length}`,
  `- 賽局數：${contests.size}（市長 1、普通選舉區 11、原住民選舉區 4）`,
  '',
  '| 賽局 | 選舉類型 | 選舉區 | 人數 | 號次 |',
  '| --- | --- | --- | ---: | --- |',
  ...coverageRows.map(
    (row) =>
      `| ${row.contest} | ${row.electionType} | ${row.districtLabel} | ${row.count} | ${row.numbers} |`,
  ),
  '',
  '## 4. 差異與衝突',
  '',
  `- 號次重複：${audit.duplicates.length}`,
  `- 無效號次：${audit.invalid.length}`,
  `- 缺少來源：${audit.missingProvenance.length}`,
  `- 未對應官方列：${auditRows.filter((row) => row.verificationStatus === 'unmatched').length}`,
  `- 姓名變體（號次一致、姓名以既有來源為準）：${auditRows.filter((row) => row.verificationStatus === 'verified-source-name-variant').length}`,
  '',
  '抽定表影像判讀與既有名冊有 4 處字形差異，號次完全相同。這些差異屬字形判讀層級，未變更任何候選人姓名，保留給人工複核：',
  '',
  '| 選舉區 | 號次 | 既有名冊 | 抽定表影像判讀 |',
  '| --- | ---: | --- | --- |',
  ...nameObservations.map(
    (item) =>
      `| ${item.district} | ${item.candidateNumber} | ${item.stored} | ${item.reading} |`,
  ),
  '',
  '## 5. 專案變更',
  '',
  '- `src/data/official/ballot.ts`：號次正規化、解析、排序、顯示與賽局稽核的單一來源。',
  '- `src/data/official/schema.ts`：新增 `candidateNumberSource` 結構與驗證，號次與來源必須成對出現。',
  '- `data/approved/2026/kaohsiung-election.json`：106 位候選人補上 `candidateNumberSource`；號次數值與既有抄錄一致，未變更。',
  '- `scripts/merge-council-roster.ts`：重新產生議員資料時保留來源欄位。',
  '- `src/data/official/index.ts`、`src/data/index.ts`：候選人清單、選舉區清單、搜尋索引依號次數值排序，並輸出 `ballotNumber`。',
  '- `src/data/view.ts`：修復「已抽定卻顯示待公告」的對應錯誤。',
  '- UI：`CandidateCard.astro`、`ProfileTabs.tsx`、`GlobalHeader.tsx`、`candidates/[slug].astro`、`districts/index.astro`、`districts/[slug].astro`、`CityExplorer.tsx`、`src/styles/global.css`。',
  '- 文案：移除「正式號次待公告」等過期描述；號次標示為「選票號次」。',
  '',
  '## 6. 驗證結果',
  '',
  `- 自動驗證：${ok ? '通過' : `失敗（${issues.length} 項）`}`,
  ...(ok
    ? []
    : [
        '',
        '| 代碼 | 訊息 |',
        '| --- | --- |',
        ...issues.map((item) => `| \`${item.code}\` | ${item.message} |`),
      ]),
  '',
  '### 測試與建置',
  '',
  ...(testResults?.entries?.length
    ? [
        `紀錄時間：${testResults.generatedAt ?? '未註明'}`,
        '',
        '| 指令 | 結果 | 備註 |',
        '| --- | --- | --- |',
        ...testResults.entries.map(
          (entry) =>
            `| \`${entry.command}\` | ${entry.status === 'pass' ? '通過' : '失敗'} | ${entry.detail ?? ''} |`,
        ),
      ]
    : [
        '尚未記錄；執行 `npm run validate:ballot-numbers` 前請先完成測試並寫入 `reports/ballot-number-test-results.json`。',
      ]),
  '',
  '## 7. 逐筆稽核表',
  '',
  '| candidateId | candidateName | electionType | constituency | ballotNumber | sourcePage | verificationStatus |',
  '| --- | --- | --- | --- | ---: | ---: | --- |',
  ...auditTable.map(
    (row) =>
      `| ${row.candidateId} | ${row.candidateName} | ${row.electionType} | ${row.constituency} | ${row.ballotNumber} | ${row.sourcePage} | ${row.verificationStatus} |`,
  ),
  '',
].join('\n');

await mkdir(path.join(root, 'reports'), { recursive: true });
await writeFile(
  path.join(root, 'reports/ballot-number-sync.json'),
  `${JSON.stringify({ generatedAt: testedAt, ok, source: { id: BALLOT_NUMBER_SOURCE_ID, publicationDate: BALLOT_NUMBER_PUBLICATION_DATE, attachmentSha256 }, counts: { officialRows: officialRows.length, candidates: dataset.candidates.length, matched: matchedRowKeys.size, contests: contests.size }, audit, coverage: coverageRows, nameObservations, issues, rows: auditRows }, null, 2)}\n`,
  'utf8',
);
await writeFile(
  path.join(root, 'reports/2026-kaohsiung-ballot-number-sync.md'),
  markdown,
  'utf8',
);

if (!ok) {
  console.error(
    `Ballot-number validation failed with ${issues.length} issue(s):`,
  );
  for (const item of issues) console.error(` - [${item.code}] ${item.message}`);
  process.exitCode = 1;
} else {
  console.log(
    `Ballot numbers verified: ${matchedRowKeys.size}/${dataset.candidates.length} candidates across ${contests.size} contests; ${officialRows.length} official rows reconciled; report written to reports/2026-kaohsiung-ballot-number-sync.md`,
  );
}
