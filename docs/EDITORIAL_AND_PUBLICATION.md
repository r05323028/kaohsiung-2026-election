# 內容驗證與發布

本專案不提供內部內容審查引擎、審查佇列或本機發布核准狀態。候選人資料的人工內容審查在 GitHub Pull Request 完成；程式與資料 correctness 由離線、決定性的 validators 和 CI 檢查。

## 責任分工

| 階段 | 作用 |
| --- | --- |
| 來源保存 | 保存 raw bytes、manifest、URL、擷取日期與 SHA-256 |
| 正規化與研究 | 產生可重跑的資料，保留身分、證據、範圍與缺口 |
| 確定性驗證 | 檢查 schema、ID、引用、checksum、引文、日期、來源與發布條件 |
| Pull Request | Reviewer 檢查 diff、證據鏈、provenance、中立措辭與生成物 |
| 靜態發布 | 合併到 main 後，Astro 從 approved／published snapshots 產生網站 |

機器查核、AI 輔助、獨立來源查核與 PR review 各自表示不同工作，不可互相冒充。來源不足、衝突、未驗證或不符合發布條件的資料維持 withheld／unpublished；PR 合併不會自動把它們公開。

## PR 契約

資料或公開內容 PR 應包含：

1. 變更範圍與候選人／資料集；
2. 來源 URL、raw snapshot、manifest、checksum 與 provenance 影響；
3. 產生或重建檔案的指令；
4. npm run typecheck、npm run lint、npm test、相關 validator 與 build 結果；
5. 未驗證、來源不可達、衝突與 withheld 資料的中性說明。

CI 是 required technical checks；GitHub reviewer 負責 CI 無法表達的內容脈絡、證據與措辭。分支保護與 required human approvals 在 GitHub repository settings 設定，不由 repository runtime 或資料欄位模擬。

## 發布與回滾

- 公開頁面只讀 data/approved/、data/published/ 和受控 read models。
- .cache/reports/ 是本機生成診斷，不能成為發布輸入。
- checksum 或來源改變時，新增快照、重跑 adapter／validator，並在新 PR 說明影響。
- 要撤回內容時，以新的資料 PR 移除或標為 withheld，重跑驗證與 build；不要手改 dist/。
- 來源缺口不是負面證據；「暫無資料」不表示「不存在」。

## 不可退讓的內容規則

候選人資料不評分、不排名，不由姓名、照片、政黨、職務或空白欄位推論動機、親屬、違法或成果。政策承諾與已發生的從政歷程分開；所有候選人使用等價版面與資料類別。