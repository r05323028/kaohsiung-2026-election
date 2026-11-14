import approvedInput from '../../../data/approved/2026/political-career.json';
import {
  type CareerCoverage,
  type GovernmentProject,
  type IndividualVote,
  type LegislativeProposal,
  type OfficeTerm,
  type PoliticalActivity,
  type PoliticalCareerDataset,
  type PoliticalCareerSource,
  type VotingRecord,
  validatePoliticalCareerDataset,
} from './schema';

export const politicalCareerDataset: PoliticalCareerDataset =
  validatePoliticalCareerDataset(approvedInput);

export type PublicPoliticalCareerSource = Omit<
  PoliticalCareerSource,
  'rawPath' | 'sha256'
>;

/**
 * Lists rendered inside a service period are bounded: the dataset keeps every
 * verified record, the candidate page only ships the most recent ones so a
 * 682-bill term does not turn into a megabyte of client props.
 */
export const NESTED_RECORD_LIMIT = 12;

export type ServicePeriodRecords = {
  projects: GovernmentProject[];
  proposals: LegislativeProposal[];
  votes: VotingRecord[];
  projectTotal: number;
  proposalTotal: number;
  voteTotal: number;
};

export type PoliticalCareerView = {
  officeTerms: OfficeTerm[];
  activities: PoliticalActivity[];
  recordsByPosition: Record<string, ServicePeriodRecords>;
  recordsWithoutPosition: ServicePeriodRecords;
  proposalTotal: number;
  votingTotal: number;
  votingBreakdown: Record<IndividualVote, number>;
  coverage: CareerCoverage;
  sources: Record<string, PublicPoliticalCareerSource>;
  limitations: string[];
};

const byNewestFirst = (
  left: { date: string },
  right: { date: string },
): number => right.date.localeCompare(left.date);

const officeSortKey = (term: OfficeTerm): string => term.startDate ?? '';
const officeTermSortKey = (term: OfficeTerm): number =>
  term.termNumbers[0] ?? Number.MAX_SAFE_INTEGER;

const byNewestOfficeFirst = (left: OfficeTerm, right: OfficeTerm): number => {
  const leftDate = officeSortKey(left);
  const rightDate = officeSortKey(right);
  if (leftDate !== rightDate) {
    if (leftDate === '') return 1;
    if (rightDate === '') return -1;
    return rightDate.localeCompare(leftDate);
  }
  return officeTermSortKey(right) - officeTermSortKey(left);
};

const proposalSortKey = (proposal: LegislativeProposal): string =>
  proposal.latestProgressDate ?? proposal.proposedAt ?? '';

const byNewestProposalFirst = (
  left: LegislativeProposal,
  right: LegislativeProposal,
): number =>
  proposalSortKey(right).localeCompare(proposalSortKey(left)) ||
  left.id.localeCompare(right.id);

const byNewestVoteFirst = (left: VotingRecord, right: VotingRecord): number =>
  right.votedAt.localeCompare(left.votedAt) || left.id.localeCompare(right.id);

const byNewestProjectFirst = (
  left: GovernmentProject,
  right: GovernmentProject,
): number => {
  const leftDate = left.endDate ?? left.startDate ?? '';
  const rightDate = right.endDate ?? right.startDate ?? '';
  return rightDate.localeCompare(leftDate) || left.id.localeCompare(right.id);
};

function emptyRecords(): ServicePeriodRecords {
  return {
    projects: [],
    proposals: [],
    votes: [],
    projectTotal: 0,
    proposalTotal: 0,
    voteTotal: 0,
  };
}

function addToPeriod(
  bucket: ServicePeriodRecords,
  record: GovernmentProject | LegislativeProposal | VotingRecord,
): void {
  if ('roleType' in record) {
    bucket.projectTotal += 1;
    bucket.projects.push(record);
    return;
  }
  if ('votingRecord' in record || 'individualVote' in record) {
    bucket.voteTotal += 1;
    bucket.votes.push(record as VotingRecord);
    return;
  }
  bucket.proposalTotal += 1;
  bucket.proposals.push(record as LegislativeProposal);
}

function capRecords(bucket: ServicePeriodRecords): void {
  bucket.projects = bucket.projects.slice(0, NESTED_RECORD_LIMIT);
  bucket.proposals = bucket.proposals.slice(0, NESTED_RECORD_LIMIT);
  bucket.votes = bucket.votes.slice(0, NESTED_RECORD_LIMIT);
}

export function getPoliticalCareer(
  candidateId: string,
): PoliticalCareerView | undefined {
  const coverage = politicalCareerDataset.coverage.find(
    (row) => row.candidateId === candidateId,
  );
  if (!coverage) return undefined;

  const officeTerms = politicalCareerDataset.officeTerms
    .filter((term) => term.candidateId === candidateId)
    .sort(byNewestOfficeFirst);
  const activities = politicalCareerDataset.activities
    .filter((activity) => activity.candidateId === candidateId)
    .sort(byNewestFirst);
  const projects = politicalCareerDataset.governmentProjects
    .filter((record) => record.candidateId === candidateId)
    .sort(byNewestProjectFirst);
  const proposals = politicalCareerDataset.legislativeProposals
    .filter((record) => record.candidateId === candidateId)
    .sort(byNewestProposalFirst);
  const votes = politicalCareerDataset.votingRecords
    .filter((record) => record.candidateId === candidateId)
    .sort(byNewestVoteFirst);

  const knownPositionIds = new Set(officeTerms.map((term) => term.id));
  const recordsByPosition: Record<string, ServicePeriodRecords> = {};
  for (const termId of knownPositionIds)
    recordsByPosition[termId] = emptyRecords();
  const recordsWithoutPosition = emptyRecords();

  for (const record of [...projects, ...proposals, ...votes]) {
    const bucket =
      record.positionId !== null && knownPositionIds.has(record.positionId)
        ? recordsByPosition[record.positionId]
        : undefined;
    addToPeriod(bucket ?? recordsWithoutPosition, record);
  }
  for (const bucket of Object.values(recordsByPosition)) capRecords(bucket);
  capRecords(recordsWithoutPosition);

  const votingBreakdown: Record<IndividualVote, number> = {
    for: 0,
    against: 0,
    abstain: 0,
    absent: 0,
    'not-recorded': 0,
    unknown: 0,
  };
  for (const vote of votes) votingBreakdown[vote.individualVote] += 1;

  const sources: Record<string, PublicPoliticalCareerSource> = {};
  const sourceIds = new Set<string>([
    ...officeTerms.flatMap((term) => term.sourceIds),
    ...activities.map((activity) => activity.sourceId),
    ...projects.map((record) => record.sourceId),
    ...proposals.map((record) => record.sourceId),
    ...votes.map((record) => record.sourceId),
  ]);
  for (const source of politicalCareerDataset.sources) {
    if (!sourceIds.has(source.sourceId)) continue;
    sources[source.sourceId] = {
      sourceId: source.sourceId,
      url: source.url,
      publisher: source.publisher,
      title: source.title,
      tier: source.tier,
      retrievedAt: source.retrievedAt,
      note: source.note,
    };
  }

  return {
    officeTerms,
    activities,
    recordsByPosition,
    recordsWithoutPosition,
    proposalTotal: proposals.length,
    votingTotal: votes.length,
    votingBreakdown,
    coverage,
    sources,
    limitations: politicalCareerDataset.review.limitations,
  };
}

export type {
  CareerCoverage,
  GovernmentProject,
  IndividualVote,
  LegislativeProposal,
  OfficeTerm,
  PoliticalActivity,
  PoliticalCareerSource,
  VotingRecord,
};
