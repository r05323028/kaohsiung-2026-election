import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import approvedRoster from '../data/approved/2026/kaohsiung-election.json';
import { validatePoliticalCareerDataset, type PoliticalCareerDataset } from '../src/data/political-career/schema';

const ROOT = resolve('.');
const DATASET_PATH = resolve(ROOT, 'data/approved/2026/political-career.json');

function fail(message: string): never {
  throw new Error(message);
}

function assertCondition(condition: unknown, message: string): asserts condition {
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
  assertCondition(existsSync(DATASET_PATH), 'political-career dataset is missing: data/approved/2026/political-career.json');
  const dataset = JSON.parse(readFileSync(DATASET_PATH, 'utf8')) as PoliticalCareerDataset;
  validatePoliticalCareerDataset(dataset);

  const candidates = (approvedRoster as { candidates: RosterCandidate[] }).candidates;
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  assertCondition(candidates.length === 106, 'roster candidate count changed: ' + candidates.length);
  const rosterNames = candidates.map((candidate) => candidate.displayName).filter((name) => name.length >= 2);

  const sourceIds = new Set<string>();
  for (const source of dataset.sources) {
    assertCondition(!sourceIds.has(source.sourceId), 'duplicate source id: ' + source.sourceId);
    sourceIds.add(source.sourceId);
    assertCondition(source.url.startsWith('https://'), 'source is not https: ' + source.url);
    if (source.rawPath !== null) {
      const absolute = resolve(ROOT, source.rawPath);
      assertCondition(existsSync(absolute), 'retained source file missing: ' + source.rawPath);
      assertCondition(source.sha256 !== null, 'retained source lacks sha256: ' + source.sourceId);
      assertCondition(sha256(absolute) === source.sha256, 'retained source hash mismatch: ' + source.rawPath);
    }
  }

  const coverageIds = new Set<string>();
  for (const row of dataset.coverage) {
    assertCondition(byId.has(row.candidateId), 'coverage row for unknown candidate: ' + row.candidateId);
    assertCondition(!coverageIds.has(row.candidateId), 'duplicate coverage row: ' + row.candidateId);
    coverageIds.add(row.candidateId);
    assertCondition(row.searchedSourceIds.every((id) => sourceIds.has(id)), 'coverage row cites unknown source: ' + row.candidateId);
  }
  for (const candidate of candidates) {
    assertCondition(coverageIds.has(candidate.id), 'missing coverage row for candidate: ' + candidate.id);
  }

  const personByCandidate = new Map<string, string>();
  const officeIds = new Set<string>();
  for (const term of dataset.officeTerms) {
    const candidate = byId.get(term.candidateId);
    assertCondition(candidate, 'office term for unknown candidate: ' + term.candidateId);
    const existingPerson = personByCandidate.get(term.candidateId);
    assertCondition(
      existingPerson === undefined || existingPerson === term.personId,
      'office term person mismatch: ' + term.id,
    );
    personByCandidate.set(term.candidateId, term.personId);
    assertCondition(!officeIds.has(term.id), 'duplicate office term id: ' + term.id);
    officeIds.add(term.id);
    assertCondition(
      term.termNumbers.length > 0 || term.termLabel === '屆次未載明',
      'office term lacks term numbers without saying so: ' + term.id,
    );
    assertCondition(term.sourceIds.length > 0, 'office term lacks sources: ' + term.id);
    assertCondition(term.sourceIds.every((id) => sourceIds.has(id)), 'office term cites unknown source: ' + term.id);
    if (term.startDate && term.endDate) {
      assertCondition(term.startDate <= term.endDate, 'office term ends before it starts: ' + term.id);
    }
  }

  const activityIds = new Set<string>();
  const perCandidate = new Map<string, number>();
  for (const activity of dataset.activities) {
    const candidate = byId.get(activity.candidateId);
    assertCondition(candidate, 'activity for unknown candidate: ' + activity.candidateId);
    const existingPerson = personByCandidate.get(activity.candidateId);
    assertCondition(
      existingPerson === undefined || existingPerson === activity.personId,
      'activity person mismatch: ' + activity.id,
    );
    personByCandidate.set(activity.candidateId, activity.personId);
    assertCondition(!activityIds.has(activity.id), 'duplicate activity id: ' + activity.id);
    activityIds.add(activity.id);
    assertCondition(sourceIds.has(activity.sourceId), 'activity cites unknown source: ' + activity.id);
    assertCondition(activity.date >= '2000-01-01', 'activity date out of range: ' + activity.id);
    assertCondition(activity.date <= dataset.researchCutoff, 'activity after research cutoff: ' + activity.id);
    assertCondition(activity.evidenceExcerpt.trim().length > 0, 'activity lacks evidence excerpt: ' + activity.id);
    assertCondition(activity.identityBasis.trim().length > 0, 'activity lacks identity basis: ' + activity.id);
    assertCondition(
      activity.outcomeStatus !== 'institutional-response' || activity.outcome !== null,
      'activity claims an institutional response without outcome text: ' + activity.id,
    );
    assertCondition(
      activity.outcome === null || !rosterNames.some((name) => name !== candidate.displayName && activity.outcome?.includes(name)),
      'activity outcome names another candidate: ' + activity.id,
    );
    assertCondition(
      !rosterNames.some((name) => name !== candidate.displayName && activity.description.includes(name)),
      'activity description attributes another candidate\'s statement to ' + candidate.displayName + ': ' + activity.id,
    );
    perCandidate.set(activity.candidateId, (perCandidate.get(activity.candidateId) ?? 0) + 1);
  }

  for (const [candidateId, count] of perCandidate) {
    assertCondition(count <= 40, 'candidate exceeds retained activity cap: ' + candidateId + ' (' + count + ')');
  }

  for (const row of dataset.coverage) {
    const officeTerms = dataset.officeTerms.filter((term) => term.candidateId === row.candidateId).length;
    const activities = perCandidate.get(row.candidateId) ?? 0;
    assertCondition(row.officeTermCount === officeTerms, 'coverage office term count mismatch: ' + row.candidateId);
    assertCondition(row.activityCount === activities, 'coverage activity count mismatch: ' + row.candidateId);
    assertCondition(
      row.status === 'records-found' ? officeTerms + activities > 0 : officeTerms + activities === 0,
      'coverage status contradicts records: ' + row.candidateId,
    );
  }

  assertCondition(dataset.review.status === 'approved' && dataset.review.approvedAt !== null, 'political-career dataset is not approved for publication');
  assertCondition(dataset.review.limitations.length > 0, 'political-career dataset lacks published limitations');

  const statuses = dataset.coverage.reduce<Record<string, number>>((accumulator, row) => {
    accumulator[row.status] = (accumulator[row.status] ?? 0) + 1;
    return accumulator;
  }, {});

  console.log(
    '[validate:political-career] ' +
      [
        dataset.activities.length + ' activities',
        dataset.officeTerms.length + ' office terms',
        dataset.sources.length + ' sources',
        dataset.coverage.length + ' coverage rows',
        'records-found: ' + (statuses['records-found'] ?? 0),
        'no-verifiable-record-found: ' + (statuses['no-verifiable-record-found'] ?? 0),
      ].join(', '),
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
