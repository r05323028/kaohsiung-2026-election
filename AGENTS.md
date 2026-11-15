# AGENTS.md

給在本 repo 工作的 AI agent 的操作契約、文件地圖與維護規則。此檔定義不可違反的原則與去哪裡查細節；細節以對應的 `docs/`、`openspec/` 與程式碼為準。

## 專案

港都人物誌：以原創六角迷你城市探索 2026 高雄市長與市議員選舉的非黨派、來源導向靜態網站。Astro 在 build time 讀已提交的資料輸出純靜態頁面，push `main` 部署 GitHub Pages。沒有後端、資料庫、認證或 runtime API；不要把資料抓取或 service call 帶進瀏覽器端。

## 硬性禁則

- **不以 demo 補位**：官方資料缺失、未核准或未查證時顯示中性「暫無資料」。`src/data/fixtures.ts`／`src/data/demo.ts` 只供測試與資產驗證，全部 `isDemo`，永不進入公開頁面。
- **不製造事實**：沒有來源的欄位保持未知。空白不等於「沒有」；`not-attempted`、`source-unavailable`、`insufficient-evidence` 都不是負面證據。
- **不以姓名認定身分**：同名、相似姓名、同選區都不是同一人的證據；需來源特有 ID、職務、選區與時間脈絡交叉支持才可合併。
- **不推論**：不得由姓名、照片、職務、政黨、空白欄位或相同姓氏推論親屬、動機、違法、政策成果或政治關係。
- **不改寫證據**：`data/raw/`、manifest、SHA-256、審查理由與報告屬不可變 provenance。checksum 對不上代表來源變更 → 新增快照、重跑 adapter、重新對帳；不得就地改 checksum 或手改生成的位元組。
- **機器 ≠ 人工**：schema／Zod 驗證、AI 輔助、獨立機器查核都不得標成人工審查或編輯核准。`data/editorial/reviewer-registry.json` 的空 registry 是刻意的安全預設，不要代為建立審查者或核准。
- **不評分、不排名**：不得產生情緒、聲量、好感度、支持度或人氣分數；所有候選人使用等價版面、視覺與資料類別。
- **政策與歷程分離**：未來承諾留政策頁；已發生的提案、表決、質詢、預算與行政結果屬從政歷程。同一事實只有一個歸屬，兩邊以 ID 互指、不複製敘述。
- **公開層只讀受控快照**：頁面與元件不得讀 `data/raw/`、`data/normalized/`、`data/review/` 或 `data/enrichment/`。

## 動工前

1. 先確認改動屬於哪一層（資料／內容規則／編輯閘門／城市視覺／開發流程），到下方「權威位置」找對應文件，不要另開新 Markdown。
2. 決定性是硬需求：adapter 對相同位元組必須產生相同輸出；城市幾何與角色以 `tile.id:districtId:town` 播種（FNV-1a + mulberry32），不得使用 `Math.random`。
3. 改動公開內容規則、驗證器或資料流時，在同一個變更內更新對應文件。

## 收工前

```bash
npm run typecheck
npm run lint          # Biome：src、scripts、tests、playwright.config.ts
npm test              # Vitest
npm run validate:all  # 28 個離線驗證器 + typecheck，全部不連網
```

- `npm run build` = `validate:all` → `build:astro` → `validate:profile-copy`（數分鐘）。最後一步讀 `dist/`，單獨執行前必須先 `npm run build:astro`；只調畫面可用 `npm run build:astro`。
- 純文件或純資料變更不需要全量 Playwright；動到關鍵瀏覽器路徑才跑 `npm run test:e2e`（首次需 `npx playwright install chromium`）。
- 驗證失敗時修資料或程式，不要放寬驗證器讓它通過。

## 常見陷阱

| 陷阱 | 正確做法 |
| --- | --- |
| 站內連結寫死 `/candidates/…` | 一律經 `src/utils/paths.ts` 的 `withBase()`；`BASE_PATH` 在 CI 與正式站不同 |
| 想把稽核／量測報告放進 `docs/` | 產出物留在 `reports/`，那是生成物、會被重新產生 |
| 想為每個功能或 change 開 markdown | 變更過程屬 `openspec/changes/`，完成後併入既有文件 |
| 文件與行為不一致 | 以程式碼為準，並回頭修文件 |

## 文件地圖與權威位置

`docs/` 只保留長期維護的文件。程式碼、schema、設定、測試與驗證器是行為的唯一事實來源。

| 文件 | 負責範圍 | 何時閱讀 |
| --- | --- | --- |
| `AGENTS.md` | AI agent 操作契約、硬性禁則、動工與收工要求、文件地圖與維護規則 | 每次開始 repository 工作時 |
| `README.md` | 產品定位、功能、部署、線上網址 | 了解專案或對外產品資訊時 |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | build-time 靜態架構、資料流、模組邊界、驗證閘門、部署形態 | 修改資料流、頁面、元件或新增資料層時 |
| [`docs/DATA_AND_PROVENANCE.md`](docs/DATA_AND_PROVENANCE.md) | 官方資料擷取、快照與校驗碼、身分對帳、覆蓋稽核、資料集清單與更新程序 | 新增或更新來源、處理 checksum、對帳或覆蓋率時 |
| [`docs/EDITORIAL_AND_PUBLICATION.md`](docs/EDITORIAL_AND_PUBLICATION.md) | 機器查核／人工審查／編輯核准／發布的界線、審查者與決策模型、各發布閘門 | 任何會影響公開內容的審查或發布決定時 |
| [`docs/CANDIDATE_CONTENT.md`](docs/CANDIDATE_CONTENT.md) | 候選人頁五個分頁的內容規則：基本資料、政策主張、相關新聞、從政歷程、家族從政關係 | 撰寫、分類或刊登任何候選人敘述時 |
| [`docs/CITY_AND_CHARACTERS.md`](docs/CITY_AND_CHARACTERS.md) | 3D 城市地理、六角建築、移動模擬、角色資產、設計與無障礙 | 調整城市、角色、動畫或視覺時 |
| [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) | 環境、指令、驗證分組、CI、測試與疑難排解 | 本機開發與除錯時 |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | 目前狀態、下一個里程碑、非目標 | 規劃工作或判斷優先順序時 |
| `openspec/specs/`、`openspec/changes/` | 現行能力規格與變更歷史 | 查閱現行規格或設計／任務紀錄時 |
| 程式碼、schema、驗證器、測試 | 行為的唯一事實來源 | 文件與實際行為不一致，或需要確認行為時 |

## 文件維護規則

1. **先改既有文件，再考慮新檔案。** 新檔案必須有現有文件無法承擔的獨立責任，並同步更新本文件地圖。
2. **不要為每個功能或每個 OpenSpec change 建立 Markdown。** 變更過程屬 `openspec/changes/`；完成後的決策併入既有文件。
3. **暫存實作報告不要放進 `docs/`。** 稽核、覆蓋率、視覺證據與效能量測等產出物留在 `reports/`，那是生成物而非文件。
4. **不要複製生成報告的內容。** 需要時連到報告路徑或指令，不貼上大量統計。
5. **每個政策或技術概念只有一個權威位置。** 其他文件以連結指向，不重述規則。
6. **文件要與實際行為同步。** 修改驗證器、schema、指令或發布閘門的同一個變更內更新文件。
7. **保持精簡。** 優先表格與清單；移除過時的統計、指令與狀態敘述。歷史細節交給 Git。

## 非文件目錄

- `openspec/changes/`：已完成或進行中的變更紀錄，保留當時的設計與任務，屬歷史紀錄，不隨文件重構改寫。
- `openspec/specs/`：現行能力規格，與程式行為同步。
- `reports/`：由指令產生的稽核與量測結果，會被重新生成，不是手寫文件。
- `data/`：資料與其 provenance；不得為了文件一致性改寫保留的證據、checksum 或審查理由。

衝突時以程式碼為準；文件過時就回頭修文件，不要讓兩者分岔。
