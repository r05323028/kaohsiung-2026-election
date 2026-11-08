# Refine Living City Exploration UX

Change: `refine-living-city-exploration-ux`  
Repository: `/Users/seanchang/kaohsiung-2026-election`  
Status: implemented and verified; repository is **not a Git repository**, so there is no commit hash or Git diff. No repository initialization was performed.

## 1. Outcome

The five reported problems were addressed together:

| Problem | Outcome |
| --- | --- |
| Candidate selection zoomed the map out | Candidate focus now preserves the current orthographic zoom and moves only the target. The previous viewpoint is restored on close unless the user has taken manual control. |
| Buildings looked flat | The hero vertical scale was raised from `0.035` to `0.07`; landmark and roof silhouettes now read as volumes. World coordinates, district footprints, and navigation were not rescaled. |
| Generic streetscape clutter | Repeated massing, crossings, shop rows, vehicles, lights, stalls, and park/harbour props were reduced. Named landmarks were preserved. |
| Explorer app bar differed from information pages | Explorer and information pages now share `SITE_NAV_LINKS`, the harbour mark, the `港都人物誌` lockup, typography, labels, and active treatment. Explorer remains translucent; information pages remain opaque. |
| The map could not be dragged | Left/right mouse drag and one-finger touch now pan. Orbit rotation is disabled. Middle drag and two-finger touch zoom. Controls remain active during and after focus transitions. |

## 2. Root causes

### A. Candidate selection changed scale

`src/components/CityScene.tsx` derived `endZoom` from the focus radius:

`min(size.width, size.height) / (2.15 * focusRadius) * portraitBoost`

`src/components/CityExplorer.tsx` used role-specific `followRadius` values: mayoral and indigenous candidates used `8.4`, council candidates `1.8`. Selecting a mayoral candidate from a close district view therefore recomputed a much smaller zoom. The focus key also changed, so the camera tween ran again. No camera position, target, or zoom snapshot was saved, and profile open/close had no independent camera state.

### B. Buildings read as shallow slabs

`src/world/hero.ts` used `HERO_HEIGHT_SCALE = 0.035`. That compressed the entire hero model vertically while keeping its plan dimensions. The elevated orthographic camera made the result read as flat plates rather than buildings with side walls and roof volume. The projection itself was not distorting district polygons; the main cause was the vertical art scale.

### C. Too much generic streetscape

The old-town, Nanzih, park, harbour, and world massing builders repeated small blocks, crossings, vehicles, lights, and props. At citywide and district zooms these became visual noise and diluted the named landmarks.

### D. Two different site headers

`src/styles/global.css` hides the global `.topbar` under `body.is-immersive`. The Explorer supplied its own HUD mark, title, subtitle, and link styling. Information pages used `BaseLayout.astro` and the global topbar. The result was two identities: a teal `港` mark with `KAOHSIUNG CIVIC PORTRAITS` in the Explorer, and the harbour mark with `KAOHSIUNG CIVIC STORIES` on information pages.

### E. Left drag orbited instead of panning

`OrbitControls` was mounted without explicit mouse/touch button mappings. Its default left-button action is rotation. The camera therefore orbited around the target and appeared to move individual district meshes, rather than panning the continuous world.

## 3. Implementation

### Camera and interaction

Modified `src/components/CityScene.tsx` and `src/components/CityExplorer.tsx`:

- Candidate entry snapshots the pre-selection camera position, target, and zoom.
- Candidate focus uses `endZoom = clamp(camera.zoom, 3.2, 760)`; it no longer derives scale from the role radius.
- The camera target moves smoothly to the selected actor over the existing 1.15 s transition, while scale stays fixed.
- Profile open/close does not create a new focus key or reset the camera.
- Closing a candidate restores the exact saved view if the user has not taken manual control.
- OrbitControls `start` cancels the GSAP timeline. Drag or wheel marks the view as manual, stops follow, and leaves the user's chosen view in place on close.
- Follow uses frame-rate-independent smoothing:
  `1 - Math.exp(-5.5 * Math.min(frameDelta, 0.1))`
  with a `0.22` walking look-ahead. Camera and target move by the same delta.
- The target is clamped to authoritative world bounds with a one-unit margin, shifting the camera with it.
- `enableRotate={false}`; left/right mouse pan, middle dolly, one-finger pan, two-finger dolly-pan, wheel zoom, and zoom-to-cursor are enabled.
- The test bridge now exposes `camera()` with position, target, and zoom.

### Height and projection

- `HERO_HEIGHT_SCALE` changed from `0.035` to `0.07`.
- `HERO_KM_PER_UNIT` remains `0.18`. The change is visual Y-only; `heroPointToWorld`, navigation nodes, collision checks, district assignment, and candidate coordinates are unchanged.
- The elevated orthographic projection was retained after review. It keeps district footprints geometrically comparable and avoids projection distortion. No measured visual case justified a perspective migration.
- Landmarks now show side faces and roof volume at district and landmark zooms.

### Landmark-first composition and clutter

Preserved and kept recognizable:

- 左營: Dragon/Tiger Pagodas, Lotus Pond, Spring/Autumn Pavilions, old-town landmarks.
- 楠梓: 高雄都會公園, 後勁溪, its bridges and boardwalk, selected residential/urban landmarks.
- Harbour: cranes, ferry, lighthouse, selected warehouses and containers.

Reduced repeated content:

| Area | Before | After |
| --- | --- | --- |
| Old-town intersections / crossings | 9 / 18 | 3 / 6 |
| Old-town shop rows | 6 | 4 |
| Promenade lights / benches / scooters / stalls | 7 / 3 / 11 / 2 | 4 / 2 / 5 / 1 |
| Nanzih west apartments / east apartments | 2 / 5 | 1 / 3 |
| Nanzih towers / offices | 4 / 2 | 2 / 1 |
| Nanzih lights / cars / scooters / pedestrians | 5 / 2 / 4 / 3 | 3 / 1 / 2 / 1 |
| Park flower beds / benches / lights | 4 / 3 / 5 | 2 / 2 / 3 |
| Harbour bollard spacing / warehouses / lights / cars / containers | 1.3 / 2 / 11 / 2 / 6 | 2.6 / 1 / 6 / 1 / 3 |
| Static ambient pedestrians | 7 | 4 |
| World urban massing | 18 / 30 | 10 / 14 |
| World coastal massing | 12 / 20 | 7 / 11 |
| World hill massing | 6 / 10 | 4 / 7 |
| World mountain massing | 3 / 5 | 2 / 3 |

The hero apron step and skip threshold were relaxed from `0.34 / 0.18` to `0.5 / 0.26`, and the skip threshold from `0.32` to `0.55`, removing small repetitive clusters without deleting the landmarks or the walk graph.

### Shared site identity

- New `src/data/site-nav.ts` is the single navigation source for the Explorer, desktop information pages, and the no-JS mobile menu.
- `src/layouts/BaseLayout.astro` and `src/components/CityExplorer.tsx` now use the harbour mark, `brand-lockup`, `港都人物誌`, and `KAOHSIUNG CIVIC STORIES`.
- Explorer header: translucent glass over the scene.
- Information header: opaque surface.
- Shared typography, spacing, link labels, active color, and focus treatment.
- Explorer uses its accessible React drawer; Astro pages use a no-JS `<details>` menu. Both use the same links and BASE_PATH-aware `withBase()` paths.
- Routes remain 城市探索 `/`, 選舉區 `/districts/`, 關於計畫 `/about/`, 資料與政策 `/sources/`.

### Nanzih landmark repair

An independent review flagged `05-nanzih-landmark.png` as lacking a focal landmark. The park focus was reframed and the pavilion was rebuilt:

- Focus target `[11.9, 0.5, -8.4]`, offset `[-4.4, 9.0, 6.0]`, radius `4.3`.
- Pavilion moved to `(12.6, -9.4)`, with a compact open octagonal structure, visible posts/railings, a `1.7 × 1.7` stone terrace, and a smaller roof than the first repair attempt.
- Final landmark camera: position `[-13.888930999999998, 32.405418, 20.068278]`, target `[1.936606, 0.035, -1.512]`, zoom `600`.
- The green slope behind the pavilion is the neighboring E17 仁武 hill, not a rectangular district platform.

The second independent-review claim, that the mobile menu clipped the brand and district pill, was checked against the actual 390 px screenshot. The `港` mark, full `港都人物誌` title, and full district pill are visible; the claim was not reproducible and no code was changed for it.

## 4. Camera and map evidence

### Candidate scale contract

| State | Before | After |
| --- | --- | --- |
| 左營 district zoom | `101.77758` | `101.77758` |
| Select mayoral candidate 張靜 | `55.370986` (1.84× zoom-out) | `101.77758` (unchanged) |
| Profile open | same reduced zoom | `101.77758` |
| Close candidate | reduced view remained | restored `[15.744832, 32.90818, 22.146079]`, zoom `101.77758` |
| Citywide selection | — | zoom `10.482337` unchanged, target moved to actor |
| Mouse drag | camera orbited | target and camera moved together; zoom `101.77758` unchanged |
| Wheel zoom | worked | `101.77758 → 107.134295` |

Manual takeover is verified: after a drag during candidate follow, follow stops, the candidate remains selected, and closing the profile leaves the manually chosen view instead of snapping to the canonical district view.

### Screenshots and video

- Before: `reports/visual/refine/before/01-citywide.png` … `14-mobile-info.png`.
- After: `reports/visual/refine/after/01-citywide.png` … `17-mobile-info-menu.png`, plus `10b-citywide-candidate.png`.
- Manifest: `reports/visual/refine/after/manifest.json` (18 screenshots, 2 videos, camera contract, measurements, review findings).
- Desktop walkthrough: `reports/visual/refine/after/walkthrough-desktop.webm`, 1600×1000, 25 fps, 43.32 s, 18,597,983 bytes.
- Mobile walkthrough: `reports/visual/refine/after/walkthrough-mobile.webm`, 390×844, 25 fps, 24.4 s, 3,147,512 bytes.
- Final Nanzih evidence: `reports/visual/refine/after/05-nanzih-landmark.png`, 1600×1000, 661,767 bytes, SHA-256 `31599e9474d74777a73746dace1699aaec832ff9846faa70c8ebb7dbc567df3b`.

The final 05 image shows the pavilion as the central structure with the lake, boardwalk, bridge, trees, and the neighboring hill as background. It is a stylized miniature, not a surveyed architectural model.

## 5. Performance

Measured with `reports/performance/refine.json` and `reports/performance/refine-interactions.json` on an Apple M1 Pro, 8 cores, 16 GiB. Headless Chromium used **ANGLE Vulkan SwiftShader** (software WebGL). The renderer string is recorded in both files.

| Scenario | Viewport | Average FPS | Low FPS | Draw calls | Triangles |
| --- | --- | --- | --- | ---: | ---: |
| Citywide | 1600×1000 | 8.8 | 8.2 | 106 | 47,888 |
| Citywide | 390×844 | 19.5 | 18.9 | 106 | 47,888 |
| Hero 左營–楠梓 | 1600×1000 | 2.9 | 0.5 | 617 | 405,486 |
| Hero 左營–楠梓 | 390×844 | 7.4 | 6.9 | 595 | 324,029 |

Immediate pre-refine baseline (from the prior HUD/geography measurement): citywide 106 calls / 67,232 triangles, hero 621 calls / 510,954 triangles. Triangles fell by about 28.8% citywide and 20.6% hero; draw calls changed from 106 to 106 and 621 to 617. The small draw-call reduction is expected because the builder already merges geometry by material; unique landmark parts and material buckets dominate the hero count.

Interaction frame pacing, SwiftShader only:

| Interaction | p50 | p95 | Max |
| --- | ---: | ---: | ---: |
| Idle | 283.3 ms | 333.3 ms | 333.3 ms |
| Drag | 283.3 ms | 300.0 ms | 300.1 ms |
| Candidate selection | 199.9 ms | 849.9 ms | 849.9 ms |
| Close | 183.3 ms | 700.0 ms | 700.0 ms |

The selection p95 spike is visible and remains a software-rendering limitation. **No 60 FPS desktop or 30 FPS mobile claim is made.** Physical-GPU profiling was not available in this environment. The FPS changes between runs are not presented as improvements.

Built output: `dist` is 7.9 MB. Existing avatar GLBs are approximately 50–70 KB each; no new avatar assets were added.

## 6. Tests and gates

Final commands and results:

```text
npm test
  16 files, 121 tests passed

npm run typecheck
  145 files: 0 errors, 0 warnings, 0 hints

./node_modules/.bin/biome check src scripts tests playwright.config.ts
  133 files checked, exit 0

npx playwright test --reporter=line
  40 passed, 0 failed

npm run build
  exit 0, 134 pages

openspec validate refine-living-city-exploration-ux --strict
  Change is valid
```

The unit suite includes the 38-district geometry invariants, candidate uniqueness, electoral boundary checks, graph route traversal, and simulation state persistence. Playwright includes candidate scale preservation, profile stability, exact close restoration, manual takeover, mouse pan/wheel, mobile touch pan/pinch, shared branding, district focus, debug boundaries, and the existing world/candidate suites.

Plain `npm run lint` exits 1 in this environment with:

`ESLint output (JSON parse failed: EOF while parsing a value at line 1 column 0)`

The direct local Biome binary is clean at 133 files, so the project lint result is recorded from Biome, not from the broken wrapper.

## 7. Independent visual review

One independent review pass examined the after screenshots and reported two P1 findings:

1. **Nanzih landmark prominence**: accepted and fixed as described above.
2. **Mobile-menu clipping**: checked directly at 390×844 and rejected as not reproducible; the brand mark, title, and district pill are fully visible.

Remaining review limitations:

- The review was a single pass. The Nanzih P1 was visually rechecked after the fix; no second independent reviewer pass was run.
- Subjective concerns such as the pavilion's stylized roof form remain art-direction choices, not claimed survey accuracy.
- The green E17 hill behind the park is a geographic neighbor and remains visible by design.

## 8. Completed, partial, and unverified

### Completed

- Candidate selection preserves zoom; profile open/close does not reset scale.
- Exact viewpoint restoration when the user has not taken manual control.
- Mouse drag pan, wheel zoom, one-finger pan, two-finger pinch, and controls after transitions.
- Hero height increase without changing world coordinates or navigation.
- Generic density reduction across old town, Nanzih, park, harbour, and world massing.
- Landmark preservation and the Nanzih park focal repair.
- Shared `港都人物誌` identity across Explorer and information pages, including mobile and BASE_PATH handling.
- 38 authoritative polygons and district focus remain intact; no rectangular district stage is used.
- Candidate identities, electoral permissions, simulation routes, editorial data, and provenance were not altered.
- Before/after screenshots, two walkthrough videos, performance files, 121 unit tests, 40 Playwright tests, typecheck, direct Biome, build, and strict OpenSpec validation.

### Partial / documented limitations

- The hero/world pedestrian model remains the previously validated hero graph plus gate-level world connectivity. Citywide walking outside the validated hero routes is still schematic; this task did not claim a complete citywide sidewalk network.
- The decorative harbour basin remains stylized water, not authoritative land cover.
- Explorer and information pages still use two renderers (React and Astro). They share navigation data, markup classes, and CSS, but are not one component.
- Visual quality is improved and reviewed, but the city remains a stylized miniature rather than a survey-grade architectural reconstruction.
- The park pavilion is intentionally stylized and compact; it is recognizable in context, not a precise historical reconstruction.

### Unverified / not claimed

- Physical-GPU FPS, frame pacing, and thermal behavior. SwiftShader numbers are smoke measurements only.
- A complete 38-district street-level walkable network.
- A second independent visual-review pass.
- A hardware-GPU selection-spike fix. The SwiftShader p95 selection spike remains documented.

## 9. Definition-of-done check

| Requirement | Status |
| --- | --- |
| Candidate selection preserves scale | Pass |
| Follow stays stable and stops on manual control | Pass |
| Mouse drag pans | Pass |
| Mobile touch pan and pinch | Pass |
| Controls work after transitions | Pass |
| Buildings have readable height/volume | Improved and visually reviewed; stylized |
| Projection readable in 3D | Pass; elevated orthographic retained |
| Generic clutter meaningfully reduced | Pass; measured object reductions and screenshots |
| Landmarks recognizable and prominent | Pass for preserved landmarks; Nanzih park repaired |
| All pages share identity and navigation | Pass; two renderers share data/CSS |
| `港都人物誌` visible and linked | Pass |
| All 38 polygons valid | Pass in unit suite |
| NPC routes and electoral permissions correct | Pass in unit/Playwright suites |
| Candidate/editorial/provenance data unchanged | Pass; no data edits |
| Desktop/mobile tests pass | Pass; 40 Playwright tests |
| Before/after screenshots | Pass; 18 after images plus baseline |
| Real browser walkthrough | Pass; desktop and mobile WebM |
| Rendering costs and limits documented | Pass; SwiftShader only, no hardware claim |
| OpenSpec strict validation | Pass |

## 10. Principal files

- `src/components/CityScene.tsx` — camera contract, pan/zoom mappings, manual takeover, follow smoothing, camera bridge.
- `src/components/CityExplorer.tsx` — shared brand/nav, candidate selection, manual-follow stop, debug option.
- `src/world/hero.ts` — `HERO_HEIGHT_SCALE = 0.07`.
- `src/city/layout.ts` — clutter reduction, park focus/terrace, landmark placement.
- `src/city/landmarks.ts` — rebuilt lakeside pavilion.
- `src/components/WorldLayer.tsx` — massing reduction, authoritative district fills, debug layer.
- `src/data/site-nav.ts` — shared navigation links.
- `src/layouts/BaseLayout.astro` — shared brand/nav and no-JS mobile menu.
- `src/styles/global.css` — shared lockup/nav/header styles.
- `tests/e2e/refine-ux.spec.ts` — camera, pan, touch, and header coverage.
- `tests/e2e/hud-geo.spec.ts`, `tests/e2e/smoke.spec.ts` — updated selectors for the shared lockup and heading.
- `reports/visual/refine/` — before/after screenshots, manifest, walkthroughs.
- `reports/performance/refine.json`, `reports/performance/refine-interactions.json`.
- `openspec/changes/refine-living-city-exploration-ux/` — proposal, design, tasks, six capability specs.
