import { describe, expect, it } from 'vitest';
import {
  candidateIdCoverageIssues,
  hasCandidateIdCoverageIssues,
} from './publication-validation';

describe('basic profile publication roster coverage', () => {
  it('accepts the exact canonical candidate ID set', () => {
    const issues = candidateIdCoverageIssues(
      ['candidate-a', 'candidate-b', 'candidate-c'],
      ['candidate-c', 'candidate-a', 'candidate-b'],
    );
    expect(hasCandidateIdCoverageIssues(issues)).toBe(false);
  });

  it('rejects mutated missing, unexpected, and duplicate IDs', () => {
    const issues = candidateIdCoverageIssues(
      ['candidate-a', 'candidate-b', 'candidate-c'],
      ['candidate-a', 'candidate-b', 'candidate-b', 'candidate-x'],
    );
    expect(issues).toEqual({
      duplicateIds: ['candidate-b'],
      missingIds: ['candidate-c'],
      unexpectedIds: ['candidate-x'],
    });
    expect(hasCandidateIdCoverageIssues(issues)).toBe(true);
  });
});
