# District integrity, demo removal, and hover artifact — implementation report

## Scope and repository state

Mission: make 左營 focus render only 左營 scene objects, 楠梓 focus render only 楠梓 scene objects, and the overview render both; remove fictional demo people and static pedestrians from production; remove the white oval shown while hovering 3D buildings; replace coordinate heuristics with explicit district ownership; preserve the 38 authoritative administrative polygons, candidate identities/permissions, world navigation, shared header, and performance.

Repository: `/Users/seanchang/kaohsiung-2026-election`. Git history exists; this pass made no commit. The working tree also contains earlier uncommitted candidate-camera/architecture work from the preceding mission, so `git status` mixes both passes. No OpenSpec change was requested for this pass, and none was created.

## Root causes

### A. Objects from another district appeared in a focused district

The hero diorama was authored as one merged scene. `src/city/layout.ts` `buildStaticCity()` always assembled old-town/Zuoying groups, Nanzih groups, the park, the river, both water systems, and every landmark into one `CityBuilder`; `src/components/CityScene.tsx` rendered that whole group whenever the camera was near the hero. Selecting 左營 or 楠梓 moved the camera but never filtered the scene. `WaterLayer`, all nine landmark groups, every hotspot, and every actor were likewise rendered unconditionally. The landmark-to-zone choice in `CityExplorer.tsx` used `spec.x > 4 ? 'nanzih' : 'zuoying'`, which is a layout heuristic, not ownership.

The compressed hero art cannot be classified by the authoritative polygons. Using `heroPointToWorld` + `districtAtWorld` gives, for example, dragon-tiger-pagodas and Lotus Pond around E04, and nanzih-neighborhood around E17, even though those objects are semantically Zuoying/Nanzih landmarks. The fix therefore uses explicit real-world ownership metadata on the nine authored landmarks, not point-in-polygon inference:

- E03: `dragon-tiger-pagodas`, `lotus-pond`, `spring-autumn-pavilions`, `old-city-gate`, `zuoying-old-street`, `harbor-front`.
- E04: `houjing-river`, `metropolitan-park`, `nanzih-neighborhood`.

This is intentional: the miniature art is compressed and is not claimed to be polygon-accurate.

### B. White oval on hover

The oval was not WebGL geometry. `src/components/CityExplorer.tsx` rendered `.city-hover-card` whenever `hoveredLandmarkSpec && hoveredLandmark !== selectedLandmark`, and `src/styles/global.css` styled it as a bottom-centred pill with `border-radius: 999px` and glass background. Hovering any 3D hotspot produced the white `左營舊街 / Zuoying Old Streets` pill. The markup, state selector, and CSS were removed. The in-scene landmark hover lift and pointer cursor remain.

### C. Fictional demo people and demo districts in production

`src/data/index.ts` validated the fictional fixture and exposed `candidateProfiles = official + demo` (110), and `districts = official + demo` (40), then built search, profile routes, district routes, filters, badges, and source/about copy from those combined lists. The six extra built pages were four demo candidate pages and two demo district pages.

The demo fixture is now isolated in `src/data/demo.ts` (test-only), while production exports 106 official candidates and 16 official election districts. Demo branches were removed from `CityExplorer`, candidate/district/source/about pages, and shared layout copy. `dist` contains 106 candidate pages and no fictional names.

### D. Static/ambient pedestrians

Five visible `pedestrian(...)` calls in `src/city/layout.ts` (one Nanzih, four static-city) were decorative crowd props unrelated to the simulated candidate actors. All five calls and the `pedestrian` builder in `src/city/props.ts` were removed. The simulated candidates remain; they are rendered by `ActorLayer`, not by the static city builder.

### E. Landmark ownership was not data-driven

`LandmarkSpec` had no district field. It now has `districtId: 'E03' | 'E04'`, and `selectLandmark` uses `spec.districtId` instead of `x > 4`. Scene filtering is derived from the same metadata.

## Implementation

### Scene partition

- `src/city/layout.ts`: new `HeroScene = 'all' | 'E03' | 'E04' | 'none'`; `LandmarkSpec.districtId`; partitioned `buildStaticCity(detail, scene)`.
  - Always: Banping Mountain and deterministic meadow patches (shared terrain).
  - E03/all: old town, plaza, harbour, pond promenade/trees/banyans, plaza furniture, lanterns, E03 streetlights, lotus boats.
  - E04/all: Nanzih streets/buildings, Metropolitan Park, Houjing river embankment/footpaths, Nanzih power line.
- `src/city/vegetation.ts`: `TreeSpec.districtId`; E03/E04/shared ownership per cluster; `buildTrees(scene)`.
- `src/city/props.ts`: static pedestrian builder deleted.
- `src/components/CityScene.tsx`: `sceneDistrict` prop; caches keyed by detail + scene; `WaterLayer` filters pond/harbour vs river/lake; landmarks and hotspots filter by `districtId`; lotus only E03/all; scene bridge exposes `district`, visible landmark IDs, and `zuoying`/`nanzih` flags.
- `src/components/ActorLayer.tsx`: hero avatars and markers filter by `actor.currentAdminId === sceneDistrict`; non-hero world markers retain their existing behavior.
- `src/components/CityExplorer.tsx`: derives `sceneDistrict`: candidate's current E03/E04 district, selected landmark's `districtId`, selected admin E03/E04, active zone (`zuoying`/`nanzih`), otherwise `all`; non-hero selected districts use `none`, so hero art is not overlaid on another district.
- Scene streaming remains geographic: hero visibility still follows the camera/orbit target with hysteresis. A regression introduced while adding scene filtering was found by the existing manual-pan test: the focus `useLayoutEffect` also depended on `heroStreaming`, so it immediately undid a manual pan. The dependency was removed; only a new focus may override the streamed state.

### Hover fix

- Removed `.city-hover-card` markup from `CityExplorer.tsx` and all related CSS from `src/styles/global.css`.
- Removed the now-unused `hoveredLandmarkSpec` selector.
- Kept 3D hotspot hover lift/cursor, selection rings, and selected-landmark camera behavior.

### Demo and pedestrian removal

- Added test-only `src/data/demo.ts`; production `src/data/index.ts` imports neither fixtures nor demo schema helpers.
- `src/data/data.test.ts` still tests the fictional fixture through `demo.ts`, and asserts production exports/search/profile lookups contain no demo objects.
- Removed demo tab/badge/branch UI and demo source/about sections.
- Removed five static pedestrian calls and the pedestrian builder.
- Test flows that used 林海星 now use official candidate 張靜 (`zhang-jing-2026`) or official council-04 candidate 黃文志.

## 38-district classification

Every authoritative district remains in `ADMIN_DISTRICTS`; only E03 and E04 have authored hero art. The other 36 keep the existing low-detail world massing and are not replaced, rescaled, or given a rectangular stage.

| ID | District | Hero authoring | ID | District | Hero authoring |
|---|---|---|---|---|---|
| E01 | 鹽埕 | generic massing | E20 | 橋頭 | generic massing |
| E02 | 鼓山 | generic massing | E21 | 燕巢 | generic massing |
| E03 | 左營 | authored scene | E22 | 田寮 | generic massing |
| E04 | 楠梓 | authored scene | E23 | 阿蓮 | generic massing |
| E05 | 三民 | generic massing | E24 | 路竹 | generic massing |
| E06 | 新興 | generic massing | E25 | 湖內 | generic massing |
| E07 | 前金 | generic massing | E26 | 茄萣 | generic massing |
| E08 | 苓雅 | generic massing | E27 | 永安 | generic massing |
| E09 | 前鎮 | generic massing | E28 | 彌陀 | generic massing |
| E10 | 旗津 | generic massing | E29 | 梓官 | generic massing |
| E11 | 小港 | generic massing | E30 | 旗山 | generic massing |
| E12 | 鳳山 | generic massing | E31 | 美濃 | generic massing |
| E13 | 林園 | generic massing | E32 | 六龜 | generic massing |
| E14 | 大寮 | generic massing | E33 | 甲仙 | generic massing |
| E15 | 大樹 | generic massing | E34 | 杉林 | generic massing |
| E16 | 大社 | generic massing | E35 | 內門 | generic massing |
| E17 | 仁武 | generic massing | E36 | 茂林 | generic massing |
| E18 | 鳥松 | generic massing | E37 | 桃源 | generic massing |
| E19 | 岡山 | generic massing | E38 | 那瑪夏 | generic massing |

Scene contents verified by unit tests: E03 has 53 static parts / 140,154 index-vertices, max Y 4.5, zero tall east-side (x > 4, y > 2.5) vertices; E04 has 45 parts / 126,408 index-vertices and 12,308 tall-east vertices; `all` has 54 parts / 249,210. The E03 test also proves no Nanzih tower massing remains; E04 proves no old-town geometry (x < -4, z > 0, y > 1) remains. Shared Banping Mountain/meadow geometry is intentional.

## Visual evidence

Before (preserved pre-fix captures; not regenerated):

- `reports/visual/district-integrity/before/01-zuoying-nanzih-leak.png` — 1100×800. 左營 selected, but Nanzih river/park/high-rises and static pedestrians fill the right side; older HUD.
- `reports/visual/district-integrity/before/02-hover-oval.png` — 640×450. White rounded pill `左營舊街 / Zuoying Old Streets` at bottom centre.
- `reports/visual/district-integrity/before/manifest.json` records provenance and that exact camera values were not retained.

After (new, reproducible SwiftShader captures; 1600×1000 desktop, 390×844 mobile):

- `reports/visual/district-integrity/after/01-zuoying.png` — E03 scene: scene `E03`, landmarks the six E03 IDs, `zuoying: true`, `nanzih: false`; hero visible; camera position `[19.491911, 27.527707, 26.345339]`, target `[-0.815414, 0, 1.976549]`, zoom `101.77758`.
- `02-hover-no-oval.png` — same E03 view after a pointer sweep that first confirms a real landmark hover through the scene bridge (`hoveredLandmark` non-null); `.city-hover-card` count 0 and no hover-card class nodes.
- `03-nanzih.png` — E04 scene: three E04 IDs, `zuoying: false`, `nanzih: true`; camera `[20.131662, 27.527707, 21.611836]`, target `[-0.175663, 0, -2.756952]`, zoom `73.117388`.
- `04-overview.png` — `all` scene, all nine landmarks, both district flags true; camera `[50.000585, 33.951916, -12.888059]`, zoom `10.482337`.
- `05-demo-search.png` — 林海星 search yields 0 result buttons.
- `06-official-search.png` — 張靜 search yields 1 result button.
- `07-mobile-zuoying.png` — 390×844 mobile, E03 scene, zoom `42.868717`.
- `reports/visual/district-integrity/after/manifest.json` contains the bridge values and `pageErrors: []`.
- Capture script: `scripts/capture-district-integrity.ts`.

Inspection confirms: 左營 is clean of the Nanzih river/park/right-side towers; 楠梓 contains only Nanzih scene landmarks; overview contains both; the hover sweep produces no white pill. No new walkthrough video was recorded in this pass.

Runtime continuity audit on the current build (1600×1000, SwiftShader):

- `/?admin=E03` starts with scene `E03`, six E03 landmarks, hero visible, zoom `101.77758`.
- Switching the administrative tray to 楠梓 changes the scene to `E04` with three E04 landmarks and zoom `184.569952`; switching back to 左營 restores `E03` and its six landmarks at zoom `172.265289`.
- Selecting 洪方隆 while the scene is E03 keeps scene `E03`, hero visible, zoom `172.265289`, and opens the profile panel.
- Advancing 7,200 simulated seconds and selecting 賴瑞隆 (then in E19) gives scene `none`, `heroVisible: false`, preserved zoom `101.77758`, and an open profile. The non-hero district shows the low-detail map, not the 左營/楠梓 hero art.
- Loading the direct `?candidate=lai-rui-long-2026` route produced scene `E04`, profile open, and no page errors; its starting actor was in 楠梓 at the default world zoom `18`.


## Tests and gates

- `src/city/layout.test.ts`: 6 tests — all 38 districts classified, all nine landmarks explicit E03/E04, every tree/reed tagged, no Nanzih tall massing in E03, no old-town massing in E04, distinct scene vertex counts.
- `tests/e2e/district-integrity.spec.ts`: 3 tests — scene/landmark isolation; a pointer hit on a real landmark (confirmed via the scene bridge) with zero hover cards; demo absent from search and demo route 404.
- Existing refine suite now includes the manual-pan hero streaming regression test; fixed.
- `npm test`: **17 files, 133 tests passed**.
- `npx playwright test`: **49 passed** (chromium + mobile-chromium).
- `npm run typecheck`: **152 files, 0 errors, 0 warnings, 0 hints**.
- `npm run lint` exits 1 in this environment because its wrapper fails to parse the wrapped ESLint JSON (`ESLint output (JSON parse failed: EOF while parsing a value at line 1 column 0)`). The direct project Biome gate, `./node_modules/.bin/biome check src scripts tests playwright.config.ts`, passes **140 files, exit 0**; the wrapper failure is recorded, not hidden.
- `npm run build`: **exit 0, 128 pages** — 106 official candidate pages, 16 electoral-district pages; the 134→128 reduction is exactly four demo candidate pages + two demo district pages. `rg` over `dist` found no fictional demo names or demo dataset symbols.
- Existing 38-district geometry/navigation tests remain green in the 133-test unit run. No polygon geometry was edited in this pass.

## Performance (SwiftShader only)

Measured with `scripts/measure-district-integrity.ts` and headless Chromium ANGLE/SwiftShader. Host is an Apple M1 Pro, but this is software WebGL, not hardware-GPU evidence.

| Scenario | Draw calls | Triangles | Geom. | Avg FPS | Low FPS |
|---|---:|---:|---:|---:|---:|
| World overview (1600×1000) | 106 | 47,888 | 68 | 8.0 | 6.4 |
| Hero E03 (1600×1000) | 439 | 258,384 | 243 | 4.3 | 4.3 |
| Hero E04 (1600×1000) | 366 | 220,881 | 210 | 4.8 | 4.8 |

Reference from the preceding all-hero measurement: 617 calls / 405,486 triangles. E03 is **-28.8% draw calls / -36.3% triangles**; E04 is **-40.7% draw calls / -45.5% triangles**. These are scene-partition reductions in one software renderer. FPS is not comparable across SwiftShader runs and is not a claim of 60 FPS desktop or 30 FPS mobile. No physical-GPU frame-time profile was available.

## Limitations and unverified items

- **Semantic partition, not polygon clipping.** Explicit landmark ownership reflects the intended real-world district even where compressed art coordinates fall inside another simplified polygon. Shared mountain/meadow geometry intentionally appears in both scenes. The hero art is not re-authored or clipped to the 38 authoritative boundaries.
- Only E03/E04 have authored detail. The other 36 districts retain generic low-detail massing; this pass did not add district art.
- Candidate population remains 31/38 districts from the prior living-world work. No fictional people were added to fill empty districts.
- The decorative harbour basin and quay remain art-directed and can overlap the authoritative E03/E17 land polygons; they are water/transport scenery, not authoritative land.
- `src/pages/avatar-preview.astro` remains an unreferenced developer preview of generic fictional avatar assets. It carries no demo candidate profile, name, search entry, or production route; no production page links to it.
- The working tree is uncommitted and includes pre-existing uncommitted candidate-focus/architecture changes from the previous mission. No commit was made.
- No OpenSpec change was created for this pass, per the request to avoid expanding it.

## Completion status

Implemented and verified: scene separation for E03/E04/overview; data-driven landmark ownership; no static pedestrians; demo people removed from production/search/routes; hover oval removed; 38-polygon navigation/geometry suite preserved; full unit/E2E/typecheck/direct-Biome/build gates; before/after screenshots and SwiftShader performance.

Remaining honest gaps: scene partition is semantic rather than a geographic clip; only two districts have authored art; no hardware-GPU profiling or new video; the working tree is not committed.
