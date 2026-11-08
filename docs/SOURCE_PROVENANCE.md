# Source provenance

## Primary-source policy

The approved dataset uses official CEC/KHEC sources only. The machine-readable manifest is `data/official-source-manifest.json`; every retained snapshot has a local path and SHA-256. The manifest also records official portal paths that were reachable but blocked (`403 FORBIDDEN`) so they are not mistaken for retrieved evidence.

## Current retained sources

| Source | Role | Status |
| --- | --- | --- |
| CEC article 65213 | candidate qualification roster | verified qualification source |
| CEC article 63625 + PDF | election date, seats, constituency definitions | verified official definition |
| CEC article 64009 | candidate registration rules | verified context |
| CEC Vote2026 `cand/C1/64000.json` | 2026 mayor candidate rows and P0 identity observations | retained HTTP 200 snapshot; research review pending |
| CEC Vote2026 `cand/T/64000.json` | 2026 city-council candidate rows and P0 identity observations | retained HTTP 200 snapshot; 9 name conflicts pending review |
| CEC Vote2026 party/district/type JSON | party/district/type lookup context | retained research snapshots; not used to infer missing biography |
| KHEC article 65366 + PDF | drawn candidate numbers | verified source; transcription/finality review pending |
| KHEC bulletin/info/menu | publisher/navigation context | verified context |
| Vote2026 `menu.json`, `link.json`, `news.json` | portal child paths | 403/unverified, not used |
| KCC member pages for 李眉蓁/王義雄 | institutional identity and current position | verified snapshots; public-record review pending |
| KCC news 17284/17102/17293/17093 | institutional questioning summaries | verified snapshots; documented participation only |
| KCC homepage | institutional context | not used for roster |

Canonical URLs and API/file IDs are in the manifest. Public pages include source links from each approved candidate and the Sources page. Public-record reports are `reports/public-record-coverage.{json,md}` and `reports/public-record-quality.{json,md}`; full-roster audit reports are `reports/full-roster-coverage.{json,md}`. Executed research reports are `reports/full-roster-research.{json,md}`, `reports/research-quality.{json,md}` and `reports/research-independent-verification.{json,md}`. They report source/review state, never candidate rankings or a single completeness score. The executed research covers 106 official candidates × 6 categories: 318 attempted/retrieved category audits, 318 not-attempted P2/P3 audits, 97 machine claims, 106 evidence items and 9 distinct unresolved name conflicts. `not-attempted` means no retained candidate-specific snapshot was used in this offline run, not that no source exists.

## Full-roster audit provenance

Each coverage audit preserves the official candidate ID/person ID, category, discovery plan, source-consulted/candidate source IDs, expected/actual checksum status, identity basis, claim/evidence counts, review state, publication state, attempt timestamp and previous-audit status. The review packet keeps gap items separate from claims and never invents reviewer identity/date. The batch CLI accepts deterministic candidate/district/category filters, dry-run, bounded concurrency, retry limits and resume checkpoints; it never fetches live URLs.

## Snapshot metadata

Each source record should retain:

- stable source ID and canonical/API URL
- title/publisher
- publication date and retrieval date
- local raw/attachment path
- SHA-256 checksum
- source role and verification/publication status
- related review or reconciliation decision

## Corrections

A changed checksum is a source change, not a harmless overwrite. Add a new snapshot or update the reviewed snapshot intentionally, rerun adapters and reconciliation, inspect the diff, and keep the old report/history where possible. Build failure is preferable to silently publishing changed bytes.

## No inference

Official source context does not authorize missing candidate biography, policy, record, news or family claims. The UI uses neutral unavailable states and retains source attribution. KCC institutional news supports documented participation in a published questioning summary, not a personal policy, achievement or administrative outcome. The official KHEC PDF can support the label "抽定"; it cannot by itself support the label "正式公告".
