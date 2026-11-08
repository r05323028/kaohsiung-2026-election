# Semantic evidence adjudication

## Scope

This workflow reviews the 143 claims in the isolated 2026-11-07 Zuoying/District 4 and mayoral enrichment corpus. It is separate from the deterministic raw-reopen audit, the existing editorial decision system, and the public biography publication snapshot.

## Execution contract

- `data/enrichment/semantic-review/2026/evidence-packets.json` is a build-time packet for each claim. It includes the claim, identity observation, evidence, source metadata, raw context, SHA-256, and byte length.
- Model invocations use an explicitly selected local execution runner and a structured response schema. Reviewer A and Reviewer B receive the same packet in separate invocations and must not see each other's output or prior audit conclusions.
- A citation is accepted only when its source ID and evidence ID belong to the packet and its excerpt is an exact contiguous substring of the retained source/evidence context. Ellipses and paraphrase citations are rejected and retained as failed attempts.
- Raw source bytes are never edited or refreshed by this workflow. A checksum or packet mismatch blocks the finding rather than being silently repaired.
- Comparisons preserve both findings and classify agreement/disagreement by verdict, identity, attribution, temporal assessment, evidence, correction, and limitation dimensions. No majority vote automatically resolves a disagreement.

## Status boundary

The semantic result is machine-assisted research. It is not a reviewer identity, human editorial approval, publication decision, or evidence that a claim is safe to publish. Findings remain in `data/enrichment/semantic-review/` and `reports/` and are loaded only by the local `/editorial-review/` workspace. The scoped approved/published layers, the existing global biography publication snapshot, and both publication gates remain unchanged.

## Commands

- `npm run semantic:prepare` — rebuild immutable evidence packets and checksums offline.
- `npm run semantic:adjudicate` — validate raw model runs and generate findings/comparison/correction/blocker/coverage reports.
- `npm run semantic:validate` — validate the persisted semantic report and citation/checksum accounting.
- `npm run semantic:verify` — require 143 packets, 143 valid Reviewer A findings, 143 valid Reviewer B findings, and 143 paired comparisons.
- `npm run openspec:validate:semantic` — strict-validate the OpenSpec contract.

Model/provider failures, invalid structured outputs, unavailable agent attempts, token/cost metadata, and null runner session IDs are retained as execution accounting. Missing model output is never replaced with a fabricated finding. The final report must distinguish successful semantic findings from failed or unavailable attempts, deterministic audits, human review, and publication.

## Human next step

An authorized reviewer must inspect the claim-linked findings, citations, disagreements, proposed corrections, and remaining blockers through the local review workspace. They must then export decisions and use the existing CLI and publication gate. No semantic verdict can approve, reject, reconcile identity, or publish a candidate by itself.
