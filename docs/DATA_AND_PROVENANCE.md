# 資料與 provenance

本文件說明資料從哪裡來、如何被保存與驗證、哪些狀態可以對外呈現。內容規則（怎麼寫、怎麼分類）見 [CANDIDATE_CONTENT.md](CANDIDATE_CONTENT.md)；發布閘門與審查流程見 [EDITORIAL_AND_PUBLICATION.md](EDITORIAL_AND_PUBLICATION.md)。

## 三類資料，互不回退

| 類別 | 位置 | 用途 |
| --- | --- | --- |
| 官方選舉資料 | `data/approved/2026/kaohsiung-election.json` | 唯一可發布的名冊、選區、號次、來源 |
| 研究與已發布內容層 | `data/published/2026/`、`data/approved/2026/` | 基本資料、政策、新聞、從政歷程、家族關係等受控資料集 |
| 虛構示範資料 | `src/data/fixtures.ts` → `src/data/demo.ts` | 僅測試、版型與角色資產驗證，全部 `isDemo` |

官方資料缺失或未核准時顯示中性「暫無資料」，**不得**以 demo、舊資料或其他來源補位。各層載入器先驗證 schema，失敗即建置失敗。

## 快照與校驗碼

- 每個來源在 `data/official-source-manifest.json`（或各層 manifest）有一筆紀錄：穩定 source ID、canonical/API URL、標題、發布者、發布日、擷取日、本地 raw 路徑、SHA-256、角色與驗證狀態。
- 保留的位元組不可改寫。checksum 改變代表**來源變更**：新增快照、重跑 adapter 與對帳、檢查 diff、保留舊報告，而不是原地覆蓋。
- 建置與驗證器**不連網**；所有抓取都是明確、獨立的 pre-build 操作，且位元組必須先提交。
- 快照只保留公開所需內容；新聞不存全文、照片或專有圖表，僅標題／媒體／日期／中性摘要／連結。

## 官方資料來源與對帳

| 來源 | 支撐 |
| --- | --- |
| 中選會 65213 合格名單 | 5 位市長候選人資格 |
| 中選會 63625 + PDF | 選舉日、席次、選區定義（1–11 普通、12 平地原住民、13–15 山地原住民） |
| 中選會 64009 | 登記規則脈絡 |
| Vote2026 `C1/64000.json`、`T/64000.json` | 市長與市議員列（106 位 P0 觀察） |
| 高市選委會 65366／65368 + 共用 PDF | 抽籤號次（101 筆議員列逐列轉錄；65368 僅別名，非獨立證據） |
| 高雄市議會（KCC）議員簡介與新聞稿 | 公開紀錄切片與從政歷程 |
| 立法院開放資料 | 立法提案與記名表決 |

`npm run validate:official` 會重算 raw checksum、比對名冊順序、CEC 名單與 KHEC PDF metadata，並輸出 `reports/election-reconciliation.json` 與同名的 `.md`。目前為 `partial`：5 位市長姓名相符、16 個選區齊備、101 筆議員列在 15 個選區內對帳一致，另有一個議員公告範圍待正式公告。

**號次狀態**：`numberStatus` 為 `drawn`（抽籤結果，非最終）、`final`（正式公告且人工確認）或 `not-published`。驗證器拒絕非 final 卻標 `candidateNumberIsFinal: true`，也拒絕資格未核准的發布。2026-11-12（市長）與 2026-11-17（議員）正式公告後，需取得新快照、重新對帳，才能把號次升為 final。

## 身分對帳

同名或相似姓名**不是**同一人的證據。合併前需有來源特有識別碼（KCC 議員 ID、內政部 external ID）、選區、職務、時間脈絡等交叉支持；不可只用姓名。

- 判定選項：`confirm-same`、`confirm-different`、`insufficient-evidence`、`reject-match`、`defer`。
- 目前保留 9 個未解衝突（字元差異、族名／轉寫差異、相近姓名），無任何人工 resolution；依賴它們的 claims 不具發布資格。
- `insufficient-evidence` 與 `defer` 只表示尚不能出版，不是「不存在」或「不實」。
- 推翻先前身分決定時，所有依賴 claims 立即失去出版資格，須重新審查。

## 覆蓋稽核的語意

覆蓋率是**本次離線批次做了什麼**，不是「這人有沒有這件事」。

| 狀態 | 意思 |
| --- | --- |
| `source-retrieved` | 已保留該候選人／類別的來源快照 |
| `not-attempted` | 本批次沒有嘗試或沒有專屬快照——不是不存在證據 |
| `source-unavailable` | 來源不可達（例如 403、429），不代表沒有資料 |
| `no-verifiable-record-found` | 已查但沒有可核實紀錄 |

其他規則：

- `isNegativeEvidence` 永遠為 `false`；空白欄位不可寫成「沒有」。
- 稽核的 `publishedRecordCount` 只代表 HTML 顯示數量，不是編輯核准數。
- 稽核 payload 不進 3D、搜尋或 metadata；只有通過閘門的內容才會出現在頁面。
- 批次支援 `--dry-run`、篩選、重試、併發、checkpoint 與 atomic write；失敗的 run 不覆蓋既有結果。

### 全名冊候選人稽核

`npm run candidate-audit:generate` 會以 `data/approved/2026/kaohsiung-election.json` 的 106 位候選人為唯一邊界，離線聯結目前受控的基本資料、傳記、新聞、公共紀錄、從政歷程、政策與家族資料層，產生：

- `reports/candidate-roster-audit/coverage.json`：每位候選人 × 七類資料各一列，分開記錄 researched、machine-verified、independently-checked、human-reviewed、editorially-approved、approved-layer 與 statically-published。
- `reports/candidate-roster-audit/claims.json`：保留 claim、source/evidence/provenance 連結、驗證／審查／發布狀態；新聞同時保留候選人關聯與不重複文章的差異。
- `reports/candidate-roster-audit/provenance.json`：以來源宣告的 raw 路徑、SHA-256、位元組長度與 URL 分類可重算、無法在本地解析、URL-only 等狀態。
- `reports/candidate-roster-audit/gaps.json` 與 `audit.md`：以 `source-unavailable`、`insufficient-evidence`、`conflict`、`pending-human-review`、`no-verifiable-record-found` 等中性狀態呈現缺口；`isNegativeEvidence` 永遠為 `false`。

`npm run validate:candidate-audit` 會檢查 106 個 canonical IDs、742 個候選人／類別列、claim/provenance 連結、輸入 checksum／byte length，以及人工審查與編輯核准旗標。空的 `data/editorial/reviewer-registry.json` 或缺少授權決策時，任何 claim 都不得被稽核標為 human-reviewed 或 editorially-approved；受控層的 automated／machine-verified／approved status 不等同人工核准。`npm run validate:candidate-audit` 會在記憶體中依目前輸入重算五份 artifact，逐位元組檢查既有輸出是否新鮮，再執行結構驗證；`npm run candidate-audit:generate` 才會寫入報告。`npm run validate:all` 只做前述 freshness／validation，不會在驗證流程中覆寫報告。

## 資料集清單（2026-11-15 現況）

| 資料集 | 內容 | 狀態 |
| --- | --- | --- |
| `kaohsiung-election.json` | 16 選區、106 候選人（5 市長、91 議員、10 原住民議員），全部 drawn、0 final | approved，snapshot 2026-11-05 |
| `kaohsiung-public-records.json` | 李眉蓁、王義雄（賴瑞隆刻意無 bundle）之來源支持紀錄 | approved-source-backed，pending-human-review |
| `candidate-public-record-research.json` | 106×6 稽核與 P0 研究（97 claims、106 evidence、9 衝突） | 研究 read model，非核准 |
| `candidate-biographies.json` | 0 筆核准 claims | published 空 snapshot（正確狀態） |
| `candidate-basic-profiles.json` | 829 claims／106 候選人（103 人有內容） | published，機器獨立查核 |
| `candidate-policies.json` | 1,017 筆政策主張 | published，自動查核 |
| `candidate-news.json` | 213 篇新聞 metadata（106 人覆蓋） | published，policy v1 |
| `political-career.json` | 154 任期、1,045 活動、25 專案、851 提案、327 表決、714 來源；68 人有紀錄、38 人查無 | approved，2026-11-14 |
| `policy-career-separation.json` | 1,017 筆分類（1,010 承諾、9 歷程、3 拆分）＋21 連結 | approved，2026-11-14 |
| `political-family.json` | 45 人、24 關係、32 來源 | published，需雙重證據 |
| scoped enrichment artifacts | 歷史範圍研究與自動化檢核輸出；不屬於 106 人全名冊的公開候選人資料層 | 排除於全名冊覆蓋稽核與公開載入器 |
| likeness photos／appearances | 12 位候選人的 Wikimedia Commons 肖像、授權與外觀參數；身分只到「來源連結」層級 | 研究用，未公開；照片位元組留存於 gitignored 快取 |

likeness 照片只記錄 URL、作者、授權與雜湊；不得在未確認授權與身分的情況下重新散布，也不得以「查無照片」推論當事人外觀。管線與發布閘門見 `docs/CITY_AND_CHARACTERS.md`。

歷史 scoped 研究與自動化檢核輸出不併入 106 人全名冊稽核，也不由 production loader 讀取；若要重新納入，必須建立新的不可變來源快照並重新通過全名冊身分、證據與發布閘門。

## 更新程序

1. 以可重現的方式取得官方文件／API，記錄 URL、標題、發布日、擷取日、檔案 ID 與 SHA-256。
2. 新增 raw 快照；不改寫歷史，除非明確記錄變更。
3. 更新 adapter，確保相同位元組產生相同輸出（決定性、可重跑）。
4. 更新 `data/review/`：審查者、狀態、範圍、未解問題。
5. 與獨立保留的官方名冊對帳；不一致即阻擋升級。
6. 只把已審查、有來源的紀錄移入 `data/approved/`；pending 不得外洩到名單、路由、搜尋或 metadata。
7. 執行 `npm run validate:all` 與 `npm test`；文件與指令同步更新。

## 隱私與保留

只收錄公開職務、公開立場、可查證的公共活動與公共利益相關的公開關係。不保存私人住址、電話、私人 email、身分證號；新聞只保留 metadata 與短摘要。保留的稽核紀錄、來源證據與 checksum 屬不可變 provenance，不得為了文件整併而改寫。
