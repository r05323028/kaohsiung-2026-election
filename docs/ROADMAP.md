# Roadmap

## Completed: official-data foundation

- Static Astro/R3F prototype with responsive, accessible city explorer and non-WebGL fallback.
- Checked-in CEC/KHEC primary-source snapshots, source manifest and SHA-256 metadata.
- Deterministic CEC/KHEC adapters, Zod official schema, normalized/review/approved layers.
- Approved 2026 slice: official district definitions, five qualified Kaohsiung mayor candidates, and 101 source-checked preliminary council rows across 15 constituencies.
- Drawn numbers retained with `candidateNumberStatus: drawn` and `candidateNumberIsFinal: false`; council formal status remains pending announcement.
- Static official/demo routes, election/constituency filters, source links, neutral unavailable states.
- Election reconciliation JSON/Markdown reports, unit/scale tests, CI and non-root build coverage.
- Selected public-record slice for 李眉蓁, 王義雄 and missing-data 賴瑞隆: six claims, 16 typed records, claim-level KCC evidence, separate normalized/review/approved layers, coverage/quality reports, and accessible profile tabs. Human review remains pending.
- Full-roster coverage audit for all 106 official preliminary candidates × six categories (636 slots), with deterministic offline batch commands, identity ambiguity withholding, checksum gates, checkpoints, review queue, and measured `reports/full-roster-coverage.{json,md}`. Snapshot 2026-11-05: 8 source-retrieved slots, 16 source-backed static records, 628 not-attempted slots; no editorial approvals or rankings.
- Executed candidate research for all 106 preliminary candidates: 636 persisted audit slots, 318 attempted/retrieved P0/P1 slots, 318 P2/P3 slots not attempted, 97 machine claims, 106 evidence items, 9 distinct unresolved name conflicts, and 12 raw-reparse verification samples. Reports are `reports/full-roster-research.{json,md}`, `reports/research-quality.{json,md}` and `reports/research-independent-verification.{json,md}`; human/editorial approval remains zero.
- Multi-source biography ingestion foundation executed against retained KCC/MOI captures: 92 source attempts, 90 checksum-verified snapshots, 64 identity observations, 897 machine claims/evidence, 106 audits and 9 open conflicts. Only 9 candidates have conservative matches; all 897 claims await human/editorial review and approved publication remains empty. Reports are `reports/biography-coverage.{json,md}`, `reports/biography-quality.{json,md}`, `reports/identity-conflicts.{json,md}` and `reports/biography-verification.json`.
- First release preparation audit completed for the four-candidate pilot: 405 claims classified, four `服務政見` attribution corrections carry lineage, 399 claims are ready for human review, 6 are blocked by freshness/outcome evidence, no consolidation groups were found, and an equal 12-claim queue was prepared. The queue is not approval or publication; see `docs/RELEASE_PREPARATION.md` and `reports/editorial-release-*`.
- Chibi avatar asset pipeline completed at the engineering level: five deterministic original fictional GLBs, four explicit demo mappings, shared animation clips, manifest/checksum/GLB validation, R3F fallback/error handling, and a developer-only preview. Real-person likeness review and publication remain out of scope until suitable references and human visual review exist; see `docs/CHARACTER_ASSETS.md`.
- Scoped enrichment completed at the machine/research-preparation level for 12 District 4 candidates and five mayoral candidates: 17 × 6 audits, 588 source attempts, 31 source records, 198 observations, 143 claims/evidence, 42 populated audits, 60 neutral gaps, one retained exact-duplicate group, and three independent verification samples. All scoped approved/published layers remain empty; see `docs/SCOPED_ENRICHMENT.md` and `reports/enrichment-*`.
- Scoped review/publication preparation completed at the machine level: 107 blocker rows across 75 audits, 203 claim-plus-gap queue items, 13 stratified verification samples, and a 0/143 eligible governed scoped gate. The existing `/editorial-review/` now provides local scope/category/readiness filters and decision export; no reviewer or publication decision exists. See `docs/SCOPED_REVIEW_PUBLICATION.md` and `reports/zuoying-mayoral-*`.
- Independent evidence audit completed at the machine level: all 143 scoped claims were reopened against retained raw snapshots in two deterministic passes; first pass 4 machine-verified/139 needs-review/0 unsupported, second pass 2/141, 141 agreements and 2 disagreements, 0 corrections, 149 blocker findings. Both ACP agent attempts were unavailable; no human review or publication was created. See `docs/INDEPENDENT_AI_AUDIT.md` and `reports/independent-ai-review.json`.
- Semantic evidence adjudication now has a separate packet/invocation/comparison contract and local-only review surface; completion requires 143 valid Reviewer A findings and 143 valid Reviewer B findings with exact packet citations. It never bypasses human review or the publication gate; see `docs/SEMANTIC_EVIDENCE_ADJUDICATION.md`.
- Autonomous candidate content publication completed its machine-only policy path for the 143-claim scoped corpus: `automated-editorial-policy-v1` produced 1 machine-approved/public historical institutional claim and 142 rejected decisions. All 71 disagreements, 25 correction targets and wrong-subject `enrich-claim-0111` remain fail-closed; human/editorial approval is still zero. See `docs/AUTOMATED_PUBLICATION.md`.

## Next milestone: genuine review of the bounded release queue, formal-announcement refresh, and future asset governance

1. Review biography identity observations and claim packets with real human reviewers; resolve or retain the nine conflicts without name-only merges.
2. Retrieve the official 2026-11-12 mayor and 2026-11-17 council announcements.
3. Add new immutable snapshots and update manifest/checksums.
4. Reconcile qualification, drawing and final announcement records; only then promote numbers to `final` where supported.
5. Human-review and publish council candidate identities/constituencies and biography claims if the sources are sufficient.

## Future public-record work

The current implementation contains a representative source-backed public-record slice, a full-roster coverage audit, and an executed CEC P0/P1 research layer. Future work may complete human review, execute P2/P3 research, resolve the nine retained official-name conflicts, add more candidates through the same offline snapshot/review/approval pipeline, and fill only specifically sourced audit slots with claim-level primary evidence. Coverage gaps remain unknown, not negative findings. It must not infer claims from general web search, treat machine-validated or `approved-source-backed` data as editorial approval, or silently mix demo fixtures into official bundles.

## Later product work

- Respectful, licensed GLB asset pipeline with non-canvas equivalents.
- District-specific artistic diorama variants, performance budgets and visual regression.
- Approved client-side search over policy/news metadata after provenance model is extended.
- Correction history, accessibility audit and optional multilingual governance.

## Explicitly out of scope

No rankings, points, game economy, authentication, backend CMS, runtime search API, full city simulation, automatic political claim generation, or automatic publication of unreviewed source text.
