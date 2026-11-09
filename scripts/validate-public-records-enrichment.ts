import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import approvedRoster from '../data/approved/2026/kaohsiung-election.json';
import publicRecordsInput from '../data/approved/2026/kaohsiung-public-records.json';
import policyResearchInput from '../data/policy-research/2026/full-roster.json';
import enrichmentSummaryInput from '../data/public-records/research-enrichment/2026/summary.json';
import {
  type OfficialDataset,
  validateOfficialDataset,
} from '../src/data/official/schema';
import {
  type PolicyResearchDataset,
  validatePolicyResearchDataset,
} from '../src/data/policy-research/schema';
import {
  type PublicRecordsEnrichmentDataset,
  validatePublicRecordsEnrichmentDataset,
} from '../src/data/public-records/enrichment-schema';
import { validatePublicRecordsEnrichmentSummary } from '../src/data/public-records/enrichment-summary-schema';

const ROOT = resolve('.');
const ENRICHMENT_PATH = resolve(
  ROOT,
  'data/public-records/research-enrichment/2026/full-roster.json',
);

function fail(message: string): never {
  throw new Error(message);
}

function assertCondition(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) fail(message);
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function validateRetainedSources(
  sources: PublicRecordsEnrichmentDataset['sourceSnapshots'],
): number {
  let verified = 0;
  for (const source of sources) {
    if (source.retrievalStatus === 'retrieved') {
      assertCondition(
        source.rawPath !== null &&
          source.byteLength !== null &&
          source.sha256 !== null &&
          source.retrievedAt !== null,
        'Retrieved source ' + source.sourceId + ' lacks retention metadata',
      );
      const path = resolve(ROOT, source.rawPath);
      assertCondition(
        existsSync(path),
        'Retrieved source bytes are missing: ' + path,
      );
      assertCondition(
        statSync(path).size === source.byteLength,
        'Byte length mismatch for ' + source.sourceId,
      );
      assertCondition(
        sha256(path) === source.sha256,
        'SHA-256 mismatch for ' + source.sourceId,
      );
      verified += 1;
    } else if (source.retrievalStatus === 'blocked') {
      assertCondition(
        source.rawPath === null &&
          source.byteLength === null &&
          source.sha256 === null,
        'Blocked source ' + source.sourceId + ' contains retained bytes',
      );
    }
  }
  return verified;
}

function validateSummary(dataset: PublicRecordsEnrichmentDataset): void {
  const summary = validatePublicRecordsEnrichmentSummary(
    enrichmentSummaryInput,
  );
  assertCondition(
    summary.datasetId === dataset.datasetId &&
      summary.snapshotDate === dataset.snapshotDate &&
      summary.researchCutoff === dataset.researchCutoff &&
      summary.candidateCount === dataset.candidateCount,
    'Enrichment summary metadata does not match full dataset',
  );
  const sourceById = new Map(
    dataset.sourceSnapshots.map((source) => [source.sourceId, source]),
  );
  const attemptById = new Map(
    dataset.sourceAttempts.map((attempt) => [attempt.attemptId, attempt]),
  );
  const claimCountByCandidate = new Map<string, number>();
  for (const claim of dataset.claims) {
    claimCountByCandidate.set(
      claim.candidateId,
      (claimCountByCandidate.get(claim.candidateId) ?? 0) + 1,
    );
  }
  const evidenceCountByCandidate = new Map<string, number>();
  for (const evidence of dataset.evidence) {
    evidenceCountByCandidate.set(
      evidence.candidateId,
      (evidenceCountByCandidate.get(evidence.candidateId) ?? 0) + 1,
    );
  }
  for (const audit of dataset.audits) {
    const summaryAudit = summary.audits.find(
      (item) => item.candidateId === audit.candidateId,
    );
    assertCondition(
      summaryAudit !== undefined,
      'Enrichment summary is missing ' + audit.candidateId,
    );
    const attempts = audit.sourceAttemptIds
      .map((attemptId) => attemptById.get(attemptId))
      .filter((attempt) => attempt !== undefined);
    const sources = audit.sourceSnapshotIds
      .map((sourceId) => sourceById.get(sourceId))
      .filter((source) => source !== undefined);
    const pendingPositionCount = audit.positionRecordIds.length;
    const pendingCareerRecordCount = audit.careerRecordIds.length;
    const pendingPolicyReferenceCount = audit.policyReferenceCount;
    const expected = {
      candidateId: audit.candidateId,
      outcome: audit.outcome,
      researchStatus: audit.researchStatus,
      sourceAttemptCount: attempts.length,
      retrievedSourceAttemptCount: attempts.filter(
        (attempt) => attempt.retrievalStatus === 'retrieved',
      ).length,
      retainedSourceCount: sources.filter(
        (source) => source.retrievalStatus === 'retrieved',
      ).length,
      resolvedSourceCount: sources.filter(
        (source) => source.identityStatus === 'resolved',
      ).length,
      pendingClaimCount: claimCountByCandidate.get(audit.candidateId) ?? 0,
      pendingEvidenceCount:
        evidenceCountByCandidate.get(audit.candidateId) ?? 0,
      pendingPositionCount,
      pendingCareerRecordCount,
      pendingPolicyReferenceCount,
      pendingRecordCount:
        pendingPositionCount +
        pendingCareerRecordCount +
        pendingPolicyReferenceCount,
      publishedRecordCount: 0,
      note: audit.note,
    };
    assertCondition(
      JSON.stringify(summaryAudit) === JSON.stringify(expected),
      'Enrichment summary mismatch for ' + audit.candidateId,
    );
  }
}

function validateRoster(
  roster: OfficialDataset,
  dataset: PublicRecordsEnrichmentDataset,
): Map<string, (typeof roster.candidates)[number]> {
  assertCondition(
    roster.candidates.length === 106,
    'Canonical roster must contain 106 candidates',
  );
  assertCondition(
    dataset.audits.length === roster.candidates.length,
    'Enrichment audit count must equal canonical roster count',
  );
  const candidates = new Map(
    roster.candidates.map((candidate) => [candidate.id, candidate]),
  );
  const audits = new Map(
    dataset.audits.map((audit) => [audit.candidateId, audit]),
  );
  assertCondition(
    audits.size === roster.candidates.length,
    'Enrichment audits must have unique candidate IDs',
  );
  for (const candidate of roster.candidates) {
    const audit = audits.get(candidate.id);
    assertCondition(
      audit !== undefined,
      'Missing enrichment audit for ' + candidate.id,
    );
    assertCondition(
      audit.personId === 'person-' + candidate.slug &&
        audit.displayName === candidate.displayName &&
        audit.districtId === candidate.districtId &&
        audit.electionType === candidate.electionType,
      'Audit identity mismatch for ' + candidate.id,
    );
    assertCondition(
      audit.researchStatus === 'completed' &&
        audit.isNegativeEvidence === false &&
        audit.publicationStatus === 'withheld-pending-review',
      'Audit publication gate mismatch for ' + candidate.id,
    );
  }
  return candidates;
}

function validateUpstream(
  policyDataset: PolicyResearchDataset,
  dataset: PublicRecordsEnrichmentDataset,
): void {
  assertCondition(
    dataset.upstreamPolicyResearch.datasetId === policyDataset.datasetId,
    'Upstream policy dataset ID mismatch',
  );
  assertCondition(
    dataset.upstreamPolicyResearch.policyCount ===
      policyDataset.policies.length,
    'Upstream policy count mismatch',
  );
  assertCondition(
    dataset.upstreamPolicyResearch.sourceSnapshotCount ===
      policyDataset.sourceSnapshots.length &&
      dataset.upstreamPolicyResearch.sourceAttemptCount ===
        policyDataset.sourceAttempts.length,
    'Upstream source count mismatch',
  );
  const policySourceIds = new Set(
    policyDataset.sourceSnapshots.map((source) => source.sourceId),
  );
  const policyById = new Map(
    policyDataset.policies.map((policy) => [policy.policyId, policy]),
  );
  assertCondition(
    dataset.policyReferences.length === policyDataset.policies.length,
    'Every upstream policy must have exactly one pending reference',
  );
  for (const reference of dataset.policyReferences) {
    const policy = policyById.get(reference.policyId);
    assertCondition(
      policy !== undefined,
      'Unknown upstream policy reference ' + reference.policyId,
    );
    assertCondition(
      reference.candidateId === policy.candidateId &&
        reference.sourceId === policy.sourceId &&
        reference.evidenceId === policy.evidenceId &&
        reference.policyContext === policy.policyContext &&
        reference.personId.startsWith('person-'),
      'Upstream policy reference mismatch ' + reference.policyId,
    );
    assertCondition(
      policySourceIds.has(reference.sourceId),
      'Policy reference source is not retained ' + reference.sourceId,
    );
    assertCondition(
      reference.verificationStatus === 'machine-validated' &&
        reference.reviewStatus === 'pending-human-review' &&
        reference.publicationStatus === 'withheld-pending-review',
      'Policy reference is not withheld ' + reference.policyId,
    );
  }
}

function validateReferences(
  roster: OfficialDataset,
  dataset: PublicRecordsEnrichmentDataset,
): void {
  const candidateIds = new Set(
    roster.candidates.map((candidate) => candidate.id),
  );
  const sourceIds = new Set(
    dataset.sourceSnapshots.map((source) => source.sourceId),
  );
  const attemptIds = new Set(
    dataset.sourceAttempts.map((attempt) => attempt.attemptId),
  );
  const evidenceById = new Map(
    dataset.evidence.map((evidence) => [evidence.evidenceId, evidence]),
  );
  const claimsById = new Map(
    dataset.claims.map((claim) => [claim.claimId, claim]),
  );
  for (const attempt of dataset.sourceAttempts) {
    assertCondition(
      candidateIds.has(attempt.candidateId),
      'Source attempt has unknown candidate ' + attempt.attemptId,
    );
    assertCondition(
      attempt.personId ===
        'person-' +
          roster.candidates.find(
            (candidate) => candidate.id === attempt.candidateId,
          )?.slug,
      'Source attempt person ID mismatch ' + attempt.attemptId,
    );
    assertCondition(
      attempt.isNegativeEvidence === false,
      'Source attempt is marked as negative evidence ' + attempt.attemptId,
    );
    if (attempt.retrievalStatus === 'retrieved') {
      assertCondition(
        attempt.sourceId !== null &&
          attempt.url !== null &&
          attempt.attemptedAt !== null,
        'Retrieved source attempt lacks source metadata ' + attempt.attemptId,
      );
    }
    if (attempt.sourceId !== null) {
      assertCondition(
        sourceIds.has(attempt.sourceId) ||
          dataset.upstreamPolicyResearch.sourceSnapshots.some(
            (source) => source.sourceId === attempt.sourceId,
          ),
        'Source attempt references unknown source ' + attempt.attemptId,
      );
    }
  }
  for (const claim of dataset.claims) {
    assertCondition(
      candidateIds.has(claim.candidateId) &&
        claim.personId ===
          'person-' +
            roster.candidates.find(
              (candidate) => candidate.id === claim.candidateId,
            )?.slug,
      'Claim identity mismatch ' + claim.claimId,
    );
    assertCondition(
      claim.verificationStatus === 'machine-validated' &&
        claim.reviewStatus === 'pending-human-review' &&
        claim.publicationStatus === 'withheld-pending-review',
      'Claim publication gate mismatch ' + claim.claimId,
    );
    for (const evidenceId of claim.evidenceIds) {
      assertCondition(
        evidenceById.has(evidenceId),
        'Claim references missing evidence ' + claim.claimId,
      );
    }
  }
  for (const evidence of dataset.evidence) {
    const claim = claimsById.get(evidence.claimId);
    assertCondition(
      claim !== undefined &&
        claim.candidateId === evidence.candidateId &&
        claim.personId === evidence.personId &&
        sourceIds.has(evidence.sourceId),
      'Evidence linkage mismatch ' + evidence.evidenceId,
    );
  }
  for (const audit of dataset.audits) {
    for (const attemptId of audit.sourceAttemptIds) {
      assertCondition(
        attemptIds.has(attemptId) ||
          dataset.upstreamPolicyResearch.sourceAttempts.some(
            (attempt) => attempt.attemptId === attemptId,
          ),
        'Audit references missing attempt ' + attemptId,
      );
    }
  }
}

function validatePublications(dataset: PublicRecordsEnrichmentDataset): void {
  assertCondition(
    dataset.review.reviewerId === null &&
      dataset.review.reviewedAt === null &&
      dataset.review.approvedRecordCount === 0 &&
      dataset.review.publishedRecordCount === 0,
    'Enrichment review metadata indicates unpublished data was approved',
  );
  assertCondition(
    dataset.coverageAssertions.individualVoteRecords === 0 &&
      dataset.coverageAssertions.executiveInitiativeRecords === 0 &&
      dataset.coverageAssertions.newsRecordsAdded === 0 &&
      dataset.coverageAssertions.proposalsAdded === 0 &&
      dataset.coverageAssertions.publishedRecords === 0,
    'Enrichment coverage assertions contain unsupported public records',
  );
  const pendingRecords = [
    ...dataset.claims,
    ...dataset.positions,
    ...dataset.careerRecords,
    ...dataset.policyReferences,
  ];
  for (const record of pendingRecords) {
    assertCondition(
      record.verificationStatus === 'machine-validated' &&
        record.reviewStatus === 'pending-human-review' &&
        record.publicationStatus === 'withheld-pending-review',
      'Pending record publication gate mismatch',
    );
  }
}

function loadEnrichment(): PublicRecordsEnrichmentDataset {
  let raw: string;
  try {
    raw = readFileSync(ENRICHMENT_PATH, 'utf8');
  } catch (error) {
    throw new Error(
      'Unable to read enrichment dataset: ' +
        (error instanceof Error ? error.message : String(error)),
    );
  }
  try {
    return validatePublicRecordsEnrichmentDataset(JSON.parse(raw) as unknown);
  } catch (error) {
    throw new Error(
      'Unable to parse or validate enrichment dataset: ' +
        (error instanceof Error ? error.message : String(error)),
    );
  }
}

function main(): void {
  const roster = validateOfficialDataset(approvedRoster);
  const policyDataset = validatePolicyResearchDataset(policyResearchInput);
  const dataset = loadEnrichment();
  const candidates = validateRoster(roster, dataset);
  validateSummary(dataset);
  validateUpstream(policyDataset, dataset);
  validateReferences(roster, dataset);
  validatePublications(dataset);
  const retainedSources = validateRetainedSources(dataset.sourceSnapshots);
  const baseline = publicRecordsInput as {
    claims?: unknown[];
    evidence?: unknown[];
    policies?: unknown[];
    news?: unknown[];
    positions?: unknown[];
    activities?: unknown[];
    timeline?: unknown[];
    relationships?: unknown[];
  };
  const baselineDisplayableRecordCount = [
    baseline.policies,
    baseline.news,
    baseline.positions,
    baseline.activities,
    baseline.timeline,
    baseline.relationships,
  ].reduce((sum, value) => sum + (Array.isArray(value) ? value.length : 0), 0);
  console.log(
    [
      'Validated public-record enrichment:',
      candidates.size + ' candidate audits',
      dataset.claims.length + ' claims',
      dataset.evidence.length + ' evidence records',
      dataset.positions.length + ' positions',
      dataset.careerRecords.length + ' career records',
      dataset.policyReferences.length + ' pending policy references',
      dataset.sourceSnapshots.length +
        ' sources (' +
        retainedSources +
        ' retained)',
      dataset.sourceAttempts.length + ' source attempts',
      '0 published records',
      'baseline displayable production records: ' +
        baselineDisplayableRecordCount +
        ' (claims/evidence retained separately)',
    ].join(', '),
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
