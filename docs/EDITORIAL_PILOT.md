# Editorial pilot operations

The pilot is a bounded offline audit of four real candidates already represented in the retained biography dataset. It is not an approval batch and it does not change the reviewer registry, decision history, or publication snapshot.

## Commands

```sh
npm run pilot:prepare  # reopen retained sources and write the six deterministic pilot reports
npm run pilot:verify   # repeat the audit and fail if reports or source checksums are stale
npm run pilot:report   # explicit alias for pilot:prepare
```

The selected candidates are 鄭光峰 (KCC msn 2220), 陳麗娜 (2221), 邱于軒 (2227), and 王耀裕 (2228). The sample is fixed by canonical roster ID, spans districts 10 and 11, and uses stable KCC identifiers, source coverage, and claim coverage. Party, popularity, or subjective importance are not selection criteria.

## Outputs

- `reports/editorial-pilot-candidate-selection.md`: candidate IDs, constituencies, evidence, identity basis, conflicts, and inclusion rationale.
- `reports/editorial-pilot-review-packets.md`: claim-by-claim human packet with original source paths/URLs, excerpts, temporal fields, attribution, machine result, and blockers.
- `reports/editorial-pilot-evidence-quality.json`: source checksum inspection and claim-level audit.
- `reports/editorial-pilot-summary.{json,md}`: measured engineering, human-review, and publication state.
- `reports/editorial-pilot-blockers.md`: exact blockers and the next human action.

The auditor reparses retained KCC HTML with the existing adapter, independently binds directory cards to their stable `msn`, verifies the official KHEC roster source, and compares every selected claim with retained source text and linked evidence. The audit identifies four selected claims whose retained KCC evidence is explicitly labeled `服務政見`; reports classify these as attributed candidate statements and warn that source presence does not establish implementation or outcome. A source capture timestamp is provenance metadata only; it is never treated as an event date.

## Human boundary

The current registry and decision set are empty. The agent must not configure itself as a reviewer, create decisions, click approval, or infer a review date. A real reviewer must:

1. Configure an explicit reviewer ID and permitted actions in `data/editorial/reviewer-registry.json` (this is local authorization, not strong authentication).
2. Start `EDITORIAL_REVIEW=true npm run editorial:review` and open `/editorial-review/`.
3. Filter each selected candidate, reopen the linked original sources, and decide claim-by-claim with rationale and explicit confirmation.
4. Export JSON, validate/apply it with the existing CLI, and resolve or withhold any identity/date issue.
5. Run `npm run editorial:publish`; only gate-eligible claims may enter the static publication snapshot.

Until those actions occur, all pilot claims are pending, the public publication snapshot remains empty, and no biography claim is published.
