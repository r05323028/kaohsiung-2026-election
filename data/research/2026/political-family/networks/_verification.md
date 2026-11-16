# 家族政商關係：獨立查核 agent 契約

你**不是**產出該 batch 的 agent。不得信任研究檔的結論，必須自己重新擷取來源。

## 輸入
- 指派檔：`data/research/2026/political-family/networks/verify-NN.assign.json`（列出 candidateId 與 batch 檔名）
- 待查核研究檔：`data/research/2026/political-family/networks/batch-NN.json`

## 輸出
只寫一個檔案：`data/research/2026/political-family/verification-networks-NN.json`（NN 與 batch 相同）。

```json
{
  "verificationVersion": "1",
  "verifiedAt": "<YYYY-MM-DD>",
  "reviewerRole": "independent-fact-checker",
  "records": [
    {
      "candidateId": "official-...",
      "relativeName": "王小明",
      "relation": "parent-child",
      "status": "verified | rejected | unresolved",
      "rationale": "為什麼成立／不成立，必須寫出實際查核發現（缺哪一項證據、哪一項矛盾）。",
      "sourceIds": [],
      "kinshipSourceIds": [],
      "positionSourceIds": [],
      "sources": [
        { "id": "source-verify-<8碼>", "url": "...", "publisher": "...", "title": "...", "publicationDate": "YYYY-MM-DD | null", "sourceKind": "official-record | institutional-profile | established-news | candidate-statement | other-public-record" }
      ],
      "independentReview": {
        "reviewedAt": "YYYY-MM-DD",
        "method": "independent-source-retrieval",
        "sourceChecks": [
          { "sourceId": "source-verify-<8碼>", "url": "...", "httpExitCode": 0, "byteCount": 12345, "nameHits": { "<候選人>": true, "<親屬>": true } }
        ]
      },
      "positions": [
        {
          "organization": "公司／機關全名",
          "organizationType": "government | legislature | political_organization | corporation | business_group | foundation | nonprofit",
          "positionTitle": "職稱原文",
          "positionCategory": "political | public_office | executive | board | organizational_leadership",
          "listingStatus": "listed | otc | unlisted | unknown",
          "status": "current-officeholder | former-officeholder | political-appointee | party-official | historical-status-unknown",
          "startDate": "YYYY-MM-DD | null",
          "endDate": "YYYY-MM-DD | null",
          "sourceIds": ["source-verify-..."],
          "notes": "可選：職務期間或性質的補充說明"
        }
      ]
    }
  ]
}
```

## 規則
1. **親屬關係與職務是兩個獨立事實**，各自需要來源。公司揭露、同姓、同公司、同鄉、照片、社群互動都不能證明親屬關係。`kinshipSourceIds` 只能是明確描述兩人關係的來源。
2. 只有當親屬關係與每一個列出的職務都被你自己的來源支持時，`status` 才可以是 `verified`。任一項缺證據 → `unresolved`；來源互相矛盾或明顯同名誤認 → `rejected`，並在 rationale 說明矛盾點。
3. 每個 `positions[]` 都必須帶至少一個 `sourceIds`（指到你自己 `sources` 內的 id）；沒有來源的職務直接不要輸出。
4. 職務分類：`board` 僅限董事會成員（董事、獨立董事、監察人）；`executive` 是經營團隊（總經理、執行長、財務長、副總經理等有決策權者）。兩者不可互換。一般員工、被動會員、掛名榮譽職不得輸出。
5. 企業職務必須判斷 `listingStatus`：`listed`（台灣證券交易所上市或相應海外交易所主要掛牌）、`otc`（櫃買中心上櫃）、`unlisted`（未上市櫃，含有限公司與閉鎖型公司）、`unknown`（查不到，不要猜）。非企業組織一律 `null`。
6. 現任職務 `endDate` 必須是 `null`。已卸任但查不到日期 → 保留 `endDate: null` 並在 notes 寫「結束日期未查得」。不得編造日期或屆次。
7. 同名誤認是最常見的錯誤：同一姓名在不同縣市、不同公司、不同世代都是不同人。若無法用職務、選區、時間、組織交叉確認是同一位親屬，標 `unresolved`。
8. 來源優先序：中選會／地方選委會／立法院／市議會／機關公告 → MOPS（公開資訊觀測站）、年報、公司治理報告、商工登記 → 基金會與非營利組織官網、年報、立案資料 → 可信新聞。不得使用 AI 摘要、內容農場、百科全書作為唯一證據。
9. 只輸出你實際擷取成功的來源；HTTP 失敗或需登入的頁面不得當作證據。
10. 不得修改研究檔、schema、任何 `data/published`、`data/approved` 或程式碼；不得 commit。

## 完成回報
回報：查核候選人數、verified／rejected／unresolved 各幾筆、被降級或推翻的研究 claim（列出候選人與原因）、無法查核的來源類型。