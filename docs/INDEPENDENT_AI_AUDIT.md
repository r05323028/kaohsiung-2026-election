# Scoped evidence audit

## Purpose and boundary

`independently-audit-zuoying-mayoral-evidence` audits the existing 143 claims for the 17-candidate Zuoying District 4/mayoral enrichment snapshot dated `2026-11-07`. It is an offline evidence-audit layer, not a biography generator, human review system, or publication approval.

The audit reads only retained JSON and raw snapshots. It does not make network requests, rewrite source bytes, alter normalized claims, import the scoped data into public profile pages, or change `evaluateScopedEnrichmentPublicationGate(...)` / `evaluateEditorialPublicationGate(...)`.

## Two passes

1. **First pass — `reopen-and-rule-audit-v1`**: reopens each claim's source files, checks SHA-256/byte length, checks direct evidence and candidate identity anchors, compares claim/evidence attribution, and records temporal/currentness, candidate-statement, news, sensitive-relationship, duplicate, and administrative-outcome blockers.
2. **Second pass — `independent-reopen-and-rule-audit-v1`**: uses a separate candidate-name plus claim/evidence-anchor rule path and fresh source reads. It is an independent deterministic machine pass, not an LLM or human decision.
3. Both ACP reviewer attempts (`del_mw63q1yg_nogs` and changed-approach `del_mw65rve6_jhey`) are retained in `reports/independent-ai-review.json` as `unavailable`; both reported that repository file-execution tools were unavailable and produced no findings. No agent result is represented as review.

Statuses:

- `machine-verified`: deterministic source, evidence, identity, and attribution checks passed with no audit blocker.
- `needs-review`: retained evidence was found, but editorial/temporal/currentness/attribution/sensitivity/duplicate/outcome review remains.
- `unsupported`: a required source, identity, attribution, or raw-evidence check failed. This is not a negative finding that the underlying fact is false.

None of these statuses changes `humanReviewStatus`, `editorialStatus`, `publicationStatus`, reviewer registry, decisions, or approved/published layers.

## Reports

- `reports/independent-ai-review.json`: 143 claim-linked findings, both machine-pass results, checks, rationales, source/evidence/identity IDs, blockers, corrections, and limitation metadata.
- `reports/ai-review-disagreements.md`: per-claim deterministic-pass disagreements and agreement counts.
- `reports/claim-corrections.md`: only evidence-backed suggestions; suggestions are never applied automatically.
- `reports/remaining-evidence-gaps.md`: claim-linked blockers and source/evidence references. Gaps are not negative evidence.

Current measured run: 143 findings; first pass 4 `machine-verified`, 139 `needs-review`, 0 `unsupported`; second pass 2 `machine-verified`, 141 `needs-review`; 141 agreements and 2 disagreements; 0 correction suggestions. All 143 source sets reopened with unchanged checksums. The 149 blocker findings remain local review work.

## Commands

```bash
npm run ai-audit:execute   # offline raw reopen and report generation
npm run ai-audit:validate  # validate report coverage and current raw checksums
npm run ai-audit:verify    # rerun both machine passes and compare persisted statuses
npm run ai-audit:report    # print the measured report summary
npm run openspec:validate:ai-audit
```

The existing local `/editorial-review/` page displays the audit only in development or when `EDITORIAL_REVIEW=true`. Production Astro output does not load the audit report. Machine findings do not authorize review decisions; an authorized reviewer must still inspect the underlying source/evidence and use the existing decision/export/apply/gate workflow before any publication.

## Limitations

- Source capture freshness is not invented. Unknown dates, capture-file-mtime-only sources, reported news, candidate statements, currentness, sensitive relationships, duplicates, and outcome language remain review-sensitive.
- The second pass is independent deterministic code, not a separate model or human. The unavailable ACP attempt is explicitly reported.
- The audit does not retrieve missing sources, resolve the existing neutral coverage gaps, or decide whether a person is endorsed, related, successful, or otherwise characterized beyond the retained evidence.
