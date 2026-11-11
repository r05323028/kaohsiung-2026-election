/**
 * Official ballot-number (號次) helpers for the 2026 Kaohsiung election.
 *
 * Source of truth: 高雄市第5屆市長、市議員選舉候選人姓名號次抽定一覽表,
 * published by 高雄市選舉委員會 on 2026-10-27 (KHEC article 65366).
 *
 * The draw is a finished official procedure, but it is a separate step from
 * the final candidate-roster announcement (scheduled 2026-11-17). Candidates
 * therefore keep `candidateNumberStatus: 'drawn'` and
 * `candidateNumberIsFinal: false` while still displaying the official number.
 */

export const BALLOT_NUMBER_SOURCE_ID = 'source-khec-65366';
export const BALLOT_NUMBER_SOURCE_URL =
  'https://www.cec.gov.tw/khec/article/65366';
export const BALLOT_NUMBER_SOURCE_TITLE =
  '高雄市第5屆市長、市議員選舉候選人姓名號次抽定一覽表';
export const BALLOT_NUMBER_PUBLISHER = '高雄市選舉委員會';
export const BALLOT_NUMBER_PUBLICATION_DATE = '2026-10-27';
export const BALLOT_NUMBER_DRAW_PAGE = 1;

export type BallotNumberStatus = 'drawn' | 'final' | 'not-published';

export type BallotNumberSubject = {
  candidateNumber: string;
  candidateNumberStatus?: BallotNumberStatus;
};

const BALLOT_NUMBER_PATTERN = /^[1-9]\d*$/;

/** NFKC folds full-width digits so １２ and 12 describe the same number. */
export function normalizeBallotNumberInput(
  value: string | null | undefined,
): string {
  return (value ?? '').normalize('NFKC').trim();
}

export function parseBallotNumber(
  value: string | null | undefined,
): number | null {
  const normalized = normalizeBallotNumberInput(value);
  if (!BALLOT_NUMBER_PATTERN.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function isValidBallotNumber(value: string | null | undefined): boolean {
  return parseBallotNumber(value) !== null;
}

export function isPublishedBallotNumberStatus(
  status: BallotNumberStatus | undefined,
): status is 'drawn' | 'final' {
  return status === 'drawn' || status === 'final';
}

/** 「3 號」; null when the value is not a usable official number. */
export function formatBallotNumber(
  value: string | null | undefined,
): string | null {
  const parsed = parseBallotNumber(value);
  return parsed === null ? null : `${parsed} 號`;
}

/**
 * Display text for candidate-facing UI: a drawn or final number renders as
 * 「3 號」, everything else stays explicitly unpublished.
 */
export function ballotNumberText(subject: BallotNumberSubject): string {
  if (!isPublishedBallotNumberStatus(subject.candidateNumberStatus))
    return '待公告';
  return formatBallotNumber(subject.candidateNumber) ?? '待公告';
}

/** Numeric ascending order; unusable values sort last, never as text. */
export function compareBallotNumbers(
  left: string | null | undefined,
  right: string | null | undefined,
): number {
  const a = parseBallotNumber(left);
  const b = parseBallotNumber(right);
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

/**
 * Contest-local order: ballot number first, then stable identity fields so the
 * order never depends on array insertion order.
 */
export function compareCandidatesByBallotNumber<
  T extends {
    candidacy: BallotNumberSubject & { id: string; personId?: string };
  },
>(left: T, right: T): number {
  const byNumber = compareBallotNumbers(
    left.candidacy.candidateNumber,
    right.candidacy.candidateNumber,
  );
  if (byNumber !== 0) return byNumber;
  return left.candidacy.id.localeCompare(right.candidacy.id);
}

export function sortCandidatesByBallotNumber<
  T extends {
    candidacy: BallotNumberSubject & { id: string; personId?: string };
  },
>(items: readonly T[]): T[] {
  return [...items].sort(compareCandidatesByBallotNumber);
}

export type BallotNumberAuditEntry = {
  candidateId: string;
  candidateName: string;
  electionType: string;
  districtId: string;
  candidateNumber: string;
  candidateNumberStatus?: BallotNumberStatus;
};

export type BallotNumberAuditIssue = {
  candidateId: string;
  candidateName: string;
  contest: string;
  message: string;
};

export type BallotNumberDuplicate = {
  contest: string;
  ballotNumber: number;
  candidateIds: string[];
};

export type BallotNumberContestSummary = {
  contest: string;
  electionType: string;
  districtId: string;
  count: number;
  numbers: number[];
};

export type BallotNumberAudit = {
  ok: boolean;
  total: number;
  numbered: number;
  unpublished: BallotNumberAuditEntry[];
  invalid: BallotNumberAuditIssue[];
  missingProvenance: BallotNumberAuditIssue[];
  duplicates: BallotNumberDuplicate[];
  contests: BallotNumberContestSummary[];
};

export function ballotNumberContestKey(
  entry: Pick<BallotNumberAuditEntry, 'electionType' | 'districtId'>,
): string {
  return `${entry.electionType}:${entry.districtId}`;
}

/**
 * Audits ballot numbers per electoral contest. Mayoral candidates form their
 * own contest, so a mayoral 「1 號」 never collides with a council 「1 號」.
 */
export function auditBallotNumbers(
  entries: readonly BallotNumberAuditEntry[],
  options: {
    hasProvenance?: (entry: BallotNumberAuditEntry) => boolean;
  } = {},
): BallotNumberAudit {
  const unpublished: BallotNumberAuditEntry[] = [];
  const invalid: BallotNumberAuditIssue[] = [];
  const missingProvenance: BallotNumberAuditIssue[] = [];
  const duplicateIds = new Map<string, string[]>();
  const contestNumbers = new Map<
    string,
    {
      electionType: string;
      districtId: string;
      numbers: number[];
      count: number;
    }
  >();

  for (const entry of entries) {
    const contest = ballotNumberContestKey(entry);
    const published = isPublishedBallotNumberStatus(
      entry.candidateNumberStatus,
    );
    if (!published) {
      unpublished.push(entry);
      continue;
    }
    const parsed = parseBallotNumber(entry.candidateNumber);
    if (parsed === null) {
      invalid.push({
        candidateId: entry.candidateId,
        candidateName: entry.candidateName,
        contest,
        message: `Ballot number "${entry.candidateNumber}" is not a positive integer.`,
      });
      continue;
    }
    if (options.hasProvenance && !options.hasProvenance(entry))
      missingProvenance.push({
        candidateId: entry.candidateId,
        candidateName: entry.candidateName,
        contest,
        message: 'Candidate has a ballot number without source provenance.',
      });
    const duplicateKey = `${contest}#${parsed}`;
    duplicateIds.set(duplicateKey, [
      ...(duplicateIds.get(duplicateKey) ?? []),
      entry.candidateId,
    ]);
    const summary = contestNumbers.get(contest) ?? {
      electionType: entry.electionType,
      districtId: entry.districtId,
      numbers: [],
      count: 0,
    };
    summary.numbers.push(parsed);
    summary.count += 1;
    contestNumbers.set(contest, summary);
  }

  const duplicates: BallotNumberDuplicate[] = [];
  for (const [key, ids] of duplicateIds) {
    if (ids.length < 2) continue;
    const [contest = '', number = '0'] = key.split('#');
    duplicates.push({
      contest,
      ballotNumber: Number(number),
      candidateIds: ids,
    });
  }

  const contests = [...contestNumbers.entries()]
    .map(([contest, summary]) => ({
      contest,
      electionType: summary.electionType,
      districtId: summary.districtId,
      count: summary.count,
      numbers: [...summary.numbers].sort((a, b) => a - b),
    }))
    .sort((a, b) => a.contest.localeCompare(b.contest));

  return {
    ok:
      invalid.length === 0 &&
      missingProvenance.length === 0 &&
      duplicates.length === 0,
    total: entries.length,
    numbered: entries.length - unpublished.length,
    unpublished,
    invalid,
    missingProvenance,
    duplicates,
    contests,
  };
}
