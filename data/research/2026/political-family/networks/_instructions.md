# 家族政商網絡研究：資料契約

## 範圍
每個 batch 檔負責 roster 中列出的候選人，全部都要有一列。這是 research 階段，不是 publication：
寧可回報 searched-no-verified-relations，也不要猜。

## 合格親屬職務（四類都要找）
1. 政治與政府：民選代表（立委、議員）、縣市長、部會首長／副首長、政務任命、政府機關高階主管。
2. 企業與集團：創辦人、董事長／副董事長、總經理、執行長、董事、其他有決策權的高階經理人。含未上市櫃公司與集團。
3. 上市櫃公司（TWSE／TPEx，或相關海外交易所）：董事長、董事／獨立董事、執行長／總經理、C 級主管。董事（board）與經營團隊（executive）必須分開標記。
4. 基金會與大型非營利組織：創辦人、董事長、執行長、秘書長、董事（具實質職權者）、其他高階領導職。
一般員工、被動會員、掛名榮譽職不得列入。

## 親屬範圍
父母、配偶、子女、兄弟姊妹、祖父母（主要）；岳父母、姻親、叔伯姑姨、其他公開可查證的親屬（次要，僅在關係本身可獨立查證時）。

## 紅線
- 同姓、同公司、同鄉、同場合都不是親屬證據。不得由照片、社群互動推論。
- 親屬關係與職務是**兩個獨立事實**，各自要有來源；同一篇報導可以同時支持兩者，但要在 JSON 分開記錄。
- 職務與親屬關係都要有逐字引文（quote），不得改寫。找不到逐字引文就不要提出。
- 同名風險：無法用生日、選區、職務、公司、時間交叉確認是同一人時，放進 rejectedOrAmbiguousClaims 並寫理由。
- 不寫私人地址、電話、身分證號、非公開親屬的私人資訊。
- 不評價、不暗示利益輸送或不當影響。
- 不得把基金會董事寫成經營者；不得把「榮譽董事長」寫成現任董事長。

## 建議來源
政治：中選會、地方選委會、立法院、高雄市議會、政府機關公告、監察院財產申報。
企業：公開資訊觀測站 MOPS（mops.twse.com.tw）、年報、公司治理報告、公司官網、經濟部商工登記（findbiz.nat.gov.tw）。
基金會／非營利：基金會官網、年報、政府立案資料、公開董監事名單。
親屬：官方簡介、候選人聲明或訪談、可信新聞、其他可獨立引用的公開紀錄。

## 輸出檔格式（單一 JSON 檔，UTF-8，2 空白縮排）
{
  "batchId": "batch-01",
  "researchedAt": "2026-11-16",
  "researcher": "agent-name",
  "rows": [
    {
      "sequence": 1,
      "candidateId": "official-...",
      "displayName": "王小明",
      "districtId": "district-...",
      "searchedAt": "2026-11-16",
      "queries": ["..."],
      "urlsAttempted": ["https://..."],
      "outcome": "relations-found" | "searched-no-verified-relations" | "unresolved",
      "relations": [
        {
          "relativeName": "王大華",
          "relationLabel": "父親",
          "relationTypeHint": "parent-child" | "siblings" | "spouses" | "grandparent-grandchild" | "uncle-aunt-niece-nephew" | "cousins" | "in-laws" | "other",
          "kinship": {
            "url": "https://...", "publisher": "...", "title": "...",
            "publicationDate": "YYYY-MM-DD" | null,
            "quote": "逐字引文，明確描述兩人關係"
          },
          "positions": [
            {
              "organizationName": "...",
              "organizationType": "government" | "legislature" | "political_organization" | "corporation" | "business_group" | "foundation" | "nonprofit",
              "positionTitle": "...",
              "positionCategory": "political" | "public_office" | "executive" | "board" | "organizational_leadership",
              "status": "current" | "former" | "historical-status-unknown",
              "startDate": "YYYY-MM-DD" | null,
              "endDate": "YYYY-MM-DD" | null,
              "source": { "url": "https://...", "publisher": "...", "title": "...", "publicationDate": "YYYY-MM-DD" | null, "quote": "逐字引文，明確記載此人與此職務" }
            }
          ],
          "notes": "查核限制或剩餘不確定性"
        }
      ],
      "rejectedOrAmbiguousClaims": [
        { "subject": "...", "reason": "...", "url": "..." }
      ]
    }
  ]
}

## 規則
- rows 必須逐一覆蓋 batch 檔列出的 candidateId，順序不拘、不得重複、不得新增 roster 以外的候選人。
- 沒有查到合格親屬時，outcome 用 searched-no-verified-relations，relations 給空陣列，並在 queries/urlsAttempted 留下實際查詢與網址。
- 來源打不開或全部受限時用 unresolved，並寫明原因。
- 只寫入你被指派的那一個輸出檔；不要修改 repo 其他檔案、不要 git commit。
- 寫完後回報：檔名、rows 數、relations 數、各 outcome 計數、以及最需要獨立複查的 3 個 claim。

## 上市櫃狀態（positions[].listingStatus，必填於企業職務）
每一筆 organizationType 為 `corporation` 或 `business_group` 的職務都要加 `listingStatus`：
- `listed`：台灣證券交易所上市（或海外主要交易所主要掛牌）
- `otc`：櫃買中心上櫃
- `unlisted`：未上市櫃（含有限公司、閉鎖型公司、集團控股公司）
- `unknown`：查不到，不要猜
非企業組織填 `null`。判斷來源以 MOPS／年報／公司治理報告為主，新聞報導不足以單獨決定掛牌狀態。

## 職務分類不可互換
- `board`：董事長、副董事長、董事、獨立董事、監察人（董事會成員）。
- `executive`：總經理、執行長、財務長、營運長、副總經理、協理等有決策權的經營團隊。
- `organizational_leadership`：基金會與非營利組織的執行長、秘書長、理事長、會長等高階領導職。
「榮譽董事長」不是現任董事長；「顧問」不是董事；基金會董事不等於基金會執行長。
