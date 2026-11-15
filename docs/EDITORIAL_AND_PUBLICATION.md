# 編輯與發布

本專案區分四個階段，任何一階段都不得被當成下一階段：

| 階段 | 意義 | 不代表 |
| --- | --- | --- |
| 機器驗證／查核 | 決定性檢查：schema、來源、checksum、引文、身分訊號 | 人工審查、核准、可發布 |
| 人工審查 | 具名審查者逐筆檢視來源與證據 | 編輯核准（仍需決策） |
| 編輯核准 | 針對特定 claim 的具名決策（含理由、時間、來源版本） | 自動永久有效（來源變更即使決策失效） |
| 發布 | 由閘門產生 deterministic 快照，Astro 只讀該快照 | 對候選人的背書或事實保證 |

公開頁面只讀受控快照；raw、normalized、review、decision 與報告都不進 HTML、搜尋、metadata 或 3D。

## 發布閘門

### 1. 履歷出版閘門（人工）

`evaluateEditorialPublicationGate(dataset, decisionSet, registry, packet)`。一筆 claim 需同時滿足：

1. candidate／claim／evidence／observation／source 參照完整一致。
2. 機器驗證通過（但這不是 editorial approval）。
3. 身分 observations 已 resolved，必要決策為 active `confirm-same`，無 blocking conflict 或 identity reversal。
4. 有支持證據，且 claim 與 evidence 的 source ID 一致；矛盾證據阻擋出版。
5. 每個來源的 SHA-256 與當前 packet 相同；來源變更會使依賴決策 stale。
6. 同一 subject 有 active `approve` 決策，reviewer 存在於 active registry、具 `editorial-approval`，且決策含理由、確認、時間與來源版本。
7. 未被 reject／dispute／supersede／未解衝突阻擋。

被阻擋的 claim 不會被靜默刪除，而是留在內部報告並列出原因。

### 2. 基本資料查核（`basic-profile-machine-verification-v1`）

獨立查核者重新開啟來源後逐筆決定；需 `verdict: verified`、`accessible`、`matchesClaim`，且 `identityMatch`／`supportsField`／`dateConsistent`／`currentStatusCorrect` 全為 true。另拒絕：非 https、無 publisher／retrievedAt／逐字 excerpt、維基百科作為唯一證據、現職僅憑候選人自述、歷史職務無結束年、現職卻有結束年、私人個資。查核者不得修改 claim 讓它通過；研究者不得自標已查核。此狀態仍是機器查核，不是人工編輯核准。

### 3. 政策主張

`originalStatement` 必須是來源全文的連續原文、可機器比對；候選人身分可由姓名＋選區／職稱脈絡確認；獨立查核為 `verified` 且保留歸屬與數字；來源具 URL、發布者、擷取時間與雜湊。未通過者留在研究層並標記 `withheld-pending-review` 或 `rejected`。

### 4. 新聞（`news-publication-policy-v1`）

需 `verified`、姓名風險 `low`（姓名在標題，且文中至少一個選區專屬線索）、日期可確認、20–240 字中性摘要（封鎖評價詞）、非重複轉載，且摘要每項事實可在原文找到。錯誤身分或摘要不實者列入 `data/approved/2026/candidate-news-editorial.json` 的排除清單並保留理由。

### 5. scoped enrichment（左營第 4 選區／市長研究）

`evaluateScopedEnrichmentPublicationGate(dataset, decisions, registry)` 重用同一 reviewer／decision schema，額外要求 claim approval、身分確認、證據與來源版本、機器驗證、歸因一致與必要的獨立證據。目前 107 個 blockers、203 筆 queue、0 筆 eligible。

### 6. 獨立機器出版（例外路徑）

`automated-editorial-policy-v1` 只作用於 scoped corpus，且條件嚴格：僅歷史 `basic-biography` 的 education／historical-position／professional-experience、機構紀錄歸因、resolved identity 且非 name-only、直接證據與 checksum／packet 一致、來源為 KCC 或立法院、Reviewer A/B 皆 `supported` 且 `full-agreement`、不在 duplicate group、無更正、無矛盾、無錯誤身分、無 stale source。

結果（143 筆）：1 筆 `machine-approved`（白喬茵，KCC 歷史專業經驗，日期仍 unknown）、142 筆 `machine-rejected`；71 個 partial-disagreement 與 25 個 correction targets 只記錄、不套用。機器出版不是人工核准、不是候選人同意、也不是背書。

## 審查者與決策

- 審查者定義在 `data/editorial/reviewer-registry.json`：唯一 `reviewerId`、顯示名稱、角色、`authorizedActions`。這是本機授權，不是登入或防竄改機制；不得以作業系統帳號、Git 作者、agent 或主機名稱代替。
- 空 registry 是刻意的安全預設：系統不會自動建立審查者或核准。
- 決策狀態：`unreviewed`、`needs_identity_review`、`needs_evidence_review`、`approved`、`rejected`、`disputed`、`superseded`。
- 取代必須以 `supersedesDecisionId` 指向同一 subject 的 active 決策，形成無環鏈；不得同時存在矛盾 active 決策；同一 decision ID 不同內容會被拒絕。
- 每筆決策保存 reviewer ID、時間、理由、明確確認、claim／identity subject、來源 checksum 版本、schema 版本與被取代決策。審查者 PII 不公開。

## 流程與指令

```bash
npm run editorial:prepare     # 產生 review packet
EDITORIAL_REVIEW=true npm run editorial:review   # 開啟 /editorial-review/
npm run editorial:apply -- --decisions <export.json>
npm run editorial:validate
npm run editorial:publish     # 只寫入通過閘門的 claims
npm run build
```

`/editorial-review/` 只在 dev 或 `EDITORIAL_REVIEW=true` 載入 packet、registry 與決策；提供候選人／選區／類別／狀態篩選，顯示原始 claim、身分觀察、證據摘錄、來源 URL、擷取時間、SHA-256、支持與矛盾證據、決策歷史與衝突。核准與 `confirm-same` 需明確勾選；拒絕、爭議、要求補證、延後與身分覆寫需理由。瀏覽器只匯出 JSON，不寫入專案檔案；匯出不等於核准。

## 快照與撤回

- `editorial:publish` 產生 deterministic snapshot 與 gate／review-summary／identity-summary 報告；公開檔只含必要措辭、IDs 與來源 URL，不含 raw path、checksum、packet、model run 或內部 blocker。
- 來源、措辭、packet 或身分條件變更時，既有紀錄必須失效（withdrawal／阻擋），不得靜默保留。
- 回滾方式：恢復已驗證的決策匯出與來源快照，重跑 validate／publish／build；不要手改公開 HTML。
- 報告中的機器計數不得當成人類審查計數。

## 目前狀態（2026-11-15）

- 履歷：897 筆機器 claims、9 個未解身分衝突、0 人工審查、0 編輯核准、公開 snapshot 為空。四位 pilot 的 405 筆已做 release audit，12 筆 queue 只是待審工作包。
- 基本資料：829 筆通過機器查核並發布；不代表人工核可每一句。
- 政策：1,017 筆自動查核發布。
- 新聞：213 篇發布，3 篇待編輯審核，4 篇排除（錯誤身分 3、摘要不實 1）。
- 從政歷程：154 任期、1,045 活動等，review 狀態 approved（`editorial-pipeline`，2026-11-14），但來源與方法限制已列於資料集 `review.limitations`。
- scoped 與自動化層：全部留在研究層，除 1 筆 reviewer-free 出版外無公開內容。

## 不可退讓的界線

- 候選人陳述必須標為 `candidate-statement`／self-reported，不得改寫成獨立事實或機關成果。
- 不得由姓名、照片、傳聞、職務或空白欄位推論親屬、動機、違法或政治關係。
- 未查證、待審或來源不可達，一律中性呈現；空白不等於不存在。
- 所有候選人使用等價的版面、視覺與資料類別；不做排名、聲量、好感度或支持度評分。
- 機器輸出、AI 輔助、獨立查核與人工核准各自標示，不得互相代替。
