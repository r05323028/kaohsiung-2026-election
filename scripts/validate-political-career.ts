import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import approvedRoster from '../data/approved/2026/kaohsiung-election.json';
import {
  type PoliticalCareerDataset,
  validatePoliticalCareerDataset,
} from '../src/data/political-career/schema';

const ROOT = resolve('.');
const DATASET_PATH = resolve(ROOT, 'data/approved/2026/political-career.json');

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

interface RosterCandidate {
  id: string;
  displayName: string;
}

function main(): void {
  assertCondition(
    existsSync(DATASET_PATH),
    'political-career dataset is missing: data/approved/2026/political-career.json',
  );
  const dataset = JSON.parse(
    readFileSync(DATASET_PATH, 'utf8'),
  ) as PoliticalCareerDataset;
  validatePoliticalCareerDataset(dataset);

  const candidates = (approvedRoster as { candidates: RosterCandidate[] })
    .candidates;
  const byId = new Map(
    candidates.map((candidate) => [candidate.id, candidate]),
  );
  assertCondition(
    candidates.length === 106,
    'roster candidate count changed: ' + candidates.length,
  );
  const rosterNames = candidates
    .map((candidate) => candidate.displayName)
    .filter((name) => name.length >= 2);

  const sourceIds = new Set<string>();
  for (const source of dataset.sources) {
    assertCondition(
      !sourceIds.has(source.sourceId),
      'duplicate source id: ' + source.sourceId,
    );
    sourceIds.add(source.sourceId);
    assertCondition(
      source.url.startsWith('https://'),
      'source is not https: ' + source.url,
    );
    if (source.rawPath !== null) {
      const absolute = resolve(ROOT, source.rawPath);
      assertCondition(
        existsSync(absolute),
        'retained source file missing: ' + source.rawPath,
      );
      assertCondition(
        source.sha256 !== null,
        'retained source lacks sha256: ' + source.sourceId,
      );
      assertCondition(
        sha256(absolute) === source.sha256,
        'retained source hash mismatch: ' + source.rawPath,
      );
    }
  }

  const coverageIds = new Set<string>();
  for (const row of dataset.coverage) {
    assertCondition(
      byId.has(row.candidateId),
      'coverage row for unknown candidate: ' + row.candidateId,
    );
    assertCondition(
      !coverageIds.has(row.candidateId),
      'duplicate coverage row: ' + row.candidateId,
    );
    coverageIds.add(row.candidateId);
    assertCondition(
      row.searchedSourceIds.every((id) => sourceIds.has(id)),
      'coverage row cites unknown source: ' + row.candidateId,
    );
  }
  for (const candidate of candidates) {
    assertCondition(
      coverageIds.has(candidate.id),
      'missing coverage row for candidate: ' + candidate.id,
    );
  }

  const personByCandidate = new Map<string, string>();
  const officeIds = new Set<string>();
  for (const term of dataset.officeTerms) {
    const candidate = byId.get(term.candidateId);
    assertCondition(
      candidate,
      'office term for unknown candidate: ' + term.candidateId,
    );
    const existingPerson = personByCandidate.get(term.candidateId);
    assertCondition(
      existingPerson === undefined || existingPerson === term.personId,
      'office term person mismatch: ' + term.id,
    );
    personByCandidate.set(term.candidateId, term.personId);
    assertCondition(
      !officeIds.has(term.id),
      'duplicate office term id: ' + term.id,
    );
    officeIds.add(term.id);
    assertCondition(
      term.termNumbers.length > 0 ||
        /^(屆次|任期)未載明$/.test(term.termLabel) ||
        term.positionType === 'government-employment',
      'office term lacks term numbers without saying so: ' + term.id,
    );
    assertCondition(
      term.sourceIds.length > 0,
      'office term lacks sources: ' + term.id,
    );
    assertCondition(
      term.sourceIds.every((id) => sourceIds.has(id)),
      'office term cites unknown source: ' + term.id,
    );
    if (term.startDate && term.endDate) {
      assertCondition(
        term.startDate <= term.endDate,
        'office term ends before it starts: ' + term.id,
      );
    }
  }

  const activityIds = new Set<string>();
  const perCandidate = new Map<string, number>();
  for (const activity of dataset.activities) {
    const candidate = byId.get(activity.candidateId);
    assertCondition(
      candidate,
      'activity for unknown candidate: ' + activity.candidateId,
    );
    const existingPerson = personByCandidate.get(activity.candidateId);
    assertCondition(
      existingPerson === undefined || existingPerson === activity.personId,
      'activity person mismatch: ' + activity.id,
    );
    personByCandidate.set(activity.candidateId, activity.personId);
    assertCondition(
      !activityIds.has(activity.id),
      'duplicate activity id: ' + activity.id,
    );
    activityIds.add(activity.id);
    assertCondition(
      sourceIds.has(activity.sourceId),
      'activity cites unknown source: ' + activity.id,
    );
    assertCondition(
      activity.date >= '2000-01-01',
      'activity date out of range: ' + activity.id,
    );
    assertCondition(
      activity.date <= dataset.researchCutoff,
      'activity after research cutoff: ' + activity.id,
    );
    assertCondition(
      activity.evidenceExcerpt.trim().length > 0,
      'activity lacks evidence excerpt: ' + activity.id,
    );
    assertCondition(
      activity.identityBasis.trim().length > 0,
      'activity lacks identity basis: ' + activity.id,
    );
    assertCondition(
      activity.outcomeStatus !== 'institutional-response' ||
        activity.outcome !== null,
      'activity claims an institutional response without outcome text: ' +
        activity.id,
    );
    assertCondition(
      activity.outcome === null ||
        !rosterNames.some(
          (name) =>
            name !== candidate.displayName && activity.outcome?.includes(name),
        ),
      'activity outcome names another candidate: ' + activity.id,
    );
    assertCondition(
      !rosterNames.some(
        (name) =>
          name !== candidate.displayName && activity.description.includes(name),
      ),
      "activity description attributes another candidate's statement to " +
        candidate.displayName +
        ': ' +
        activity.id,
    );
    perCandidate.set(
      activity.candidateId,
      (perCandidate.get(activity.candidateId) ?? 0) + 1,
    );
  }

  for (const [candidateId, count] of perCandidate) {
    assertCondition(
      count <= 40,
      'candidate exceeds retained activity cap: ' +
        candidateId +
        ' (' +
        count +
        ')',
    );
  }

  const officeById = new Map(
    dataset.officeTerms.map((term) => [term.id, term]),
  );
  function checkPersonAndPosition(record: {
    id: string;
    candidateId: string;
    personId: string;
    positionId: string | null;
  }): void {
    const candidate = byId.get(record.candidateId);
    assertCondition(candidate, 'record for unknown candidate: ' + record.id);
    const existingPerson = personByCandidate.get(record.candidateId);
    assertCondition(
      existingPerson === undefined || existingPerson === record.personId,
      'record person mismatch: ' + record.id,
    );
    personByCandidate.set(record.candidateId, record.personId);
    if (record.positionId !== null) {
      const term = officeById.get(record.positionId);
      assertCondition(term, 'record links unknown position: ' + record.id);
      assertCondition(
        term.candidateId === record.candidateId,
        "record links another candidate's position: " + record.id,
      );
    }
  }

  const projectIds = new Set<string>();
  for (const project of dataset.governmentProjects) {
    checkPersonAndPosition(project);
    assertCondition(
      !projectIds.has(project.id),
      'duplicate government project id: ' + project.id,
    );
    projectIds.add(project.id);
    assertCondition(
      sourceIds.has(project.sourceId),
      'project cites unknown source: ' + project.id,
    );
    if (project.startDate !== null) {
      assertCondition(
        project.startDate >= '2000-01-01',
        'project start out of range: ' + project.id,
      );
      assertCondition(
        project.startDate <= dataset.researchCutoff,
        'project starts after research cutoff: ' + project.id,
      );
      if (project.endDate) {
        assertCondition(
          project.startDate <= project.endDate,
          'project ends before it starts: ' + project.id,
        );
      }
    }
    if (project.endDate) {
      assertCondition(
        project.endDate <= dataset.researchCutoff,
        'project ends after research cutoff: ' + project.id,
      );
    }
    assertCondition(
      project.status !== 'completed' ||
        project.startDate !== null ||
        project.endDate !== null ||
        project.positionPeriod !== null,
      'completed project lacks any date or service period: ' + project.id,
    );
  }

  const proposalIds = new Set<string>();
  const billKeys = new Set<string>();
  for (const proposal of dataset.legislativeProposals) {
    checkPersonAndPosition(proposal);
    assertCondition(
      !proposalIds.has(proposal.id),
      'duplicate legislative proposal id: ' + proposal.id,
    );
    proposalIds.add(proposal.id);
    assertCondition(
      sourceIds.has(proposal.sourceId),
      'proposal cites unknown source: ' + proposal.id,
    );
    const billKey = proposal.candidateId + '|' + proposal.billId;
    assertCondition(
      !billKeys.has(billKey),
      'duplicate bill for candidate: ' + proposal.id,
    );
    billKeys.add(billKey);
    if (proposal.proposedAt) {
      assertCondition(
        proposal.proposedAt >= '2000-01-01',
        'proposal date out of range: ' + proposal.id,
      );
      assertCondition(
        proposal.proposedAt <= dataset.researchCutoff,
        'proposal after research cutoff: ' + proposal.id,
      );
    }
    if (proposal.latestProgressDate) {
      assertCondition(
        proposal.proposedAt === null ||
          proposal.proposedAt <= proposal.latestProgressDate,
        'proposal progresses before it was proposed: ' + proposal.id,
      );
    }
    if (proposal.officialUrl !== null) {
      assertCondition(
        proposal.officialUrl.startsWith('https://'),
        'proposal official url is not https: ' + proposal.id,
      );
    }
  }

  const voteIds = new Set<string>();
  for (const vote of dataset.votingRecords) {
    checkPersonAndPosition(vote);
    assertCondition(
      !voteIds.has(vote.id),
      'duplicate voting record id: ' + vote.id,
    );
    voteIds.add(vote.id);
    assertCondition(
      sourceIds.has(vote.sourceId),
      'vote cites unknown source: ' + vote.id,
    );
    assertCondition(
      vote.votedAt >= '2000-01-01',
      'vote date out of range: ' + vote.id,
    );
    assertCondition(
      vote.votedAt <= dataset.researchCutoff,
      'vote after research cutoff: ' + vote.id,
    );
    assertCondition(
      vote.voteType === 'roll-call' || vote.individualVote === 'unknown',
      'non roll-call vote must not claim an individual position: ' + vote.id,
    );
    assertCondition(
      vote.voteType !== 'roll-call' || vote.individualVote !== 'unknown',
      'roll-call vote lacks an individual record: ' + vote.id,
    );
    if (vote.tally) {
      const { attending, for: forCount, against, abstain } = vote.tally;
      if (attending !== null) {
        assertCondition(
          (forCount ?? 0) + (against ?? 0) + (abstain ?? 0) <= attending,
          'vote tally exceeds attendance: ' + vote.id,
        );
      }
    }
  }

  const perCandidateProjects = new Map<string, number>();
  const perCandidateProposals = new Map<string, number>();
  const perCandidateVotes = new Map<string, number>();
  for (const project of dataset.governmentProjects) {
    perCandidateProjects.set(
      project.candidateId,
      (perCandidateProjects.get(project.candidateId) ?? 0) + 1,
    );
  }
  for (const proposal of dataset.legislativeProposals) {
    perCandidateProposals.set(
      proposal.candidateId,
      (perCandidateProposals.get(proposal.candidateId) ?? 0) + 1,
    );
  }
  for (const vote of dataset.votingRecords) {
    perCandidateVotes.set(
      vote.candidateId,
      (perCandidateVotes.get(vote.candidateId) ?? 0) + 1,
    );
  }

  for (const row of dataset.coverage) {
    const terms = dataset.officeTerms.filter(
      (term) => term.candidateId === row.candidateId,
    );
    const officeTerms = terms.length;
    const activities = perCandidate.get(row.candidateId) ?? 0;
    const projects = perCandidateProjects.get(row.candidateId) ?? 0;
    const proposals = perCandidateProposals.get(row.candidateId) ?? 0;
    const votes = perCandidateVotes.get(row.candidateId) ?? 0;
    assertCondition(
      row.officeTermCount === officeTerms,
      'coverage office term count mismatch: ' + row.candidateId,
    );
    assertCondition(
      row.activityCount === activities,
      'coverage activity count mismatch: ' + row.candidateId,
    );
    assertCondition(
      row.governmentPositionCount ===
        terms.filter((term) => term.positionType === 'government-employment')
          .length,
      'coverage government position count mismatch: ' + row.candidateId,
    );
    assertCondition(
      row.legislativePositionCount ===
        terms.filter((term) => term.positionType === 'legislative-office')
          .length,
      'coverage legislative position count mismatch: ' + row.candidateId,
    );
    assertCondition(
      row.councilPositionCount ===
        terms.filter((term) => term.positionType === 'council-office').length,
      'coverage council position count mismatch: ' + row.candidateId,
    );
    assertCondition(
      row.electedOfficeCount ===
        terms.filter((term) => term.positionType === 'elected-office').length,
      'coverage elected office count mismatch: ' + row.candidateId,
    );
    assertCondition(
      row.governmentProjectCount === projects,
      'coverage project count mismatch: ' + row.candidateId,
    );
    assertCondition(
      row.legislativeProposalCount === proposals,
      'coverage proposal count mismatch: ' + row.candidateId,
    );
    assertCondition(
      row.votingRecordCount === votes,
      'coverage vote count mismatch: ' + row.candidateId,
    );
    const total = officeTerms + activities + projects + proposals + votes;
    assertCondition(
      row.status === 'records-found' ? total > 0 : total === 0,
      'coverage status contradicts records: ' + row.candidateId,
    );
  }

  assertCondition(
    dataset.review.status === 'approved' && dataset.review.approvedAt !== null,
    'political-career dataset is not approved for publication',
  );
  assertCondition(
    dataset.review.limitations.length > 0,
    'political-career dataset lacks published limitations',
  );

  const statuses = dataset.coverage.reduce<Record<string, number>>(
    (accumulator, row) => {
      accumulator[row.status] = (accumulator[row.status] ?? 0) + 1;
      return accumulator;
    },
    {},
  );

  console.log(
    '[validate:political-career] ' +
      [
        dataset.activities.length + ' activities',
        dataset.officeTerms.length + ' office terms',
        dataset.sources.length + ' sources',
        dataset.coverage.length + ' coverage rows',
        'records-found: ' + (statuses['records-found'] ?? 0),
        'no-verifiable-record-found: ' +
          (statuses['no-verifiable-record-found'] ?? 0),
      ].join(', '),
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
