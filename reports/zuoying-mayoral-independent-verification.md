# 左營／市長範圍 independent verification

Stratified reopening of immutable local snapshots. This is independent of normalization: each sample rehashes the raw bytes and rechecks candidate identity, direct evidence linkage, attribution, and temporal precision.

- Samples：13
- Matches：13
- Discrepancies：0
- Insufficient：0
- Blocked samples：7
- Categories：basic-biography、policies、public-records、news、relationships、timeline
- Candidate groups：district-4、mayoral
- Timestamp qualities：capture-file-mtime、source-header、unavailable

| Sample | 候選人 | 範圍 | 類別 | Claim | Source | 時間品質 | 結果 | 差異 |
|---|---|---|---|---|---|---|---|---|
| zuoying-mayoral-independent-01 | 黃文志 | district-4 | basic-biography | enrich-claim-0001 | scope-kcc-profile-2185 | capture-file-mtime | matches | — |
| zuoying-mayoral-independent-02 | 黃文志 | district-4 | policies | enrich-claim-0011 | scope-kcc-profile-2185 | capture-file-mtime | matches | — |
| zuoying-mayoral-independent-03 | 王肇民 | mayoral | public-records | enrich-claim-0125 | scope-news-wang-zhaomin-ebc | source-header | matches | — |
| zuoying-mayoral-independent-04 | 柳淑芳 | district-4 | news | enrich-claim-0037 | scope-news-liu-shufang-udn | source-header | matches | — |
| zuoying-mayoral-independent-05 | 陳冠宇 | district-4 | relationships | enrich-claim-0085 | scope-news-chen-guanyu-udn | source-header | matches | — |
| zuoying-mayoral-independent-06 | 柳淑芳 | district-4 | timeline | enrich-claim-0038 | scope-news-liu-shufang-udn | source-header | matches | — |
| zuoying-mayoral-independent-07 | 黃文志 | district-4 | basic-biography | enrich-claim-0002 | scope-kcc-profile-2185 | capture-file-mtime | matches | — |
| zuoying-mayoral-independent-08 | 張靜 | mayoral | basic-biography | enrich-claim-0119 | scope-cec-qualification | unavailable | matches | — |
| zuoying-mayoral-independent-09 | 柳淑芳 | district-4 | policies | enrich-claim-0036 | scope-news-liu-shufang-udn | source-header | matches | — |
| zuoying-mayoral-independent-10 | 黃文志 | district-4 | basic-biography | enrich-claim-0003 | scope-kcc-profile-2185 | capture-file-mtime | matches | — |
| zuoying-mayoral-independent-11 | 王肇民 | mayoral | basic-biography | enrich-claim-0124 | scope-cec-qualification | unavailable | matches | — |
| zuoying-mayoral-independent-12 | 李雅芬 | district-4 | policies | enrich-claim-0023 | scope-kcc-profile-2187 | capture-file-mtime | matches | — |
| zuoying-mayoral-independent-13 | 黃文志 | district-4 | basic-biography | enrich-claim-0004 | scope-kcc-profile-2185 | capture-file-mtime | matches | — |

每個 sample 都重新開啟 immutable raw snapshot、比對 SHA-256/byte length，並重新確認 identity observation、direct evidence、attribution 與 temporal precision。此檢查不等於人工核准。
