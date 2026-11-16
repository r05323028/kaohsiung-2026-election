# Candidate roster enrichment audit

- Roster: kaohsiung-2026-local-election (2026-11-05)
- Candidates: 106
- Category audit rows: 742 (106 × 7)
- Claims: 5801; statically published/controlled claims: 4585
- Provenance rows: 2402
- Human-reviewed claims: 0; editorially approved claims: 0

## Category coverage

| Category | Attempted candidates | Candidates with claims | Published claims | Gap rows |
| --- | ---: | ---: | ---: | ---: |
| basic-profile | 106 | 103 | 829 | 6 |
| biography | 106 | 9 | 0 | 106 |
| news | 106 | 69 | 222 | 37 |
| public-records | 106 | 97 | 9 | 9 |
| political-career | 106 | 68 | 2402 | 38 |
| policy | 106 | 93 | 1017 | 40 |
| political-family | 106 | 106 | 106 | 0 |

## Neutral gap semantics

- not-attempted, source-unavailable, insufficient-evidence, pending-human-review, and no-verifiable-record-found are processing states, not negative evidence.
- The empty reviewer registry and absent editorial decisions mean no claim is labeled human-reviewed or editorially approved.
- Existing approved/published layers are reported as controlled-layer/static publication states; those labels are not rewritten as human approval.
- Political-family rows are candidate coverage/status records; they do not by themselves establish a verified family relationship.

## Artifact files

- coverage.json: exact canonical roster/category matrix and recomputed lifecycle counts.
- claims.json: claim-level states and links to evidence/provenance.
- provenance.json: source metadata and local raw hash/byte checks.
- gaps.json: neutral candidate/category gaps.
- audit.md: this concise summary.
