# 政策主張研究與發布流程

本文件說明候選人政策主張（政策主張分頁）如何從公開來源進入網站。此流程與人物誌、基本資料的編輯流程分開，但共用「機器驗證、逐筆把關」的原則。

## 資料層

| 檔案 | 用途 |
|---|---|
| `data/raw/policy/2026/news/*.txt` | 已擷取的新聞與候選人政策全文，依 URL 雜湊命名 |
| `data/policy-research/2026/discovery/news-discovery.json` | 檢索與擷取紀錄（URL、發布者、狀態、雜湊） |
| `data/policy-research/2026/extraction/batch-NN.json` | 研究者逐批擷取的政策紀錄 |
| `data/policy-research/2026/verification/verify-NN.json` | 獨立查核者逐筆決定（verified／rejected／unresolved） |
| `data/policy-research/2026/full-roster.json` | 合併後的完整研究資料集（含所有候選人稽核） |
| `data/published/2026/candidate-policies.json` | 網站唯一載入的已發布政策資料 |

## 發布門檻

一筆政策紀錄必須同時滿足下列條件才會進入 `candidate-policies.json`：

1. 候選人身份可從來源文字確認（姓名與選區／職稱脈絡）。
2.  `originalStatement` 是來源全文中的連續原文，經正規化後可機器比對。
3. 獨立查核者對該筆紀錄的決定為 `verified`，且認可歸屬與數字保留。
4. 來源已成功擷取，具 URL、發布者、擷取時間與原始檔雜湊。
5. 類別與紀錄型別合法，且與政策脈絡一致。

未通過的紀錄留在研究資料集，標記為 `withheld-pending-review` 或 `rejected`，不會出現在網站。單一紀錄或單一候選人的失敗不會阻止其他已通過紀錄發布。

## 與人工審查的關係

此流程是機器驗證，不是人工背書。`review.status = automated-verified` 表示每筆發布紀錄都通過上述決定性門檻，並不表示有人工編輯認同其政策內容。網站不呈現政策評分、排名或支持度。

## 重跑方式

```bash
npm run policy:build     # 合併研究與查核結果，產生 full-roster.json 與已發布資料
npm run policy:report    # 產生 coverage 與 audit 報告
npm run validate:candidate-policies
```
