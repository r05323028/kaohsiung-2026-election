import publishedInput from '../../../data/published/2026/candidate-property-declarations.json';
import {
  type PropertyDeclarationCandidateRecord,
  type PropertyDeclarationPublishedDataset,
  validatePropertyDeclarationDataset,
} from './schema';

export const propertyDeclarationSnapshot: PropertyDeclarationPublishedDataset =
  validatePropertyDeclarationDataset(publishedInput);

const recordsByCandidateId = new Map(
  propertyDeclarationSnapshot.records.map((record) => [
    record.candidateId,
    record,
  ]),
);

export type PropertyDeclarationReadModel = PropertyDeclarationCandidateRecord;

export const PROPERTY_DECLARATION_PUBLIC_NOTE =
  '本頁僅呈現中選會財產申報公開查閱平台的官方文件連結與來源對帳狀態；不轉錄地址、身分證字號、金融帳戶、金額或個別財產標的。';

export function getCandidatePropertyDeclaration(
  candidateId: string,
): PropertyDeclarationReadModel | undefined {
  return recordsByCandidateId.get(candidateId);
}

export function propertyDeclarationCoverage(): {
  candidates: number;
  sourceLinked: number;
  ambiguous: number;
  sourceUnavailable: number;
} {
  return {
    candidates: propertyDeclarationSnapshot.coverage.candidateCount,
    sourceLinked: propertyDeclarationSnapshot.coverage.sourceLinkedCount,
    ambiguous: propertyDeclarationSnapshot.coverage.ambiguousCount,
    sourceUnavailable:
      propertyDeclarationSnapshot.coverage.sourceUnavailableCount,
  };
}
