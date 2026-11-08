# Official raw snapshots

These files are retrieved source inputs for the 2026 Kaohsiung local-election slice. They are separate from `src/data/fixtures.ts` and are consumed offline by deterministic adapters.

- `cec-central-65213.json`: CEC qualification article supporting the five Kaohsiung mayoral names.
- `cec-central-63625.json` and `cec-63625-constituencies.pdf`: official election date, seat, and constituency definitions. The PDF establishes ordinary districts 1–11, 平地原住民 district 12, and 山地原住民 districts 13–15.
- `khec-65366.json` and `khec-65366-candidate-numbers.pdf`: official drawn-number sheet. The PDF is image-only; council transcription remains pending review and is not promoted into the approved dataset.

The static build never fetches these URLs. To update a snapshot, retrieve it from the official publisher, update the manifest checksum and review metadata, run adapter/reconciliation checks, and rebuild.
