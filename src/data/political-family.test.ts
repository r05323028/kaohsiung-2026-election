import { describe, expect, it } from 'vitest';
import { candidateProfiles, getCandidateProfile } from './index';
import {
  getPoliticalFamilyReadModel,
  politicalFamilyPublication,
} from './political-family';
import { toPublicCandidateProfile } from './view';

describe('political family publication', () => {
  it('provides one explicit public research result for every canonical candidate', () => {
    const candidateIds = candidateProfiles.map(
      (candidate) => candidate.candidacy.id,
    );
    expect(new Set(candidateIds).size).toBe(candidateIds.length);
    expect(politicalFamilyPublication.candidates).toHaveLength(
      candidateProfiles.length,
    );
    for (const candidateId of candidateIds) {
      const readModel = getPoliticalFamilyReadModel(candidateId);
      expect(readModel).toBeDefined();
      expect(readModel?.researchStatus).toMatch(
        /^(verified-relations-found|searched-no-verified-relations|unresolved)$/,
      );
    }
  });

  it('publishes only source-backed, connected relationships and deduplicates people', () => {
    const peopleIds = politicalFamilyPublication.people.map(
      (person) => person.id,
    );
    expect(new Set(peopleIds).size).toBe(peopleIds.length);
    const sourceIds = new Set(
      politicalFamilyPublication.sources.map((source) => source.id),
    );
    for (const relationship of politicalFamilyPublication.relationships) {
      expect(relationship.verificationStatus).toBe('verified');
      expect(relationship.personAId).not.toBe(relationship.personBId);
      expect(relationship.sourceIds.length).toBeGreaterThan(0);
      expect(
        relationship.sourceIds.every((sourceId) => sourceIds.has(sourceId)),
      ).toBe(true);
      expect(relationship.kinshipSourceIds.length).toBeGreaterThan(0);
      expect(relationship.careerSourceIds.length).toBeGreaterThan(0);
    }
  });

  it('keeps workflow verification metadata out of the public profile payload', () => {
    const publicProfiles = candidateProfiles.map((candidate) =>
      toPublicCandidateProfile(candidate),
    );
    const serialized = JSON.stringify(publicProfiles);
    expect(serialized).not.toContain('verificationStatus');
    expect(serialized).not.toContain('supportedClaimIds');
    expect(serialized).not.toContain('pending-review');
  });

  it('renders a neutral empty state for a researched candidate without a relation', () => {
    const emptyCandidate = candidateProfiles.find(
      (candidate) =>
        getPoliticalFamilyReadModel(candidate.candidacy.id)?.relationships
          .length === 0,
    );
    expect(emptyCandidate).toBeDefined();
    const readModel = getPoliticalFamilyReadModel(
      emptyCandidate?.candidacy.id ?? '',
    );
    expect(readModel?.note).toBe('尚無可核實的公開家族從政資料。');
    expect(readModel?.relationships).toEqual([]);
  });

  it('joins family data by the stable candidate ID rather than display name', () => {
    const candidate = getCandidateProfile('ke-zhi-en-2026');
    expect(candidate?.candidacy.id).toBeTruthy();
    expect(candidate?.politicalFamily?.relationships.length).toBeGreaterThan(0);
    expect(
      candidate?.politicalFamily?.people.some(
        (person) => person.displayName === '柯文福',
      ),
    ).toBe(true);
  });
});
