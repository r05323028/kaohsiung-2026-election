import { describe, expect, it } from 'vitest';
import { getPoliticalCareer, politicalCareerDataset } from './index';

const roster = politicalCareerDataset.coverage;
const sourceIds = new Set(
  politicalCareerDataset.sources.map((source) => source.sourceId),
);
const personIdOf = (candidateId: string) =>
  `person-${candidateId.replace(/^official-(?:mayor|candidate)-2026-/, '')}`;

describe('political career dataset', () => {
  it('covers every candidate exactly once', () => {
    expect(roster).toHaveLength(106);
    expect(new Set(roster.map((row) => row.candidateId)).size).toBe(106);
  });

  it('only cites sources retained in the dataset', () => {
    for (const activity of politicalCareerDataset.activities) {
      expect(sourceIds.has(activity.sourceId)).toBe(true);
    }
    for (const term of politicalCareerDataset.officeTerms) {
      for (const sourceId of term.sourceIds) {
        expect(sourceIds.has(sourceId)).toBe(true);
      }
    }
    for (const project of politicalCareerDataset.governmentProjects) {
      expect(sourceIds.has(project.sourceId)).toBe(true);
    }
    for (const proposal of politicalCareerDataset.legislativeProposals) {
      expect(sourceIds.has(proposal.sourceId)).toBe(true);
    }
    for (const vote of politicalCareerDataset.votingRecords) {
      expect(sourceIds.has(vote.sourceId)).toBe(true);
    }
  });

  it('maps every record to the candidate person identity', () => {
    for (const term of politicalCareerDataset.officeTerms) {
      expect(term.personId).toBe(personIdOf(term.candidateId));
    }
    for (const record of [
      ...politicalCareerDataset.activities,
      ...politicalCareerDataset.governmentProjects,
      ...politicalCareerDataset.legislativeProposals,
      ...politicalCareerDataset.votingRecords,
    ]) {
      expect(record.personId).toBe(personIdOf(record.candidateId));
      expect(sourceIds.has(record.sourceId)).toBe(true);
    }
  });

  it('never attributes another candidate statement to a candidate', () => {
    const names = new Map(
      roster.map((row) => [row.candidateId, row.displayName]),
    );
    for (const record of politicalCareerDataset.activities) {
      const own = names.get(record.candidateId);
      for (const name of names.values()) {
        if (name === own) continue;
        expect(record.description.includes(name)).toBe(false);
      }
    }
    for (const record of [
      ...politicalCareerDataset.governmentProjects,
      ...politicalCareerDataset.legislativeProposals,
      ...politicalCareerDataset.votingRecords,
    ]) {
      const own = names.get(record.candidateId);
      const title = 'motionTitle' in record ? record.motionTitle : record.title;
      const text = `${title} ${'outcome' in record ? (record.outcome ?? '') : ''}`;
      for (const name of names.values()) {
        if (name === own) continue;
        expect(text.includes(name)).toBe(false);
      }
    }
  });

  it('keeps record types and identifiers distinct', () => {
    const ids = [
      ...politicalCareerDataset.officeTerms,
      ...politicalCareerDataset.activities,
      ...politicalCareerDataset.governmentProjects,
      ...politicalCareerDataset.legislativeProposals,
      ...politicalCareerDataset.votingRecords,
    ].map((record) => record.id);
    expect(new Set(ids).size).toBe(ids.length);

    const bills = politicalCareerDataset.legislativeProposals.map(
      (proposal) => `${proposal.candidateId}|${proposal.billId}`,
    );
    expect(new Set(bills).size).toBe(bills.length);

    const projects = politicalCareerDataset.governmentProjects.map(
      (project) => `${project.candidateId}|${project.title}`,
    );
    expect(new Set(projects).size).toBe(projects.length);
  });

  it('only records verified project roles and statuses', () => {
    for (const project of politicalCareerDataset.governmentProjects) {
      expect(['initiated', 'managed', 'participated', 'oversaw']).toContain(
        project.roleType,
      );
      expect([
        'completed',
        'ongoing',
        'planned',
        'not-implemented',
        'unknown',
      ]).toContain(project.status);
      expect(project.evidenceExcerpt.length).toBeGreaterThan(0);
      expect(project.identityBasis.length).toBeGreaterThan(0);
      if (project.status === 'completed') {
        expect(
          Boolean(
            project.startDate || project.endDate || project.positionPeriod,
          ),
        ).toBe(true);
      }
      if (project.startDate && project.endDate) {
        expect(project.startDate <= project.endDate).toBe(true);
      }
    }
  });

  it('keeps proposal roles and official status', () => {
    for (const proposal of politicalCareerDataset.legislativeProposals) {
      expect(['primary', 'co-proposer', 'co-sponsor']).toContain(
        proposal.proposerRole,
      );
      expect(proposal.officialUrl?.startsWith('https://')).toBe(true);
      expect(proposal.billId.length).toBeGreaterThan(0);
      expect(proposal.legislativeStatus.length).toBeGreaterThan(0);
      if (proposal.proposedAt && proposal.latestProgressDate) {
        expect(proposal.proposedAt <= proposal.latestProgressDate).toBe(true);
      }
    }
  });

  it('never infers an individual vote outside a roll-call list', () => {
    for (const vote of politicalCareerDataset.votingRecords) {
      expect(['roll-call', 'voice', 'other']).toContain(vote.voteType);
      expect([
        'for',
        'against',
        'abstain',
        'absent',
        'not-recorded',
        'unknown',
      ]).toContain(vote.individualVote);
      if (vote.voteType !== 'roll-call') {
        expect(vote.individualVote).toBe('unknown');
      } else {
        expect(vote.individualVote).not.toBe('unknown');
      }
      const { attending, for: yes, against, abstain } = vote.tally ?? {};
      if (typeof attending === 'number' && typeof yes === 'number') {
        expect(yes + (against ?? 0) + (abstain ?? 0)).toBeLessThanOrEqual(
          attending,
        );
      }
    }
  });

  it('keeps education and campaign promises out of career records', () => {
    const banned = /學位|畢業|碩士|博士|政見|競選承諾|當選承諾/;
    for (const term of politicalCareerDataset.officeTerms) {
      expect(banned.test(term.officeTitle)).toBe(false);
      expect(banned.test(term.organization)).toBe(false);
    }
    for (const project of politicalCareerDataset.governmentProjects) {
      expect(banned.test(project.title)).toBe(false);
    }
  });

  it('returns newest-first service periods with nested records', () => {
    const view = getPoliticalCareer('official-mayor-lai-rui-long-2026');
    expect(view).toBeDefined();
    if (!view) return;
    const dates = view.officeTerms.map((term) => term.startDate ?? '');
    expect([...dates].sort((a, b) => b.localeCompare(a))).toEqual(dates);
    expect(view.proposalTotal).toBeGreaterThan(0);
    expect(view.votingTotal).toBeGreaterThan(0);

    for (const [positionId, records] of Object.entries(
      view.recordsByPosition,
    )) {
      expect(view.officeTerms.some((term) => term.id === positionId)).toBe(
        true,
      );
      for (const record of [
        ...records.projects,
        ...records.proposals,
        ...records.votes,
      ]) {
        expect(record.positionId).toBe(positionId);
      }
      expect(records.projects.length).toBeLessThanOrEqual(12);
      expect(records.proposals.length).toBeLessThanOrEqual(12);
      expect(records.votes.length).toBeLessThanOrEqual(12);
    }
  });

  it('returns an empty but usable view for uncovered candidates', () => {
    const view = getPoliticalCareer('official-mayor-zhang-jing-2026');
    expect(view?.officeTerms).toHaveLength(0);
    expect(view?.activities).toHaveLength(0);
    expect(view?.proposalTotal).toBe(0);
    expect(view?.votingTotal).toBe(0);
    expect(view?.coverage.status).toBe('no-verifiable-record-found');
  });

  it('exposes provenance without internal snapshot paths', () => {
    const covered = getPoliticalCareer(
      'official-candidate-2026-district-kaohsiung-council-08-440e3b8d',
    );
    const first = covered?.activities[0];
    const source = first ? covered?.sources[first.sourceId] : undefined;
    expect(source).toBeDefined();
    expect(source && 'rawPath' in source).toBe(false);
    expect(source && 'sha256' in source).toBe(false);
  });
});
