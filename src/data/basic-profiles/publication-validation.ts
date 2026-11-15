export type CandidateIdCoverageIssues = {
  duplicateIds: string[];
  missingIds: string[];
  unexpectedIds: string[];
};

export function candidateIdCoverageIssues(
  expectedIds: readonly string[],
  actualIds: readonly string[],
): CandidateIdCoverageIssues {
  const expected = new Set(expectedIds);
  const actual = new Set(actualIds);
  return {
    duplicateIds: [
      ...new Set(
        actualIds.filter((id, index) => actualIds.indexOf(id) !== index),
      ),
    ].sort(),
    missingIds: [...expected].filter((id) => !actual.has(id)).sort(),
    unexpectedIds: [...actual].filter((id) => !expected.has(id)).sort(),
  };
}

export function hasCandidateIdCoverageIssues(
  issues: CandidateIdCoverageIssues,
): boolean {
  return (
    issues.duplicateIds.length > 0 ||
    issues.missingIds.length > 0 ||
    issues.unexpectedIds.length > 0
  );
}
