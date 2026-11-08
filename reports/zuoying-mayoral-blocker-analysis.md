# 左營／市長範圍 blocker analysis

- 原始 blocker rows：107
- 受影響 audit：75
- 機器解決：0
- 仍阻擋：107
- 中性缺口：60

每一列 blocker 都保留原始 audit 與 claim 關聯；同一 audit 的多列不合併。

| Blocker ID | Audit | 候選人 | 類別 | 分類 | Claim IDs | 最終狀態 |
|---|---|---|---|---|---|---|
| enrich-blocker-enrich-audit-001-01 | enrich-audit-001 | 黃文志 | basic-biography | currentness | enrich-claim-0001, enrich-claim-0002, enrich-claim-0003, enrich-claim-0004, enrich-claim-0005, enrich-claim-0006, enrich-claim-0007, enrich-claim-0008, enrich-claim-0009, enrich-claim-0010 | remaining-blocked |
| enrich-blocker-enrich-audit-002-01 | enrich-audit-002 | 黃文志 | policies | candidate-attribution | enrich-claim-0011 | remaining-blocked |
| enrich-blocker-enrich-audit-003-01 | enrich-audit-003 | 黃文志 | public-records | coverage-gap | — | remaining-blocked |
| enrich-blocker-enrich-audit-003-02 | enrich-audit-003 | 黃文志 | public-records | missing-public-record-evidence | — | remaining-blocked |
| enrich-blocker-enrich-audit-004-01 | enrich-audit-004 | 黃文志 | news | coverage-gap | — | remaining-blocked |
| enrich-blocker-enrich-audit-005-01 | enrich-audit-005 | 黃文志 | relationships | coverage-gap | — | remaining-blocked |
| enrich-blocker-enrich-audit-005-02 | enrich-audit-005 | 黃文志 | relationships | sensitive-relationship-evidence | — | remaining-blocked |
| enrich-blocker-enrich-audit-006-01 | enrich-audit-006 | 黃文志 | timeline | coverage-gap | — | remaining-blocked |
| enrich-blocker-enrich-audit-007-01 | enrich-audit-007 | 李雅芬 | basic-biography | currentness | enrich-claim-0012, enrich-claim-0013, enrich-claim-0014, enrich-claim-0015, enrich-claim-0016, enrich-claim-0017, enrich-claim-0018, enrich-claim-0019, enrich-claim-0020, enrich-claim-0021, enrich-claim-0022 | remaining-blocked |
| enrich-blocker-enrich-audit-008-01 | enrich-audit-008 | 李雅芬 | policies | candidate-attribution | enrich-claim-0023 | remaining-blocked |
| enrich-blocker-enrich-audit-009-01 | enrich-audit-009 | 李雅芬 | public-records | coverage-gap | — | remaining-blocked |
| enrich-blocker-enrich-audit-009-02 | enrich-audit-009 | 李雅芬 | public-records | missing-public-record-evidence | — | remaining-blocked |
| enrich-blocker-enrich-audit-010-01 | enrich-audit-010 | 李雅芬 | news | coverage-gap | — | remaining-blocked |
| enrich-blocker-enrich-audit-011-01 | enrich-audit-011 | 李雅芬 | relationships | coverage-gap | — | remaining-blocked |
| enrich-blocker-enrich-audit-011-02 | enrich-audit-011 | 李雅芬 | relationships | sensitive-relationship-evidence | — | remaining-blocked |
| enrich-blocker-enrich-audit-012-01 | enrich-audit-012 | 李雅芬 | timeline | coverage-gap | — | remaining-blocked |
| enrich-blocker-enrich-audit-013-01 | enrich-audit-013 | 白喬茵 | basic-biography | currentness | enrich-claim-0024, enrich-claim-0025, enrich-claim-0026, enrich-claim-0027, enrich-claim-0028, enrich-claim-0029, enrich-claim-0030, enrich-claim-0031, enrich-claim-0032, enrich-claim-0033, enrich-claim-0034 | remaining-blocked |
| enrich-blocker-enrich-audit-014-01 | enrich-audit-014 | 白喬茵 | policies | candidate-attribution | enrich-claim-0035 | remaining-blocked |
| enrich-blocker-enrich-audit-015-01 | enrich-audit-015 | 白喬茵 | public-records | coverage-gap | — | remaining-blocked |
| enrich-blocker-enrich-audit-015-02 | enrich-audit-015 | 白喬茵 | public-records | missing-public-record-evidence | — | remaining-blocked |
| enrich-blocker-enrich-audit-016-01 | enrich-audit-016 | 白喬茵 | news | coverage-gap | — | remaining-blocked |
| enrich-blocker-enrich-audit-017-01 | enrich-audit-017 | 白喬茵 | relationships | coverage-gap | — | remaining-blocked |
| enrich-blocker-enrich-audit-017-02 | enrich-audit-017 | 白喬茵 | relationships | sensitive-relationship-evidence | — | remaining-blocked |
| enrich-blocker-enrich-audit-018-01 | enrich-audit-018 | 白喬茵 | timeline | coverage-gap | — | remaining-blocked |
| enrich-blocker-enrich-audit-019-01 | enrich-audit-019 | 柳淑芳 | basic-biography | coverage-gap | — | remaining-blocked |
| enrich-blocker-enrich-audit-020-01 | enrich-audit-020 | 柳淑芳 | policies | candidate-attribution | enrich-claim-0036 | remaining-blocked |
| enrich-blocker-enrich-audit-021-01 | enrich-audit-021 | 柳淑芳 | public-records | coverage-gap | — | remaining-blocked |
| enrich-blocker-enrich-audit-021-02 | enrich-audit-021 | 柳淑芳 | public-records | missing-public-record-evidence | — | remaining-blocked |
| enrich-blocker-enrich-audit-023-01 | enrich-audit-023 | 柳淑芳 | relationships | coverage-gap | — | remaining-blocked |
| enrich-blocker-enrich-audit-023-02 | enrich-audit-023 | 柳淑芳 | relationships | sensitive-relationship-evidence | — | remaining-blocked |
| enrich-blocker-enrich-audit-025-01 | enrich-audit-025 | 李眉蓁 | basic-biography | currentness | enrich-claim-0040, enrich-claim-0041, enrich-claim-0042, enrich-claim-0043, enrich-claim-0044, enrich-claim-0045, enrich-claim-0046, enrich-claim-0047 | remaining-blocked |
| enrich-blocker-enrich-audit-026-01 | enrich-audit-026 | 李眉蓁 | policies | candidate-attribution | enrich-claim-0048 | remaining-blocked |
| enrich-blocker-enrich-audit-027-01 | enrich-audit-027 | 李眉蓁 | public-records | coverage-gap | — | remaining-blocked |
| enrich-blocker-enrich-audit-027-02 | enrich-audit-027 | 李眉蓁 | public-records | missing-public-record-evidence | — | remaining-blocked |
| enrich-blocker-enrich-audit-028-01 | enrich-audit-028 | 李眉蓁 | news | coverage-gap | — | remaining-blocked |
| enrich-blocker-enrich-audit-029-01 | enrich-audit-029 | 李眉蓁 | relationships | coverage-gap | — | remaining-blocked |
| enrich-blocker-enrich-audit-029-02 | enrich-audit-029 | 李眉蓁 | relationships | sensitive-relationship-evidence | — | remaining-blocked |
| enrich-blocker-enrich-audit-030-01 | enrich-audit-030 | 李眉蓁 | timeline | coverage-gap | — | remaining-blocked |
| enrich-blocker-enrich-audit-031-01 | enrich-audit-031 | 李雅慧 | basic-biography | currentness | enrich-claim-0049, enrich-claim-0050, enrich-claim-0051, enrich-claim-0052, enrich-claim-0053, enrich-claim-0054, enrich-claim-0055, enrich-claim-0056, enrich-claim-0057 | remaining-blocked |
| enrich-blocker-enrich-audit-032-01 | enrich-audit-032 | 李雅慧 | policies | candidate-attribution | enrich-claim-0058 | remaining-blocked |
| enrich-blocker-enrich-audit-033-01 | enrich-audit-033 | 李雅慧 | public-records | coverage-gap | — | remaining-blocked |
| enrich-blocker-enrich-audit-033-02 | enrich-audit-033 | 李雅慧 | public-records | missing-public-record-evidence | — | remaining-blocked |
| enrich-blocker-enrich-audit-034-01 | enrich-audit-034 | 李雅慧 | news | coverage-gap | — | remaining-blocked |
| enrich-blocker-enrich-audit-035-01 | enrich-audit-035 | 李雅慧 | relationships | coverage-gap | — | remaining-blocked |
| enrich-blocker-enrich-audit-035-02 | enrich-audit-035 | 李雅慧 | relationships | sensitive-relationship-evidence | — | remaining-blocked |
| enrich-blocker-enrich-audit-036-01 | enrich-audit-036 | 李雅慧 | timeline | coverage-gap | — | remaining-blocked |
| enrich-blocker-enrich-audit-037-01 | enrich-audit-037 | 陳玫娟 | basic-biography | currentness | enrich-claim-0059, enrich-claim-0060, enrich-claim-0061, enrich-claim-0062, enrich-claim-0063, enrich-claim-0064, enrich-claim-0065, enrich-claim-0066, enrich-claim-0067, enrich-claim-0068, enrich-claim-0069, enrich-claim-0070, enrich-claim-0071, enrich-claim-0072, enrich-claim-0073, enrich-claim-0074, enrich-claim-0075 | remaining-blocked |
| enrich-blocker-enrich-audit-038-01 | enrich-audit-038 | 陳玫娟 | policies | candidate-attribution | enrich-claim-0076 | remaining-blocked |
| enrich-blocker-enrich-audit-039-01 | enrich-audit-039 | 陳玫娟 | public-records | coverage-gap | — | remaining-blocked |
| enrich-blocker-enrich-audit-039-02 | enrich-audit-039 | 陳玫娟 | public-records | missing-public-record-evidence | — | remaining-blocked |
| enrich-blocker-enrich-audit-040-01 | enrich-audit-040 | 陳玫娟 | news | coverage-gap | — | remaining-blocked |
| enrich-blocker-enrich-audit-041-01 | enrich-audit-041 | 陳玫娟 | relationships | coverage-gap | — | remaining-blocked |
| enrich-blocker-enrich-audit-041-02 | enrich-audit-041 | 陳玫娟 | relationships | sensitive-relationship-evidence | — | remaining-blocked |
| enrich-blocker-enrich-audit-042-01 | enrich-audit-042 | 陳玫娟 | timeline | coverage-gap | — | remaining-blocked |
| enrich-blocker-enrich-audit-044-01 | enrich-audit-044 | 張以理 | policies | coverage-gap | — | remaining-blocked |
| enrich-blocker-enrich-audit-045-01 | enrich-audit-045 | 張以理 | public-records | coverage-gap | — | remaining-blocked |
| enrich-blocker-enrich-audit-045-02 | enrich-audit-045 | 張以理 | public-records | missing-public-record-evidence | — | remaining-blocked |
| enrich-blocker-enrich-audit-047-01 | enrich-audit-047 | 張以理 | relationships | coverage-gap | — | remaining-blocked |
| enrich-blocker-enrich-audit-047-02 | enrich-audit-047 | 張以理 | relationships | sensitive-relationship-evidence | — | remaining-blocked |
| enrich-blocker-enrich-audit-050-01 | enrich-audit-050 | 陳冠宇 | policies | coverage-gap | — | remaining-blocked |
| enrich-blocker-enrich-audit-051-01 | enrich-audit-051 | 陳冠宇 | public-records | coverage-gap | — | remaining-blocked |
| enrich-blocker-enrich-audit-051-02 | enrich-audit-051 | 陳冠宇 | public-records | missing-public-record-evidence | — | remaining-blocked |
| enrich-blocker-enrich-audit-055-01 | enrich-audit-055 | 陳麗珍 | basic-biography | currentness | enrich-claim-0088, enrich-claim-0089, enrich-claim-0090, enrich-claim-0091, enrich-claim-0092, enrich-claim-0093, enrich-claim-0094, enrich-claim-0095, enrich-claim-0096, enrich-claim-0097, enrich-claim-0098, enrich-claim-0099, enrich-claim-0100, enrich-claim-0101 | remaining-blocked |
| enrich-blocker-enrich-audit-056-01 | enrich-audit-056 | 陳麗珍 | policies | candidate-attribution | enrich-claim-0102 | remaining-blocked |
| enrich-blocker-enrich-audit-057-01 | enrich-audit-057 | 陳麗珍 | public-records | coverage-gap | — | remaining-blocked |
| enrich-blocker-enrich-audit-057-02 | enrich-audit-057 | 陳麗珍 | public-records | missing-public-record-evidence | — | remaining-blocked |
| enrich-blocker-enrich-audit-058-01 | enrich-audit-058 | 陳麗珍 | news | coverage-gap | — | remaining-blocked |
| enrich-blocker-enrich-audit-059-01 | enrich-audit-059 | 陳麗珍 | relationships | coverage-gap | — | remaining-blocked |
| enrich-blocker-enrich-audit-059-02 | enrich-audit-059 | 陳麗珍 | relationships | sensitive-relationship-evidence | — | remaining-blocked |
| enrich-blocker-enrich-audit-060-01 | enrich-audit-060 | 陳麗珍 | timeline | coverage-gap | — | remaining-blocked |
| enrich-blocker-enrich-audit-062-01 | enrich-audit-062 | 薛兆基 | policies | coverage-gap | — | remaining-blocked |
| enrich-blocker-enrich-audit-063-01 | enrich-audit-063 | 薛兆基 | public-records | coverage-gap | — | remaining-blocked |
| enrich-blocker-enrich-audit-063-02 | enrich-audit-063 | 薛兆基 | public-records | missing-public-record-evidence | — | remaining-blocked |
| enrich-blocker-enrich-audit-065-01 | enrich-audit-065 | 薛兆基 | relationships | coverage-gap | — | remaining-blocked |
| enrich-blocker-enrich-audit-065-02 | enrich-audit-065 | 薛兆基 | relationships | sensitive-relationship-evidence | — | remaining-blocked |
| enrich-blocker-enrich-audit-068-01 | enrich-audit-068 | 尹立 | policies | coverage-gap | — | remaining-blocked |
| enrich-blocker-enrich-audit-069-01 | enrich-audit-069 | 尹立 | public-records | coverage-gap | — | remaining-blocked |
| enrich-blocker-enrich-audit-069-02 | enrich-audit-069 | 尹立 | public-records | missing-public-record-evidence | — | remaining-blocked |
| enrich-blocker-enrich-audit-071-01 | enrich-audit-071 | 尹立 | relationships | coverage-gap | — | remaining-blocked |
| enrich-blocker-enrich-audit-071-02 | enrich-audit-071 | 尹立 | relationships | sensitive-relationship-evidence | — | remaining-blocked |
| enrich-blocker-enrich-audit-074-01 | enrich-audit-074 | 張靜 | policies | coverage-gap | — | remaining-blocked |
| enrich-blocker-enrich-audit-075-01 | enrich-audit-075 | 張靜 | public-records | coverage-gap | — | remaining-blocked |
| enrich-blocker-enrich-audit-075-02 | enrich-audit-075 | 張靜 | public-records | missing-public-record-evidence | — | remaining-blocked |
| enrich-blocker-enrich-audit-077-01 | enrich-audit-077 | 張靜 | relationships | coverage-gap | — | remaining-blocked |
| enrich-blocker-enrich-audit-077-02 | enrich-audit-077 | 張靜 | relationships | sensitive-relationship-evidence | — | remaining-blocked |
| enrich-blocker-enrich-audit-080-01 | enrich-audit-080 | 王肇民 | policies | coverage-gap | — | remaining-blocked |
| enrich-blocker-enrich-audit-083-01 | enrich-audit-083 | 王肇民 | relationships | coverage-gap | — | remaining-blocked |
| enrich-blocker-enrich-audit-083-02 | enrich-audit-083 | 王肇民 | relationships | sensitive-relationship-evidence | — | remaining-blocked |
| enrich-blocker-enrich-audit-086-01 | enrich-audit-086 | 柯志恩 | policies | coverage-gap | — | remaining-blocked |
| enrich-blocker-enrich-audit-087-01 | enrich-audit-087 | 柯志恩 | public-records | coverage-gap | — | remaining-blocked |
| enrich-blocker-enrich-audit-087-02 | enrich-audit-087 | 柯志恩 | public-records | missing-public-record-evidence | — | remaining-blocked |
| enrich-blocker-enrich-audit-088-01 | enrich-audit-088 | 柯志恩 | news | coverage-gap | — | remaining-blocked |
| enrich-blocker-enrich-audit-089-01 | enrich-audit-089 | 柯志恩 | relationships | coverage-gap | — | remaining-blocked |
| enrich-blocker-enrich-audit-089-02 | enrich-audit-089 | 柯志恩 | relationships | sensitive-relationship-evidence | — | remaining-blocked |
| enrich-blocker-enrich-audit-092-01 | enrich-audit-092 | 洪方隆 | policies | coverage-gap | — | remaining-blocked |
| enrich-blocker-enrich-audit-093-01 | enrich-audit-093 | 洪方隆 | public-records | coverage-gap | — | remaining-blocked |
| enrich-blocker-enrich-audit-093-02 | enrich-audit-093 | 洪方隆 | public-records | missing-public-record-evidence | — | remaining-blocked |
| enrich-blocker-enrich-audit-094-01 | enrich-audit-094 | 洪方隆 | news | coverage-gap | — | remaining-blocked |
| enrich-blocker-enrich-audit-095-01 | enrich-audit-095 | 洪方隆 | relationships | coverage-gap | — | remaining-blocked |
| enrich-blocker-enrich-audit-095-02 | enrich-audit-095 | 洪方隆 | relationships | sensitive-relationship-evidence | — | remaining-blocked |
| enrich-blocker-enrich-audit-096-01 | enrich-audit-096 | 洪方隆 | timeline | coverage-gap | — | remaining-blocked |
| enrich-blocker-enrich-audit-098-01 | enrich-audit-098 | 賴瑞隆 | policies | coverage-gap | — | remaining-blocked |
| enrich-blocker-enrich-audit-099-01 | enrich-audit-099 | 賴瑞隆 | public-records | coverage-gap | — | remaining-blocked |
| enrich-blocker-enrich-audit-099-02 | enrich-audit-099 | 賴瑞隆 | public-records | missing-public-record-evidence | — | remaining-blocked |
| enrich-blocker-enrich-audit-100-01 | enrich-audit-100 | 賴瑞隆 | news | coverage-gap | — | remaining-blocked |
| enrich-blocker-enrich-audit-101-01 | enrich-audit-101 | 賴瑞隆 | relationships | coverage-gap | — | remaining-blocked |
| enrich-blocker-enrich-audit-101-02 | enrich-audit-101 | 賴瑞隆 | relationships | sensitive-relationship-evidence | — | remaining-blocked |

## 人工邊界

目前沒有新增來源、reviewer 或決策。中性缺口不代表事實不存在；現職、候選人自述、公共關係與行政結果均不得因機器重開而自動發布。
