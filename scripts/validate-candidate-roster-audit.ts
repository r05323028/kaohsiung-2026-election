import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

type Obj = Record<string, unknown>;
type Category =
  | 'basic-profile'
  | 'biography'
  | 'news'
  | 'public-records'
  | 'political-career'
  | 'policy'
  | 'political-family';

const ROOT = process.cwd();
const ROSTER = 'data/approved/2026/kaohsiung-election.json';
const OUT = 'reports/candidate-roster-audit';
const CATEGORIES: Category[] = [
  'basic-profile',
  'biography',
  'news',
  'public-records',
  'political-career',
  'policy',
  'political-family',
];

function read(path: string): Obj {
  try {
    const parsed: unknown = JSON.parse(
      readFileSync(resolve(ROOT, path), 'utf8'),
    );
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed)
    ) {
      return parsed as Obj;
    }
    throw new Error('expected a JSON object');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error('Unable to read ' + path + ': ' + message);
  }
}
function list(value: unknown, key: string): unknown[] {
  const result =
    value !== null && typeof value === 'object'
      ? (value as Obj)[key]
      : undefined;
  return Array.isArray(result) ? result : [];
}
function stringAt(value: unknown, key: string): string | undefined {
  if (value === null || typeof value !== 'object') return undefined;
  const result = (value as Obj)[key];
  return typeof result === 'string' ? result : undefined;
}
function boolAt(value: unknown, key: string): boolean {
  return (
    value !== null && typeof value === 'object' && (value as Obj)[key] === true
  );
}
function numberAt(value: unknown, key: string): number | undefined {
  if (value === null || typeof value !== 'object') return undefined;
  const result = (value as Obj)[key];
  return typeof result === 'number' && Number.isFinite(result)
    ? result
    : undefined;
}
function candidateId(value: unknown): string | undefined {
  return stringAt(value, 'candidateId') ?? stringAt(value, 'id');
}
function hash(path: string): string {
  return createHash('sha256')
    .update(readFileSync(resolve(ROOT, path)))
    .digest('hex');
}
function sorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}
function equalSet(left: Iterable<string>, right: Iterable<string>): boolean {
  const a = sorted(left);
  const b = sorted(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
function fail(message: string): never {
  throw new Error(message);
}
function assert(condition: boolean, message: string): asserts condition {
  if (!condition) fail(message);
}
function rosterCategory(
  value: unknown,
): 'mayor' | 'ordinary-council' | 'indigenous-council' {
  const electionType =
    stringAt(value, 'electionType') ?? stringAt(value, 'constituencyType');
  if (electionType === 'mayoral') return 'mayor';
  if (electionType === 'city-council' || electionType === 'ordinary-council') {
    return 'ordinary-council';
  }
  if (electionType === 'indigenous-council') return 'indigenous-council';
  fail(
    'canonical roster has unsupported electionType: ' + String(electionType),
  );
}
function countWhere(
  values: unknown[],
  predicate: (value: unknown) => boolean,
): number {
  return values.filter(predicate).length;
}

function validate(): void {
  const roster = read(ROSTER);
  const rosterCandidates = list(roster, 'candidates');
  const rosterIds = sorted(
    rosterCandidates
      .map((value) => candidateId(value))
      .filter((value): value is string => Boolean(value)),
  );
  assert(
    rosterIds.length === 106,
    'canonical roster must contain exactly 106 candidate IDs',
  );
  assert(
    new Set(rosterIds).size === rosterIds.length,
    'canonical roster contains duplicate candidate IDs',
  );

  const coverage = read(OUT + '/coverage.json');
  const claimsReport = read(OUT + '/claims.json');
  const provenanceReport = read(OUT + '/provenance.json');
  const gapsReport = read(OUT + '/gaps.json');
  const audits = list(coverage, 'categoryAudits');
  const claims = list(claimsReport, 'claims');
  const sources = list(provenanceReport, 'sources');
  const gaps = list(gapsReport, 'gaps');

  const selectedPublicRecords = read(
    'data/approved/2026/kaohsiung-public-records.json',
  );
  const selectedClaims = list(selectedPublicRecords, 'claims');
  const selectedEvidenceById = new Map(
    list(selectedPublicRecords, 'evidence')
      .map((value) => {
        const id = stringAt(value, 'evidenceId') ?? stringAt(value, 'id');
        return id ? ([id, value] as const) : null;
      })
      .filter((value): value is readonly [string, unknown] => value !== null),
  );

  const reportRoster = (coverage.roster ?? {}) as Obj;
  const reportIds = list(reportRoster, 'candidateIds').filter(
    (value): value is string => typeof value === 'string',
  );
  assert(
    equalSet(reportIds, rosterIds),
    'coverage roster IDs do not exactly equal the canonical roster',
  );
  assert(
    numberAt(reportRoster, 'candidateCount') === rosterIds.length,
    'coverage roster count is stale',
  );
  const expectedCategoryCounts = {
    mayor: 5,
    ordinaryCouncil: 91,
    indigenousCouncil: 10,
  };
  const reportCategoryCounts = (reportRoster.categoryCounts ?? {}) as Obj;
  assert(
    numberAt(reportCategoryCounts, 'mayor') === expectedCategoryCounts.mayor &&
      numberAt(reportCategoryCounts, 'ordinaryCouncil') ===
        expectedCategoryCounts.ordinaryCouncil &&
      numberAt(reportCategoryCounts, 'indigenousCouncil') ===
        expectedCategoryCounts.indigenousCouncil,
    'coverage roster category counts are stale or incorrect',
  );
  const coverageCandidates = list(coverage, 'candidateCoverage');
  assert(
    coverageCandidates.length === rosterIds.length,
    'coverage must contain one candidateCoverage row per canonical candidate',
  );
  const coverageById = new Map<string, Obj>();
  for (const value of coverageCandidates) {
    assert(
      value !== null && typeof value === 'object' && !Array.isArray(value),
      'candidateCoverage row must be an object',
    );
    const row = value as Obj;
    const id = candidateId(row);
    assert(Boolean(id), 'candidateCoverage row is missing candidateId');
    assert(
      !coverageById.has(id as string),
      'duplicate candidateCoverage row: ' + id,
    );
    coverageById.set(id as string, row);
  }
  for (const value of rosterCandidates) {
    const row = value as Obj;
    const id = candidateId(row);
    assert(Boolean(id), 'canonical candidate is missing an ID');
    const report = coverageById.get(id as string);
    assert(
      Boolean(report),
      'candidateCoverage is missing canonical candidate: ' + id,
    );
    assert(
      stringAt(report, 'displayName') === stringAt(row, 'displayName'),
      'candidateCoverage displayName mismatch: ' + id,
    );
    assert(
      stringAt(report, 'districtId') === stringAt(row, 'districtId'),
      'candidateCoverage district mismatch: ' + id,
    );
    assert(
      stringAt(report, 'category') === rosterCategory(row),
      'candidateCoverage category mismatch: ' + id,
    );
  }
  assert(
    audits.length === rosterIds.length * CATEGORIES.length,
    'coverage must contain 106 × 7 category rows',
  );

  const auditMap = new Map<string, Obj>();
  for (const value of audits) {
    assert(
      value !== null && typeof value === 'object' && !Array.isArray(value),
      'category audit must be an object',
    );
    const row = value as Obj;
    const id = candidateId(row);
    const category = stringAt(row, 'category');
    assert(
      Boolean(id && category),
      'category audit is missing candidateId or category',
    );
    assert(
      rosterIds.includes(id as string),
      'category audit references an unknown candidate: ' + id,
    );
    assert(
      CATEGORIES.includes(category as Category),
      'category audit references an unknown category: ' + category,
    );
    const key = id + ':' + category;
    assert(!auditMap.has(key), 'duplicate category audit row: ' + key);
    auditMap.set(key, row);
    assert(
      boolAt(row, 'isNegativeEvidence') === false,
      'category audit cannot mark negative evidence: ' + key,
    );
  }
  for (const id of rosterIds) {
    for (const category of CATEGORIES) {
      assert(
        auditMap.has(id + ':' + category),
        'missing category audit row: ' + id + ':' + category,
      );
    }
  }

  const claimMap = new Map<string, Obj>();
  for (const value of claims) {
    assert(
      value !== null && typeof value === 'object' && !Array.isArray(value),
      'claim must be an object',
    );
    const row = value as Obj;
    const id = stringAt(row, 'claimId');
    const candidate = candidateId(row);
    const category = stringAt(row, 'category');
    assert(
      Boolean(id && candidate && category),
      'claim is missing claimId, candidateId, or category',
    );
    assert(!claimMap.has(id as string), 'duplicate claim ID: ' + id);
    assert(
      rosterIds.includes(candidate as string),
      'claim references unknown candidate: ' + candidate,
    );
    assert(
      CATEGORIES.includes(category as Category),
      'claim references unknown category: ' + category,
    );
    assert(
      boolAt(row, 'isNegativeEvidence') === false,
      'claim cannot mark negative evidence: ' + id,
    );
    claimMap.set(id as string, row);
  }

  const sourceMap = new Map<string, Obj>();
  for (const value of sources) {
    assert(
      value !== null && typeof value === 'object' && !Array.isArray(value),
      'provenance row must be an object',
    );
    const row = value as Obj;
    const id = stringAt(row, 'provenanceId');
    const integrity = stringAt(row, 'integrity');
    assert(
      Boolean(id && integrity),
      'provenance row is missing provenanceId or integrity',
    );
    assert(!sourceMap.has(id as string), 'duplicate provenance ID: ' + id);
    sourceMap.set(id as string, row);
    assert(
      !['hash-mismatch', 'retained-source-missing'].includes(
        integrity as string,
      ),
      'provenance integrity failure: ' + id + ' (' + integrity + ')',
    );
    for (const candidate of list(row, 'candidateIds')) {
      assert(
        typeof candidate === 'string' && rosterIds.includes(candidate),
        'provenance has unknown candidate: ' + candidate,
      );
    }
    for (const claim of list(row, 'claimIds')) {
      assert(
        typeof claim === 'string' && claimMap.has(claim),
        'provenance links an unknown claim: ' + claim,
      );
    }
  }

  const referencedProvenance = new Set<string>();
  const referencedClaims = new Set<string>();
  for (const value of claims) {
    const row = value as Obj;
    const id = stringAt(row, 'claimId') as string;
    const candidate = candidateId(row) as string;
    const category = stringAt(row, 'category') as string;
    for (const provenanceId of list(row, 'provenanceIds')) {
      assert(
        typeof provenanceId === 'string' && sourceMap.has(provenanceId),
        'claim links unknown provenance: ' + id,
      );
      referencedProvenance.add(provenanceId as string);
    }
    const audit = auditMap.get(candidate + ':' + category);
    assert(Boolean(audit), 'claim has no category audit: ' + id);
    const auditClaims = list(audit, 'claimIds');
    assert(auditClaims.includes(id), 'category audit omits claim: ' + id);
    referencedClaims.add(id);
  }
  assert(
    referencedClaims.size === claimMap.size,
    'not all claims were traversed',
  );

  const selectedClaimIds = new Set<string>();
  for (const value of selectedClaims) {
    const originalId = stringAt(value, 'claimId');
    assert(
      Boolean(originalId),
      'selected public-record claim is missing claimId',
    );
    assert(
      !selectedClaimIds.has(originalId as string),
      'duplicate selected public-record claim: ' + originalId,
    );
    selectedClaimIds.add(originalId as string);
    const generated = claimMap.get('public-records:selected:' + originalId);
    assert(
      Boolean(generated),
      'audit is missing selected public-record claim: ' + originalId,
    );
    const inputEvidenceIds = sorted(
      list(value, 'evidenceIds').filter(
        (evidenceId): evidenceId is string => typeof evidenceId === 'string',
      ),
    );
    const generatedEvidenceIds = sorted(
      list(generated, 'evidenceIds').filter(
        (evidenceId): evidenceId is string => typeof evidenceId === 'string',
      ),
    );
    assert(
      equalSet(generatedEvidenceIds, inputEvidenceIds),
      'selected claim evidence mapping mismatch: ' + originalId,
    );
    for (const evidenceId of inputEvidenceIds) {
      const evidence = selectedEvidenceById.get(evidenceId);
      assert(
        Boolean(evidence),
        'selected claim has unknown evidence: ' + evidenceId,
      );
      assert(
        stringAt(evidence, 'claimId') === originalId,
        'selected evidence points to a different claim: ' + evidenceId,
      );
    }
  }

  for (const value of audits) {
    const row = value as Obj;
    const id = candidateId(row) as string;
    const category = stringAt(row, 'category') as string;
    const rowClaims = list(row, 'claimIds');
    const expectedClaims = claims.filter(
      (claim) =>
        candidateId(claim) === id && stringAt(claim, 'category') === category,
    );
    assert(
      rowClaims.length === expectedClaims.length,
      'category audit claim count mismatch: ' + id + ':' + category,
    );
    for (const claim of rowClaims) {
      assert(
        typeof claim === 'string' && claimMap.has(claim),
        'category audit links unknown claim: ' + claim,
      );
    }
    const expectedPublished = countWhere(expectedClaims, (claim) =>
      boolAt(claim, 'staticallyPublished'),
    );
    const expectedApproved = countWhere(expectedClaims, (claim) =>
      boolAt(claim, 'approvedLayer'),
    );
    const expectedHuman = countWhere(expectedClaims, (claim) =>
      boolAt(claim, 'humanReviewed'),
    );
    const expectedEditorial = countWhere(expectedClaims, (claim) =>
      boolAt(claim, 'editoriallyApproved'),
    );
    assert(
      numberAt(row, 'staticallyPublishedClaimCount') === expectedPublished,
      'published claim count mismatch: ' + id + ':' + category,
    );
    assert(
      numberAt(row, 'approvedLayerClaimCount') === expectedApproved,
      'approved-layer count mismatch: ' + id + ':' + category,
    );
    assert(
      numberAt(row, 'humanReviewedClaimCount') === expectedHuman,
      'human-review count mismatch: ' + id + ':' + category,
    );
    assert(
      numberAt(row, 'editoriallyApprovedClaimCount') === expectedEditorial,
      'editorial-approval count mismatch: ' + id + ':' + category,
    );
    const gapCode = stringAt(row, 'gapCode');
    assert(
      Boolean(gapCode),
      'category audit has no gap code: ' + id + ':' + category,
    );
    assert(
      boolAt(row, 'isNegativeEvidence') === false,
      'category audit cannot mark negative evidence: ' + id + ':' + category,
    );
  }

  const reviewerRegistry = read('data/editorial/reviewer-registry.json');
  const reviewerCount = list(reviewerRegistry, 'reviewers').length;
  const decisionPath = resolve(
    ROOT,
    'data/editorial/decisions/2026/biography-decisions.json',
  );
  const decisionCount = existsSync(decisionPath)
    ? list(
        read('data/editorial/decisions/2026/biography-decisions.json'),
        'decisions',
      ).length
    : 0;
  if (reviewerCount === 0 || decisionCount === 0) {
    assert(
      countWhere(claims, (value) => boolAt(value, 'humanReviewed')) === 0,
      'human-reviewed claims exist without an authorized reviewer and decision',
    );
    assert(
      countWhere(claims, (value) => boolAt(value, 'editoriallyApproved')) === 0,
      'editorially approved claims exist without an authorized reviewer and decision',
    );
  }

  const inputFiles = list(coverage, 'inputFiles');
  for (const value of inputFiles) {
    assert(
      value !== null && typeof value === 'object' && !Array.isArray(value),
      'input manifest row must be an object',
    );
    const row = value as Obj;
    const path = stringAt(row, 'path');
    const expectedHash = stringAt(row, 'sha256');
    const expectedBytes = numberAt(row, 'byteLength');
    assert(
      Boolean(path && expectedHash && expectedBytes !== undefined),
      'input manifest row is incomplete',
    );
    const fullPath = resolve(ROOT, path as string);
    assert(existsSync(fullPath), 'input manifest source is missing: ' + path);
    assert(
      hash(path as string) === expectedHash,
      'input manifest hash changed: ' + path,
    );
    assert(
      statSync(fullPath).size === expectedBytes,
      'input manifest byte length changed: ' + path,
    );
  }

  const gapSet = new Set(
    gaps.map((value) => {
      const row = value as Obj;
      return String(candidateId(row)) + ':' + String(stringAt(row, 'category'));
    }),
  );
  for (const value of audits) {
    const row = value as Obj;
    const key =
      String(candidateId(row)) + ':' + String(stringAt(row, 'category'));
    const code = stringAt(row, 'gapCode');
    assert(
      (code !== 'none') === gapSet.has(key),
      'neutral gap report does not match category audit: ' + key,
    );
  }
  assert(
    countWhere(gaps, (value) => boolAt(value, 'isNegativeEvidence')) === 0,
    'gaps report contains negative evidence',
  );

  const markdownPath = resolve(ROOT, OUT + '/audit.md');
  assert(existsSync(markdownPath), 'audit Markdown report is missing');
  const markdownRows = readFileSync(markdownPath, 'utf8')
    .split('\n')
    .filter((line) => line.startsWith('| ') && !line.startsWith('| ---'));
  for (const category of CATEGORIES) {
    const row = markdownRows.find((line) =>
      line.startsWith('| ' + category + ' |'),
    );
    assert(Boolean(row), 'audit Markdown is missing category row: ' + category);
    const cells = (row as string).split('|').map((cell) => cell.trim());
    const categoryAudits = audits.filter(
      (value) => stringAt(value, 'category') === category,
    );
    const expectedGapCount = countWhere(
      categoryAudits,
      (value) => stringAt(value, 'gapCode') !== 'none',
    );
    assert(
      Number(cells[5]) === expectedGapCount,
      'audit Markdown gap count mismatch: ' + category,
    );
  }

  const lifecycle = (coverage.lifecycle ?? {}) as Obj;
  assert(
    numberAt(lifecycle, 'authorizedReviewerCount') === reviewerCount,
    'coverage reviewer count is stale',
  );
  assert(
    numberAt(lifecycle, 'editorialDecisionCount') === decisionCount,
    'coverage decision count is stale',
  );
  assert(
    numberAt(coverage.claims, 'count') === claims.length,
    'coverage total claim count is stale',
  );
  assert(
    numberAt(coverage.provenance, 'count') === sources.length,
    'coverage provenance count is stale',
  );
  console.log(
    'Candidate roster audit validation passed: ' +
      rosterIds.length +
      ' candidates, ' +
      audits.length +
      ' category rows, ' +
      claims.length +
      ' claims, ' +
      sources.length +
      ' provenance rows.',
  );
}

try {
  validate();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
