import { describe, expect, it } from 'vitest';
import { PROFILE_TABS } from './ProfileTabs';

describe('candidate profile section structure', () => {
  it('exposes exactly the four production sections in Traditional Chinese', () => {
    expect(PROFILE_TABS).toEqual([
      { id: 'basic', label: '基本資料' },
      { id: 'policies', label: '政策主張' },
      { id: 'news', label: '正負面新聞' },
      { id: 'career', label: '從政歷程' },
    ]);
  });

  it('does not retain obsolete standalone profile sections', () => {
    const labels = PROFILE_TABS.map((tab) => tab.label);
    expect(labels).not.toContain('公共紀錄');
    expect(labels).not.toContain('公共關係史');
    expect(labels).not.toContain('政治時間軸');
  });
});
