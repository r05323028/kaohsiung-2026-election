# 候選人內容

本文件規定候選人頁五個分頁各自能放什麼、不能放什麼，以及共同的歸因與中立規則。資料來源、checksum 與審查機制見 [DATA_AND_PROVENANCE.md](DATA_AND_PROVENANCE.md)；核准與發布見 [EDITORIAL_AND_PUBLICATION.md](EDITORIAL_AND_PUBLICATION.md)。

## 五個分頁

| 分頁 | 只放這些 | 不放這些 | 資料來源 |
| --- | --- | --- | --- |
| 基本資料 | 學歷、專業與工作經歷、公共服務經歷、現職、官方網站、可查證背景 | 政策承諾、議會行動、未查證傳聞、私人個資 | `candidate-basic-profiles.json` |
| 政策主張 | 未來承諾、擬議改革、政策目標、表態要推動的內容 | 已發生的提案、表決、質詢、預算審議、已完成成果 | `candidate-policies.json` |
| 相關新聞 | 標題、媒體、日期、中性摘要、原文連結 | 情緒詞、聲量、好感度、全文轉載、照片 | `candidate-news.json` |
| 從政歷程 | 公職任期、議會質詢與參與、預算審議、政府專案、立法提案、記名表決 | 學歷、私人企業經歷、黨職、競選承諾、未發生的事 | `political-career.json` |
| 家族政商關係 | 有來源支持的公開親屬關係，且親屬本身具可查證政治／企業／基金會／非營利職務 | 依姓名、照片或傳聞推論的關係 | `political-family.json` |

同一事實只能有一個歸屬。政策與歷程以 `policy-career-separation.json` 決定：`policy-commitments`（留政策）、`political-career`（移歷程）、`split-record`（同一來源同時含承諾與行動，拆成兩半）、`review-required`（待人工判斷，不得發布）。兩邊只以 ID 互指，不複製整段敘述；「相關政治活動」與「相關政策主張」互為跳轉。

## 基本資料

- 欄位：`education`、`professional-experience`、`public-service`、`current-position`、`official-website`、`biographical-note`（2026-11-15：829 筆，103 位候選人有內容）。
- 歸因標籤必須顯示：`institutional-record`、`candidate-statement`、`independently-corroborated`、`editorial-context` 等。
- **選舉公報與議會「議員簡介」的學歷／經歷欄由候選人自行填列**：即使刊登在官方網站，也標示為「候選人自行填列」；只有現職可由議會名錄或官方公告作為機構紀錄。
- 現職需有適合查核日期的證據，且不得只依賴候選人自述；歷史職務必須有結束年，現職不得有結束年。
- 議會簡介的「經歷」欄可能混入學歷、服務政見或新聞標題，必須逐行分類；查核者應拒絕錯置欄位。
- 僅有競選文宣或新聞報導、缺乏獨立機構紀錄的欄位保持未知，不以推測補齊。
- 同名候選人（例如陳冠宇、張耀中、黃鈺婷）須以生日、選區、政黨或職務區分；無法區分即不發布。
- 不刊登私人住址、電話、私人 email、身分證號。

## 政策主張

- `originalStatement` 必須是來源全文中的連續原文，正規化後可機器比對；不可改寫成更漂亮的句子。
- 類別與型別需與脈絡一致（`campaign-promise`、`formal-proposal`、`legislative-proposal`、`implemented-policy`、`commentary`、`historical-position`）。
- 已完成、已實施、已表決的內容屬從政歷程，不留在政策頁；舊提案不得當成新的競選承諾。
- 政策不評分、不排名、不標示支持度；卡片順序不代表重要性。
- 政策若無日期，維持未知，不以檔案時間補成發布或承諾日期。

## 相關新聞

- 只收錄自由時報、ETtoday、中央社的公開搜尋結果（policy v1 範圍）；其他媒體不在覆蓋範圍。
- 發布條件：獨立驗證 `verified`、姓名風險 `low`（姓名在標題且文中至少一個選區專屬線索，如「三民」「第 7 選區」「高雄市長」；只有「高雄」「議員」不算）、日期可確認、20–240 字中性摘要且無評價詞、非重複轉載、摘要每項事實可在原文找到。
- 錯誤身分（例如把新竹市議員林彥甫誤配到高雄候選人林彥）與摘要不實者列入排除清單並保留理由。
- 新聞只呈現「本次快照找到的可發布報導」，不是「該候選人有無新聞」的完整事實；429 限流或缺漏以「來源錯誤」記錄。
- 不產生、不儲存、不顯示情緒、好感度、聲量或正負面評分。

## 從政歷程

- 職務類型：`elected-office`、`government-employment`、`legislative-office`、`council-office`；任用類型：`elected`、`appointed`、`civil-service`、`contract`、`unknown`。區長、機要秘書、參議等任命不得寫成民選職務；里長、鄉鎮長與代表則為民選。
- 政府專案角色：`initiated`、`managed`、`participated`、`oversaw`；狀態：`completed`、`ongoing`、`planned`、`not-implemented`、`unknown`。公告、徵選或預告階段不得標為已完成。
- 只收錄報導同時載明候選人姓名與職務的專案；不得因任職於某機關就把機關整體成果歸給個人。
- 提案角色：`primary`、`co-proposer`、`co-sponsor`；狀態取自立法院開放資料最新進度，未經三讀不得描述為法律。
- 表決：只有記名表決名單能產生個別投票；未記名、語音表決或名單未列名一律 `unknown`／`not-recorded`，不得依黨團立場推定，也不得把「未列名」呈現為反對。
- 日期只使用來源明確記載者；僅有年月或年份時以 precision 標示，介面不顯示不存在的日。前任職務不得寫成現任。
- 每位候選人的議會活動最多保留 40 筆（新到舊），並在 `review.limitations` 揭露；「查無紀錄」不代表未從事政治活動。
- 沒有可查證紀錄時只顯示「目前尚無可查證的從政歷程資料。」，不建立空卡片或示範資料。

目前（2026-11-14 截止）：154 筆任期、1,045 筆活動、25 筆專案、851 筆提案、327 筆表決、714 筆來源；68 位有紀錄、38 位查無可查證紀錄。

## 家族政商關係

- 公開層只收錄「親屬關係」與「該親屬的合格職務」**各自**有來源支持的紀錄；schema 以 `kinshipSourceIds` 與 `positionSourceIds` 強制分離，公司揭露或職務報導都不算親屬證據。
- 親屬範圍：父母、配偶、子女、兄弟姊妹、祖父母為主；岳父母、姻親、叔伯姑姨等其他可獨立查證的親屬為輔。同姓、同公司、同鄉、同場合、照片、社群互動都不是關係證據。
- 合格職務分五大類，全部以 `organizationType` + `positionCategory` + `listingStatus` 表達：
  1. 政治與政府（`government`、`legislature`、`political_organization`）：民選代表、縣市長、部會首長、政務任命、機關高階主管。
  2. 上市櫃公司（`corporation` 且 `listingStatus` 為 `listed` 或 `otc`）。
  3. 企業與集團（`corporation` 未上市櫃或未確認、`business_group`）：創辦人、董事長、總經理、執行長、董事、有決策權的高階主管。
  4. 基金會（`foundation`）。
  5. 大型非營利組織（`nonprofit`）。
- `positionCategory` 的 `board`（董事會）與 `executive`（經營團隊）不得互換；「榮譽董事長」不是現任董事長，「顧問」不是董事，基金會董事不是基金會執行長。一般員工、被動會員、掛名榮譽職不收錄。
- 現任（`current-officeholder`、`current-candidate`）不得有結束日期；已卸任但查不到結束日期時保留空值並標「期間未詳」，不得編造年份或屆次。現任與歷史職務都收錄，同一親屬可有多個組織與職務。
- 查核與發布分離：研究檔的職務主張需經**未產出該 claim 的另一個 agent** 獨立重抓來源查核，才可能進入 `verified`；任一項缺證據即 `unresolved`，同名誤認或矛盾即 `rejected`。機器查核不等於人工審查或編輯核准。經使用者明確授權時，已 verified 的關係可由獨立查核 agent 核准（`agentApprovals`、`approvalBasis: agent-verification`），但必須與人工核准分開記錄，且不得標成人工審查。
- 關係方向一律記錄「相對人對候選人的角色」（例如「父親」代表該親屬是候選人的父親）。同一候選人的同一姓名若出現方向矛盾（同時被列為父親與兒子），一律不得 verified，並產生待複查發現；獨立查核檔為 data/research/2026/political-family/verification-networks-NN.json。
- 同一候選人、同一姓名若在不同批次或查核檔重複出現，generator 先以查核記錄的關係型別與方向過濾，再以已核准 ID、網路研究來源、明確型別等排序保留一筆；不得讓同一親屬以矛盾方向並存。
- 三個閘門互不取代：研究（networks/batch-NN.json）→ 獨立查核（verification-networks-NN.json）→ 核准（publication-approval.json：人工 `approvedRelationshipIds` 或經授權的 `agentApprovals`）。已查核但未核准的關係寫入 reports/political-family-approvals-pending.json，核准後又被撤銷者寫入 reports/political-family-withdrawals.json，兩者都不會進入公開層。已 verified 但查無合格職務的親屬關係寫入 reports/political-family-verified-without-position.json，保留在研究層，不列為待核准工作。
- Agent 核准的關係在 read model 標示 `agentApproved`，UI 必須同時以文字說明「由 agent 查核核准，非人工編輯審查」。
- 查核檔案以 batch 為單位平行產出，合併指令為 `npm run political-family:verify:merge`（輸出 data/research/2026/political-family/verification-networks.json）；之後重跑 `npm run political-family:generate` 與 `npm run validate:political-family`。查核記錄的親屬方向若與研究主張相反，該關係不得 verified。
- 呈現為可展開的關係圖與清單，文字先於圖形；agent 核准的關係需有可見標示；節點只顯示分類計數，選取親屬後才列出完整職務（組織、職稱、類別、上市櫃狀態、現任／曾任、日期、來源）。分類同時以文字與顏色標示。
- 查無合格親屬時寫「目前尚無已查證且符合收錄條件的親屬資料。」，不得寫成「沒有政商關係」；空白不代表不存在。
- 家族與企業關係不是貪腐、不當影響或利益輸送的證據，不得暗示；不刊登住址、私人聯絡方式或其他非公開親屬的隱私。

- 更正檔與查核分離：研究或查核檔案發現「關係成立、但某項職務主張過度」時，只能透過 data/research/2026/political-family/verification-corrections.json 記錄移除的職務、理由、重讀來源與更正後職務，不得改寫獨立查核輸出。generator 套用後重算關係 ID 並輸出 reports/political-family-corrections.json；validator 要求更正後的關係為 verified、職務來源存在、移除的主張不再出現，且候選人研究狀態與更正一致。此為 agent 證據更正，不是人工審查或編輯核准。
- 2026-11-16 更正：4 筆原本因單一過度職務主張而未解的關係（盧天麟、李榮宗、陳清玉、曾長發）在移除該主張後維持 verified 並公開；鄭孟洽由 unresolved 改列 searched-no-verified-relations，因其僅有姓名相似疑慮，後續精確檢索未找到關係。更正後研究層 62 筆關係（59 verified／2 pending-review／1 rejected）、106 位候選人（37 verified-relations-found／67 searched-no-verified-relations／2 unresolved），公開 58 筆關係、55 位親屬、99 筆職務。
- 第二輪查核：67 位 searched-no-verified-relations 的批次與研究契約在 data/research/2026/political-family/second-pass/（8 批、7–9 人）；輸出只供後續查核與整合，不得直接寫入公開層。

## 共同規則

- **中立與等價**：所有候選人使用相同版面、字級、視覺與資料類別；不以人氣、外貌、民調、財富、影響力或個性排序。
- **歸因**：候選人陳述標為 `candidate-statement`；公開紀錄中的參與標為 `documented-participation`；機關結果需 `institutional-outcome` 證據；背景脈絡標為 `editorial-context`。
- **不推論**：不得由姓名、圖像、職務、政黨或空白欄位推論親屬、動機、違法、政策成果或政治關係。
- **缺口即缺口**：未查證、待審、來源不可達一律中性呈現，不以空白或示範資料填充。
- **不背書**：本站不代表任何候選人、政黨、選委會或政府機關；3D 角色是原創通用模型，不是 likeness。
- **來源可見**：每項刊登事實都能連回支持它的證據與日期；UI 以來源標籤呈現，內部研究欄位（evidence 摘錄、歸因依據）不鋪在一般介面。
