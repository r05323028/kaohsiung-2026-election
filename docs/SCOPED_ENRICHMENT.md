# Scoped candidate enrichment

## Purpose and boundary

`enrich-zuoying-and-mayoral-candidate-profiles` is a separated, offline research layer for exactly 17 canonical 2026 Kaohsiung candidates:

- 12 District 4 council candidates.
- Five mayoral candidates.

It covers six categories for every candidate: `basic-biography`, `policies`, `public-records`, `news`, `relationships`, and `timeline`. The 17 × 6 matrix is 102 candidate/category audits. This layer does not replace or mutate the 106-candidate biography dataset, the official roster, public-records research, the editorial registry/decisions, or `data/published/2026/candidate-biographies.json`.

## Offline commands

All commands use checked-in raw captures; they do not make runtime requests or call a backend:

```sh
npm run enrichment:execute   # rebuild scoped normalized/review/empty layers and reports
npm run enrichment:normalize  # deterministic normalization path
npm run enrichment:review    # rebuild the local review packet
npm run enrichment:validate  # schema, roster, audit, reference, and checksum gates
npm run enrichment:verify    # reopen immutable snapshots and independent samples
npm run enrichment:report    # regenerate JSON/Markdown coverage reports
npm run openspec:validate:enrichment
```

`npm run build` includes `validate:enrichment`; CI runs both the data validator and strict OpenSpec validation. The runner and validator are intentionally separate from the production biography/editorial commands.

## Source and evidence handling

The retained source classes are CEC/KHEC roster snapshots, KCC current-member directory/profile/history captures, Legislative Yuan index/profile captures, government records, and attributable news captures. Each attempt records its method, original URL, attempted timestamp, HTTP outcome, raw path, byte length, SHA-256, excerpt or failure, timestamp quality, and `isNegativeEvidence: false`.

A source discovery result is not automatically candidate evidence. Candidate-specific claims require a conservative observation and claim-linked evidence. Name-only matching is prohibited. Roster claims retain preliminary, number-drawn, formal-pending, and party-unpublished wording instead of converting them to final election facts. Missing, inaccessible, or no-match attempts are neutral gaps and never prove that a person, event, relationship, or record does not exist.

The KCC parser stops professional-experience extraction at the canonical `服務政見` item. Those items become attributed `candidate-statement`/`self-reported` policy claims; shared `學經歷與政見` navigation text cannot create claims. News claims retain reported attribution, and family/political relationships are created only where the captured text is candidate-specific and explicitly documents the relationship.

## 2026-11-07 measured result

The executed scoped layer contains:

- **17 candidates, 102 audits, 588 source attempts, 31 unique source records, and 198 observations.**
- **143 claims and 143 evidence items.** 42 audits have claims; 60 audits are neutral no-evidence/gap states.
- Claim categories: `basic-biography` 100, `policies` 8, `public-records` 2, `news` 10, `relationships` 1, `timeline` 22.
- Attribution: 93 institutional-record claims, 8 candidate-statement claims, and 42 news-report claims.
- Outcomes: 378 retrieved attempts and 210 retrieved-no-candidate-match history attempts.
- Timestamp quality: 90 source-header, 294 capture-file-mtime, and 204 unavailable records. Claim dates have 47 day-precision and 96 unknown values.
- One exact duplicate group (`enrich-claim-0082`/`enrich-claim-0083`) is retained for human review; no claim was deleted or silently merged. There are zero unresolved identity conflicts in this scoped packet.
- Independent verification has three matching samples spanning District 4 and mayoral sources.

The 143 claims are machine-validated but pending human review. Reviewer IDs, human-reviewed/editorially-approved claims, and published claims are all zero. The scoped `approved` and `published` JSON layers remain `empty-until-authorized-publication`.

## Reports and review workflow

Reports are written under `reports/enrichment-*`:

- `enrichment-coverage.{json,md}`: candidate/category coverage, claims, neutral gaps, and status counts.
- `enrichment-quality.{json,md}`: source classes, outcomes, timestamps, attribution, temporal precision, and duplicate counts.
- `enrichment-review-queue.{json,md}`: claim review items, coverage gaps, blockers, and reviewer state.
- `enrichment-verification.{json,md}`: immutable snapshot reopen samples.
- `enrichment-category-matrix.{json,md}`: the complete 17 × 6 audit matrix.
- `enrichment-identity-conflicts.{json,md}` and `enrichment-duplicate-groups.{json,md}`: conservative identity/overlap outcomes.

The local packet may be inspected by authorized reviewers, but it is not public content. Decisions must be exported as durable JSON, validated and applied by the existing editorial workflow, and pass the unchanged `evaluateEditorialPublicationGate(...)` before any public biography snapshot can change.

## Known limitations

This is a bounded source-capture and review-preparation milestone, not complete biography coverage. Several source attempts are historical/no-match or lack a network response header; capture-file mtime is not a publication date. The official roster remains subject to formal-announcement refresh, and no scoped claim is currently approved or published. Human reviewers must still confirm identity, evidence, attribution, temporal context, duplicate disposition, and any current-position or outcome wording before publication.

Real-person avatar likeness, endorsements, rankings, and conclusions from missing data are outside this workflow. The public site continues to use its existing approved static layers and neutral missing-data text.
