# 自動化候選人內容出版

## 範圍與邊界

`autonomous-candidate-content-publication` 是只作用於 2026-11-07 左營第 4 選區與市長 scoped enrichment 的獨立、離線、fail-closed machine-publication path。它不是人類 editorial review 的替代品，也不改寫 `evaluateEditorialPublicationGate(...)` 或 `evaluateScopedEnrichmentPublicationGate(...)`。

政策版本固定為 `automated-editorial-policy-v1`，輸入固定為 `data/enrichment/normalized/2026/zuoying-mayoral.json` 與已完成 packet-citation validation 的 semantic report。建置不連線、不執行 runtime model/API、不使用 backend/database，也不寫入 global reviewer registry、human decisions 或既有 `data/published/2026/candidate-biographies.json`。

## Fail-closed policy v1

只有下列內容可進入 machine-publication snapshot：

- historical `basic-biography` claim，且 claim type 是 `education`、`historical-position` 或 `professional-experience`；
- institutional-record attribution/dependency、machine-validated、resolved identity、`isNameOnlyMatch: false`；
- 直接 evidence、目前 raw source SHA-256/byte length 與 semantic packet checksum 全部一致；
- source class 是已保留且允許的 KCC member profile 或 Legislative Yuan record；
- Reviewer A/B 都是完成的真實 semantic invocations，verdict 都是 `supported`，comparison 必須是 `full-agreement`；
- 不在 duplicate/overlap group，沒有 correction proposal、contradictory evidence、wrong-identity verdict 或 stale source。

所有其他 claim 都會產生一筆明確的 `machine-rejected` 或 `withdrawn` decision，並保留 claim/source/evidence/identity IDs 與 blocker 原因。缺少資料不推論不存在；日期未知時不推導時間順序。

## 2026-11-07 measured result

`npm run automated:execute` 產生 143 筆 decisions：1 `machine-approved`、142 `machine-rejected`，以及 1 筆 public record。唯一 machine-approved claim 是 `enrich-claim-0031`（白喬茵，歷史專業經驗「三立新聞台主播」），來源為保留的 KCC profile `scope-kcc-profile-2181`；兩位 semantic reviewers 都判定 `supported` 且為 `full-agreement`。它的日期仍為 unknown，頁面不推導任職時間。

所有 71 個 partial-disagreement dispositions、全部 25 個 correction targets 都保留在 audit reports；corrections 只記錄、不套用到 normalized wording。`enrich-claim-0111` 的來源身份可辨識，但語句描述的是其他人（黃偵琳／張以理），不是尹立，因此永久排除原 claim，並記錄 `wrong-identity-verdict`，不重新連結到其他候選人。

## Provenance、withdrawal、public boundary

`data/enrichment/automated/2026/zuoying-mayoral-decisions.json` 保存 policy version、claim version、source versions、evidence/identity IDs、packet checksum、Reviewer A/B run/model/runner/verdict 與 machine rationale。這些是機器 provenance，不是 reviewer identity，也不是 human approval。

`data/published/2026/zuoying-mayoral-automated.json` 是 reviewer-free、strict 的 public snapshot，只保留公開必要 wording、candidate/claim/source/evidence IDs 與來源 URL；不包含 raw path、source checksum、packet、model run ID、reviewer metadata 或內部 blocker。`src/data/official/index.ts` 只在有目前 machine-public records 時附加 read model，未載入 semantic/review packets。

`automated:validate` 與 `automated:verify` 每次重開所有 referenced raw snapshots，檢查 SHA-256、byte length、claim/evidence anchors、identity、semantic run IDs/citations、policy eligibility 與 snapshot checksum。來源、claim wording、packet 或身份條件變更時，輸出不能通過；現有 publication records 會被 withdrawal/阻擋，不會靜默保留。

## Commands

```bash
npm run automated:execute
npm run automated:validate
npm run automated:verify
npm run automated:report
npm run openspec:validate:automated
```

Local editorial UI 可在 `EDITORIAL_REVIEW=true npm run dev` 查看 machine policy summary、disagreement/correction accounting 與 public snapshot，但它不提供自動批准按鈕。公開 Astro build 只消費 reviewer-free automated snapshot 與既有 public read model；normalized、semantic、decision provenance 與 blocker reports 不進公開 HTML、search 或 metadata。

## Human and publication status

本批次的 machine path 已有 1 筆機器政策核准／靜態公開 record，但 human-reviewed、human-approved、editorially-approved 仍為 0。machine publication 不代表候選人同意、官方背書或人類編輯核准；所有 142 個排除項目與 25 個 correction targets 仍需人類 editorial review 才能改寫、補證或透過既有 scoped gate 發布。