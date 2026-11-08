import type { CandidateProfile } from '../data';
import {
  ADMIN_DISTRICT_BY_NAME,
  ADMIN_DISTRICTS,
  type DistrictRecord,
} from './geography';

/** Official 高雄市議會 constituency mapping (2026 council districts 1-11). */
export const CONSTITUENCY_ADMIN_NAMES: Record<number, string[]> = {
  1: ['桃源', '那瑪夏', '甲仙', '六龜', '杉林', '內門', '旗山', '美濃', '茂林'],
  2: ['茄萣', '湖內', '路竹', '阿蓮', '田寮'],
  3: ['永安', '岡山', '燕巢', '彌陀', '梓官', '橋頭'],
  4: ['楠梓', '左營'],
  5: ['大社', '仁武', '鳥松', '大樹'],
  6: ['鼓山', '鹽埕', '旗津'],
  7: ['三民'],
  8: ['前金', '新興', '苓雅'],
  9: ['鳳山'],
  10: ['前鎮', '小港'],
  11: ['大寮', '林園'],
};

export type MovementScope = {
  kind: 'mayoral' | 'council' | 'indigenous' | 'demo';
  allowedAdminIds: string[];
  allowedAdminNames: string[];
  label: string;
  eligibilityNote?: string;
};

function districtByName(name: string): DistrictRecord | undefined {
  return ADMIN_DISTRICT_BY_NAME.get(name);
}

function idsForNames(names: string[]): string[] {
  return names
    .map((name) => districtByName(name)?.id)
    .filter((id): id is string => Boolean(id));
}

const MAYORAL_NAMES = ADMIN_DISTRICTS.map((district) => district.shortName);
const ALL_ADMIN_IDS = ADMIN_DISTRICTS.map((district) => district.id);

export function constituencyNumberForSlug(slug: string): number | null {
  const match = slug.match(/kaohsiung-council-(\d{2})/);
  if (!match?.[1]) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value >= 1 && value <= 11 ? value : null;
}

export function movementScopeForDistrictSlug(slug: string): MovementScope {
  if (slug === 'kaohsiung-mayor-2026') {
    return {
      kind: 'mayoral',
      allowedAdminIds: ALL_ADMIN_IDS,
      allowedAdminNames: MAYORAL_NAMES,
      label: '市長候選人・全市 38 區',
    };
  }
  if (slug.startsWith('kaohsiung-indigenous')) {
    return {
      kind: 'indigenous',
      allowedAdminIds: ALL_ADMIN_IDS,
      allowedAdminNames: MAYORAL_NAMES,
      label: '原住民族選區・身分與居住地資格',
      eligibilityNote:
        '原住民族選區是身分與居住地資格，不是行政區地理邊界；此處僅用全市移動範圍作互動模擬，不代表選舉資格。',
    };
  }
  if (slug.startsWith('kaohsiung-council-')) {
    const number = constituencyNumberForSlug(slug);
    const names = number ? CONSTITUENCY_ADMIN_NAMES[number] : undefined;
    if (names) {
      return {
        kind: 'council',
        allowedAdminIds: idsForNames(names),
        allowedAdminNames: names,
        label: `市議員第${number}選舉區`,
      };
    }
  }
  return {
    kind: 'demo',
    allowedAdminIds: idsForNames(['左營', '楠梓']),
    allowedAdminNames: ['左營', '楠梓'],
    label: '虛構示範資料・左營與楠梓',
  };
}

export function movementScopeForCandidate(
  candidate: CandidateProfile,
): MovementScope {
  return movementScopeForDistrictSlug(candidate.district.slug);
}

export function electoralDistrictSlugForAdminName(name: string): string | null {
  for (const [number, names] of Object.entries(CONSTITUENCY_ADMIN_NAMES)) {
    if (names.includes(name)) {
      return `kaohsiung-council-${String(number).padStart(2, '0')}`;
    }
  }
  return null;
}

export function candidateRole(
  candidate: CandidateProfile,
): 'mayor' | 'council' | 'indigenous' | 'demo' {
  const kind = movementScopeForCandidate(candidate).kind;
  return kind === 'mayoral' ? 'mayor' : kind;
}
