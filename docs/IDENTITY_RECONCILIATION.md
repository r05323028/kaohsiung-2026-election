# 身分 reconciliation

身分 reconciliation 是履歷出版前的獨立閘門。相同或相似姓名不構成同一人的證據；原始名稱、來源特有識別碼、選舉區、職務、時間脈絡與文件內容都必須保留並逐項檢視。

## 審查對象

`npm run editorial:prepare` 會把 biography observations、candidate records、source versions 與既有 conflicts 放入本機 review packet。工作區的 identity queue 應顯示：

- candidate identity 與來源原文名稱。
- normalized name、source-specific identifier、選區與選舉脈絡。
- 來源所述的公開職務與時間資訊。
- 原始文件 URL、retrieval time、SHA-256 與相關 excerpt。
- 目前 match basis、identity status、既有 decisions 與不確定性。

## 允許的決定

身分審查可使用 `confirm-same`、`confirm-different`、`insufficient-evidence`、`reject-match` 或 `defer`。所有 override、拒絕、爭議與證據不足決定都要填 rationale；`confirm-same` 必須有明確 confirmation，且 reviewer 必須具備 `identity-review` 授權。

- `confirm-same` 只代表目前證據足以把指定來源觀察連到同一 candidate。
- `confirm-different` 或 `reject-match` 會阻擋依賴該身份的 claims。
- `insufficient-evidence` 與 `defer` 不代表不存在或不實，只代表尚不能出版。
- 不可用姓名相同作為自動 merge，也不可把一個 conflict 的決定套用到另一個 subject。

## 身分依賴與 reversal

Claim 會列出 `identityObservationIds`。出版閘門會要求這些 observations 已 resolved，且 identity decision 的 source versions 覆蓋所有相關 observations 與 conflict evidence。若原始來源 checksum 改變，相關 identity decision 必須重新驗證；若後續 decision 推翻原先的 identity resolution，所有依賴 claims 在重新審查前都不具出版資格。

Decision 只能以 acyclic supersession chain 取代同一 subject 的目前 active decision。舊 decision 不刪除，便於 audit、rollback 與追蹤誰在何時改變判斷。

## 當前 conflict 狀態

研究快照目前保留 9 個 open conflicts。它們包含字元差異、族名／拉丁轉寫差異或相近姓名；本機報告的實際內容才是審查依據。沒有任何 conflict 已取得真人 resolution，因此現階段沒有 biography claim 因身分審查而進入公開 snapshot。

## 建議人工步驟

1. 先開啟 identity queue，不要先批准依賴 claims。
2. 逐一開啟原始來源並比對名稱、選區、職務與時間，不只看 normalized claim。
3. 選擇 resolution，填寫可重現的理由與引用的 source versions。
4. 匯出 JSON，執行 `npm run editorial:apply -- --decisions ...`。
5. 重新執行 `npm run editorial:validate`，確認沒有 stale source、blocking conflict 或 invalid transition。
6. 只有 gate report 明確列為 eligible 的 claims 才能由 `editorial:publish` 產生公開資料。

缺少證據時應保留 pending/insufficient 狀態；不可把空白欄位或未匹配當成負面證據。
