/** Shared, renderer-free layout anchors used by the HUD and the 3D scene. */

export const CANDIDATE_ANCHOR = {
  x: 0.6,
  z: 5.8,
  spacingX: 0.95,
  spacingZ: 0.95,
  columns: 4,
};

export function candidateMarkerPosition(
  index: number,
  count: number,
): [number, number, number] {
  const rows = Math.ceil(count / CANDIDATE_ANCHOR.columns);
  const startX =
    CANDIDATE_ANCHOR.x -
    ((CANDIDATE_ANCHOR.columns - 1) * CANDIDATE_ANCHOR.spacingX) / 2;
  const startZ =
    CANDIDATE_ANCHOR.z - ((rows - 1) * CANDIDATE_ANCHOR.spacingZ) / 2;
  const row = Math.floor(index / CANDIDATE_ANCHOR.columns);
  const column = index % CANDIDATE_ANCHOR.columns;
  return [
    startX + column * CANDIDATE_ANCHOR.spacingX,
    0.11,
    startZ + row * CANDIDATE_ANCHOR.spacingZ,
  ];
}
