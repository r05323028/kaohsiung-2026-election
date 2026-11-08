# 編輯審查工作流

本文件描述港都人物誌的本機、可稽核履歷編輯審查流程。它不會自動產生人類審查，也不提供強式身分驗證；真實候選人資料必須由明確設定且實際操作的審查者逐筆決定。

## 邊界

履歷資料依序經過：

```text
保留的原始來源 → normalized → machine validation → review packet
→ 身分審查 → claim-level evidence review → editorial decision
→ publication gate → deterministic published snapshot → Astro HTML
```

`data/normalized/`、`data/review/` 與 `data/editorial/review-packet/` 是內部審查資料，不是公開網站輸入。公開 Astro build 只讀 `data/published/2026/candidate-biographies.json`。`data/approved/` 的相容投影不取代 publication snapshot，也不能單獨證明人工核准。

## 初次設定

1. 執行 `npm run editorial:prepare`，從目前的 normalized biography layer 產生 review packet。
2. 編輯 `data/editorial/reviewer-registry.json`，加入實際負責人員的唯一 `reviewerId`、顯示名稱、角色與 `authorizedActions`。
3. 不要使用作業系統帳號、Git author、agent 名稱或主機名稱作為身分。registry 是本機授權設定，不是登入系統或不可竄改的身分證明。
4. 執行 `npm run editorial:review`，在本機開啟審查工作區。

空白 registry 是刻意的安全預設；系統不會替人建立 reviewer 或 approval event。

## 審查工作區

`/editorial-review/` 不加入公開導覽。只有開發模式或 `EDITORIAL_REVIEW=true` 時才載入 packet、registry 與 durable decisions。介面支援：

- 依候選人、選舉類型、選區、claim category、review state 篩選。
- 查看原始 claim、identity observation、evidence excerpt、source URL、retrieval time 與 SHA-256。
- 查看支持與矛盾證據、現有 decision history 與 identity conflict。
- 逐筆選擇 approve、reject、request clarification、dispute、defer 或 identity resolution action。
- 匯出 JSON；瀏覽器不直接寫入專案檔案。

Approve 與 `confirm-same` 必須勾選明確確認。reject、dispute、clarification、defer 及 identity override 必須填寫理由。瀏覽器產生的 JSON 必須由 CLI 驗證，不能直接放入公開資料夾。

## CLI 流程

```bash
npm run editorial:prepare
npm run editorial:review
npm run editorial:validate
npm run editorial:apply -- --decisions path/to/export.json
npm run editorial:validate
npm run editorial:publish
npm run editorial:report
npm run build
```

`editorial:apply` 會驗證 schema、reviewer 授權、subject reference、候選人一致性、decision/state mapping、supersede chain 與來源版本；相同 decision ID 的不同內容會拒絕合併。`editorial:publish` 只會把通過 publication gate 的 claims 寫入 deterministic snapshot，並產生 publication-gate、editorial-review-summary 與 identity-review-summary 報告。

## 狀態與稽核

系統區分 machine validation、editorial state 與 publication eligibility。可用的 editorial state 包含 `unreviewed`、`needs_identity_review`、`needs_evidence_review`、`approved`、`rejected`、`disputed` 與 `superseded`。後續 decision 必須以 `supersedesDecisionId` 指向同一 subject 的目前 active decision；不可形成 cycle，也不可同時留下矛盾的 active decisions。

每個 decision 保留：reviewer ID、decision time、理由、explicit confirmation、claim/identity subject、source checksum version、schema version 與 superseded decision。reviewer 個資不會進入公開候選人頁。

## 目前狀態

截至 `2026-11-06`，現有 897 個 machine claims、9 個 identity conflicts；production reviewer registry 與 decision set 都是空的，human-reviewed claims、editorially approved claims、published claims 均為 0。四位 pilot 候選人的 405 筆 claims 已完成 release audit，12 筆等量 queue 可供本機審查，但這是正確的 pending 狀態，不得以自動測試或 fictional fixture 取代真人審查。

## 驗證與限制

例行 workflow 必須離線執行。單元測試中的 fictional reviewer/candidate 只驗證閘門行為，與 production JSON 分離，不計入真實審查統計。若需要較強的授權與不可否認性，應在 repository branch protection 或離線簽章流程中另行建立，不應把 local JSON registry 宣稱為 authentication。
