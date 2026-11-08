# Data ingestion

## Purpose

Official election data is ingested at build preparation time, never in the browser or a production server. The repository stores enough evidence to reproduce the approved static output offline.

## Layers

```text
data/raw/official/2026/
  immutable API/PDF snapshots
        ↓
src/data/official/adapters.ts
        ↓
data/normalized/2026/
  normalized names, IDs, status, source IDs
        ↓
data/review/2026/
  human review decisions and pending scopes
        ↓
data/approved/2026/
  canonical publishable dataset
        ↓
npm run validate:official -> reports -> astro build
```

Never make the page read raw or normalized content directly. Only `data/approved/` is mapped by `src/data/official/index.ts`; coverage audits are reports/review inputs and are not profile claims.

## Current source inputs

- CEC article 65213: qualification roster; extracts the five Kaohsiung mayor names.
- CEC article 63625 + PDF: election date, seat counts and constituency definitions (ordinary 1–11, flat indigenous 12, mountain indigenous 13–15).
- CEC article 64009: registration-rule context.
- KHEC articles 65366/65368 + the shared image-only PDF: drawn candidate numbers; the five mayor rows are cross-checked and 101 council rows are manually transcribed with a per-row review packet. Article 65368 is a duplicate alias, not independent evidence; the council rows remain preliminary until the 2026-11-17 formal announcement.
- KCC member pages for 李眉蓁 and 王義雄 plus four KCC institutional news snapshots: a selected public-record slice with 6 claims, 2 position records, 4 documented-questioning activities, 4 news metadata records and 6 timeline events. These support institutional identity and documented participation only; no party, policy achievement, family relationship or political relationship is inferred. 賴瑞隆 intentionally has no bundle.
- Vote2026 child JSON paths returning 403 are retained in the manifest as unverified, not used as data.

## Full-roster coverage batch

`src/data/public-records/coverage.ts` 與 `scripts/public-records-coverage.ts` 對 official approved roster 執行 network-free audit：

```bash
npm run records:discover -- --dry-run --candidate <id> --category news
npm run records:discover -- --resume --retries 2 --concurrency 4
npm run records:ingest
npm run records:review-report
npm run records:coverage
npm run validate:full-roster
```

批次會產生 `data/discovery/`、`data/normalized/`、`data/checkpoints/`、`data/review/` 與 `reports/full-roster-coverage.{json,md}`。所有 snapshot checksum 都必須 unchanged；atomic write 避免失敗 run 覆蓋既有結果。`source-retrieved` 只描述已保留的來源快照；`not-attempted` 只描述本次離線批次沒有候選人專屬 snapshot，不是不存在證據。

## Executed candidate research

這次研究執行使用 CEC Vote2026 的正式靜態 JSON：`C1/64000.json`（市長）與 `T/64000.json`（市議員第 1–15 選區）。實際 HTTP 取得結果已保存於 `data/raw/official/2026/research/`，並在 `data/research/2026/candidate-research-source-manifest.json` 與 `data/official-source-manifest.json` 留存 URL、HTTP 200、byte length、retrievedAt 與 SHA-256。R3 indigenous-representative JSON 沒有併入市議員名冊。

```bash
npm run research:execute -- --dry-run --retries 2 --concurrency 2
npm run research:execute
npm run research:validate
npm run research:review
npm run research:verify
```

`research:execute` 對 106 位候選人的六類別建立 636 格審計：P0 positions 106 格實際取得，P1 policies/activities 只記錄官方名冊來源範圍與空白欄位限制，P2 news/timeline 與 P3 relationships 尚未執行。結果層分離為 normalized、review、approved、checkpoint；目前 97 個 P0 machine claims、106 個 evidence、9 位姓名字元衝突，reviewerId/reviewedAt 都是 null。CEC 空白欄位不會被轉成「沒有資料」，衝突不以姓名單獨合併。

輸出：`reports/full-roster-research.{json,md}`、`reports/research-quality.{json,md}`、`reports/research-independent-verification.{json,md}`。`research:verify` 從原始 C1/T 快照重新解析，固定抽樣市長、第 4 與第 13 選區及衝突列；它是機器重解析，不是人工審查。

## Update procedure

1. Retrieve the official API/document manually or with a reproducible script; record URL, title, publication date, retrieval date, file ID and SHA-256.
2. Add a new raw snapshot; do not overwrite history without recording the change.
3. Update an adapter and normalized output. Parsing must be deterministic and idempotent for identical bytes.
4. Add/adjust `data/review/` with reviewer, status, scope, unresolved questions and expected resolution date.
5. Reconcile against an independently retained official roster. A mismatch blocks promotion.
6. Move only reviewed, source-backed records into `data/approved/` and keep pending records out of public candidate lists.
7. Run `npm run validate:data`, `npm run validate:official`, `npm run validate:public-records`, `npm run validate:full-roster`, `npm run validate:research`, `npm test`, `npm run typecheck`, captured `npm run lint`, `npm run build` and E2E tests.

## Approval rules

- `publicationStatus: approved` requires approved qualification and source IDs that exist in the approved dataset.
- A drawn number can be displayed with an explicit non-final label, but `candidateNumberIsFinal` must remain false until a final announcement is reviewed.
- An unavailable or pending item must render a neutral state, not a demo fallback and not a negative claim.
- Public-record claims and records require evidence IDs; cross-claim evidence, inverted claim dates, unresolved review metadata and unresolved conflicts fail validation.
- `approved-source-backed` is not human editorial approval; the current public-record dataset remains `pending-human-review`.
- No network request is made by `npm run validate:official`, `npm run validate:public-records`, `npm run validate:research` or Astro build; network retrieval is a separate, explicit pre-build operation and its bytes must be checked in first.
