import type { PublicCandidateProfile } from '../data';
import {
  COUNCIL_CONSTITUENCIES,
  COUNCIL_CONSTITUENCY_BY_SLUG,
  coveragesForAdminDistrictId,
} from '../data/constituencies';
import {
  ADMIN_DISTRICT_BY_ID,
  ADMIN_DISTRICT_BY_NAME,
  ADMIN_DISTRICTS,
  type DistrictRecord,
} from './geography';
import { adminDistrictConnectivity } from './road-graph';

/**
 * Official 高雄市議會 constituency mapping derived from the canonical coverage
 * module. Constituencies 1-11 are the ordinary geographic districts; 12 is the
 * citywide Plains Indigenous constituency; 13-15 list Mountain Indigenous
 * eligibility coverage. Keeping a single derivation prevents the map and the
 * static pages from drifting apart.
 */
export const CONSTITUENCY_ADMIN_NAMES: Record<number, string[]> =
  Object.fromEntries(
    COUNCIL_CONSTITUENCIES.map((coverage) => [
      coverage.number,
      coverage.adminDistrictIds.map(
        (id) => ADMIN_DISTRICT_BY_ID.get(id)?.shortName ?? id,
      ),
    ]),
  );

export type MovementScope = {
  kind: 'mayoral' | 'council' | 'indigenous' | 'demo';
  allowedAdminIds: string[];
  allowedAdminNames: string[];
  label: string;
  eligibilityNote?: string;
};

const MAYORAL_NAMES = ADMIN_DISTRICTS.map((district) => district.shortName);
const ALL_ADMIN_IDS = ADMIN_DISTRICTS.map((district) => district.id);

function idsForNames(names: string[]): string[] {
  return names
    .map((name) => ADMIN_DISTRICT_BY_NAME.get(name)?.id)
    .filter((id): id is string => Boolean(id));
}

export function constituencyNumberForSlug(slug: string): number | null {
  return COUNCIL_CONSTITUENCY_BY_SLUG.get(slug)?.number ?? null;
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

  const coverage = COUNCIL_CONSTITUENCY_BY_SLUG.get(slug);
  if (coverage) {
    if (coverage.kind === 'ordinary') {
      const names = CONSTITUENCY_ADMIN_NAMES[coverage.number] ?? [];
      return {
        kind: 'council',
        allowedAdminIds: [...coverage.adminDistrictIds],
        allowedAdminNames: names,
        label: `市議員第${coverage.number}選舉區`,
      };
    }
    if (coverage.kind === 'plains-indigenous') {
      return {
        kind: 'indigenous',
        allowedAdminIds: ALL_ADMIN_IDS,
        allowedAdminNames: MAYORAL_NAMES,
        label: '平地原住民選舉區・全市移動範圍',
        eligibilityNote:
          coverage.eligibilityNote ??
          '平地原住民選舉區依身分與選舉資格認定，不是行政區地理邊界。',
      };
    }
    // Mountain Indigenous coverage is an eligibility list, not one contiguous
    // geographic constituency: the hex road graph has several disconnected
    // components. Simulated movement therefore uses the largest connected
    // component of the canonical coverage (deterministic tie-break by smallest
    // district id) instead of silently granting all 38 districts.
    const connectivity = adminDistrictConnectivity(coverage.adminDistrictIds);
    const allowedAdminIds = connectivity.largestComponent;
    const allowedAdminNames = allowedAdminIds.map(
      (id) => ADMIN_DISTRICT_BY_ID.get(id)?.shortName ?? id,
    );
    const detachedNote = connectivity.detached.length
      ? `；${connectivity.detached.length} 個未連通行政區不納入模擬移動範圍`
      : '';
    return {
      kind: 'indigenous',
      allowedAdminIds,
      allowedAdminNames,
      label: `山地原住民選舉區（第${coverage.number}選舉區）・${allowedAdminIds.length} 區移動範圍`,
      eligibilityNote: `${coverage.eligibilityNote ?? '山地原住民選舉區依身分與設籍資格認定，不是一般地理選區。'} 模擬移動範圍取候選資格覆蓋區中道路網最大連通區塊${detachedNote}；官方選舉資格範圍不變。`,
    };
  }

  return {
    kind: 'demo',
    allowedAdminIds: idsForNames(['左營', '楠梓']),
    allowedAdminNames: ['左營', '楠梓'],
    label: '虛構示範資料・左營與楠梓',
  };
}

export function movementScopeForCandidate(
  candidate: PublicCandidateProfile,
): MovementScope {
  return movementScopeForDistrictSlug(candidate.district.slug);
}

export function electoralDistrictSlugForAdminName(name: string): string | null {
  const district: DistrictRecord | undefined = ADMIN_DISTRICT_BY_NAME.get(name);
  if (!district) return null;
  const ordinary = coveragesForAdminDistrictId(district.id).find(
    (coverage) => coverage.kind === 'ordinary',
  );
  return ordinary?.slug ?? null;
}

export function candidateRole(
  candidate: PublicCandidateProfile,
): 'mayor' | 'council' | 'indigenous' | 'demo' {
  const kind = movementScopeForCandidate(candidate).kind;
  return kind === 'mayoral' ? 'mayor' : kind;
}
