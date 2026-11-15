/**
 * Cross-component invalidation signal for work that does not need to run on
 * every frame.
 *
 * The world is almost entirely static geometry lit by a fixed sun, so the
 * shadow map only has to be redrawn when the visible geometry set changes:
 * building LOD tiers, landmark detail tiers, or the initial model load.
 * Components that swap geometry bump this version; the renderer-side
 * controllers watch it.
 */
export const staticSceneSignal = { version: 0 };

/** Marks the static geometry set as changed so shadow maps are refreshed. */
export function invalidateStaticScene(): void {
  staticSceneSignal.version += 1;
}
