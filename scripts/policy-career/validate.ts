import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import approvedRoster from '../../data/approved/2026/kaohsiung-election.json';
import { readsAsCompletedAction } from '../../src/data/policy-career/markers';
import {
  type PolicyCareerDataset,
  validatePolicyCareerDataset,
} from '../../src/data/policy-career/schema';
import {
  documentFrequency,
  POLICY_ACTIVITY_RELATION_THRESHOLD,
  semanticSimilarity,
} from '../../src/data/policy-career/similarity';
import type { PublishedPolicyDataset } from '../../src/data/policy-research/published-schema';
import type { PoliticalCareerDataset } from '../../src/data/political-career/schema';

/**
 * Publication gate for data/approved/2026/policy-career-separation.json.
 *
 * The Policy tab and the Career tab must never present the same fact twice, and
 * no historical action may be published as a campaign promise. The checks below
 * are the executable form of those rules; the build script enforces the same
 * invariants before writing, so a passing validator and a successful build mean
 * the same thing.
 */

const ROOT = resolve('.');
const DATASET_PATH = join(
  ROOT,
  'data/approved/2026/policy-career-separation.json',
);
const POLICY_PATH = join(ROOT, 'data/published/2026/candidate-policies.json');
const CAREER_PATH = join(ROOT, 'data/approved/2026/political-career.json');

function fail(message: string): never {
  throw new Error('[validate:policy-career] ' + message);
}

function assertCondition(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) fail(message);
}

type Curation = {
  entries: {
    policyId: string;
    ownership: string;
    status: string;
  }[];
};

const dataset = JSON.parse(
  readFileSync(DATASET_PATH, 'utf8'),
) as PolicyCareerDataset;
validatePolicyCareerDataset(dataset);

const published = JSON.parse(
  readFileSync(POLICY_PATH, 'utf8'),
) as PublishedPolicyDataset;
const career = JSON.parse(
  readFileSync(CAREER_PATH, 'utf8'),
) as PoliticalCareerDataset;
const curation = JSON.parse(
  readFileSync(join(ROOT, 'data/policy-career/2026/curation.json'), 'utf8'),
) as Curation;
const roster = (
  approvedRoster as { candidates: { id: string; displayName: string }[] }
).candidates;
const rosterIds = new Set(roster.map((candidate) => candidate.id));

const policyById = new Map(
  published.policies.map((policy) => [policy.policyId, policy]),
);
const activityById = new Map(
  career.activities.map((activity) => [activity.id, activity]),
);
const configuredIds = new Set(curation.entries.map((entry) => entry.policyId));

assertCondition(
  published.policies.length === dataset.policyCount,
  'policy count does not match the published policy dataset: ' +
    published.policies.length,
);

// 1. One classification per policy, no orphans, no duplicates, correct candidate.
const classified = new Map<
  string,
  PolicyCareerDataset['classifications'][number]
>();
for (const row of dataset.classifications) {
  const policy = policyById.get(row.policyId);
  assertCondition(policy, 'classification for unknown policy: ' + row.policyId);
  assertCondition(
    !classified.has(row.policyId),
    'duplicate classification: ' + row.policyId,
  );
  assertCondition(
    policy.candidateId === row.candidateId,
    'classification candidate mismatch: ' + row.policyId,
  );
  assertCondition(
    rosterIds.has(row.candidateId),
    'unknown candidate: ' + row.candidateId,
  );
  classified.set(row.policyId, row);
}
for (const policy of published.policies) {
  assertCondition(
    classified.has(policy.policyId),
    'policy without classification: ' + policy.policyId,
  );
}

// 2. Ownership rules: a historical action may not live in the Policy tab, a
//    promise may not be filed as a delivered record, mixed records must be split.
const commitments: string[] = [];
const careerRecords: string[] = [];
for (const row of dataset.classifications) {
  assertCondition(
    row.ownership !== 'review-required' || row.status === 'pending-review',
    'review-required record is marked publishable: ' + row.policyId,
  );
  assertCondition(
    row.ownership !== 'review-required',
    'record still requires review and must not be published: ' + row.policyId,
  );
  assertCondition(
    row.ownership !== 'policy-commitments' ||
      row.temporalBasis === 'future-commitment',
    'promise carries a historical temporal basis: ' + row.policyId,
  );
  assertCondition(
    row.ownership === 'policy-commitments' ? row.historical === null : true,
    'promise also carries a historical facet: ' + row.policyId,
  );
  assertCondition(
    row.ownership !== 'political-career' || row.commitment === null,
    'moved-out record still carries a promise facet: ' + row.policyId,
  );
  assertCondition(
    row.ownership !== 'political-career' || row.historical !== null,
    'moved-out record has no historical facet: ' + row.policyId,
  );
  assertCondition(
    row.ownership !== 'split-record' || row.commitment !== null,
    'split record kept no promise facet: ' + row.policyId,
  );
  assertCondition(
    row.ownership !== 'split-record' ||
      row.historical !== null ||
      row.duplicateOfActivityIds.length > 0,
    'split record documents no historical action: ' + row.policyId,
  );
  if (row.historical !== null) {
    careerRecords.push(row.policyId);
  }
  if (
    row.ownership === 'policy-commitments' ||
    row.ownership === 'split-record'
  ) {
    commitments.push(row.policyId);
  }
}
assertCondition(
  commitments.length +
    dataset.classifications.filter(
      (row) => row.ownership === 'political-career',
    ).length ===
    dataset.classifications.length,
  'classification ownership counts do not add up',
);
// A split record is the one legitimate exception: the promise and the past
// action come from the same source but describe different facts, so they must
// read differently on each side.
for (const row of dataset.classifications) {
  if (row.ownership !== 'split-record') continue;
  assertCondition(
    row.commitment !== null,
    'split record lacks a promise facet: ' + row.policyId,
  );
  if (row.historical === null) continue;
  assertCondition(
    row.commitment.title !== row.historical.title,
    'split record repeats one statement in both sections: ' + row.policyId,
  );
  assertCondition(
    !row.commitment.summary.includes(row.historical.description),
    'split record copies the historical description into the promise: ' +
      row.policyId,
  );
}

// 3. A promise that reads as a delivered outcome must carry an editorial reading.
const policyText = (policy: (typeof published.policies)[number]): string =>
  [
    policy.title,
    policy.summary,
    policy.details,
    policy.originalStatement ?? '',
    ...policy.implementationDetails,
  ].join('\n');
for (const policyId of commitments) {
  const policy = policyById.get(policyId);
  assertCondition(policy, 'commitment without published policy: ' + policyId);
  if (!readsAsCompletedAction(policyText(policy))) continue;
  const row = classified.get(policyId);
  assertCondition(row, 'commitment without classification: ' + policyId);
  assertCondition(
    row.basis.includes('editorial-review'),
    'promise reads as completed without an editorial reading: ' + policyId,
  );
  assertCondition(
    row.note.trim().length > 0,
    'promise reads as completed without a written note: ' + policyId,
  );
}

// 4. Reviewed history must be traceable to the record it comes from.
for (const row of dataset.classifications) {
  if (row.historical === null) continue;
  const policy = policyById.get(row.policyId);
  assertCondition(
    policy,
    'historical facet without published policy: ' + row.policyId,
  );
  const allowed = new Set(policy.sources.map((source) => source.url));
  for (const url of row.historical.sourceUrls) {
    assertCondition(
      allowed.has(url),
      'historical facet cites a source the policy record does not carry: ' +
        row.policyId,
    );
  }
  const corpus = [
    policyText(policy),
    ...policy.sources.flatMap((source) => [source.title, source.excerpt]),
  ].join('\n');
  assertCondition(
    corpus.includes(row.historical.evidenceExcerpt),
    'historical excerpt is not quoted from the record: ' + row.policyId,
  );
  if (row.historical.date !== null) {
    assertCondition(
      /^\d{4}-\d{2}-\d{2}$/.test(row.historical.date),
      'historical date is not ISO: ' + row.policyId,
    );
  }
  assertCondition(
    row.historical.date !== null || row.historical.datePrecision === 'undated',
    'undated historical facet must say so: ' + row.policyId,
  );
  assertCondition(
    !['documented-outcome', 'institutional-response'].includes(
      row.historical.outcomeStatus,
    ) || row.historical.outcome !== null,
    'historical facet claims an outcome without describing it: ' + row.policyId,
  );
  // Office terms live in the career dataset. PolicyDerivedCategorySchema
  // already excludes them, so this is enforced at parse time rather than
  // compared here.
  for (const activityId of [
    ...row.relatedActivityIds,
    ...row.duplicateOfActivityIds,
  ]) {
    const activity = activityById.get(activityId);
    assertCondition(
      activity,
      'historical facet references unknown activity: ' + activityId,
    );
    assertCondition(
      activity.candidateId === row.candidateId,
      "historical facet references another candidate's activity: " + activityId,
    );
  }
}

// 5. A moved-out record must not silently repeat a career activity the reader
//    can already see; every strong overlap needs an explicit link.
const frequency = documentFrequency(
  career.activities.map(
    (activity) => activity.title + '\n' + activity.description,
  ),
);
for (const row of dataset.classifications) {
  if (row.historical === null) continue;
  const policy = policyById.get(row.policyId);
  assertCondition(
    policy,
    'historical facet without published policy: ' + row.policyId,
  );
  const covered = new Set([
    ...row.relatedActivityIds,
    ...row.duplicateOfActivityIds,
  ]);
  const text = policy.title + '\n' + (row.historical.description ?? '');
  for (const activity of career.activities) {
    if (activity.candidateId !== row.candidateId || covered.has(activity.id))
      continue;
    const similarity = semanticSimilarity(
      text,
      activity.title + '\n' + activity.description,
      frequency,
    );
    assertCondition(
      similarity.score < POLICY_ACTIVITY_RELATION_THRESHOLD,
      'historical record duplicates an unlinked activity (' +
        similarity.score +
        '): ' +
        row.policyId +
        ' / ' +
        activity.id,
    );
  }
}

// 6. Links: both ends exist, belong to one candidate, and keep their provenance.
const linkKeys = new Set<string>();
for (const link of dataset.links) {
  const policy = policyById.get(link.policyId);
  const activity = activityById.get(link.activityId);
  assertCondition(policy, 'link references unknown policy: ' + link.policyId);
  assertCondition(
    activity,
    'link references unknown activity: ' + link.activityId,
  );
  assertCondition(
    policy.candidateId === link.candidateId &&
      activity.candidateId === link.candidateId,
    'link crosses candidates: ' + link.policyId,
  );
  const key = link.policyId + '\u0000' + link.activityId;
  assertCondition(!linkKeys.has(key), 'duplicate link: ' + link.policyId);
  linkKeys.add(key);
  assertCondition(
    link.similarity >= 0 && link.similarity <= 1,
    'link similarity out of range: ' + link.policyId,
  );
  if (link.origin === 'automated') {
    assertCondition(
      link.similarity > 0 && link.sharedTerms.length > 0,
      'automated link carries no measured overlap: ' + link.policyId,
    );
  } else {
    assertCondition(
      Boolean(link.note && link.note.trim().length > 0),
      'curated link carries no editorial note: ' + link.policyId,
    );
  }
}

// 7. Publication gates, counts and review metadata.
assertCondition(
  dataset.review.status === 'approved',
  'dataset is not approved for publication',
);
assertCondition(
  dataset.review.reviewedAt === dataset.snapshotDate,
  'review date does not match the snapshot',
);
assertCondition(
  dataset.review.limitations.length > 0,
  'dataset publishes no limitations',
);
assertCondition(
  dataset.review.counts.policies === dataset.classifications.length,
  'review count for policies is stale',
);
assertCondition(
  dataset.review.counts.commitments === commitments.length,
  'review count for commitments is stale',
);
assertCondition(
  dataset.review.counts.careerRecords === careerRecords.length,
  'review count for career records is stale',
);
assertCondition(
  dataset.review.counts.splitRecords ===
    dataset.classifications.filter((row) => row.ownership === 'split-record')
      .length,
  'review count for split records is stale',
);
assertCondition(
  dataset.review.counts.movedOut ===
    dataset.classifications.filter(
      (row) => row.ownership === 'political-career',
    ).length,
  'review count for moved-out records is stale',
);
assertCondition(
  dataset.review.counts.links === dataset.links.length,
  'review count for links is stale',
);
for (const row of dataset.classifications) {
  assertCondition(
    row.status === 'approved' || !configuredIds.has(row.policyId),
    'record is not approved and has no reviewed decision: ' + row.policyId,
  );
}

const linkedActivityIds = new Set(dataset.links.map((link) => link.activityId));
console.log(
  '[validate:policy-career] ' +
    [
      dataset.classifications.length + ' policies classified',
      commitments.length + ' commitments',
      careerRecords.length + ' moved history records',
      dataset.classifications.filter((row) => row.ownership === 'split-record')
        .length + ' split records',
      dataset.links.length +
        ' links (' +
        linkedActivityIds.size +
        ' activities)',
      '0 records published twice',
    ].join(', '),
);
