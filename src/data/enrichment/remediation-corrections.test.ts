import { describe, expect, it } from 'vitest';
import remediated from '../../../data/enrichment/remediated/2026/zuoying-mayoral-remediated.json';
import publication from '../../../data/published/2026/zuoying-mayoral-automated-v2.json';
import corrections from '../../../reports/autonomous-remediation-corrections.json';

type CorrectedClaim = {
  claimId: string;
  originalValue: string;
  value: string;
  correctionId: string;
  correctionKind: string;
  publicationStatus: string;
  publicationEligibilityAfterCorrection: {
    eligible: boolean;
    reasons: string[];
  };
  freshReview: {
    status: string;
    invocationIds: string[];
    verdicts: string[];
    identityAssessments: string[];
    materialConcerns: string[];
    reasons: string[];
  };
  lineage: {
    originalClaimSha256: string;
    correctedClaimSha256: string;
    derivedFrom: string;
    derivedAt: string;
  };
};
type Correction = (typeof remediated.corrections)[number];

const claims = remediated.claims as unknown as CorrectedClaim[];
const entries: Correction[] = remediated.corrections;
const publishedClaimIds = new Set(
  publication.records.map((record) => record.claimId),
);

const APPLIED_KINDS = new Set([
  'district-strip',
  'chrome-segment',
  'proposal-literal',
  'metadata-date',
]);

describe('remediation corrections', () => {
  it('accounts for all 25 correction targets', () => {
    expect(entries).toHaveLength(25);
    expect(corrections.summary.targets).toBe(25);
  });

  it('records an explicit disposition for every target', () => {
    const dispositions = new Map<string, number>();
    for (const entry of entries) {
      dispositions.set(
        entry.disposition,
        (dispositions.get(entry.disposition) ?? 0) + 1,
      );
    }
    expect(dispositions.get('applied')).toBe(12);
    expect(dispositions.get('rejected')).toBe(5);
    expect(dispositions.get('requires-more-evidence')).toBe(7);
    expect(dispositions.get('blocked')).toBe(1);
    for (const entry of entries) {
      expect(entry.dispositionReason.length).toBeGreaterThan(20);
    }
  });

  it('keeps the wrong-identity claim excluded instead of relinking it', () => {
    const wrongSubject = entries.find(
      (entry) => entry.claimId === 'enrich-claim-0111',
    );
    expect(wrongSubject).toBeDefined();
    expect(wrongSubject?.disposition).toBe('blocked');
    expect(wrongSubject?.dispositionReason).toMatch(/identity|wrong|subject/iu);
    expect(claims.some((claim) => claim.claimId === 'enrich-claim-0111')).toBe(
      false,
    );
    expect(publishedClaimIds.has('enrich-claim-0111')).toBe(false);
  });

  it('derives corrected claims from literal source text only', () => {
    expect(claims).toHaveLength(corrections.summary.applied);
    for (const claim of claims) {
      expect(claim.originalValue).not.toBe(claim.value);
      expect(claim.value.length).toBeGreaterThan(1);
      expect(APPLIED_KINDS.has(claim.correctionKind)).toBe(true);
      expect(claim.value).not.toMatch(
        /請繼續往下閱讀|立即加入|即時 要聞|-->|<script/iu,
      );
    }
  });

  it('preserves lineage and never inherits approval', () => {
    for (const claim of claims) {
      const entry = entries.find(
        (candidate) => candidate.claimId === claim.claimId,
      );
      expect(entry?.disposition).toBe('applied');
      expect(claim.correctionId).toBe(entry?.correctionId);
      expect(claim.publicationStatus).toBe('withheld-pending-review');
      expect(entry?.lineage.originalClaimSha256).not.toBe(
        entry?.lineage.correctedClaimSha256,
      );
      expect(entry?.lineage.derivedFrom).toBe(
        'data/enrichment/normalized/2026/zuoying-mayoral.json',
      );
      expect(claim.publicationEligibilityAfterCorrection.eligible).toBe(false);
      expect(claim.freshReview.invocationIds).toHaveLength(2);
      expect(publishedClaimIds.has(claim.claimId)).toBe(false);
    }
  });

  it('reviewed every applied correction with two independent roles', () => {
    const invocations = new Set(
      claims.flatMap((claim) => claim.freshReview.invocationIds),
    );
    for (const claim of claims) {
      expect(claim.freshReview.status).toBe('verified');
      expect(
        claim.freshReview.verdicts.every((verdict) => verdict === 'supported'),
      ).toBe(true);
      expect(
        claim.freshReview.identityAssessments.every(
          (value) => value === 'confirmed',
        ),
      ).toBe(true);
      expect(claim.freshReview.materialConcerns).toEqual([]);
    }
    expect(invocations.size).toBe(claims.length * 2);
  });

  it('reports that no correction creates publication eligibility', () => {
    expect(corrections.summary.publicationEligibleAfterCorrection).toBe(0);
    expect(remediated.summary.published).toBe(0);
  });

  it('withdraws corrections that failed fresh review', () => {
    const rejected = entries.filter(
      (entry) => entry.disposition === 'rejected',
    );
    expect(rejected).toHaveLength(corrections.summary.rejected);
    for (const entry of rejected) {
      // The withdrawn wording stays on the record for audit; what must not happen is
      // the corrected claim being presented as reviewed evidence.
      expect(claims.some((claim) => claim.claimId === entry.claimId)).toBe(
        false,
      );
      expect(
        entry.freshReview.materialConcerns.length +
          entry.freshReview.reasons.length,
      ).toBeGreaterThan(0);
      expect(entry.dispositionReason.length).toBeGreaterThan(20);
    }
  });
});
