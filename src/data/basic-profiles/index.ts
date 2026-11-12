import publishedInput from '../../../data/published/2026/candidate-basic-profiles.json';
import {
  type BasicProfileClaim,
  type BasicProfileField,
  BasicProfilePublicationSchema,
} from './schema';

export const basicProfilePublication =
  BasicProfilePublicationSchema.parse(publishedInput);

export type BasicProfilePublicClaim = {
  claimId: string;
  candidateId: string;
  field: BasicProfileField;
  value: string;
  detail: string | null;
  organization: string | null;
  validFrom: string | null;
  validTo: string | null;
  currentStatus: BasicProfileClaim['currentStatus'];
  attribution: BasicProfileClaim['attribution'];
  evidence: {
    publisher: string;
    url: string;
    publishedAt: string | null;
  };
};

const claimsByCandidate = new Map<string, BasicProfilePublicClaim[]>();
for (const claim of basicProfilePublication.claims) {
  const existing = claimsByCandidate.get(claim.candidateId) ?? [];
  existing.push({
    claimId: claim.claimId,
    candidateId: claim.candidateId,
    field: claim.field,
    value: claim.value,
    detail: claim.detail,
    organization: claim.organization,
    validFrom: claim.validFrom,
    validTo: claim.validTo,
    currentStatus: claim.currentStatus,
    attribution: claim.attribution,
    evidence: {
      publisher: claim.evidence.publisher,
      url: claim.evidence.url,
      publishedAt: claim.evidence.publishedAt,
    },
  });
  claimsByCandidate.set(claim.candidateId, existing);
}

export type BasicProfileReadModel = {
  claims: BasicProfilePublicClaim[];
  note: string;
};

const READ_MODEL_NOTE =
  '本區資料由公開來源逐項獨立查核，並與人工編輯核准的履歷分開列示；未查證的欄位不會顯示。';

export function getBasicProfileReadModel(
  candidateId: string,
): BasicProfileReadModel | undefined {
  const claims = claimsByCandidate.get(candidateId);
  if (!claims || claims.length === 0) return undefined;
  return {
    claims: [...claims].sort((left, right) => {
      const fieldOrder = [
        'current-position',
        'public-service',
        'professional-experience',
        'education',
        'official-website',
        'biographical-note',
      ];
      const fieldDifference =
        fieldOrder.indexOf(left.field) - fieldOrder.indexOf(right.field);
      if (fieldDifference !== 0) return fieldDifference;
      return (right.validFrom ?? '').localeCompare(left.validFrom ?? '');
    }),
    note: READ_MODEL_NOTE,
  };
}
