import { describe, expect, it } from 'vitest';
import approvedInput from '../../../data/approved/2026/kaohsiung-election.json';
import councilRosterInput from '../../../data/normalized/2026/kaohsiung-council-roster.json';
import cecConstituencies from '../../../data/raw/official/2026/cec-central-63625.json';
import cecRegistration from '../../../data/raw/official/2026/cec-central-64009.json';
import cecQualification from '../../../data/raw/official/2026/cec-central-65213.json';
import khecDrawing from '../../../data/raw/official/2026/khec-65366.json';
import khecAlias from '../../../data/raw/official/2026/khec-65368.json';
import khecBulletin from '../../../data/raw/official/2026/khec-bulletin.json';
import cecMayoralDirectory from '../../../data/raw/official/2026/research/cec-vote2026-c1-64000.json';
import cecCouncilDirectory from '../../../data/raw/official/2026/research/cec-vote2026-t-64000.json';
import {
  normalizeMayorNames,
  parseCecArticleMetadata,
  parseCecCouncilCandidates,
  parseCecMayoralCandidates,
  parseCecQualifiedKaohsiungMayors,
  parseKhecBulletin,
  parseKhecDrawingMetadata,
  sourceChangeStatus,
} from './adapters';
import {
  councilCandidateSlug,
  councilCandidateStableId,
  khecAliasStatus,
  validateCouncilRoster,
} from './council';
import { reconcileOfficialData } from './reconcile';
import { validateOfficialDataset } from './schema';

describe('official source adapters', () => {
  it('extracts the five Kaohsiung mayor names from the retained CEC snapshot', () => {
    expect(
      parseCecQualifiedKaohsiungMayors(cecQualification)
        .map((candidate) => candidate.displayName)
        .sort(),
    ).toEqual(['張靜', '王肇民', '柯志恩', '洪方隆', '賴瑞隆'].sort());
  });

  it('extracts party, number, and ROC birth dates from the retained CEC directory', () => {
    expect(parseCecMayoralCandidates(cecMayoralDirectory)).toEqual([
      expect.objectContaining({
        displayName: '張靜',
        candidateNumber: '1',
        politicalParty: '司法改革黨',
        birthDate: '1956-05-27',
        sourceId: 'source-cec-vote2026-c1-64000',
      }),
      expect.objectContaining({
        displayName: '王肇民',
        candidateNumber: '2',
        politicalParty: '無',
        birthDate: '1963-08-29',
      }),
      expect.objectContaining({
        displayName: '柯志恩',
        candidateNumber: '3',
        politicalParty: '中國國民黨',
        birthDate: '1962-04-29',
      }),
      expect.objectContaining({
        displayName: '洪方隆',
        candidateNumber: '4',
        politicalParty: '無',
        birthDate: '1963-11-24',
      }),
      expect.objectContaining({
        displayName: '賴瑞隆',
        candidateNumber: '5',
        politicalParty: '民主進步黨',
        birthDate: '1973-11-15',
      }),
    ]);
  });

  it('extracts all council directory rows and preserves constituency types', () => {
    const candidates = parseCecCouncilCandidates(cecCouncilDirectory);
    expect(candidates).toHaveLength(101);
    expect(
      candidates.reduce<Record<string, number>>((counts, candidate) => {
        counts[candidate.voterType] = (counts[candidate.voterType] ?? 0) + 1;
        return counts;
      }, {}),
    ).toEqual({ '01': 91, '02': 7, '03': 3 });
    expect(new Set(candidates.map((candidate) => candidate.areaCode))).toEqual(
      new Set(
        Array.from({ length: 15 }, (_, index) =>
          String(index + 1).padStart(2, '0'),
        ),
      ),
    );
    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          areaCode: '14',
          candidateNumber: '1',
          displayName: '洪英雄 Salizan．binkinuan',
          politicalParty: '中國國民黨',
          birthDate: '1968-03-06',
        }),
        expect.objectContaining({
          areaCode: '14',
          candidateNumber: '3',
          displayName: '高忠德 Takiludun．Anu',
          politicalParty: '無',
          birthDate: '1972-02-18',
        }),
      ]),
    );
  });

  it('extracts official article and bulletin metadata deterministically', () => {
    expect(
      parseCecArticleMetadata(cecConstituencies, 'source-cec-central-63625'),
    ).toMatchObject({
      publicationDate: '2026-08-20',
      attachmentFileIds: expect.arrayContaining([
        '45d8e965-f63a-46d5-b636-7d81e47cf4d1',
      ]),
    });
    expect(
      parseCecArticleMetadata(cecRegistration, 'source-cec-central-64009'),
    ).toMatchObject({ publicationDate: '2026-08-27' });
    expect(parseKhecBulletin(khecBulletin)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          articleId: 65366,
          beginDate: '2026-10-27',
        }),
      ]),
    );
  });

  it('extracts KHEC drawing metadata and duplicate alias status', () => {
    const metadata = parseKhecDrawingMetadata(khecDrawing);
    const aliasMetadata = parseKhecDrawingMetadata(khecAlias);
    expect(metadata.fileId).toBe('9bd4f559-e527-4f55-a4ef-21653d340f79');
    expect(metadata.beginDate).toBe('2026-10-27');
    expect(metadata.isImageOnly).toBe(true);
    expect(
      khecAliasStatus(
        metadata.fileId,
        aliasMetadata.fileId,
        'attachment-sha',
        'attachment-sha',
      ),
    ).toBe('duplicate-alias');
    expect(
      khecAliasStatus(
        metadata.fileId,
        'different-file',
        'attachment-sha',
        'attachment-sha',
      ),
    ).toBe('independent');
  });

  it('is deterministic and reports source changes explicitly', () => {
    const first = parseCecQualifiedKaohsiungMayors(cecQualification);
    const second = parseCecQualifiedKaohsiungMayors(cecQualification);
    expect(second).toEqual(first);
    expect(sourceChangeStatus('abc', 'abc')).toBe('unchanged');
    expect(sourceChangeStatus('abc', 'def')).toBe('changed');
    expect(
      normalizeMayorNames(
        cecQualification,
        first.map((candidate) => candidate.displayName),
      ).unexpected,
    ).toEqual([]);
  });
});

describe('official council roster', () => {
  it('validates all 101 preliminary rows and stable identity helpers', () => {
    const roster = validateCouncilRoster(councilRosterInput);
    expect(roster.totalRowCount).toBe(101);
    expect(roster.constituencies).toHaveLength(15);
    expect(
      councilCandidateStableId(2026, 'district-kaohsiung-council-01', '李振豪'),
    ).toBe(
      councilCandidateStableId(2026, 'district-kaohsiung-council-01', '李振豪'),
    );
    expect(councilCandidateSlug(2026, 1, '李振豪')).toMatch(
      /^kaohsiung-council-01-[a-f0-9]{8}$/,
    );
  });
});

describe('approved official dataset', () => {
  it('rejects a drawn number that is incorrectly marked final', () => {
    const invalid = structuredClone(approvedInput) as Record<
      string,
      unknown
    > & {
      candidates: Array<Record<string, unknown>>;
    };
    const firstCandidate = invalid.candidates.at(0);
    if (!firstCandidate) {
      throw new Error('Approved dataset has no candidate for invalid fixture.');
    }
    firstCandidate.candidateNumberIsFinal = true;
    expect(() => validateOfficialDataset(invalid)).toThrow(
      'non-final number as final',
    );
  });

  it('publishes only the CEC-supported identity fields for mayor candidates', () => {
    const dataset = validateOfficialDataset(approvedInput);
    const mayors = dataset.candidates.filter(
      (candidate) => candidate.electionType === 'mayoral',
    );
    expect(mayors).toHaveLength(5);
    expect(
      mayors.every((candidate) => candidate.partyStatus === 'published'),
    ).toBe(true);
    expect(
      mayors.every((candidate) =>
        candidate.sourceIds.includes('source-cec-vote2026-c1-64000'),
      ),
    ).toBe(true);
    expect(mayors.map((candidate) => candidate.birthDate)).toEqual([
      '1956-05-27',
      '1963-08-29',
      '1962-04-29',
      '1963-11-24',
      '1973-11-15',
    ]);
  });

  it('reconciles all 101 council rows while formal announcement remains pending', () => {
    const dataset = validateOfficialDataset(approvedInput);
    const roster = validateCouncilRoster(councilRosterInput);
    const names = parseCecQualifiedKaohsiungMayors(cecQualification).map(
      (candidate) => candidate.displayName,
    );
    const report = reconcileOfficialData(dataset, names, roster);
    expect(report.status).toBe('partial');
    expect(report.counts).toMatchObject({
      cecQualifiedMayors: 5,
      approvedMayors: 5,
      matchedMayors: 5,
      pendingReviewScopes: 2,
      officialDistricts: 16,
      councilConstituencies: 15,
      councilSourceRows: 101,
      councilNormalizedRows: 101,
      councilApprovedRows: 101,
      councilPublishedRows: 101,
    });
    expect(
      report.councilConstituencies.every((item) => item.status === 'complete'),
    ).toBe(true);
    expect(report.publication.councilCandidatesPublished).toBe(true);
    expect(report.publication.councilRosterStatus).toBe(
      'preliminary-drawn-non-final',
    );
    expect(report.discrepancies).toEqual([]);
  });

  it('promotes CEC council party and birth fields without changing KHEC identity', () => {
    const dataset = validateOfficialDataset(approvedInput);
    const councilCandidates = dataset.candidates.filter(
      (candidate) => candidate.electionType !== 'mayoral',
    );
    expect(councilCandidates).toHaveLength(101);
    expect(
      councilCandidates.every(
        (candidate) =>
          candidate.partyStatus === 'published' &&
          candidate.politicalParty !== null &&
          candidate.birthDate &&
          candidate.sourceIds.includes('source-cec-vote2026-t-64000'),
      ),
    ).toBe(true);
    const nameConflict = councilCandidates.find(
      (candidate) =>
        candidate.districtId === 'district-kaohsiung-council-03' &&
        candidate.candidateNumber === '2',
    );
    expect(nameConflict).toMatchObject({
      displayName: '張驥晟',
      cecDirectoryName: '張騏晟',
    });
    expect(
      councilCandidates.some((candidate) => candidate.cecDirectoryName),
    ).toBe(true);
    expect(
      councilCandidates.filter((candidate) => candidate.cecDirectoryName),
    ).toHaveLength(9);
  });

  it('reconciles promoted council identity fields against CEC by district and number', () => {
    const dataset = validateOfficialDataset(approvedInput);
    const roster = validateCouncilRoster(councilRosterInput);
    const names = parseCecQualifiedKaohsiungMayors(cecQualification).map(
      (candidate) => candidate.displayName,
    );
    const directory = parseCecCouncilCandidates(cecCouncilDirectory);
    const report = reconcileOfficialData(dataset, names, roster, directory);
    expect(report.sources.councilDirectory).toBe('source-cec-vote2026-t-64000');
    expect(report.cecCouncil).toMatchObject({
      sourceRows: 101,
      matchedRows: 101,
      missingCandidates: [],
      unexpectedCandidates: [],
      partyMismatches: [],
      birthDateMismatches: [],
      status: 'partial',
    });
    expect(report.cecCouncil?.sourceNameConflicts).toHaveLength(9);
    expect(report.cecCouncil?.sourceNameConflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          districtNumber: 3,
          candidateNumber: '2',
          canonicalName: '張驥晟',
          directoryName: '張騏晟',
        }),
        expect.objectContaining({
          districtNumber: 14,
          candidateNumber: '1',
          canonicalName: '洪英雄',
          directoryName: '洪英雄 Salizan．binkinuan',
        }),
      ]),
    );
    expect(report.discrepancies).toEqual([]);
  });

  it('rejects party values, duplicate numbers, and missing source references', () => {
    const partyInvalid = structuredClone(approvedInput) as {
      candidates: Array<Record<string, unknown>>;
    };
    const firstCouncil = partyInvalid.candidates.find(
      (candidate) => candidate.electionType !== 'mayoral',
    );
    if (!firstCouncil)
      throw new Error('Approved dataset has no council fixture.');
    firstCouncil.politicalParty = '未經來源證實的政黨';
    firstCouncil.partyStatus = 'not-published';
    expect(() => validateOfficialDataset(partyInvalid)).toThrow(
      'includes a party value',
    );

    const duplicateInvalid = structuredClone(approvedInput) as {
      candidates: Array<Record<string, unknown>>;
    };
    const councilRows = duplicateInvalid.candidates.filter(
      (candidate) => candidate.districtId === firstCouncil.districtId,
    );
    const firstCouncilRow = councilRows.at(0);
    const secondCouncilRow = councilRows.at(1);
    if (!firstCouncilRow || !secondCouncilRow)
      throw new Error('Approved dataset lacks a council pair.');
    secondCouncilRow.candidateNumber = firstCouncilRow.candidateNumber;
    expect(() => validateOfficialDataset(duplicateInvalid)).toThrow(
      'duplicate candidate number',
    );

    const missingSourceInvalid = structuredClone(approvedInput) as {
      candidates: Array<Record<string, unknown>>;
    };
    const missingSourceCandidate = missingSourceInvalid.candidates.at(0);
    if (!missingSourceCandidate)
      throw new Error('Approved dataset has no candidate.');
    missingSourceCandidate.sourceIds = ['missing-source'];
    expect(() => validateOfficialDataset(missingSourceInvalid)).toThrow(
      'references missing source',
    );
  });

  it('reports wrong-number and wrong-constituency mutations', () => {
    const names = parseCecQualifiedKaohsiungMayors(cecQualification).map(
      (candidate) => candidate.displayName,
    );
    const roster = validateCouncilRoster(councilRosterInput);
    const wrongNumber = structuredClone(validateOfficialDataset(approvedInput));
    const wrongNumberCandidate = wrongNumber.candidates.find(
      (candidate) => candidate.electionType !== 'mayoral',
    );
    if (!wrongNumberCandidate)
      throw new Error('Approved dataset has no council fixture.');
    wrongNumberCandidate.candidateNumber = '999';
    const numberReport = reconcileOfficialData(wrongNumber, names, roster);
    expect(numberReport.counts.councilApprovedRows).toBe(101);
    expect(
      numberReport.councilConstituencies.some(
        (item) => item.numberMismatches.length > 0,
      ),
    ).toBe(true);

    const wrongConstituency = structuredClone(
      validateOfficialDataset(approvedInput),
    );
    const movedCandidate = wrongConstituency.candidates.find(
      (candidate) => candidate.electionType !== 'mayoral',
    );
    if (!movedCandidate)
      throw new Error('Approved dataset has no council fixture.');
    movedCandidate.districtId = 'district-kaohsiung-council-02';
    movedCandidate.candidateNumber = '999';
    const constituencyReport = reconcileOfficialData(
      wrongConstituency,
      names,
      roster,
    );
    expect(
      constituencyReport.councilConstituencies.some(
        (item) => item.constituencyMismatches.length > 0,
      ),
    ).toBe(true);
  });

  it('validates a synthetic several-hundred-candidate dataset', () => {
    const scaled = structuredClone(validateOfficialDataset(approvedInput));
    const base = scaled.candidates.at(0);
    if (!base)
      throw new Error('Approved dataset has no candidate for scale fixture.');
    scaled.candidates = Array.from({ length: 505 }, (_, index) => ({
      ...base,
      id: `candidate-scale-${index + 1}`,
      slug: `candidate-scale-${index + 1}`,
      displayName: `合成候選人${index + 1}`,
      shortName: `合成${index + 1}`,
      candidateNumber: String(index + 1),
    }));
    const parsed = validateOfficialDataset(scaled);
    expect(parsed.candidates).toHaveLength(505);
  });
});
