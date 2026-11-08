# Architecture

## Product boundary

港都人物誌是 build-time generated、可部署到 GitHub Pages 的靜態網站。Astro 產生所有 HTML；React 只在首頁探索器與人物 tabs 掛載。沒有 API server、資料庫、認證、runtime CMS、serverless function 或外部 AI inference。

## Source-to-publication pipeline

```text
CEC/KHEC primary documents
        |
        v
checked-in data/raw + source manifest + SHA-256
        |
        v
src/data/official/adapters.ts
        |
        v
 data/normalized -> data/review (human decision)
        |
        v
 data/approved (canonical, publishable only)
        |
        +--> validateOfficialDataset + source/reference gates
        +--> reports/election-reconciliation.{json,md}
        |
        +--> public-records coverage audit -> review queue/reports
        +--> candidate research execution -> normalized/review/approved + reports
        +--> multi-source biography execution -> raw/normalized/review/approved + reports
        |
        v
Astro getStaticPaths() -> dist/ static HTML
```

`npm run build` 依序執行 demo、official、selected public-record、full-roster coverage、candidate-research、biography validation、editorial publication-gate validation 與 bounded release verification，再執行 `astro check` 與 `astro build`。所有建置驗證不連線，確保同一組快照可重現同一組 HTML/report。

## Data boundaries

- `src/data/fixtures.ts` 與 `src/data/schema.ts` 是虛構 demo 的獨立驗證邊界。
- `data/approved/2026/kaohsiung-election.json` 是官方選舉頁面的 canonical input；`data/approved/2026/kaohsiung-public-records.json` 是選定人物公共紀錄的 canonical input；`data/approved/2026/candidate-public-record-research.json` 是完整名冊研究執行的靜態 read model，仍標示人工審查 pending；`data/approved/2026/biographies.json` 是相容投影，目前為空集合；真正通過人工、編輯與 publication gate 的 claims 才能由 `editorial:publish` 寫入 `data/published/2026/candidate-biographies.json`。
- `src/data/index.ts` 只在最後組合 `officialCandidateProfiles`、`officialDistricts` 與 demo views；資料內容不互相 fallback。
- `src/data/public-records/index.ts` 先以 manifest source IDs 驗證 public-record dataset，再按 person ID 建立 bundle；沒有 bundle 的官方人物不會 fallback 到 demo records。`src/data/biographies/index.ts` 只讀並驗證 `data/published/2026/candidate-biographies.json`；未出版的 claims、review packet 與 pending 數量永遠不會流入頁面、search index、metadata 或 WebGL。
- `CandidateProfileView` 以可選 `isDemo`/`publicationStatus` 支援共用視覺元件，但公開 copy 依資料來源分層。

## Runtime regions

### Shared shell

`src/layouts/BaseLayout.astro` 管理 Traditional Chinese、SEO metadata、canonical URL、Open Graph、JSON-LD、skip link、導覽與 footer。`src/utils/paths.ts` 生成 base-path-safe links。

### Homepage explorer

`src/components/CityExplorer.tsx` 提供選舉類型/資料層篩選、選舉區、靜態搜尋、鍵盤可用人物清單、角色選擇、profile panel、loading/error 與 WebGL fallback。市長、普通市議、原住民族選區使用 official district metadata；示範資料保留獨立 filter。

`MiniCityScene` 以 `React.lazy` 延後載入 R3F，使用 orthographic camera、demand frame loop、有限 OrbitControls、DPR 上限與 reduced-motion。所有關鍵事實在 canvas 外的 HTML。

### Static pages

`src/pages/districts/[slug].astro` 與 `src/pages/candidates/[slug].astro` 對 combined validated views 執行 `getStaticPaths()`。直接開啟/重新整理不依賴 runtime router；每個候選人與選舉區都有 HTML。

## Publication gate

`validateOfficialDataset()` 驗證 Zod shape、唯一 IDs、source/district references、approved qualification，以及 `drawn/not-published` 不得宣稱 final。`scripts/validate-official-data.ts` 額外驗證原始快照 checksum、CEC 五人資格名冊、KHEC PDF metadata、approved roster order 與 reconciliation。`scripts/validate-public-records.ts` 另外驗證 KCC 快照 checksum、claim/evidence/record references、selected-person identity resolution、review gate 與 coverage/quality reports；`scripts/public-records-coverage.ts` 對 106 位官方候選人建立 6 類別 audit、source checksum、checkpoint、review queue 與 full-roster report；`scripts/execute-candidate-public-record-research.ts` 重新解析保留的 CEC C1/T 快照，檢查 636 格研究審計、來源 checksum、保守姓名衝突、review packet 與獨立抽樣報告。所有 validator、research command 與 coverage command 都是 offline-only。

## Biography research boundary

`src/data/biographies/schema.ts` 將 source attempt、identity observation、evidence、current/historical position、historical candidacy、elected office、professional experience、education 與 career event 分開保存；日期可為 null，未知不會被轉成否定結論。`scripts/execute-biography-research.ts` 只重開已保存快照，使用 KCC stable member ID、MOI external identifier、jurisdiction 與 district 等交叉證據進行 conservative matching；不使用 name-only merge。

`data/normalized/2026/biographies.json` 保留 106 位 audit、92 個 source attempts、64 個 observations、897 claims/evidence 與 9 個 open conflicts；`data/review/2026/biographies-review.json` 保留每筆待審 claim，reviewerId/reviewedAt 維持 null；`data/approved/2026/biographies.json` 是相容投影，不是公開輸入；`data/published/2026/candidate-biographies.json` 才是唯一 public biography input，由 `scripts/editorial-biography.ts publish` 在 publication gate 通過後 deterministic 產生。`scripts/validate-biography-data.ts` 檢查 schema、精確 roster audit coverage、review claim coverage、approved-only research state 與所有 raw snapshot SHA-256，`editorial:validate` 另檢查 reviewer/decision/gate/snapshot integrity。

## Bounded release preparation boundary

`scripts/editorial-release.ts` 只讀四位既有 pilot 候選人的 405 筆 normalized claims 與已保留 raw snapshots。它保留四筆 `服務政見` 的 correction lineage，依 canonical attribution 分類 claims，檢查 temporal precision/currentness/source freshness，偵測 duplicate/possible-overlap 而不刪除或合併資料，並等量選取 12 筆本機 review queue。2026-11-06 結果為 395 basic-biographical-fact、4 current-position、4 candidate-statement、2 administrative-outcome；399 筆 ready for human review、6 筆 blocked、0 consolidation groups。`data/editorial/release/` 與 `reports/editorial-release-*` 不是 public input；真實 reviewer decisions 仍必須通過原有 publication gate。

## Executed research boundary

`data/normalized/2026/candidate-public-record-research.json` 保留此次實際研究操作的每候選人／分類嘗試、原始來源列、retrieved 時間、SHA-256、結果與失敗／未嘗試理由；`data/approved/2026/candidate-public-record-research.json` 只是靜態 read model，不代表人工或編輯核准。研究 mapper 只把研究狀態與 CEC 來源連結附加到 official profile，不把 pending claims 當成已審核公共紀錄，也不將 CEC 空白欄位視為負面證據。9 位候選人的官方姓名字元衝突保留在 review queue，未做 name-only merge。

## Public-record boundary

`src/data/public-records/schema.ts` 將 claim、evidence、position、activity、news、relationship、timeline、identity resolution 與 conflict 分開保存。KCC 議會來源支持目前職務與「曾出現在機關總質詢摘要」這類 documented participation；沒有來源的政策、成就、家庭或政治關係維持空集合。所有公開的 public-record tabs 都同時顯示 attribution、verification/review 狀態、證據位置與來源連結。

## Full-roster coverage boundary

`data/normalized/2026/full-roster-public-record-coverage.json` 是候選人／分類 coverage audit，不是候選人公共紀錄本身。它保留 source-retrieved、not-attempted、identity、checksum、claim revision 與 review/publication 狀態；`not-attempted` 不代表不存在，`publishedRecordCount` 只代表 source-backed static HTML display，不代表 editorial approval。`data/review/2026/full-roster-public-records-review.json` 的 reviewer 欄位維持 null。批次支援 deterministic filters、dry-run、重試上限、bounded concurrency、resume checkpoint 與 atomic writes，絕不在 R3F scene 傳入 audit payload。

## Scoped candidate enrichment boundary

`data/enrichment/` 是 2026-11-07 的隔離研究資料層，專門涵蓋 12 位第 4 選區候選人與 5 位市長候選人。`scripts/execute-scoped-enrichment.ts` 只讀已捕獲的 CEC/KHEC、KCC、立法院、政府與可歸因新聞快照，不在建置時連線；它保存 17 × 6 個 category audits、588 次 source attempts、31 個 unique source records、198 個 observations、143 筆 claims/evidence、checksum、neutral gaps、duplicate groups 與獨立重開樣本。

2026-11-07 結果為 42 個有 claims 的 audits、60 個 no-evidence audits、1 個 exact duplicate group（保留兩筆待人工判斷，未刪除或合併）；所有 143 筆 claim 都是 pending，reviewer 欄位為 null，approved/published 層為空。`validate:enrichment` 會重開 raw snapshot、檢查 17 個 canonical IDs、102 個 audit keys、`isNameOnlyMatch: false` 與 `isNegativeEvidence: false`。Production pages、search、metadata、WebGL 與既有 biography/editorial read model 不 import 此層；只有具授權的人工決定才能進入既有 editorial gate。

詳見 `docs/SCOPED_ENRICHMENT.md`。

`review-and-publish-zuoying-mayoral-profiles` 只在 local/editorial mode 載入 scoped review packet、blocker analysis、queue、readiness 與 verification reports，並重用 `/editorial-review/` 的 reviewer/decision vocabulary。107 個 blocker rows、203 個 queue items 與 13 個獨立樣本都留在本機審查層；`evaluateScopedEnrichmentPublicationGate()` 是受治理的 scoped adapter，既有 `evaluateEditorialPublicationGate(...)` 未修改。Production build 不 import `data/enrichment/`，scoped approved/published layers 為空時不會把 claims 放入 profile tabs、search、metadata 或 bundles。詳見 `docs/SCOPED_REVIEW_PUBLICATION.md`。

`independently-audit-zuoying-mayoral-evidence` 在同一隔離層對 143 筆 claims 執行兩個獨立結構的離線 raw-reopen/rule passes：第一輪為 4 machine-verified、139 needs-review、0 unsupported；第二輪為 2 machine-verified、141 needs-review；141 筆一致、2 筆差異、0 source checksum mismatch。兩次 ACP reviewer 嘗試因工具不可用而無法提供 findings，不能稱為 agent、human 或 editorial review；報告與 149 個 blocker findings 只在 local `/editorial-review/` 載入。詳見 `docs/INDEPENDENT_AI_AUDIT.md`。

`execute-semantic-evidence-adjudication` 是獨立的模型語意審查層：每筆 claim 先固定 checksum evidence packet，再由 Reviewer A/B 分開執行結構化判讀；引用必須是 packet 中的精確連續文字，失敗、無法使用與 provider/agent 限制都保留。semantic findings 只供 local editorial workspace，不進 production read model、approved/published layers 或任何 publication gate；詳見 `docs/SEMANTIC_EVIDENCE_ADJUDICATION.md`。

`autonomous-candidate-content-publication` 是額外、版本化且 fail-closed 的 machine path：它逐一產生 143 筆 automated decisions，只有 1 筆低風險、歷史、institutional、`full-agreement` claim 通過 `automated-editorial-policy-v1`，142 筆被阻擋。71 個 disagreement、25 個 correction targets 與 `enrich-claim-0111` 的 wrong-subject verdict 都保留為排除／withdrawal 條件；public snapshot 不含 reviewer、model run、raw path 或 packet metadata。它不改 global/scoped human gates；詳見 `docs/AUTOMATED_PUBLICATION.md`。

## Character asset boundary

`CharacterVisualConfig` 只保存 renderer、可選 modelAsset、位置、palette、配件與動畫設定；政治資料不依賴 Three.js class。官方切片目前只使用等價的 neutral procedural visuals，未建立真實人物 likeness。四個虛構 demo candidacies 透過 `src/data/avatars/manifest.json` 明確映射到 `public/assets/avatars/` 的 GLB；`resolveAvatar()` 對未映射、缺檔或不允許發佈的資產回到 procedural fallback。資產生成、checksum/GLB 結構驗證與開發預覽的邊界詳見 `docs/CHARACTER_ASSETS.md`。

## Performance and resilience

R3F lazy-load、shared/simple geometry、demand rendering、CSS pixel-ratio 上限、WebGL detection、CSS fallback、React error boundary、loading status、reduced motion、accessible HTML list。GLB 只在互動城市或開發預覽需要時載入；模型失敗不阻塞 HTML 候選人資訊。資產目前共 5 個 GLB、292664 bytes、5540 triangles，這是生成快照的量測值，不是所有裝置的效能保證。未來增加正式資料仍需維持 build-time only。
