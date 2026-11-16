import publishedInput from '../../../data/published/2026/candidate-biographies.json';
import {
  type BiographyPublicationSnapshot,
  BiographyPublicationSnapshotSchema,
  validateBiographyPublicationSnapshot,
} from './schema';

export const publicationBiographySnapshot: BiographyPublicationSnapshot =
  validateBiographyPublicationSnapshot(publishedInput);

export { BiographyPublicationSnapshotSchema };
