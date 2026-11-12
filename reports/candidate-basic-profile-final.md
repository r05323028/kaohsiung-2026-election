# 2026 高雄候選人基本資料最終報告

- 產生時間：2026-11-12T02:22:08.440Z
- 名冊：106 位（市長 5、市議員 101）
- 政策：獨立機器查核（basic-profile-machine-verification-v1），非人工編輯核准

## 方法

- 名冊佇列：106 位候選人分為 9 個批次，逐批研究與查核。
- 研究：`candidate-researcher` 使用獨立 context，讀取名冊、既有快照與多類公開來源，輸出結構化 claims 與 gaps。
- 查核：`candidate-verifier` 使用另一個獨立 context，重新開啟來源、重算 SHA-256、比對逐字摘錄、確認身分與欄位，對每一筆 claim 給出 verdict。
- 發布：只有同時通過身分、來源、逐字摘錄、四項檢查與政策規則的 claim 才進入公開快照；其餘留在研究層並記錄原因。

## 總覽

| 指標 | 結果 |
| --- | --- |
| Total candidates | 106 |
| Candidates researched | 106 |
| Candidates independently checked | 103 |
| Candidates with additional verified information | 103 |
| Verified claims | 830 |
| Published claims | 829 |
| Candidates with published claims | 103 |
| Blocked claims (verification or policy) | 31 |
| Candidates with blocked claims | 25 |
| Candidates needing additional evidence | 55 |
| Identity conflicts | 1 |
| Candidates with remaining core-field gaps | 57 |
| Candidates with no published claim | 3 |

## 覆蓋變化

| 階段 | 已發布主張 | 有已發布資料的候選人 |
| --- | --- | --- |
| 本次變更前 | 0 | 0 |
| 本次變更後 | 829 | 103 |

- 變更前：本次變更前沒有基本資料發布快照；既有履歷發布為 0 筆人工編輯核准紀錄。
- 變更後：獨立機器查核通過後發布；非人工編輯核准。

## 欄位覆蓋

| 欄位 | 有已發布資料的候選人 | 已發布主張 |
| --- | --- | --- |
| education | 77 | 218 |
| professional-experience | 83 | 293 |
| public-service | 73 | 196 |
| current-position | 65 | 65 |
| official-website | 14 | 14 |
| biographical-note | 38 | 43 |

## 選區分布

| 選區 | 候選人 | 已研究 | 已獨立查核 | 有查核資訊 | 查核通過主張 | 已發布主張 | 核心欄位仍有缺口 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 高雄市長選舉 | 5 | 5 | 5 | 5 | 27 | 27 | 5 |
| 高雄市議員第1選舉區 | 5 | 5 | 5 | 5 | 42 | 42 | 3 |
| 高雄市議員第2選舉區 | 5 | 5 | 5 | 5 | 34 | 34 | 3 |
| 高雄市議員第3選舉區 | 8 | 8 | 8 | 8 | 42 | 42 | 4 |
| 高雄市議員第4選舉區 | 12 | 12 | 12 | 12 | 96 | 96 | 5 |
| 高雄市議員第5選舉區 | 7 | 7 | 7 | 7 | 86 | 86 | 2 |
| 高雄市議員第6選舉區 | 4 | 4 | 4 | 4 | 52 | 52 | 0 |
| 高雄市議員第7選舉區 | 12 | 12 | 11 | 11 | 91 | 91 | 8 |
| 高雄市議員第8選舉區 | 9 | 9 | 9 | 9 | 51 | 50 | 7 |
| 高雄市議員第9選舉區 | 10 | 10 | 10 | 10 | 116 | 116 | 2 |
| 高雄市議員第10選舉區 | 13 | 13 | 11 | 11 | 84 | 84 | 9 |
| 高雄市議員第11選舉區 | 6 | 6 | 6 | 6 | 51 | 51 | 2 |
| 高雄市議員第12選舉區 | 3 | 3 | 3 | 3 | 18 | 18 | 1 |
| 高雄市議員第13選舉區 | 2 | 2 | 2 | 2 | 17 | 17 | 1 |
| 高雄市議員第14選舉區 | 3 | 3 | 3 | 3 | 16 | 16 | 3 |
| 高雄市議員第15選舉區 | 2 | 2 | 2 | 2 | 7 | 7 | 2 |

## 來源品質

- 唯一來源出版者：13
- 已發布主張的來源類別：

| 來源類別 | 主張數 |
| --- | --- |
| kcc-member-profile | 582 |
| cec-election-bulletin | 122 |
| reputable-news | 94 |
| political-party-site | 15 |
| candidate-official-site | 7 |
| kcc-current-member-directory | 7 |
| government-record | 2 |

## 查核結果

| 結果 | 主張數 |
| --- | --- |
| verified | 830 |
| partially-supported | 27 |
| conflicting-evidence | 3 |

| 發布處置 | 主張數 |
| --- | --- |
| publication-eligible | 829 |
| blocked-verdict | 30 |
| blocked-policy | 1 |

## 剩餘缺口

| 欄位 | 尚無已發布資料的候選人 |
| --- | --- |
| official-website | 92 |
| biographical-note | 68 |
| current-position | 41 |
| public-service | 33 |
| education | 29 |
| professional-experience | 23 |

缺口原因包含：來源未保留、查核未通過、身分無法確認、僅有候選人自述、2026 選舉公報尚未發布。未知欄位不以推測補齊。

## 無已發布主張的候選人

| 候選人 | 選區 | 身分狀態 | 研究狀態 | 原因 |
| --- | --- | --- | --- | --- |
| 鄭孟洽 | 高雄市議員第7選舉區 | conflict | publication-blocked | 名冊姓名「鄭孟洽」與中選會2026年候選人姓名「鄭孟洳」相差一字；同為第7選區、號次9、出生1990-12-14、民進黨，高雄市議會本屆議員簡介亦列「鄭孟洳」（msn 2203）。未靜默合併，亦未套用鄭孟洳之學經歷，待名冊更正後再行研究。 |
| 劉仙娥 | 高雄市議員第10選舉區 | resolved | needs-additional-evidence | 僅於新聞標題索引見到「勞動黨劉仙娥登記參選高雄市議員」（2026年9月）等條目，未能取得可引用的報導內文，故未新增任何主張。 |
| 張藝瑾 | 高雄市議員第10選舉區 | resolved | needs-additional-evidence | 以姓名檢索中華日報、自由時報、今傳媒及Yahoo新聞等來源均無結果，除名冊資料外未取得任何可引用的公開來源。 |

## 未發布主張與原因

| 候選人 | 欄位 | 內容 | 處置 | 原因 |
| --- | --- | --- | --- | --- |
| 柯志恩 | public-service | 立法委員 | blocked-verdict | Verifier verdict: partially-supported. 官網經歷欄僅列「立法委員」未載屆次與是否在任，故 value 本身有據；但立法院現任委員名錄（data/biographies/raw/2026-11-06/ly/ly-members.html）列有「柯志恩委員」，其現職為第11屆立法委員，currentStatus=unknown 低估事實，應為 current。｜身分：國民黨官網候選人頁 title「柯志恩｜國民黨高雄市長候選人」、頁面載編號「3 柯志恩」，姓名、政黨與參選職務與名冊相符。 |
| 賴瑞隆 | public-service | 第9屆至第11屆立法委員 | blocked-verdict | Verifier verdict: partially-supported. 官網經歷列「第9～11屆立法委員」，value 展開為「第9屆至第11屆立法委員」語意相符；但立法院現任委員名錄列有「賴瑞隆委員」，第11屆仍在任，currentStatus=unknown 低估事實。｜身分：官網 title「南方崛起 邁向國際 ｜賴瑞隆」，立法院現任委員名錄亦列「賴瑞隆委員」。 |
| 鍾炳光 | biographical-note | 2024年12月以高雄市大寮區區長身分出席「2024大寮紅豆花田季」宣傳 | blocked-verdict | Verifier verdict: partially-supported. 自由時報 2024-12-12 報導為活動前訪問：「大寮區區長鍾炳光表示，今年活動擴大辦理…」，活動於 12/14–15 舉行，報導未載其出席，故「出席…宣傳」為過度推論；日期、職稱與活動名稱相符。另 claim URL 為 /news/life/…4891857，而保留快照檔名為 …_news_politics_…4891857，快照內 canonical 連結確為 life 路徑，屬存檔命名慣例。｜身分：自由時報具名「美濃區公所區長鍾炳光」與「客家事務委員會主任秘書鍾炳光」，職務序列與名冊 district-01 相符。 |
| 陳琳潔 | professional-experience | 會計師（具台灣、美國會計師資格） | blocked-verdict | Verifier verdict: partially-supported. 以 curl 於 2026-11-12 重抓 https://news.ltn.com.tw/news/Kaohsiung/breakingnews/5617517（HTTP 200，title 與 2026-10-24 發布時間相符），報導原文：「唯一具「台美雙會計師」資格的民進黨籍市議員候選人陳琳潔競選總部今成立」「賴瑞隆介紹陳琳潔是…台、美雙會計師」，僅陳述其「資格」，未載執業機構、執業事實或會計師職務；宣稱 value 卻寫成職業「會計師」並以 professional-experience 呈現，organization 填「會計師」，超出原文。 |
| 方信淵 | public-service | 高雄市議會第1至3屆議員 | blocked-verdict | Verifier verdict: partially-supported. 重開高雄市議會本屆議員簡介 msn=2179（快照 SHA-256 5008a6ab…與宣稱一致），「經歷」欄末項原文為「高雄市議會1∼3屆議員(現任)」：屆次部分支持 value，但原文括號「(現任)」被刪去，且 value 將「1∼3屆」改寫為「第1至3屆」。議會本屆議員選區列表（115-11-11）確列方信淵於第03選區，故其現職為第四屆議員，原文「(現任)」與第1至3屆並列本身自相矛盾；以 historical 記錄屆次並另立 cur-25 記錄現職的處理方向正確，但 value 非來源逐字。 |
| 陳冠宇 | biographical-note | 將交棒兒子陳冠宇 | blocked-verdict | Verifier verdict: partially-supported. 原文為「無黨籍高市議員陳善慧今正式宣布將交棒兒子陳冠宇，希望左楠鄉親繼續支持，陳冠宇則爆料是他主動爭取接棒…」，另有另一句「高雄第4選區（左營、楠梓）現任無黨籍議員陳善慧深耕地方多年」。研究者 excerpt 把兩處拼接成一句（前 24 字相符後即跳接，中間省略「陳冠宇則爆料是他主動爭取接棒」），非連續引文，不符合 excerpt 須逐字連續的要求，故 matchesClaim=false。事實本身（交棒兒子陳冠宇、左楠第4選區、陳善慧為現任無黨籍議員）在原文均可查，故僅為 partially-supported；2026-07-24 報導亦已預告同一交棒安排。 |
| 薛兆基 | professional-experience | 謝長廷市長機要秘書 | blocked-verdict | Verifier verdict: partially-supported. 引文逐字相符，但該句出自 5465924 對「台灣前進陣線」第四波提名記者會的報導，內容即提名方提供之參選人背景（候選方文宣性質），全篇以其「曾任…」直述而未標明消息來源；「謝長廷市長機要秘書」僅此單一來源，無獨立機構紀錄互證（同段之葉菊蘭辦公室主任另有 5089483 佐證，此項則無）。依 docs/BASIC_PROFILE_PUBLICATION.md 對僅有競選文宣或新聞報導之候選人「這些欄位會保持未知」之原則，不宜以 independently-corroborated 發布。identity 與職稱本身無誤。 |
| 曾俊傑 | public-service | 高雄市第七屆議員。 | blocked-verdict | Verifier verdict: conflicting-evidence. 市議會官網（2026-11-12 重取 msn=2205，頁標題「本屆議員-曾俊傑」，與快照 sha256 cf3f4704… 相同）經歷欄作「高雄市第七屆議員。」，與宣稱一致；但我另行重開 2022 年高雄市第4屆議員選舉公報第 2 頁（sha256 fc917d51…），同一候選人（號次7、中國國民黨）經歷欄作「高雄市第八屆議員。大高雄第一、二、三屆議員。」兩份官方文件對改制前屆次記載互相矛盾（合併後並無「第八屆」編號，公報該行疑為誤植），宣稱未反映此衝突。 |
| 康裕成 | public-service | 民進黨發言人(2011年-2012年) | blocked-verdict | Verifier verdict: partially-supported. 事實與日期均獲雙重佐證（市議會 2201 頁與 2022 年公報第3頁同載「民進黨發言人(2011年-2012年)」），惟民進黨發言人屬政黨職務而非公職，列為 public-service 與本批其他政黨職務的處理不一致：曾俊傑「中國國民黨中央評議委員」、「三民區國民黨部副主委」及黃柏霖「中央組織發展委員會青年部主任」皆列 professional-experience。 |
| 黃柏霖 | education | 國立中山大學公共事務管理研究所博士生。 | blocked-verdict | Verifier verdict: conflicting-evidence. 市議會官網（2026-11-12 重取 msn=2199，頁標題「本屆議員-黃柏霖」）學歷欄仍列「國立中山大學公共事務管理研究所博士生」，與宣稱一致；但 2022 年選舉公報第 3 頁（sha256 fc917d51…）同一候選人（號次12）學歷欄作「…國立中山大學公共事務管理研究所博士。」已載為取得學位。官網與公報對是否已完成博士學位說法不同，宣稱僅取其一且未標註。 |
| 黃柏霖 | public-service | 中國國民黨高雄市市黨部主任委員 | blocked-verdict | Verifier verdict: partially-supported. 市議會 2199 頁與 2022 年公報第3頁均載「中國國民黨高雄市市黨部主任委員」，文字無誤；但市黨部主委屬政黨職務而非公職，且同批黃柏霖「中國國民黨中央組織發展委員會青年部主任」(exp-58) 列為 professional-experience，同一類職務分列兩個欄位，屬欄位歸類不一致。 |
| 黃文益 | education | 國立高雄師範大學博士班(博士候選人) | blocked-verdict | Verifier verdict: partially-supported. 重開 KCC 議員簡介快照 data/biographies/raw/2026-11-06/kcc/profiles/2207.html（SHA-256 86efdc0cf9bccda4… 與來源記載一致），頁面標題「高雄市議會全球網-中文網-本屆議員-黃文益」，msn 2207，與黃文益（第8選舉區）身分相符。條目文字逐字相符（「國立高雄師範大學博士班(博士候選人)」），但位於「經歷：」區塊，不在「學歷：」區塊；KCC 頁面自身把它歸在經歷。內容雖屬就學資訊，來源分類與 claims 之 education 欄位不一致，故不予 verified。 |
| 黃鈺婷 | current-position | 高雄市立空中大學教職 | blocked-policy | Current-position claims require institutional or corroborated evidence. |
| 張漢忠 | education | 和春技術學院肄業 | blocked-verdict | Verifier verdict: partially-supported. 重開 KCC 議員簡介快照 data/biographies/raw/2026-11-06/kcc/profiles/2217.html（SHA-256 7dfbfd4c438a0555… 與來源記載一致），頁面標題「高雄市議會全球網-中文網-本屆議員-張漢忠」，msn 2217，與張漢忠（第9選舉區）身分相符。條目文字逐字相符（「和春技術學院肄業」），但位於「經歷：」區塊，不在「學歷：」區塊；KCC 頁面自身把它歸在經歷。內容雖屬就學資訊，來源分類與 claims 之 education 欄位不一致，故不予 verified。 |
| 李雅靜 | education | 國立中山大學環境工程研究所博士。 | blocked-verdict | Verifier verdict: conflicting-evidence. 兩份官方紀錄互相矛盾：高雄市議會本屆議員簡介（快照 2213.html，SHA-256 d3130391…）學歷欄逐字列出「國立中山大學環境工程研究所博士」；但中選會 2022 年高雄市第9選舉區選舉公報（留存 d9.pdf，SHA-256 cca6001d…，第 2 頁）學歷欄只寫「中山大學公共事務管理研究所碩士、輔英技術學院環境工程衛生系、大仁藥專工業安全衛生科、鳳西國中、鳳山國小」，而經歷欄寫的是「中山大學環工所博士候選人」。同一候選人的兩份官方文件對博士學位有無記載不一致，且未找到中山大學博士學位紀錄或其他獨立佐證；維基百科雖記為博士，但引用來源為自述與衍生資料，不可作為獨立事實。 |
| 鍾易仲 | public-service | 高雄市議員 | blocked-verdict | Verifier verdict: partially-supported. 重讀留存 KCC 簡介 2212.html（SHA-256 bef72179…）確認經歷欄最後一項逐字為「高雄市議員」，但這是鍾易仲現仍擔任的職務（同一候選人的 cur-41 已列「高雄市議員（本屆）」），本筆卻標為 historical 且無起訖屆次，與 cur-41 形成同一職務既「歷史」又「現任」的重複與狀態矛盾；KCC 頁面本身是「本屆議員」簡介，並未把它列為已結束的職務。 |
| 鄧巧佩 | professional-experience | 護理師 | blocked-verdict | Verifier verdict: partially-supported. 重抓 https://www.cdns.com.tw/articles/1355338（HTTP 200）確認原文僅有鄭孟洳站台時所稱「巧佩具備護理師背景」及候選人自述「自己出身護理專業／護理師的養成教育」，全篇沒有任職醫院、職稱、年資或護理師證書字號。這是同黨議員的輔選推薦語加上本人自述，屬候選人陳述層級，不足以把「護理師」升格為獨立查證的專業工作經歷，也不需要專業證照紀錄才能成立。 |
| 鄧巧佩 | biographical-note | 護理師出身，2026年參選鳳山區市議員，為兩個孩子的母親。 | blocked-verdict | Verifier verdict: partially-supported. 重抓 https://focusnews.com.tw/2026/11/729229/（HTTP 200）確認該文為候選人第一人稱的競選投書（「這樣的心情，我懂」「未來進入市議會，我會全力爭取」），標題為「護理師出身 鄧巧佩以專業守護孩子健康」，內文只說她是「高雄市議員參選人」與「兩個孩子的媽媽」，完全沒有出現「鳳山區」；鳳山區的身分需由另一篇報導（1355338）支撐。以競選文宣作為 biographical-note 並冠上 independently-corroborated 屬舉證層級偏高。 |
| 于仙玲 | public-service | 高雄市第3屆議員候選人 | blocked-verdict | Verifier verdict: partially-supported. 重讀留存公報 d10.pdf（SHA-256 9c849971…，第 2 頁）確認「高雄市第3屆議員候選人」逐字出現在經歷欄，但這是 2018 年參選第3屆市議員的候選身分，不是當選或任命的公職，也不是公共服務職務；把它列為 public-service（公共服務經歷）等於把候選資格當成服務資歷，欄位歸類不成立。 |
| 于仙玲 | professional-experience | 小民參政歐巴桑聯盟推薦候選人 | blocked-verdict | Verifier verdict: partially-supported. 重讀留存公報 d10.pdf 第 2 頁確認「小民參政歐巴桑聯盟推薦候選人」逐字出現在經歷欄，但這是政黨提名／推薦的候選身分，不是專業或工作職務；列為 professional-experience（專業與工作經歷）屬欄位錯置。她真正的專業經歷是同欄的高雄榮民總醫院病房護理師、阮綜合醫院門診護理師、ABC 牙醫聯盟植牙中心開刀房護理師（已另立 claims 並通過）。 |
| 黃敬雅 | biographical-note | 原為台灣基進黨員，後退出並加入民進黨，2026 年議員初選以婦女保障名額勝出 | blocked-verdict | Verifier verdict: partially-supported. ltn-5598046 逐字為「後來黃敬雅退出台灣基進，加入民進黨，參加議員初選，以婦女保障名額，擠下現任議員黃彥毓而勝出，再度角逐高雄市第十選舉區（前鎮區、小港區）議員」，核心事實（退出基進、加入民進黨、以婦女保障名額擠下現任黃彥毓）完全支持；但全文未載初選年份，「2026 年」是依報導時點（2026-10-07、談 2026 選舉）推定，屬來源未明示之加註。 |
| 邱于軒 | education | 元智大學資訊傳播學系 | blocked-verdict | Verifier verdict: partially-supported. 重讀留存快照 data/biographies/raw/2026-11-06/kcc/profiles/2227.html，「元智大學資訊傳播學系」確實逐字存在，但位置落在「經歷：」段，緊接「輔英科技大學業界講師」，且未載學位或職稱；2022 年選舉公報 d11 第1頁也把它列在經歷欄。其學歷欄另有密西根州立大學、高雄醫學大學兩項碩士，故此條較可能是任教／任職單位而非就學紀錄，欄位歸類與來源不符。身分由 KCC 簡介＋2026 中選會第11選區 3 號（1982-04-22、中國國民黨）確認。 |
| 張耀中 | professional-experience | 陳其邁隨行秘書 | blocked-verdict | Verifier verdict: partially-supported. ltn-5635570 逐字「張耀中曾擔任陳其邁7年的隨行秘書，從立委、行政院副院長、高雄市長，總共2526天」，職稱、「曾」與 2,526 天皆與 claim/detail 相符；惟來源明示為過去職務，claim 的 currentStatus 卻記為 unknown，與來源時態不一致（他現為 2026 候選人，該職已結束）。 |
| 宋紹銘 | biographical-note | 2026 年獲中國國民黨提名參選第12選舉區（平地原住民）市議員；該區國民黨未提名現任議員王義雄，王義雄亦登記參選 | blocked-verdict | Verifier verdict: partially-supported. 原文為「國民黨因故未提名現任議員王義雄，開放黨內有志之士參選」，並未稱宋紹銘「獲中國國民黨提名」；亦僅稱王義雄「尋求連任」，未載其「登記參選」。宣稱把「開放黨內參選」升級為「獲提名」，並加入報導未述之登記事實。 |
| 王義雄 | professional-experience | 中國國民黨高雄市黨部原住民工作會長、副會長 | blocked-verdict | Verifier verdict: partially-supported. 來源原文為「高雄市黨部原住民工作會長、副會長」，未冠「中國國民黨」；政黨名稱係由前一行「中國國民黨原住民族委員會委員」推得，屬研究者推論而非來源文字。 |
| 王義雄 | professional-experience | 中國國民黨左楠區黨部委員、小組長、志工團副團長 | blocked-verdict | Verifier verdict: partially-supported. 來源原文為「左楠區黨部委員、小組長、志工團副團長」，未載「中國國民黨」；黨名同屬由相鄰欄位推得。 |
| 王義雄 | biographical-note | 2026 年中國國民黨未提名其競選連任，仍登記參選第12選舉區，與同黨宋紹銘同區競選 | blocked-verdict | Verifier verdict: partially-supported. 報導稱「國民黨因故未提名現任議員王義雄，開放黨內有志之士參選。除王義雄尋求連任外…藍營投票恐出現分裂」，支持「未提名其競選連任」與同區藍營競爭；但報導未使用「登記參選」字樣（8 月 2 日尚未登記），宣稱多出此一事實。 |
| 陳幸富 | education | 警察專科學校警員班134期 | blocked-verdict | Verifier verdict: partially-supported. 「警察專科學校警員班134期」在同頁與 2022 年公報中均列於「經歷」欄（警職訓練資歷），非「學歷」欄；以 education 欄位呈現與來源分類不符。 |
| 林錫閔 | education | 國防大學戰略學部92年班 | blocked-verdict | Verifier verdict: partially-supported. 「國防大學戰略學部92年班」在公報列於「經歷」欄（軍事進修班隊），非「學歷」欄；以 education 呈現與來源分類不符。 |
| 林錫閔 | education | 國立中山大學社會系原碩專班 | blocked-verdict | Verifier verdict: partially-supported. 「國立中山大學社會系原碩專班」亦列於公報「經歷」欄，非「學歷」欄；且原文為「原碩專班」（原住民碩士專班），宣稱照錄但欄位歸屬與來源不符。 |
| 高忠德 | public-service | 高雄市政府顧問 | blocked-verdict | Verifier verdict: partially-supported. 「高雄市政府顧問」僅見於同頁「服務政見」自述文字「於擔任高雄市政府顧問一職」，非「經歷」欄之機構紀錄；以 institutional-record 歸因呈現公職經歷，等於把候選人自述升級為機構事實。 |

## 自動化檢查（本次發布前）

| 指令 | 結果 |
| --- | --- |
| npm run typecheck | 0 errors |
| npx vitest run | 31 files, 189 tests passed |
| npm run build | 126 pages, all validators passed |
| npm run test:e2e | 82 tests passed |
| scripts/basic-profile/check-batch.ts | 9/9 researcher and 9/9 verifier batches valid |
