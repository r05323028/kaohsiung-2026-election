# 架構

港都人物誌是 **build-time 產生的純靜態網站**：Astro 在建置時讀取已提交的資料，輸出 HTML、CSS 與靜態資產。瀏覽器不呼叫後端 API，也沒有資料庫、認證、CMS、serverless function 或執行期 AI 推論。

## 資料流

```text
官方文件／公開紀錄
  → data/raw/…（不可變快照 + manifest + SHA-256）
  → src/data/<layer>/adapters.ts（決定性解析）
  → data/normalized/…（正規化）
  → data/review/…（人工審查與待處理範圍）
  → data/approved/…（可發布的權威資料）
  → src/data/<layer>（驗證 + read model）
  → Astro getStaticPaths / 元件
  → dist/（GitHub Pages）
```

部分內容層在 approved 之後還有獨立的 **published** 快照（例如 `data/published/2026/candidate-biographies.json`、`candidate-basic-profiles.json`、`candidate-news.json`、`candidate-policies.json`）。公開頁面只讀 published 或 approved 的受控資料，绝不讀 raw、normalized 或 review 層。

## 資料層與讀取模型

| 層 | 位置 | 公開讀取模型 | 說明 |
| --- | --- | --- | --- |
| 官方選舉 | `data/approved/2026/kaohsiung-election.json` | `src/data/official/index.ts` | 唯一 canonical 名冊：16 個選舉區、106 位候選人、來源 manifest 參照 |
| 選舉區幾何 | `src/data/constituencies.ts`、`src/data/geography/` | 同名模組 | 15 個市議員選區 + 市長；38 個行政區對應 |
| 公開紀錄 | `data/approved/2026/kaohsiung-public-records.json` | `src/data/public-records/index.ts` | 已選取的來源支持紀錄；狀態仍為 pending-human-review |
| 傳記研究 | `data/approved/2026/candidate-public-record-research.json` | `src/data/public-records/research-index.ts` | 靜態研究 read model，不是核准 |
| 傳記出版 | `data/published/2026/candidate-biographies.json` | `src/data/biographies/index.ts` | 唯一公開履歷輸入；目前為空 snapshot |
| 基本資料 | `data/published/2026/candidate-basic-profiles.json` | `src/data/basic-profiles/index.ts` | 通過獨立查核的 829 筆主張 |
| 政策主張 | `data/published/2026/candidate-policies.json` | `src/data/policy-research/` | 原文連續引文 + 獨立查核 |
| 相關新聞 | `data/published/2026/candidate-news.json` | `src/data/news/index.ts` | 中性 metadata，213 篇 |
| 從政歷程 | `data/approved/2026/political-career.json` | `src/data/political-career/index.ts` | 任期、活動、專案、提案、表決 |
| 政策／歷程分工 | `data/approved/2026/policy-career-separation.json` | `src/data/policy-career/index.ts` | 每筆政策恰好一個歸屬 |
| 家族從政關係 | `data/published/2026/political-family.json` | `src/data/political-family/` | 需親屬與政治職涯各自證據 |
| 角色資產 | `data/avatars/manifest.json`、`public/assets/avatars/` | `src/data/avatars/index.ts` | GLB 校驗碼與對應，缺省回退程序化角色 |
| 示範資料 | `src/data/fixtures.ts` | `src/data/demo.ts` | 僅測試與資產驗證，全部 isDemo |

示範資料與正式資料是兩條互不回退的路徑：`src/data/index.ts` 同時組合官方與 demo，但官方資料缺失時顯示中性「暫無資料」，不以 demo 補位。各層載入器會先驗證 schema，驗證失敗即建置失敗。

## 前端結構

- `src/layouts/BaseLayout.astro`：zh-Hant 語系、SEO、canonical、Open Graph、JSON-LD、skip link、導覽與頁尾。站內連結一律經 `src/utils/paths.ts` 加上 `BASE_PATH`。
- `src/components/CityExplorer.tsx`：首頁互動層。選舉／圖層篩選、行政區與選舉區切換、靜態搜尋、鍵盤候選人名單、角色選取、個人面板、載入／錯誤／WebGL 不可用狀態。
- `src/components/CityScene.tsx` + `src/world/`：延遲載入的 R3F 正交相機場景、依需求繪製、DPR 上限、有限 OrbitControls、reduced motion。所有事實同時存在於 HTML。
- `src/components/ProfileTabs.tsx`：五個分頁（基本資料、政策主張、相關新聞、從政歷程、家族從政關係），只讀上述 read model。
- `src/pages/`：`index`、`candidates/[slug]`、`districts/index`、`districts/[slug]`、`editorial-review`（僅本機）、`avatar-preview`（僅開發）。

行政區與選舉區是兩套地理：38 個行政區（E01–E38）供城市與移動使用；15 個市議員選區與市長選區是選舉單位。點擊行政區只改變焦點，不會改寫選舉區；選舉區卡片會列出其涵蓋的行政區。原住民選區（12–15）另有身分與設籍資格的說明，不以行政區推論。

## 驗證閘門

所有驗證都在 build 前離線執行，讀取已提交的資料；失敗即中止建置。

| 驗證 | 主要職責 |
| --- | --- |
| `validate:data` | Zod schema、穩定 ID 唯一、引用可解析 |
| `validate:official` | raw checksum、名冊對帳、抽籤號次不得標為 final、district/source 參照 |
| `validate:constituencies` | 15 選區 / 38 行政區對應、原住民選區語意、不得有 runtime API |
| `validate:ballot-numbers` | 號次來源與非 final 狀態一致 |
| `validate:public-records` | claim/evidence 參照、checksum、身分與審查狀態 |
| `validate:full-roster` / `validate:research` | 覆蓋稽核欄位、attempt 紀錄、不得把未嘗試寫成不存在 |
| `validate:candidate-policies` / `validate:policy-research` | 逐字引文、歸屬、發布狀態 |
| `validate:basic-profiles` | 查核決定、來源層級、隱私欄位、現職證據 |
| `validate:news` | 中性摘要、身分風險、去重、日期 |
| `validate:political-career` / `validate:policy-career` | 任期／活動／提案／表決關聯、政策歸屬唯一、逐字證據 |
| `validate:political-family` | 親屬與政治職涯證據分離 |
| `validate:profile-coverage` / `validate:profile-copy` | 各分頁覆蓋與公開文案不得洩漏內部狀態 |
| `validate:biographies` / `editorial:validate` | 決策鏈、審查者授權、checksum、閘門結果 |
| `validate:enrichment` / `ai-audit:verify` / `semantic:verify` / `scoped-review:verify` / `automated:verify` / `remediation:verify` | scoped 研究與機器查核的一致性與可重現性 |
| `validate:avatars` | GLB 結構、SHA-256、clip 名稱、僅虛構對應 |
| `typecheck` | `astro check` |

指令分組與 CI 細節見 [DEVELOPMENT.md](DEVELOPMENT.md)；每條閘門的發布語意見 [EDITORIAL_AND_PUBLICATION.md](EDITORIAL_AND_PUBLICATION.md)。

## 效能與無障礙

- R3F 場景延遲載入；幾何合併為少量 draw call；僅在需要時繪製；DPR 上限；WebGL 不可用時回退靜態城市預覽與可存取名單。
- 關鍵事實（姓名、職稱、來源、狀態）一律在 HTML，不依賴 canvas。
- 鍵盤可操作、可見焦點、`role="tab"`、reduced motion 停用自動動畫；行動裝置個人面板為 bottom sheet。
- 角色或 GLB 載入失敗不影響文字內容。

## 部署

`main` 推送觸發 `.github/workflows/deploy-pages.yml`：Node 22 → `npm run build:pages`（`BASE_PATH=/kaohsiung-2026-election/`、`SITE_URL=https://r05323028.github.io`）→ 上傳並發布 `dist/` 到 GitHub Pages。`dist/` 也可部署到任何靜態主機；不得在程式中硬編碼站台根路徑。
