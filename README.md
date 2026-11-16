# 港都人物誌 Kaohsiung Civic Stories

以原創六角迷你城市探索 2026 高雄市長與市議員選舉的**非黨派、來源導向**互動網站。從城市、選舉區到候選人，資料盡量連回公開來源與原始出處。

**線上瀏覽：<https://r05323028.github.io/kaohsiung-2026-election/>**

本站獨立製作，不是政府官方網站；3D 城市是閱讀介面，不代表法定選舉區邊界。

## 功能

- **互動 3D 迷你城市**：38 個行政區的六角地景、港灣與可選擇的候選人角色；WebGL 不可用時有靜態替代。
- **選舉區探索**：市長與 15 個市議員選區（含平地、山地原住民選區），顯示各區涵蓋的行政區，並區分「行政區」與「選舉區」。
- **候選人頁面**：基本資料、政策主張、相關新聞、從政歷程、家族政商關係五個分頁。
- **政策與從政分離**：政策頁只保留未來承諾；已發生的提案、表決、質詢與行政結果歸入從政歷程，同一事實只有一個歸屬。
- **來源可追溯**：每項事實盡量附來源與日期並連回出處；未查證、待審或來源不可達時標示「暫無資料」，不以空白推論事實。
- **無障礙替代路徑**：鍵盤操作、reduced motion，以及沒有 WebGL 時的靜態名單與城市預覽。

## 技術

Astro（靜態輸出）、React 19 + TypeScript、Three.js / React Three Fiber、GSAP、Tailwind CSS v4、Zod、Vitest / Playwright / Biome、GitHub Pages。

沒有後端伺服器、資料庫、認證或 runtime API；所有頁面在 build time 產生。

## 快速開始

需要 Node.js 22.23.4 以上與 npm。

```bash
npm ci
npm run dev        # http://localhost:4321
```

常用檢查：

```bash
npm run typecheck
npm run lint
npm test
npm run build      # 完整離線驗證 + 靜態輸出（數分鐘）
```

只想預覽畫面可用 `npm run build:astro`。完整指令、驗證分組、CI 與疑難排解見 [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md)。

## 部署

推送 `main` 觸發 [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml)：以 `BASE_PATH=/kaohsiung-2026-election/`、`SITE_URL=https://r05323028.github.io` 執行 `npm run build:pages`，再發布 `dist/` 到 GitHub Pages。

`dist/` 是純靜態輸出，也可部署到任何靜態主機。站內連結一律經 `BASE_PATH` 產生，請勿硬編碼站台根路徑。

## 資料與編輯原則

- 選舉區與候選人資格以中選會、高雄市選舉委員會公告及保留的原始快照為基礎；號次依抽定結果標示，正式公告後才以公告為準。
- 人物資料可能來自官方機構、公開紀錄、候選人陳述與可信新聞；每項刊登事實都能連回支持它的證據。
- 機器查核、人工審查、編輯核准與發布是四個不同階段，互不代替；公開頁面只讀通過閘門的靜態快照。
- 未查證或未收錄的資料顯示「暫無資料」，不代表該資訊不存在。
- 本站不代表任何候選人、政黨或政府機關，也不進行情緒、聲量或好感度評分。
- 3D 角色使用共用的原創 chibi 模型，不是任何候選人的 likeness。
- 虛構示範資料僅用於測試與資產驗證，不會出現在正式站台。

## 文件

- [`AGENTS.md`](AGENTS.md)：AI agent 操作契約、文件地圖與維護規則
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)：靜態架構、資料流與模組邊界
- [`docs/DATA_AND_PROVENANCE.md`](docs/DATA_AND_PROVENANCE.md)：來源、快照、身分對帳與資料集
- [`docs/EDITORIAL_AND_PUBLICATION.md`](docs/EDITORIAL_AND_PUBLICATION.md)：審查、核准與發布閘門
- [`docs/CANDIDATE_CONTENT.md`](docs/CANDIDATE_CONTENT.md)：五個分頁的內容規則
- [`docs/CITY_AND_CHARACTERS.md`](docs/CITY_AND_CHARACTERS.md)：城市、模擬與角色資產
- [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md)：指令、驗證、CI 與測試
- [`docs/ROADMAP.md`](docs/ROADMAP.md)：現況、下一步與非目標
