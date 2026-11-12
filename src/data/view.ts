import type { BasicProfileReadModel } from './basic-profiles';
import type { BiographyReadModel } from './biographies';
import type { CouncilConstituencyCoverage } from './constituencies';
import type {
  AutomatedPublicClaim,
  AutomatedPublicSource,
} from './enrichment/automated-publication';
import { isPublishedBallotNumberStatus } from './official/ballot';
import type { CandidatePolicyResearchSummary } from './policy-research';
import type { PublishedPolicy } from './policy-research/published-schema';
import type { PoliticalFamilyReadModel } from './political-family';
import type { CandidatePublicRecordResearchSummary } from './public-records/enrichment-summary';
import type { CandidateResearchSummary } from './public-records/research-index';
import type { PublicRecordBundle } from './public-records/schema';
import type {
  Candidacy,
  CharacterVisualConfig,
  ElectoralDistrict,
  EvidenceSource,
  NewsArticle,
  Person,
  PersonRelationship,
  Policy,
  Position,
  PublicRecord,
  TimelineEvent,
} from './schema';

export type DistrictView = Omit<ElectoralDistrict, 'isDemo'> & {
  isDemo?: boolean;
  constituencyCoverage?: CouncilConstituencyCoverage;
};

export type CandidateProfileView = {
  person: Omit<Person, 'isDemo'> & { isDemo?: boolean };
  candidacy: Omit<Candidacy, 'isDemo'> & {
    isDemo?: boolean;
    candidateNumberStatus?: 'drawn' | 'final' | 'not-published';
    publicationStatus?: 'approved' | 'pending-review' | 'unavailable' | 'demo';
    partyStatus?: 'published' | 'not-published' | 'unavailable';
    birthDate?: string;
    cecDirectoryName?: string;
  };
  district: DistrictView;
  positions: Array<Omit<Position, 'isDemo'> & { isDemo?: boolean }>;
  policies: Array<Omit<Policy, 'isDemo'> & { isDemo?: boolean }>;
  records: Array<Omit<PublicRecord, 'isDemo'> & { isDemo?: boolean }>;
  news: Array<Omit<NewsArticle, 'isDemo'> & { isDemo?: boolean }>;
  relationships: Array<
    Omit<PersonRelationship, 'isDemo'> & { isDemo?: boolean }
  >;
  timeline: Array<Omit<TimelineEvent, 'isDemo'> & { isDemo?: boolean }>;
  sources: Array<Omit<EvidenceSource, 'isDemo'> & { isDemo?: boolean }>;
  publicRecords?: PublicRecordBundle;
  research?: CandidateResearchSummary;
  policyResearch?: CandidatePolicyResearchSummary;
  publishedPolicies?: PublishedPolicy[];
  publicRecordResearch?: CandidatePublicRecordResearchSummary;
  biography?: BiographyReadModel;
  basicProfile?: BasicProfileReadModel;
  politicalFamily?: PoliticalFamilyReadModel;
  automatedPublication?: {
    status: 'published' | 'none';
    claims: AutomatedPublicClaim[];
    sources: AutomatedPublicSource[];
    note: string;
  };
  visual: Omit<CharacterVisualConfig, 'isDemo'> & { isDemo?: boolean };
};

type PublicSource = Pick<
  CandidateProfileView['sources'][number],
  'id' | 'url' | 'publisher' | 'publicationDate'
>;
type PublicRecordClaim = Pick<
  PublicRecordBundle['claims'][number],
  'claimId' | 'attribution' | 'evidenceIds'
>;
type PublicRecordEvidence = Pick<
  PublicRecordBundle['evidence'][number],
  'evidenceId' | 'sourceId' | 'documentLocation' | 'quotedText'
>;
type PublicPositionRecord = Pick<
  PublicRecordBundle['positions'][number],
  | 'id'
  | 'title'
  | 'organization'
  | 'startDate'
  | 'endDate'
  | 'currentStatus'
  | 'claimIds'
  | 'evidenceIds'
>;
type PublicPolicyRecord = Pick<
  PublicRecordBundle['policies'][number],
  | 'id'
  | 'electionYear'
  | 'title'
  | 'category'
  | 'originalStatement'
  | 'neutralSummary'
  | 'publicationDate'
  | 'attribution'
  | 'policyContext'
  | 'policyStatus'
  | 'geographicScope'
  | 'claimIds'
  | 'evidenceIds'
>;
type PublicActivityRecord = Pick<
  PublicRecordBundle['activities'][number],
  | 'id'
  | 'activityType'
  | 'title'
  | 'eventDate'
  | 'organization'
  | 'role'
  | 'description'
  | 'documentedOutcome'
  | 'attribution'
  | 'claimIds'
  | 'evidenceIds'
>;
type PublicNewsRecord = Pick<
  PublicRecordBundle['news'][number],
  | 'id'
  | 'headline'
  | 'publisher'
  | 'originalUrl'
  | 'publicationDate'
  | 'eventDate'
  | 'latestStatus'
  | 'topicTags'
  | 'editorialSummary'
  | 'contentType'
  | 'claimIds'
  | 'evidenceIds'
>;
type PublicRecordsView = {
  personId: string;
  claims: PublicRecordClaim[];
  evidence: PublicRecordEvidence[];
  positions: PublicPositionRecord[];
  policies: PublicPolicyRecord[];
  activities: PublicActivityRecord[];
  news: PublicNewsRecord[];
};
type PublicBiographyClaim = Pick<
  BiographyReadModel['claims'][number],
  | 'claimId'
  | 'claimType'
  | 'title'
  | 'organization'
  | 'value'
  | 'validFrom'
  | 'sourceIds'
>;
type PublicAutomatedClaim = Pick<
  AutomatedPublicClaim,
  | 'claimId'
  | 'category'
  | 'claimType'
  | 'title'
  | 'organization'
  | 'value'
  | 'sourcePublicationDate'
  | 'sourceIds'
>;
type PublicAutomatedSource = Pick<
  AutomatedPublicSource,
  'sourceId' | 'url' | 'publisher' | 'publicationDate'
>;

export type PublicCandidateProfile = Omit<
  CandidateProfileView,
  | 'person'
  | 'candidacy'
  | 'district'
  | 'sources'
  | 'publicRecords'
  | 'research'
  | 'policyResearch'
  | 'publishedPolicies'
  | 'publicRecordResearch'
  | 'biography'
  | 'basicProfile'
  | 'automatedPublication'
> & {
  person: CandidateProfileView['person'];
  candidacy: Omit<
    CandidateProfileView['candidacy'],
    'partyStatus' | 'publicationStatus'
  >;
  district: CandidateProfileView['district'];
  sources: PublicSource[];
  publicRecords?: PublicRecordsView;
  publishedPolicies?: PublishedPolicy[];
  biography?: { claims: PublicBiographyClaim[] };
  basicProfile?: Pick<BasicProfileReadModel, 'claims' | 'note'>;
  automatedPublication?: {
    claims: PublicAutomatedClaim[];
    sources: PublicAutomatedSource[];
  };
};

function officeLabelFor(candidate: CandidateProfileView): string {
  return candidate.candidacy.electionType === 'mayoral'
    ? '高雄市長'
    : candidate.candidacy.electionType === 'indigenous-council'
      ? '原住民族區域／平地原住民議員'
      : '高雄市議員';
}

export function toPublicCandidateProfile(
  candidate: CandidateProfileView,
  options: { summary?: string } = {},
): PublicCandidateProfile {
  const isDemo =
    candidate.person.isDemo === true || candidate.candidacy.isDemo === true;
  const {
    partyStatus: _partyStatus,
    publicationStatus: _publicationStatus,
    ...candidacyFields
  } = candidate.candidacy;
  void _partyStatus;
  void _publicationStatus;

  const publicCandidacy: PublicCandidateProfile['candidacy'] = {
    ...candidacyFields,
    politicalParty:
      candidate.candidacy.partyStatus === 'published'
        ? candidate.candidacy.politicalParty
        : '暫無資料',
    candidateNumber: isPublishedBallotNumberStatus(
      candidate.candidacy.candidateNumberStatus,
    )
      ? candidate.candidacy.candidateNumber
      : '',
    candidateNumberStatus:
      candidate.candidacy.candidateNumberStatus ?? 'not-published',
  };

  const publicRecords = candidate.publicRecords
    ? {
        personId: candidate.publicRecords.personId,
        claims: candidate.publicRecords.claims.map((claim) => ({
          claimId: claim.claimId,
          attribution: claim.attribution,
          evidenceIds: claim.evidenceIds,
        })),
        evidence: candidate.publicRecords.evidence.map((evidence) => ({
          evidenceId: evidence.evidenceId,
          sourceId: evidence.sourceId,
          documentLocation: evidence.documentLocation,
          quotedText: evidence.quotedText,
        })),
        positions: candidate.publicRecords.positions.map((position) => ({
          id: position.id,
          title: position.title,
          organization: position.organization,
          startDate: position.startDate,
          endDate: position.endDate,
          currentStatus: position.currentStatus,
          claimIds: position.claimIds,
          evidenceIds: position.evidenceIds,
        })),
        policies: candidate.publicRecords.policies.map((policy) => ({
          id: policy.id,
          electionYear: policy.electionYear,
          title: policy.title,
          category: policy.category,
          originalStatement: policy.originalStatement,
          neutralSummary: policy.neutralSummary,
          publicationDate: policy.publicationDate,
          attribution: policy.attribution,
          policyContext: policy.policyContext,
          policyStatus: policy.policyStatus,
          geographicScope: policy.geographicScope,
          claimIds: policy.claimIds,
          evidenceIds: policy.evidenceIds,
        })),
        activities: candidate.publicRecords.activities.map((activity) => ({
          id: activity.id,
          activityType: activity.activityType,
          title: activity.title,
          eventDate: activity.eventDate,
          organization: activity.organization,
          role: activity.role,
          description: activity.description,
          documentedOutcome: activity.documentedOutcome,
          attribution: activity.attribution,
          claimIds: activity.claimIds,
          evidenceIds: activity.evidenceIds,
        })),
        news: candidate.publicRecords.news.map((article) => ({
          id: article.id,
          headline: article.headline,
          publisher: article.publisher,
          originalUrl: article.originalUrl,
          publicationDate: article.publicationDate,
          eventDate: article.eventDate,
          latestStatus: article.latestStatus,
          topicTags: article.topicTags,
          editorialSummary: article.editorialSummary,
          contentType: article.contentType,
          claimIds: article.claimIds,
          evidenceIds: article.evidenceIds,
        })),
      }
    : undefined;

  const publicBiography = candidate.biography
    ? {
        claims: candidate.biography.claims.map((claim) => ({
          claimId: claim.claimId,
          claimType: claim.claimType,
          title: claim.title,
          organization: claim.organization,
          value: claim.value,
          validFrom: claim.validFrom,
          sourceIds: claim.sourceIds,
        })),
      }
    : undefined;

  const publicBasicProfile = candidate.basicProfile;

  const publicAutomatedPublication = candidate.automatedPublication
    ? {
        claims: candidate.automatedPublication.claims.map((claim) => ({
          claimId: claim.claimId,
          category: claim.category,
          claimType: claim.claimType,
          title: claim.title,
          organization: claim.organization,
          value: claim.value,
          sourcePublicationDate: claim.sourcePublicationDate,
          sourceIds: claim.sourceIds,
        })),
        sources: candidate.automatedPublication.sources.map((source) => ({
          sourceId: source.sourceId,
          url: source.url,
          publisher: source.publisher,
          publicationDate: source.publicationDate,
        })),
      }
    : undefined;

  const publicSummary =
    options.summary ??
    (isDemo
      ? candidate.person.summary
      : officeLabelFor(candidate) + '，參選' + candidate.district.name + '。');
  const publicDistrict = isDemo
    ? candidate.district
    : { ...candidate.district, description: '', scopeNote: '' };

  return {
    person: { ...candidate.person, summary: publicSummary },
    candidacy: publicCandidacy,
    district: publicDistrict,
    positions: candidate.positions,
    policies: candidate.policies,
    records: candidate.records,
    news: candidate.news,
    relationships: candidate.relationships,
    timeline: candidate.timeline,
    sources: candidate.sources.map((source) => ({
      id: source.id,
      url: source.url,
      publisher: source.publisher,
      publicationDate: source.publicationDate,
    })),
    ...(publicRecords ? { publicRecords } : {}),
    ...(candidate.publishedPolicies
      ? { publishedPolicies: candidate.publishedPolicies }
      : {}),
    ...(publicBiography ? { biography: publicBiography } : {}),
    ...(publicBasicProfile ? { basicProfile: publicBasicProfile } : {}),
    ...(candidate.politicalFamily
      ? { politicalFamily: candidate.politicalFamily }
      : {}),
    ...(publicAutomatedPublication
      ? { automatedPublication: publicAutomatedPublication }
      : {}),
    visual: candidate.visual,
  };
}

export type PublicDistrictView = Pick<
  DistrictView,
  | 'id'
  | 'slug'
  | 'name'
  | 'electionType'
  | 'constituencyType'
  | 'districtLabel'
  | 'isDemo'
  | 'constituencyCoverage'
>;

export function toPublicDistrict(district: DistrictView): PublicDistrictView {
  return {
    id: district.id,
    slug: district.slug,
    name: district.name,
    electionType: district.electionType,
    constituencyType: district.constituencyType,
    districtLabel: district.districtLabel,
    ...(district.isDemo !== undefined ? { isDemo: district.isDemo } : {}),
    ...(district.constituencyCoverage
      ? { constituencyCoverage: district.constituencyCoverage }
      : {}),
  };
}

export function isDemoProfile(
  candidate: Pick<CandidateProfileView, 'person' | 'candidacy'>,
): boolean {
  return (
    candidate.person.isDemo === true || candidate.candidacy.isDemo === true
  );
}
