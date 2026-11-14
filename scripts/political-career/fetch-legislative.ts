import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Retains the 立法院 records needed for the legislative parts of
 * data/approved/2026/political-career.json:
 *
 *   - 立法委員 terms, so a seat is attributed only to a person the
 *     Legislative Yuan lists as a member;
 *   - the bills a candidate proposed (提案人), so a proposal is recorded with
 *     the proposer role the institution itself assigned;
 *   - the recorded roll-call votes on final-passage and reconsideration
 *     motions, so an individual vote is only ever read off 記名表決 lists.
 *
 * Source: https://ly.govapi.tw (開放國會 API, 立法院資料). The build never
 * reaches the network; it reads the snapshots retained here and re-checks the
 * sha256 recorded in legislative-manifest.json.
 */

const ROOT = process.cwd();
const OUTPUT_ROOT = join(ROOT, 'data/raw/political-career/2026/legislative');
const MANIFEST_PATH = join(
  ROOT,
  'data/raw/political-career/2026/legislative-manifest.json',
);
const CURATED_PATH = join(
  ROOT,
  'data/political-career/2026/legislative-candidates.json',
);
const API = 'https://ly.govapi.tw/v2';
const PAGE_SIZE_VOTES = 1000;
const PAGE_SIZE_BILLS = 100;
const TIMEOUT_MS = 45_000;
const ATTEMPTS = 3;
const USER_AGENT =
  'Mozilla/5.0 (compatible; kaohsiung-2026-election-research/1.0; +https://github.com/r05323028/kaohsiung-2026-election)';

/**
 * Motions whose recorded vote is published. Final passage, reconsideration and
 * the budget are the decisions a reader can weigh; ordinary procedural votes
 * are counted but not listed.
 */
const SALIENT_MOTION = /三讀|復議|覆議|不信任|總預算/;

type LegislatorRecord = {
  屆: number;
  委員姓名: string;
  黨籍: string;
  選區名稱?: string;
  到職日?: string;
  離職日?: string;
};

type BillRecord = {
  /** 立法院屆次。 */
  屆: number;
  議案編號: string;
  議案名稱: string;
  議案狀態: string;
  提案人?: string[];
  提案日期?: string;
  會期?: number;
  字號?: string;
  議案類別?: string;
  提案來源?: string;
  '提案單位/提案委員'?: string;
  最新進度日期?: string;
  '法律編號:str'?: string[];
  url?: string;
};

type VoteRecord = {
  屆: number;
  表決代碼: string;
  會議代碼?: string;
  '會議代碼:str'?: string;
  公報文件代碼?: string;
  行號?: number;
  會議名稱?: string;
  表決型態?: string;
  表決時間?: string;
  表決議題?: string;
  表決結果?: {
    出席人數?: number;
    贊成人數?: number;
    反對人數?: number;
    棄權人數?: number;
  };
  投票委員?: string[];
  贊成?: string[];
  反對?: string[];
  棄權?: string[];
};

type MeetRecord = {
  屆: number;
  會議代碼: string;
  日期?: string[];
  會議名稱?: string;
};

type ManifestEntry = {
  key: string;
  url: string;
  httpStatus: number;
  byteLength: number;
  sha256: string;
  rawPath: string;
  retrievedAt: string;
  recordCount: number;
  sourceTotal?: number;
};

type ManifestFailure = { key: string; url: string; error: string };

function absolute(path: string): string {
  return join(ROOT, path);
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

async function getJson<T>(url: string): Promise<{ data: T; bytes: number }> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error('HTTP ' + String(response.status));
      }
      const text = await response.text();
      return { data: JSON.parse(text) as T, bytes: Buffer.byteLength(text) };
    } catch (error) {
      lastError = error as Error;
      await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
    }
  }
  throw lastError ?? new Error('request failed');
}

/** '中華民國115年7月24日' or '中華民國2025年9月30日' → ISO date. */
function rocDate(text: string | undefined): string | null {
  if (!text) return null;
  const match = /中華民國(\d{2,4})年(\d{1,2})月(\d{1,2})日/.exec(text);
  if (!match) return null;
  const rawYear = Number(match[1]);
  if (!Number.isFinite(rawYear) || rawYear === 0) return null;
  const year = rawYear >= 1900 ? rawYear : rawYear + 1911;
  const month = String(Number(match[2])).padStart(2, '0');
  const day = String(Number(match[3])).padStart(2, '0');
  return String(year) + '-' + month + '-' + day;
}

function normalizeSpace(text: string | undefined): string {
  return (text ?? '').replace(/[\s\u3000]+/g, ' ').trim();
}

type CuratedLegislative = {
  candidateId: string;
  name: string;
  identityBasis: string;
  terms: number[];
};

type CuratedDataset = {
  candidates: CuratedLegislative[];
};

/**
 * Legislative targets are curated, not inferred from campaign claims. The
 * published basic profiles do not list a 立委 seat for every candidate who
 * held one (柯志恩 is the clear case). The curated file names the candidate,
 * the terms and the identity basis; the API response must then confirm that
 * the person was listed as a 立法委員 in every curated term, otherwise the run
 * aborts instead of attributing another person record.
 */
function curatedTargets(): CuratedLegislative[] {
  const dataset = JSON.parse(
    readFileSync(CURATED_PATH, 'utf8'),
  ) as CuratedDataset;
  return dataset.candidates;
}

async function main(): Promise<void> {
  const force = process.argv.includes('--force');
  const roster = JSON.parse(
    readFileSync(
      absolute('data/approved/2026/kaohsiung-election.json'),
      'utf8',
    ),
  ) as { candidates: { id: string; displayName: string }[] };
  const nameById = new Map(roster.candidates.map((c) => [c.id, c.displayName]));

  const targets = curatedTargets().map((target) => ({
    ...target,
    name: nameById.get(target.candidateId) ?? '',
  }));
  if (targets.length === 0) {
    throw new Error('no curated legislative candidate');
  }

  mkdirSync(OUTPUT_ROOT, { recursive: true });
  const entries: ManifestEntry[] = [];
  const failures: ManifestFailure[] = [];
  const retrievedAt = new Date().toISOString();

  const retain = (
    key: string,
    url: string,
    payload: unknown,
    recordCount: number,
    sourceTotal?: number,
  ): void => {
    const text = JSON.stringify(payload, null, 2) + '\n';
    const fileName = key + '.json';
    const rawPath = join(
      'data/raw/political-career/2026/legislative',
      fileName,
    );
    const absolutePath = absolute(rawPath);
    if (!force && existsSync(absolutePath)) {
      const existing = readFileSync(absolutePath, 'utf8');
      if (existing === text) {
        entries.push({
          key,
          url,
          httpStatus: 200,
          byteLength: Buffer.byteLength(text),
          sha256: sha256(text),
          rawPath,
          retrievedAt,
          recordCount,
          ...(sourceTotal === undefined ? {} : { sourceTotal }),
        });
        return;
      }
    }
    writeFileSync(absolutePath, text, 'utf8');
    entries.push({
      key,
      url,
      httpStatus: 200,
      byteLength: Buffer.byteLength(text),
      sha256: sha256(text),
      rawPath,
      retrievedAt,
      recordCount,
      ...(sourceTotal === undefined ? {} : { sourceTotal }),
    });
  };

  for (const target of targets) {
    if (!target.name)
      throw new Error(
        'unknown candidate for legislative target: ' + target.candidateId,
      );

    const legislatorsUrl =
      API +
      '/legislators?' +
      new URLSearchParams({ 委員姓名: target.name }).toString();
    const legislators = await getJson<{
      legislators: LegislatorRecord[];
      total: number;
    }>(legislatorsUrl);
    const seats = legislators.data.legislators.filter(
      (record) => record.委員姓名 === target.name,
    );
    if (seats.length === 0) {
      console.log(
        '[legislative] ' + target.name + ': not listed as a 立法委員, skipped',
      );
      continue;
    }
    const listedTerms = new Set(seats.map((seat) => seat.屆));
    for (const term of target.terms) {
      if (!listedTerms.has(term)) {
        throw new Error(
          target.name +
            '：立法院委員紀錄未列出第 ' +
            String(term) +
            ' 屆，停止以免錯配他人紀錄',
        );
      }
    }
    retain(
      'legislators-' + target.candidateId,
      legislatorsUrl,
      {
        candidateId: target.candidateId,
        displayName: target.name,
        sourceUrl: legislatorsUrl,
        retrievedAt,
        legislators: seats,
      },
      seats.length,
      legislators.data.total,
    );
    console.log(
      '[legislative] ' + target.name + ': ' + String(seats.length) + ' terms',
    );

    for (const seat of seats) {
      const term = seat.屆;

      // Bills: every bill on which the institution lists the candidate as 提案人.
      const bills: BillRecord[] = [];
      let page = 1;
      let billsTotal = 0;
      for (;;) {
        const url =
          API +
          '/bills?' +
          new URLSearchParams({
            屆: String(term),
            提案人: target.name,
            limit: String(PAGE_SIZE_BILLS),
            page: String(page),
          }).toString();
        const chunk = await getJson<{ bills: BillRecord[]; total: number }>(
          url,
        );
        billsTotal = chunk.data.total;
        bills.push(...chunk.data.bills);
        if (bills.length >= chunk.data.total || chunk.data.bills.length === 0)
          break;
        page += 1;
        if (page > 40) break;
      }
      const trimmedBills = bills
        .filter((bill) => (bill.提案人 ?? []).includes(target.name))
        .map((bill) => ({
          term: bill.屆,
          billId: bill.議案編號,
          title: normalizeSpace(bill.議案名稱),
          status: normalizeSpace(bill.議案狀態),
          proposers: bill.提案人 ?? [],
          proposedAt: bill.提案日期 ?? null,
          session: bill.會期 ?? null,
          number: bill.字號 ?? null,
          category: bill.議案類別 ?? null,
          origin: bill.提案來源 ?? null,
          proposerText: normalizeSpace(bill['提案單位/提案委員']),
          latestProgressDate: bill['最新進度日期'] ?? null,
          laws: bill['法律編號:str'] ?? [],
          url: bill.url ?? null,
        }))
        .sort((a, b) => (a.billId ?? '').localeCompare(b.billId ?? ''));
      retain(
        'bills-' + target.candidateId + '-t' + String(term),
        API +
          '/bills?屆=' +
          String(term) +
          '&提案人=' +
          encodeURIComponent(target.name),
        {
          candidateId: target.candidateId,
          displayName: target.name,
          term,
          sourceUrl:
            'https://ly.govapi.tw/v2/bills?屆=' +
            String(term) +
            '&提案人=' +
            encodeURIComponent(target.name),
          retrievedAt,
          sourceTotal: billsTotal,
          bills: trimmedBills,
        },
        trimmedBills.length,
        billsTotal,
      );
      console.log(
        '  term ' +
          String(term) +
          ': ' +
          String(trimmedBills.length) +
          ' proposed bills (api total ' +
          String(billsTotal) +
          ')',
      );
    }
  }

  // Votes and meetings are per term, not per candidate: fetch each term once.
  const terms = new Set<number>();
  for (const entry of entries) {
    const match = /^bills-.*-t(\d+)$/.exec(entry.key);
    if (match) terms.add(Number(match[1]));
  }

  for (const term of [...terms].sort((a, b) => a - b)) {
    const meets: MeetRecord[] = [];
    let meetPage = 1;
    let meetsTotal = 0;
    for (;;) {
      const url =
        API +
        '/meets?' +
        new URLSearchParams({
          屆: String(term),
          limit: '100',
          page: String(meetPage),
        }).toString();
      const chunk = await getJson<{ meets: MeetRecord[]; total: number }>(url);
      meetsTotal = chunk.data.total;
      meets.push(...chunk.data.meets);
      if (meets.length >= chunk.data.total || chunk.data.meets.length === 0)
        break;
      meetPage += 1;
      if (meetPage > 40) break;
    }
    const meetIndex = new Map<string, string[]>();
    for (const meet of meets) {
      if (!meetIndex.has(meet.會議代碼))
        meetIndex.set(meet.會議代碼, meet.日期 ?? []);
    }
    retain(
      'meets-t' + String(term),
      API + '/meets?屆=' + String(term),
      {
        term,
        sourceUrl: 'https://ly.govapi.tw/v2/meets?屆=' + String(term),
        retrievedAt,
        sourceTotal: meetsTotal,
        meets: [...meetIndex.entries()].map(([code, dates]) => ({
          meetingCode: code,
          dates,
        })),
      },
      meetIndex.size,
      meetsTotal,
    );

    const votes: VoteRecord[] = [];
    let votePage = 1;
    let votesTotal = 0;
    for (;;) {
      const url =
        API +
        '/votes?' +
        new URLSearchParams({
          屆: String(term),
          limit: String(PAGE_SIZE_VOTES),
          page: String(votePage),
        }).toString();
      const chunk = await getJson<{ votes: VoteRecord[]; total: number }>(url);
      votesTotal = chunk.data.total;
      votes.push(...chunk.data.votes);
      if (votes.length >= chunk.data.total || chunk.data.votes.length === 0)
        break;
      votePage += 1;
      if (votePage > 40) break;
    }

    const voteTypeCounts: Record<string, number> = {};
    for (const vote of votes) {
      const type = normalizeSpace(vote.表決型態) || '未載明';
      voteTypeCounts[type] = (voteTypeCounts[type] ?? 0) + 1;
    }

    for (const entry of entries) {
      const match = /^bills-(.+)-t(\d+)$/.exec(entry.key);
      if (!match || Number(match[2]) !== term) continue;
      const candidateId = match[1] as string;
      const name = nameById.get(candidateId) ?? '';
      const salient = votes
        .filter((vote) => SALIENT_MOTION.test(normalizeSpace(vote.表決議題)))
        .map((vote) => {
          const motionText = normalizeSpace(vote.表決議題);
          const forList = vote.贊成 ?? [];
          const againstList = vote.反對 ?? [];
          const abstainList = vote.棄權 ?? [];
          const voters = vote.投票委員 ?? [];
          const present = voters.includes(name);
          const side = forList.includes(name)
            ? 'for'
            : againstList.includes(name)
              ? 'against'
              : abstainList.includes(name)
                ? 'abstain'
                : present
                  ? 'not-recorded'
                  : 'absent';
          const voteType = normalizeSpace(vote.表決型態);
          const meetingCode = normalizeSpace(vote.會議代碼);
          const meetingDates = meetIndex.get(meetingCode) ?? [];
          const recordedDate = rocDate(vote.表決時間);
          return {
            voteId: vote.表決代碼,
            term,
            meetingCode,
            meetingName: normalizeSpace(vote.會議名稱),
            gazetteCode: vote.公報文件代碼 ?? null,
            lineNumber: vote.行號 ?? null,
            voteType,
            votedAtText: normalizeSpace(vote.表決時間),
            recordedDate,
            meetingDates,
            motionText,
            tally: {
              attending: vote.表決結果?.出席人數 ?? null,
              for: vote.表決結果?.贊成人數 ?? null,
              against: vote.表決結果?.反對人數 ?? null,
              abstain: vote.表決結果?.棄權人數 ?? null,
            },
            // Only 記名表決 publishes who voted how. Anything else is left
            // unrecorded so the build cannot invent an individual vote.
            individual:
              voteType === '記名表決'
                ? { present, side, recorded: present || side !== 'absent' }
                : { present: null, side: 'unknown', recorded: false },
          };
        })
        .filter(
          (vote) =>
            vote.individual.side !== 'unknown' || vote.tally.for !== null,
        );

      const aggregate = {
        term,
        totalVotesOnSource: votesTotal,
        voteTypeCounts,
        salientMotions: salient.length,
        presentOnSalientMotions: salient.filter(
          (vote) => vote.individual.present === true,
        ).length,
        rollCallSalientMotions: salient.filter(
          (vote) => vote.individual.recorded,
        ).length,
      };

      retain(
        'votes-' + candidateId + '-t' + String(term),
        API + '/votes?屆=' + String(term),
        {
          candidateId,
          displayName: name,
          term,
          sourceUrl: 'https://ly.govapi.tw/v2/votes?屆=' + String(term),
          retrievedAt,
          aggregate,
          votes: salient,
        },
        salient.length,
        votesTotal,
      );
      console.log(
        '  term ' +
          String(term) +
          ' (' +
          name +
          '): ' +
          String(salient.length) +
          ' salient votes of ' +
          String(votesTotal),
      );
    }
  }

  entries.sort((a, b) => a.key.localeCompare(b.key));
  const manifest = {
    datasetId: 'kaohsiung-2026-political-career-legislative',
    publisher: '立法院（開放國會 API）',
    api: API,
    fetchedAt: retrievedAt,
    entries,
    failures,
  };
  writeFileSync(
    MANIFEST_PATH,
    JSON.stringify(manifest, null, 2) + '\n',
    'utf8',
  );
  console.log(
    '[legislative] retained ' +
      String(entries.length) +
      ' snapshots -> ' +
      MANIFEST_PATH,
  );
}

await main();
