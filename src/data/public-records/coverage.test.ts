import { describe, expect, it } from 'vitest';
import officialInput from '../../../data/approved/2026/kaohsiung-election.json';
import manifestInput from '../../../data/official-source-manifest.json';
import { parseCoverageArgs } from '../../../scripts/public-records-coverage';
import { validateOfficialDataset } from '../official/schema';
import {
  buildClaimRevisions,
  buildCoverageDataset,
  buildCoverageReport,
  buildReviewPacket,
  buildTimelineEvents,
  type CoverageSourceCheck,
  coverageAuditKey,
  deduplicateNewsRecords,
  mergeCoverageAudits,
  PUBLIC_RECORD_CATEGORIES,
  validateCoverageDataset,
  validatePositionDateRanges,
} from './coverage';
import { resolveCandidateIdentity } from './identity';
import { publicRecordsDataset } from './index';

const roster = validateOfficialDataset(officialInput);
const manifestSourceIds = new Set(
  manifestInput.sources.map((source) => source.id),
);
const sourceChecks: CoverageSourceCheck[] = manifestInput.sources.map(
  (source) => ({
    sourceId: source.id,
    expectedSha256: source.sha256 ?? null,
    actualSha256: source.sha256 ?? null,
    status: 'unchanged',
    rawPath: source.rawPath ?? null,
    role: source.role ?? 'official-source',
    checkedAt: '2026-11-05T00:00:00Z',
  }),
);

function buildFullCoverage() {
  return buildCoverageDataset(
    roster,
    publicRecordsDataset,
    manifestInput.sources,
    sourceChecks,
    {
      snapshotDate: '2026-11-05',
      runId: 'test-full-roster',
      command: 'validate',
      dryRun: false,
      retryLimit: 2,
      concurrency: 4,
      resumedFromRunId: null,
    },
  );
}

describe('full-roster coverage', () => {
  it('creates exactly one audit for every official candidate and category', () => {
    const coverage = validateCoverageDataset(
      buildFullCoverage(),
      roster,
      manifestSourceIds,
    );
    expect(coverage.candidateCount).toBe(106);
    expect(coverage.audits).toHaveLength(106 * PUBLIC_RECORD_CATEGORIES.length);
    expect(new Set(coverage.audits.map((audit) => audit.auditId)).size).toBe(
      coverage.audits.length,
    );
    expect(
      coverage.audits.some(
        (audit) =>
          audit.displayName === '賴瑞隆' &&
          audit.discoveryStatus === 'not-attempted',
      ),
    ).toBe(true);
  });

  it('parses filters and preserves a prior baseline during resume', () => {
    const parsed = parseCoverageArgs([
      'discover',
      '--candidate',
      'candidate-a,candidate-b',
      '--district',
      'district-a',
      '--category',
      'news',
      '--dry-run',
      '--resume',
      '--retries',
      '2',
      '--concurrency',
      '4',
    ]);
    expect(parsed).toMatchObject({
      command: 'discover',
      candidateIds: ['candidate-a', 'candidate-b'],
      districtIds: ['district-a'],
      category: 'news',
      dryRun: true,
      resume: true,
      retryLimit: 2,
      concurrency: 4,
    });
    const baseline = buildFullCoverage();
    const firstCandidate = roster.candidates.at(0);
    if (!firstCandidate)
      throw new Error('Expected an official roster candidate.');
    const resumed = buildCoverageDataset(
      roster,
      publicRecordsDataset,
      manifestInput.sources,
      sourceChecks,
      {
        snapshotDate: '2026-11-05',
        runId: 'test-resumed-roster',
        command: 'discover',
        candidateIds: new Set([firstCandidate.id]),
        category: 'news',
        dryRun: true,
        retryLimit: 1,
        concurrency: 2,
        resumedFromRunId: baseline.batch.runId,
      },
      baseline,
    );
    expect(resumed.previousBaseline).toBe('available');
    expect(resumed.batch.resumedFromRunId).toBe('test-full-roster');
    expect(resumed.audits).toHaveLength(106 * PUBLIC_RECORD_CATEGORIES.length);
  });

  it('keeps report integrity assertions and review metadata neutral', () => {
    const coverage = validateCoverageDataset(
      buildFullCoverage(),
      roster,
      manifestSourceIds,
    );
    const report = buildCoverageReport(coverage, roster);
    const review = buildReviewPacket(coverage, publicRecordsDataset);
    expect(report.integrityAssertions).toEqual({
      demoCandidatesIncluded: false,
      nameOnlyMatchesPublished: false,
      unsupportedClaimsGenerated: false,
      reviewerMetadataInvented: false,
      candidateRankingProduced: false,
      singleCompletenessScoreProduced: false,
    });
    expect(review.reviewerId).toBeNull();
    expect(review.reviewedAt).toBeNull();
    expect(review.items.some((item) => item.itemType === 'coverage-gap')).toBe(
      true,
    );
  });
});

describe('coverage quality helpers', () => {
  it('withholds exact-name identity ties and resolves canonical IDs', () => {
    const candidates = [
      {
        candidateId: 'candidate-a',
        personId: 'person-a',
        displayName: '同名候選人',
        districtId: 'district-a',
        electionType: 'city-council' as const,
        currentPosition: '市議員',
      },
      {
        candidateId: 'candidate-b',
        personId: 'person-b',
        displayName: '同名候選人',
        districtId: 'district-b',
        electionType: 'city-council' as const,
        currentPosition: '市議員',
      },
    ];
    expect(
      resolveCandidateIdentity({ observedName: '同名候選人' }, candidates)
        .status,
    ).toBe('ambiguous');
    expect(
      resolveCandidateIdentity(
        { canonicalCandidateId: 'candidate-a', observedName: '其他' },
        candidates,
      ),
    ).toMatchObject({
      status: 'resolved',
      candidateId: 'candidate-a',
      confidence: 1,
    });
  });

  it('merges selected audit updates and rejects partial datasets', () => {
    const baseline = buildFullCoverage();
    const firstAudit = baseline.audits.at(0);
    const secondAudit = baseline.audits.at(1);
    if (!firstAudit || !secondAudit)
      throw new Error('Expected full-roster audit fixtures.');
    const update = {
      ...firstAudit,
      discoveryStatus: 'source-retrieved' as const,
      previousAuditStatus: firstAudit.discoveryStatus,
    };
    const merged = mergeCoverageAudits(
      baseline.audits,
      [update],
      new Set([coverageAuditKey(firstAudit.candidateId, firstAudit.category)]),
    );
    expect(merged[0]).toEqual(update);
    expect(merged[1]).toEqual(secondAudit);
    expect(buildClaimRevisions(publicRecordsDataset)).toHaveLength(6);
    expect(() =>
      validateCoverageDataset(
        { ...baseline, audits: baseline.audits.slice(0, -1) },
        roster,
        manifestSourceIds,
      ),
    ).toThrow();
  });

  it('deduplicates news and reports inverted position dates', () => {
    const first = publicRecordsDataset.news.at(0);
    const position = publicRecordsDataset.positions.at(0);
    if (!first || !position)
      throw new Error('Expected retained public-record fixtures.');
    const duplicate = { ...first, id: `${first.id}-duplicate` };
    const deduplicated = deduplicateNewsRecords([first, duplicate]);
    expect(deduplicated.records).toHaveLength(1);
    expect(deduplicated.duplicates).toHaveLength(1);
    expect(
      validatePositionDateRanges([
        { ...position, startDate: '2026-12-01', endDate: '2026-01-01' },
      ]),
    ).toEqual([`position ${position.id} has an inverted date range`]);
  });

  it('derives deterministic chronological events from a selected bundle', () => {
    const personId = publicRecordsDataset.claims.at(0)?.subjectId;
    if (!personId)
      throw new Error('Expected a selected public-record subject.');
    const bundle = {
      personId,
      claims: publicRecordsDataset.claims.filter(
        (claim) => claim.subjectId === personId,
      ),
      evidence: publicRecordsDataset.evidence,
      positions: publicRecordsDataset.positions.filter(
        (record) => record.personId === personId,
      ),
      policies: [],
      activities: publicRecordsDataset.activities.filter(
        (record) => record.personId === personId,
      ),
      news: publicRecordsDataset.news.filter((record) =>
        record.personIds.includes(personId),
      ),
      relationships: [],
      timeline: [],
      identityResolutions: publicRecordsDataset.identityResolutions.filter(
        (record) => record.personId === personId,
      ),
      conflicts: [],
    };
    const events = buildTimelineEvents(bundle);
    expect(events.length).toBeGreaterThan(0);
    expect(buildTimelineEvents(bundle)).toEqual(events);
    const datedEvents = events.flatMap((event) =>
      event.eventDate ? [event.eventDate] : [],
    );
    expect(datedEvents).toEqual([...datedEvents].sort());
  });
});
