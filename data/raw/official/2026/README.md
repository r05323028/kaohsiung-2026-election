# Official raw snapshots

These files are retrieved source inputs for the 2026 Kaohsiung local-election slice. They are separate from src/data/fixtures.ts and are consumed offline by deterministic adapters.

- cec-central-65213.json: CEC qualification article supporting the five Kaohsiung mayoral names.
- cec-central-63625.json and cec-63625-constituencies.pdf: official election date, seat, and constituency definitions. The PDF establishes ordinary districts 1-11, plain-indigenous district 12, and mountain-indigenous districts 13-15.
- khec-65366.json and khec-65366-candidate-numbers.pdf: official drawn-number sheet retained as historical provenance. The PDF is image-only.
- khec-65759.json and khec-65759-mayoral-final-announcement.pdf: final mayoral candidate announcement published 2026-11-12; the PDF is image-only.
- khec-66006.json and khec-66006-council-final-announcement.pdf: final city-council candidate announcement published 2026-11-17; the PDF is image-only. District 1-9 rows are on page 1 and districts 10-15 on page 2.
- khec-bulletin-2026-11-19.json: KHEC bulletin index captured on 2026-11-19.

The static build never fetches these URLs. To update a snapshot, retrieve it from the official publisher, add a new raw file instead of overwriting retained bytes, update the manifest checksum and review metadata, run adapter/reconciliation checks, and rebuild.
