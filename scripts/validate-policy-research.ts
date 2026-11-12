import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import rosterInput from '../data/approved/2026/kaohsiung-election.json';
import policyResearchInput from '../data/policy-research/2026/full-roster.json';
import policySummaryInput from '../data/policy-research/2026/summary.json';
import { validateOfficialDataset } from '../src/data/official/schema';
import {
  type PolicyResearchDataset,
  validatePolicyResearchDataset,
} from '../src/data/policy-research/schema';
import { validatePolicyResearchSummary } from '../src/data/policy-research/summary-schema';

const dataset: PolicyResearchDataset =
  validatePolicyResearchDataset(policyResearchInput);
const summary = validatePolicyResearchSummary(policySummaryInput);
const roster = validateOfficialDataset(rosterInput);
const candidateById = new Map(
  roster.candidates.map((candidate) => [candidate.id, candidate]),
);
const sourceById = new Map(
  dataset.sourceSnapshots.map((source) => [source.sourceId, source]),
);
const policyById = new Map(
  dataset.policies.map((policy) => [policy.policyId, policy]),
);
const evidenceById = new Map(
  dataset.evidence.map((evidence) => [evidence.evidenceId, evidence]),
);

function fail(message: string): never {
  throw new Error(`Policy research validation failed: ${message}`);
}

if (summary.datasetId !== dataset.datasetId)
  fail('policy research summary dataset ID does not match full dataset');
if (
  summary.snapshotDate !== dataset.snapshotDate ||
  summary.researchCutoff !== dataset.researchCutoff ||
  summary.candidateCount !== dataset.candidateCount
)
  fail('policy research summary metadata does not match full dataset');
for (const audit of dataset.audits) {
  const summaryAudit = summary.audits.find(
    (item) => item.candidateId === audit.candidateId,
  );
  if (!summaryAudit)
    fail('policy research summary is missing ' + audit.candidateId);
  const expected = {
    candidateId: audit.candidateId,
    outcome: audit.outcome,
    researchStatus: audit.researchStatus,
    policyCount: audit.policyIds.length,
    publishedPolicyCount: dataset.policies.filter(
      (policy) =>
        policy.candidateId === audit.candidateId &&
        policy.publicationStatus === 'approved-source-backed',
    ).length,
    note: audit.note,
  };
  if (JSON.stringify(summaryAudit) !== JSON.stringify(expected))
    fail('policy research summary mismatch for ' + audit.candidateId);
}

if (dataset.candidateCount !== roster.candidates.length)
  fail(
    `dataset candidate count ${dataset.candidateCount} does not match roster ${roster.candidates.length}`,
  );

if (dataset.audits.length !== roster.candidates.length)
  fail(`expected one audit per roster candidate, got ${dataset.audits.length}`);

for (const candidate of roster.candidates) {
  const audit = dataset.audits.find(
    (item) => item.candidateId === candidate.id,
  );
  if (!audit) fail(`missing audit for ${candidate.id}`);
  if (audit.personId !== `person-${candidate.slug}`)
    fail(`audit ${candidate.id} has wrong person ID ${audit.personId}`);
  if (audit.displayName !== candidate.displayName)
    fail(`audit ${candidate.id} has wrong display name ${audit.displayName}`);
  if (audit.districtId !== candidate.districtId)
    fail(`audit ${candidate.id} has wrong district ${audit.districtId}`);
  if (audit.electionType !== candidate.electionType)
    fail(`audit ${candidate.id} has wrong election type ${audit.electionType}`);
}

for (const source of dataset.sourceSnapshots) {
  for (const candidateId of source.candidateIds) {
    if (!candidateById.has(candidateId))
      fail(
        `source ${source.sourceId} references unknown candidate ${candidateId}`,
      );
  }
  if (source.retrievalStatus === 'retrieved') {
    if (!source.rawPath || !source.sha256 || source.byteLength === null)
      fail(
        `retrieved source ${source.sourceId} is missing retained bytes metadata`,
      );
    if (!existsSync(source.rawPath))
      fail(`retained source is missing: ${source.rawPath}`);
    const bytes = readFileSync(source.rawPath);
    const actualHash = createHash('sha256').update(bytes).digest('hex');
    const actualSize = statSync(source.rawPath).size;
    if (actualHash !== source.sha256)
      fail(
        `SHA-256 mismatch for ${source.sourceId}: expected ${source.sha256}, got ${actualHash}`,
      );
    if (actualSize !== source.byteLength)
      fail(
        `byte length mismatch for ${source.sourceId}: expected ${source.byteLength}, got ${actualSize}`,
      );
  }
  if (source.retrievalStatus !== 'retrieved' && source.rawPath !== null)
    fail(`non-retrieved source ${source.sourceId} retains a raw path`);
}

for (const attempt of dataset.sourceAttempts) {
  const candidate = candidateById.get(attempt.candidateId);
  if (!candidate)
    fail(
      `attempt ${attempt.attemptId} references unknown candidate ${attempt.candidateId}`,
    );
  if (attempt.personId !== `person-${candidate.slug}`)
    fail(
      `attempt ${attempt.attemptId} has wrong person ID ${attempt.personId}`,
    );
  if (attempt.sourceId) {
    const source = sourceById.get(attempt.sourceId);
    if (!source)
      fail(
        `attempt ${attempt.attemptId} references missing source ${attempt.sourceId}`,
      );
    if (attempt.url !== source.url)
      fail(
        `attempt ${attempt.attemptId} URL does not match source ${attempt.sourceId}`,
      );
  }
  if (attempt.isNegativeEvidence !== false)
    fail(`attempt ${attempt.attemptId} is marked negative evidence`);
}

for (const policy of dataset.policies) {
  const candidate = candidateById.get(policy.candidateId);
  if (!candidate)
    fail(
      `policy ${policy.policyId} references unknown candidate ${policy.candidateId}`,
    );
  if (policy.personId !== `person-${candidate.slug}`)
    fail(`policy ${policy.policyId} has wrong person ID ${policy.personId}`);
  const source = sourceById.get(policy.sourceId);
  if (!source)
    fail(
      `policy ${policy.policyId} references missing source ${policy.sourceId}`,
    );
  if (!source.candidateIds.includes(policy.candidateId))
    fail(
      `policy ${policy.policyId} source ${policy.sourceId} is not identity-linked to its candidate`,
    );
  if (
    policy.policyContext === '2026-election-commitment' &&
    policy.electionYear !== 2026
  )
    fail(`2026 policy ${policy.policyId} is missing electionYear 2026`);
  if (
    policy.policyContext !== '2026-election-commitment' &&
    policy.electionYear !== null
  )
    fail(
      `non-2026 policy ${policy.policyId} has electionYear ${policy.electionYear}`,
    );
  const decision = dataset.verification.find(
    (item) => item.policyId === policy.policyId,
  );
  if (policy.publicationStatus === 'approved-source-backed') {
    if (policy.reviewStatus !== 'editorially-approved')
      fail(`published policy ${policy.policyId} is not editorially approved`);
    if (decision?.decision !== 'verified')
      fail(`published policy ${policy.policyId} lacks a verified decision`);
    if (source.retrievalStatus !== 'retrieved')
      fail(`published policy ${policy.policyId} source was not retrieved`);
    const evidence = evidenceById.get(policy.evidenceId);
    if (!evidence) fail(`published policy ${policy.policyId} has no evidence`);
    if (!source.rawPath)
      fail(`published policy ${policy.policyId} has no retained source text`);
    const raw = readFileSync(source.rawPath, 'utf8');
    const normalized = (value: string) =>
      value.normalize('NFKC').replace(/\s+/g, '');
    if (!normalized(raw).includes(normalized(evidence.quotedText)))
      fail(`published policy ${policy.policyId} quote is absent from source`);
  }
  if (
    policy.publicationStatus !== 'approved-source-backed' &&
    policy.publicationStatus !== 'withheld-pending-review' &&
    policy.publicationStatus !== 'rejected'
  )
    fail(`policy ${policy.policyId} has invalid publication status`);
  if (!evidenceById.has(policy.evidenceId))
    fail(
      `policy ${policy.policyId} references missing evidence ${policy.evidenceId}`,
    );
}

for (const evidence of dataset.evidence) {
  const policy = policyById.get(evidence.policyId);
  if (!policy)
    fail(
      `evidence ${evidence.evidenceId} references missing policy ${evidence.policyId}`,
    );
  if (evidence.sourceId !== policy.sourceId)
    fail(
      `evidence ${evidence.evidenceId} source does not match policy ${policy.policyId}`,
    );
  if (evidence.quotedText !== policy.originalStatement)
    fail(
      `evidence ${evidence.evidenceId} does not preserve policy original statement`,
    );
  if (
    evidence.identityStatus !== 'resolved' ||
    evidence.attributionStatus !== 'attributed'
  )
    fail(
      `evidence ${evidence.evidenceId} is not identity/attribution resolved`,
    );
}

for (const audit of dataset.audits) {
  const expectedPolicyIds = dataset.policies
    .filter((policy) => policy.candidateId === audit.candidateId)
    .map((policy) => policy.policyId)
    .sort();
  const actualPolicyIds = [...audit.policyIds].sort();
  if (JSON.stringify(expectedPolicyIds) !== JSON.stringify(actualPolicyIds))
    fail(`audit ${audit.candidateId} policy inventory is incomplete`);
  if (audit.evidenceIds.some((evidenceId) => !evidenceById.has(evidenceId)))
    fail(`audit ${audit.candidateId} references missing evidence`);
}

if (dataset.review.status !== 'automated-verified')
  fail(`dataset review status is ${dataset.review.status}`);
if (dataset.review.reviewerId !== null || dataset.review.reviewedAt !== null)
  fail('dataset contains invented reviewer metadata');
const publishedCount = dataset.policies.filter(
  (policy) => policy.publicationStatus === 'approved-source-backed',
).length;
if (dataset.review.publishedPolicyCount !== publishedCount)
  fail('dataset review published count does not match policy inventory');

console.log(
  `Validated 106 candidate audits, ${dataset.policies.length} policy records, ${dataset.sourceSnapshots.length} retained sources, and ${publishedCount} published policies.`,
);
