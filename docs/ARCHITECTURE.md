# 架構

港都人物誌是 build-time 產生的純靜態網站：Astro 在建置時讀取已提交資料，輸出 HTML、CSS 與靜態資產。瀏覽器不呼叫後端 API，也沒有資料庫、認證、CMS 或執行期 AI。

## 資料流

官方文件／公開紀錄
  → data/raw/（不可變快照、manifest、SHA-256）
  → deterministic adapters
  → data/normalized/、data/research/（正規化與研究狀態）
  → PR review + offline validators
  → data/approved/、data/published/（受控快照）
  → src/data/ read models
  → Astro
  → dist/（GitHub Pages）

頁面只讀 data/approved/、data/published/ 與受控的程式內資料；不讀 raw、normalized、research 或診斷輸出。未驗證、來源不足或衝突資料保持 withheld／unpublished，不會因 PR 合併自動升格。

## 資料集與讀取模型

| 資料集 | 輸入 | 讀取模型 | 內容 |
| --- | --- | --- | --- |
| 官方選舉 | data/approved/2026/kaohsiung-election.json | src/data/official/index.ts | 16 個選舉區、106 位候選人與來源參照 |
| 公開紀錄 | data/approved/2026/kaohsiung-public-records.json | src/data/public-records/index.ts | 來源支持的 claims；未驗證項目不公開 |
| 履歷 | data/published/2026/candidate-biographies.json | src/data/biographies/index.ts | 嚴格 schema、evidence 與 checksum 快照 |
| 基本資料 | data/published/2026/candidate-basic-profiles.json | src/data/basic-profiles/index.ts | 獨立來源查核的基本資料 |
| 政策 | data/published/2026/candidate-policies.json | src/data/policy-research/ | 來源原文、歸屬、驗證與發布狀態 |
| 新聞 | data/published/2026/candidate-news.json | src/data/news/index.ts | 中性 metadata 與來源摘要 |
| 從政歷程 | data/approved/2026/political-career.json | src/data/political-career/index.ts | 任期、活動、專案、提案、表決 |
| 政策／歷程分工 | data/approved/2026/policy-career-separation.json | src/data/policy-career/index.ts | 每筆記錄的決定性分類 |
| 家族政商關係 | data/published/2026/political-family.json | src/data/political-family/ | 親屬與職務各自有來源支持的關係 |
| 財產申報 | data/published/2026/candidate-property-declarations.json | src/data/property-declarations/index.ts | 中選會官方清單對帳、URL-only 文件連結與具頁碼證據的類別總額／筆數摘要 |
| 角色資產 | data/avatars/、public/assets/avatars/ | src/data/avatars/index.ts | GLB checksum 與安全路徑驗證 |

src/data/fixtures.ts 與 src/data/demo.ts 只供測試、版型與資產驗證，全部標示 isDemo，不會補位正式資料。

### 財產申報資料

財產申報功能保留中選會公開查閱平台的 HTML 清單快照、URL、擷取時間與 SHA-256；從官方 PDF 離線擷取的結果只留下類別層級彙總總額／申報筆數、實體頁碼與兩次不同渲染倍率離線 OCR 的結果比對狀態；`candidate-property-declaration-verification.json` 另保留 PDF SHA-256、頁數、兩次渲染倍率與工具版本，以及類別級數值／頁碼對帳結果。這是機器輔助的兩次擷取比對，不是人工逐筆覆核。掃描 PDF、原始 OCR 文字、逐字轉錄、地址、身分證字號、金融帳戶、簽名與個別財產標的不提交，也不進入瀏覽器 props。`property-declarations:discover` 對帳來源；`property-declarations:publish` 只投影已清理的摘要；`validate:property-declarations` 驗證官方網域、頁面 checksum、候選人／選區／選舉類型、類別完整性與隱私邊界。

同名或來源不唯一時，候選人頁只顯示中性未唯一對帳狀態與官方清單連結，不指定個別 PDF；來源缺失或未唯一對帳不代表沒有財產或沒有申報。只有在 canonical candidate ID、選區與選舉類型脈絡一致時，才顯示單一官方文件連結。

## 前端結構

- src/layouts/BaseLayout.astro：SEO、導覽、skip link 與 BASE_PATH。
- src/components/CityExplorer.tsx、CityScene.tsx、src/world/：城市、搜尋、角色與無障礙替代路徑。
- src/components/ProfileTabs.tsx：基本資料、政策、新聞、從政歷程、家族關係、財產申報六個分頁。
- src/pages/：首頁、候選人、選舉區與開發用 avatar preview；沒有內容審查路由。

## 離線驗證

所有驗證在 build 前執行；失敗即停止：

- schema、唯一 ID、候選人／選區／來源引用完整性；
- raw checksum、官方名冊對帳與號次狀態；
- claims、evidence、引文、日期、去重、身分與發布狀態；
- 政策／歷程分類、家族親屬與職務證據分離；
- basic profile、biography、avatar、profile copy 與 coverage 驗證；
- typecheck、lint、Vitest 與必要的 Playwright checks。

GitHub Pull Request 是唯一的人工內容審查入口。CI 只執行可重現的技術檢查；PR reviewer 另檢查 diff、來源、provenance、中立措辭與資料是否由正確指令產生。

## 部署

main 推送觸發 .github/workflows/deploy-pages.yml，執行 Node 22、npm run build:pages，再將 dist/ 發布至 GitHub Pages。站內連結一律經 src/utils/paths.ts 處理。