import approvedInput from '../../../data/approved/2026/policy-career-separation.json';
import { getPublishedCandidatePolicies } from '../policy-research/public-index';
import type { PublishedPolicy } from '../policy-research/published-schema';
import { politicalCareerDataset } from '../political-career';
import {
  type CommitmentFacet,
  type HistoricalFacet,
  type PolicyActivityLink,
  type PolicyCareerDataset,
  type PolicyClassification,
  validatePolicyCareerDataset,
} from './schema';

/**
 * Read model for the policy/career split.
 *
 * One published policy record has exactly one classification, so a fact can
 * never be rendered as a campaign promise and as a council action at the same
 * time. The Policy tab renders `commitments`; the Career tab renders
 * `careerRecords` plus the political-career activities, and both sides may
 * cross-link through stable policy and activity ids.
 */

export const policyCareerDataset: PolicyCareerDataset =
  validatePolicyCareerDataset(approvedInput);

const classificationByPolicyId = new Map(
  policyCareerDataset.classifications.map((row) => [row.policyId, row]),
);

const linkedActivitiesById = new Map(
  politicalCareerDataset.activities.map((activity) => [activity.id, activity]),
);

export type PolicyCareerRelatedActivity = {
  activityId: string;
  date: string;
  title: string;
  relation: 'same-event' | 'related-topic';
  similarity: number;
};

export type PolicyCareerCommitment = {
  policy: PublishedPolicy;
  /** Present only when the record was split and the promise needs new wording. */
  facet: CommitmentFacet | null;
  relatedActivities: PolicyCareerRelatedActivity[];
};

export type PolicyCareerHistoricalRecord = HistoricalFacet & {
  policyId: string;
  candidateId: string;
  relatedPolicies: { policyId: string; title: string }[];
};

export type PolicyCareerActivityLink = {
  policyId: string;
  title: string;
  relation: 'same-event' | 'related-topic';
};

export type PolicyCareerView = {
  commitments: PolicyCareerCommitment[];
  historicalRecords: PolicyCareerHistoricalRecord[];
  /** Chips shown next to a documented council activity. */
  linksByActivityId: Record<string, PolicyCareerActivityLink[]>;
  movedOutCount: number;
  splitCount: number;
  review: PolicyCareerDataset['review'];
};

const activityLink = (
  link: PolicyActivityLink,
): PolicyCareerRelatedActivity | null => {
  const activity = linkedActivitiesById.get(link.activityId);
  if (!activity) return null;
  return {
    activityId: activity.id,
    date: activity.date,
    title: activity.title,
    relation: link.relation,
    similarity: link.similarity,
  };
};

const policyLink = (
  link: PolicyActivityLink,
): PolicyCareerActivityLink | null => {
  const policy = policyCareerDataset.classifications.find(
    (row) => row.policyId === link.policyId,
  );
  if (!policy) return null;
  const published = getPublishedCandidatePolicies(policy.candidateId).find(
    (candidate) => candidate.policyId === link.policyId,
  );
  if (!published) return null;
  return {
    policyId: published.policyId,
    title: published.title,
    relation: link.relation,
  };
};

const linksForPolicy = (policyId: string): PolicyActivityLink[] =>
  policyCareerDataset.links.filter((link) => link.policyId === policyId);

const classificationOwnsCommitment = (
  classification: PolicyClassification,
): boolean =>
  classification.ownership === 'policy-commitments' ||
  classification.ownership === 'split-record';

export function getPolicyCareer(candidateId: string): PolicyCareerView {
  const policies = getPublishedCandidatePolicies(candidateId);
  const classifications = policies
    .map((policy) => classificationByPolicyId.get(policy.policyId))
    .filter((row): row is PolicyClassification => Boolean(row));

  const commitments: PolicyCareerCommitment[] = policies
    .filter((policy) => {
      const classification = classificationByPolicyId.get(policy.policyId);
      return classification
        ? classificationOwnsCommitment(classification)
        : true;
    })
    .map((policy) => {
      const classification = classificationByPolicyId.get(policy.policyId);
      return {
        policy,
        facet: classification?.commitment ?? null,
        relatedActivities: linksForPolicy(policy.policyId)
          .map(activityLink)
          .filter((row): row is PolicyCareerRelatedActivity => row !== null),
      };
    });

  const historicalRecords: PolicyCareerHistoricalRecord[] = classifications
    .filter(
      (row) => row.historical !== null && row.ownership !== 'review-required',
    )
    .map((row) => {
      const historical = row.historical as HistoricalFacet;
      const siblingActivityIds = new Set([
        ...row.duplicateOfActivityIds,
        ...row.relatedActivityIds,
      ]);
      const relatedPolicies = policyCareerDataset.links
        .filter(
          (link) =>
            link.policyId !== row.policyId &&
            siblingActivityIds.has(link.activityId) &&
            classificationOwnsCommitment(
              classificationByPolicyId.get(link.policyId) ?? row,
            ),
        )
        .map(policyLink)
        .filter((link): link is PolicyCareerActivityLink => link !== null);
      return {
        ...historical,
        policyId: row.policyId,
        candidateId: row.candidateId,
        relatedPolicies,
      };
    })
    .sort((left, right) => {
      if (left.date === right.date)
        return left.title.localeCompare(right.title);
      if (!left.date) return 1;
      if (!right.date) return -1;
      return right.date.localeCompare(left.date);
    });

  const linksByActivityId: Record<string, PolicyCareerActivityLink[]> = {};
  const candidateLinks = new Set(classifications.map((row) => row.policyId));
  for (const link of policyCareerDataset.links) {
    if (!candidateLinks.has(link.policyId)) continue;
    const target = policyLink(link);
    if (!target) continue;
    const bucket = linksByActivityId[link.activityId] ?? [];
    bucket.push(target);
    linksByActivityId[link.activityId] = bucket;
  }

  return {
    commitments,
    historicalRecords,
    linksByActivityId,
    movedOutCount: policies.length - commitments.length,
    splitCount: classifications.filter(
      (row) => row.ownership === 'split-record',
    ).length,
    review: policyCareerDataset.review,
  };
}
