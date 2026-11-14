# Political career timeline

從政歷程（`career` 分頁）只呈現可逐字核對的政治行動，不呈現學歷、一般經歷或個人成就；後者留在基本資料與「其他公開紀錄」。

## 資料集

`data/approved/2026/political-career.json`（schema：`src/data/political-career/schema.ts`，loader：`src/data/political-career/index.ts`）

| 欄位 | 內容 |
| --- | --- |
| `sources` | 每一筆來源的 URL、發布者、標題、tier、擷取時間，以及保留快照的 `rawPath`／`sha256` |
| `officeTerms` | 公職任期：機關、職稱、屆次、狀態（現任／曾任）；未載明起訖日期時保持 `null`，不推定 |
| `activities` | 政治活動：日期、類別、行動類型、標題、敘述、本人角色、結果狀態、逐字證據、歸屬依據 |
| `coverage` | 106 位候選人各一列，記錄檢索來源、紀錄數與狀態（`records-found`／`no-verifiable-record-found`／`source-unavailable`） |
| `review` | 發布狀態、審核者與對外揭露的限制 |

## 類別與行動

`category`：`public-office-term`、`election-contest`、`council-proposal`、`council-interpellation`、`ordinance-review`、`budget-review`、`municipal-governance`、`public-affairs`。

`actionType`：`serve-office`、`contest-election`、`propose`、`co-sponsor`、`interpellate`、`deliberate`、`approve`、`implement`、`public-affairs-participation`。

提案、連署、質詢、審議與表決分開標示；議會新聞稿的集体決議不會被寫成個人行動。

## 建置流程

1. `npm run political-career:fetch`：從 65 份議員服務政見頁抽出「相關新聞」連結，抓取 590 篇議會新聞稿到 `data/raw/political-career/2026/news/`，寫入 manifest（含 sha256）。
2. `npm run political-career:build`：離線、決定性地解析屆次與新聞稿段落，輸出 `data/approved/2026/political-career.json`。
3. `npm run validate:political-career`：檢查 schema、106 列 coverage、來源引用、日期範圍、重複 id、跨候選人歸屬，以及保留快照的 sha256；已納入 `npm run build`。

## 歸屬規則

- 只採用議員服務政見頁「相關新聞」指向的页面，或新聞稿中以完整姓名指稱本人的句子。
- 句子若同時出現其他候選人姓名，或屬典禮、慰問、聯誼等非治理動作者，一律排除。
- 每位候選人最多保留 40 筆活動，依日期新到舊截斷，並在 `review.limitations` 揭露。
- 未取得紀錄的候選人顯示 `coverage.note`；「查無紀錄」不代表未從事政治活動。

## UI

`src/components/PoliticalCareerTimeline.tsx` 依年份分組呈現時間軸，上方為公職任期，下方另立「競選承諾（尚未發生）」區塊（資料來自已發布政策），最後是「提案與表決紀錄」與可展開的資料限制。
