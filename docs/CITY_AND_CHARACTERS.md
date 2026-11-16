# 城市與角色

3D 城市是**閱讀介面**，不是遊戲規則、不是官方地圖、也不是任何事實的證據。所有政治資料獨立於 Three.js；模型、動畫與角色不得承載政黨、聲量或評價。

## 地理

- 來源：內政部國土測繪中心「鄉（鎮、市、區）界線」`TOWN_MOI_1140318`（data.gov.tw/dataset/7441，OGDL v1），2026-11-08 擷取。
- 產物：`src/data/geography/kaohsiung-districts.json`（38 區多邊形、面積、地形、標籤、相鄰、gate、遠端島嶼）與 `kaohsiung-districts-summary.json`（HUD 用）。重建：`PYTHONPATH=/tmp/kaohsiung-pylibs python3 scripts/build-kaohsiung-geography.py`（需 pyshp）；執行期只讀已提交 JSON。
- 投影：TWD97[2020] 當作 WGS84 顯示；以 120.30°E、22.70°N 為中心的局部等距投影，1 單位 = 1 km。RDP 容差 0.0002°（約 22 m）。
- 38 區以 E01–E38 排序；相鄰關係由「至少兩個共同簡化頂點」判定且對稱；gate 取最遠共同頂點中點，屬診斷用途，不是路徑規劃。
- 旗津主島可行走；東沙、太平島等 16 個遠端環形排除在相機範圍與路線外。桃源區含兩個環。
- 邊界僅供顯示，不代表選舉區、戶籍或法定界線。選舉區與行政區的對應見 `src/data/constituencies.ts`（第 4 選區 = 楠梓＋左營；鳳山 = 議員第 9 選區）。

## 六角城市

- 40 格六角地圖覆蓋 38 個行政區；地磚為裝飾，不是地籍圖。地標位於格心，環道半徑 2.009，建築落在 0.96–1.06 的廣場環上並面向地標；面向相機的 ±0.55 rad 弧帶保持淨空。
- 高度上限 `maxSilhouetteHeight(radius)` 讓屋頂不遮蔽外環道路；樹列避開地標淨空圈。
- 六種建築原型：透天厝、騎樓街屋、公寓、轉角商業、現代量體、倉庫；行政區剖面（歷史、工業、密集市區、港區、鄉村、山地）決定權重、樓層、高度、色彩與構件機率。
- 決定性：以 `tile.id:districtId:town` 播種（FNV-1a + mulberry32），不使用 `Math.random`；相同輸入永遠產生相同城市。
- LOD：低於 zoom 62 只畫量體；≥62 加窗帶與簷口；≥155 且品質非低時加窗台、欄杆、冷氣、天線、落水管等。細節以正交投影 zoom 判定。
- 繪製預算：三個合併頂點色 bucket（牆、玻璃、金屬），陰影另計；刻意關閉 frustum culling 以固定 draw call。
- 幾何契約：`building-geometry.ts` 生成後會檢查有限座標、屬性長度、索引範圍、非退化三角形、面向與頂點法線一致，以及 LOD 索引單調遞增；`buildings.ts` 另檢查樓層、樓高、環道半徑與原型限制。透天厝以山牆／四坡／平屋頂為主，騎樓街屋與轉角商業優先平屋頂，公寓與現代量體不在低樓層強塞陽台，倉庫才使用鋸齒屋頂；水塔只在規格啟用時生成。
- 光照：暖色主光 + 半球光 + 低環境光、ACES 色調映射；不使用 bloom、景深或 SSAO。
- 檔案：`src/world/buildings.ts`（純規格，不 import Three）、`src/world/building-geometry.ts`（合併幾何）、`src/components/HexBuildings.tsx`、`HexWorldLayer.tsx`、`CityScene.tsx`。
- 限制：程序化裝飾不是建築測繪；公園、濕地等稀疏地磚保持誠實的空曠；立面細節需 zoom ≥100；地標仍是獨立低多邊形群組。

## 移動模擬

- 每位正式候選人恰好一個 WorldActor（106 位）；demo 角色不參與。角色欄位包含 role、選舉區、允許的行政區、路線、路徑圖節點、速度、位置、當前行政區與行為狀態。
- 兩張步行圖：`HERO_WALK_GRAPH`（左營–楠梓人行道、街道、廣場、公園、三座橋）與 `WORLD_WALK_GRAPH`（每區一節點 + 官方 gate + 旗津渡輪）。跨區移動經 gate，渡輪屬 transport transition。
- 路線抽樣間隔 0.04 km；每個相鄰取樣都必須是真實邊且允許通行。無效路線直接轉為 idle，**不得**以直線穿越。議員第 4 選區路線 15.97 km 環狀且限於左營／楠梓；市長路線 27.79 km（左營→楠梓→橋頭→岡山→折返）含 6 段示意連接並標記 warning。
- 時間倍率 4；基礎速度 0.0024（市長）／0.0013（議員）／0.0016（原住民議員）km/s，個體變異 0.82–0.98。reduced motion 停止自動前進。
- 渲染：`ActorLayer` 以 instanced marker 呈現，標記矩陣 12 Hz、頭像與選取環逐帧；相機以指數追蹤＋預看。視窗 `__kaohsiungWorld` 僅供展示與測試。
- **揭露**：所有移動都是虛構模擬，角色掛「模擬移動」標籤；不代表真實行蹤、行程或競選活動。只有左營–楠梓的路線經過街道級驗證，其餘為示意。

## 角色與資產

- 邊界：原創低多邊形／chibi 模型是資訊介面，不是遊戲角色，也不是關於某人的證據；目前所有 GLB 都是虛構示範角色，不是任何人的 likeness。
- 正式候選人一律使用中性程序化視覺；只有在 manifest 明確對應且狀態為 generated／validated／approved 時才載入 GLB，缺少、被拒、被取代或未對應時回退程序化角色。
- 資產：`public/assets/avatars/`（base + lantern／reading／civic／harbor），`data/avatars/manifest.json` 記錄 ID、路徑、SHA-256、bytes、mesh／材質／三角形數、高度、clip、視覺審查狀態與對應。2026-11-06：5 個 GLB、292,664 bytes、5,540 三角形。
- 指令：`avatars:generate`（決定性 Three 基本體 + GLTFExporter，不連網）、`avatars:validate`（重開檔案、檢查 GLB v2 結構、長度、SHA-256、clip、僅虛構對應）、`openspec:validate:avatars`。不得手改生成的位元組或 checksum。
- 執行期：`src/data/avatars/schema.ts` 阻擋不安全路徑與未核准真人資產；`CharacterAvatar.tsx` 共用 clip 名稱（Idle／Selected／Greeting／Walking），載入失敗回退；`/avatar-preview/` 僅開發用。
- 真人 likeness 走下方管線；未經具名人工核准的頭像不會出現在公開頁面，manifest 本身不是身分、黨籍、職務、政策、人氣或背書的證據。

## 候選人 likeness 頭像管線

以授權照片為證據，產生可辨識但明顯風格化的 chibi 頭像。頭像只替換頭部，共用骨架、動畫與身體由既有 base 模型提供。

| 階段 | 位置 | 產物 |
| --- | --- | --- |
| 照片研究 | `scripts/avatar/photos/` | `data/avatars/likeness/photos.json`：URL、作者、授權、擷取日、身分連結方式、可用性 |
| 臉部量測 | `scripts/avatar/face/extract.py`（MediaPipe FaceLandmarker） | `appearances.json`：每個參數帶 `basis`（observed／estimated／default）與引用 photoId |
| 幾何生成 | `scripts/avatar/blender/head_kit.py`、`scripts/avatar/likeness/generate.ts` | 匯入 base 模型頭部載體後變形，輸出 HeadPivot 局部座標的 GLB 至 `data/avatars/likeness/kits/`（不在公開目錄） |
| 批次與 Manifest | `scripts/avatar/likeness/generate.ts` | `data/avatars/likeness/manifest.json`：106 筆 disposition |
| 發布閘門 | `scripts/avatar/likeness/{derive,publish,validate}.ts` | `review.json`（人工）→ `loadable.json` ＋複製已核准 GLB 到 `public/assets/avatars/likeness/`（執行期唯一入口） |

- 生成契約：決定性（相同參數 → 相同位元組）、不連網、無貼圖／骨架／動畫、每個網格一個材質（8–10 draw calls）。預算：2,000–14,000 三角形、6–40 網格、4–16 材質、40–400 KB，bounds 檢查以 HeadPivot 局部座標（下巴 y≈0、前方 +Z）為準。
- 變形範圍：臉長／寬、下巴與下顎、頰、眼距與眼型、眉、鼻、嘴、髮量與髮長（bob／及肩／長直髮以 base 髮殼延伸；bun／ponytail 為附加幾何）、眼鏡（rectangular／square／round／half-rim）、鬍鬚元件（目前無已證實的鬍鬚案例）。眼、眉、鼻、嘴以剛體縮放與位移，不動 base 的雕塑拓撲。
- 發布邊界：未核准的 GLB 只存在 `data/`，不會進 `public/` 或 `dist/`；`publish` 會同步公開目錄並刪除不在核准清單內的檔案，`--check` 驗證位元相同。
- 身分與審查：`photoIdentityConfidence` 只表示「照片是該候選人條目或官方名冊的代表圖」，不代表人臉比對成功。`review.json` 由人撰寫，每筆決定以 `appearanceSha256` 與 `headKitSha256` 釘住受審版本；重新生成或重新擷取後核准自動作廢。未核准者一律回退共用 base 頭像。
- 狀態語意：`generated`（有頭像與外觀）、`extracted`（有外觀、無頭像）、`research-pending`、`blocked-no-photo`、`blocked-license`。缺照片不是「沒有特徵」，只是沒有可用證據。
- 指令：`avatars:likeness:extract`（venv Python）→ `avatars:likeness:generate --all`（或 `--candidate <id>` 可重複、`--render` 產生 `reports/avatar/heads/`）→ `avatars:likeness:publish`（`--check` 只驗證）→ `avatars:likeness:validate`（已納入 `validate:all`）。
- 現況（2026-11-16）：106 位候選人中 12 位有授權且可由來源連結的照片；5 位完成頭像（柯志恩、賴瑞隆、張博洋、陳美雅、黃文志）作為 POC，7 位僅完成外觀擷取，其餘 94 位 `blocked-no-photo`。尚無人工核准，`loadable.json` 為空，公開站仍使用共用 base 頭像。
- 效能：單一頭像 12,242–12,910 三角形、8–9 網格、224–255 KB，對照 base 頭部 19 網格／33,196 三角形；頭像只在 detail LOD 的角色掛載，`useGLTF` 快取共用，瀏覽器端不做任何推論。
- 限制：沒有採用 image-to-3D（TRELLIS 等需 GPU 與額外權重授權審查，且輸出拓撲不利動畫）；髮型庫以 base 髮殼的輪廓為上限，長髮以延伸髮片表示，不是獨立雕塑；相似度仍是風格化近似，必須人工審查。

## 設計與無障礙

- 五個色彩 token（Harbor Teal、Warm Sand、Coral、Deep Ocean、Soft Cream）定義於 `src/styles/global.css` 的 Tailwind v4 `@theme`；繁體中文為主，英文只用於小型分類與路線代碼，系統字型、不載入遠端字型。
- 選取狀態以 teal／coral 表示，不是分數；示範內容一律有「虛構示範」標記；來源與狀態 chip 緊貼敘述；空狀態說明「暫無資料 ≠ 不存在」。
- 等價呈現：所有候選人相同比例、光照、互動與資料類別。首頁是全螢幕正交迷你城市，不是三欄版面中的小場景。
- 無障礙：關鍵事實存在 HTML；提供可鍵盤操作的候選人名單與靜態城市預覽；`role="tab"`、可見焦點、reduced motion；行動版個人面板為 bottom sheet。WebGL 或 GLB 失敗不阻擋文字內容。
- 變更城市或角色後，執行對應單元測試與 `scripts/capture-*.ts` 證據腳本；視覺與效能量測存放於 `reports/`。
