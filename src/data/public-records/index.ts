import approvedInput from '../../../data/approved/2026/kaohsiung-public-records.json';
import manifestInput from '../../../data/official-source-manifest.json';
import {
  type PublicRecordBundle,
  type PublicRecordsDataset,
  validatePublicRecordsDataset,
} from './schema';

const manifestSourceIds = new Set(
  manifestInput.sources.map((source) => source.id),
);

export const publicRecordsDataset: PublicRecordsDataset =
  validatePublicRecordsDataset(approvedInput, manifestSourceIds);

export function getPublicRecordBundle(
  personId: string,
): PublicRecordBundle | undefined {
  const claims = publicRecordsDataset.claims.filter(
    (claim) => claim.subjectId === personId,
  );
  const claimIds = new Set(claims.map((claim) => claim.claimId));
  const evidence = publicRecordsDataset.evidence.filter((item) =>
    claimIds.has(item.claimId),
  );
  const positions = publicRecordsDataset.positions.filter(
    (item) => item.personId === personId,
  );
  const policies = publicRecordsDataset.policies.filter(
    (item) => item.personId === personId,
  );
  const activities = publicRecordsDataset.activities.filter(
    (item) => item.personId === personId,
  );
  const news = publicRecordsDataset.news.filter((item) =>
    item.personIds.includes(personId),
  );
  const relationships = publicRecordsDataset.relationships.filter(
    (item) => item.personId === personId,
  );
  const timeline = publicRecordsDataset.timeline.filter(
    (item) => item.personId === personId,
  );
  const identityResolutions = publicRecordsDataset.identityResolutions.filter(
    (item) => item.personId === personId,
  );
  const conflicts = publicRecordsDataset.conflicts.filter((item) =>
    item.claimIds.some((claimId) => claimIds.has(claimId)),
  );

  if (
    claims.length === 0 &&
    positions.length === 0 &&
    policies.length === 0 &&
    activities.length === 0 &&
    news.length === 0 &&
    relationships.length === 0 &&
    timeline.length === 0
  ) {
    return undefined;
  }

  return {
    personId,
    claims,
    evidence,
    positions,
    policies,
    activities,
    news,
    relationships,
    timeline,
    identityResolutions,
    conflicts,
  };
}

export function getPublicRecordSourceIds(personId: string): string[] {
  const bundle = getPublicRecordBundle(personId);
  if (!bundle) return [];
  return [
    ...new Set([
      ...bundle.evidence.map((item) => item.sourceId),
      ...bundle.identityResolutions.map((item) => item.sourceId),
    ]),
  ];
}

export type {
  CandidateResearchCategorySummary,
  CandidateResearchSummary,
} from './research-index';
export {
  candidateResearchDataset,
  getCandidateResearchSummary,
} from './research-index';
