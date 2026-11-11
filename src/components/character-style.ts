import type { PublicCandidateProfile } from '../data';

/**
 * Deterministic miniature styling. Candidate identity data is untouched: these
 * are clearly stylised clothing / hair variants, not physical likeness claims.
 */
export type CharacterOutfit = 'blazer' | 'polo' | 'coat' | 'cardigan' | 'sash';
export type CharacterHairStyle = 'side-part' | 'bob' | 'bun' | 'waves';
export type CharacterSleeve = 'long' | 'short';

export type CharacterStyle = {
  variant: number;
  outfit: CharacterOutfit;
  hairStyle: CharacterHairStyle;
  sleeve: CharacterSleeve;
  skirt: boolean;
  skin: string;
  hair: string;
  top: string;
  bottom: string;
  accent: string;
  shirt: string;
  jacket: string;
  trim: string;
  accessory: 'glasses' | 'scarf' | 'hat' | 'none';
};

/** Model parts that every candidate must render for silhouette completeness. */
export const CHARACTER_PART_NAMES = [
  'hair',
  'head',
  'eyes',
  'neck',
  'torso',
  'collar',
  'left-arm',
  'right-arm',
  'left-hand',
  'right-hand',
  'left-leg',
  'right-leg',
  'left-shoe',
  'right-shoe',
] as const;

/**
 * Chibi proportions in model units. The shared model is ~2.9 heads tall so
 * faces stay readable without infant-like oversized-head distortion.
 */
export const CHARACTER_PROPORTIONS = {
  totalHeight: 1.1,
  headDiameter: 0.37,
  headRatio: 0.37 / 1.1,
  shoeTop: 0.064,
  legLength: 0.26,
  hipY: 0.3,
  torsoTop: 0.632,
  shoulderY: 0.595,
  neckTop: 0.72,
  headCenterY: 0.895,
  headRadius: 0.185,
  hairTop: 1.09,
} as const;

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
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

const OUTFITS: readonly CharacterOutfit[] = [
  'blazer',
  'polo',
  'coat',
  'cardigan',
  'sash',
];
const HAIR_STYLES: readonly CharacterHairStyle[] = [
  'side-part',
  'bob',
  'bun',
  'waves',
];

/**
 * Curated clothing colours. These are outfit choices, not claims about a
 * candidate's appearance; skin and hair stay on the neutral shared palette.
 */
const OUTFIT_PALETTES: readonly {
  top: string;
  bottom: string;
  accent: string;
}[] = [
  { top: '#4CAFA8', bottom: '#294858', accent: '#E99679' },
  { top: '#E08A74', bottom: '#3E4B5C', accent: '#F2D7A6' },
  { top: '#D8B25E', bottom: '#4C5B4A', accent: '#E99679' },
  { top: '#7FB3D1', bottom: '#3B4A6B', accent: '#E8C07A' },
  { top: '#A796C6', bottom: '#414653', accent: '#E9B7A3' },
  { top: '#8FAE7B', bottom: '#5B463B', accent: '#F0D9B5' },
  { top: '#C97F8E', bottom: '#45505E', accent: '#EBD7BE' },
  { top: '#E7D4B0', bottom: '#2F5C5A', accent: '#C96F4A' },
  { top: '#6E9FB5', bottom: '#7A4D3D', accent: '#E9D7B8' },
  { top: '#B46A5C', bottom: '#2F4858', accent: '#D9B36A' },
];

export function characterStyle(
  candidate: PublicCandidateProfile,
): CharacterStyle {
  const hash = hashString(
    candidate.candidacy.slug + ':' + candidate.candidacy.id,
  );
  const base = candidate.visual.palette;
  const outfitPalette = OUTFIT_PALETTES[(hash >>> 8) % OUTFIT_PALETTES.length]!;
  const outfit = OUTFITS[hash % OUTFITS.length]!;
  const hairStyle = HAIR_STYLES[Math.floor(hash / 5) % HAIR_STYLES.length]!;
  const skirt =
    outfit === 'sash' ||
    ((outfit === 'coat' || outfit === 'cardigan') && ((hash >>> 4) & 1) === 0);
  return {
    variant: hash % 5,
    outfit,
    hairStyle,
    sleeve: outfit === 'polo' || outfit === 'sash' ? 'short' : 'long',
    skirt,
    skin: base.skin,
    hair: base.hair,
    top: outfitPalette.top,
    bottom: outfitPalette.bottom,
    accent: outfitPalette.accent,
    shirt: '#f6efe2',
    jacket: mixHex(outfitPalette.top, '#2b3a43', 0.42),
    trim: mixHex(outfitPalette.accent, '#fff7e8', 0.3),
    accessory: candidate.visual.accessory,
  };
}
