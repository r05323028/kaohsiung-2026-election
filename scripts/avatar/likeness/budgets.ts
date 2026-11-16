/**
 * Measured budgets for likeness head kits. These are testable limits, not
 * artistic targets: the import-and-deform kit sits inside every range, so a
 * regression that blows a budget indicates a pipeline bug rather than a
 * slightly heavier sculpture.
 */
export const LIKENESS_BUDGETS = {
  triangleCount: { min: 2_000, max: 14_000 },
  meshCount: { min: 6, max: 40 },
  materialCount: { min: 4, max: 16 },
  /** Head kits carry no textures; anything image-bearing is a modelling error. */
  fileSizeBytes: { min: 40_000, max: 400_000 },
  /** Kits are authored in HeadPivot-local space (chin at y=0, forward +Z). */
  bounds: {
    minY: -0.35,
    maxY: 1.45,
    maxAbsX: 0.7,
    minZ: -0.65,
    maxZ: 0.65,
  },
} as const;
