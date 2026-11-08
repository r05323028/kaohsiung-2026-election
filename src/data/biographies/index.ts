import publishedInput from '../../../data/published/2026/candidate-biographies.json';
import { validateBiographyPublicationSnapshot } from './publication';
import {
  type BiographyPublishedClaim,
  validateBiographyApprovedDataset,
} from './schema';

export const publicationBiographySnapshot =
  validateBiographyPublicationSnapshot(publishedInput);

// Compatibility export for existing profile mappers. The publication snapshot remains authoritative.
export const approvedBiographyDataset = validateBiographyApprovedDataset({
  datasetId: 'kaohsiung-2026-candidate-biographies-approved',
  snapshotDate: publicationBiographySnapshot.snapshotDate,
  records: publicationBiographySnapshot.records,
  note: 'Derived from the editorial publication snapshot; this is not a separate approval authority.',
});

export type BiographyReadModel = {
  status:
    | 'approved'
    | 'pending-human-review'
    | 'withheld-conflict'
    | 'unavailable';
  claims: Array<BiographyPublishedClaim>;
  note: string;
};

export function getBiographyReadModel(
  candidateId: string,
): BiographyReadModel | undefined {
  const claims = approvedBiographyDataset.records.filter(
    (claim) => claim.candidateId === candidateId,
  );
  if (claims.length > 0) {
    return {
      status: 'approved',
      claims,
      note: '本頁僅顯示已完成身分核對、人工與編輯核准並通過出版閘門的履歷資料。',
    };
  }
  return {
    status: 'pending-human-review',
    claims: [],
    note: '目前沒有可公開的已核准履歷主張；空白不代表不存在，待審資料不會載入公開頁面。',
  };
}
