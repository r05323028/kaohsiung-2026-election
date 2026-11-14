# Data Model

## Two datasets, one view contract

虛構與官方資料不能互相 fallback：

- `src/data/fixtures.ts` → `DemoDataset` → `validateDataset()`；所有項目必須 `isDemo: true`。
- `data/approved/2026/kaohsiung-election.json` → `OfficialDatasetSchema` → `validateOfficialDataset()`；這是唯一可發布官方 canonical layer。
- `src/data/view.ts` 的 `CandidateProfileView` 是視覺元件的共同 read model，不是 ingestion write model。

## Official entities

`src/data/official/schema.ts` 定義：

- **OfficialSource**：`id`, title, publisher, URL, publication/retrieval dates, verification status, note。
- **OfficialDistrict**：stable ID/slug、district label、`electionType`、`constituencyType`、description、scope note、source IDs、publication status。
- **OfficialCandidate**：stable candidacy ID/slug、display name、district ID、election year/type、candidate number、`candidateNumberStatus`、`candidateNumberIsFinal`、qualification/publication status、party/current position/portrait reference/summary/source IDs。
- **OfficialDataset**：dataset ID/snapshot date/election calendar/sources/districts/candidates/pending-review scopes。

正式 schema 支援：

- 市長（citywide mayor）
- 普通市議（ordinary council）
- 平地/山地原住民族市議 constituency（indigenous council）
- 2026 election metadata 與未來年度擴展

## Provenance and statuses

每筆 official record 必須透過 `sourceIds` 指向 manifest/approved source。source 保存 `Verified`、`Pending review` 或 `Insufficient information`，candidate/district 保存 `approved`、`pending-review` 或 `unavailable`。

`candidateNumberStatus`：

- `drawn`：官方抽定文件已提供，但不能叫 final。
- `final`：只有正式公告與人工確認後才允許。
- `not-published`：來源尚未發布或尚未核准。

`validateOfficialDataset()` 明確拒絕 `candidateNumberStatus !== final` 且 `candidateNumberIsFinal === true`，也拒絕未核准資格進入 approved publication。

## Public-record entities

`src/data/public-records/schema.ts` 定義獨立的 `PublicRecordsDataset` 與 `PublicRecordBundle`：

- `Claim` 保存 subject、predicate/object、日期限定、attribution、verification/review status 與至少一個 evidence ID。
- `Evidence` 保存 manifest source ID、claim ID、support/contradiction/context 類型、文件位置、可選短引文與查核狀態。
- `PositionRecord`、`PolicyRecord`、`PublicActivityRecord`、`NewsRecord`、`RelationshipRecord`、`TimelineEventRecord` 都必須回指 claims/evidence；`IdentityResolution` 與 `Conflict` 另行保存，避免把身份匹配或衝突藏在文案裡。
- `approved-source-backed` 只表示通過快照與引用驗證的 canonical build layer；本切片的 dataset review 仍為 `pending-human-review`，不捏造 reviewer ID 或審查日期。

目前切片只選李眉蓁、王義雄與刻意無 public-record bundle 的賴瑞隆。KCC 機關頁支持職務/身分與公開總質詢參與；沒有來源的政策、成就、家庭或政治關係保持空集合，UI 顯示中性 unavailable state。

## Full-roster coverage entities

`src/data/public-records/coverage.ts` 定義與 public-record claims 分離的 coverage write model：

- `CoverageDataset` 對每一位 official approved candidate 與六個類別建立唯一 audit key，共 106 × 6 = 636 格。
- `CoverageSourceCheck` 保存 expected/actual SHA-256 與 `unchanged`、`changed`、`missing-snapshot` 或 `not-checked` 狀態。
- `ClaimRevision` 保存來源支持 claim 的 snapshot revision，不代表新 claim 或人工核准。
- `CoverageCheckpoint` 保存 deterministic run/filter/completed/failed IDs、retry/concurrency 與 resume metadata。
- `FullRosterReviewPacket` 將有證據的 claim 與沒有候選人專屬 snapshot 的 coverage gap 分開；gap 不是 negative finding。

2026-11-05 measured report：8 個 category slots 使用已保留來源、16 筆 source-backed static records、628 個 slots `not-attempted`；human/editorial review 都是 0，reviewer metadata 是 null。此層不包含 demo candidates，也不計算候選人排名或單一完整度分數。

## Executed research entities

`src/data/public-records/research.ts` 是從既有 coverage audit 到實際研究操作的獨立 write model：

- `ResearchSourceSnapshot` 保存 CEC C1/T URL、擷取時間、HTTP/byte/checksum 與原始列範圍。
- `ResearchObservation` 保存每位候選人的 P0 名冊觀察、選舉區／號次、保守 identity status 與 evidence ID。
- `ResearchAudit` 對 106 × 6 格保存 discovery/retrieval/result、attempt time、checksum、claim/evidence/record IDs、review/publication 狀態；`not-attempted` 與 `isNegativeEvidence:false` 是不同於「查無此事」的明確狀態。
- `ResearchReviewItem` 與 checkpoint 保存待人工處理的 claim、姓名衝突與 coverage gap；reviewerId/reviewedAt 在 pending dataset 必須是 null。
- `candidate-public-record-research.json` 目前包含 106 個 P0 observations、97 個 machine-extracted claims、106 個 evidence、9 位姓名字元衝突；P2/P3 尚未執行，不宣稱完整 public-record coverage。

`src/data/public-records/research-index.ts` 只建立候選人研究摘要與來源連結，不把 pending claims 轉成已審核的 `PublicRecordBundle`；正式公共紀錄仍依 person ID 與 claim/evidence schema 隔離。

## Candidate biography entities

`src/data/biographies/schema.ts` 是獨立於 demo 與 public-record bundle 的 biography write/read contract：

- **BiographySourceAttempt**：source class、method、完整 URL/query、attemptedAt、HTTP outcome、raw path、byte length、SHA-256、excerpt、failure、timestamp quality 與 `isNegativeEvidence: false`。
- **BiographyIdentityObservation**：候選人、來源觀察、stable/external identifier、名稱、jurisdiction/district 與 identity status；name-only merge 不允許。
- **BiographyEvidence**：每筆 claim 的 source、observation、短摘錄與 evidence role。
- **BiographyClaim**：`current-position`、`historical-position`、`historical-candidacy`、`elected-office`、`professional-experience`、`education` 或 `career-event`，並保存 current/historical status、日期、attribution、machine/human/editorial/publication states 與 reviewer metadata。
- **BiographyReviewDataset / BiographyApprovedDataset / BiographyPublicationSnapshot**：待審 packet、相容 approved 投影與唯一 public static publication snapshot；pending 或 conflicted claims 不會被 read model 暴露。

2026-11-06 retained-source measurement：106 candidates、92 source attempts、64 observations、897 claims、897 evidence、9 open identity conflicts；9 candidates 有 conservative claims，88 candidates 無 conservative match。所有 claims 仍 machine-validated、human/editorial 0，approved compatibility records 與 published records 皆為 0。四位 pilot 候選人的 405 筆 claims 另有 bounded release audit 與 12 筆等量 review queue。

## Scoped enrichment entities

`src/data/enrichment/schema.ts` 與 `data/enrichment/` 為 17 位指定候選人的隔離研究 contract，不覆寫 106-candidate biography dataset，也不被 production read model 載入：

- **EnrichmentSourceAttempt / EnrichmentSourceCheck**：保存六類別嘗試、method/URL/時間/HTTP 結果、raw path、byte length、SHA-256、timestamp quality、failure 與 `isNegativeEvidence: false`。
- **EnrichmentIdentityObservation / EnrichmentEvidence / EnrichmentClaim**：每個 claim 連結候選人、source、observation 與 evidence；`isNameOnlyMatch` 永遠為 false，保留 preliminary、number-drawn、formal pending 等 roster semantics。
- **EnrichmentAudit / EnrichmentReviewItem / EnrichmentReviewPacket**：完整 17 × 6 matrix、coverage gaps、blockers、duplicate/overlap group、review state 與獨立 verification。沒有證據的 category 以 neutral gap 保存，不推論不存在。
- **EnrichmentApprovedLayer / EnrichmentPublishedLayer**：目前是 `empty-until-authorized-publication`；scoped claims 不會流入 `data/published/2026/candidate-biographies.json`。

2026-11-07 measured scoped state：17 candidates、102 audits、588 source attempts、31 source records、198 observations、143 claims/evidence；42 audits 有 claims、60 是 neutral no-evidence；8 candidate-statement、93 institutional-record（另有 42 news-report attribution）、0 identity conflicts、1 exact duplicate group。claim categories 為 basic-biography 100、policies 8、public-records 2、news 10、relationships 1、timeline 22；human/editorial/published 都是 0。

詳見 `docs/SCOPED_ENRICHMENT.md`。

`src/data/enrichment/review-publication.ts` 提供 scoped blocker analysis、claim-plus-gap review queue、publication readiness matrix、13 筆 stratified verification records 與 governed scoped gate。2026-11-07 狀態為 107 blocker rows／75 affected audits、203 queue items（143 claims + 60 gaps）、0 machine-remediated、0/143 gate eligible；duplicate group `enrich-duplicate-001` 保留 `enrich-claim-0082` 與 `enrich-claim-0083`，不靜默合併。這些 review-only entities 不進既有 `BiographyPublicationSnapshot`。

`src/data/enrichment/ai-audit.ts` 與 `reports/independent-ai-review.json` 保存 claim-level audit finding、兩輪 machine method、source/evidence/identity refs、comparison 與 ACP unavailable limitation。第一輪 4/139/0、第二輪 2/141、141 agree/2 disagree、0 corrections、149 blocker findings；這些是 machine audit，不是 reviewer decision，且不改變 approved/published layers。

`src/data/enrichment/semantic-review.ts` 與 `reports/semantic-review-*` 保存真正模型執行的 packet、invocation、精確引用、A/B comparison、failed invocation 與 provider accounting；每一筆 semantic comparison 都保留 `requiresHumanDecision: true`，不可推導 approval 或 publication。

`src/data/enrichment/automated-policy.ts` 與 `automated-publication.ts` 分離 machine decision provenance 與 reviewer-free public records。2026-11-07 的 policy snapshot 覆蓋 143 筆 decisions：1 machine-approved/public、142 rejected；只有 historical basic-biography 的 education／historical-position／professional-experience，institutional KCC/立法院直接證據，且 A/B `supported` + `full-agreement` 才可通過。71 disagreement dispositions、25 correction targets 與 wrong-subject claim `enrich-claim-0111` 均不公開；source SHA/byte length、packet checksum 或 identity 條件變動會使 record 失效。詳見 `docs/AUTOMATED_PUBLICATION.md`。

## Political career timeline entities

`src/data/political-career/schema.ts` 定義 `PoliticalCareerDataset`：公職任期（`officeTerms`）、政治活動（`activities`）、106 列 coverage 與 review 限制；由 `scripts/political-career/build.ts` 離線產生 `data/approved/2026/political-career.json`，`npm run validate:political-career` 驗證來源、日期、歸屬與保留快照。詳見 `docs/POLITICAL_CAREER.md`。

## Existing content entities

`Person`, `Candidacy`, `ElectoralDistrict`, `Position`, `Policy`, `PublicRecord`, `NewsArticle`, `PersonRelationship`, `TimelineEvent`, `EvidenceSource`, `CharacterVisualConfig` 仍保留給 demo 與既有 read model；新的 official public-record ingestion 使用上述 claim/evidence schemas，不把 demo fixture 混入官方 bundle。

## Validation and identity

- stable IDs 在每一 collection 唯一。
- candidate → district、district/candidate → source 必須存在。
- person identity 與 election participation 分離，未來可同一人有多次 candidacy。
- 不以行政區名稱推論選舉 constituency；使用 CEC constituency PDF 定義。
- missing information 不是 negative finding。
