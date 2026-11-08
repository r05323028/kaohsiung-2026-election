# Scoped review and publication

## 目的與邊界

`review-and-publish-zuoying-mayoral-profiles` 是既有 17 人 scoped enrichment 的離線品質與編審準備層，不是新的研究後端，也不是第二套 editorial system。範圍固定為 12 位高雄市議員第 4 選區候選人與 5 位市長候選人；production Astro 不 import `data/enrichment/`。

本次執行只會重開已保存的來源快照、驗證 checksum、分析 claim/evidence/identity 關聯、產生本機 review queue，並透過既有 `/editorial-review/` 顯示。沒有真人 reviewer、決策或出版授權時，approved/published layers 必須維持空集合。

## 離線命令

```bash
npm run scoped-review:prepare   # 重建分析、queue、readiness、gate 與 verification reports
npm run scoped-review:validate  # 驗證已保存 reports、source checks 與空 publication layer
npm run scoped-review:verify    # verify 的別名，供 build/CI 使用
npm run scoped-review:report    # 重建相同的 deterministic reports
npm run openspec:validate:scoped-review
```

命令不會連線、不會修改 `data/editorial/reviewer-registry.json`、既有 biography decisions 或 `data/published/2026/candidate-biographies.json`，也不會自動核准任何 claim。

## 目前量測結果（2026-11-07）

- 17 位候選人、102 個 candidate × category audits、143 筆 claims 與 143 筆 evidence。
- 107 個 blocker rows，涉及 75 個 audits；不能把 blocker rows 誤報成 75 個 claims。
- blocker 分類：60 個 neutral coverage gaps、16 個缺少議事／行政原始紀錄、16 個缺少明確公共關係來源、8 個候選人自述歸屬需人工確認、7 個現職 currentness 需人工確認。
- 所有 107 rows 目前都是 `remaining-blocked`；0 rows 可由保留證據安全自動解除。neutral gap 不表示事實不存在。
- review queue 有 203 項：143 個 claim items 與 60 個 category gaps。每項保留穩定 claim/audit ID、候選人、類別、歸屬、時間狀態、原始 evidence excerpt、source URL/checksum 與 blocker IDs。
- 13 個 stratified independent verification samples 橫跨第 4 選區／市長、六類資訊、blocked claims 與 `source-header`／`capture-file-mtime`／`unavailable` timestamp quality；每個 sample 都重新開啟 immutable snapshot，結果與 checksum 均記錄。
- scoped gate 為 143 筆全數 blocked、0 筆 eligible；reviewer IDs 為空，scoped approved/published layers 為空。

完整 machine output：

- `reports/zuoying-mayoral-blocker-analysis.{json,md}`
- `reports/zuoying-mayoral-independent-verification.{json,md}`
- `reports/zuoying-mayoral-review-queue.{json,md}`
- `reports/zuoying-mayoral-publication-readiness.{json,md}`
- `reports/zuoying-mayoral-publication-quality.md`
- `reports/zuoying-mayoral-publication-gate.json`

## Blocker 與 claim 審查規則

每個 blocker row 都保留 `blockerId`、`auditId`、candidate、claim IDs、source IDs、blocking rule、exact issue、machine-remediable、requires-new-evidence、requires-human-decision、remediation attempt 與 final status。相同 audit 可有多個 rows；報告和 queue 不會覆蓋或壓平它們。

- **Coverage gap**：保留來源沒有 candidate-specific evidence，只能保持中性缺口。
- **Public record / administrative evidence**：沒有可直接重開的議事或行政 snapshot，不把報導改寫成 institution outcome。
- **Relationship evidence**：公共關係需要直接、相關、可重開來源，不推論私人關係。
- **Candidate attribution**：候選人自述保留 `candidate-statement` / `self-reported`，不能改成機關成就。
- **Currentness**：KCC capture-file mtime 不是事件日期；沒有 source-header 就不能證明現職仍有效。

原始 claim 不會因 duplicate group 被刪除。`enrich-duplicate-001` 仍保留 `enrich-claim-0082` 與 `enrich-claim-0083` 的 evidence/lineage，disposition 是 `retain-both-pending-human-review`；只有每一筆都通過 gate 後，presentation layer 才能以共同 presentation key 統整，且仍保留所有 claim IDs 與 evidence IDs。

## 本機審查介面

既有 `/editorial-review/` 在 development 或明確 `EDITORIAL_REVIEW=true` 時才載入 scoped packet/report：

```bash
EDITORIAL_REVIEW=true npm run dev
```

介面仍是同一個 editorial app，新增「左營／市長範圍審查」子面板，可依候選範圍（第 4 選區／市長）、六類資訊與審查準備度篩選；detail 會顯示原始摘錄、source URL、SHA-256、identity、attribution、temporal status 與 blocker。範圍決策只能暫存在瀏覽器並匯出 JSON；匯出不等於 registry 身分、approval 或 publication，必須由受權流程與 CLI 驗證後才能進入既有 gate。

沒有 reviewer 時，介面不會替使用者建立決策；registry 仍為空。這個本機 registry 也不是強式身份驗證，不能把 OS 使用者、agent 或 Git metadata 當成授權。

## Publication boundary

未通過 scoped gate 的 claims 不會進入 scoped published layer、official profile、六個公開 tabs、search、metadata、JSON-LD、sitemap 或 client bundle。公開資料只可來自受 gate 控制的 deterministic publication snapshot；目前 snapshot 為空，所以這次 milestone 沒有公開 scoped biography、政策、新聞、關係或 timeline。

現有 `evaluateEditorialPublicationGate(dataset: BiographyDataset, decisionSet: EditorialDecisionSet, registry: ReviewerRegistry, packet: EditorialReviewPacket): PublicationGateReport` 完全未修改。scoped flow 使用 `evaluateScopedEnrichmentPublicationGate(dataset, decisions, registry)` 作為 governed adapter，重用既有 reviewer/decision schema，要求 claim approval、identity confirmation、evidence/source versions、machine validation、attribution consistency 與必要的 independent evidence。

## 真人下一步

1. 由具真實授權的編輯在本機 reviewer registry 建立帳號；不能由 agent 或環境資訊代填。
2. 先按 blocker 與 source version 逐筆檢查 143 個 claim items，處理 60 個 neutral gaps 和 75 個受阻 audit。
3. 對候選人自述、現職、公共關係、行政成果與 duplicate group 分別作出帶理由的 claim/identity decisions。
4. 以 CLI 驗證 decision JSON、確認 source SHA 未變且沒有 superseded/conflicting decision，再執行既有 scoped gate。
5. gate 有 eligible claims 後才建立 governed published snapshot，重建 Astro 並檢查 candidate tabs、source links、duplicate presentation 與 no-leak。

Human review、editorial approval、publication 目前均為 0；本文件描述的是可重現的 machine preparation，不是核准或發布聲明。
