import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

test('homepage renders the city explorer', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '港都人物誌' })).toBeVisible();
  await expect(page.getByTestId('city-explorer')).toBeVisible();
  await expect(page.locator('#scene-heading')).toContainText('港灣示範選區');
});

test('district selection changes the active scene and candidate list', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('city-explorer')).toHaveAttribute(
    'data-hydrated',
    'true',
  );
  await page.locator('[aria-controls="city-district-tray"]').click();
  await page.getByRole('button', { name: /山城示範選區/ }).click();
  await expect(page.locator('#scene-heading')).toContainText('山城示範選區');
  await page.locator('[aria-controls="city-people-tray"]').click();
  await expect(
    page.getByRole('button', { name: /沈安波/ }).first(),
  ).toBeVisible();
});

test('candidate selection opens profile tabs', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('city-explorer')).toHaveAttribute(
    'data-hydrated',
    'true',
  );
  await page.locator('[aria-controls="city-people-tray"]').click();
  await page
    .getByRole('button', { name: /林海星/ })
    .first()
    .click();
  const panel = page.getByTestId('profile-panel');
  await expect(panel).toContainText('林海星');
  // Profile tabs are code-split; first open can compile the chunk in dev.
  await expect(panel.getByRole('tab', { name: '基本資料' })).toHaveAttribute(
    'aria-selected',
    'true',
    { timeout: 15_000 },
  );
  await panel.getByRole('tab', { name: '政策主張' }).click();
  await expect(panel.getByRole('heading', { name: '政策主張' })).toBeVisible();
  await expect(panel).toContainText('讓港邊散步成為日常');
});

test('direct candidate URL renders without relying on the city scene', async ({
  page,
}) => {
  await page.goto('/candidates/lin-haixing-demo/');
  await expect(
    page.getByRole('heading', { name: '林海星（虛構示範）' }),
  ).toBeVisible();
  await expect(page.getByTestId('profile-tabs')).toBeVisible();
  await expect(page.getByRole('heading', { name: '基本資料' })).toBeVisible();
});

test('official election filters expose mayor, council, and indigenous districts', async ({
  page,
}) => {
  await page.goto('/');
  const explorer = page.getByTestId('city-explorer');
  await expect(explorer).toHaveAttribute('data-hydrated', 'true');
  await explorer.locator('[aria-controls="city-district-tray"]').click();
  await explorer.getByRole('tab', { name: '市長選' }).click();
  await expect(
    explorer
      .locator('#city-district-tray')
      .getByRole('button', { name: /高雄市長選舉/ }),
  ).toBeVisible();
  await explorer
    .locator('#city-district-tray')
    .getByRole('button', { name: /高雄市長選舉/ })
    .click();
  await expect(page.locator('#scene-heading')).toContainText('高雄市長選舉');

  await explorer.getByRole('tab', { name: '市議選' }).click();
  const councilDistrict = explorer
    .locator('#city-district-tray')
    .getByRole('button', { name: /高雄市議員第1選舉區/ });
  await expect(councilDistrict).toBeVisible();
  await councilDistrict.click();
  await explorer.locator('[aria-controls="city-people-tray"]').click();
  await expect(
    explorer.getByRole('button', { name: /李 李振豪 2026/ }),
  ).toBeVisible();

  await explorer.locator('[aria-controls="city-district-tray"]').click();
  await explorer.getByRole('tab', { name: '原住民族' }).click();
  await expect(
    explorer
      .locator('#city-district-tray')
      .getByRole('button', { name: /高雄市議員第12選舉區/ }),
  ).toBeVisible();
});

test('official routes expose source references and neutral missing states', async ({
  page,
}) => {
  await page.goto('/candidates/zhang-jing-2026/');
  await expect(
    page.getByRole('heading', { name: '張靜', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('note')).toContainText('官方資料切片');
  await expect(
    page.getByTestId('profile-tabs').getByText('抽定，非正式公告'),
  ).toBeVisible();
  await expect(
    page
      .getByTestId('profile-tabs')
      .getByRole('link', { name: /source-cec-central-65213/ }),
  ).toHaveAttribute('href', 'https://web.cec.gov.tw/central/article/65213');
  await expect(
    page
      .getByTestId('profile-tabs')
      .getByRole('link', { name: /source-cec-vote2026-c1-64000/ }),
  ).toHaveAttribute(
    'href',
    'https://info.cec.gov.tw/vote2026/static/json/cand/C1/64000.json',
  );
  const profile = page.getByTestId('profile-tabs');
  await profile.getByRole('tab', { name: '政策主張' }).click();
  await expect(profile).toContainText('目前尚無已查證的政策主張資料');

  await page.goto('/districts/kaohsiung-council-01/');
  const councilPage = page.getByRole('main');
  await expect(
    page.getByRole('heading', { name: '高雄市議員第1選舉區' }),
  ).toBeVisible();
  await expect(councilPage).toContainText('李振豪');
  await expect(councilPage).toContainText('中國國民黨');
  const councilCandidateLink = councilPage.locator('a.candidate-card').first();
  await expect(councilCandidateLink).toHaveAttribute('href', /\/candidates\//);
  await councilCandidateLink.click();
  await expect(
    page.getByRole('heading', { name: '李振豪', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('抽定，非正式公告').first()).toBeVisible();
  await expect(page.getByText('中國國民黨').first()).toBeVisible();
  await expect(
    page.getByRole('link', { name: /source-khec-65366/ }).first(),
  ).toHaveAttribute('href', 'https://www.cec.gov.tw/khec/article/65366');

  await page.goto('/districts/kaohsiung-indigenous-flat-12/');
  await expect(page.getByText('平地原住民・第12選舉區')).toBeVisible();
  await expect(page.getByRole('main')).toContainText('本區官方預公告人物');
});

test('automated policy publishes only an eligible scoped claim', async ({
  page,
}) => {
  await page.goto('/candidates/kaohsiung-council-04-e810f056/');
  const profile = page.getByTestId('profile-tabs');
  await expect(profile).toHaveAttribute('data-hydrated', 'true');
  const publication = profile.getByTestId('automated-publication');
  await expect(publication).toBeVisible();
  await expect(publication).toContainText('三立新聞台主播');
  await expect(publication).toContainText(
    '資料性質：機關紀錄；非人工編輯核准。',
  );
  // A page now publishes every eligible claim for the candidate, grouped by
  // claim type, so the same institutional source legitimately backs several
  // rows. The link contract is "chip points at the retained source".
  await expect(
    publication
      .locator(
        'a[href="https://www.kcc.gov.tw/MemberInfo_New.aspx?n=39&sms=9028&msn=2181"]',
      )
      .first(),
  ).toHaveAttribute(
    'href',
    'https://www.kcc.gov.tw/MemberInfo_New.aspx?n=39&sms=9028&msn=2181',
  );
  expect(
    await publication.locator('ul.automated-claim-list > li').count(),
  ).toBeGreaterThan(1);
  await expect(publication).not.toContainText('enrich-claim-0111');
  await expect(publication).not.toContainText('gpt-5.6-luna');
  await expect(publication).not.toContainText('reviewerId');
});

test('official biography observations remain withheld pending review', async ({
  page,
}) => {
  await page.goto('/candidates/kaohsiung-council-10-f1f8ec11/');
  const profile = page.getByTestId('profile-tabs');
  await expect(profile).toHaveAttribute('data-hydrated', 'true');
  await expect(profile.getByTestId('biography-status')).toContainText(
    '目前尚無可公開的已核准履歷主張',
  );
  await expect(profile.getByTestId('biography-status')).not.toContainText(
    '機器化觀察待審',
  );
  await profile.getByRole('tab', { name: '政治時間軸' }).click();
  await expect(
    profile.getByRole('heading', { name: '政治職涯時間軸' }),
  ).toBeVisible();
  await expect(profile.getByTestId('biography-timeline')).toHaveCount(0);
});

test('local editorial workspace loads only in the development review route', async ({
  page,
}) => {
  await page.goto('/editorial-review/');
  const workspace = page.getByTestId('editorial-review-app');
  await expect(workspace).toHaveAttribute('data-hydrated', 'true');
  await expect(
    workspace.getByRole('heading', { name: '候選人履歷編輯審查' }),
  ).toBeVisible();
  await expect(workspace).toContainText('不是登入系統，也不會直接發布');
  await expect(workspace.getByTestId('release-batch-summary')).toContainText(
    '首批審查批次 12 筆／4 位候選人',
  );
  await expect(workspace.getByTestId('release-blockers')).toContainText(
    'Currentness needs human confirmation',
  );
  const releaseBatchFilter = workspace
    .getByTestId('release-batch-filter')
    .locator('select');
  await releaseBatchFilter.selectOption('selected');
  await expect(workspace.getByTestId('release-batch-context')).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await workspace.getByRole('button', { name: '匯出決策 JSON' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(
    'biography-decisions-2026-11-06.json',
  );

  const scoped = workspace.getByTestId('scoped-enrichment-panel');
  await expect(scoped).toContainText('143 筆主張');
  await expect(scoped.getByTestId('scoped-group-filter')).toBeVisible();
  await scoped.getByTestId('scoped-group-filter').selectOption('mayoral');
  await expect(scoped.getByText('範圍審查項目')).toBeVisible();
  await scoped
    .getByTestId('scoped-readiness-filter')
    .selectOption('requires-additional-evidence');
  const scopedDownloadPromise = page.waitForEvent('download');
  await scoped.getByRole('button', { name: '匯出範圍決策 JSON' }).click();
  const scopedDownload = await scopedDownloadPromise;
  expect(scopedDownload.suggestedFilename()).toBe(
    'zuoying-mayoral-decisions-2026-11-07.json',
  );
  const audit = workspace.getByTestId('scoped-ai-audit-panel');
  await expect(audit).toContainText('143 筆主張');
  await expect(audit.getByTestId('scoped-ai-audit-summary')).toContainText(
    '雙輪一致：141',
  );
  await audit
    .getByTestId('scoped-ai-audit-filter')
    .selectOption('needs-review');
  await expect(audit.getByTestId('scoped-ai-audit-detail')).toBeVisible();
});

test('editorial workspace can inspect a real pilot candidate without recording a decision', async ({
  page,
}) => {
  await page.goto('/editorial-review/');
  const workspace = page.getByTestId('editorial-review-app');
  await expect(workspace).toHaveAttribute('data-hydrated', 'true');
  await workspace.getByLabel('候選人').selectOption({ label: '鄭光峰' });
  await expect(workspace.getByText('93 筆', { exact: true })).toBeVisible();
  await expect(workspace).toContainText('鄭光峰');
  await expect(
    workspace.getByRole('link', { name: '開啟原始來源' }).first(),
  ).toHaveAttribute(
    'href',
    /kcc\.gov\.tw\/MemberInfo_New\.aspx\?n=39&sms=9028&msn=2220/,
  );
  await expect(workspace).toContainText('目前暫存 0 筆決策');
});

test('selected public-record profiles expose provenance and neutral gaps', async ({
  page,
}) => {
  await page.goto('/candidates/kaohsiung-council-04-a7ed58d6/');
  const profile = page.getByTestId('profile-tabs');
  await expect(profile).toHaveAttribute('data-hydrated', 'true');
  await expect(
    page.getByRole('heading', { name: '李眉蓁', exact: true }),
  ).toBeVisible();
  await expect(profile.getByTestId('research-summary')).toContainText(
    '已嘗試 3／6 類，已取得來源 3／6 類',
  );
  await expect(profile.getByTestId('research-summary')).toContainText(
    '人工審查狀態：pending-human-review',
  );
  await expect(
    profile.getByRole('link', { name: /source-cec-vote2026-t-64000/ }).first(),
  ).toHaveAttribute(
    'href',
    'https://info.cec.gov.tw/vote2026/static/json/cand/T/64000.json',
  );
  await profile.getByRole('tab', { name: '公共紀錄' }).click();
  await expect(
    profile.getByRole('heading', { name: '公共紀錄與成果' }),
  ).toBeVisible();
  await expect(profile).toContainText('市府應面對找得到工作卻看不到加薪');
  await expect(profile).toContainText('待人工審查');
  await expect(
    profile
      .locator(
        '#panel-kaohsiung-council-04-a7ed58d6-records a[href="https://www.kcc.gov.tw/News_Content.aspx?n=47&s=17284"]',
      )
      .first(),
  ).toBeVisible();

  await profile.getByRole('tab', { name: '公共關係史' }).click();
  await expect(profile).toContainText('目前尚無已查證的公共關係史資料');

  await page.goto('/candidates/lai-rui-long-2026/');
  const mayorProfile = page.getByTestId('profile-tabs');
  await mayorProfile.getByRole('tab', { name: '公共紀錄' }).click();
  await expect(mayorProfile).toContainText('目前尚無已查證的公共紀錄資料');

  await page.goto('/candidates/kaohsiung-council-03-e4af3760/');
  await expect(
    page.getByTestId('profile-tabs').getByTestId('research-summary'),
  ).toContainText('官方來源字元差異');
});

test('all five mayor profiles expose six neutral, source-backed sections', async ({
  page,
}) => {
  const candidates = [
    {
      slug: 'zhang-jing-2026',
      name: '張靜',
      party: '司法改革黨',
      birthDate: '1956-05-27',
    },
    {
      slug: 'wang-zhao-min-2026',
      name: '王肇民',
      party: '無',
      birthDate: '1963-08-29',
    },
    {
      slug: 'ke-zhi-en-2026',
      name: '柯志恩',
      party: '中國國民黨',
      birthDate: '1962-04-29',
    },
    {
      slug: 'hong-fang-long-2026',
      name: '洪方隆',
      party: '無',
      birthDate: '1963-11-24',
    },
    {
      slug: 'lai-rui-long-2026',
      name: '賴瑞隆',
      party: '民主進步黨',
      birthDate: '1973-11-15',
    },
  ];
  const tabs = [
    '基本資料',
    '政策主張',
    '公共紀錄',
    '新聞',
    '公共關係史',
    '政治時間軸',
  ];
  for (const candidate of candidates) {
    await page.goto(`/candidates/${candidate.slug}/`);
    const profile = page.getByTestId('profile-tabs');
    await expect(
      page.getByRole('heading', { name: candidate.name, exact: true }),
    ).toBeVisible();
    await expect(profile).toContainText(candidate.party);
    await expect(profile).toContainText(candidate.birthDate);
    for (const tab of tabs) {
      const tabButton = profile.getByRole('tab', { name: tab, exact: true });
      await tabButton.click();
      await expect(tabButton).toHaveAttribute('aria-selected', 'true');
      const panelId = await tabButton.getAttribute('aria-controls');
      if (!panelId) throw new Error('Profile tab is missing aria-controls');
      const activePanel = profile.locator(`#${panelId}`);
      await expect(activePanel).toBeVisible();
      await expect(activePanel.locator('h3, h4').first()).toBeVisible();
    }
  }
});

const officialCouncilRoster = JSON.parse(
  readFileSync(
    new URL(
      '../../data/approved/2026/kaohsiung-election.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as {
  candidates: Array<{
    electionType: string;
    districtId: string;
    slug: string;
    displayName: string;
    politicalParty: string | null;
    birthDate?: string;
    cecDirectoryName?: string;
  }>;
};

test('all official council routes expose CEC identity fields and tab behavior', async ({
  page,
}) => {
  const councilCandidates = officialCouncilRoster.candidates.filter(
    (candidate) => candidate.electionType.endsWith('council'),
  );
  expect(councilCandidates).toHaveLength(101);

  const districtRoutes = [
    'kaohsiung-council-01',
    'kaohsiung-council-02',
    'kaohsiung-council-03',
    'kaohsiung-council-04',
    'kaohsiung-council-05',
    'kaohsiung-council-06',
    'kaohsiung-council-07',
    'kaohsiung-council-08',
    'kaohsiung-council-09',
    'kaohsiung-council-10',
    'kaohsiung-council-11',
    'kaohsiung-indigenous-flat-12',
    'kaohsiung-indigenous-mountain-13',
    'kaohsiung-indigenous-mountain-14',
    'kaohsiung-indigenous-mountain-15',
  ];
  const districtCounts = [5, 5, 8, 12, 7, 4, 12, 9, 10, 13, 6, 3, 2, 3, 2];

  for (let index = 0; index < districtRoutes.length; index += 1) {
    await page.goto(`/districts/${districtRoutes[index]}/`);
    await expect(
      page.getByRole('heading', { name: /高雄市議員第/ }),
    ).toBeVisible();
    await expect(page.locator('a.candidate-card')).toHaveCount(
      districtCounts[index],
    );
  }

  for (const candidate of councilCandidates) {
    await page.goto(`/candidates/${candidate.slug}/`);
    const profile = page.getByTestId('profile-tabs');
    await expect(
      page.getByRole('heading', { name: candidate.displayName, exact: true }),
    ).toBeVisible();
    await expect(profile).toContainText(candidate.politicalParty ?? '');
    await expect(profile).toContainText(candidate.birthDate ?? '');
    await expect(
      profile.getByRole('link', { name: /source-cec-vote2026-t-64000/ }),
    ).toBeVisible();
  }

  const conflictCandidate = councilCandidates.find(
    (candidate) => candidate.cecDirectoryName,
  );
  if (!conflictCandidate) throw new Error('Missing CEC/KHEC name conflict');
  await page.goto(`/candidates/${conflictCandidate.slug}/`);
  const conflictProfile = page.getByTestId('profile-tabs');
  await expect(conflictProfile).toContainText(
    conflictCandidate.cecDirectoryName ?? '',
  );
  await expect(conflictProfile).toContainText('待人工比對');

  for (const tab of [
    '基本資料',
    '政策主張',
    '公共紀錄',
    '新聞',
    '公共關係史',
    '政治時間軸',
  ]) {
    const tabButton = conflictProfile.getByRole('tab', {
      name: tab,
      exact: true,
    });
    await tabButton.click();
    await expect(tabButton).toHaveAttribute('aria-selected', 'true');
    const panelId = await tabButton.getAttribute('aria-controls');
    if (!panelId) throw new Error('Profile tab is missing aria-controls');
    const activePanel = conflictProfile.locator(`#${panelId}`);
    await expect(activePanel).toBeVisible();
    await expect(activePanel.locator('h3, h4').first()).toBeVisible();
  }
});

test('static search finds the fictional demo candidate without changing official data', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('city-explorer')).toHaveAttribute(
    'data-hydrated',
    'true',
  );
  await page.getByLabel('搜尋人物').fill('林海星');
  await expect(
    page.getByRole('button', { name: /林海星/ }).first(),
  ).toBeVisible();
});

test('developer avatar preview loads the fictional asset inspector', async ({
  page,
}) => {
  await page.goto('/avatar-preview/');
  const preview = page.getByTestId('avatar-preview-app');
  await expect(preview).toHaveAttribute('data-hydrated', 'true');
  await expect(preview.getByLabel('角色資產')).toBeVisible();
  await expect(preview).toContainText(
    '虛構原創資產，不代表真實人物 likeness 核准',
  );
  await preview.getByRole('button', { name: 'Greeting' }).click();
  await expect(
    preview.getByRole('button', { name: 'Greeting' }),
  ).toHaveAttribute('aria-pressed', 'true');
});

test('WebGL fallback keeps the candidate journey usable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: () => null,
    });
  });
  await page.goto('/');
  await expect(page.getByTestId('city-explorer')).toHaveAttribute(
    'data-hydrated',
    'true',
  );
  await expect(page.getByTestId('static-city-fallback')).toBeVisible();
  await page.locator('[aria-controls="city-people-tray"]').click();
  await page
    .getByRole('button', { name: /林海星/ })
    .first()
    .click();
  await expect(page.getByTestId('profile-panel')).toContainText('基本資料');
});
