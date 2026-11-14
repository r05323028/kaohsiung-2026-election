# 港都人物誌 HUD and geographic continuity report

## Scope and repository state

This work restores the City Explorer identity and navigation and replaces rectangular district focus with authoritative TOWNSHIP polygon footprints. It does not replace candidate data, editorial policy, the NPC simulation, or the 左營–楠梓 hero art.

- Project root: `/Users/seanchang/kaohsiung-2026-election`.
- Source history: **not a Git repository**. There is no `.git` directory. I did not run `git init`, overwrite a repository, or invent a commit history. All changes below are file-level working-tree changes only.
- Preserved: existing candidate profiles and provenance, profile/search routes, constituency rules, `src/world/walk-graph.ts`, `src/world/simulation.ts`, and the hero scene assets.
- Source geography: 內政部國土測繪中心, `TOWN_MOI_1140318`; display-only simplified polygons (RDP 0.0002°). No cadastral, legal, or eligibility claim is made.

## Root causes

1. **Missing brand and navigation.** `src/styles/global.css` hides `.topbar` under `body.is-immersive`. `CityExplorer` only showed a generic slogan, so the immersive page had no 港都人物誌 link and no desktop/mobile site navigation.
2. **Rectangular district focus.** 左營 and 楠梓 used a hard-coded `heroFocusToWorld(districtFocus.zuoying/nanzih)` path instead of the selected authoritative polygon. Other selected districts also depended on approximate framing.
3. **Visible diorama platform.** `buildStaticCity` in `src/city/layout.ts` began with a 35.2 × 32.2 wood/sand/grass base and four border strips. Selected district meshes were only 18% opaque, exposing that base and the ocean immediately around it.
4. **Decorative rectangle under the hero.** The stylized harbour water was a single 35 × 4.3 plane (`makeHarbour` in `src/city/water.ts`). It is water art, not the removed terrain base, but its hard edges read as a platform.

## Implementation

### City Explorer HUD

- Restored a home-linked brand: 港 mark, **港都人物誌**, and `KAOHSIUNG CIVIC PORTRAITS`.
- Added desktop navigation: 城市探索 / 選舉區 / 關於計畫 / 資料與政策, with BASE_PATH-safe `withBase` links and `aria-current`.
- Added a 44 × 44 mobile menu with `aria-expanded`, `aria-controls="city-mobile-nav"`, labelled drawer navigation, Escape close, and focus restoration to the trigger.
- Kept search, settings, district context, and the existing profile panel. Opening/closing the menu or changing district focus does not reset simulation state.
- The global immersive topbar remains intentionally hidden to avoid duplicate chrome.

### Authoritative district geometry

- New `src/world/district-geometry.ts`:
  - `districtShapeGeometry()` merges one `THREE.ShapeGeometry` per authoritative ring, with hole triangulation and a per-district cache.
  - `districtGeometryStats()` reports rings, triangles, vertices, computed area, bbox area, fill ratio, and validity.
  - `worldDistrictFocus()` uses the bbox centre only when it lies inside the polygon; otherwise it uses the authoritative label point. Radius is the farthest polygon vertex from that target × 1.18.
  - `worldDistrictOutline()` renders every ring, including holes.
- `WorldLayer` now uses these polygons for all 38 districts. Selected fills are fully opaque; neighbouring terrain remains visible.
- Removed the rectangular wood/sand/grass base and border strips from `buildStaticCity`.
- Raised the hero streaming threshold from 4.4 km to 6.5 km, covering 左營 (4.57 km focus radius) and 楠梓 (6.36 km) without enabling unrelated districts.
- Tapered the harbour water polygon so it reads as water rather than a rectangular platform. The quay strip, warehouses, and hero art are preserved.

### Debug overlay

Append `?debug=boundaries` to show:

- 38 district labels (`id·shortName`) and the active district;
- official boundary-gate points from `GEOGRAPHY.gates`;
- the hero walk graph and hero bounds.

The overlay is opt-in, has pointer-events disabled, and adds no production HUD.

## Geographic verification

Automated geometry checks cover **all 38 districts**, not just the screenshots below.

| District | Rings | Triangles | Computed km² | Official km² | Ratio | Bbox / polygon | Focus radius |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| E03 左營 | 1 | 110 | 22.5989 | 22.5822 | 1.00074 | 1.9039 | 4.5699 km |
| E04 楠梓 | 1 | 169 | 28.2653 | 28.2834 | 0.99936 | 2.1386 | 6.3612 km |
| E10 旗津 | 1 | 42 | 12.7502 | 12.8119 | 0.99518 | 4.2686 | 6.2046 km |
| E15 大樹 | 1 | 190 | 67.3820 | 67.3585 | 1.00035 | 1.5054 | 9.1704 km |
| E37 桃源 | 2 | 815 | 977.3943 | 977.3437 | 1.00005 | 2.2106 | 38.7056 km |

Across all 38 districts:

- All geometry records are valid; total 7,174 triangles.
- Computed/official area ratio is **0.98833–1.00172** (37 of 38 within 1%; maximum deviation 1.1673%).
- The smallest bbox-to-polygon ratio is **1.5054** (大樹). Every district's bbox is at least 1.5× its polygon area, so a bounding box is not a substitute for the footprint.
- Every `worldDistrictFocus` target lies inside its own polygon.
- 桃源 keeps both rings. 旗津 keeps one main walkable ring and 16 remote-island metadata entries.
- Synthetic square-with-hole triangulation returns area 4 plain and area 3 with the hole, confirming hole handling.

This verifies geometry and camera targeting. It does **not** claim that all 38 districts have street-level art or a complete pedestrian network.

## Visual evidence

Evidence lives in `reports/visual/hud-geo/`. All captures use SwiftShader; this is software rendering, not a hardware-GPU performance claim.

| File | Evidence |
| --- | --- |
| `before/01-citywide.png` | Old slogan, no brand/nav, citywide view. |
| `before/02-zuoying.png` | Old 左營 focus with tiny hero art and old HUD. |
| `after/01-citywide.png` | 港都人物誌 brand, four desktop links, continuous citywide terrain. |
| `after/02-zuoying.png` | Selected 左營 authoritative irregular polygon with hero art, no rectangular base. |
| `after/03-nanzih.png` | Selected 楠梓 polygon and hero scene. |
| `after/04-qijin.png` | 旗津 footprint with its remote-island chip. |
| `after/05-taoyuan.png` | 桃源 two-ring MultiPolygon footprint. |
| `after/06-debug-zuoying.png` | 38 debug labels, gates, hero graph and bounds. |
| `after/07-candidate-focus.png` | Candidate 黃文志 (`kaohsiung-council-04-712cf4dd`), close camera and profile panel. |
| `after/08-mobile-citywide.png` | Mobile citywide HUD. |
| `after/09-mobile-menu.png` | Open mobile navigation drawer. |
| `after/10-mobile-zuoying.png` | Mobile selected-district focus. |
| `after/11-council-crossing-nanzih.png` | Council-04 actor after an accepted 左營 → 楠梓 transition. |

Candidate-crossing assertion from the capture bridge:

- actor `kaohsiung-council-04-23bd0041`, current district E04 楠梓, behavior `walking`;
- position `x=-0.6193938802360599, z=-1.1124066160008392`;
- `districtTransitions=1`, `blockedTransitions=0`;
- camera `[20.879344504462626, 28.983292999999996, 20.17180360120375]`, zoom `258.397933`.

### Walkthrough videos

| File | Format | Duration | Notes |
| --- | --- | ---: | --- |
| `after/walkthrough-desktop.webm` | VP9, 1600×1000, 25 fps, 14.0 MB | 39.80 s | Citywide HUD/nav, admin tray, 左營, 楠梓, debug overlay. |
| `after/walkthrough-mobile.webm` | VP9, 390×844, 25 fps, 2.29 MB | 20.44 s | Mobile HUD, menu, 左營 focus. |

Under SwiftShader the camera needs about 8 seconds to settle on the hero after selecting 左營. The desktop recording includes a real loading transition around 27–30 seconds while navigating to the district page. It was not edited out. Screenshot waits were increased to 6–7 seconds after an earlier 2.4-second capture caught the GSAP tween mid-flight.

## Performance

Measured in `reports/performance/hud-geo.json` on an Apple M1 Pro, 8 cores, 16 GiB, ANGLE Vulkan **SwiftShader**. These numbers are not representative of a hardware GPU.

| Scene | Viewport | Avg FPS | Low FPS | Draw calls | Triangles |
| --- | --- | ---: | ---: | ---: | ---: |
| Citywide | 1600×1000 | 8.2 | 7.6 | 106 | 67,232 |
| Citywide | 390×844 | 17.6 | 17.0 | 106 | 67,232 |
| Hero | 1600×1000 | 3.5 | 2.7 | 621 | 510,954 |
| Hero | 390×844 | 6.3 | 5.7 | 596 | 413,481 |

Comparison with the prior living-world measurement:

- Citywide draw calls and triangles are unchanged (106 / 67,232). The FPS difference (8.2 vs 6.8) is software-rendering variance, not a performance improvement claim.
- Hero draw calls are unchanged at 621; triangles changed from 511,260 to 510,954. The FPS difference (3.5 vs 2.6) is likewise not claimed as an improvement.
- The hero remains draw-call/material-bound. Adaptive LOD and instanced-character work predate this change; this HUD/geography task did not add a performance optimization.
- No hardware-GPU measurement was possible. **I do not claim 60 FPS desktop or 30 FPS mobile.**

## Tests and validation

| Gate | Result |
| --- | --- |
| `npm test` (Vitest) | 16 files, **121 tests passed** |
| Full Playwright | **34 passed** in 168.4 s |
| `npm run typecheck` | 141 files, **0 errors, 0 warnings, 0 hints** |
| Direct `./node_modules/.bin/biome check src scripts tests playwright.config.ts` | **129 files, exit 0** |
| `npm run build` | exit 0, **134 static pages**; pre-existing large-chunk warning remains |
| OpenSpec strict validation | `Change 'fix-city-hud-and-geographic-continuity' is valid` |

The full Playwright suite initially had one failure: `tests/e2e/smoke.spec.ts` still expected the removed slogan. The test was updated to assert the current `港都人物誌` heading; this is an intentional product copy change, not a weakened assertion. There remains a local wrapper problem where plain `npm run lint` invokes an ESLint JSON parse wrapper; the direct repository Biome binary is clean.

New tests cover:

- geometry stats, area tolerance, bbox separation, every focus target inside its polygon, 桃源's two rings, 旗津's remote metadata, and hole triangulation;
- brand/link/navigation, query-driven district focus, 38 debug labels, and mobile menu accessibility;
- existing NPC/camera/crossing behavior remains green.

## Regressions, limitations, and gaps

- **Population distribution is unchanged:** 31 of 38 districts are populated by the 106 official candidates. The seven naturally empty districts remain 路竹, 茄萣, 美濃, 甲仙, 杉林, 桃源, and 那瑪夏. No fictional candidates were added.
- **Harbour art is not authoritative land:** the tapered decorative harbour basin/quay visually overlaps E03/E17. It is water art, not the district fill; no claim of full land-cover alignment is made.
- **旗津 remote islands:** the 16 remote rings are metadata only and are not walkable or included in citywide camera bounds.
- **Mobile framing:** the mobile selected-district view is less tight than desktop because the camera fit uses the smaller viewport dimension, and the district card overlays the upper map. Navigation and focus remain functional.
- **Citywide pedestrian network:** only selected hero routes and the gate-level mayoral corridor have been validated. This task did not complete a street-level survey of all 38 districts.
- **Screenshots are representative, not all 38:** all 38 are geometry-tested; visual captures cover citywide, 左營, 楠梓, 旗津, 桃源, candidate focus, mobile, and a crossing.
- **Repository history:** because the project is not a Git repository, there is no commit or diff history to audit. Do not initialize Git without an explicit decision from the project owner.
- **Build size warning:** chunks over 500 kB are still reported by the build. This task did not address bundle splitting.

## Conclusion

The 港都人物誌 identity and site navigation are restored in the immersive City Explorer on desktop and mobile. District focus is now derived from the authoritative 38-district polygons, all rings and holes are preserved, the rectangular hero platform is removed, the hero streams at the correct 左營/楠梓 scale, and an opt-in boundary debug overlay makes the model inspectable. Existing simulation and editorial behavior remain intact. Performance is reported honestly from software rendering, with the unresolved hero draw-call cost and hardware-GPU gap called out.
