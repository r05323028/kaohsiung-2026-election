# 獨立查核基本資料政策 v1

本文件說明 2026 高雄市長與市議員候選人「基本資料」的自動化研究、獨立查核與靜態發布流程。此流程不取代人工編輯核准；它是一條獨立、可稽核、僅收錄通過查核主張的發布路徑。

## 適用範圍

- 資料集：`kaohsiung-2026-candidate-basic-profiles-publication`
- 政策版本：`basic-profile-machine-verification-v1`
- 名冊：`data/approved/2026/kaohsiung-election.json` 的 106 位正式候選人（5 位市長、101 位市議員）
- 欄位：學歷、專業與工作經歷、公共服務經歷、目前職務、官方網站或公開頁面、其他可查證背景
- 發布位置：候選人頁面的「基本資料」分頁

## 與人工編輯核准的區別

本流程的 `verification.verdict = verified` 只代表獨立查核代理人重新開啟來源、比對摘錄、確認身分與欄位後，認為該主張可被來源支持。它不是 `humanReviewStatus = human-reviewed`，也不是 `editorialStatus = editorially-approved`。

- 既有履歷發布閘門（人工＋編輯核准）維持不變。
- 本流程只發布通過 `basic-profile-machine-verification-v1` 的主張。
- 頁面必須明示資料由公開來源逐項查核，並與人工編輯核准的履歷分開列示。
- 未通過查核、身分未確認、來源衝突或涉及隱私的主張留在研究層，不會進入公開頁面。

## 發布規則（fail-closed）

一筆主張必須同時滿足以下條件才會進入 `data/published/2026/candidate-basic-profiles.json`：

1. 候選人 ID 存在於正式名冊，且研究紀錄的身分狀態為 `resolved`。
2. 身分至少由兩項訊號支持（例如姓名＋選區、政黨、出生日期、職務、官方頁面）。
3. 獨立查核者為該 claim 產生一筆 decision，且 verdict 為 `verified`。
4. 查核者已重新開啟來源：`accessible = true`、`matchesClaim = true`。
5. 四項檢查全為 true：`identityMatch`、`supportsField`、`dateConsistent`、`currentStatusCorrect`。
6. 來源為 https，具 publisher、retrievedAt 與可直接支持的 excerpt。
7. 來賓或維基百科不得作為唯一證據；`wikipedia-reference` 一律阻擋。
8. 目前職務不得只依賴候選人自述；`current-position` 不得使用 `candidate-statement`。
9. 歷史職務必須有結束年份；目前職務不得有結束年份。
10. 不得包含私人住址、個人電話、私人電子郵件、身分證號或其他非必要個人資料。
11. 選舉公報與高雄市議會議員簡介的學歷／經歷內容視為候選人提供；除目前職務外，合併時一律標示為「候選人自行填列」，不因刊登於官方網站而視為獨立佐證。

任何一項不滿足，該主張不會發布，並在 `data/normalized/2026/basic-profiles.json` 留下 disposition 與原因。

## 來源類別

機構紀錄：高雄市議會本屆議員名錄、議員簡介、內政部地方公職人員資訊、立法院、中央選舉委員會選舉公報、政府機關公開紀錄、學校公開紀錄。

其中「議員簡介」與「選舉公報」的學歷／經歷欄位由候選人提供；本流程仍保留其來源與 URL，但公開時標示為「候選人自行填列」。只有目前職務可由議會名錄或官方公告作為機構紀錄。

候選人與政黨：候選人官方網站、候選人公開社群頁面、政黨官方網站。這些來源以「候選人自行填列」標示；目前職務不得只靠這類來源。

新聞：具名媒體、已知發布日期、明確指涉同一候選人，且摘錄直接支持該欄位。

維基百科：僅用於尋找線索與外部連結，不得作為唯一證據。

## 工作流程

```bash
npm run basic:queue       # 建立 106 人名冊佇列與批次
npm run basic:seed        # 擷取高雄市議會簡介與 2022 選舉公報種子
npx tsx scripts/basic-profile/draft-batch.ts batch-01
# candidate-researcher 完成 researcher/batch-01.json
npx tsx scripts/basic-profile/check-batch.ts researcher batch-01
# candidate-verifier 完成 verifier/batch-01.json
npx tsx scripts/basic-profile/check-batch.ts verifier batch-01
npm run basic:merge       # 匯入所有批次、套用 disposition
npm run basic:publish     # 只輸出 publication-eligible 且 verified 的主張
npm run basic:finalize    # 補齊 researcher 狀態並同步 queue
npm run validate:basic-profiles
npm run basic:report      # reports/basic-profile-coverage.json/.md
npm run basic:final-report # reports/candidate-basic-profile-final.json/.md
```

代理人定義位於 `.pi/agents/candidate-researcher.md` 與 `.pi/agents/candidate-verifier.md`。研究者與查核者使用獨立 context，研究者不得將自己的發現標為已查核，查核者不得修改研究者的 claim 來讓它通過。

## 狀態

候選人層級：`not-started`、`researching`、`research-completed`、`verification-pending`、`verification-completed`、`needs-additional-evidence`、`publication-eligible`、`publication-blocked`。

欄位層級獨立記錄，不因姓名與選區存在就視為完成。

## 已知限制

- 2026 選舉公報在撰寫時尚未發布，因此 2022 公報只作為歷史資料，並標示為候選人自行填列。
- 部分候選人只有競選文宣或新聞報導，缺乏獨立機構紀錄；這些欄位會保持未知。
- 高雄市議會簡介的「經歷」欄位可能混入學歷、服務政見或新聞標題，研究者必須逐行分類，查核者必須拒絕錯置欄位。
- 同名候選人（例如陳冠宇、張耀中、黃鈺婷）必須以出生日期、選區、政黨或職務區分；無法區分時不得發布。
- 快照與 PDF 不進版控（`data/research/2026/basic-profiles/artifacts/` 已忽略），但公開主張保留 URL、publisher、retrievedAt 與 SHA-256，供重建與稽核。
