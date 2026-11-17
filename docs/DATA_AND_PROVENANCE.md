# 資料與 provenance

本文件說明資料來源、快照、確定性驗證與公開邊界。內容規則見 [CANDIDATE_CONTENT.md](CANDIDATE_CONTENT.md)；GitHub Pull Request 與 CI 契約見 [EDITORIAL_AND_PUBLICATION.md](EDITORIAL_AND_PUBLICATION.md)。

## 資料流

| 層 | 位置 | 用途 |
| --- | --- | --- |
| 原始證據 | `data/raw/`、manifest | 不可變來源位元組、URL、擷取時間與 SHA-256 |
| 正規化／研究 | `data/normalized/`、`data/research/` | 可重跑 adapter、來源對帳、claims、evidence 與缺口 |
| 受控公開快照 | `data/approved/`、`data/published/` | 通過 schema、引用、checksum 與發布條件的資料 |
| 讀取模型 | `src/data/` | build-time 驗證與頁面所需的最小 view model |

頁面與元件不得讀 raw、normalized、research、enrichment 或本機診斷；公開層只讀受控快照。來源缺失、身分不確定、證據不足、衝突或 `pending-verification` 的資料保持 withheld／unpublished，顯示中性「暫無資料」，不轉成負面事實。

## 快照與 checksum

- 每筆來源保留穩定 source ID、canonical URL、標題、發布者、發布日、擷取日、raw 路徑與 SHA-256。
- 相同 raw bytes 必須產生相同 adapter 輸出；checksum 改變時新增快照、重跑 adapter 與對帳，不就地改寫 provenance。
- build、validators、tests 不連網；抓取與轉換是明確、獨立且可記錄的 pre-build 操作。
- 新聞只保存標題、媒體、日期、中性 source summary 與連結，不保存全文或專有圖表。

## 官方選舉資料

`data/approved/2026/kaohsiung-election.json` 是候選人、選區、號次與官方來源的 canonical roster。`npm run validate:official` 會重算 raw checksum、檢查名冊順序、CEC／KHEC 對帳、候選人與選區完整性，診斷寫入 `.cache/reports/`。`numberStatus`、`pendingVerification` 與來源公告狀態表達技術對帳進度，不是內容審查佇列。

同名或相似姓名不是同一人的證據。合併身分需有來源特有 ID、選區、職務與時間脈絡；不足時保留 `insufficient-evidence` 或 `defer`，不發布依賴該身分的 claim。

## 覆蓋與缺口

覆蓋率只表示本次離線批次做了什麼，不表示某人一定有或沒有某件事：

- `source-retrieved`：已保留該候選人／類別的來源快照；
- `not-attempted`：本批次未嘗試，不代表不存在證據；
- `source-unavailable`：來源不可達，不代表沒有資料；
- `no-verifiable-record-found`：已查找但未找到可核實紀錄；
- `pending-verification`、`withheld-unverified`、`conflict`：維持不公開，直到新的來源與驗證結果加入 PR。

`isNegativeEvidence` 永遠為 `false`。診斷與量測由指令寫入 gitignored 的 `.cache/reports/`，不會成為網站輸入，也不提交到 repository。

## 主要資料集

- 官方名冊：`data/approved/2026/kaohsiung-election.json`。
- 基本資料：`data/published/2026/candidate-basic-profiles.json`，以 claims、sources、checksum 驗證。
- 履歷：`data/published/2026/candidate-biographies.json`，以 evidence、source IDs、日期規則與 checksum 驗證；未驗證的 normalized claims 不會自動公開。
- 政策：`data/policy-research/2026/full-roster.json` 與受控政策快照，分開保留來源、驗證與發布狀態。
- 新聞：`data/published/2026/candidate-news.json`，只發布已附來源摘要且通過 deterministic checks 的文章 metadata。
- 公開紀錄：`data/approved/2026/kaohsiung-public-records.json`；研究 enrichment 缺口保持 withheld。
- 從政歷程：`data/approved/2026/political-career.json`；政策／歷程分類在 `policy-career-separation.json` 以決定性 validation envelope 保存。
- 家族關係：`data/published/2026/political-family.json`；親屬與職務來源必須分離且各自完整。
- 角色資產：manifest、授權、來源身分與 GLB／照片 checksum 通過後才可使用；視覺資產的安全檢查不等同候選人內容審查。
- 財產申報：`data/raw/official/2026/property-declarations/pages/` 僅保留中選會 HTML 清單快照與 retrieval metadata；`data/normalized/2026/candidate-property-declaration-financial-summaries.json` 與 `data/published/2026/candidate-property-declarations.json` 只保留類別層級的彙總總額／申報筆數、官方文件頁碼與每類的離線核對方法；這些是候選人公開申報的類別摘要，不是逐筆財產明細。`data/normalized/2026/candidate-property-declaration-verification.json` 另保留每份外部 PDF 的 SHA-256、頁數、擷取與核對方法描述、工具版本，以及類別級數值／頁碼對帳結果，供離線驗證，不含 PDF 位元組、OCR 文字或個別金額。核對方法是機器輔助的雙渲染 OCR 比對，或官方頁面與頁面座標的視覺核對；不同方法不互相替代，也不是人工逐筆覆核。掃描 PDF、原始 OCR 文字、逐字轉錄、地址、身分證字號、金融帳戶、簽名與個別財產標的不進入 repository。

`src/data/fixtures.ts` 與 `src/data/demo.ts` 只供測試與資產驗證，全部標示 `isDemo`，不得補位公開資料。

### 財產申報來源與隱私邊界

`property-declarations:discover` 預設離線讀取已提交的官方 HTML 快照；`--fetch` 只允許固定的 `pdps-dec.cec.gov.tw/release/formal/` 頁面清單，不能把任意 URL 帶入來源流程。來源頁的 checksum 改變時，建立新快照並重新對帳，不就地改寫既有 provenance。PDF 只作為官方外部連結；`property-declarations:extract --all --pdf-dir <dir>` 在受控本機依 verification manifest 核對 PDF SHA-256 與頁數後，將頁面文字／OCR 證據寫到 gitignored 的 `.cache/reports/property-declarations/extraction/`，支援單一候選人、單一 PDF、增量與 `--force`。驗證 manifest 只保留 PDF SHA-256、頁數、擷取與核對方法描述、工具版本與類別級 agree/not-determined 結果；`property-declarations:verify --pdf-dir` 可重新雜湊 PDF 並核對頁數。PDF、原始 OCR 文字與逐字轉錄不得進入 repository，發布層只接受清理後的類別彙總摘要。

2026 民間版選舉公報（`gazette2026.taiwangogo.tw`）只作為尋找與交叉提示的次要來源，不取代中選會文件；其 OCR／LLM 輔助摘要、估算值與缺漏不進入公開資料。引用其策展資料或文字時依 CC BY 4.0 標註「資料來源：台灣前進《2026 民間版選舉公報》」；第三方原始文件不在授權範圍。

`source-linked` 表示單一官方文件已以 canonical candidate ID、選舉類型與選區脈絡對帳；`ambiguous-source` 或 `source-unavailable` 只表示目前無法唯一呈現連結，不是「沒有財產」或「沒有申報」的負面證據。

## 更新程序

1. 保存官方或公開來源的 raw bytes、URL、發布／擷取日期與 checksum。
2. 產生新的 normalized／research 輸出，保留身分、evidence、範圍、缺口與失敗原因。
3. 執行對應 deterministic validators；不以姓名、空白、照片或其他候選人資料推論缺失事實。
4. 開 GitHub Pull Request，讓 reviewer 檢查 diff、來源、provenance、中立措辭與生成步驟；在 PR 中附上 typecheck、lint、test、validator 與 build 結果。
5. 只有通過技術檢查並完成 PR review 的受控快照才可合併到 `main`；網站從合併後快照 build，不讀本機報告或研究輸入。
6. 來源改變或錯誤修正時建立新 PR，新增快照並重跑驗證；不要手改生成位元組或 checksum。

## 隱私與保留

只收錄公開職務、公開立場、可查證的公共活動與公共利益相關的公開關係。不保存私人住址、電話、私人 email 或身分證號。來源證據、raw bytes、manifest 與 checksum 是 provenance，不為了文件整併而改寫。
