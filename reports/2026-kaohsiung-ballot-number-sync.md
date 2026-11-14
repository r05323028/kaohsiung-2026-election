# 2026 高雄市候選人選票號次同步驗證報告

產生時間：2026-11-14T07:35:20.960Z

## 1. 權威來源

- 來源：高雄市第5屆市長、市議員選舉候選人姓名號次抽定一覽表
- 發布機關：高雄市選舉委員會（KHEC）
- 官方網址：https://www.cec.gov.tw/khec/article/65366
- 發布日期：2026-10-27
- 附件：data/raw/official/2026/khec-65366-candidate-numbers.pdf
- PDF SHA-256：9bcbf34a3f18c634b3b619192288a2ff4712ef080d9d05343a90d5cf4a550aa1
- 抽定表僅列出「選舉區、候選人姓名、號次」，不含政黨欄位；政黨資料仍以既有來源為準，未由此表推論。
- 號次抽定（2026-10-27）與正式候選人名冊公告（預定 2026-11-17）是兩個獨立程序，本報告不將抽定表描述為正式公告。

## 2. 方法

- 以官方 PDF 原始附件逐列核對；本專案保存的逐列抄錄位於 `data/normalized/2026/kaohsiung-council-roster.json`（101 列）與市長候選人目錄（5 列），合計 106 列。
- 身分比對鍵為「選舉類型 + 選舉區 + 正規化姓名（NFKC、去除空白、忽略大小寫）」，並同時要求號次與官方列一致；不以姓名單獨比對，不以陣列順序推論號次。
- 市長、普通議員（第1–11選舉區）、原住民議員（第12–15選舉區）為互斥賽局，號次重複只在同一賽局內視為衝突。
- 每一筆號次都必須帶有 `candidateNumberSource`（來源 ID、2026-10-27、第 1 頁、表格參照）；缺少來源即視為失敗。

## 3. 覆蓋率

- 官方列總數：106（市長 5、議員 101）
- 已對應候選人：106／106
- 賽局數：16（市長 1、普通選舉區 11、原住民選舉區 4）

| 賽局 | 選舉類型 | 選舉區 | 人數 | 號次 |
| --- | --- | --- | ---: | --- |
| city-council:district-kaohsiung-council-01 | city-council | 普通・第1選舉區 | 5 | 1、2、3、4、5 |
| city-council:district-kaohsiung-council-02 | city-council | 普通・第2選舉區 | 5 | 1、2、3、4、5 |
| city-council:district-kaohsiung-council-03 | city-council | 普通・第3選舉區 | 8 | 1、2、3、4、5、6、7、8 |
| city-council:district-kaohsiung-council-04 | city-council | 普通・第4選舉區 | 12 | 1、2、3、4、5、6、7、8、9、10、11、12 |
| city-council:district-kaohsiung-council-05 | city-council | 普通・第5選舉區 | 7 | 1、2、3、4、5、6、7 |
| city-council:district-kaohsiung-council-06 | city-council | 普通・第6選舉區 | 4 | 1、2、3、4 |
| city-council:district-kaohsiung-council-07 | city-council | 普通・第7選舉區 | 12 | 1、2、3、4、5、6、7、8、9、10、11、12 |
| city-council:district-kaohsiung-council-08 | city-council | 普通・第8選舉區 | 9 | 1、2、3、4、5、6、7、8、9 |
| city-council:district-kaohsiung-council-09 | city-council | 普通・第9選舉區 | 10 | 1、2、3、4、5、6、7、8、9、10 |
| city-council:district-kaohsiung-council-10 | city-council | 普通・第10選舉區 | 13 | 1、2、3、4、5、6、7、8、9、10、11、12、13 |
| city-council:district-kaohsiung-council-11 | city-council | 普通・第11選舉區 | 6 | 1、2、3、4、5、6 |
| indigenous-council:district-kaohsiung-indigenous-flat-12 | indigenous-council | 平地原住民・第12選舉區 | 3 | 1、2、3 |
| indigenous-council:district-kaohsiung-indigenous-mountain-13 | indigenous-council | 山地原住民・第13選舉區 | 2 | 1、2 |
| indigenous-council:district-kaohsiung-indigenous-mountain-14 | indigenous-council | 山地原住民・第14選舉區 | 3 | 1、2、3 |
| indigenous-council:district-kaohsiung-indigenous-mountain-15 | indigenous-council | 山地原住民・第15選舉區 | 2 | 1、2 |
| mayoral:district-kaohsiung-mayor-2026 | mayoral | 全市・市長 | 5 | 1、2、3、4、5 |

## 4. 差異與衝突

- 號次重複：0
- 無效號次：0
- 缺少來源：0
- 未對應官方列：0
- 姓名變體（號次一致、姓名以既有來源為準）：0

抽定表影像判讀與既有名冊有 4 處字形差異，號次完全相同。這些差異屬字形判讀層級，未變更任何候選人姓名，保留給人工複核：

| 選舉區 | 號次 | 既有名冊 | 抽定表影像判讀 |
| --- | ---: | --- | --- |
| 第3選舉區 | 2 | 張驥晟 | 張騏晟 |
| 第3選舉區 | 5 | 黃秋媛 | 黃秋媖 |
| 第3選舉區 | 8 | 蔡秉穎 | 蔡秉橞 |
| 第7選舉區 | 9 | 鄭孟洽 | 鄭孟洳 |

## 5. 專案變更

- `src/data/official/ballot.ts`：號次正規化、解析、排序、顯示與賽局稽核的單一來源。
- `src/data/official/schema.ts`：新增 `candidateNumberSource` 結構與驗證，號次與來源必須成對出現。
- `data/approved/2026/kaohsiung-election.json`：106 位候選人補上 `candidateNumberSource`；號次數值與既有抄錄一致，未變更。
- `scripts/merge-council-roster.ts`：重新產生議員資料時保留來源欄位。
- `src/data/official/index.ts`、`src/data/index.ts`：候選人清單、選舉區清單、搜尋索引依號次數值排序，並輸出 `ballotNumber`。
- `src/data/view.ts`：修復「已抽定卻顯示待公告」的對應錯誤。
- UI：`CandidateCard.astro`、`ProfileTabs.tsx`、`GlobalHeader.tsx`、`candidates/[slug].astro`、`districts/index.astro`、`districts/[slug].astro`、`CityExplorer.tsx`、`src/styles/global.css`。
- 文案：移除「正式號次待公告」等過期描述；號次標示為「選票號次」。

## 6. 驗證結果

- 自動驗證：通過

### 測試與建置

紀錄時間：2026-11-11T14:27:38.053Z

| 指令 | 結果 | 備註 |
| --- | --- | --- |
| `npm run typecheck` | 通過 | astro check: 186 files, 0 errors / 0 warnings / 0 hints |
| `npx vitest run` | 通過 | 27 test files, 174 tests passed (includes ballot.test.ts and ballot-order.test.ts) |
| `./node_modules/.bin/biome check <changed files>` | 通過 | changed files clean; repo-wide pre-existing warnings remain in untouched files |
| `npm run build` | 通過 | validate chain (incl. validate:ballot-numbers: 106/106 candidates, 106 official rows), 126 pages built, profile copy validated for 106 pages |
| `PLAYWRIGHT_PORT=4336 npx playwright test` | 通過 | 78 tests passed across chromium and mobile-chromium (includes ballot-numbers.spec.ts and mobile ballot assertion) |

## 7. 逐筆稽核表

| candidateId | candidateName | electionType | constituency | ballotNumber | sourcePage | verificationStatus |
| --- | --- | --- | --- | ---: | ---: | --- |
| official-mayor-zhang-jing-2026 | 張靜 | mayoral | 全市・市長 | 1 | 1 | verified |
| official-mayor-wang-zhao-min-2026 | 王肇民 | mayoral | 全市・市長 | 2 | 1 | verified |
| official-mayor-ke-zhi-en-2026 | 柯志恩 | mayoral | 全市・市長 | 3 | 1 | verified |
| official-mayor-hong-fang-long-2026 | 洪方隆 | mayoral | 全市・市長 | 4 | 1 | verified |
| official-mayor-lai-rui-long-2026 | 賴瑞隆 | mayoral | 全市・市長 | 5 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-01-fb74ce74 | 李振豪 | city-council | 普通・第1選舉區 | 1 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-01-b7b307c1 | 林義迪 | city-council | 普通・第1選舉區 | 2 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-01-3ac62854 | 林慧欣 | city-council | 普通・第1選舉區 | 3 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-01-1bea56a9 | 鍾炳光 | city-council | 普通・第1選舉區 | 4 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-01-589d21f4 | 林富寶 | city-council | 普通・第1選舉區 | 5 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-02-df6f2338 | 李柏融 | city-council | 普通・第2選舉區 | 1 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-02-00382651 | 李亞築 | city-council | 普通・第2選舉區 | 2 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-02-f32d851b | 黃明太 | city-council | 普通・第2選舉區 | 3 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-02-632d8db0 | 陳琳潔 | city-council | 普通・第2選舉區 | 4 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-02-c7761769 | 鄭東元 | city-council | 普通・第2選舉區 | 5 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-03-a8f18da8 | 方信淵 | city-council | 普通・第3選舉區 | 1 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-03-53fbb71e | 張驥晟 | city-council | 普通・第3選舉區 | 2 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-03-b2fdd62f | 宋立彬 | city-council | 普通・第3選舉區 | 3 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-03-a187a5ce | 蔣黃女 | city-council | 普通・第3選舉區 | 4 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-03-c1c9a92e | 黃秋媛 | city-council | 普通・第3選舉區 | 5 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-03-d216e1d3 | 林志誠 | city-council | 普通・第3選舉區 | 6 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-03-8e0ba68c | 黃韻涵 | city-council | 普通・第3選舉區 | 7 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-03-9b06e0f9 | 蔡秉穎 | city-council | 普通・第3選舉區 | 8 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-04-fa4f92b7 | 黃文志 | city-council | 普通・第4選舉區 | 1 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-04-291436e3 | 李雅芬 | city-council | 普通・第4選舉區 | 2 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-04-629fea4c | 白喬茵 | city-council | 普通・第4選舉區 | 3 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-04-619c7aa1 | 柳淑芳 | city-council | 普通・第4選舉區 | 4 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-04-fa7345e8 | 李眉蓁 | city-council | 普通・第4選舉區 | 5 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-04-71dd90ce | 李雅慧 | city-council | 普通・第4選舉區 | 6 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-04-61d1909b | 陳玫娟 | city-council | 普通・第4選舉區 | 7 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-04-4c6bef68 | 張以理 | city-council | 普通・第4選舉區 | 8 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-04-2df974a4 | 陳冠宇 | city-council | 普通・第4選舉區 | 9 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-04-c448a515 | 陳麗珍 | city-council | 普通・第4選舉區 | 10 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-04-10ad99ed | 薛兆基 | city-council | 普通・第4選舉區 | 11 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-04-94f45410 | 尹立 | city-council | 普通・第4選舉區 | 12 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-05-50dee358 | 黃飛鳳 | city-council | 普通・第5選舉區 | 1 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-05-147ddb97 | 陳惠君 | city-council | 普通・第5選舉區 | 2 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-05-5abfec11 | 張勝富 | city-council | 普通・第5選舉區 | 3 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-05-f0652f41 | 江瑞鴻 | city-council | 普通・第5選舉區 | 4 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-05-9a56fce0 | 邱俊憲 | city-council | 普通・第5選舉區 | 5 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-05-aa51d7ef | 陳若翠 | city-council | 普通・第5選舉區 | 6 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-05-e6c05223 | 吳利成 | city-council | 普通・第5選舉區 | 7 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-06-5fb70691 | 簡煥宗 | city-council | 普通・第6選舉區 | 1 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-06-68517ae6 | 李喬如 | city-council | 普通・第6選舉區 | 2 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-06-48b16c5d | 蔡金晏 | city-council | 普通・第6選舉區 | 3 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-06-b48fe8fe | 陳美雅 | city-council | 普通・第6選舉區 | 4 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-07-c4c45f4c | 何權峰 | city-council | 普通・第7選舉區 | 1 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-07-abeadb8c | 童燕珍 | city-council | 普通・第7選舉區 | 2 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-07-f42af7ef | 林彥 | city-council | 普通・第7選舉區 | 3 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-07-e0f94c56 | 黃香菽 | city-council | 普通・第7選舉區 | 4 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-07-9cddec16 | 曾俊傑 | city-council | 普通・第7選舉區 | 5 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-07-b92be47d | 張博洋 | city-council | 普通・第7選舉區 | 6 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-07-4b269f51 | 林于凱 | city-council | 普通・第7選舉區 | 7 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-07-afc23f7d | 康裕成 | city-council | 普通・第7選舉區 | 8 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-07-b54eba4a | 鄭孟洽 | city-council | 普通・第7選舉區 | 9 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-07-c27cf75d | 黃柏霖 | city-council | 普通・第7選舉區 | 10 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-07-551cc11e | 余聖明 | city-council | 普通・第7選舉區 | 11 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-07-3b007e6b | 黃淑美 | city-council | 普通・第7選舉區 | 12 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-08-879b5e31 | 黃舜杰 | city-council | 普通・第8選舉區 | 1 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-08-67955d67 | 黃裕庭 | city-council | 普通・第8選舉區 | 2 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-08-672c71fb | 許采蓁 | city-council | 普通・第8選舉區 | 3 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-08-440e3b8d | 湯詠瑜 | city-council | 普通・第8選舉區 | 4 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-08-3c0e0184 | 黃文益 | city-council | 普通・第8選舉區 | 5 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-08-6164dd2e | 黃鈺婷 | city-council | 普通・第8選舉區 | 6 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-08-c9cc4aad | 陳雅敏 | city-council | 普通・第8選舉區 | 7 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-08-4a8b9046 | 鄒約翰 | city-council | 普通・第8選舉區 | 8 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-08-fc0812f4 | 郭建盟 | city-council | 普通・第8選舉區 | 9 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-09-7a196bc1 | 林智鴻 | city-council | 普通・第9選舉區 | 1 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-09-722c1206 | 張漢忠 | city-council | 普通・第9選舉區 | 2 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-09-3ee328a6 | 鄭安秝 | city-council | 普通・第9選舉區 | 3 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-09-663696bc | 蘇致榮 | city-council | 普通・第9選舉區 | 4 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-09-10ba5344 | 陳慧文 | city-council | 普通・第9選舉區 | 5 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-09-83bcf606 | 劉德林 | city-council | 普通・第9選舉區 | 6 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-09-660d56f4 | 李雅靜 | city-council | 普通・第9選舉區 | 7 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-09-acaa7403 | 徐尚賢 | city-council | 普通・第9選舉區 | 8 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-09-caaa9960 | 鍾易仲 | city-council | 普通・第9選舉區 | 9 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-09-e192bb1a | 鄧巧佩 | city-council | 普通・第9選舉區 | 10 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-10-dfc877da | 李政憲 | city-council | 普通・第10選舉區 | 1 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-10-a23863fc | 湯茹婷 | city-council | 普通・第10選舉區 | 2 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-10-6a5be214 | 劉仙娥 | city-council | 普通・第10選舉區 | 3 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-10-c41bc579 | 蔡武宏 | city-council | 普通・第10選舉區 | 4 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-10-e4b645cd | 張藝瑾 | city-council | 普通・第10選舉區 | 5 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-10-740bf55c | 于仙玲 | city-council | 普通・第10選舉區 | 6 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-10-8aa5784f | 鄭光峰 | city-council | 普通・第10選舉區 | 7 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-10-ec2af867 | 陳麗娜 | city-council | 普通・第10選舉區 | 8 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-10-c4789f6f | 李順進 | city-council | 普通・第10選舉區 | 9 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-10-e768fad7 | 李絃毅 | city-council | 普通・第10選舉區 | 10 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-10-73ec2ae0 | 吳銘賜 | city-council | 普通・第10選舉區 | 11 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-10-d8feb4cf | 吳昱鋒 | city-council | 普通・第10選舉區 | 12 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-10-c96d364f | 黃敬雅 | city-council | 普通・第10選舉區 | 13 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-11-51c89db1 | 洪村銘 | city-council | 普通・第11選舉區 | 1 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-11-1704a92e | 黃天煌 | city-council | 普通・第11選舉區 | 2 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-11-a4e7a38d | 邱于軒 | city-council | 普通・第11選舉區 | 3 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-11-aa063da4 | 王耀裕 | city-council | 普通・第11選舉區 | 4 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-11-d0ff0923 | 李雨庭 | city-council | 普通・第11選舉區 | 5 | 1 | verified |
| official-candidate-2026-district-kaohsiung-council-11-4699a9be | 張耀中 | city-council | 普通・第11選舉區 | 6 | 1 | verified |
| official-candidate-2026-district-kaohsiung-indigenous-flat-12-ccf1b97f | 巫振興 | indigenous-council | 平地原住民・第12選舉區 | 1 | 1 | verified |
| official-candidate-2026-district-kaohsiung-indigenous-flat-12-a336f2c9 | 宋紹銘 | indigenous-council | 平地原住民・第12選舉區 | 2 | 1 | verified |
| official-candidate-2026-district-kaohsiung-indigenous-flat-12-0f37f5cd | 王義雄 | indigenous-council | 平地原住民・第12選舉區 | 3 | 1 | verified |
| official-candidate-2026-district-kaohsiung-indigenous-mountain-13-facbff4f | 陳幸富 | indigenous-council | 山地原住民・第13選舉區 | 1 | 1 | verified |
| official-candidate-2026-district-kaohsiung-indigenous-mountain-13-9632ac0c | 葛娜瑩 | indigenous-council | 山地原住民・第13選舉區 | 2 | 1 | verified |
| official-candidate-2026-district-kaohsiung-indigenous-mountain-14-c9a9596c | 洪英雄 | indigenous-council | 山地原住民・第14選舉區 | 1 | 1 | verified |
| official-candidate-2026-district-kaohsiung-indigenous-mountain-14-49bf3f0d | 林錫閔 | indigenous-council | 山地原住民・第14選舉區 | 2 | 1 | verified |
| official-candidate-2026-district-kaohsiung-indigenous-mountain-14-f65ce1c2 | 高忠德 | indigenous-council | 山地原住民・第14選舉區 | 3 | 1 | verified |
| official-candidate-2026-district-kaohsiung-indigenous-mountain-15-7d5e5bca | 金禾雅 | indigenous-council | 山地原住民・第15選舉區 | 1 | 1 | verified |
| official-candidate-2026-district-kaohsiung-indigenous-mountain-15-c088199b | 陳奕蓁 | indigenous-council | 山地原住民・第15選舉區 | 2 | 1 | verified |
