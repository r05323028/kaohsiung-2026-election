# 政策研究員指令（batch 抽取）

你正在為 2026 年高雄市長／市議員選舉建立**可追溯的政策主張紀錄**。工作目錄：/Users/seanchang/kaohsiung-2026-election

## 輸入
讀取 `data/policy-research/2026/extraction/batch-XX-input.json`（你的 batch）。每個 candidate 有：
- `candidateId`、`displayName`、`electionType`、`districtId`、`politicalParty`
- `existingSeedPolicyCount`：既有已蒐集筆數（不代表不用再找）
- `files[]`：已抓取的新闻全文，含 `rawPath`（相對路徑）、`headline`、`publisher`、`publishedAt`

## 任務
逐位候選人閱讀其所有 `rawPath` 檔案，抽出**該候選人本人**的政策主張。只使用這些檔案的內容，不得憑記憶或外部知識補充。

### 什麼算一筆政策紀錄
- 明確的選舉承諾、政策主張、具體做法、數字目標、地點、期限、適用對象。
- 候選人對公共議題表態並提出做法（即使不是正式政見）。
- 例：「力拚 2030 年前把臨托據點從 29 處增至 60 處」「爭取捷運黃線延伸至鳥松」「當選後推動老屋健檢補助」。

### 什麼不算
- 只批評對手、沒有自己的主張。
- 純粹行程、造勢、民調、捐款、黨內初選糾紛。
- 過去任職的成績，除非明確被重新承諾為 2026 延續政策（此時 policyContext 用 historical-position 或 current-position）。
- 別人的政策（市長候選人的政策不要記到議員名下；黨的聯合政見只記給有具名背書者）。
- 傳聞、不具名消息、「據了解」。

### 嚴格規則
1. `originalStatement` 必須是從檔案中**逐字連續複製**的片段（20–400 字），不得改寫、不得拼接不同段落。之後會用程式檢查是否真的出現在檔案中。
2. `title`：中性、具體，8–40 字，例如「捷運黃線延伸鳥松」。
3. `summary`：中性摘要 20–120 字，只描述主張內容，不加評價、不用「承諾兌現」等字眼。
4. `category`：從以下擇一（最貼近者）：
transportation-and-mobility, housing-and-urban-development, economic-development-and-industry, education, childcare-and-family-support, healthcare, social-welfare-and-long-term-care, environment-and-sustainability, public-safety-and-disaster-preparedness, youth-and-employment, agriculture-and-fisheries, culture-tourism-and-sports, digital-governance-and-technology, indigenous-affairs, government-transparency-and-administration, other
5. `policyContext`：
- `2026-election-commitment`：明確的本次選舉承諾／政見（最常見）
- `current-position`：對當前議題的立場，未明說當選後要做
- `historical-position`：過去的主张或承諾，未確認延續
- `public-record-achievement`：已完成的施政成果
- `context-unknown`：無法判斷
6. `announcedAt`：檔案 metadata 的 `publishedAt`（YYYY-MM-DD）；若文中明確提到發言日期且與文章日期不同，用文中日期；否則 null。
7. `geographicScope`：`citywide`（全市）、`district`（選區／行政區限定）、`community`（里／社區）、`unknown`。`geographicLabel` 用繁中，例如「高雄市全市」「第 4 選區（左營、楠梓）」。
8. `researchId`：穩定唯一 id，格式 `<candidate-slug>-<序號>`，例如 `ke-zhi-en-01`、`wang-yi-xiong-03`。用羅馬拼音 slug，全部小寫、連字號。同一 batch 內不得重複。
9. `duplicateKey`：同一候選人同一主張的語意鍵（例如 `mrt-yellow-line-extension`），不同主張不可共用。同一主張在多篇報導重複出現時**只留一筆**，選資訊最完整的那篇，並在 `details` 註明其他報導日期（可選）。
10. `identitySignal`：從檔案複製一段能證明身分的文字（例如「高雄市第 4 選區市議員候選人」或「市長候選人」），沒有就填「文中以<姓名>稱之，未載明選區」。
11. 不得虛構。找不到就讓該候選人沒有紀錄，並在 `candidatesWithoutPolicy` 說明你讀了哪些檔案、為什麼沒有可抽取內容。
12. 同一候選人最多 12 筆，重質不重量；若超過，保留最具體、最有政策內容者。

## 輸出
寫入 `data/policy-research/2026/extraction/batch-XX.json`（XX 與輸入相同），格式：

```json
{
  "batchId": "batch-01",
  "researcherRole": "policy-researcher",
  "records": [
    {
      "researchId": "zhang-jing-01",
      "candidateId": "official-mayor-zhang-jing-2026",
      "title": "…",
      "originalStatement": "…逐字…",
      "excerptSourcePath": "data/raw/policy/2026/news/xxxxxxxx.txt",
      "category": "transportation-and-mobility",
      "policyContext": "2026-election-commitment",
      "announcedAt": "2026-10-12",
      "geographicScope": "citywide",
      "geographicLabel": "高雄市全市",
      "summary": "…",
      "details": null,
      "implementationDetails": ["…"],
      "sourceType": "policy-statement",
      "identitySignal": "…",
      "duplicateKey": "…"
    }
  ],
  "candidatesWithoutPolicy": [{ "candidateId": "…", "note": "讀了 3 篇，均為行程與民調" }],
  "searchNotes": "本批共讀 47 篇，抽取 23 筆；限制：…"
}
```

不要修改其他檔案。完成後執行 `npx tsx scripts/policy-research/check-extraction.ts batch-XX` 確認格式與引文都存在於來源檔，修到通過為止。
