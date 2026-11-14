# Autonomous remediation root causes

- Dataset: `kaohsiung-2026-zuoying-mayoral-enrichment` (snapshot 2026-11-07)
- Generated: 2026-11-07T14:29:02.108Z
- Claims: 143 total / 1 machine-approved / 142 rejected
- Candidates: 17

## Rejection causes (a claim can carry several)

| Cause | Claims |
| --- | ---: |
| `semantic-disagreement` — The two independent reviewers differed on the semantic finding. | 142 |
| `policy-claim-type` — Claim type is not an institutional biography fact permitted by policy v1. | 57 |
| `policy-attribution` — Attribution is not an institutional record, so policy v1 withholds it. | 50 |
| `policy-source-class` — Source class is not on the policy v1 authoritative whitelist. | 48 |
| `policy-category` — Category outside the low-risk biography scope permitted by policy v1. | 43 |
| `semantic-verdict-not-supported` — At least one independent reviewer did not return a supported verdict. | 31 |
| `wording-correction-proposed` — A reviewer required a wording correction before publication. | 25 |
| `policy-current-status` — Claim asserts a current status; policy v1 only publishes historical facts. | 21 |
| `evidence-citation-not-direct` — A reviewer citation was not direct support for the claim wording. | 9 |
| `evidence-duplicate-overlap` — Claim duplicates or overlaps another retained claim. | 2 |
| `semantic-identity-unconfirmed` — At least one reviewer could not confirm subject identity. | 2 |
| `identity-wrong-subject` — The retained evidence does not describe the mapped candidate. | 1 |

## Primary cause per claim

| Primary cause | Claims |
| --- | ---: |
| `semantic-disagreement` | 111 |
| `semantic-verdict-not-supported` | 19 |
| `evidence-citation-not-direct` | 7 |
| `evidence-duplicate-overlap` | 2 |
| `semantic-identity-unconfirmed` | 2 |
| `identity-wrong-subject` | 1 |

## Reviewer disagreements

71 disagreements were classified with adjudication-materiality-v2: 82 are non-material (reviewer commentary or a vacuous temporal flag), 60 remain material.

| Claim | Candidate | Verdicts | Observed dimensions | Material |
| --- | --- | --- | --- | --- |
| enrich-claim-0001 | 黃文志 | partially-supported / partially-supported | evidence, correction, limitations | evidence, correction |
| enrich-claim-0002 | 黃文志 | supported / supported | temporal, limitations | non-material |
| enrich-claim-0003 | 黃文志 | supported / supported | limitations | non-material |
| enrich-claim-0004 | 黃文志 | supported / supported | limitations | non-material |
| enrich-claim-0005 | 黃文志 | supported / supported | limitations | non-material |
| enrich-claim-0006 | 黃文志 | supported / supported | limitations | non-material |
| enrich-claim-0007 | 黃文志 | supported / supported | limitations | non-material |
| enrich-claim-0008 | 黃文志 | supported / supported | temporal, limitations | non-material |
| enrich-claim-0009 | 黃文志 | supported / supported | limitations | non-material |
| enrich-claim-0010 | 黃文志 | supported / supported | limitations | non-material |
| enrich-claim-0011 | 黃文志 | supported / supported | temporal, limitations | attribution, temporal |
| enrich-claim-0012 | 李雅芬 | partially-supported / partially-supported | evidence, limitations | evidence |
| enrich-claim-0013 | 李雅芬 | supported / supported | limitations | non-material |
| enrich-claim-0014 | 李雅芬 | supported / supported | temporal, limitations | non-material |
| enrich-claim-0015 | 李雅芬 | supported / supported | limitations | non-material |
| enrich-claim-0016 | 李雅芬 | supported / supported | temporal, limitations | non-material |
| enrich-claim-0017 | 李雅芬 | supported / supported | temporal, limitations | non-material |
| enrich-claim-0018 | 李雅芬 | supported / supported | limitations | non-material |
| enrich-claim-0019 | 李雅芬 | supported / supported | limitations | non-material |
| enrich-claim-0020 | 李雅芬 | supported / supported | temporal, limitations | non-material |
| enrich-claim-0021 | 李雅芬 | supported / supported | limitations | non-material |
| enrich-claim-0022 | 李雅芬 | supported / supported | temporal, limitations | non-material |
| enrich-claim-0023 | 李雅芬 | supported / supported | temporal, limitations | temporal |
| enrich-claim-0024 | 白喬茵 | partially-supported / partially-supported | correction, limitations | evidence, correction |
| enrich-claim-0025 | 白喬茵 | supported / supported | limitations | non-material |
| enrich-claim-0026 | 白喬茵 | supported / supported | limitations | non-material |
| enrich-claim-0027 | 白喬茵 | supported / supported | temporal, limitations | temporal |
| enrich-claim-0028 | 白喬茵 | supported / supported | temporal, limitations | non-material |
| enrich-claim-0029 | 白喬茵 | supported / supported | temporal, limitations | temporal |
| enrich-claim-0030 | 白喬茵 | supported / supported | temporal, limitations | non-material |
| enrich-claim-0032 | 白喬茵 | supported / supported | limitations | non-material |
| enrich-claim-0033 | 白喬茵 | supported / supported | temporal, limitations | non-material |
| enrich-claim-0034 | 白喬茵 | supported / supported | limitations | non-material |
| enrich-claim-0035 | 白喬茵 | supported / supported | temporal, limitations | temporal |
| enrich-claim-0036 | 柳淑芳 | supported / supported | attribution, limitations | attribution |
| enrich-claim-0037 | 柳淑芳 | supported / supported | limitations | attribution |
| enrich-claim-0038 | 柳淑芳 | supported / supported | limitations | attribution |
| enrich-claim-0039 | 柳淑芳 | supported / supported | limitations | non-material |
| enrich-claim-0040 | 李眉蓁 | partially-supported / partially-supported | correction, limitations | correction |
| enrich-claim-0041 | 李眉蓁 | supported / supported | limitations | non-material |
| enrich-claim-0042 | 李眉蓁 | supported / supported | limitations | non-material |
| enrich-claim-0043 | 李眉蓁 | supported / supported | temporal, limitations | non-material |
| enrich-claim-0044 | 李眉蓁 | supported / supported | limitations | non-material |
| enrich-claim-0045 | 李眉蓁 | supported / supported | limitations | non-material |
| enrich-claim-0046 | 李眉蓁 | supported / supported | temporal, limitations | non-material |
| enrich-claim-0047 | 李眉蓁 | supported / supported | limitations | non-material |
| enrich-claim-0048 | 李眉蓁 | supported / supported | limitations | attribution |
| enrich-claim-0049 | 李雅慧 | partially-supported / partially-supported | evidence, limitations | evidence |
| enrich-claim-0050 | 李雅慧 | supported / supported | limitations | non-material |
| enrich-claim-0051 | 李雅慧 | supported / supported | limitations | non-material |
| enrich-claim-0052 | 李雅慧 | supported / supported | limitations | non-material |
| enrich-claim-0053 | 李雅慧 | supported / supported | limitations | non-material |
| enrich-claim-0054 | 李雅慧 | supported / supported | temporal, limitations | non-material |
| enrich-claim-0055 | 李雅慧 | supported / supported | limitations | non-material |
| enrich-claim-0056 | 李雅慧 | supported / supported | limitations | temporal |
| enrich-claim-0057 | 李雅慧 | supported / supported | limitations | non-material |
| enrich-claim-0058 | 李雅慧 | partially-supported / supported | verdict, limitations | verdict, attribution, temporal |
| enrich-claim-0059 | 陳玫娟 | partially-supported / partially-supported | correction, limitations | correction |
| enrich-claim-0060 | 陳玫娟 | supported / supported | limitations | non-material |
| enrich-claim-0061 | 陳玫娟 | supported / supported | limitations | non-material |
| enrich-claim-0062 | 陳玫娟 | supported / supported | limitations | non-material |
| enrich-claim-0063 | 陳玫娟 | supported / supported | temporal, limitations | non-material |
| enrich-claim-0064 | 陳玫娟 | supported / supported | limitations | non-material |
| enrich-claim-0065 | 陳玫娟 | supported / supported | temporal, limitations | non-material |
| enrich-claim-0066 | 陳玫娟 | supported / supported | limitations | non-material |
| enrich-claim-0067 | 陳玫娟 | partially-supported / supported | verdict, temporal, limitations | verdict |
| enrich-claim-0068 | 陳玫娟 | supported / supported | temporal, limitations | temporal |
| enrich-claim-0069 | 陳玫娟 | supported / supported | temporal, limitations | temporal |
| enrich-claim-0070 | 陳玫娟 | supported / supported | limitations | non-material |
| enrich-claim-0071 | 陳玫娟 | supported / supported | temporal, limitations | non-material |
| enrich-claim-0072 | 陳玫娟 | supported / supported | temporal, limitations | non-material |
| enrich-claim-0073 | 陳玫娟 | supported / supported | attribution, temporal, limitations | attribution |
| enrich-claim-0074 | 陳玫娟 | supported / supported | limitations | non-material |
| enrich-claim-0075 | 陳玫娟 | supported / supported | attribution, limitations | temporal |
| enrich-claim-0076 | 陳玫娟 | supported / supported | temporal, evidence, limitations | attribution, temporal |
| enrich-claim-0077 | 張以理 | partially-supported / partially-supported | correction, limitations | attribution, correction |
| enrich-claim-0078 | 張以理 | supported / supported | limitations | non-material |
| enrich-claim-0079 | 張以理 | supported / supported | limitations | non-material |
| enrich-claim-0080 | 張以理 | supported / supported | attribution, limitations | non-material |
| enrich-claim-0081 | 張以理 | supported / supported | limitations | non-material |
| enrich-claim-0082 | 陳冠宇 | partially-supported / partially-supported | temporal, evidence, limitations | temporal, evidence |
| enrich-claim-0083 | 陳冠宇 | supported / partially-supported | verdict, attribution, limitations | verdict |
| enrich-claim-0084 | 陳冠宇 | supported / supported | limitations | non-material |
| enrich-claim-0085 | 陳冠宇 | supported / supported | limitations | attribution |
| enrich-claim-0086 | 陳冠宇 | supported / supported | attribution, limitations | non-material |
| enrich-claim-0087 | 陳冠宇 | supported / partially-supported | verdict, correction, limitations | verdict, correction |
| enrich-claim-0088 | 陳麗珍 | partially-supported / supported | verdict, correction, limitations | verdict, correction |
| enrich-claim-0089 | 陳麗珍 | supported / supported | temporal, limitations | non-material |
| enrich-claim-0090 | 陳麗珍 | supported / supported | temporal, limitations | non-material |
| enrich-claim-0091 | 陳麗珍 | supported / supported | limitations | non-material |
| enrich-claim-0092 | 陳麗珍 | supported / supported | limitations | non-material |
| enrich-claim-0093 | 陳麗珍 | supported / supported | temporal, limitations | temporal |
| enrich-claim-0094 | 陳麗珍 | supported / supported | attribution, temporal, limitations | attribution |
| enrich-claim-0095 | 陳麗珍 | supported / supported | limitations | non-material |
| enrich-claim-0096 | 陳麗珍 | supported / supported | temporal, limitations | temporal |
| enrich-claim-0097 | 陳麗珍 | supported / supported | temporal, limitations | temporal |
| enrich-claim-0098 | 陳麗珍 | supported / supported | temporal, limitations | temporal |
| enrich-claim-0099 | 陳麗珍 | supported / supported | temporal, limitations | non-material |
| enrich-claim-0100 | 陳麗珍 | supported / supported | limitations | non-material |
| enrich-claim-0101 | 陳麗珍 | supported / supported | temporal | temporal |
| enrich-claim-0102 | 陳麗珍 | supported / supported | limitations | attribution |
| enrich-claim-0103 | 薛兆基 | partially-supported / partially-supported | limitations | non-material |
| enrich-claim-0104 | 薛兆基 | partially-supported / supported | verdict, evidence, correction, limitations | verdict, correction |
| enrich-claim-0105 | 薛兆基 | supported / supported | limitations | non-material |
| enrich-claim-0106 | 薛兆基 | supported / supported | limitations | non-material |
| enrich-claim-0107 | 薛兆基 | supported / supported | limitations | non-material |
| enrich-claim-0108 | 薛兆基 | partially-supported / partially-supported | correction, limitations | correction |
| enrich-claim-0109 | 薛兆基 | supported / supported | limitations | non-material |
| enrich-claim-0110 | 薛兆基 | partially-supported / supported | verdict, attribution, correction, limitations | verdict, attribution, correction |
| enrich-claim-0111 | 尹立 | wrong-identity / wrong-identity | attribution, evidence, correction, limitations | attribution, evidence, correction |
| enrich-claim-0112 | 尹立 | supported / supported | attribution, limitations | attribution |
| enrich-claim-0113 | 尹立 | supported / supported | limitations | attribution |
| enrich-claim-0114 | 尹立 | partially-supported / partially-supported | limitations | temporal, evidence |
| enrich-claim-0115 | 尹立 | supported / supported | limitations | non-material |
| enrich-claim-0116 | 尹立 | supported / partially-supported | verdict, attribution, correction, limitations | verdict, attribution, correction |
| enrich-claim-0117 | 尹立 | partially-supported / partially-supported | evidence, limitations | temporal, evidence |
| enrich-claim-0118 | 尹立 | partially-supported / partially-supported | attribution, correction, limitations | attribution, correction |
| enrich-claim-0119 | 張靜 | partially-supported / partially-supported | evidence, correction, limitations | correction |
| enrich-claim-0120 | 張靜 | partially-supported / partially-supported | temporal, evidence, correction, limitations | correction |
| enrich-claim-0121 | 張靜 | supported / supported | limitations | attribution |
| enrich-claim-0122 | 張靜 | supported / supported | limitations | non-material |
| enrich-claim-0123 | 張靜 | supported / supported | limitations | attribution |
| enrich-claim-0124 | 王肇民 | partially-supported / partially-supported | correction, limitations | correction |
| enrich-claim-0125 | 王肇民 | partially-supported / supported | verdict, correction, limitations | verdict, attribution, correction |
| enrich-claim-0126 | 王肇民 | supported / partially-supported | verdict, identity, evidence, limitations | verdict, identity, attribution, evidence |
| enrich-claim-0127 | 王肇民 | supported / supported | attribution, limitations | attribution |
| enrich-claim-0128 | 王肇民 | supported / partially-supported | verdict, identity, evidence, limitations | verdict, identity |
| enrich-claim-0129 | 王肇民 | supported / supported | limitations | non-material |
| enrich-claim-0130 | 王肇民 | supported / supported | limitations | non-material |
| enrich-claim-0131 | 王肇民 | supported / supported | limitations | attribution |
| enrich-claim-0132 | 王肇民 | supported / supported | limitations | attribution |
| enrich-claim-0133 | 柯志恩 | partially-supported / partially-supported | attribution, evidence, correction, limitations | evidence, correction |
| enrich-claim-0134 | 柯志恩 | supported / supported | limitations | non-material |
| enrich-claim-0135 | 柯志恩 | supported / supported | limitations | non-material |
| enrich-claim-0136 | 柯志恩 | supported / supported | temporal, limitations | non-material |
| enrich-claim-0137 | 柯志恩 | supported / supported | limitations | non-material |
| enrich-claim-0138 | 洪方隆 | partially-supported / partially-supported | evidence, correction, limitations | evidence, correction |
| enrich-claim-0139 | 賴瑞隆 | partially-supported / partially-supported | correction, limitations | correction |
| enrich-claim-0140 | 賴瑞隆 | supported / supported | limitations | non-material |
| enrich-claim-0141 | 賴瑞隆 | supported / supported | limitations | non-material |
| enrich-claim-0142 | 賴瑞隆 | supported / supported | limitations | non-material |
| enrich-claim-0143 | 賴瑞隆 | supported / supported | limitations | non-material |

## Wording corrections proposed

| Claim | Candidate | Type | Page-chrome patterns |
| --- | --- | --- | --- |
| enrich-claim-0001 | 黃文志 | current-position | — |
| enrich-claim-0012 | 李雅芬 | current-position | — |
| enrich-claim-0024 | 白喬茵 | current-position | — |
| enrich-claim-0040 | 李眉蓁 | current-position | — |
| enrich-claim-0049 | 李雅慧 | current-position | — |
| enrich-claim-0059 | 陳玫娟 | current-position | — |
| enrich-claim-0077 | 張以理 | historical-position | 立刻加入 |
| enrich-claim-0087 | 陳冠宇 | historical-candidacy | --> ^即時 要聞 |
| enrich-claim-0088 | 陳麗珍 | current-position | — |
| enrich-claim-0103 | 薛兆基 | professional-experience | --> 會員中心 |
| enrich-claim-0104 | 薛兆基 | professional-experience | 請繼續往下閱讀 |
| enrich-claim-0108 | 薛兆基 | historical-candidacy | --> 會員中心 |
| enrich-claim-0110 | 薛兆基 | historical-candidacy | — |
| enrich-claim-0111 | 尹立 | historical-position | — |
| enrich-claim-0114 | 尹立 | news-report | — |
| enrich-claim-0116 | 尹立 | historical-candidacy | 立刻加入 |
| enrich-claim-0117 | 尹立 | timeline-event | — |
| enrich-claim-0118 | 尹立 | historical-candidacy | &gt; 加入Google首選 |
| enrich-claim-0119 | 張靜 | historical-candidacy | — |
| enrich-claim-0120 | 張靜 | professional-experience | --> 會員中心 |
| enrich-claim-0124 | 王肇民 | historical-candidacy | — |
| enrich-claim-0125 | 王肇民 | public-activity | 熱門關鍵字 |
| enrich-claim-0133 | 柯志恩 | historical-candidacy | — |
| enrich-claim-0138 | 洪方隆 | historical-candidacy | — |
| enrich-claim-0139 | 賴瑞隆 | historical-candidacy | — |

## Root-cause notes

- Claims that carry `policy-*` causes cannot become publishable through evidence work: policy v1 fixes the permitted category, claim type, attribution, status, and source class. No retrieval or re-review is recorded against those dimensions.
- 12 rejected claims carry scraped page-chrome in their wording; those are correctable wording defects, not evidence gaps.
- 82 of 142 disagreements are non-material under adjudication-materiality-v2 and therefore eligible for fresh independent adjudication.
- The remaining material disagreements keep their claims withheld; none is resolved by majority vote or by selecting the favourable reviewer.
