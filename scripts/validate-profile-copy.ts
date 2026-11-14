import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(process.cwd());
const rosterPath = join(root, 'data/approved/2026/kaohsiung-election.json');
const distCandidatesPath = join(root, 'dist/candidates');
const jsonReportPath = join(root, 'reports/profile-copy-audit.json');
const markdownReportPath = join(root, 'reports/profile-copy-audit.md');

function loadRoster(): { candidates: Array<{ slug: string }> } {
  try {
    return JSON.parse(readFileSync(rosterPath, 'utf8')) as {
      candidates: Array<{ slug: string }>;
    };
  } catch (error) {
    throw new Error(
      'Unable to load the canonical candidate roster: ' +
        (error instanceof Error ? error.message : String(error)),
    );
  }
}

const roster = loadRoster();
const expectedSlugs = roster.candidates.map((candidate) => candidate.slug);
const expectedSlugSet = new Set(expectedSlugs);

const requiredTabs = [
  '基本資料',
  '政策主張',
  '相關新聞',
  '從政歷程',
  '家族從政關係',
];
const emptyStates = [
  '基本資料：暫無資料',
  '政策主張：暫無公開政策資料',
  '相關新聞：暫無公開新聞資料',
  '從政歷程：暫無公開履歷資料',
  '尚無可核實的公開家族從政資料。',
  '目前仍在查核家族從政資料，尚無可公開的已核實關係。',
  '提案紀錄：暫無公開提案紀錄',
  '表決紀錄：暫無可查證的個別表決紀錄',
];
const forbiddenVisibleText = [
  '正負面新聞',
  '正面新聞',
  '負面新聞',
  '新聞分類',
  '分類依據',
  '未分類',
  '中性脈絡',
  '爭議／待釐清',
  'pending-human-review',
  'machine-validated',
  'withheld-pending-review',
  '待人工審查',
  '機器政策核准',
  '不等同人工編輯核准',
  '研究找到',
  '研究摘要',
  '研究快照',
  '研究完整度',
  '來源核對',
  '人工核對',
  '人工審查',
  '機器參考',
  '參考檢查',
  '已嘗試',
  '已取得來源',
  '官方來源字元差異',
  '抽定，非正式公告',
  '本次參選身分，不等同已當選或已就任。',
  '中選會選舉專區資料列之政黨／登記欄；不等同黨籍認定。',
  '預公告',
  '資料狀態',
];
const forbiddenSerializedKeys = [
  'classification',
  'classificationRationale',
  'sentiment',
  'research',
  'policyResearch',
  'publicRecordResearch',
  'verificationStatus',
  'reviewStatus',
  'publicationStatus',
  'retrievalDate',
  'machineApprovalId',
  'policyVersion',
  'publicationOrigin',
  'sourceSnapshots',
  'rawPath',
  'identityResolutions',
  'conflicts',
];
const forbiddenSerializedText = [
  ...forbiddenVisibleText,
  '中央選舉委員會選舉專區留存快照',
  '政黨／登記欄不等同黨籍認定',
  '候選人正式公告預定於',
  '肖像路徑因未確認再利用權利不採用',
  '空白教育、經歷與政見欄位不推論',
  '目前沒有可公開的已核准履歷主張',
  '待審資料不會載入公開頁面',
];

function stripMarkup(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function countOccurrences(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

function normalizeMarkdown(value: string): string {
  return value.trimEnd() + '\n';
}

function hasSerializedKey(html: string, key: string): boolean {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:"|&quot;|')${escaped}(?:"|&quot;|')\\s*:`).test(html);
}

const pageEntries = readdirSync(distCandidatesPath, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const demoSlugs = pageEntries.filter((slug) => slug.endsWith('-demo'));
const unexpectedSlugs = pageEntries.filter(
  (slug) => !expectedSlugSet.has(slug) && !slug.endsWith('-demo'),
);
const missingSlugs = expectedSlugs.filter(
  (slug) => !pageEntries.includes(slug),
);
if (
  missingSlugs.length > 0 ||
  unexpectedSlugs.length > 0 ||
  (demoSlugs.length !== 0 && demoSlugs.length !== 4)
) {
  throw new Error(
    'Expected ' +
      expectedSlugs.length +
      ' roster pages and zero or four demo pages; found ' +
      pageEntries.length +
      '. Missing: ' +
      (missingSlugs.join(', ') || 'none') +
      '. Unexpected: ' +
      (unexpectedSlugs.join(', ') || 'none') +
      '. Demo pages: ' +
      demoSlugs.length +
      '.',
  );
}

const pages = pageEntries.map((slug) => {
  const htmlPath = join(distCandidatesPath, slug, 'index.html');
  const html = readFileSync(htmlPath, 'utf8');
  const visibleText = stripMarkup(html);
  const tabCounts = Object.fromEntries(
    requiredTabs.map((label) => [label, countOccurrences(visibleText, label)]),
  );
  const emptyStateCounts = Object.fromEntries(
    emptyStates.map((label) => [label, countOccurrences(visibleText, label)]),
  );
  const forbiddenMatches = forbiddenVisibleText.filter((text) =>
    visibleText.includes(text),
  );
  const serializedKeyMatches = forbiddenSerializedKeys.filter((key) =>
    hasSerializedKey(html, key),
  );
  const serializedTextMatches = forbiddenSerializedText.filter((text) =>
    html.includes(text),
  );
  const serializedInternalMatches = [
    ...serializedKeyMatches.map((key) => 'key:' + key),
    ...serializedTextMatches.map((text) => 'text:' + text),
  ];
  const duplicateEmptyStates = emptyStates.filter(
    (label) => (emptyStateCounts[label] ?? 0) > 1,
  );
  return {
    slug,
    tabCounts,
    emptyStateCounts,
    forbiddenMatches,
    serializedInternalMatches,
    duplicateEmptyStates,
  };
});

const tabFailures = pages.filter((page) =>
  requiredTabs.some((label) => (page.tabCounts[label] ?? 0) < 1),
);
const forbiddenMatches = pages.flatMap((page) =>
  page.forbiddenMatches.map((text) => ({ slug: page.slug, text })),
);
const serializedInternalMatches = pages.flatMap((page) =>
  page.serializedInternalMatches.map((text) => ({ slug: page.slug, text })),
);
const duplicateEmptyStates = pages.flatMap((page) =>
  page.duplicateEmptyStates.map((text) => ({ slug: page.slug, text })),
);

if (tabFailures.length > 0) {
  throw new Error(
    'Candidate pages missing required tabs: ' +
      tabFailures.map((page) => page.slug).join(', '),
  );
}
if (forbiddenMatches.length > 0) {
  throw new Error(
    'Forbidden public copy found: ' +
      forbiddenMatches.map((item) => item.slug + ': ' + item.text).join('; '),
  );
}
if (serializedInternalMatches.length > 0) {
  throw new Error(
    'Internal metadata found in serialized page props: ' +
      serializedInternalMatches
        .map((item) => item.slug + ': ' + item.text)
        .join('; '),
  );
}
if (duplicateEmptyStates.length > 0) {
  throw new Error(
    'Duplicate empty states found: ' +
      duplicateEmptyStates
        .map((item) => item.slug + ': ' + item.text)
        .join('; '),
  );
}

const emptyStateTotals = Object.fromEntries(
  emptyStates.map((label) => [
    label,
    pages.reduce(
      (total, page) => total + (page.emptyStateCounts[label] ?? 0),
      0,
    ),
  ]),
);
const report = {
  candidatePageCount: pages.length,
  officialRosterPageCount: expectedSlugs.length,
  demoPageCount: demoSlugs.length,
  expectedCandidateCount: expectedSlugs.length,
  requiredTabs,
  emptyStateTotals,
  pagesWithEmptyStates: pages.filter((page) =>
    emptyStates.some((label) => (page.emptyStateCounts[label] ?? 0) > 0),
  ).length,
  forbiddenVisibleMatches: forbiddenMatches,
  serializedInternalMatches,
  duplicateEmptyStates,
  pageInventory: pages,
  assertions: {
    allRosterPagesPresent: true,
    allPagesHaveFiveTabs: true,
    forbiddenVisibleTextCount: forbiddenMatches.length,
    serializedInternalMetadataCount: serializedInternalMatches.length,
    duplicateEmptyStateCount: duplicateEmptyStates.length,
  },
};

const markdown = normalizeMarkdown(
  '# Candidate profile copy audit\n\n' +
    '- Candidate pages checked: ' +
    report.candidatePageCount +
    '\n' +
    '- Required tabs present on every page: ' +
    requiredTabs.join('、') +
    '\n' +
    '- Pages with concise empty states: ' +
    report.pagesWithEmptyStates +
    '\n' +
    '- Forbidden visible-text matches: ' +
    forbiddenMatches.length +
    '\n' +
    '- Serialized internal metadata matches: ' +
    serializedInternalMatches.length +
    '\n' +
    '- Duplicate empty states: ' +
    duplicateEmptyStates.length +
    '\n\n' +
    'The audit checks generated static HTML for the complete roster, the five public tabs, concise empty-state strings, and removal of internal research/editorial workflow copy from both visitor-visible text and serialized island props.\n',
);

writeFileSync(jsonReportPath, JSON.stringify(report, null, 2) + '\n');
writeFileSync(markdownReportPath, markdown);
console.log(
  'Validated candidate profile copy: ' +
    pages.length +
    ' pages, five tabs on every page, ' +
    forbiddenMatches.length +
    ' forbidden visible strings, ' +
    serializedInternalMatches.length +
    ' serialized internal metadata matches, ' +
    duplicateEmptyStates.length +
    ' duplicate empty states.',
);
