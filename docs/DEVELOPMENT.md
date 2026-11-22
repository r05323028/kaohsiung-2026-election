# 開發

## 環境與指令

- Node.js 22.23.4 以上、npm；npm ci 後以 npm run dev 啟動。
- 首次跑瀏覽器測試：npx playwright install chromium。
- npm run typecheck：Astro／TypeScript 檢查。
- npm run lint：Biome 檢查 src/、scripts/、tests/ 與 Playwright 設定。
- npm test：Vitest。
- npm run test:e2e：Playwright。
- npm run build：validate:all → Astro build → 公開文案檢查。
- npm run build:astro：只產生靜態輸出；單獨執行 validate:profile-copy 前先執行它。
- npm run build:pages：部署用 Astro build + 公開文案檢查。
- LIKENESS_PREVIEW=1 npm run dev 後開 ?likenessPreview=1，可在市景中目視尚未核可的 likeness 頭像：dev-only 路由 /__dev/likeness/ 只讀 data/avatars/likeness/kits，不寫入 review.json 或 loadable.json，production bundle 不含此路由。

## 驗證分組

npm run validate:all 完全離線執行：

- validate:data、validate:official、validate:ballot-numbers、validate:constituencies、validate:political-family
- validate:public-records、validate:full-roster、validate:research、validate:public-record-enrichment、validate:public-records-coverage
- validate:policy-research、validate:candidate-policies、validate:political-career、validate:policy-career
- validate:biographies、validate:basic-profiles、validate:news、validate:avatars、avatars:likeness:validate
- validate:profile-coverage、validate:profile-copy 與 typecheck

驗證器讀取已提交的資料；本機診斷與量測輸出到 gitignored 的 .cache/reports/，不依賴或產生提交的報告目錄。

## 研究與資料更新

抓取與 adapter 是明確的 pre-build 操作；建置和驗證不連網。常用流程：

- 官方名冊：更新 raw snapshot／manifest → validate:official → 必要時執行 roster merger。
- 公開紀錄：records:discover → records:ingest → records:coverage；驗證使用 validate:full-roster。
- 全名冊研究：research:execute → research:validate → research:verify。
- 基本資料：basic:queue → basic:seed → basic:merge → basic:publish → basic:report。
- 政策：policy:research → policy:build → policy:report。
- 新聞：news:discover → news:verify；raw discovery snapshots 使用日期目錄保存，不使用自動發布引擎。
- 從政歷程：fetch scripts → political-career:build → political-career:report。
- 政策／歷程分類：policy-career:build 讀取決定性 curation overrides。
- 家族關係：political-family:generate；發布資格由獨立驗證、職務證據與完整性規則決定。
- 角色資產：avatars:generate → avatars:validate；likeness 管線另有照片授權與 checksum 檢查。

更新資料時保留 raw bytes、manifest、來源 URL 與 SHA-256。沒有證據的欄位保持未知；pending、unverified、conflict 與 source-unavailable 不得被轉成負面事實或公開 claim。

## Pull Request 與 CI

GitHub Pull Request 是內容、資料、程式與 workflow 變更的人工審查入口。PR 描述應列出：

1. 變更範圍與受影響候選人／資料集；
2. 來源、provenance、checksum 與生成步驟；
3. 已執行的 typecheck、lint、test、validator 與 build；
4. withheld、衝突、來源不可達與未嘗試範圍。

CI 的 required checks 驗證 schema、引用、checksum、決定性輸出與靜態 build；CI 不作內容裁決，也不維護本機審查佇列。.github/CODEOWNERS 與 Pull Request template 定義資料變更的 reviewer 責任。分支保護與 required approvals 必須在 GitHub repository settings 設定。

## 測試策略

資料／schema／read model 變更至少跑 typecheck、相關 validator、Vitest；公開路由、互動或可及性變更再跑對應 Playwright。視覺與效能腳本輸出至 .cache/reports/。驗證失敗時修正資料或程式，不放寬無關的驗證器。

## 疑難排解

- checksum 失敗：新增來源快照、重跑 adapter 與對帳，不要就地改 checksum。
- validate:profile-copy 找不到 dist/：先跑 npm run build:astro。
- E2E 缺少瀏覽器：安裝 Chromium。
- 子路徑連結失效：使用 withBase()／paths utilities，不要硬編碼根路徑。