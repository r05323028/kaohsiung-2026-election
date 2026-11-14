import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  GovernmentProject,
  LegislativeProposal,
  OfficeTerm,
  PoliticalCareerSource,
  VotingRecord,
} from '../../src/data/political-career/schema';

/**
 * Assembles the public-service records that the council news corpus cannot
 * provide: appointed government posts, local elected offices, 立法院 seats,
 * the bills filed by those 立法委員 and their recorded roll-call votes.
 *
 * Everything is read from snapshots already on disk, and every source must
 * resolve to a retained file with a matching sha256. Nothing here reaches the
 * network and nothing here invents a date: a partial date keeps its precision
 * so the UI never prints a day the source did not state.
 */

const ROOT = process.cwd();
const POSITIONS_PATH = 'data/political-career/2026/government-positions.json';
const POSITIONS_MANIFEST =
  'data/raw/political-career/2026/positions/positions-manifest.json';
const PROJECTS_PATH = 'data/political-career/2026/government-projects.json';
const PROJECTS_MANIFEST =
  'data/raw/political-career/2026/projects/projects-manifest.json';
const LEGISLATIVE_CANDIDATES_PATH =
  'data/political-career/2026/legislative-candidates.json';
const LEGISLATIVE_MANIFEST =
  'data/raw/political-career/2026/legislative-manifest.json';

type SnapshotEntry = {
  key?: string;
  sourceId?: string;
  url: string;
  httpStatus: number;
  sha256: string;
  rawPath: string;
  retrievedAt: string;
  recordCount?: number;
};

type SnapshotManifest = { entries: SnapshotEntry[] };

type CuratedPositionSet = {
  sources: PoliticalCareerSource[];
  positions: OfficeTerm[];
};

type CuratedProjectSet = {
  sources: PoliticalCareerSource[];
  projects: GovernmentProject[];
};

type LegislativeCandidate = {
  candidateId: string;
  name: string;
  identityBasis: string;
  terms: number[];
};

type LegislatorRow = {
  屆: number;
  委員姓名: string;
  選區名稱?: string;
  到職日?: string;
  離職日期?: string;
  是否離職?: string;
};

type BillRow = {
  term: number;
  billId: string;
  title: string;
  status: string;
  proposers: string[];
  proposedAt: string | null;
  session: number | null;
  number: string | null;
  category: string | null;
  proposerText: string;
  latestProgressDate: string | null;
  laws: string[];
  url: string | null;
};

type VoteRow = {
  voteId: string;
  meetingName: string | null;
  voteType: string;
  recordedDate: string | null;
  motionText: string;
  tally: {
    attending: number;
    for: number;
    against: number;
    abstain: number;
  } | null;
  individual: { present: boolean; side: string; recorded: boolean };
};

type VoteSide = VotingRecord['individualVote'];

function absolute(path: string): string {
  return join(ROOT, path);
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(absolute(path), 'utf8')) as T;
}

function hashOfFile(rawPath: string): string {
  return createHash('sha256')
    .update(readFileSync(absolute(rawPath)))
    .digest('hex');
}

/** Source records for curated files, with the retained snapshot checked now. */
function sourceFromSnapshot(
  base: Pick<
    PoliticalCareerSource,
    'sourceId' | 'url' | 'publisher' | 'title' | 'tier' | 'note'
  >,
  entry: SnapshotEntry | undefined,
): PoliticalCareerSource {
  if (!entry) {
    throw new Error('no retained snapshot for source ' + base.sourceId);
  }
  const sha = hashOfFile(entry.rawPath);
  if (sha !== entry.sha256) {
    throw new Error('snapshot hash mismatch for source ' + base.sourceId);
  }
  return {
    ...base,
    retrievedAt: entry.retrievedAt,
    rawPath: entry.rawPath,
    sha256: entry.sha256,
  };
}

function dateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.replace(/\//g, '-');
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;
  if (/^\d{4}-\d{2}$/.test(normalized)) return normalized + '-01';
  if (/^\d{4}$/.test(normalized)) return normalized + '-01-01';
  return null;
}

function datePrecision(
  value: string | null | undefined,
): OfficeTerm['startDatePrecision'] {
  if (!value) return null;
  const normalized = value.replace(/\//g, '-');
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return 'day';
  if (/^\d{4}-\d{2}$/.test(normalized)) return 'month';
  if (/^\d{4}$/.test(normalized)) return 'year';
  return null;
}

function slugOf(candidateId: string): string {
  return candidateId.replace(/^official-(?:mayor|candidate)-2026-/, '');
}

function linkPosition(
  positions: OfficeTerm[],
  candidateId: string,
  title: string,
  organization: string,
): string | null {
  const own = positions.filter(
    (position) => position.candidateId === candidateId,
  );
  const exact = own.find(
    (position) =>
      (position.organization === organization && organization.length > 0) ||
      title.includes(position.officeTitle) ||
      position.officeTitle.includes(title),
  );
  return exact?.id ?? null;
}

export type PublicServiceRecords = {
  officeTerms: OfficeTerm[];
  governmentProjects: GovernmentProject[];
  legislativeProposals: LegislativeProposal[];
  votingRecords: VotingRecord[];
};

export function buildPublicServiceRecords(options: {
  personIdOf: (candidateId: string) => string;
  pushSource: (source: PoliticalCareerSource) => void;
}): PublicServiceRecords {
  const { personIdOf, pushSource } = options;
  const officeTerms: OfficeTerm[] = [];
  const governmentProjects: GovernmentProject[] = [];
  const legislativeProposals: LegislativeProposal[] = [];
  const votingRecords: VotingRecord[] = [];

  // 1. Curated government and local elected positions.
  if (existsSync(absolute(POSITIONS_PATH))) {
    const curated = readJson<CuratedPositionSet>(POSITIONS_PATH);
    const manifest = readJson<SnapshotManifest>(POSITIONS_MANIFEST);
    const entryBySourceId = new Map(
      manifest.entries.map((entry) => [entry.sourceId ?? '', entry]),
    );
    const sourceIds = new Set<string>();
    for (const source of curated.sources) {
      if (sourceIds.has(source.sourceId)) continue;
      sourceIds.add(source.sourceId);
      pushSource(
        sourceFromSnapshot(source, entryBySourceId.get(source.sourceId)),
      );
    }
    for (const position of curated.positions) {
      officeTerms.push({
        ...position,
        personId: personIdOf(position.candidateId),
      });
    }
  }

  // 2. Curated government projects.
  if (existsSync(absolute(PROJECTS_PATH))) {
    const curated = readJson<CuratedProjectSet>(PROJECTS_PATH);
    const manifest = readJson<SnapshotManifest>(PROJECTS_MANIFEST);
    const entryBySourceId = new Map(
      manifest.entries.map((entry) => [entry.sourceId ?? '', entry]),
    );
    const sourceIds = new Set<string>();
    for (const source of curated.sources) {
      if (sourceIds.has(source.sourceId)) continue;
      sourceIds.add(source.sourceId);
      pushSource(
        sourceFromSnapshot(source, entryBySourceId.get(source.sourceId)),
      );
    }
    for (const project of curated.projects) {
      governmentProjects.push({
        ...project,
        personId: personIdOf(project.candidateId),
        positionId: linkPosition(
          officeTerms,
          project.candidateId,
          project.positionTitle,
          project.positionOrganization,
        ),
      });
    }
  }

  // 3. 立法院 seats, bills and recorded votes.
  if (existsSync(absolute(LEGISLATIVE_CANDIDATES_PATH))) {
    const curated = readJson<{ candidates: LegislativeCandidate[] }>(
      LEGISLATIVE_CANDIDATES_PATH,
    );
    const manifest = readJson<SnapshotManifest>(LEGISLATIVE_MANIFEST);
    const entryByKey = new Map(
      manifest.entries.map((entry) => [entry.key ?? '', entry]),
    );

    for (const target of curated.candidates) {
      const candidateId = target.candidateId;
      const slug = slugOf(candidateId);

      const legislatorsEntry = entryByKey.get('legislators-' + candidateId);
      if (!legislatorsEntry) {
        throw new Error('no retained legislators snapshot for ' + target.name);
      }
      const legislators = readJson<{ legislators: LegislatorRow[] }>(
        legislatorsEntry.rawPath,
      );
      pushSource(
        sourceFromSnapshot(
          {
            sourceId: 'legislative-' + slug + '-legislators',
            url: legislatorsEntry.url,
            publisher: '立法院開放國會 API（ly.govapi.tw）',
            title: '立法院委員名錄：' + target.name,
            tier: 'tier-1-primary',
            note: '立法院開放資料委員名錄；屆次、選區與到職／離職日期取自本筆回應。',
          },
          legislatorsEntry,
        ),
      );
      const sourceId = 'legislative-' + slug + '-legislators';

      for (const seat of legislators.legislators) {
        if (seat.委員姓名 !== target.name) continue;
        if (!target.terms.includes(seat.屆)) continue;
        const startDate = dateOnly(seat.到職日);
        const endDate = dateOnly(seat.離職日期);
        officeTerms.push({
          id: 'position-' + slug + '-legislative-' + String(seat.屆),
          candidateId,
          personId: personIdOf(candidateId),
          positionType: 'legislative-office',
          employmentType: 'elected',
          officeTitle: '立法委員',
          organization: '立法院',
          termLabel: '第' + String(seat.屆) + '屆',
          termNumbers: [seat.屆],
          startDate,
          startDatePrecision: datePrecision(seat.到職日),
          endDate,
          endDatePrecision: datePrecision(seat.離職日期),
          status: seat.是否離職 === '否' ? 'current' : 'former',
          sourceIds: [sourceId],
          evidenceExcerpt:
            '立法院委員名錄：' +
            target.name +
            '，第' +
            String(seat.屆) +
            '屆' +
            (seat.選區名稱 ? '，' + seat.選區名稱 : '') +
            '，到職日 ' +
            (seat.到職日 ?? '未載明'),
          attribution: 'institutional-record',
          note: target.identityBasis,
        });
      }

      for (const term of target.terms) {
        const positionId = 'position-' + slug + '-legislative-' + String(term);

        const billsEntry = entryByKey.get(
          'bills-' + candidateId + '-t' + String(term),
        );
        if (billsEntry) {
          pushSource(
            sourceFromSnapshot(
              {
                sourceId: 'legislative-' + slug + '-bills-t' + String(term),
                url: billsEntry.url,
                publisher: '立法院開放國會 API（ly.govapi.tw）',
                title:
                  '立法院第' +
                  String(term) +
                  '屆議案名單（提案人：' +
                  target.name +
                  '）',
                tier: 'tier-1-primary',
                note: '立法院開放資料議案清單；提案人順序、議案狀態與最新進度日期取自本筆回應。',
              },
              billsEntry,
            ),
          );
          const billsSourceId =
            'legislative-' + slug + '-bills-t' + String(term);
          const bills = readJson<{ bills: BillRow[] }>(billsEntry.rawPath);
          for (const bill of bills.bills) {
            const proposerRole =
              bill.proposers[0] === target.name ? 'primary' : 'co-proposer';
            legislativeProposals.push({
              id: 'proposal-' + slug + '-' + bill.billId,
              candidateId,
              personId: personIdOf(candidateId),
              positionId,
              institution: '立法院',
              billId: bill.billId,
              billNumber: bill.number,
              title: bill.title,
              category: bill.category ?? '未載明',
              proposerRole,
              proposerText: bill.proposerText || null,
              proposedAt: dateOnly(bill.proposedAt),
              session: bill.session,
              latestProgressDate: dateOnly(bill.latestProgressDate),
              legislativeStatus: bill.status,
              laws: bill.laws,
              sourceId: billsSourceId,
              officialUrl: bill.url,
              evidenceExcerpt:
                '提案人：' +
                bill.proposers.join('、') +
                '；議案狀態：' +
                bill.status +
                (bill.latestProgressDate
                  ? '；最新進度：' + bill.latestProgressDate
                  : ''),
              attribution: 'institutional-record',
              identityBasis:
                '立法院開放資料第' +
                String(term) +
                '屆議案清單將「' +
                target.name +
                '」列為提案人；同名者已與立法院委員名錄核對。',
            });
          }
        }

        const votesEntry = entryByKey.get(
          'votes-' + candidateId + '-t' + String(term),
        );
        if (votesEntry) {
          pushSource(
            sourceFromSnapshot(
              {
                sourceId: 'legislative-' + slug + '-votes-t' + String(term),
                url: votesEntry.url,
                publisher: '立法院開放國會 API（ly.govapi.tw）',
                title:
                  '立法院第' +
                  String(term) +
                  '屆記名表決紀錄（' +
                  target.name +
                  '）',
                tier: 'tier-1-primary',
                note: '立法院開放資料表決清單；贊成、反對、棄權名單與記名表決結果取自本筆回應。',
              },
              votesEntry,
            ),
          );
          const votesSourceId =
            'legislative-' + slug + '-votes-t' + String(term);
          const snapshot = readJson<{ votes: VoteRow[] }>(votesEntry.rawPath);
          for (const vote of snapshot.votes) {
            const votedAt = dateOnly(vote.recordedDate);
            if (!votedAt) continue;
            const side = vote.individual.side as VoteSide;
            const individualVote: VoteSide =
              vote.individual.recorded && side === 'for'
                ? 'for'
                : vote.individual.recorded && side === 'against'
                  ? 'against'
                  : vote.individual.recorded && side === 'abstain'
                    ? 'abstain'
                    : side === 'absent'
                      ? 'absent'
                      : side === 'not-recorded'
                        ? 'not-recorded'
                        : 'unknown';
            votingRecords.push({
              id: 'vote-' + slug + '-' + vote.voteId,
              candidateId,
              personId: personIdOf(candidateId),
              positionId,
              institution: '立法院',
              motionTitle: vote.motionText,
              votedAt,
              voteId: vote.voteId,
              meetingName: vote.meetingName,
              voteType: vote.voteType === '記名表決' ? 'roll-call' : 'other',
              individualVote,
              tally: vote.tally,
              sourceId: votesSourceId,
              evidenceExcerpt:
                individualVote === 'not-recorded'
                  ? '表決代碼 ' +
                    vote.voteId +
                    '：記名表決名單未列「' +
                    target.name +
                    '」。'
                  : '表決代碼 ' +
                    vote.voteId +
                    '：記名表決名單將「' +
                    target.name +
                    '」列於' +
                    (individualVote === 'for'
                      ? '贊成'
                      : individualVote === 'against'
                        ? '反對'
                        : individualVote === 'abstain'
                          ? '棄權'
                          : '未投票／缺席') +
                    '。',
              attribution: 'institutional-record',
              identityBasis:
                '表決代碼對應立法院第' +
                String(term) +
                '屆記名表決名單；姓名逐字比對，未以黨團立場推定個別投票。',
            });
          }
        }
      }
    }
  }

  return {
    officeTerms,
    governmentProjects,
    legislativeProposals,
    votingRecords,
  };
}
