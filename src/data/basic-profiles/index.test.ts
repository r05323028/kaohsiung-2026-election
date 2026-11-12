import { describe, expect, it } from 'vitest';
import { officialCandidateProfiles } from '../official';
import { basicProfilePublication, getBasicProfileReadModel } from './index';
import { BASIC_PROFILE_FIELDS } from './schema';

describe('published basic profiles', () => {
  it('covers exactly the 106 canonical candidates without duplicates', () => {
    const roster = officialCandidateProfiles.map(
      (candidate) => candidate.candidacy.id,
    );
    const covered = basicProfilePublication.candidates.map(
      (candidate) => candidate.candidateId,
    );
    expect(roster).toHaveLength(106);
    expect(covered).toHaveLength(106);
    expect(new Set(covered).size).toBe(106);
    expect(new Set(covered)).toEqual(new Set(roster));
  });

  it('publishes only verified, harvestable claims with public source metadata', () => {
    for (const claim of basicProfilePublication.claims) {
      expect(claim.verification.verdict).toBe('verified');
      expect(claim.evidence.url.startsWith('https://')).toBe(true);
      expect(claim.evidence.publisher.length).toBeGreaterThan(0);
      expect(claim.evidence.excerpt.length).toBeGreaterThanOrEqual(10);
      expect(claim.evidence.sourceClass).not.toBe('wikipedia-reference');
      expect(BASIC_PROFILE_FIELDS).toContain(claim.field);
      expect(claim.detail ?? '').not.toMatch(
        /\b(?:09\d{2}-?\d{3}-?\d{3}|0\d-\d{7,8}|\d{2,4}-\d{6,8})\b|住址|戶籍|身分證|護照|電子郵件|@[a-z0-9.-]+\.[a-z]{2,}/iu,
      );
    }
  });

  it('exposes a read model only for candidates with published claims', () => {
    for (const candidate of officialCandidateProfiles) {
      const model = getBasicProfileReadModel(candidate.candidacy.id);
      if (model) {
        expect(model.claims.length).toBeGreaterThan(0);
        expect(model.note).toContain('獨立查核');
        for (const claim of model.claims) {
          expect(claim.candidateId).toBe(candidate.candidacy.id);
          expect(claim).not.toHaveProperty('verification');
          expect(claim).not.toHaveProperty('disposition');
          expect(claim.evidence).not.toHaveProperty('excerpt');
          expect(claim.evidence).not.toHaveProperty('snapshotSha256');
        }
      }
    }
  });

  it('reports summary counts that match the claims and coverage rows', () => {
    const summary = basicProfilePublication.summary;
    expect(summary.candidateCount).toBe(106);
    expect(summary.publishedClaimCount).toBe(
      basicProfilePublication.claims.length,
    );
    expect(summary.candidatesWithPublishedClaims).toBe(
      basicProfilePublication.candidates.filter(
        (candidate) => candidate.claimCount > 0,
      ).length,
    );
    const fieldTotal = Object.values(summary.byField).reduce(
      (total, count) => total + count,
      0,
    );
    expect(fieldTotal).toBe(summary.publishedClaimCount);
  });
});
