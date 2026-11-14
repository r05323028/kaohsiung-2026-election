# 履歷 publication policy

本政策定義哪些 biography claim 可以進入港都人物誌的公開靜態頁面。它延續非黨派、來源可追溯與不過度推論原則。

## 唯一公開輸入

Production Astro build 唯一讀取：

```text
data/published/2026/candidate-biographies.json
```

該檔案是由 `npm run editorial:publish` 產生的 deterministic publication snapshot。它只含 publication-eligible claim records、approved claim IDs、來源版本 reference、decision references、snapshot checksum 與中性說明；不含 review packet、reviewer registry、rationale 或 pending queue。`src/data/biographies/index.ts` 會驗證 snapshot schema 後才建立公開 read model。

`data/normalized/`、`data/review/`、`data/editorial/` 與 reports 是研究／編審層。它們不可直接成為公開 HTML、JSON、search index、Open Graph metadata 或 structured data。空白公開 snapshot 表示目前沒有已核准可出版 claims，不表示候選人不存在資料。

## Claim eligibility

每一筆 claim 必須同時符合：

1. candidate、claim、evidence、observation 與 source reference 完整一致。
2. machine validation 通過，但 machine validation 不等於 editorial approval。
3. identity observations 已 resolved；必要的 identity decision 是 active `confirm-same`，且沒有 blocking conflict 或 identity reversal。
4. 有支持該 claim 的 evidence，且 evidence source IDs 與 claim source IDs 一致；矛盾 evidence 會阻擋出版。
5. 每個 claim source 與 identity evidence source 的 SHA-256 都與當前 packet 相同；來源版本變更會使依賴 decision stale。
6. 有同一 subject 的 active claim `approve` decision，reviewer 存在於 active registry、具 `editorial-approval` 權限，且 decision 包含 rationale/confirmation/時間與來源版本。
7. 沒有被 reject、dispute、supersede 或未解 identity conflict 阻擋。

閘門失敗的 claim 不會被靜默刪除；它會留在內部 report，並列出 blocker reason。只有 eligible claims 才能寫入 snapshot。

## 時間與表述

事件日期、職務起訖日、來源發布日、來源擷取日、檔案修改時間與 editorial decision time 必須分開。來源沒有日期時，公開文字必須保持未知或歷史範圍，不可用檔案時間戳補成事件日期。歷史履歷不能單獨證明目前職務；current position 需要適合查核日期的證據。

所有候選人使用等價的視覺與資訊處理，不建立排名、人氣分數或主觀好壞描述。候選人 statement 必須明確標示為 attributed statement，不可改寫成獨立事實。

## Source revision、rollback 與報告

每次 `editorial:validate` 都會重算目前 dataset、decision、gate 與 snapshot 的一致性。checksum 變更時，應保留舊版本並重新產生 review packet；舊 approval 不得靜默沿用。若要 rollback，恢復經驗證的 decision export／source snapshot，再重新執行 validate、publish 與 build，不要手動編輯公開 HTML。

`reports/publication-gate.{json,md}` 記錄 eligible/blocked claims 與 blocker counts；`reports/editorial-review-summary.{json,md}` 記錄審查狀態；`reports/identity-review-summary.{json,md}` 記錄 conflict resolution。報告的 machine counts 不得當成人類審查 counts。

## 當前出版狀態

截至 `2026-11-06`：897 machine claims、9 open identity conflicts、0 human-reviewed、0 editorially approved、0 published claims。四位 pilot 候選人的 405 筆 claims 已完成 release audit，但 12 筆 queue 仍只是待審工作包。空 reviewer registry 與空 decision set 是目前的真實狀態；fictional workflow 測試只證明規則可運作，不會改變 production snapshot。

## 發布前檢查

```bash
npm run editorial:validate
npm run editorial:publish
npm run build
BASE_PATH=/kaohsiung-2026-election/ npm run build
```

若要新增第一筆真實資料，必須由已設定且實際負責的 reviewer 逐筆檢查原始來源、匯出 decision、通過 CLI integrity gate，再重新產生靜態網站。沒有真人決定時，正確行為是維持空 snapshot。
