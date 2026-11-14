/**
 * Expanded candidate roster sheet geometry.
 *
 * The sheet is a fixed overlay that must sit under the global masthead without
 * covering it. The masthead is not a fixed height: it is 4rem tall on desktop,
 * 3.25rem on narrow screens, and taller again when the browser scales fonts.
 * A hard-coded offset drifts under those conditions, so the component measures
 * the real navbar bottom and feeds it through these pure helpers.
 *
 * The overlay also carries its own maximum height so a shrinking viewport (for
 * example mobile browser chrome collapsing, an on-screen keyboard, or a
 * rotation) can never push the sheet past the bottom edge between measurements.
 */

export const CANDIDATE_SHEET_NAV_GAP = 10;

export type CandidateSheetViewport = {
  viewportHeight: number;
  navBottom: number;
  gap?: number;
};

export type CandidateSheetBounds = {
  top: number;
  maxHeight: number;
};

export function resolveCandidateSheetBounds({
  viewportHeight,
  navBottom,
  gap = CANDIDATE_SHEET_NAV_GAP,
}: CandidateSheetViewport): CandidateSheetBounds {
  const top = Math.max(0, Math.ceil(navBottom) + gap);
  const maxHeight = Math.max(0, Math.floor(viewportHeight - top));
  return { top, maxHeight };
}
