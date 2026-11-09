import type { BiographyReadModel } from './biographies';
import type { AutomatedCandidateReadModel } from './enrichment/automated-publication';
import type { CandidatePolicyResearchSummary } from './policy-research';
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
  district: Omit<ElectoralDistrict, 'isDemo'> & { isDemo?: boolean };
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
  publicRecordResearch?: CandidatePublicRecordResearchSummary;
  biography?: BiographyReadModel;
  automatedPublication?: AutomatedCandidateReadModel;
  visual: Omit<CharacterVisualConfig, 'isDemo'> & { isDemo?: boolean };
};

export type DistrictView = CandidateProfileView['district'];

export function isDemoProfile(candidate: CandidateProfileView): boolean {
  return (
    candidate.person.isDemo === true ||
    candidate.candidacy.publicationStatus === 'demo'
  );
}
