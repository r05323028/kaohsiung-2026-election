import { join } from 'node:path';
import type { ResearcherBatch, ResearcherClaim } from './batch-schema';
import {
  districtById,
  isoNow,
  type QueueEntry,
  queueCandidates,
  readSeed,
  researcherDir,
  sha256,
  writeJson,
} from './lib';

type KccSeed = {
  candidateId: string;
  displayName: string;
  msn: string;
  url: string;
  filename: string;
  sha256: string;
  observedParty: string | null;
  education: string[];
  experience: string[];
  excerpt: string;
};
type BulletinSeed = {
  candidateId: string;
  displayName: string;
  districtId: string;
  file: string;
  page: number;
  education: string[];
  experience: string[];
  excerpt: string;
  url: string;
  sha256: string;
};

const batchId = process.argv[2];
if (!batchId || !/^batch-\d{2}$/.test(batchId)) {
  console.error(
    'Usage: npx tsx scripts/basic-profile/draft-batch.ts <batch-XX>',
  );
  process.exit(2);
}
const entries = queueCandidates.filter(
  (candidate) => candidate.batchId === batchId,
);
if (entries.length === 0) {
  console.error(`No candidates in ${batchId}`);
  process.exit(1);
}
const kccProfiles = readSeed<KccSeed>('kcc-profiles', 'profiles');
const bulletins = readSeed<BulletinSeed>('cec-2022-bulletin', 'candidates');

const NAV =
  /(更多近期新聞|回上一頁|回最上面|本會介紹|議長介紹|副議長介紹|本會沿革|組織與職權|多媒體簡介|本會資訊|國際交流|本會議員|本屆議員聯絡|歷屆議員|委員會一覽表|新聞與活動|新聞快訊|歷史新聞|訊息公告|城市互訪|公聽會|活動影音|大會資訊|議事日程表|會議記錄|專案報告|各種會議譯文稿|提案資料|質詢資料|本會出版品|議事資訊彙編|議事錄|出版刊物|電子期刊|專刊|其他報告|法規專區|議政法規|高雄市法令|法律網站|便民服務|議長信箱|議員聯絡資訊|遊說法專區|性平專區|申請資訊與表單|預決算資訊|媒體政策|公職人員利益衝突|檔案閱覽|施政統計|本會系統|議事查詢|影音隨選|議員入口網|WebMail|隱私權宣告|資訊安全政策|著作權聲明|RSS訂閱)/;
const DATE_PREFIX = /^\d{2,3}\/\d{1,2}\/\d{1,2}/;

function cleanEducation(lines: string[], joinLines: boolean): string[] {
  const parts: string[] = joinLines
    ? lines.join('').replace(/\s+/g, '').split(/。/)
    : lines.map((line) => line.trim()).filter(Boolean);
  return parts
    .map((line) => line.replace(/^[\d一二三四五六七八九十]+[.、]/, '').trim())
    .map((line) => (line && !/[。！？]$/.test(line) ? `${line}。` : line))
    .filter((line) => line.length >= 3)
    .map((line) => line.replace(/。+$/, '。'));
}

function cleanExperience(lines: string[], joinLines: boolean): string[] {
  let source = lines.map((line) => line.trim()).filter(Boolean);
  const stop = source.findIndex((line) => /^服務政見/.test(line));
  if (stop >= 0) source = source.slice(0, stop);
  let parts: string[];
  if (joinLines && source.some((line) => /^\d{1,2}\./.test(line))) {
    const text = source.join('').replace(/\s+/g, '');
    parts = text
      .split(/(?=\d{1,2}\.)/)
      .map((line) => line.replace(/^\d{1,2}\./, ''));
  } else {
    parts = source;
  }
  return parts
    .map((line) => line.trim())
    .filter((line) => line.length >= 3 && line.length <= 180)
    .filter((line) => !NAV.test(line) && !DATE_PREFIX.test(line))
    .filter((line) => !/^[\d.、\s]+$/.test(line))
    .map((line) => line.replace(/^[\d一二三四五六七八九十]+[.、]/, '').trim());
}

function fieldForExperience(
  line: string,
): 'education' | 'public-service' | 'professional-experience' {
  if (
    /(大學|學院|高中|高工|高職|國中|國小|專科|研究所|博士|碩士|學士|肄業|畢業)/.test(
      line,
    )
  ) {
    return 'education';
  }
  if (
    /(議員|議長|副議長|立法委員|國大代表|市長|縣長|局長|處長|副市長|區長|里長|代表會|議會|市政府|立法院|行政院|政務|發言人|參議|機要|主任委員|鄉長|鎮長)/.test(
      line,
    )
  ) {
    return 'public-service';
  }
  return 'professional-experience';
}

const FIELD_ABBR: Record<string, string> = {
  education: 'edu',
  'professional-experience': 'exp',
  'public-service': 'pub',
  'current-position': 'cur',
  'official-website': 'web',
  'biographical-note': 'note',
};

let globalCounter = 0;
function makeClaim(
  candidate: QueueEntry,
  field: ResearcherClaim['field'],
  value: string,
  input: {
    detail?: string | null;
    organization?: string | null;
    currentStatus?: ResearcherClaim['currentStatus'];
    attribution: ResearcherClaim['attribution'];
    source: ResearcherClaim['source'];
    notes?: string | null;
  },
): ResearcherClaim {
  globalCounter += 1;
  const hash = sha256(candidate.candidateId).slice(0, 8);
  return {
    claimId: `bp-${hash}-${FIELD_ABBR[field]}-${globalCounter}`,
    candidateId: candidate.candidateId,
    field,
    value: value.slice(0, 240),
    detail: input.detail ?? null,
    organization: input.organization ?? null,
    validFrom: null,
    validTo: null,
    currentStatus: input.currentStatus ?? 'historical',
    attribution: input.attribution,
    source: input.source,
    notes: input.notes ?? null,
  };
}

const candidates = entries.map((candidate) => {
  const kcc = kccProfiles.find(
    (entry) => entry.candidateId === candidate.candidateId,
  );
  const bulletin = bulletins.find(
    (entry) => entry.candidateId === candidate.candidateId,
  );
  const claims: ResearcherClaim[] = [];
  const seedSource = kcc
    ? {
        sourceId: `kcc-${kcc.msn}`,
        sourceClass: 'kcc-member-profile' as const,
        publisher: '高雄市議會',
        url: kcc.url,
        publishedAt: null,
        retrievedAt: '2026-11-06T00:00:00.000Z',
        excerpt: kcc.excerpt.slice(0, 1600),
        page: null,
        snapshotSha256: kcc.sha256,
      }
    : bulletin
      ? {
          sourceId: `cec-bulletin-2022-${bulletin.file}`,
          sourceClass: 'cec-election-bulletin' as const,
          publisher: '中央選舉委員會',
          url: bulletin.url,
          publishedAt: '2022-11-26',
          retrievedAt: '2026-11-12T00:00:00.000Z',
          excerpt: bulletin.excerpt.slice(0, 1600),
          page: bulletin.page,
          snapshotSha256: bulletin.sha256,
        }
      : null;

  if (kcc && seedSource) {
    for (const line of cleanEducation(kcc.education, false)) {
      claims.push(
        makeClaim(candidate, 'education', line, {
          attribution: 'institutional-record',
          source: seedSource,
          notes: '高雄市議會本屆議員簡介所列學歷。',
        }),
      );
    }
    for (const line of cleanExperience(kcc.experience, false)) {
      const field = fieldForExperience(line);
      claims.push(
        makeClaim(candidate, field, line, {
          attribution: 'institutional-record',
          source: seedSource,
          notes: '高雄市議會本屆議員簡介所列經歷。',
        }),
      );
    }
    claims.push(
      makeClaim(candidate, 'current-position', '高雄市議員（本屆）', {
        detail: '高雄市議會本屆議員簡介所列現任議員。',
        organization: '高雄市議會',
        currentStatus: 'current',
        attribution: 'institutional-record',
        source: {
          ...seedSource,
          excerpt: `高雄市議會全球網-中文網-本屆議員-${candidate.displayName}`,
        },
        notes: '以高雄市議會本屆議員名錄認定現任職務。',
      }),
    );
  } else if (bulletin && seedSource) {
    for (const line of cleanEducation(bulletin.education, true)) {
      claims.push(
        makeClaim(candidate, 'education', line, {
          attribution: 'candidate-statement',
          source: seedSource,
          notes: '2022 年選舉公報學歷欄，由候選人自行填列；2026 年狀態未確認。',
        }),
      );
    }
    for (const line of cleanExperience(bulletin.experience, true)) {
      const field = fieldForExperience(line);
      claims.push(
        makeClaim(candidate, field, line, {
          attribution: 'candidate-statement',
          source: seedSource,
          notes: '2022 年選舉公報經歷欄，由候選人自行填列；2026 年狀態未確認。',
        }),
      );
    }
  }

  const observedFields = new Set(claims.map((claim) => claim.field));
  const gaps = [
    'education',
    'professional-experience',
    'public-service',
    'current-position',
    'official-website',
    'biographical-note',
  ].filter((field) => !observedFields.has(field as ResearcherClaim['field']));

  const identitySignals: ResearcherBatch['candidates'][number]['identitySignals'] =
    [
      {
        type: 'official-roster-name' as const,
        value: candidate.displayName,
        sourceId: 'approved-roster-2026',
      },
      {
        type: 'official-roster-district' as const,
        value:
          districtById.get(candidate.districtId)?.name ?? candidate.districtId,
        sourceId: 'approved-roster-2026',
      },
    ];
  if (candidate.birthDate) {
    identitySignals.push({
      type: 'official-roster-birth-date',
      value: candidate.birthDate,
      sourceId: 'approved-roster-2026',
    });
  }
  if (kcc && seedSource) {
    identitySignals.push({
      type: 'institutional-biographical-record',
      value: `高雄市議會本屆議員簡介（msn ${kcc.msn}）`,
      sourceId: `kcc-${kcc.msn}`,
    });
  } else if (bulletin && seedSource) {
    identitySignals.push({
      type: 'election-bulletin',
      value: `2022 年選舉公報同名同選區（${bulletin.file} 第 ${bulletin.page} 頁）`,
      sourceId: `cec-bulletin-2022-${bulletin.file}`,
    });
  }

  return {
    candidateId: candidate.candidateId,
    displayName: candidate.displayName,
    districtId: candidate.districtId,
    identityStatus: 'resolved' as const,
    identitySignals,
    status: 'researching' as const,
    claims,
    gaps,
    notes: null,
  };
});

const batch: ResearcherBatch = {
  batchId,
  generatedAt: isoNow(),
  researcher: 'candidate-researcher',
  candidates,
};
writeJson(join(researcherDir, `${batchId}.json`), batch);
console.log(
  `Drafted ${batchId}: ${candidates.length} candidates, ${candidates.reduce((sum, entry) => sum + entry.claims.length, 0)} seed claims, ${candidates.filter((entry) => entry.claims.length === 0).length} without seed evidence.`,
);
