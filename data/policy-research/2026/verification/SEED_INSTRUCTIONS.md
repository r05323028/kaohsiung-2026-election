# Seed policy verification (batch seed-verify-NN)

You are an independent verifier. You did not produce these policy records and must not assume they are correct.

Input: `data/policy-research/2026/verification/seed-input-NN.json`. Each group names one retained source page (`source.url`, `source.publisher`, `source.rawPath`) and the policy records extracted from it in an earlier pass.

For every policy record, open the source's `rawPath` (the retained page text) and decide:

1. **Attribution** — does the source actually attribute this statement to this candidate? Check the candidate's name, party, district or office in the surrounding text. If the page only names the party or is about a different person, attribution fails.
2. **Excerpt** — is `originalStatement` present in the page (allowing whitespace/punctuation normalization)? Set `excerptPresentInSource` from your own reading.
3. **Figures and conditions** — are numbers, amounts, locations, deadlines and conditional wording preserved exactly as in the source?
4. **Date and cycle** — does `statementDate` fit the source and the 2026 election context? Historical statements must not be presented as current commitments.

Decision values:
- `verified` — attributable, faithfully quoted, figures/conditions accurate, date and cycle coherent.
- `rejected` — misattributed, not present in the source, meaning materially changed, or wrong candidate/election cycle.
- `unresolved` — the source text is ambiguous, truncated, or does not settle the question.

Verification is about evidence and attribution, **not** whether the policy is feasible, wise, or likely to work. Do not reject a policy because you disagree with it.

Output `data/policy-research/2026/verification/seed-verify-NN.json`:

```json
{
  "batchId": "seed-verify-NN",
  "verifierRole": "independent-verifier",
  "decisions": [
    {
      "policyId": "policy-...",
      "decision": "verified",
      "checks": {
        "attributionResolved": true,
        "excerptPresentInSource": true,
        "figuresPreserved": true,
        "dateConsistent": true
      },
      "note": "簡短中文理由，指出來源中的歸屬證據。"
    }
  ]
}
```

Every policyId in the input must appear exactly once. Run `npx tsx scripts/policy-research/check-seed-verification.ts NN` and fix until it prints ok. Do not edit any other file.
