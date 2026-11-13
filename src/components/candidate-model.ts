import type { CharacterStyle } from './character-style';

/**
 * Normalized height of the imported chibi in world units. The raw GLB is
 * authored at ~3.02 units tall; we scale it down once per instance so the
 * detailed and overview LODs share the same height and ground plane.
 */
export const CANDIDATE_MODEL_HEIGHT = 1.1;

/**
 * ActorLayer applies this outer scale. Keeping it here lets LOD decisions be
 * based on the actual rendered height instead of an arbitrary camera distance.
 */
export const CANDIDATE_ACTOR_SCALE = 0.42;

/**
 * World-space height of a candidate's crown above the actor's ground plane.
 * Every GLB is normalized to `CANDIDATE_MODEL_HEIGHT` and then scaled by
 * `CANDIDATE_ACTOR_SCALE`, so a badge anchored here clears the head of every
 * candidate without a per-model magic offset.
 */
export const CANDIDATE_HEAD_TOP_WORLD =
  CANDIDATE_MODEL_HEIGHT * CANDIDATE_ACTOR_SCALE;

export const CANDIDATE_MODEL = {
  basePath: '/models/kaohsiung_chibi_base.glb',
  overviewPath: '/models/kaohsiung_chibi_overview.glb',
  normalizedHeight: CANDIDATE_MODEL_HEIGHT,
  rawBaseHeight: 3.022760916,
  rawOverviewHeight: 3.025612831,
  forward: '+Z',
} as const;

/** Orthographic rendered height of a candidate in CSS pixels. */
export function candidateScreenHeight(
  zoom: number,
  actorScale = CANDIDATE_ACTOR_SCALE,
): number {
  return CANDIDATE_MODEL_HEIGHT * actorScale * zoom;
}

export const CANDIDATE_LOD = {
  detailEnterPx: 22,
  detailExitPx: 16,
} as const;

export type CandidateLod = 'detail' | 'overview';

/** Stable hysteresis: never flicker at a single threshold. */
export function resolveCandidateLod(
  screenPx: number,
  previous: CandidateLod,
): CandidateLod {
  if (previous === 'overview') {
    return screenPx >= CANDIDATE_LOD.detailEnterPx ? 'detail' : 'overview';
  }
  return screenPx <= CANDIDATE_LOD.detailExitPx ? 'overview' : 'detail';
}

export function normalizeCandidateModel(
  rawMinY: number,
  rawHeight: number,
): { scale: number; groundOffset: number } {
  const scale = CANDIDATE_MODEL_HEIGHT / Math.max(rawHeight, 0.0001);
  return { scale, groundOffset: -rawMinY * scale };
}

export type CandidateMaterialRole =
  | 'skin'
  | 'hair'
  | 'jacket'
  | 'accent'
  | 'shirt'
  | 'collar'
  | 'trousers'
  | 'cuff'
  | 'shoe'
  | 'shoeToe'
  | 'sole'
  | 'lace';

const BASE_NODE_ROLES: Record<string, CandidateMaterialRole> = {
  SculptedHead: 'skin',
  Ear_L: 'skin',
  Ear_R: 'skin',
  Neck: 'skin',
  LeftPalm: 'skin',
  RightPalm: 'skin',
  LeftThumb: 'skin',
  RightThumb: 'skin',
  Hair_Scalp: 'hair',
  HairSide_L: 'hair',
  HairSide_R: 'hair',
  Eyebrow_L: 'hair',
  Eyebrow_R: 'hair',
  TailoredJacket: 'jacket',
  LeftSleeve: 'jacket',
  RightSleeve: 'jacket',
  JacketOpening_L: 'accent',
  JacketOpening_R: 'accent',
  JacketHem: 'accent',
  JacketBadge: 'accent',
  CurvedShirtInset: 'shirt',
  CollarFold_L: 'collar',
  CollarFold_R: 'collar',
  TShirtCollar: 'collar',
  LeftTrouser: 'trousers',
  RightTrouser: 'trousers',
  LeftCuff: 'cuff',
  RightCuff: 'cuff',
  LeftSneaker: 'shoe',
  RightSneaker: 'shoe',
  LeftToe: 'shoeToe',
  RightToe: 'shoeToe',
  LeftSole: 'sole',
  RightSole: 'sole',
  LeftLace_1: 'lace',
  LeftLace_2: 'lace',
  RightLace_1: 'lace',
  RightLace_2: 'lace',
};

export function baseNodeRole(name: string): CandidateMaterialRole | null {
  return BASE_NODE_ROLES[name] ?? null;
}

/** Overview mesh roles by the stable OverviewMaterial_00..09 node order. */
export const OVERVIEW_ROLES = [
  'skin',
  'shirt',
  'jacket',
  'shoeToe',
  'shoe',
  'sole',
  'trousers',
  'cuff',
  'eye',
  'hair',
] as const satisfies readonly (CandidateMaterialRole | 'eye')[];

export type OverviewRole = (typeof OVERVIEW_ROLES)[number];

export function overviewRole(name: string): OverviewRole | null {
  const match = /OverviewMaterial_(\d{2})$/.exec(name);
  if (!match) return null;
  return OVERVIEW_ROLES[Number(match[1])] ?? null;
}

function mixHex(a: string, b: string, amount: number): string {
  const parse = (value: string) => {
    const hex = value.replace('#', '');
    const expanded =
      hex.length === 3
        ? hex
            .split('')
            .map((part) => part + part)
            .join('')
        : hex;
    return [
      Number.parseInt(expanded.slice(0, 2), 16),
      Number.parseInt(expanded.slice(2, 4), 16),
      Number.parseInt(expanded.slice(4, 6), 16),
    ] as const;
  };
  const left = parse(a);
  const right = parse(b);
  const channel = (x: number, y: number) =>
    Math.round(x + (y - x) * amount)
      .toString(16)
      .padStart(2, '0');
  return (
    '#' +
    channel(left[0], right[0]) +
    channel(left[1], right[1]) +
    channel(left[2], right[2])
  );
}

function suitColor(style: CharacterStyle): string {
  return style.outfit === 'blazer' ||
    style.outfit === 'coat' ||
    style.outfit === 'cardigan'
    ? style.jacket
    : style.top;
}

/**
 * Deterministic per-candidate palette. Face materials are never recolored, so
 * the authored sculpted face and expression survive every outfit variant.
 */
export function colorForRole(
  role: CandidateMaterialRole,
  style: CharacterStyle,
): string {
  switch (role) {
    case 'skin':
      return style.skin;
    case 'hair':
      return style.hair;
    case 'jacket':
      return suitColor(style);
    case 'accent':
      return style.accent;
    case 'shirt':
      return style.shirt;
    case 'collar':
      return style.trim;
    case 'trousers':
      return style.bottom;
    case 'cuff':
      return mixHex(style.bottom, '#fff7e8', 0.18);
    case 'shoe':
      return style.bottom;
    case 'shoeToe':
      return mixHex(style.bottom, '#fff7e8', 0.28);
    case 'sole':
      return '#f5dbc5';
    case 'lace':
      return '#f5ede0';
  }
}

export function colorForOverviewRole(
  role: OverviewRole,
  style: CharacterStyle,
): string {
  if (role === 'eye') return '#2d424a';
  if (role === 'shoeToe') return mixHex(style.bottom, '#fff7e8', 0.28);
  return colorForRole(role, style);
}
