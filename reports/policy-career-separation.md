# 政策主張與從政歷程分區遷移報告

- 日期：2026-11-14
- 範圍：106 位市長與市議員候選人、1005 筆已發布政策紀錄（`data/published/2026/candidate-policies.json`）
- 產物：`data/approved/2026/policy-career-separation.json`、`data/policy-career/2026/curation.json`
- 規則文件：`docs/POLICY_CAREER_SEPARATION.md`
- 審核者：editorial-research（本報告描述機器分流結果與人工覆核項目，不改變既有發布授權）

## 摘要

| 項目 | 數量 |
| --- | --- |
| 已發布政策 | 1005 |
| 留在政策主張（`policy-commitments`） | 999 |
| 移入從政歷程（`political-career`） | 6 |
| 拆分（`split-record`） | 3 |
| 從政歷程新增的歷史紀錄（含拆分後的歷史半） | 8 |
| 跨區連結 | 19（自動 14、人工 5；`same-event` 2、`related-topic` 17） |
| 初篩標記但覆核後保留為承諾 | 5 |
| 待審（`review-required`） | 0 |

每位候選人仍只渲染一份事實：政策分頁讀 `commitments`，從政歷程讀 `historicalRecords` 與政治活動時間軸；同一 `policyId` 不會同時出現在兩邊。

## 分流方法

1. `src/data/policy-career/markers.ts` 以完成語氣（已經、成功爭取、促成、提高至…）與未來語氣（將、爭取、推動、要求…）標記初篩；完成語氣且無未來語氣者進覆核佇列，`public_statement` 與 `historical_proposal` 一律進覆核佇列。
2. `scripts/policy-career/build.ts` 要求每一筆被標記者都有 curation 條目，否則建置失敗；因此新增的模糊紀錄無法悄悄通過。
3. 人工覆核後給定 `ownership`、`temporalBasis`、`basis`（`policy-type`／`tense-marker`／`editorial-review`）與 `note`；需要改寫時提供承諾半的標題、摘要與逐字證據。
4. `src/data/policy-career/similarity.ts` 以 3-gram（df ≤ 4、至少 2 個共同詞）計算政策與活動的相似度；≥ 0.3 產生 `related-topic`，來源同日且 ≥ 0.45 產生 `same-event`，每筆政策最多 3 條。

## 移入從政歷程（6 筆）

| 候選人 | 政策紀錄 | 原標題 | 歷史紀錄（類別／行動／日期／結果狀態） |
| --- | --- | --- | --- |
| 黃柏霖 | `policy-2026-huang-bo-lin-07` | 微型保險納保年齡提高至70歲 | 提案修正微型保險自治條例放寬納保年齡（council-proposal／propose／日期未載明／documented-outcome） |
| 林智鴻 | `policy-2026-lin-zhi-hong-02` | 爭取近3億元改造台鐵機廠 | 爭取台鐵機廠轉型親子休閒園區經費（municipal-governance／public-affairs-participation／日期未載明／documented-outcome） |
| 劉德林 | `policy-2026-liu-de-lin-09` | 鳳山軍方閒地變公園 | 爭取軍方閒置土地變更為公園用地（municipal-governance／public-affairs-participation／日期未載明／institutional-response） |
| 王義雄 | `policy-2026-wang-yi-xiong-01` | 爭取南北區原住民長者託管中心 | 建議設置原住民長者託管中心（public-affairs／public-affairs-participation／日期未載明／not-documented） |
| 王義雄 | `policy-2026-wang-yi-xiong-02` | 爭取前鎮興邦段原住民專屬社會住宅 | 爭取前鎮興邦段原住民專屬社會住宅（public-affairs／public-affairs-participation／日期未載明／not-documented） |
| 鄭安秝 | `policy-2026-zheng-an-li-09` | 里環境改善費提高至15萬元 | 促成里環境改善費調高至15萬元（budget-review／public-affairs-participation／日期未載明／institutional-response） |

移轉理由：這些紀錄描述已經發生的提案、協調或獲得的制度回應，不是未來的承諾；原文的完成語氣若留在政策分頁，等同把歷史行動當成政策成果。

## 拆分（3 筆）

| 候選人 | 政策紀錄 | 留在政策主張的承諾 | 移入從政歷程的歷史半 |
| --- | --- | --- | --- |
| 黃文益 | `policy-2026-huang-wen-yi-04` | 爭取敬老卡點數改為一年計算一次 | 市府調整敬老卡社福點數為每季發放（municipal-governance／2026-10-01／institutional-response） |
| 林志誠 | `policy-2026-lin-zhi-cheng-02` | 爭取調高托育久任津貼與特殊兒收托補助 | 邀集托嬰協會與社會局協調托育津貼（public-affairs／2026-07-01／institutional-response） |
| 鍾易仲 | `policy-2026-zhong-yi-zhong-02` | 要求加速鳳翔公園垃圾山整治與整體開發 | 不新增敘述，直接連到既有活動 `activity-kaohsiung-council-09-5303e646-17100` 與 `-17293` |

前兩筆的拆分各保留獨立證據：承諾半是政策原文中「還有一段路」的訴求，歷史半是報導所述已發生的協調或制度調整。第三筆的歷史事實已由從政歷程的兩次總質詢完整記錄，因此以 `duplicateOfActivityIds` 指向既有紀錄，不另寫一份。

## 覆核後保留為政策主張（5 筆）

| 候選人 | 政策紀錄 | 保留理由 |
| --- | --- | --- |
| 李喬如 | `policy-kaohsiung-council-06-0644fda4-policy-kcc-profile-2195-4` | 「完工」是督促事項的內容，非已完成成果 |
| 曾俊傑 | `policy-kaohsiung-council-07-ce1bd95c-policy-kcc-profile-2205-2` | 「儘速完工」是要求，非已完成成果 |
| 鍾易仲 | `policy-kaohsiung-council-09-5303e646-policy-kcc-profile-2212-3` | 「優質完工」是對市府的要求，非已完成成果 |
| 白喬茵 | `policy-2026-bai-qiao-yin-06` | 「已經」描述現況，不是政績 |
| 陳麗娜 | `policy-2026-chen-lina-08` | 「已經夠沉重」描述現況負擔並表達反對，不是已完成成果 |

## 保留未變更

- 其餘 994 筆政策留在政策主張，標題、摘要、來源與分類未改；僅拆分紀錄改寫承諾半的措辭。
- 從政歷程原有的 1045 筆政治活動、103 筆公職任期與 643 筆來源全部保留，活動 id 與來源 id 未變。
- 候選人 id、政策 id、活動 id、來源 URL、擷取時間與發布欄位皆沿用原值。

## 交叉連結（19 筆）

- 自動 14 筆：相似度 0.30–0.59，全部 `related-topic`，其中 2 筆因同日發布升為 `same-event`（陳麗珍、黃香菽）。
- 人工 5 筆：黃柏霖、黃文益、王義雄、鍾易仲（2 筆），皆附理由並指向既有活動，不複製歷史敘述。

## 完整性和驗證

- `npm run policy-career:build`：每筆被標記的政策都必須有人工條目；歷史半的來源必須是該政策自己的來源；證據必須逐字出現在原始紀錄中；人工連結不得跨候選人。
- `npm run validate:policy-career`（已加入 `npm run build`）：分區與時間軸一致、拆分兩半不重複、完成語氣承諾需有編輯覆核與說明、強相似度活動必須被連結覆蓋、review 計數需重算相符。
- `src/data/policy-career/dataset.test.ts`：7 項回歸測試，涵蓋「同一政策不得同時出現在兩區」、拆分差異、跨候選人連結、移轉後的承載視圖與無政策候選人的空視圖。
- 既有編輯閘門（`editorial:validate`、`pilot:verify`、`release:verify`、`validate:candidate-policies` 等）未修改，仍以原順序執行。

## 待人工決定

- 無 `review-required` 紀錄；後續若出現新的模糊紀錄，建置會失敗並要求 curation 條目，而不是自動歸類。
- 王義雄兩筆歷史紀錄的日期未載明，維持 `datePrecision: undated`；未以推測補上日期。
