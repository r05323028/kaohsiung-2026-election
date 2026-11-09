# 港都人物誌 Kaohsiung Civic Stories

港都人物誌是 2026 高雄市長與市議選舉的**非黨派、來源導向互動政治百科**。網站以原創迷你城市作為閱讀入口，但城市場景不代表官方地圖或選舉區界線。

目前發布兩種明確分層的資料：

- **官方核准切片**：截至 `2026-11-05`，包含官方選舉區定義、CEC 審定的五位高雄市長候選人，以及 KHEC 抽定表轉錄的 101 筆市議員預公告列名。所有號次標示為「抽定、非正式公告」；政黨與完整人物資料未刊載。
- **虛構示範資料**：四位人物與兩個示範選區，用來保留 3D/互動垂直切片；每頁明確標示「虛構示範」，不與官方資料混用。

## 技術堆疊

- Astro static output + TypeScript strict mode
- React islands + React Three Fiber / Three.js / Drei
- GSAP for restrained focus and panel transitions
- Tailwind CSS v4 through the official Vite plugin, with project CSS tokens
- Zod build-time validation and deterministic offline adapters
- Vitest unit tests, Playwright smoke tests, Biome checks
- GitHub Actions CI; no deployment workflow

無 Node.js production server、API、資料庫、認證、runtime CMS、serverless function 或外部 AI inference。

## 開發

需要 Node.js 22 或更新版本與 npm。

```bash
npm install
npm run dev
# http://localhost:4321
```

常用檢查：

```bash
npm run validate:data       # 虛構 fixture schema/reference gate
npm run validate:official   # official snapshot/checksum/approval/reconciliation gate
npm run validate:public-records # KCC public-record checksums, evidence, review gate, reports
npm run validate:full-roster  # 106-candidate × 6-category audit and reports
npm run research:execute     # execute against retained official snapshots (offline at build time)
npm run research:validate    # validate normalized/approved research and reports
npm run research:review      # regenerate the pending human-review packet
npm run research:verify      # independently reparse a stratified sample
npm run biography:execute    # regenerate biography layers from retained multi-source captures
npm run biography:normalize  # rebuild the normalized biography layer
npm run biography:review     # regenerate the pending human-review packet
npm run biography:validate   # validate biography layers, review coverage and raw checksums
npm run biography:verify     # independently reopen/reparse biography source material
npm run openspec:validate     # strict validation of the biography research change contract
npm run openspec:validate:editorial # strict validation of the editorial publication contract
npm run openspec:validate:pilot    # strict validation of the bounded pilot contract
npm run openspec:validate:release  # strict validation of the release preparation contract
npm run editorial:prepare    # generate the local-only editorial review packet
npm run editorial:review     # start the local review UI with EDITORIAL_REVIEW=true
npm run editorial:validate   # validate registry, decisions, packet and publication gate
npm run editorial:apply -- --decisions path/to/export.json # validate and import browser decisions
npm run editorial:publish    # generate the deterministic static publication snapshot
npm run editorial:report     # regenerate editorial, identity and publication-gate reports
npm run pilot:prepare        # generate the bounded real-candidate editorial pilot reports
npm run pilot:verify         # verify pilot source hashes and report freshness
npm run pilot:report         # explicit alias for pilot report generation
npm run release:prepare      # prepare the bounded four-candidate release audit
npm run release:verify       # recheck release reports and raw source checksums
npm run release:report       # explicit alias for release report generation
npm run avatars:generate     # regenerate deterministic fictional GLB assets
npm run avatars:validate     # validate GLB headers, hashes, clips and manifest mappings
npm run avatars:preview      # start the local developer-only avatar preview
npm run ai-audit:execute    # audit all 143 scoped claims with two offline raw-reopen passes
npm run ai-audit:validate   # validate claim coverage and unchanged source snapshots
npm run ai-audit:verify     # rerun and compare the persisted audit
npm run ai-audit:report
npm run semantic:prepare   # rebuild immutable claim evidence packets offline
npm run semantic:adjudicate # validate model runs and write semantic comparison reports
npm run semantic:validate
npm run semantic:verify    # require 143 valid Reviewer A/B findings and 143 pairs
npm run automated:execute   # fail-closed machine publication policy for scoped claims
npm run automated:validate
npm run automated:verify
npm run automated:report
npm run openspec:validate:automated
npm run openspec:validate:ai-audit
npm run openspec:validate:semantic
npm run records:discover    # offline discovery audit (supports filters/dry-run/resume)
npm run records:ingest       # promote discovery to normalized coverage
npm run records:review-report
npm run records:coverage
npm run typecheck           # astro check
npm run lint                # Biome
npm test                    # Vitest
npm run build               # all validation + typecheck + static build
npm run test:e2e            # Playwright; needs a local Chromium install
npm run preview             # preview dist/ output
```

`npm run validate:official` 不連線；它只讀 `data/raw/`, `data/approved/` 與 `data/official-source-manifest.json`，並產生：

- `reports/election-reconciliation.json`
- `reports/election-reconciliation.md`
- `reports/public-record-coverage.json` / `.md`
- `reports/public-record-quality.json` / `.md`
- `reports/full-roster-coverage.json` / `.md`

`npm run validate:public-records` 只讀 `data/raw/official/2026/public-records/`、normalized/review/approved public-record JSON 與 manifest，不連線；它目前回報 3 位選定人物、6 個 claims、16 筆 records，且人工審查仍為 pending。

`npm run validate:full-roster` 只讀官方 approved roster、既有 public-record canonical layer 與 manifest，建立 106 位候選人 × 6 類別 = 636 個 audit slots。`2026-11-05` 快照中有 8 個類別 slot 使用已保留來源、16 筆 source-backed static records；其餘 628 個 slot 標為 `not-attempted`，明確表示本批次沒有候選人專屬快照，不表示不存在資料。報告與 review queue 維持 `pending-human-review`，不產生完整度排名。

`npm run research:execute` 不連線，會對已保留的 CEC C1/T 候選人 JSON 快照執行 106 位候選人 × 6 類別 = 636 個真實研究審計格；它保留來源 URL、擷取時間、SHA-256、原始列位置、嘗試結果與 9 筆姓名字元衝突。`npm run research:validate` 產生 `reports/full-roster-research.json/.md` 與 `reports/research-quality.json/.md`；`npm run research:verify` 會重新解析原始 CEC 快照，抽查市長、第 4 與第 13 選區及衝突列，產生 `reports/research-independent-verification.json/.md`。這些資料仍是機器驗證、人工審查 pending，不把未嘗試視為不存在，也不把 CEC 空白欄位視為負面證據。

## 靜態部署

```bash
BASE_PATH=/your-repository/ SITE_URL=https://example.com/ npm run build
```

`dist/` 可直接部署到 GitHub Pages 或其他靜態主機。不要把 repository name 硬編碼到 asset URL；所有網站連結使用 `BASE_PATH`。

## 路由

- `/`：官方/示範資料共用的城市探索、選舉類型與選區切換、搜尋、角色選擇
- `/districts/`：官方選舉區與虛構示範選區索引
- `/districts/[slug]/`：靜態選舉區頁；市長、普通市議及原住民族 constituency 分開
- `/candidates/[slug]/`：靜態人物頁與六個資訊分類
- `/editorial-review/`：僅本機啟用的履歷身分／證據審查工作區，不載入公開導覽
- `/avatar-preview/`：僅開發環境的 GLB 角色資產檢視器，不載入公開導覽

## 專案結構

```text
data/
  raw/official/        checked-in primary-source snapshots and PDFs
  normalized/          adapter output before editorial approval
  review/              human-review decisions and pending scopes
  approved/            compatibility projections and legacy approved layers; not the publication authority
  published/            deterministic static publication snapshot consumed by the public Astro build
  official-source-manifest.json
reports/               deterministic reconciliation, research and biography reports
src/data/
  fixtures.ts          fictional demo input (kept isolated)
  schema.ts            demo/content schemas
  official/            official election schema, adapters, reconciliation, mapper, tests
  public-records/      claim/evidence/coverage/research schemas, KCC/CEC adapters, offline CLIs, bundle API, tests
  biographies/         multi-source biography schemas, adapters, publication-only read model, tests
  editorial/            reviewer/decision schemas, integrity validation, publication gate, local review UI
  avatars/              GLB manifest, strict resolver, fallback mapping and asset tests
  index.ts             combined view for static pages
public/assets/avatars/  generated inspectable fictional GLB assets
src/components/        React explorer, R3F scene, profile tabs, static cards
src/pages/             Astro static routes and getStaticPaths()
scripts/               build-time validation scripts
docs/                  architecture, ingestion, provenance, reconciliation, policy
```

## 官方資料更新原則

1. 只從中央選舉委員會、 高雄市選舉委員會等一手來源取得文件。
2. 保留原始快照、URL、發布日、擷取日與 SHA-256；先更新 `normalized`/`review`，不得直接改 `approved`。
3. 以獨立官方資格名冊與抽定文件互相核對；抽定號次不得標成 final。
4. 人工審查決定經 CLI 驗證並通過 publication gate 後，才由 `editorial:publish` 產生 `data/published/`；再執行離線驗證、reconciliation 與靜態建置。
5. 缺少資料顯示為「目前尚無已查證的資料」或 pending，不推論不存在。

詳見 `docs/DATA_INGESTION.md`、`docs/SOURCE_PROVENANCE.md`、`docs/RECONCILIATION.md`、`docs/CONTENT_POLICY.md`。

## 候選人公共紀錄代表性切片

截至 `2026-11-05`，公共紀錄切片選取李眉蓁（普通市議第 4 選區）、王義雄（平地原住民第 12 選區）與賴瑞隆（市長，刻意保留無資料狀態）。已保存高雄市議會兩份議員身分頁與四份機關總質詢摘要；目前只呈現來源支持的職務、公開參與紀錄、機關新聞 metadata 與時間軸，不把總質詢摘要改寫成政策成就、行政成果或政治關係。

每個 claim 都連到 evidence、來源 ID 與原始官方 URL。canonical public-record layer 的資料標為 `approved-source-backed`，代表通過快照、schema、引用與離線驗證後可供靜態切片使用，不代表人工編審已完成；dataset 的 `review.status` 仍為 `pending-human-review`。賴瑞隆沒有這組 KCC 來源，因此頁面顯示中性「目前尚無已查證的資料」，不代表不存在。

## 候選人履歷研究（2026-11-06）

`npm run biography:execute` 會重新解析已保存的 KCC 與內政部地方公職人員資料快照，並保留立法院、CEC 歷史資料庫應用程式入口與既有 CEC 身分衝突來源的探查結果；建置不連線。最新重建資料共有 92 次 source attempt（90 個有 checksum 的本地快照、2 個規劃但未嘗試的來源）、64 個 identity observations、897 個 machine-validated claims、897 筆 evidence、106 個候選人 audit 與 9 位保留中的身分衝突。可保守配對的候選人為 9 位，另有 88 位沒有保守匹配；這是來源與身份解析的測量結果，不是「沒有履歷」。

目前所有 biography claims 都是 `withheld-pending-review`，human/editorial approval 為 0，reviewer 欄位為 null，`data/published/2026/candidate-biographies.json` 保持空集合。因此官方候選人頁只載入出版快照，不會把 normalized/review 中的機器擷取內容、待審數量或審查封包編入公開 HTML。完整操作、source URL、HTTP 結果、擷取時間品質、raw path、SHA-256、excerpt、失敗與未嘗試原因保留在研究與本機 editorial review 層。

## 首批履歷釋出準備（2026-11-06）

`release-first-approved-candidate-biographies` 對既有四位 pilot 候選人的 405 筆 claims 完成離線重開與來源 checksum 審計。分類為 395 basic-biographical-fact、4 current-position、4 candidate-statement、2 administrative-outcome；399 筆可交給真人審查，6 筆因 currentness 或成果語意阻擋。未發現 exact duplicate 或 possible-overlap，等量 review queue 選取每位候選人 3 筆、共 12 筆。四筆 `服務政見` 已以 `candidate-statement` / `self-reported` 修正，並保留 correction lineage。

這 12 筆仍只是本機 review queue；production reviewer registry、decisions 與 publication snapshot 維持空白，沒有任何真人審查或公開履歷。詳見 `docs/RELEASE_PREPARATION.md` 與 `reports/editorial-release-{candidates.md,readiness.md,quality.md,claim-consolidation.md}`。

## 左營第 4 選區與市長候選人 scoped enrichment（2026-11-07）

`enrich-zuoying-and-mayoral-candidate-profiles` 對 12 位第 4 選區候選人與 5 位市長候選人建立 17 × 6 = 102 個 category audits。離線重開 588 次 source attempt、31 個 unique source records、198 個 identity observations，產生 143 筆 claim/evidence：basic-biography 100、policies 8、public-records 2、news 10、relationships 1、timeline 22。42 個 audit 有 claims，60 個 audit 保持中性的 no-evidence/gap 狀態。

所有 143 筆仍在 scoped normalized/review 層，human/editorial/publication 都是 0；`data/enrichment/approved/` 與 `data/enrichment/published/` 維持空白，且 `src/data` 的 production read model 不引用 `data/enrichment`。來源、checksum、identity、duplicate 與 review packet 詳見 `docs/SCOPED_ENRICHMENT.md` 和 `reports/enrichment-*`；這不是完整人物履歷，也不代表沒有其他資料。

自動化出版的 public snapshot 與 machine decision provenance 分離保存；只有通過 `automated-editorial-policy-v1` 的低風險歷史 institutional claim 才會進入 scoped candidate tab。詳見 `docs/AUTOMATED_PUBLICATION.md`。

`review-and-publish-zuoying-mayoral-profiles` 已在同一個 `/editorial-review/` 加入 scoped review 子面板：107 個 blocker rows（涉及 75 個 audits）、203 個 queue items、13 個 stratified verification samples，scoped gate 目前為 0/143 eligible。使用 `EDITORIAL_REVIEW=true npm run dev` 可依第 4 選區／市長、類別與 readiness 篩選並匯出決策 JSON；匯出不等於核准。詳見 `docs/SCOPED_REVIEW_PUBLICATION.md` 與 `reports/zuoying-mayoral-*`。

`independently-audit-zuoying-mayoral-evidence` 對同一批 143 筆 claims 執行兩道離線 raw-reopen/rule pass：首輪 4 筆 machine-verified、139 筆 needs-review、0 筆 unsupported；第二輪 2 筆 machine-verified、141 筆 needs-review，141 筆一致、2 筆差異，0 筆自動修正，149 個 blocker findings。兩次 ACP reviewer 嘗試因無法取得檔案工具而記為 unavailable；這不是真人或模型核准。報告為 `reports/independent-ai-review.json`、`reports/ai-review-disagreements.md`、`reports/claim-corrections.md`、`reports/remaining-evidence-gaps.md`，只在本機 `/editorial-review/` 顯示。詳見 `docs/INDEPENDENT_AI_AUDIT.md`。

`execute-semantic-evidence-adjudication` 是後續的真正模型語意審查流程：每筆 claim 先以 checksum 固定 packet，再由 Reviewer A/B 分開執行結構化判讀，引用必須是 packet 中的精確連續文字，失敗與 unavailable attempts 原樣記錄。它只能產生 local semantic findings/comparisons，不能取代真人 reviewer、既有 publication gate 或 `data/enrichment/published/`；詳見 `docs/SEMANTIC_EVIDENCE_ADJUDICATION.md`。

`autonomous-candidate-content-publication` 另建立版本化 `automated-editorial-policy-v1` 的 fail-closed machine path。143 筆 scoped claims 目前產生 1 筆 machine-approved/public record、142 筆 rejected；71 個 disagreement、25 個 correction targets 與 wrong-subject `enrich-claim-0111` 都維持阻擋或記錄未套用。唯一公開 claim 是白喬茵的 KCC 歷史專業經驗，日期仍 unknown；human/editorial approval 仍為 0。這條 path 不改既有 gates，也不把 machine provenance 當成真人核准。詳見 `docs/AUTOMATED_PUBLICATION.md`。

## 重要限制與未完成項目

目前沒有真實人物 likeness 或 visual approval；目前 GLB 只包含原創、明確標示為虛構示範的 Three.js primitive avatars。完整高雄地理或 2026-11-17 正式市議員候選人公告資料也尚未完成。

角色資產流程詳見 `docs/CHARACTER_ASSETS.md`；`avatar-preview` 只可在本機開發模式或明確 `AVATAR_PREVIEW=true` 時啟用。全 roster coverage audit 已建立 636 個候選人／分類檢查格，但只有 8 格有已保留來源、16 筆 source-backed static records；628 格仍待離線來源擴充，不能解讀為不存在資料。人工審查、正式公告刷新、完整公共紀錄 coverage 與任何未授權的 public-record expansion 仍是後續工作；所有新資料都必須重新擷取、審查、reconcile，再重建靜態網站。
