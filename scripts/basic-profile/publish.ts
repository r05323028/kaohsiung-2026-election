import { join } from 'node:path';
import {
  BASIC_PROFILE_DATASET_ID,
  BASIC_PROFILE_POLICY_NAME,
  BASIC_PROFILE_POLICY_VERSION,
  type BasicProfileClaim,
  type BasicProfileField,
  type BasicProfilePublicationInput,
  BasicProfilePublicationSchema,
} from '../../src/data/basic-profiles/schema';
import {
  isoNow,
  normalizedPath,
  publicationPath,
  readJson,
  sha256,
  sortedCandidates,
  writeJson,
} from './lib';

type NormalizedClaim = BasicProfileClaim & {
  source: BasicProfileClaim['evidence'];
  disposition: string;
  dispositionReason: string | null;
};

type Normalized = {
  candidates: Array<{
    candidateId: string;
    displayName: string;
    districtId: string;
    districtLabel: string;
    claims: NormalizedClaim[];
    fieldStatus: Record<string, string>;
    gaps: string[];
  }>;
};

const normalized = readJson<Normalized>(normalizedPath);
const eligible = normalized.candidates.flatMap((candidate) =>
  candidate.claims.filter(
    (claim) => claim.disposition === 'publication-eligible',
  ),
) as NormalizedClaim[];

const claims: BasicProfileClaim[] = eligible.map((claim) => ({
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
  evidence: claim.source as BasicProfileClaim['evidence'],
  verification: {
    decisionId: claim.verification?.decisionId ?? '',
    verdict: 'verified',
    verifiedAt: claim.verification?.verifiedAt ?? new Date(0).toISOString(),
    verifierRunId: claim.verification?.verifierRunId ?? '',
    rationale: claim.verification?.rationale ?? '',
  },
}));

const candidates = sortedCandidates().map((candidate) => {
  const record = normalized.candidates.find(
    (entry) => entry.candidateId === candidate.id,
  );
  if (!record) throw new Error(`Missing normalized candidate: ${candidate.id}`);
  const candidateClaims = claims.filter(
    (claim) => claim.candidateId === candidate.id,
  );
  const fields = [...new Set(candidateClaims.map((claim) => claim.field))];
  return {
    candidateId: candidate.id,
    displayName: candidate.displayName,
    districtId: candidate.districtId,
    districtLabel: record.districtLabel,
    claimCount: candidateClaims.length,
    fields,
    status:
      candidateClaims.length > 0
        ? ('published' as const)
        : ('no-verified-claims' as const),
    gapFields: (
      [
        'education',
        'professional-experience',
        'public-service',
        'current-position',
        'official-website',
        'biographical-note',
      ] as BasicProfileField[]
    ).filter((field) => !fields.includes(field)),
  };
});

const byField = Object.fromEntries(
  (
    [
      'education',
      'professional-experience',
      'public-service',
      'current-position',
      'official-website',
      'biographical-note',
    ] as BasicProfileField[]
  ).map((field) => [
    field,
    claims.filter((claim) => claim.field === field).length,
  ]),
) as Record<BasicProfileField, number>;
const sourceClasses = [
  'kcc-current-member-directory',
  'kcc-member-profile',
  'moi-local-official-detail',
  'legislative-yuan',
  'cec-election-bulletin',
  'government-record',
  'university-record',
  'candidate-official-site',
  'candidate-social-profile',
  'political-party-site',
  'reputable-news',
  'wikipedia-reference',
] as const;
const bySourceClass = Object.fromEntries(
  sourceClasses.map((sourceClass) => [
    sourceClass,
    claims.filter((claim) => claim.evidence.sourceClass === sourceClass).length,
  ]),
) as Record<(typeof sourceClasses)[number], number>;
const byDistrict = Object.fromEntries(
  [...new Set(candidates.map((candidate) => candidate.districtId))].map(
    (districtId) => [
      districtId,
      claims.filter(
        (claim) =>
          candidates.find(
            (candidate) => candidate.candidateId === claim.candidateId,
          )?.districtId === districtId,
      ).length,
    ],
  ),
);

const input: BasicProfilePublicationInput = {
  datasetId: BASIC_PROFILE_DATASET_ID,
  schemaVersion: '1',
  policyVersion: BASIC_PROFILE_POLICY_VERSION,
  policyName: BASIC_PROFILE_POLICY_NAME,
  snapshotDate: '2026-11-12',
  generatedAt: isoNow(),
  note: '本區基本資料僅收錄通過獨立查核（候選人以外的第二個代理，重新開啟來源核對）的項目，並標示機構紀錄、候選人自行填列或獨立佐證。獨立查核不是人工編輯核准，也不代表所有欄位皆已完整；未通過查核的資料留在研究層，不公開呈現。',
  claims,
  candidates,
  summary: {
    candidateCount: candidates.length,
    candidatesWithPublishedClaims: candidates.filter(
      (candidate) => candidate.claimCount > 0,
    ).length,
    publishedClaimCount: claims.length,
    byField,
    bySourceClass,
    byDistrict,
  },
};
const checksum = sha256(JSON.stringify(input));
const publication = BasicProfilePublicationSchema.parse({ ...input, checksum });
writeJson(publicationPath, publication);
console.log(
  `Published ${claims.length} claims for ${publication.summary.candidatesWithPublishedClaims}/${candidates.length} candidates → ${publicationPath}`,
);
void join;
