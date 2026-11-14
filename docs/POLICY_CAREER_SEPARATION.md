# Policy positions vs political career

「政策主張」說明候選人打算做什麼，「從政歷程」記錄候選人實際做過什麼。兩區可以互相指路，但同一個事實只能有一個歸屬。

## 所有權規則

| 分區 | 只放這些 | 不放這些 |
| --- | --- | --- |
| 政策主張（`policies`） | 明確的競選承諾、未來的市政政策承諾、擬議的改革或計畫、候選人表態要推動的政策目標 | 過去的議會提案、質詢、自治條例修正、預算審議、已發生的市政作為、已完成成果 |
| 從政歷程（`career`） | 議會提案與連署、質詢、自治條例提案與修正、預算審議與監督、有紀錄的市政作為、已核實的公職任期與政治活動 | 學歷、一般工作經歷、證照、與公共事務無關的個人成就；尚未發生的承諾 |

判斷時間軸時區分 `future-commitment`、`historical-action`、`mixed`、`unclear`。舊提案不會被當成競選承諾，歷史提案也不會被讀成政策已實現。

## 資料集

`data/approved/2026/policy-career-separation.json`（schema：`src/data/policy-career/schema.ts`，loader：`src/data/policy-career/index.ts`）

| 欄位 | 內容 |
| --- | --- |
| `classifications` | 每一筆已發布政策恰好一列：`ownership`、`temporalBasis`、`basis`、`note`、`commitment`、`historical`、`relatedActivityIds`、`duplicateOfActivityIds` |
| `links` | 政策與政治活動的穩定 id 對應：`relation`（`same-event`／`related-topic`）、`similarity`、`sharedTerms`、`origin`（`automated`／`curated`） |
| `review` | 審核狀態、審核者、快照日、四條限制與重算後的計數 |

`ownership` 四種：`policy-commitments`（留在政策主張）、`political-career`（移入從政歷程）、`split-record`（同一筆來源同時含承諾與已發生行動，拆成兩半）、`review-required`（待人工判斷，不得發布）。

## 建置與驗證

1. `data/policy-career/2026/curation.json` 保存人工判斷、拆分後的新措辭、逐字證據與來源 URL。
2. `npm run policy-career:build` 離線、決定性執行：以 `src/data/policy-career/markers.ts` 的完成語氣／未來語氣標記做初篩，凡被標記者必須有 curation 條目，否則建置失敗；再以 `src/data/policy-career/similarity.ts` 的 3-gram 相似度（df ≤ 4、至少 2 個共同詞、門檻 0.3）產生跨區連結。輸出 `data/approved/2026/policy-career-separation.json`。
3. `npm run validate:policy-career`（已納入 `npm run build`）檢查：每筆政策恰好一個分類、分區與時間軸不矛盾、拆分後兩半不得重複、完成語氣承諾必須有編輯覆核與說明、歷史敘述只能引用該政策自己的來源且證據需逐字、強相似度的活動必須被連結覆蓋、連結不得跨候選人、review 計數需與資料一致。

## 跨區連結

- 未來承諾留在政策主張，歷史行動留在從政歷程，兩邊只以 `policyId`／`activityId` 互指，不複製整段敘述。
- 政策卡片的「相關政治活動」會切到從政歷程並捲動到對應活動；活動列上的「相關政策主張」會切回政策分頁。
- `same-event` 只在政策來源與活動同日、且相似度 ≥ 0.45 時自動成立；其餘為 `related-topic`。人工連結一律標為 `curated` 並附註理由。

## UI

- 政策主張依政策類別分組，只顯示承諾；拆分紀錄只顯示承諾版本與指向從政歷程的提示，不重貼歷史敘述。
- 從政歷程不再列出「競選承諾」清單，改為一則指向政策分頁的提示；由政策資料移入的歷史行動另立「由政策資料移入的歷史行動」區塊，並沿用日期、類別、角色、結果與來源欄位。
- 公職任期已由從政歷程呈現時，不再重複顯示公開紀錄的職稱卡片。

## 現況（2026-11-14）

1005 筆已發布政策全數分類：999 筆留在政策主張、8 筆進入從政歷程（6 筆移出、2 筆為拆分後的歷史半）、3 筆拆分、19 筆跨區連結（14 筆自動、5 筆人工，2 筆 same-event）。5 筆被初篩標記但經編輯覆核後保留為承諾，理由寫在 `note`。

## 限制

- 初篩只依語氣標記，屬分流工具而非判準；未被人員確認的模糊紀錄一律不得發布。
- 「查無議會紀錄」不代表候選人未從事政治活動，UI 不呈現這種推論。
- 集體決議不得寫成個人行動；拆分與移轉都保留原始來源與逐字證據，便於回溯。
