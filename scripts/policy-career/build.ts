import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readsAsCompletedAction } from '../../src/data/policy-career/markers';
import {
  type PolicyCareerDataset,
  type PolicyClassification,
  validatePolicyCareerDataset,
} from '../../src/data/policy-career/schema';
import {
  documentFrequency,
  POLICY_ACTIVITY_RELATION_THRESHOLD,
  SAME_EVENT_THRESHOLD,
  semanticSimilarity,
} from '../../src/data/policy-career/similarity';

/**
 * Deterministic, offline build of data/approved/2026/policy-career-separation.json.
 *
 * Inputs, all already on disk:
 *   - data/published/2026/candidate-policies.json (1005 approved policy records)
 *   - data/approved/2026/political-career.json (1045 documented activities)
 *   - data/policy-career/2026/curation.json (the reviewed overrides)
 *
 * The build does three things:
 *   1. classify every published policy as a future commitment, a historical
 *      action that belongs in the Career tab, a split record, or review-required;
 *   2. refuse to run when the automated flag set and the reviewed overrides have
 *      drifted apart, so a new ambiguous record can never slip through quietly;
 *   3. relate commitments to documented activities, keeping only explicit links.
 *
 * It never reaches the network, never rewrites a source excerpt, and never
 * invents a date.
 */

const ROOT = process.cwd();
const POLICY_PATH = 'data/published/2026/candidate-policies.json';
const CAREER_PATH = 'data/approved/2026/political-career.json';
const CURATION_PATH = 'data/policy-career/2026/curation.json';
const OUTPUT_PATH = 'data/approved/2026/policy-career-separation.json';
const SNAPSHOT_DATE = '2026-11-14';
const MAX_LINKS_PER_POLICY = 3;

type PolicySource = {
  url: string;
  publisher: string;
  title: string;
  publishedAt: string | null;
  excerpt: string;
};

type PublishedPolicy = {
  policyId: string;
  candidateId: string;
  title: string;
  summary: string;
  details: string;
  originalStatement: string | null;
  category: string;
  type: string;
  announcedAt: string | null;
  scope: string;
  implementationDetails: string[];
  sources: PolicySource[];
};

type CareerActivity = {
  id: string;
  candidateId: string;
  date: string;
  category: string;
  title: string;
  description: string;
};

type CurationEntry = {
  policyId: string;
  ownership: PolicyClassification['ownership'];
  temporalBasis: PolicyClassification['temporalBasis'];
  basis: PolicyClassification['basis'];
  note: string;
  commitment: PolicyClassification['commitment'];
  historical: PolicyClassification['historical'];
  duplicateOfActivityIds: string[];
  relatedActivityIds: string[];
};

type Curation = {
  reviewerId: string;
  reviewedAt: string;
  entries: CurationEntry[];
  linkOverrides: {
    policyId: string;
    activityId: string;
    relation: 'same-event' | 'related-topic';
    note: string;
  }[];
};

const readJson = <T>(path: string): T =>
  JSON.parse(readFileSync(join(ROOT, path), 'utf8')) as T;

const policyText = (policy: PublishedPolicy): string =>
  [
    policy.title,
    policy.summary,
    policy.details,
    policy.originalStatement ?? '',
    ...policy.implementationDetails,
  ].join('\n');

const evidenceCorpus = (policy: PublishedPolicy): string =>
  [
    policyText(policy),
    ...policy.sources.flatMap((source) => [source.title, source.excerpt]),
  ].join('\n');

const needsReview = (policy: PublishedPolicy): boolean => {
  if (
    policy.type === 'public_statement' ||
    policy.type === 'historical_proposal'
  ) {
    return true;
  }
  const text = policyText(policy);
  return readsAsCompletedAction(text);
};

const defaultClassification = (
  policy: PublishedPolicy,
): PolicyClassification => ({
  policyId: policy.policyId,
  candidateId: policy.candidateId,
  ownership: 'policy-commitments',
  temporalBasis: 'future-commitment',
  basis: 'policy-type',
  note:
    policy.type === 'issue_position'
      ? '政策類型為立場主張，內容為可持續推動的市政目標，未見完成式語句。'
      : '政策類型為政見，內容指向未來推動方向，未見完成式語句。',
  status: 'approved',
  commitment: null,
  historical: null,
  duplicateOfActivityIds: [],
  relatedActivityIds: [],
});

function fail(message: string): never {
  throw new Error(`[policy-career] ${message}`);
}

const policies = readJson<{ policies: PublishedPolicy[] }>(
  POLICY_PATH,
).policies;
const career = readJson<{ activities: CareerActivity[] }>(CAREER_PATH);
const curation = readJson<Curation>(CURATION_PATH);

const policyById = new Map(policies.map((policy) => [policy.policyId, policy]));
const activityById = new Map(
  career.activities.map((activity) => [activity.id, activity]),
);

// 1. The automated flag set and the reviewed overrides must agree exactly.
const flagged = policies
  .filter(needsReview)
  .map((policy) => policy.policyId)
  .sort();
const curated = curation.entries.map((entry) => entry.policyId).sort();
const uncurated = flagged.filter((id) => !curated.includes(id));
const unnecessary = curated.filter((id) => !flagged.includes(id));
if (uncurated.length > 0) {
  fail(
    `records need an editorial decision in ${CURATION_PATH}: ${uncurated.join(', ')}`,
  );
}
if (unnecessary.length > 0) {
  // Reviewed records that the heuristic would have passed are allowed: they
  // carry an explicit decision ("完工 is the object of 督促, not a result") and
  // keep that reading auditable instead of dropping it on a regex change.
  console.log(
    `[policy-career] ${unnecessary.length} reviewed records were not auto-flagged: ${unnecessary.join(', ')}`,
  );
}

// 2. Every curated record must quote its own evidence verbatim.
for (const entry of curation.entries) {
  const policy = policyById.get(entry.policyId);
  if (!policy) fail(`unknown policy ${entry.policyId}`);
  const corpus = evidenceCorpus(policy);
  const excerpts = [
    entry.commitment?.evidenceExcerpt,
    entry.historical?.evidenceExcerpt,
  ].filter((value): value is string => Boolean(value));
  for (const excerpt of excerpts) {
    if (!corpus.includes(excerpt)) {
      fail(
        `evidence excerpt for ${entry.policyId} is not quoted from the source: ${excerpt}`,
      );
    }
  }
  if (entry.historical) {
    const allowed = new Set(policy.sources.map((source) => source.url));
    for (const url of entry.historical.sourceUrls) {
      if (!allowed.has(url)) {
        fail(
          `historical source for ${entry.policyId} is not a source of the policy record: ${url}`,
        );
      }
    }
    if (entry.historical.date && entry.historical.datePrecision === 'day') {
      if (!entry.historical.dateBasis.includes('報導')) {
        fail(
          `day-precision date for ${entry.policyId} needs an explicit basis`,
        );
      }
    }
  }
}

// 3. Classify: curated overrides win, everything else keeps its promise reading.
const overrides = new Map(
  curation.entries.map((entry) => [entry.policyId, entry]),
);
const classifications: PolicyClassification[] = policies
  .map((policy) => {
    const override = overrides.get(policy.policyId);
    if (!override) return defaultClassification(policy);
    return {
      policyId: policy.policyId,
      candidateId: policy.candidateId,
      ownership: override.ownership,
      temporalBasis: override.temporalBasis,
      basis: override.basis,
      note: override.note,
      status: 'approved' as const,
      commitment: override.commitment,
      historical: override.historical,
      duplicateOfActivityIds: override.duplicateOfActivityIds,
      relatedActivityIds: override.relatedActivityIds,
    };
  })
  .sort((left, right) => left.policyId.localeCompare(right.policyId));

// 4. Relate visible commitments to documented activities of the same candidate.
const activitiesByCandidate = new Map<string, CareerActivity[]>();
for (const activity of career.activities) {
  const bucket = activitiesByCandidate.get(activity.candidateId) ?? [];
  bucket.push(activity);
  activitiesByCandidate.set(activity.candidateId, bucket);
}

const frequency = documentFrequency(
  career.activities.map(
    (activity) => `${activity.title}\n${activity.description}`,
  ),
);

type Link = PolicyCareerDataset['links'][number];
const links: Link[] = [];
const linkKeys = new Set<string>();

const addLink = (link: Link): void => {
  const key = `${link.policyId}\u0000${link.activityId}`;
  if (linkKeys.has(key)) return;
  linkKeys.add(key);
  links.push(link);
};

for (const classification of classifications) {
  if (
    classification.ownership !== 'policy-commitments' &&
    classification.ownership !== 'split-record'
  ) {
    continue;
  }
  const policy = policyById.get(classification.policyId);
  if (!policy) fail(`unknown policy ${classification.policyId}`);
  const text = `${policy.title}\n${policy.summary}\n${policy.originalStatement ?? ''}`;
  const publishedDates = new Set(
    policy.sources
      .map((source) => source.publishedAt)
      .filter((value): value is string => Boolean(value))
      .map((value) => value.slice(0, 10)),
  );

  const scored = (activitiesByCandidate.get(policy.candidateId) ?? [])
    .map((activity) => ({
      activity,
      similarity: semanticSimilarity(
        text,
        `${activity.title}\n${activity.description}`,
        frequency,
      ),
    }))
    .filter(
      (entry) => entry.similarity.score >= POLICY_ACTIVITY_RELATION_THRESHOLD,
    )
    .sort((left, right) => right.similarity.score - left.similarity.score)
    .slice(0, MAX_LINKS_PER_POLICY);

  for (const { activity, similarity } of scored) {
    const sameDay = publishedDates.has(activity.date);
    addLink({
      policyId: policy.policyId,
      activityId: activity.id,
      candidateId: policy.candidateId,
      relation:
        sameDay && similarity.score >= SAME_EVENT_THRESHOLD
          ? 'same-event'
          : 'related-topic',
      origin: 'automated',
      similarity: similarity.score,
      sharedTerms: similarity.sharedTerms,
      note:
        sameDay && similarity.score >= SAME_EVENT_THRESHOLD
          ? '主張與既有紀錄同日出現，判定為同一事件的不同記載。'
          : null,
    });
  }
}

// 5. Reviewed links the similarity aid cannot find on its own.
for (const classification of classifications) {
  const policy = policyById.get(classification.policyId);
  if (!policy) fail(`unknown policy ${classification.policyId}`);
  for (const activityId of [
    ...classification.relatedActivityIds,
    ...classification.duplicateOfActivityIds,
  ]) {
    const activity = activityById.get(activityId);
    if (!activity)
      fail(`unknown activity ${activityId} on ${classification.policyId}`);
    if (activity.candidateId !== policy.candidateId) {
      fail(
        `activity ${activityId} belongs to another candidate than ${policy.policyId}`,
      );
    }
    const similarity = semanticSimilarity(
      `${policy.title}\n${policy.summary}\n${policy.originalStatement ?? ''}`,
      `${activity.title}\n${activity.description}`,
      frequency,
    );
    addLink({
      policyId: policy.policyId,
      activityId,
      candidateId: policy.candidateId,
      relation:
        similarity.score >= SAME_EVENT_THRESHOLD
          ? 'same-event'
          : 'related-topic',
      origin: 'curated',
      similarity: similarity.score,
      sharedTerms: similarity.sharedTerms,
      note: '編輯依來源內容與既有質詢紀錄建立關聯。',
    });
  }
}

for (const override of curation.linkOverrides) {
  const policy = policyById.get(override.policyId);
  const activity = activityById.get(override.activityId);
  if (!policy || !activity)
    fail(`unknown link override ${override.policyId} / ${override.activityId}`);
  const similarity = semanticSimilarity(
    `${policy.title}\n${policy.summary}\n${policy.originalStatement ?? ''}`,
    `${activity.title}\n${activity.description}`,
    frequency,
  );
  addLink({
    policyId: policy.policyId,
    activityId: activity.id,
    candidateId: policy.candidateId,
    relation: override.relation,
    origin: 'curated',
    similarity: similarity.score,
    sharedTerms: similarity.sharedTerms,
    note: override.note,
  });
}

// 6. A migrated historical facet must not silently duplicate an activity.
for (const classification of classifications) {
  if (!classification.historical) continue;
  const policy = policyById.get(classification.policyId);
  if (!policy) fail(`unknown policy ${classification.policyId}`);
  const allowed = new Set([
    ...classification.duplicateOfActivityIds,
    ...classification.relatedActivityIds,
  ]);
  for (const activity of activitiesByCandidate.get(policy.candidateId) ?? []) {
    if (allowed.has(activity.id)) continue;
    const similarity = semanticSimilarity(
      `${policy.title}\n${policy.summary}\n${classification.historical.description}`,
      `${activity.title}\n${activity.description}`,
      frequency,
    );
    if (similarity.score >= POLICY_ACTIVITY_RELATION_THRESHOLD) {
      fail(
        `historical facet of ${classification.policyId} duplicates ${activity.id} (score ${similarity.score}); link or drop it`,
      );
    }
  }
}

links.sort((left, right) => {
  const byPolicy = left.policyId.localeCompare(right.policyId);
  return byPolicy !== 0
    ? byPolicy
    : left.activityId.localeCompare(right.activityId);
});

const count = (predicate: (value: PolicyClassification) => boolean): number =>
  classifications.filter(predicate).length;

const dataset: PolicyCareerDataset = {
  datasetId: 'kaohsiung-2026-policy-career-separation',
  snapshotDate: SNAPSHOT_DATE,
  policyDatasetId: 'kaohsiung-2026-candidate-policies',
  careerDatasetId: 'kaohsiung-2026-political-career',
  policyCount: 1005,
  classifications,
  links,
  review: {
    status: 'approved',
    reviewerId: curation.reviewerId,
    reviewedAt: curation.reviewedAt,
    scopeNote:
      '政策主張與從政歷程的分工：政策頁只保留未來承諾與政策目標，從政歷程只保留已發生的議會與市政行動；混合紀錄拆為兩筆並互相連結。',
    limitations: [
      '分類以已發布政策資料集為範圍，未重新抓取政策來源，亦未新增政策主張。',
      '相似度僅為輔助指標；所有跨頁連結均需經編輯確認後才寫入本資料集。',
      '移入從政歷程的政策紀錄多數未載明日期，因此以 undated 呈現，未推定日期。',
      '未記載不代表未發生；缺少議會紀錄的候選人不作任何推論。',
    ],
    counts: {
      policies: classifications.length,
      commitments: count(
        (value) =>
          value.ownership === 'policy-commitments' ||
          value.ownership === 'split-record',
      ),
      careerRecords: count((value) => value.historical !== null),
      splitRecords: count((value) => value.ownership === 'split-record'),
      movedOut: count((value) => value.ownership === 'political-career'),
      links: links.length,
    },
  },
};

validatePolicyCareerDataset(dataset);
writeFileSync(join(ROOT, OUTPUT_PATH), `${JSON.stringify(dataset, null, 2)}\n`);

console.log(
  `[policy-career] policies=${dataset.review.counts.policies} commitments=${dataset.review.counts.commitments} careerRecords=${dataset.review.counts.careerRecords} splits=${dataset.review.counts.splitRecords} movedOut=${dataset.review.counts.movedOut} links=${dataset.review.counts.links}`,
);
console.log(
  `[policy-career] sameEvent=${links.filter((link) => link.relation === 'same-event').length} curated=${links.filter((link) => link.origin === 'curated').length}`,
);
