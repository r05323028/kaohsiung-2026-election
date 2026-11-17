import { describe, expect, it } from 'vitest';
import normalizedInput from '../../../data/normalized/2026/candidate-property-declaration-sources.json';
import { validatePropertyDeclarationNormalizedDataset } from './schema';

describe('property declaration normalized schema', () => {
  it('validates the deterministic official source map', () => {
    const dataset =
      validatePropertyDeclarationNormalizedDataset(normalizedInput);
    expect(dataset.sourcePages).toHaveLength(20);
    expect(dataset.rows).toHaveLength(107);
    expect(dataset.unmatchedRows).toEqual([]);
  });

  it('keeps unmatched rows representable without inventing an identity', () => {
    const dataset =
      validatePropertyDeclarationNormalizedDataset(normalizedInput);
    const first = dataset.rows[0];
    expect(first).toBeDefined();
    if (!first) return;

    const unresolved = {
      ...first,
      candidateId: null,
      matchStatus: 'unmatched' as const,
      matchMethod: null,
    };
    const validated = validatePropertyDeclarationNormalizedDataset({
      ...dataset,
      rows: [unresolved, ...dataset.rows.slice(1)],
      unmatchedRows: [first.rowId],
    });
    expect(validated.rows[0]?.candidateId).toBeNull();
    expect(validated.rows[0]?.matchStatus).toBe('unmatched');
  });
});
