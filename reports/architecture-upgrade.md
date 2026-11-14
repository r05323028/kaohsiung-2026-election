# Stylised architecture upgrade

## Summary

The hex world previously rendered bare plaza discs with landmarks and trees; the
only building-like objects were landmark props. It now generates a deterministic
ring of Taiwanese architecture around every landmark, using six reusable
archetypes, six regional profiles, three shared PBR materials, and three
cumulative detail tiers.

- **196 buildings** across the 38 districts (40 tiles).
- **Archetypes:** townhouse 68, arcade shophouse 37, apartment 17, corner
  commercial 14, modern block 16, warehouse 44.
- **Geometry:** 37,608 low / 99,060 medium / 110,820 high triangles for the whole
  building layer.
- **Draw calls:** 3 building meshes (6 including the shadow pass); the rest of the
  scene is unchanged.
- **Landmarks, candidates, roads, GIS boundaries, camera, hover, and selection**
  are untouched.

## Files

| File | Purpose |
| --- | --- |
| `src/world/buildings.ts` | Specs, archetypes, district profiles, palettes, seeded layout, landmark clearance, height cap, LOD selector. |
| `src/world/building-geometry.ts` | Tiered merged geometry with vertex colours and cumulative index ranges. |
| `src/components/HexBuildings.tsx` | Three material buckets and zoom-driven draw ranges. |
| `src/components/HexWorldLayer.tsx` | Building layer integration; trees moved to the outer ring. |
| `src/components/CityScene.tsx` | Key light direction/intensity and exposure tuning. |
| `src/world/buildings.test.ts`, `src/world/building-geometry.test.ts` | 13 new tests. |
| `scripts/capture-architecture.ts` | Deterministic before/after screenshot set. |
| `scripts/measure-architecture-performance.ts` | Desktop/mobile perf samples. |

## Regional identity

- **Zuoying (E03)** uses the historic profile: townhouses and arcade shophouses,
  gable and hip roofs, warm plaster, terracotta and slate, awnings, water tanks,
  and solar panels.
- **Nanzih (E04)** uses the industrial profile: sawtooth warehouses with roller
  doors, vents, and chimneys, plus modern flat-roofed blocks and cooler metal
  colours. Its park and wetland clearance leaves only three lots; landmarks were
  not moved to fill the tile.
- The remaining districts map to dense urban, harbour, rural, or mountain
  profiles while sharing the same construction kit and palette discipline.

## Performance

Measured in headless Chromium with SwiftShader (software WebGL) at 1600×1000.
`architecture-no-buildings.json` and `architecture-after.json` are the same
branch with the building layer toggled, so the delta is the architectural layer
itself. The final post-merge check at the same viewport reported 1,803 → 1,809
draw calls and 608,838 → 684,054 triangles; the absolute totals include the
candidate-motion work merged from main, while the building delta is unchanged.

| Scenario | Draw calls | Triangles |
| --- | --- | --- |
| World overview, no buildings | 1,803 | 608,838 |
| World overview, with buildings | 1,809 | 684,054 |
| Delta | +6 (3 meshes × main + shadow pass) | +75,216 (37,608 × 2 passes) |

At district focus the layer switches from low to medium detail (99,060 triangles
for the buildings alone); at zoom ≥155 it reaches high detail (110,820). The
triangles remain within the planned budgets (low ≈35k, medium ≈100k, high ≈200k).

FPS samples under software WebGL are not a reliable regression signal: the
controlled A/B reported desktop 6.5 → 2.8 FPS but mobile 3.6 → 8.5 FPS, and the
final run reported 2.4 → 2.1 FPS. The report therefore treats FPS as an
inconclusive lower bound and bases the comparison on draw calls and triangles.
Physical-GPU performance remains unverified in this environment.

`reports/performance/architecture-before.json` additionally records the main
branch without the feature for context; it is not the controlled A/B.

## Visual evidence

`reports/visual/architecture/before/` and `.../after/` were captured with the
same 1440×900 camera, district selection, wheel counts, and pan, at
`reducedMotion: reduce`. The mobile pair was captured at 390×844, dpr 2, with
左營 selected.

| Shot | Before | After |
| --- | --- | --- |
| City overview | `before/01-world.png` | `after/01-world.png` |
| Zuoying focus | `before/02-zuoying.png` | `after/02-zuoying.png` |
| Zuoying close-up | `before/03-zuoying-detail.png` | `after/03-zuoying-detail.png` |
| Nanzih focus | `before/04-nanzih.png` | `after/04-nanzih.png` |
| Nanzih close-up | `before/05-nanzih-detail.png` | `after/05-nanzih-detail.png` |
| Mobile, 左營 | `before/06-mobile.png` | `after/06-mobile.png` |

## Verification

- `npx vitest run`: 30 files, 190 tests pass after merging main (13 new).
- `npx astro check`: 0 errors, 0 warnings, 0 hints.
- `npm run build`: see the build result recorded with the merge commit.
- New tests cover deterministic generation, district ownership, ring and height
  limits, all six archetypes, landmark clearance, the open camera arc, LOD
  selection, and geometry bucket integrity.

## Limitations

- Buildings are decorative procedural architecture, not surveyed footprints.
- Nanzih's park/wetland tile is intentionally sparse.
- Landmarks remain dedicated models and were not repositioned or replaced.
- The facade detail reads best at district focus or closer; the citywide view
  relies on massing, roofs, and colour.
- No physical iPhone/Android device was available; mobile evidence is a headless
  390×844 capture with software WebGL.
