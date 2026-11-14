import { describe, expect, it } from 'vitest';
import {
  CANDIDATE_SHEET_NAV_GAP,
  resolveCandidateSheetBounds,
} from './candidate-sheet-geometry';

describe('resolveCandidateSheetBounds', () => {
  it('keeps the sheet below the measured navbar with the standard gap', () => {
    const bounds = resolveCandidateSheetBounds({
      viewportHeight: 900,
      navBottom: 80,
    });

    expect(bounds.top).toBe(80 + CANDIDATE_SHEET_NAV_GAP);
    expect(bounds.top).toBeGreaterThan(80);
    expect(bounds.top + bounds.maxHeight).toBe(900);
  });

  it('rounds a fractional navbar edge outward so no pixel of the sheet is clipped', () => {
    const bounds = resolveCandidateSheetBounds({
      viewportHeight: 844,
      navBottom: 60.4,
    });

    expect(bounds.top).toBe(61 + CANDIDATE_SHEET_NAV_GAP);
  });

  it('uses the available space from the navbar to the bottom edge', () => {
    const bounds = resolveCandidateSheetBounds({
      viewportHeight: 640,
      navBottom: 70,
      gap: 8,
    });

    expect(bounds.top).toBe(78);
    expect(bounds.maxHeight).toBe(562);
  });

  it('never returns a negative height for a viewport shorter than the navbar', () => {
    const bounds = resolveCandidateSheetBounds({
      viewportHeight: 40,
      navBottom: 80,
    });

    expect(bounds.top).toBe(90);
    expect(bounds.maxHeight).toBe(0);
  });
});
