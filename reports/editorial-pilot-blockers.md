# Editorial pilot blockers and next actions

## Blocking conditions

- The production reviewer registry has zero configured authorized reviewers; no reviewer identity may be invented or inferred from the agent, OS user, or Git metadata.
- The production decision set is empty, so all 405 pilot claims remain awaiting genuine human review.
- The publication snapshot is intentionally empty; no claim may bypass identity confirmation, evidence/version checks, explicit confirmation, reviewer authorization, and the existing publication gate.
- Machine identity is resolved for 4 selected candidates, but this does not constitute human identity confirmation.
- 405 claims have unknown temporal precision. No source capture timestamp was converted to a political event date.
- KCC retained snapshots record `capture-file-mtime` quality and no `sourceRetrievedAt`; a reviewer should confirm currentness against a current authoritative source before approving current-position claims.
- 4 claims are explicitly labeled `服務政見` in KCC pages. Review their wording as candidate statements; source presence does not establish implementation, outcome, or achievement.
- No selected claim failed the bounded retained-source/evidence support check; this still does not remove the human review requirement.

## Exact next human action

1. Configure a real human reviewer in `data/editorial/reviewer-registry.json` with an explicit reviewer ID and authorized actions; the local registry is not authentication.
2. Run `EDITORIAL_REVIEW=true npm run editorial:review`, open `/editorial-review/`, filter each selected candidate, and reopen every linked source in the packet.
3. For each claim the reviewer can substantiate, enter a rationale and explicit confirmation, export the JSON decision set, and have the CLI validate/apply it.
4. Resolve or explicitly withhold any identity/date conflict; do not approve unsupported or stale claims.
5. Run `npm run editorial:publish` and inspect the gate report. Only then can a non-empty static publication snapshot be considered.
