import { describe, expect, it } from 'vitest';
import {
  AFFILIATION_GROUPS,
  AFFILIATION_STATUS_LABELS,
  affiliationGroupOf,
  affiliationPeriodLabel,
  affiliationRowMeta,
  affiliationSummary,
  groupAffiliations,
  LISTING_STATUS_LABELS,
  POSITION_CATEGORY_LABELS,
} from '../components/PoliticalFamilyGraph';
import { candidateProfiles, getCandidateProfile } from './index';
import {
  getPoliticalFamilyReadModel,
  politicalFamilyPublication,
  validatePoliticalFamilyPublication,
} from './political-family';
import type { Affiliation } from './political-family/schema';
import { toPublicCandidateProfile } from './view';

function affiliation(
  overrides: Partial<Affiliation> & { id: string },
): Affiliation {
  return {
    organization: '測試組織',
    organizationType: 'legislature',
    positionTitle: '測試職務',
    positionCategory: 'public_office',
    listingStatus: null,
    status: 'former-officeholder',
    startDate: null,
    endDate: null,
    sourceIds: [`source-${overrides.id}`],
    ...overrides,
  };
}

describe('political family publication', () => {
  it('provides one explicit public research result for every canonical candidate', () => {
    const candidateIds = candidateProfiles.map(
      (candidate) => candidate.candidacy.id,
    );
    expect(new Set(candidateIds).size).toBe(candidateIds.length);
    expect(politicalFamilyPublication.candidates).toHaveLength(
      candidateProfiles.length,
    );
    for (const candidateId of candidateIds) {
      const readModel = getPoliticalFamilyReadModel(candidateId);
      expect(readModel).toBeDefined();
      expect(readModel?.researchStatus).toMatch(
        /^(verified-relations-found|searched-no-verified-relations|unresolved)$/,
      );
    }
  });

  it('separates agent approvals from editorial approvals in the public output', () => {
    const agentIds = new Set(
      politicalFamilyPublication.agentApprovedRelationshipIds,
    );
    expect(agentIds.size).toBeGreaterThan(0);
    const publishedIds = new Set(
      politicalFamilyPublication.relationships.map(
        (relationship) => relationship.id,
      ),
    );
    for (const id of agentIds) expect(publishedIds.has(id)).toBe(true);
    const flagged = new Map(
      candidateProfiles
        .flatMap(
          (candidate) =>
            getPoliticalFamilyReadModel(candidate.candidacy.id)
              ?.relationships ?? [],
        )
        .filter((relationship) => relationship.agentApproved)
        .map((relationship) => [relationship.id, relationship]),
    );
    expect(flagged.size).toBe(agentIds.size);
  });

  it('publishes only source-backed, connected relationships and deduplicates people', () => {
    const peopleIds = politicalFamilyPublication.people.map(
      (person) => person.id,
    );
    expect(new Set(peopleIds).size).toBe(peopleIds.length);
    const sourceIds = new Set(
      politicalFamilyPublication.sources.map((source) => source.id),
    );
    for (const relationship of politicalFamilyPublication.relationships) {
      expect(relationship.verificationStatus).toBe('verified');
      expect(relationship.personAId).not.toBe(relationship.personBId);
      expect(relationship.sourceIds.length).toBeGreaterThan(0);
      expect(
        relationship.sourceIds.every((sourceId) => sourceIds.has(sourceId)),
      ).toBe(true);
      expect(relationship.kinshipSourceIds.length).toBeGreaterThan(0);
      expect(relationship.positionSourceIds.length).toBeGreaterThan(0);
      expect(relationship.sourceIds).toEqual(
        expect.arrayContaining([
          ...relationship.kinshipSourceIds,
          ...relationship.positionSourceIds,
        ]),
      );
      for (const sourceId of relationship.positionSourceIds) {
        const personB = politicalFamilyPublication.people.find(
          (person) => person.id === relationship.personBId,
        );
        expect(
          personB?.affiliations.some((entry) =>
            entry.sourceIds.includes(sourceId),
          ),
        ).toBe(true);
      }
    }
  });

  it('keeps workflow verification metadata out of the public profile payload', () => {
    const publicProfiles = candidateProfiles.map((candidate) =>
      toPublicCandidateProfile(candidate),
    );
    const serialized = JSON.stringify(publicProfiles);
    expect(serialized).not.toContain('verificationStatus');
    expect(serialized).not.toContain('supportedClaimIds');
    expect(serialized).not.toContain('pending-review');
    expect(serialized).not.toContain('rejected');
  });

  it('never publishes a pending or rejected relationship', () => {
    const clone = JSON.parse(
      JSON.stringify(politicalFamilyPublication),
    ) as typeof politicalFamilyPublication;
    for (const status of ['pending-review', 'rejected'] as const) {
      const draft = {
        ...clone,
        relationships: clone.relationships.map((relationship, index) =>
          index === 0
            ? { ...relationship, verificationStatus: status }
            : relationship,
        ),
      };
      expect(() => validatePoliticalFamilyPublication(draft)).toThrow();
    }
    const publicRelationshipIds = candidateProfiles.flatMap((candidate) =>
      (getPoliticalFamilyReadModel(candidate.candidacy.id)?.relationships ?? [])
        .filter((relationship) => !('verificationStatus' in relationship))
        .map((relationship) => relationship.id),
    );
    expect(publicRelationshipIds.length).toBeGreaterThan(0);
  });

  it('renders a neutral empty state for a researched candidate without a relation', () => {
    const emptyCandidate = candidateProfiles.find(
      (candidate) =>
        getPoliticalFamilyReadModel(candidate.candidacy.id)?.relationships
          .length === 0,
    );
    expect(emptyCandidate).toBeDefined();
    const readModel = getPoliticalFamilyReadModel(
      emptyCandidate?.candidacy.id ?? '',
    );
    expect(readModel?.note).toBe('目前尚無已查證且符合收錄條件的親屬資料。');
    expect(readModel?.relationships).toEqual([]);
  });

  it('joins family data by the stable candidate ID rather than display name', () => {
    const candidate = getCandidateProfile('ke-zhi-en-2026');
    expect(candidate?.candidacy.id).toBeTruthy();
    expect(candidate?.politicalFamily?.relationships.length).toBeGreaterThan(0);
    expect(
      candidate?.politicalFamily?.people.some(
        (person) => person.displayName === '柯文福',
      ),
    ).toBe(true);
  });

  it('exposes several affiliations of one relative with resolvable sources', () => {
    const candidate = getCandidateProfile('ke-zhi-en-2026');
    const readModel = getPoliticalFamilyReadModel(
      candidate?.candidacy.id ?? '',
    );
    const relative = readModel?.people.find(
      (person) => person.affiliations.length > 1,
    );
    expect(relative).toBeDefined();
    const sourceIds = new Set(readModel?.sources.map((source) => source.id));
    for (const entry of relative?.affiliations ?? []) {
      expect(entry.sourceIds.length).toBeGreaterThan(0);
      expect(entry.sourceIds.every((sourceId) => sourceIds.has(sourceId))).toBe(
        true,
      );
      expect(entry.organization.length).toBeGreaterThan(0);
      expect(POSITION_CATEGORY_LABELS[entry.positionCategory]).toBeTruthy();
    }
    expect(groupAffiliations(relative?.affiliations ?? [])).toHaveLength(
      new Set(
        (relative?.affiliations ?? []).map((entry) =>
          affiliationGroupOf(entry),
        ),
      ).size,
    );
  });

  it('accepts a publication where two candidates share one relative record', () => {
    const [personA, personB] = politicalFamilyPublication.people;
    const [source] = politicalFamilyPublication.sources;
    const [candidate] = politicalFamilyPublication.candidates;
    expect(personA && personB && source && candidate).toBeTruthy();
    const relationship = {
      id: 'relationship-shared-relative',
      personAId: 'political-person-shared-a',
      personBId: 'political-person-shared-relative',
      relationshipType: 'parent-child' as const,
      relationshipLabel: '父女',
      personALabel: '女兒',
      personBLabel: '父親',
      verificationStatus: 'verified' as const,
      kinshipSourceIds: [source?.id],
      positionSourceIds: [source?.id],
      sourceIds: [source?.id],
    };
    const draft = {
      ...politicalFamilyPublication,
      people: [
        ...politicalFamilyPublication.people,
        {
          id: 'political-person-shared-relative',
          displayName: '共用親屬',
          affiliations: [
            {
              ...affiliation({ id: 'affiliation-shared-relative' }),
              organizationType: 'government' as const,
            },
          ],
        },
        {
          id: 'political-person-shared-a',
          displayName: '候選人甲',
          candidateId: 'candidate-a',
          affiliations: [],
        },
        {
          id: 'political-person-shared-b',
          displayName: '候選人乙',
          candidateId: 'candidate-b',
          affiliations: [],
        },
      ],
      relationships: [
        ...politicalFamilyPublication.relationships,
        relationship,
        {
          ...relationship,
          id: 'relationship-shared-relative-b',
          personAId: 'political-person-shared-b',
        },
      ],
      candidates: [
        ...politicalFamilyPublication.candidates,
        {
          candidateId: 'candidate-a',
          researchStatus: 'verified-relations-found' as const,
          relationshipIds: ['relationship-shared-relative'],
          note: '測試',
        },
        {
          candidateId: 'candidate-b',
          researchStatus: 'verified-relations-found' as const,
          relationshipIds: ['relationship-shared-relative-b'],
          note: '測試',
        },
      ],
    };
    const parsed = validatePoliticalFamilyPublication(draft);
    const sharedPeople = parsed.people.filter(
      (person) => person.id === 'political-person-shared-relative',
    );
    expect(sharedPeople).toHaveLength(1);
    expect(
      parsed.relationships
        .filter(
          (entry) =>
            entry.personBId === 'political-person-shared-relative' &&
            entry.id.startsWith('relationship-shared-relative'),
        )
        .map((entry) => entry.personAId),
    ).toEqual(['political-person-shared-a', 'political-person-shared-b']);
  });
});

describe('affiliation presentation', () => {
  it('groups affiliations by organization type in a stable order', () => {
    const entries = [
      affiliation({ id: 'a', organizationType: 'legislature' }),
      affiliation({ id: 'b', organizationType: 'political_organization' }),
      affiliation({
        id: 'c',
        organizationType: 'corporation',
        positionCategory: 'board',
        listingStatus: 'listed',
      }),
      affiliation({
        id: 'd',
        organizationType: 'corporation',
        positionCategory: 'board',
        listingStatus: 'otc',
      }),
      affiliation({
        id: 'e',
        organizationType: 'corporation',
        positionCategory: 'executive',
        listingStatus: 'unlisted',
      }),
      affiliation({
        id: 'f',
        organizationType: 'business_group',
        positionCategory: 'executive',
        listingStatus: null,
      }),
      affiliation({ id: 'g', organizationType: 'foundation' }),
      affiliation({ id: 'h', organizationType: 'nonprofit' }),
    ];
    const groups = groupAffiliations(entries);
    expect(groups.map((entry) => entry.group.id)).toEqual([
      'political-government',
      'listed-company',
      'business',
      'foundation',
      'nonprofit',
    ]);
    expect(
      groups
        .find((entry) => entry.group.id === 'political-government')
        ?.affiliations.map((entry) => entry.id),
    ).toEqual(['a', 'b']);
    expect(
      groups
        .find((entry) => entry.group.id === 'listed-company')
        ?.affiliations.map((entry) => entry.id),
    ).toEqual(['c', 'd']);
    expect(
      groups
        .find((entry) => entry.group.id === 'business')
        ?.affiliations.map((entry) => entry.id),
    ).toEqual(['e', 'f']);
    expect(groups.map((entry) => entry.group.label)).toEqual([
      '政治與政府',
      '上市櫃公司',
      '企業與集團',
      '基金會',
      '非營利組織',
    ]);
    expect(AFFILIATION_GROUPS).toHaveLength(5);
  });

  it('summarises a relative with several affiliations instead of listing them all', () => {
    expect(
      affiliationSummary([
        affiliation({ id: 'a' }),
        affiliation({
          id: 'b',
          organizationType: 'corporation',
          positionCategory: 'board',
          listingStatus: 'listed',
        }),
        affiliation({
          id: 'c',
          organizationType: 'corporation',
          positionCategory: 'executive',
          listingStatus: 'unlisted',
        }),
      ]),
    ).toBe('政治 1 · 上市櫃 1 · 企業 1');
    expect(affiliationSummary([])).toBe('尚無已查證職務');
  });

  it('keeps board and executive roles distinct and labels listing status', () => {
    expect(POSITION_CATEGORY_LABELS.board).toBe('董事會');
    expect(POSITION_CATEGORY_LABELS.executive).toBe('經營團隊');
    expect(POSITION_CATEGORY_LABELS.board).not.toBe(
      POSITION_CATEGORY_LABELS.executive,
    );
    expect(LISTING_STATUS_LABELS).toEqual({
      listed: '上市',
      otc: '上櫃',
      unlisted: '未上市櫃',
      unknown: '未確認',
    });
    const boardRow = affiliationRowMeta(
      affiliation({
        id: 'a',
        organizationType: 'corporation',
        positionCategory: 'board',
        listingStatus: 'listed',
      }),
    );
    expect(boardRow).toEqual(['董事會', '上市', '曾任', '日期未詳']);
    const unknownListingRow = affiliationRowMeta(
      affiliation({
        id: 'b',
        organizationType: 'business_group',
        positionCategory: 'executive',
        listingStatus: null,
      }),
    );
    expect(unknownListingRow).toEqual([
      '經營團隊',
      '未確認',
      '曾任',
      '日期未詳',
    ]);
    expect(
      affiliationRowMeta(
        affiliation({ id: 'c', organizationType: 'government' }),
      ),
    ).toEqual(['公職', '曾任', '日期未詳']);
  });

  it('renders current, historical and unknown date states without inventing dates', () => {
    expect(
      affiliationRowMeta(
        affiliation({
          id: 'current',
          status: 'current-officeholder',
          startDate: '2022-12-25',
          endDate: null,
        }),
      ),
    ).toEqual(['公職', '現任', '2022-12-25 起']);
    expect(
      affiliationRowMeta(
        affiliation({
          id: 'former',
          status: 'former-officeholder',
          startDate: '2002-12-25',
          endDate: '2006-12-24',
        }),
      ),
    ).toEqual(['公職', '曾任', '2002-12-25 至 2006-12-24']);
    expect(
      affiliationRowMeta(
        affiliation({ id: 'unknown', status: 'historical-status-unknown' }),
      ),
    ).toEqual(['公職', '期間未詳', '日期未詳']);
    expect(affiliationPeriodLabel(null, null)).toBe('日期未詳');
    expect(AFFILIATION_STATUS_LABELS['current-officeholder']).toBe('現任');
    expect(AFFILIATION_STATUS_LABELS['former-officeholder']).toBe('曾任');
  });
});
