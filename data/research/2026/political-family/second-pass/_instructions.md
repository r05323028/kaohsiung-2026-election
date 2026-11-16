# 第二輪家族政商關係研究（second pass）

## 目的

第一輪已對 106 位候選人完成初步公開來源查找，但 67 位 `searched-no-verified-relations` 的既有 audit 多半只有 4–12 個查詢、0–11 個網址，屬初步篩選，不足以支撐「沒有政商關係」的結論。本輪只處理這 67 位，目標是：

1. 用不同來源類別與更深查找，嘗試找到可公開的親屬關係與合格職務。
2. 若仍查無，留下可重現的查詢、網址、來源類別與「查無」範圍，供日後季度複查。
3. 不把「查無」寫成「沒有」，也不為湊數推論。

## 範圍與優先順序

- 名單：本目錄 `batch-01..08.assign.json`，合計 67 位；每批 7–9 位。
- `priority: high`：目前有公開民選或政府職務紀錄，先做。
- `priority: medium`：有歷史公開職務紀錄。
- `priority: standard`：其餘；仍須完成同一套查核，不得跳過。
- `publicRecordRoles` 只作查找線索，不是親屬關係證據；不得由職務、姓氏、選區或同公司推論親屬。

## 必須嘗試的來源類別

至少涵蓋與第一輪不同的三類，並在輸出記錄實際嘗試過的類別：

- 政治與政府：中選會／高雄市選委會公告、高雄市議會歷屆議員名錄與簡介、立法院委員資料、機關新聞稿、監察院財產申報。
- 企業與集團：公開資訊觀測站 MOPS（年報、董監事、經理人）、公司治理資料、商工登記、公司官網沿革與經營團隊。
- 上市櫃：TWSE／TPEx 公司基本資料與董監事名單；董事會與經營團隊分開記錄。
- 基金會／非營利：基金會官網、年報、立案資料、政府補助或勸募公開資料、大型非營利組織理監事名單。
- 親屬關係：官方候選人簡介、候選人聲明或訪談、可信新聞的原生報導；不接受 AI 摘要、內容農場、同名推測。

## 證據門檻

- 親屬關係：至少兩個獨立來源，其中一個須為官方、機構或當事人／家屬直接陳述；或一個明確的官方／機構來源加上一個獨立新聞來源。關係方向必須明確（誰是誰的父、母、配偶、子女、兄弟姊妹等）。
- 職務：官方登記、機關公告、年報、公司治理或機構名錄優先；若只有新聞，需兩個獨立來源。現任／歷史狀態與起訖日期要有來源；沒有日期就留 null，不推定。
- 同名、同姓、同選區、同公司、同社交圈、照片或社群互動都不足以認定親屬或職務。
- 關係與職務是兩個獨立事實，各自要來源；公司揭露不能證明親屬關係。
- 模糊、衝突或只有單一來源：放進 `rejectedOrAmbiguousClaims` 或標為待查，不得標 verified。
- 隱私：不記錄住址、私人聯絡方式、非公開親屬的個人資料。

## 輸出

每位候選人寫一筆 row 到 `data/research/2026/political-family/second-pass/batch-NN.json`：

```json
{
  "pass": 2,
  "batchId": "batch-01",
  "searchedAt": "YYYY-MM-DD",
  "rows": [
    {
      "candidateId": "official-...",
      "displayName": "姓名",
      "districtId": "district-...",
      "queries": ["實際查詢字串"],
      "urlsAttempted": ["實際開啟或抓取的 URL"],
      "sourceClassesAttempted": ["legislature", "mops", "foundation"],
      "outcome": "verified-relations-found | searched-no-verified-relations | unresolved",
      "relations": [
        {
          "relativeName": "姓名",
          "relationLabel": "父／母／配偶／子女／兄弟姊妹／…",
          "relationTypeHint": "parent-child | siblings | spouses | grandparent-grandchild | uncle-aunt-niece-nephew | cousins | in-laws | other",
          "kinship": {
            "url": "https://...",
            "publisher": "來源機構",
            "title": "標題",
            "publicationDate": "YYYY-MM-DD 或 null",
            "quote": "逐字引文"
          },
          "positions": [
            {
              "organizationName": "組織",
              "organizationType": "government | legislature | political_organization | corporation | business_group | foundation | nonprofit",
              "positionTitle": "職稱",
              "positionCategory": "political | public_office | executive | board | organizational_leadership",
              "listingStatus": "listed | unlisted | unknown",
              "status": "current-officeholder | former-officeholder | political-appointee | party-official | historical-status-unknown",
              "startDate": "YYYY-MM-DD 或 null",
              "endDate": "YYYY-MM-DD 或 null",
              "source": {
                "url": "https://...",
                "publisher": "來源機構",
                "title": "標題",
                "publicationDate": "YYYY-MM-DD 或 null",
                "quote": "逐字引文"
              }
            }
          ],
          "notes": "為何可合併、任何不確定性"
        }
      ],
      "rejectedOrAmbiguousClaims": [
        {
          "subject": "被排除的線索",
          "reason": "為何不足或矛盾",
          "url": "https://..."
        }
      ],
      "notes": "本輪查找範圍與限制"
    }
  ]
}
```

- 每位 assignment 候選人恰好一筆 row；不得漏、不得重複、不得新增名單外候選人。
- `queries` 與 `urlsAttempted` 必須是實際執行過的，不可事後補寫。
- 若找到多個親屬，分開列；同一親屬可有多個職務。
- 若查無，`relations` 留空，`outcome` 用 `searched-no-verified-relations`，並在 `notes` 寫明查過的來源類別與仍無法排除的原因。
- 不要修改 `networks/`、`research.json`、`data/published/`、schema、generator 或網站程式；本輪只產生 second-pass 輸出，整合由後續流程處理。
