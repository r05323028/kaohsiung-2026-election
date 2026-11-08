# Content Policy

## Current publication status

本 repository 同時保留兩個清楚分隔的資料層：

1. `official approved snapshot`：只包含截至 `2026-11-05` 通過 source/reference/reconciliation gate 的 2026 官方選舉切片；市議員列名仍是預公告抽定資料。
2. `public-record approved-source-backed slice`：只包含選定人物的來源支持紀錄；dataset `review.status` 仍為 `pending-human-review`，不等於人工編審完成。
3. `fictional demo fixtures`：四位虛構人物與兩個示範選區，所有項目 `isDemo: true`；不得被當成真實政治資料。

市長五人目前來自 CEC 候選人資格審定；101 筆市議員列名來自 KHEC 姓名號次抽定表的人工視覺轉錄。UI 必須寫「抽定、非正式公告」，政黨欄位必須保持未刊載。這些列名可作預公告展示，但不等於 2026-11-17 正式候選人公告；公告後必須重新比對。

## Source and claim distinction

- **Candidate statement**：候選人原文，明確標示。
- **Editorial summary**：短小、可追溯且非誇大整理。
- **Independent record**：由文件支持的公共活動或結果。
- **Verification status**：Verified、Pending review、Disputed、Insufficient information。
- **Unavailable/pending**：資料尚未取得或尚未核准；絕不寫成不存在。

不把候選人聲稱的成就呈現為獨立證實結果；不從姓名、圖片、傳聞或空白推論親屬、動機、不當行為或政治關係。

## Public-record boundary

目前 public-record 切片只涵蓋李眉蓁、王義雄與刻意保留無 bundle 的賴瑞隆。KCC 議員身分頁支持機關頁上的職務/身分；KCC 總質詢摘要只支持「公開紀錄中的參與」與來源 metadata，不支持把內容改寫成候選人政策、個人成就、行政成果、家庭關係或政治關係。每個 claim 都必須連到 claim-specific evidence 與官方來源；沒有來源的類別保持空集合，UI 顯示「目前尚無已查證的資料」。`approved-source-backed` 是離線快照與引用驗證狀態，不是人工審查核准。

## Full-roster coverage policy

全 roster audit 只回答「哪些候選人／分類已有已保留來源快照、哪些仍未嘗試」，不回答候選人優劣或資料是否存在。`not-attempted`、`not-ready`、`pending-human-review` 都必須以中性文字呈現；不得將 628 個未嘗試 slots 改寫成「沒有紀錄」。source-backed static display 也不等於 human/editorial approval。coverage report 不產生排名、完整度分數或候選人排序，且 demo fixture 不得進入 106 位 official roster 的 audit。

## Executed research policy

`execute-candidate-public-record-research` 會把實際操作與既有 coverage audit 分開記錄。對 106 位 official candidates × 6 類別建立 636 個 audit slots；CEC C1/T 快照提供 106 個 P0 名冊觀察、97 個 machine-extracted claims 與 106 個 evidence。9 位候選人的官方來源姓名字元有差異，保留為 conflicted，不能用姓名單獨合併或靜默改寫 canonical roster。

P1 的政策／活動目前只記錄官方候選人 JSON 可支持的 source scope 與空白欄位限制；P2 news/timeline 與 P3 relationships 尚未執行。`not-attempted`、`blocked`、`unavailable` 不是負面結論。`approved` research JSON 是可重現的靜態讀模型，不代表 human/editorial approval；目前 human reviewed、editorial approved、reviewerId、reviewedAt 均為 0/null。只有原始快照、來源 URL、checksum、attempt/result 與 claim-specific evidence 可進入研究資料層。

## Biography publication policy

履歷研究的來源優先順序是高雄市議會、內政部地方公職人員系統、立法院、CEC 歷史資料庫與其他政府/機構紀錄；候選人自述只能以 `candidate-statement` attribution 發布，不能獨立證明 elected office。

每次操作都要保存 query/method、URL、時間、HTTP 結果、raw snapshot、checksum、excerpt 與 failure/未嘗試狀態。KCC 與 MOI 的穩定識別碼、管轄區與選舉區需互相支持；姓名差異進入 conflict queue，不靜默合併。現職、歷史職務、歷史參選、當選公職、專業經驗、教育與 career milestone 必須使用不同 claim type；缺少日期就保留 null。

機器擷取、人工核對、編輯核准、靜態出版是四個不同狀態。2026-11-06 biography layer 有 897 筆 machine-validated claims，但 human/editorial approval 為 0，因此 compatibility approved projection 與 public publication snapshot 都為空；頁面只顯示「目前沒有可公開的已核准履歷主張」與「空白不代表不存在」的中性說明。四位 pilot 候選人的 405 筆 claims 經 release audit 後，仍須由真人逐筆決定；12 筆等量選取只是 review queue，不是出版資格。

## Scoped enrichment policy

2026-11-07 的 scoped enrichment 只涵蓋指定的 12 位第 4 選區候選人與 5 位市長候選人，建立 102 個 candidate/category audit。它保存 588 次 source attempts、31 個 source records、198 個 identity observations 與 143 筆 claim/evidence；42 個 audits 有來源 claims，60 個 audits 保持 no-evidence/gap。

來源包括 CEC/KHEC roster、KCC current member/profile/history、立法院、政府頁面與可歸因新聞。新聞只能保存可核對的報導內容與 attribution；候選人自述只能標為 `candidate-statement`/`self-reported`。KCC 的 `服務政見` 才能形成政策自述，不能把共用的「學經歷與政見」導覽文字當成 claim。行政成果、親屬、timeline 與 currentness 都要使用 claim-specific evidence；沒有日期保留 unknown，沒有 source header 的快照不被假裝成新鮮資料。

`data/enrichment/normalized/` 與 `data/enrichment/review/` 僅供本機審查，`approved/`、`published/` 目前為空；production Astro 不 import 這些檔案。`enrichment:validate`/`enrichment:verify` 會檢查 raw checksum、17 × 6 audit coverage、no-name-only、非負面證據與 District 4/市長獨立樣本。任何公開前仍必須由授權 reviewer 透過既有 `evaluateEditorialPublicationGate(...)` 決定，不能因 machine validation 或 source retrieval 自動出版。

詳見 `docs/SCOPED_ENRICHMENT.md`。

## Scoped review and publication policy

`review-and-publish-zuoying-mayoral-profiles` 對 143 筆 claims 與 60 個 neutral category gaps 逐 row 保留 blocker 原因；107 rows 涵蓋 75 個 audits，不能把 coverage gap 寫成不存在，也不能把 capture-file-mtime 當成事件日期。review queue、source excerpt、URL、checksum、identity、attribution 與 temporal state 只供 local `/editorial-review/` 使用。

Scoped gate 必須同時看到 resolved identity、直接 evidence、目前 source checksum、正確 attribution、machine validation、受權 reviewer 的 explicit claim/identity decisions；行政成果與敏感關係仍需相應證據。空 registry、空 approved/published layer 時，公開候選人頁與 metadata 不得包含一般 scoped claims。匯出決策 JSON 不是 human approval；一般 scoped 出版只能由既有受權流程與 CLI 驗證後再出版。另有獨立、受限的 `automated-editorial-policy-v1` machine path，只有符合更嚴格低風險條件的 claim 才能進入自己的 reviewer-free snapshot，不會改變 scoped gate。詳見 `docs/SCOPED_REVIEW_PUBLICATION.md`。

獨立 AI audit 只是在不改寫 raw bytes 的前提下重開來源、檢查 claim/evidence/identity/attribution/temporal anchors，並以第二個 deterministic machine pass 比對 143 筆 claims；它沒有 reviewer 身分，不產生 approval，也不把 needs-review 或 blocker 改寫成不存在。2026-11-07 的結果為第一輪 4 machine-verified、139 needs-review、0 unsupported，第二輪 2/141，141 agree、2 disagree、0 corrections、149 blocker findings；ACP agent 無法存取檔案，故 agent pass 為 unavailable。詳見 `docs/INDEPENDENT_AI_AUDIT.md`。

`execute-semantic-evidence-adjudication` 另以固定 evidence packets 執行 Reviewer A/B 的模型語意判讀；只有 packet 內精確連續 citation 才能保留，invalid/failed/unavailable attempts 不補值。模型結果仍是 local machine-assisted evidence，所有 comparison 與 proposed correction 必須由授權人類依既有 publication gate 再決定，不能直接進入 public static output。詳見 `docs/SEMANTIC_EVIDENCE_ADJUDICATION.md`。

`autonomous-candidate-content-publication` 是明確授權但獨立的 machine exception，不是 human editorial approval。`automated-editorial-policy-v1` 在 143 筆中只公開 1 筆白喬茵的 KCC 歷史專業經驗，142 筆 rejected；71 disagreement、25 correction targets、duplicate、wrong identity、非允許 source class、非 full agreement 與 stale evidence 都 fail closed。public record 省略 reviewer/model/raw provenance，machine-approved 不得寫成「人工核准」或候選人背書；human/editorial approval 仍為 0。詳見 `docs/AUTOMATED_PUBLICATION.md`。

## Political neutrality

- 所有候選人使用等價卡片、avatar、光線、尺度、動畫與資料分類。
- 不依人氣、外貌、民調、財富、影響力或主觀性格排序/評分。
- 城市是原創閱讀入口，清楚標示不是官方地圖/選區界線。
- 不暗示候選人、政黨、選委會或政府機關背書。
- 真實人物 likeness/GLB 必須另外取得適當 reference、授權/審閱與等價性檢查；目前尚未實作。

## Privacy and copyright

只收集公共職務、公共主張、可文件化公共活動與具公共利益的公開關係。新聞只保存 title/publisher/date/url/topic/短摘要，不複製全文、照片或 proprietary graphics。

## Review checklist

1. 確認 election year/type 與官方 constituency 定義。
2. 為每個欄位保存 primary source、publication/retrieval date、checksum。
3. 獨立 roster 與 drawing/announcement source reconcile。
4. 人工確認姓名 identity 與狀態；抽定不得標 final。
5. 只在 approved layer 發布；執行 `npm run validate:data`、`npm run validate:official`、`npm run validate:public-records`、typecheck、lint、tests、build。
6. Public-record dataset 若是 `pending-human-review`，不得填入 reviewer ID/date；來源支持展示必須顯示 review 狀態。
7. Full-roster coverage 必須執行 `npm run validate:full-roster`，保留每一格的 source/checksum/review 狀態與 gap 說明；不得把 coverage gap 當成 negative finding。
8. Executed research 必須執行 `npm run validate:research`，保留每次 attempt 的來源、時間、checksum、結果、identity/conflict 狀態與 independent verification 限制；不得把 machine reparse 當成 human review。
9. 保留 correction/version history，不靜默刪除衝突資料。

完整 public-record editorial coverage 與人工審查仍是後續工作；本次已執行的是 106 位 official candidates 的 P0/P1 source attempts，不是 106 位都已有公共紀錄。正式公告刷新、P2/P3 研究、更多來源擴充與任何自動推論仍不在範圍內。
