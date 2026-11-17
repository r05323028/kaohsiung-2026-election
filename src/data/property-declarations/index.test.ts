import { describe, expect, it } from 'vitest';
import {
  getCandidatePropertyDeclaration,
  propertyDeclarationCoverage,
} from './index';

describe('published property declaration read model', () => {
  it('covers every canonical candidate and sanitized financial summaries', () => {
    expect(propertyDeclarationCoverage()).toEqual({
      candidates: 106,
      sourceLinked: 105,
      ambiguous: 1,
      sourceUnavailable: 0,
      financialSummaries: 105,
      verifiedCategories: 764,
      partialSummaries: 100,
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
          category.evidencePages.includes(7),
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
          !('verificationMethod' in category),
      ),
    ).toBe(true);
  });

  it('publishes the recovered official summaries without turning gaps into zero', () => {
    const fullyRecovered = getCandidatePropertyDeclaration(
      'official-candidate-2026-district-kaohsiung-council-01-fb74ce74',
    )?.financialSummary;
    expect(fullyRecovered?.summaryStatus).toBe('page-evidenced');
    expect(fullyRecovered?.verifiedCategoryCount).toBe(14);
    expect(
      fullyRecovered?.categories.find(
        (category) => category.category === 'insurance',
      ),
    ).toMatchObject({ status: 'reported', entryCount: 1, totalTwd: null });

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
    });
    expect(
      partial?.categories.find((category) => category.category === 'insurance'),
    ).toMatchObject({ status: 'reported', entryCount: 9 });

    const handwritten = getCandidatePropertyDeclaration(
      'official-candidate-2026-district-kaohsiung-indigenous-mountain-15-c088199b',
    )?.financialSummary;
    expect(handwritten?.summaryStatus).toBe('partially-verified');
    expect(handwritten?.verifiedCategoryCount).toBe(3);
    expect(
      handwritten?.categories.find((category) => category.category === 'land'),
    ).toMatchObject({ status: 'reported', entryCount: 7 });
    expect(
      handwritten?.categories.find((category) => category.category === 'debts'),
    ).toMatchObject({ status: 'reported', totalTwd: 8_000_000, entryCount: 3 });
  });

  it('withholds ambiguous same-name documents from direct assignment', () => {
    const ambiguous = getCandidatePropertyDeclaration(
      'official-candidate-2026-district-kaohsiung-indigenous-mountain-14-c9a9596c',
    );
    expect(ambiguous?.displayName).toBe('洪英雄');
    expect(ambiguous?.documents).toEqual([]);
    expect(ambiguous?.financialSummary).toBeNull();
    expect(ambiguous?.identity.listingPageUrls).toEqual([
      'https://pdps-dec.cec.gov.tw/release/formal/Page7_02_14.html',
    ]);
  });
});
