import approvedInput from '../../../data/approved/2026/political-career.json';
import {
  type CareerCoverage,
  type OfficeTerm,
  type PoliticalActivity,
  type PoliticalCareerDataset,
  type PoliticalCareerSource,
  validatePoliticalCareerDataset,
} from './schema';

export const politicalCareerDataset: PoliticalCareerDataset =
  validatePoliticalCareerDataset(approvedInput);

export type PublicPoliticalCareerSource = Omit<
  PoliticalCareerSource,
  'rawPath' | 'sha256'
>;

export type PoliticalCareerView = {
  officeTerms: OfficeTerm[];
  activities: PoliticalActivity[];
  coverage: CareerCoverage;
  sources: Record<string, PublicPoliticalCareerSource>;
  limitations: string[];
};

const byNewestFirst = (
  left: { date: string },
  right: { date: string },
): number => right.date.localeCompare(left.date);

const byEarliestFirst = (
  left: { startDate: string | null; termNumbers: number[] },
  right: { startDate: string | null; termNumbers: number[] },
): number => {
  const leftTerm = left.termNumbers[0] ?? Number.MAX_SAFE_INTEGER;
  const rightTerm = right.termNumbers[0] ?? Number.MAX_SAFE_INTEGER;
  if (leftTerm !== rightTerm) return leftTerm - rightTerm;
  return (left.startDate ?? '').localeCompare(right.startDate ?? '');
};

export function getPoliticalCareer(candidateId: string): PoliticalCareerView | undefined {
  const coverage = politicalCareerDataset.coverage.find(
    (row) => row.candidateId === candidateId,
  );
  if (!coverage) return undefined;

  const officeTerms = politicalCareerDataset.officeTerms
    .filter((term) => term.candidateId === candidateId)
    .sort(byEarliestFirst);
  const activities = politicalCareerDataset.activities
    .filter((activity) => activity.candidateId === candidateId)
    .sort(byNewestFirst);

  const sources: Record<string, PublicPoliticalCareerSource> = {};
  const sourceIds = new Set<string>([
    ...officeTerms.flatMap((term) => term.sourceIds),
    ...activities.map((activity) => activity.sourceId),
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
    coverage,
    sources,
    limitations: politicalCareerDataset.review.limitations,
  };
}

export type { CareerCoverage, OfficeTerm, PoliticalActivity, PoliticalCareerSource };
