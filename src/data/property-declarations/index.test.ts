import { describe, expect, it } from 'vitest';
import {
  getCandidatePropertyDeclaration,
  propertyDeclarationCoverage,
} from './index';

describe('published property declaration read model', () => {
  it('covers every canonical candidate and publishes merged summaries', () => {
    expect(propertyDeclarationCoverage()).toEqual({
      candidates: 106,
      sourceLinked: 105,
      ambiguous: 1,
      sourceUnavailable: 0,
      financialSummaries: 106,
      verifiedCategories: 1040,
      officialCategories: 702,
      civilFallbackCategories: 276,
      mixedSourceCategories: 62,
      sourceConflicts: 12,
      partialSummaries: 95,
      unavailableSummaries: 0,
    });

    const linked = getCandidatePropertyDeclaration(
      'official-mayor-zhang-jing-2026',
    );
    expect(linked?.documents).toHaveLength(1);
    expect(linked?.financialSummary).not.toBeNull();
  });

  it('publishes category page evidence without raw document content', () => {
    const linked = getCandidatePropertyDeclaration(
      'official-mayor-zhang-jing-2026',
    );
    expect(linked?.financialSummary?.categories).toHaveLength(14);
    expect(
      linked?.financialSummary?.categories.some(
        (category) =>
          category.category === 'cash' &&
          category.entryCount === 6 &&
          category.evidencePages.includes(7) &&
          category.fieldSources.entryCount === 'official-cec',
      ),
    ).toBe(true);
  });

  it('strips internal verification metadata from the public read model', () => {
    const linked = getCandidatePropertyDeclaration(
      'official-mayor-zhang-jing-2026',
    );
    const document = linked?.documents[0];
    expect(document).toBeDefined();
    expect(document).not.toHaveProperty('retention');
    expect(document).not.toHaveProperty('pdfSha256');
    expect(
      linked?.financialSummary?.categories.every(
        (category) =>
          !('verificationStatus' in category) &&
          !('verificationMethod' in category) &&
          !('sourceConflict' in category),
      ),
    ).toBe(true);
  });

  it('keeps mixed official and civil fields on the same candidate', () => {
    const summary = getCandidatePropertyDeclaration(
      'official-candidate-2026-district-kaohsiung-council-07-afc23f7d',
    )?.financialSummary;
    expect(summary?.summaryStatus).toBe('mixed-source-verified');
    expect(summary?.sources.official?.pdfFileName).toBe('3373.pdf');
    expect(summary?.sources.civil?.publisher).toBe('台灣前進');
    expect(
      summary?.categories.find(
        (category) => category.category === 'valuable-property',
      ),
    ).toMatchObject({
      status: 'reported',
      totalTwd: 750_000,
      entryCount: 3,
      evidencePages: [15],
      fieldSources: { total: 'official-cec', entryCount: 'civil-gazette' },
    });
    expect(
      summary?.categories.find(
        (category) => category.category === 'securities',
      ),
    ).toMatchObject({
      entryCount: 14,
      evidencePages: [],
      fieldSources: { total: null, entryCount: 'civil-gazette' },
    });
  });

  it('does not replace verified official values with civil disagreements', () => {
    const summary = getCandidatePropertyDeclaration(
      'official-mayor-wang-zhao-min-2026',
    )?.financialSummary;
    expect(
      summary?.categories.find((item) => item.category === 'land'),
    ).toMatchObject({
      status: 'none-reported',
      totalTwd: null,
      entryCount: 0,
      evidencePages: [2],
      fieldSources: { total: null, entryCount: 'official-cec' },
    });
    expect(
      summary?.categories.find((item) => item.category === 'building'),
    ).toMatchObject({
      status: 'none-reported',
      totalTwd: null,
      entryCount: 0,
      evidencePages: [3],
      fieldSources: { total: null, entryCount: 'official-cec' },
    });
  });

  it('publishes a civil-only summary for an ambiguous official identity', () => {
    const ambiguous = getCandidatePropertyDeclaration(
      'official-candidate-2026-district-kaohsiung-indigenous-mountain-14-c9a9596c',
    );
    expect(ambiguous?.displayName).toBe('洪英雄');
    expect(ambiguous?.documents).toEqual([]);
    expect(ambiguous?.identity.listingPageUrls).toEqual([
      'https://pdps-dec.cec.gov.tw/release/formal/Page7_02_14.html',
    ]);
    expect(ambiguous?.financialSummary?.sources.official).toBeNull();
    expect(ambiguous?.financialSummary?.sources.civil).toMatchObject({
      publisher: '台灣前進',
      attribution: '資料來源：台灣前進《2026 民間版選舉公報》',
      license: 'CC BY 4.0',
    });
    expect(
      ambiguous?.financialSummary?.categories.find(
        (category) => category.category === 'deposits',
      ),
    ).toMatchObject({
      totalTwd: 2_188_518,
      entryCount: 6,
      fieldSources: { total: 'civil-gazette', entryCount: 'civil-gazette' },
    });
  });

  it('preserves individually recovered official summaries', () => {
    const fullyRecovered = getCandidatePropertyDeclaration(
      'official-candidate-2026-district-kaohsiung-council-01-fb74ce74',
    )?.financialSummary;
    expect(fullyRecovered?.summaryStatus).toBe('page-evidenced');
    expect(fullyRecovered?.verifiedCategoryCount).toBe(14);
    expect(
      fullyRecovered?.categories.find(
        (category) => category.category === 'insurance',
      ),
    ).toMatchObject({
      status: 'reported',
      entryCount: 1,
      totalTwd: null,
      evidencePages: [13],
    });

    const partial = getCandidatePropertyDeclaration(
      'official-candidate-2026-district-kaohsiung-council-07-9cddec16',
    )?.financialSummary;
    expect(partial?.summaryStatus).toBe('partially-verified');
    expect(
      partial?.categories.find((category) => category.category === 'land'),
    ).toMatchObject({
      status: 'not-determined',
      totalTwd: null,
      entryCount: null,
      fieldSources: { total: null, entryCount: null },
    });
    expect(
      partial?.categories.find((category) => category.category === 'insurance'),
    ).toMatchObject({ status: 'reported', entryCount: 9 });

    const handwritten = getCandidatePropertyDeclaration(
      'official-candidate-2026-district-kaohsiung-indigenous-mountain-15-c088199b',
    )?.financialSummary;
    expect(handwritten?.summaryStatus).toBe('partially-verified');
    expect(handwritten?.verifiedCategoryCount).toBe(5);
    expect(
      handwritten?.categories.find((category) => category.category === 'land'),
    ).toMatchObject({ status: 'reported', entryCount: 7 });
    expect(
      handwritten?.categories.find((category) => category.category === 'debts'),
    ).toMatchObject({ status: 'reported', totalTwd: 8_000_000, entryCount: 3 });
  });

  it('never turns missing civil data into zero', () => {
    const ambiguous = getCandidatePropertyDeclaration(
      'official-candidate-2026-district-kaohsiung-indigenous-mountain-14-c9a9596c',
    )?.financialSummary;
    expect(
      ambiguous?.categories.find((category) => category.category === 'cash'),
    ).toMatchObject({
      status: 'not-determined',
      totalTwd: null,
      entryCount: null,
      evidencePages: [],
      fieldSources: { total: null, entryCount: null },
    });
  });

  it('keeps candidate identities unique across the published roster', () => {
    const ids = new Set<string>();
    for (const candidateId of [
      'official-mayor-zhang-jing-2026',
      'official-mayor-wang-zhao-min-2026',
      'official-candidate-2026-district-kaohsiung-indigenous-mountain-14-c9a9596c',
    ]) {
      const record = getCandidatePropertyDeclaration(candidateId);
      expect(record?.candidateId).toBe(candidateId);
      ids.add(record?.candidateId ?? '');
    }
    expect(ids.size).toBe(3);
  });
});
