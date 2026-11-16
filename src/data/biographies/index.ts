import publishedInput from '../../../data/published/2026/candidate-biographies.json';
import {
  type BiographyPublishedClaim,
  type BiographySource,
  validateBiographyPublicationSnapshot,
} from './schema';

export const publicationBiographySnapshot =
  validateBiographyPublicationSnapshot(publishedInput);

export type BiographyReadModel = {
  status: 'published' | 'none';
  claims: BiographyPublishedClaim[];
  note: string;
};

export type BiographySourceReadModel = BiographySource & {
  retrievalDate: string;
};

export const biographySourceRecords: BiographySourceReadModel[] =
  publicationBiographySnapshot.sources.map((source) => ({
    ...source,
    retrievalDate: publicationBiographySnapshot.generatedAt,
  }));

const PUBLICATION_NOTE =
  '本區資料取自已提交的來源快照；候選人資料透過 Pull Request 檢視，網站僅執行確定性的格式、來源與關聯檢查。';

export function getBiographyReadModel(candidateId: string): BiographyReadModel {
  const claims = publicationBiographySnapshot.records
    .filter((claim) => claim.candidateId === candidateId)
    .sort((left, right) => left.claimId.localeCompare(right.claimId));
  return {
    status: claims.length > 0 ? 'published' : 'none',
    claims,
    note: PUBLICATION_NOTE,
  };
}
