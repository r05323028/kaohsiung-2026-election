import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  BASIC_PROFILE_FIELDS,
  BASIC_PROFILE_POLICY_VERSION,
  type BasicProfileField,
} from '../../src/data/basic-profiles/schema';
import {
  type ResearcherBatch,
  ResearcherBatchSchema,
  VerifierBatchSchema,
} from './batch-schema';
import {
  candidateById,
  candidates,
  districtById,
  isoNow,
  normalizedPath,
  readJson,
  researcherDir,
  sha256,
  sortedCandidates,
  verifierDir,
  writeJson,
} from './lib';

type Disposition =
  | 'publication-eligible'
  | 'identity-unresolved'
  | 'verification-pending'
  | 'blocked-verdict'
  | 'blocked-policy'
  | 'blocked-checks';

type MergedClaim = {
  claimId: string;
  candidateId: string;
  field: BasicProfileField;
  value: string;
  detail: string | null;
  organization: string | null;
  validFrom: string | null;
  validTo: string | null;
  currentStatus: 'current' | 'historical' | 'unknown';
  attribution:
    | 'institutional-record'
    | 'candidate-statement'
    | 'independently-corroborated';
  source: Record<string, unknown>;
  verification: {
    decisionId: string;
    verdict: string;
    verifiedAt: string;
    verifierRunId: string;
    rationale: string;
    checks: Record<string, boolean>;
  } | null;
  disposition: Disposition;
  dispositionReason: string | null;
};

function readDir(dir: string): Array<Record<string, unknown>> {
  try {
    return readdirSync(dir)
      .filter((file) => /^batch-\d{2}\.json$/.test(file))
      .sort()
      .map((file) => readJson<Record<string, unknown>>(join(dir, file)));
  } catch {
    return [];
  }
}

const researcherBatches = readDir(researcherDir).map((batch) => {
  const parsed = ResearcherBatchSchema.safeParse(batch);
  if (!parsed.success) {
    throw new Error(`Invalid researcher batch: ${parsed.error.message}`);
  }
  return parsed.data;
});
const verifierBatches = readDir(verifierDir).map((batch) => {
  const parsed = VerifierBatchSchema.safeParse(batch);
  if (!parsed.success) {
    throw new Error(`Invalid verifier batch: ${parsed.error.message}`);
  }
  return parsed.data;
});

const decisions = new Map(
  verifierBatches
    .flatMap((batch) => batch.decisions)
    .map((decision) => [decision.claimId, decision]),
);
const entriesByCandidate = new Map(
  researcherBatches
    .flatMap((batch) => batch.candidates)
    .map((entry) => [entry.candidateId, entry]),
);

const privatePattern =
  /(09\d{8}|\d{2,4}-\d{6,8}|住址|戶籍|身分證|護照|電子郵件|@[a-z0-9.-]+\.[a-z]{2,})/iu;

const selfReportedSourceClasses = new Set([
  'cec-election-bulletin',
  'kcc-member-profile',
  'candidate-official-site',
  'candidate-social-profile',
]);

const effectiveAttribution = (
  claim: ResearcherBatch['candidates'][number]['claims'][number],
): typeof claim.attribution => {
  if (
    selfReportedSourceClasses.has(claim.source.sourceClass) &&
    claim.field !== 'current-position'
  ) {
    return 'candidate-statement';
  }
  return claim.attribution;
};

const mergedByCandidate = new Map<string, MergedClaim[]>();
for (const entry of entriesByCandidate.values()) {
  const claims: MergedClaim[] = [];
  for (const claim of entry.claims) {
    const decision = decisions.get(claim.claimId);
    let disposition: Disposition = 'verification-pending';
    let reason: string | null = 'No independent verifier decision exists yet.';
    if (entry.identityStatus !== 'resolved') {
      disposition = 'identity-unresolved';
      reason =
        'Candidate identity is not resolved by at least two independent signals.';
    } else if (decision) {
      const checksPass =
        decision.reopenedEvidence.accessible &&
        decision.reopenedEvidence.matchesClaim &&
        decision.checks.identityMatch &&
        decision.checks.supportsField &&
        decision.checks.dateConsistent &&
        decision.checks.currentStatusCorrect;
      if (decision.verdict !== 'verified') {
        disposition = 'blocked-verdict';
        reason = `Verifier verdict: ${decision.verdict}. ${decision.rationale}`;
      } else if (!checksPass) {
        disposition = 'blocked-checks';
        reason =
          'Verifier marked the claim verified but one or more checks failed.';
      } else if (
        claim.source.sourceClass === 'wikipedia-reference' ||
        claim.source.sourceClass === 'candidate-social-profile'
      ) {
        disposition = 'blocked-policy';
        reason =
          'Source class is not sufficient for publication under policy v1.';
      } else if (
        claim.field === 'current-position' &&
        claim.attribution === 'candidate-statement'
      ) {
        disposition = 'blocked-policy';
        reason =
          'Current-position claims require institutional or corroborated evidence.';
      } else if (
        claim.field === 'current-position' &&
        claim.currentStatus === 'historical' &&
        claim.validTo === null
      ) {
        disposition = 'blocked-policy';
        reason = 'A historical current-position claim needs an end date.';
      } else if (
        privatePattern.test(claim.value) ||
        privatePattern.test(claim.detail ?? '') ||
        privatePattern.test(claim.source.excerpt)
      ) {
        disposition = 'blocked-policy';
        reason = 'Claim contains apparent private contact information.';
      } else {
        disposition = 'publication-eligible';
        reason = null;
      }
    }
    claims.push({
      claimId: claim.claimId,
      candidateId: claim.candidateId,
      field: claim.field,
      value: claim.value,
      detail: claim.detail,
      organization: claim.organization,
      validFrom: claim.validFrom,
      validTo: claim.validTo,
      currentStatus: claim.currentStatus,
      attribution: effectiveAttribution(claim),
      source: claim.source,
      verification: decision
        ? {
            decisionId: decision.decisionId,
            verdict: decision.verdict,
            verifiedAt: decision.reopenedEvidence.retrievedAt,
            verifierRunId: `verifier-${verifierBatches.find((batch) => batch.decisions.some((item) => item.claimId === claim.claimId))?.batchId ?? 'unknown'}`,
            rationale: decision.rationale,
            checks: decision.checks,
          }
        : null,
      disposition,
      dispositionReason: reason,
    });
  }
  mergedByCandidate.set(entry.candidateId, claims);
}

const ordered = sortedCandidates();
const candidateRecords = ordered.map((candidate) => {
  const district = districtById.get(candidate.districtId);
  if (!district) throw new Error(`Unknown district: ${candidate.districtId}`);
  const entry = entriesByCandidate.get(candidate.id);
  const claims = mergedByCandidate.get(candidate.id) ?? [];
  const publishedClaims = claims.filter(
    (claim) => claim.disposition === 'publication-eligible',
  );
  const decidedClaims = claims.filter((claim) => claim.verification !== null);
  const verificationStatus =
    claims.length === 0
      ? 'not-applicable'
      : decidedClaims.length === claims.length
        ? 'verification-completed'
        : decidedClaims.length > 0
          ? 'verification-in-progress'
          : 'verification-pending';
  const finalStatus =
    publishedClaims.length > 0
      ? 'publication-eligible'
      : claims.length === 0
        ? 'research-completed-no-claims'
        : decidedClaims.length === claims.length
          ? 'publication-blocked'
          : 'verification-pending';
  const fieldStatus = Object.fromEntries(
    BASIC_PROFILE_FIELDS.map((field) => {
      const fieldClaims = claims.filter((claim) => claim.field === field);
      if (
        fieldClaims.some(
          (claim) => claim.disposition === 'publication-eligible',
        )
      ) {
        return [field, 'published'];
      }
      if (
        fieldClaims.some(
          (claim) => claim.disposition === 'verification-pending',
        )
      ) {
        return [field, 'verification-pending'];
      }
      if (fieldClaims.length > 0) return [field, 'blocked'];
      return [field, 'no-evidence'];
    }),
  );
  return {
    candidateId: candidate.id,
    displayName: candidate.displayName,
    districtId: candidate.districtId,
    districtLabel: district.name,
    electionType: candidate.electionType,
    identityStatus: entry?.identityStatus ?? 'not-researched',
    researchStatus: entry?.status ?? 'not-started',
    identitySignals: entry?.identitySignals ?? [],
    fieldStatus,
    gaps: entry?.gaps ?? [],
    notes: entry?.notes ?? null,
    verificationStatus,
    finalStatus,
    claims,
    publishedClaimCount: publishedClaims.length,
  };
});

const summary = {
  candidateCount: candidateRecords.length,
  researchedCandidates: candidateRecords.filter(
    (record) => record.researchStatus !== 'not-started',
  ).length,
  candidatesWithClaims: candidateRecords.filter(
    (record) => record.claims.length > 0,
  ).length,
  candidatesWithPublishedClaims: candidateRecords.filter(
    (record) => record.publishedClaimCount > 0,
  ).length,
  claimCount: candidateRecords.reduce(
    (sum, record) => sum + record.claims.length,
    0,
  ),
  publishedClaimCount: candidateRecords.reduce(
    (sum, record) => sum + record.publishedClaimCount,
    0,
  ),
  blockedClaimCount: candidateRecords.reduce(
    (sum, record) =>
      sum +
      record.claims.filter(
        (claim) => claim.disposition !== 'publication-eligible',
      ).length,
    0,
  ),
  byField: Object.fromEntries(
    BASIC_PROFILE_FIELDS.map((field) => [
      field,
      candidateRecords.reduce(
        (sum, record) =>
          sum + record.claims.filter((claim) => claim.field === field).length,
        0,
      ),
    ]),
  ),
  unverifiedCandidates: candidateRecords.filter(
    (record) =>
      record.identityStatus === 'ambiguous' ||
      record.identityStatus === 'conflict',
  ).length,
  verificationCompletedCandidates: candidateRecords.filter(
    (record) => record.verificationStatus === 'verification-completed',
  ).length,
  publicationEligibleCandidates: candidateRecords.filter(
    (record) => record.finalStatus === 'publication-eligible',
  ).length,
  publicationBlockedCandidates: candidateRecords.filter(
    (record) => record.finalStatus === 'publication-blocked',
  ).length,
};

const payload = {
  datasetId: 'kaohsiung-2026-candidate-basic-profiles-research',
  schemaVersion: '1',
  policyVersion: BASIC_PROFILE_POLICY_VERSION,
  generatedAt: isoNow(),
  note: 'Merged researcher output and independent verifier decisions. Publication eligibility is a policy decision, not human editorial approval. Wikipedia and candidate social profiles cannot be sole evidence.',
  batchFiles: {
    researcher: researcherBatches.map((batch) => batch.batchId),
    verifier: verifierBatches.map((batch) => batch.batchId),
  },
  candidates: candidateRecords,
  summary,
};
writeJson(normalizedPath, {
  ...payload,
  checksum: sha256(JSON.stringify(payload)),
});
console.log(
  `Merged ${researcherBatches.length} researcher and ${verifierBatches.length} verifier batches: ${summary.claimCount} claims, ${summary.publishedClaimCount} publication-eligible, ${summary.blockedClaimCount} blocked/pending.`,
);
void candidates;
void candidateById;
