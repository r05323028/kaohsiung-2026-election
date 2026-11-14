# Political career timeline

從政歷程（`career` 分頁）只呈現可逐字核對的公共服務事實：政府職務、政府專案、議會與立法職務、立法提案、個別表決，以及議會質詢與市政參與。學歷、私人企業經歷、黨職、競選承諾與一般政策主張不在此呈現；學歷與一般經歷留在基本資料，未來承諾留在政策主張。

## 資料集

`data/approved/2026/political-career.json`（schema：`src/data/political-career/schema.ts`，loader：`src/data/political-career/index.ts`）

| 欄位 | 內容 |
| --- | --- |
| `sources` | 每一筆來源的 URL、發布者、標題、tier、擷取時間，以及保留快照的 `rawPath`／`sha256` |
| `officeTerms` | 公職任期：機關、職稱、職務類型、任用類型、屆次、起訖日期與日期精度、狀態（現任／曾任／狀態未載明） |
| `governmentProjects` | 政府專案：機關、本人角色與角色類型、任期、執行期間、狀態、已知成果、逐字證據、歸屬依據 |
| `legislativeProposals` | 立法提案：院會屆次、議案編號、名稱、提案人類型、提案日期、最新進度、法律名稱、官方來源 |
| `votingRecords` | 個別表決：表決代碼、議案、表決型態、本人個別投票、全體票數 |
| `activities` | 議會質詢、市政參與、預算審議等活動：日期、類別、行動類型、標題、敘述、本人角色、結果狀態、逐字證據、歸屬依據 |
| `coverage` | 106 位候選人各一列，記錄檢索來源、各類紀錄數與狀態（`records-found`／`no-verifiable-record-found`／`source-unavailable`） |
| `review` | 發布狀態、審核者與對外揭露的限制 |

### 職務類型

`positionType`：`elected-office`（民選公職）、`government-employment`（政府任用）、`legislative-office`（立法機關）、`council-office`（議會）。

`employmentType`：`elected`、`appointed`、`civil-service`、`contract`、`unknown`。區長、機要秘書、參議等政務或行政任命不得寫成民選職務；里長、鄉長、鎮長、鄉民代表則為民選職務。

### 專案與提案

`roleType`：`initiated`、`managed`、`participated`、`oversaw`，分別對應發起、主責執行、參與、督導。

`status`：`completed`、`ongoing`、`planned`、`not-implemented`、`unknown`。報導若仍在公告、徵選或預告階段，不得標為已完成；未載明日期時保持 `null`，不推定日期。

`proposerRole`：`primary`（主提案）、`co-proposer`（共同提案）、`co-sponsor`（連署）。提案狀態取自立法院開放資料的最新進度，未經三讀者不得描述為法律。

### 表決

`individualVote`：`for`、`against`、`abstain`、`absent`、`not-recorded`、`unknown`。

只有記名表決名單能產生個別投票；未記名表決、語音表決或名單未列名者一律為 `unknown` 或 `not-recorded`，不得依黨團立場推定，也不得將「未列名」呈現為反對。

## 來源與保留快照

| 來源 | 策展檔 | 保留快照 |
| --- | --- | --- |
| 高雄市議會新聞稿與議員簡介 | 由 `npm run political-career:fetch` 產生 manifest | `data/raw/political-career/2026/news/` |
| 立法院開放國會 API（`ly.govapi.tw`） | `data/political-career/2026/legislative-candidates.json` | `data/raw/political-career/2026/legislative/` |
| 政府職務的已查核主張 | `data/political-career/2026/government-positions.json` | `data/raw/political-career/2026/positions/` |
| 政府專案報導 | `data/political-career/2026/government-projects.json` | `data/raw/political-career/2026/projects/` |

`build` 不連網；它只讀取上述策展檔與快照，並在登錄來源前重新計算 `sha256`。快照缺失或雜湊不符時建置會失敗，避免來源被靜默替換。

## 建置流程

1. `npm run political-career:fetch`：抓取議員服務政見頁的議會新聞稿與 manifest。
2. `npm run political-career:fetch-legislative`：依策展名單抓取立法院委員、提案與記名表決快照。
3. `npm run political-career:fetch-positions`：抓取政府職務主張所引用的官方頁面或 PDF。
4. `npm run political-career:fetch-projects`：抓取政府專案報導原文。
5. `npm run political-career:build`：離線、決定性地合併任期、活動、專案、提案與表決，輸出 `data/approved/2026/political-career.json`。
6. `npm run validate:political-career`：檢查 schema、106 列 coverage、來源引用與快照雜湊、日期範圍、重複 id、跨候選人歸屬、任期連結、表決值與提案狀態；已納入 `npm run build`。

## 歸屬規則

- 政府專案只收錄報導同時載明候選人姓名與職務者；不得因候選人任職於某機關，就把機關整體成果歸給本人。
- 任期、專案、提案、表決各自獨立；同一事件不重複列在不同類別。
- 提案即使被退回或未三讀仍可收錄，但必須標示最新進度，不得寫成已通過的法律。
- 個別表決不得由黨籍、黨團或集體結果推定。
- 日期只使用來源明確記載者；只有年月或年份時以 `startDatePrecision`／`endDatePrecision` 標示，介面不得顯示不存在的日。
- 前任職務不得寫成現任；學歷、黨職、競選承諾與私人企業經歷不得進入從政歷程。
- 每位候選人的議會活動最多保留 40 筆，依日期新到舊截斷，並在 `review.limitations` 揭露；「查無紀錄」不代表未從事政治活動。

## UI

`src/components/PoliticalCareerTimeline.tsx` 以「從政時間軸」呈現，由新到舊排列公職任期；每個任期下嵌套對應的政府專案、立法提案與表決紀錄。活動紀錄依年份分組。清單過長時每類最多顯示 12 筆並標示未列出的數量；證據摘錄、身分依據與歸屬欄位屬內部研究資料，不在一般使用者介面顯示，來源以可點擊的來源標籤呈現。

沒有可查證紀錄時只顯示「目前尚無可查證的從政歷程資料。」，不建立空卡片或範例資料。競選承諾只在政策分頁呈現，分區規則見 `docs/POLICY_CAREER_SEPARATION.md`。

## 目前覆蓋

以 2026-11-14 為研究截止日：106 位候選人中 68 位有可查證紀錄、38 位查無可查證紀錄。已收錄 154 筆公職任期、1,045 筆議會活動、25 筆政府專案、851 筆立法提案、327 筆個別表決與 714 筆來源。詳細的逐候選人覆蓋與驗證結果見 `reports/political-career-coverage.md`。
