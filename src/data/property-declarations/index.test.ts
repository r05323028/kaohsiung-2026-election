import { describe, expect, it } from 'vitest';
import {
  propertyDeclarationCoverage,
  propertyDeclarationSnapshot,
} from './index';

describe('published property declaration read model', () => {
  it('covers every canonical candidate without exposing PDF bytes', () => {
    expect(propertyDeclarationCoverage()).toEqual({
      candidates: 106,
      sourceLinked: 105,
      ambiguous: 1,
      sourceUnavailable: 0,
    });
    expect(propertyDeclarationSnapshot.records).toHaveLength(106);
    expect(
      propertyDeclarationSnapshot.records.every((record) =>
        record.documents.every(
          (document) =>
            document.retention === 'url-only' && document.pdfSha256 === null,
        ),
      ),
    ).toBe(true);
  });

  it('withholds ambiguous same-name documents from direct assignment', () => {
    const ambiguous = propertyDeclarationSnapshot.records.find(
      (record) => record.status === 'ambiguous-source',
    );
    expect(ambiguous?.displayName).toBe('洪英雄');
    expect(ambiguous?.documents).toEqual([]);
    expect(ambiguous?.identity.listingPageUrls).toEqual([
      'https://pdps-dec.cec.gov.tw/release/formal/Page7_02_14.html',
    ]);
  });
});
