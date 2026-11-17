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
      verifiedCategories: 675,
      partialSummaries: 96,
      unavailableSummaries: 8,
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
