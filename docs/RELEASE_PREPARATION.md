# 首批履歷釋出準備

本文件記錄 `release-first-approved-candidate-biographies` 的離線準備結果。它是人工審查前的工作包，不代表任何候選人已核准或已出版。

## 範圍

本批只處理既有 pilot 的四位候選人與 405 筆 claim：鄭光峰、陳麗娜、邱于軒、王耀裕。所有原始 KCC 快照、URL、SHA-256、byte length 與 evidence ID 維持不變；四筆 `服務政見` 記錄改由正規化層標示為 `candidate-statement` / `self-reported`，並以 `lineage` 保存原始分類、理由、來源 checksum、evidence ID 與修正方法。來源 bytes 沒有被改寫。

## 離線命令

```bash
npm run release:prepare
npm run release:verify
npm run release:report
npm run openspec:validate:release
```

`release:prepare` 只讀已保存的 normalized dataset、pilot summary 與 raw snapshots；不連線、不改 reviewer registry、decision set 或 publication snapshot。`release:verify` 重新驗證報告、批次、來源 checksum 與固定候選人範圍。

本機設定 `EDITORIAL_REVIEW=true npm run editorial:review` 後，`/editorial-review/` 的「審查批次」篩選器可只顯示 12 筆選取 claim；每筆仍可查看 evidence、來源連結、attribution 與 readiness/temporal blocker。瀏覽器匯出只是 decisions JSON，仍須由 CLI 驗證與套用。

## 2026-11-06 測量結果

- 405/405 claims 有 direct evidence、resolved machine identity、current retained source version。
- 分類：395 basic-biographical-fact、4 current-position、4 candidate-statement、2 administrative-outcome。
- 399 筆可交給真人審查；6 筆阻擋：4 筆 currentness 缺少可驗證的新鮮來源時間，2 筆含成果語意，需要獨立的機關結果證據。
- 所有 405 筆日期精度仍是 unknown；4 個 KCC 來源的 timestamp quality 是 `capture-file-mtime`，不被轉成事件日期或出版日期。
- 未偵測到 exact duplicate 或 conservative possible-overlap group；工具不會刪除、合併或靜默改寫 claims。
- review batch 等量選取每位候選人 3 筆，共 12 筆。它只是一個本機 review queue，不是 approval 或 public data。
- 四筆 `服務政見` 的 canonical attribution correction 已有 lineage；pilot 範圍內 candidate-statement 數量為 4。

批次與報告：

- `data/editorial/release/2026/biography-release-batch.json`
- `reports/editorial-release-readiness.{json,md}`
- `reports/editorial-release-candidates.md`
- `reports/editorial-release-quality.md`
- `reports/editorial-release-claim-consolidation.md`

## 人工邊界

真實 reviewer 必須先加入本機 `data/editorial/reviewer-registry.json`，再逐筆檢查 identity observation、evidence、attribution、日期與來源版本，匯出 decisions，執行 `editorial:apply` / `editorial:validate`。publication gate 的條件未被此批次放寬；目前 registry、decision set 與 `data/published/2026/candidate-biographies.json` 仍為空。

選取的 12 筆 claim 不會由 build 讀取，也不會進入公開 HTML、JSON、搜尋、metadata 或 WebGL。只有通過原有 gate 的真實 decisions 才能由 `editorial:publish` 產生公開 snapshot。
