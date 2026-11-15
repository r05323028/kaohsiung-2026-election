# 開發

## 環境

- Node.js 22.23.4 以上（Astro 7 的最低需求；CI 使用 Node 22）、npm。
- `npm ci` 安裝依賴。`npm run dev` 在 <http://localhost:4321> 啟動。
- 首次跑 E2E 需 `npx playwright install chromium`。

## 指令

| 指令 | 作用 |
| --- | --- |
| `npm run dev` / `npm run preview` | 開發伺服器／預覽建置結果 |
| `npm run build` | `build:verified`：完整離線驗證 → Astro build → 公開文案驗證（數分鐘） |
| `npm run build:astro` | 只產生靜態輸出，不做資料驗證（畫面調整用） |
| `npm run build:pages` | `build:astro` + `validate:profile-copy`（需先有 `dist/`） |
| `npm run typecheck` | `astro check` |
| `npm run lint` / `lint:fix` | Biome（src、scripts、tests、playwright.config.ts） |
| `npm test` / `test:watch` | Vitest |
| `npm run test:e2e` | Playwright（含 `@critical` 標記可篩選） |

`npm run build` 的順序是 `validate:all` → `build:astro` → `validate:profile-copy`。最後一步讀取 `dist/` 的公開頁面，因此必須在 Astro build 之後；單獨執行 `validate:profile-copy` 前要先建置。

## 驗證分組

`validate:all` = 離線資料／發布驗證器、全名冊候選人稽核產生與驗證 + `typecheck`，全部讀取已提交的 `data/`、`reports/` 與 `src/`，不連網；任一失敗即中止建置。

| 分組 | 指令 |
| --- | --- |
| 基礎資料 | `validate:data`、`validate:official`、`validate:ballot-numbers`、`validate:constituencies`、`validate:political-family`、`validate:profile-coverage` |
| 公開紀錄與研究 | `validate:public-records`、`validate:full-roster`、`validate:research`、`validate:public-records-coverage`、`validate:public-record-enrichment` |
| 政策與歷程 | `validate:policy-research`、`validate:candidate-policies`、`validate:political-career`、`validate:policy-career` |
| 履歷與編輯 | `validate:biographies`、`editorial:validate`、`pilot:verify`、`release:verify`、`validate:enrichment`、`ai-audit:verify`、`semantic:verify`、`scoped-review:verify`、`automated:verify`、`remediation:verify` |
| 其他 | `validate:avatars`、`validate:basic-profiles`、`validate:news`、`typecheck` |

各驗證器的職責見 [ARCHITECTURE.md](ARCHITECTURE.md)；發布語意見 [EDITORIAL_AND_PUBLICATION.md](EDITORIAL_AND_PUBLICATION.md)。

## 資料與研究指令

研究與抓取是**明確的 pre-build 操作**，會連網並寫入 `data/raw/` 或研究層；一般建置與驗證不會執行它們。

| 領域 | 指令 |
| --- | --- |
| 官方名冊 | `npm run validate:official`（對帳）、`scripts/merge-council-roster.ts` |
| 公開紀錄 | `records:discover` → `records:ingest` → `records:review-report` → `records:coverage` |
| 全名冊研究 | `research:execute` → `research:validate` → `research:review` → `research:verify` |
| 基本資料 | `basic:queue` → `basic:seed` → `scripts/basic-profile/draft-batch.ts` → `check-batch.ts` → `basic:merge` → `basic:publish` → `basic:report` |
| 政策 | `policy:research` → `policy:build` → `policy:report` |
| 新聞 | `news:discover` → `news:verify` → `news:build` |
| 從政歷程 | `political-career:fetch` / `:fetch-legislative` / `:fetch-positions` / `:fetch-projects` → `political-career:build` → `political-career:report` |
| 政策／歷程分工 | `policy-career:build`（讀 `data/policy-career/2026/curation.json`） |
| 家族關係 | `political-family:generate` |
| 角色資產 | `avatars:generate` → `avatars:validate` |
| 編輯審查 | `editorial:prepare` → `EDITORIAL_REVIEW=true npm run editorial:review` → `editorial:apply` → `editorial:publish` |
| scoped 研究 | `enrichment:*`、`ai-audit:*`、`semantic:*`、`scoped-review:*`、`automated:*`（皆離線、隔離於 `data/enrichment/`） |

抓取後必須提交原始快照與 manifest；不要只提交解析結果。更新程序見 [DATA_AND_PROVENANCE.md](DATA_AND_PROVENANCE.md)。

## CI

| Workflow | 觸發 | 內容 |
| --- | --- | --- |
| `.github/workflows/ci.yml` | push／PR | Quality（`validate:all`、`lint`、`test`）、Static build（`build:pages`，另以 `BASE_PATH=/kaohsiung-civic-stories/` 驗證 `build:astro`）、Critical browser（`@critical`，2 shards，權重 60:80，1 worker，retries 1） |
| `.github/workflows/e2e.yml` | `main` push、每日 18:00 UTC、手動 | 全量 Playwright，2 shards，權重 38:68，1 worker，retries 2；失敗才上傳 artifact |
| `.github/workflows/deploy-pages.yml` | `main`、手動 | Node 22 → `BASE_PATH=/kaohsiung-2026-election/`、`SITE_URL=https://r05323028.github.io` → `build:pages` → GitHub Pages |

同一 PR 的新推送會取消舊 run；`main` 與 Pages 部署不取消。需要在本機重現 shard 時，以 `PWTEST_SHARD_WEIGHTS` 指定相同權重。

## 測試策略

- Vitest：資料 schema、adapter 決定性、驗證器、read model、城市幾何與模擬、編輯閘門。
- Playwright：關鍵瀏覽器路徑（首頁城市、個人分頁、選舉區頁、HUD、無障礙與 reduced motion）。文件或純資料變更不需要跑全量 E2E。
- 視覺與效能量測腳本（`scripts/capture-*.ts`、`measure-*.ts`）輸出到 `reports/`；報告是生成物，不進 `docs/`。

## 新增一位候選人或一筆來源

1. 取得並保存原始快照，計算 SHA-256，登記 manifest。
2. 更新 adapter／normalized 資料；確認相同位元組得到相同輸出。
3. 在 `data/review/` 記錄審查狀態與未解問題。
4. 對帳通過後才寫入 `data/approved/`；需要公開的 claim 走對應閘門與快照。
5. 執行 `npm run validate:all`、`npm test`；必要時補單元測試。`validate:all` 會以 deterministic check 驗證 `reports/candidate-roster-audit/` 的五份輸出是否新鮮，再執行結構驗證；需要重建時先執行 `npm run candidate-audit:generate`，不可手改其輸出。
6. 若改變公開行為，更新對應文件（不要新增文件）。

## 疑難排解

| 症狀 | 處理 |
| --- | --- |
| 建置因 checksum 失敗 | 來源已變更：新增快照、重跑 adapter、重新對帳，不要就地改 checksum |
| `validate:profile-copy` 找不到檔案 | 先 `npm run build:astro` 產生 `dist/` |
| E2E 因缺少瀏覽器失敗 | `npx playwright install chromium` |
| 頁面連結在子路徑失效 | 使用 `withBase()`／paths 工具，不要硬編碼根路徑 |
| 編輯工作區看不到資料 | 需 `EDITORIAL_REVIEW=true` 或 dev 模式，且 registry／packet 存在 |

## 目錄

```text
data/           raw、normalized、review、approved、published 與各研究層
src/data/       各資料層的 schema、adapter 與 read model
src/world/      地理、六角城市、模擬、角色幾何
src/components/ 城市、個人分頁、編輯工作區
src/pages/      靜態路由
scripts/        抓取、建置、驗證、稽核與視覺證據腳本
tests/          Playwright E2E
openspec/       變更紀錄與能力規格
reports/        生成的稽核與量測
docs/           本目錄，長期維護文件
```
