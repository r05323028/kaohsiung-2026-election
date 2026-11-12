# 候選人新聞覆蓋（2026-11-12 快照）

本文件記錄 106 位 2026 高雄市長與市議員候選人的新聞覆蓋流程、驗證結果與已知限制。新聞以中性 metadata 呈現：標題、媒體、日期、中性摘要與原文連結。系統不產生、不儲存也不顯示任何情緒、好感度、聲量或正負面評分。

## 流程

```
news:discover  逐位候選人查詢自由時報、ETtoday、中央社 → data/research/2026/news/discovery/<candidateId>.json
news:verify    重新抓取每個命中連結、比對標題／媒體／日期／身分 → data/research/2026/news/verification/<candidateId>.json
news:build     套用 fail-closed 出版政策、去重、寫入 normalized/published → data/normalized + data/published + reports/
validate:news  在 npm run build 鏈中驗證已發布資料集
```

三個步驟都是逐位候選人、可中斷續跑的檔案式流程；`--candidate`、`--district` 可縮小範圍。建置階段不連線。

## 出版政策（news-publication-policy-v1）

只有同時符合下列條件的紀錄才會發布，其餘留在審核佇列並附明確 blocker：

- 獨立驗證狀態為 `verified`，且每一項檢查都通過；
- 姓名辨識風險為 `low`：姓名出現在標題，且文中至少有一個**選區專屬**線索（如「三民」「第7選區」「高雄市長」）；只有「高雄」「議員」這類通用詞不足以通過；
- 發布日期已確認或可由網址推得，且非衝突狀態；
- 具備編輯撰寫的中性摘要（20–240 字），且不含評價性詞彙（痛批、砲轟、大醜聞、黑馬等封鎖詞）；
- 非重複轉載（同網址或同媒體同標題核心只保留一筆）；
- 摘要的每一項事實都能在報導本文找到對應。

政策是 fail-closed：缺少資料不會被推論為通過。

## 獨立驗證

自動流程產出的 215 筆紀錄，交由 4 個獨立的 `news-verifier` 子代理重新以 `curl` 抓取每一篇原文（共 215 次請求，全部 HTTP 200），逐筆檢查標題、媒體、日期、候選人身分、摘要忠實度與中性用語。驗證代理與研究流程分離，不採信管線既有的 verified 標記。

驗證結果：

| 批次 | 筆數 | verified | 非通過 |
| --- | --- | --- | --- |
| news-batch-01 | 54 | 53 | 1 wrong-identity |
| news-batch-02 | 54 | 52 | 1 wrong-identity、1 summary-unsupported |
| news-batch-03 | 54 | 54 | – |
| news-batch-04 | 53 | 52 | 1 summary-unsupported |
| news-batch-fix-01 | 2 | 見 reports/news-verification.md | 摘要修正後複驗 |

處理方式：

- **wrong-identity**（news-f4cd6990、news-01cff230）：兩篇皆為新竹市議員林彥甫的報導，卻因「林彥」二字子字串比對而被歸到高雄第 7 選區候選人林彥。已列入編輯排除清單，並修正身分判定：通用詞不再足以讓姓名比對通過低風險門檻。
- **summary-unsupported**（news-5aa5ac37、news-15a331a0）：摘要與原文不符（時間軸描述、將鳳山稱為「重點戰區」）。已改寫摘要並送獨立複驗。
- **news-b4c5d1a3**（李政憲）：報導對象為南投縣政府人事處長，非高雄第 10 選區候選人。編輯排除。

排除清單存放於 `data/approved/2026/candidate-news-editorial.json` 的 `excluded` 欄位，理由隨資料保留。

## 2026-11-12 量測結果

- 候選人：106（全部都有 discovery 嘗試紀錄）
- 研究嘗試：342 次（來源錯誤 115 次，主因中央社搜尋 429 限流）
- 搜尋命中：855 篇；獨立驗證通過：216 篇；已發布：213 篇
- 待編輯審核：3 篇（1 筆原始排除 + 2 筆林彥甫誤配）
- 狀態分布：已發布 67、驗證未通過 25、搜尋無結果 12、已驗證待審核 2

逐位候選人明細見 `reports/news-coverage.md`，逐篇發布決定見 `reports/news-publication.md`，逐筆驗證結果見 `reports/news-verification.md`。

## 已知限制

- 只查詢三家媒體（自由時報、ETtoday、中央社）的公開搜尋；其他媒體、地方新聞與影音報導不在覆蓋範圍。
- 中央社搜尋常回 429，該來源的缺口以「來源錯誤」記錄，不代表沒有新聞。
- 覆蓋判定為「本次快照是否找到可發布報導」，不是「該候選人有無新聞」的完整事實。
- 摘要為編輯撰寫，僅陳述報導內容；不評價、不排名、不推論動機。
- 新聞內容可能隨時間改版；驗證理由引用的是擷取當時的頁面內容。
