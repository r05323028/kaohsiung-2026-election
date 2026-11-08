import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  councilCandidateSlug,
  councilCandidateStableId,
  validateCouncilRoster,
} from '../src/data/official/council';

type Source = {
  id: string;
  title: string;
  publisher: string;
  url: string;
  publicationDate: string;
  retrievalDate: string;
  verificationStatus: 'Verified';
  note: string;
};
type District = {
  id: string;
  electionType: string;
  sourceIds: string[];
  [key: string]: unknown;
};
type Candidate = {
  candidateStatus?: string;
  formalStatus?: string;
  partyStatus?: string;
  politicalParty?: string | null;
  [key: string]: unknown;
};
type ApprovedDataset = {
  sources: Source[];
  districts: District[];
  candidates: Candidate[];
  [key: string]: unknown;
};
type ReviewPacket = {
  approvedForPreliminaryDisplay: boolean;
  approvedRowCount: number;
  pendingRowCount: number;
};

const root = process.cwd();
async function readJson(relativePath: string): Promise<unknown> {
  const text = await readFile(path.join(root, relativePath), 'utf8');
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(
      `Could not parse ${relativePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

const approved = (await readJson(
  'data/approved/2026/kaohsiung-election.json',
)) as ApprovedDataset;
const normalized = validateCouncilRoster(
  await readJson('data/normalized/2026/kaohsiung-council-roster.json'),
);
const review = (await readJson(
  'data/review/2026/khec-65366-council-roster-review.json',
)) as ReviewPacket;
if (
  review.approvedForPreliminaryDisplay !== true ||
  review.approvedRowCount !== normalized.totalRowCount ||
  review.pendingRowCount !== 0
)
  throw new Error(
    'Council review packet does not approve exactly the normalized preliminary roster.',
  );

const source: Source = {
  id: 'source-khec-65368',
  title: '高雄市第5屆市長、市議員選舉候選人姓名號次抽定一覽表（重複公告別名）',
  publisher: '高雄市選舉委員會',
  url: 'https://www.cec.gov.tw/khec/article/65368',
  publicationDate: '2026-10-27',
  retrievalDate: '2026-11-05',
  verificationStatus: 'Verified',
  note: '與 65366 使用相同檔案與 SHA-256；僅作重複公告別名，不增加獨立證據。',
};
const sources = [
  ...approved.sources.filter((item) => item.id !== source.id),
  source,
];
const districts = approved.districts.map((district): District => {
  if (district.electionType === 'mayoral') return district;
  return {
    ...district,
    sourceIds: [...new Set([...district.sourceIds, 'source-khec-65366'])],
    publicationStatus: 'approved',
    scopeNote:
      '目前公開的是高雄市選舉委員會官方號次抽定之預公告名單；政黨欄位未刊載，正式市議員候選人公告預定於 2026-11-17。缺少其他資料不表示不存在。',
  };
});
const mayorCandidates = approved.candidates
  .filter((candidate) => candidate.electionType === 'mayoral')
  .map(
    (candidate): Candidate => ({
      ...candidate,
      candidateStatus: candidate.candidateStatus ?? 'qualified',
      formalStatus: candidate.formalStatus ?? 'pending-announcement',
      partyStatus: 'not-published',
      politicalParty: null,
    }),
  );
const councilCandidates: Candidate[] = normalized.constituencies.flatMap(
  (constituency) =>
    constituency.rows.map((row) => {
      const indigenous = constituency.districtNumber >= 12;
      return {
        id: councilCandidateStableId(
          2026,
          constituency.districtId,
          row.displayName,
        ),
        slug: councilCandidateSlug(
          2026,
          constituency.districtNumber,
          row.displayName,
        ),
        displayName: row.displayName,
        shortName: row.displayName,
        districtId: constituency.districtId,
        electionYear: 2026,
        electionType: indigenous ? 'indigenous-council' : 'city-council',
        candidateNumber: row.candidateNumber,
        candidateNumberStatus: 'drawn',
        candidateNumberIsFinal: false,
        candidateStatus: 'number-drawn',
        formalStatus: 'pending-announcement',
        qualificationStatus: 'unavailable',
        publicationStatus: 'approved',
        partyStatus: 'not-published',
        politicalParty: null,
        currentPosition: '2026 高雄市議員候選人（號次抽定，正式公告待發布）',
        portraitReference: '尚未提供官方肖像參照',
        summary:
          '高雄市選舉委員會官方號次抽定表列名；這是預公告資料，正式市議員候選人公告預定於 2026-11-17，其他人物資料尚未完成查證。',
        sourceIds: ['source-khec-65366'],
      };
    }),
);
const result = {
  ...approved,
  sources,
  districts,
  candidates: [...mayorCandidates, ...councilCandidates],
  pendingReview: [
    {
      sourceId: 'source-khec-65366',
      scope: 'city-council formal announcement',
      reason:
        '號次抽定表的 101 筆市議員列名已完成預公告展示審核，但正式市議員候選人公告預定於 2026-11-17；公告後必須重新比對。',
      expectedResolutionDate: '2026-11-17',
    },
  ],
};
await writeFile(
  path.join(root, 'data/approved/2026/kaohsiung-election.json'),
  `${JSON.stringify(result, null, 2)}\n`,
  'utf8',
);
console.log(
  `Merged ${councilCandidates.length} council candidates into the approved preliminary dataset.`,
);
