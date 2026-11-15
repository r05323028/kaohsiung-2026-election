# Render audit — WebGL draw calls / GPU work (Agent A)

Read-only audit of the R3F city renderer. No file under `src/`, `scripts/`, `tests/` was modified.

Baseline (production build `dist/`, headless Chromium + SwiftShader, M1 Pro, `?perf=1`, 1600×1000):

| scenario | draws | triangles | geometries | programs |
| --- | --- | --- | --- | --- |
| world-overview `/?perf=1` | 1197 (live re-measure 1218) | 231,966 (live 248,902) | 72 (live 93) | 16 (live 18) |
| district focus `/?district=kaohsiung-council-04&perf=1` | 1361 | 1,020,190 | 124 | 19 |

Live re-measure also confirms: overview camera `zoom 20.57`, focus camera `zoom 57.28`, focus
`__kaohsiungActorLod()` = `{mode:'detail', detailCount:10, overviewCount:7, screenPx:26.46}`,
`__kaohsiungCandidateVisibility()` = `{scope:'constituency', count:17}`.

---

## 1. Where the ~1200 draw calls come from

Everything renderable in the hex world is a **separate `<mesh>` React element per prop**; the two
instanced hex layers only cover the plates/plazas/trees/buildings. Static inventory, counted from
JSX × per-kind instance counts (`HEX_LANDMARKS` = 78, 71 of them non-hero):

| subsystem | source | meshes | draw in main pass | draw in shadow pass |
| --- | --- | --- | --- | --- |
| non-hero landmark props (`HexWorldLayer.tsx:315` `Part`) | 30 kinds × 71 instances | **427** | 427 | 427 |
| hero compositions (`HeroLandmarks.tsx:215` `HeroPart` + `:237` `ContactShadow`) | 7 features | **209** | 209 | 202 (7 contact shadows don't cast) |
| hex plates `platformRef` (`HexWorldLayer.tsx:1242`), `topRef` (`:1248`), `plazaRef` (`:1275`) | instanced × 40 | 3 | 3 | 2 |
| curb (`:1282`), road (`:1289`), ground plane | merged, module-level | 3 | 3 | 0 |
| trees (`HexWorldLayer.tsx:1084`) | 3 instanced meshes | 3 | 3 | 3 |
| city buildings (`HexBuildings.tsx:70`) | 3 merged buckets | 3 | 3 | 3 |
| selection/hover rings (`HexWorldLayer.tsx:1300`, `:1327`) | per tile, transient | 0–2 | 0–2 | 0 |
| actors, overview LOD (`ActorLayer.tsx:693`) | ~14 instanced parts + 1 blob | 15 | 15 | 0 |
| **total** | | **≈648** | **≈663** | **≈637** |

Why 648 meshes produce 1197 draws: **the shadow pass re-draws every shadow caster each frame**.
`WebGLRenderer.info` includes the shadow-map pass, and the single shadow-casting directional light
covers the whole world (see §3), so essentially all 637 casters are drawn a second time.

Arithmetic check (overview): 663 main − ~48 frustum-culled props + 637 shadow ≈ **1252**; measured
1197/1218 (±4%, culling of off-screen props at zoom 20.57 accounts for the rest). Same check for
district focus: 500 detailed-avatar draws (10 avatars × 50 meshes, `frustumCulled` default and all
in view) + ~590 shadow + ~271 static main = **1361** exactly as measured.

So: **~49% of every frame's draw calls are the shadow pass; the landmark prop library is ~60% of the
rest; detailed avatars are the dominant cost once a district is focused.**

Per-kind prop counts (largest): `LotusPagodas` 59 (`HeroLandmarks.tsx:795`), `Pier2` 55 (`:1117`),
`HsrStation` 22 (`HeroLandmarks.tsx:297`), `DreamMall` 21 (`:1445`, includes `FerrisWheel` 8 at
`:1306`), `Weiwuying` 19 (`:938`), `SkyTower85` 19 (`:1570`), `WorldGamesStadium` 14 (`:475`).
Non-hero multipliers: `nightMarket` 11, `park` 9, `forest` 9, `oldStreet`/`bridge` 8, `sugarMill` 7,
`museum`/`fort`/`tower`/`monument`/`hotSpring`/`farm` 6, `temple`/`airport`/`waterfall` 4, rest 2–5.

---

## F1 — Shadow map is re-rendered every frame with a fully static caster set

- **file:line** `src/components/CityScene.tsx:500-516` (light), `:575-579` (`onCreated`), no
  `shadowMap.autoUpdate` assignment anywhere.
- **Root cause** three.js re-renders shadow maps on every `render()` unless `gl.shadowMap.autoUpdate
  === false`. All 637 casters are static except two `instancedMesh` cabin meshes
  (`HeroLandmarks.tsx:1377`, `:1383`) and nothing else in the scene casts shadows — overview avatars
  (`ActorLayer.tsx:853`) and candidate chibi meshes set `castShadow = false`
  (`src/components/candidate-geometry.ts:193-194`).
- **Evidence** 637 shadow-mesh draws ≈ 1197 − ~560 main-pass draws; overview 1197 vs district 1361 keep
  a constant ~590 baseline while the camera moves, which is only possible for a shadow pass whose
  frustum does not follow the camera.
- **Proposed change** in `onCreated` (CityScene) after the first frame:
  `gl.shadowMap.autoUpdate = false; gl.shadowMap.needsUpdate = true;` (needsUpdate is consumed once).
  If the rotating Ferris-wheel cabin shadow matters, refresh on a timer:
  `useFrame`-driven `if (now - last > 250) { gl.shadowMap.needsUpdate = true; }` (4 Hz) instead of per
  frame. Alternative that keeps the wheel smooth: exclude the two cabin instanced meshes from the
  shadow pass (`castShadow={false}`) — they are 8 cm objects seen from 20+ units away.
- **Expected benefit** −637 draw calls/frame (−53%), and roughly −110k triangles/frame (the shadow
  pass rasterises the same prop triangles). Under SwiftShader, where draws are the bottleneck, this
  should take the ~1–4 fps floor to ~2–8 fps; on real GPU it removes ~0.5 ms of JS/GL command
  submission plus the shadow raster pass.
- **Regression risk** essentially zero: no shadow caster moves; the only animated caster is the wheel
  cabin pair, handled by the 4 Hz refresh. Hovering/selection changes only affect rings, which don't
  cast.

## F2 — 427 landmark prop meshes that share 35 (geometry, material) pairs are drawn individually

- **file:line** `src/components/HexWorldLayer.tsx:315-334` (`Part` → one `<mesh>` each),
  `:397-1021` (`LandmarkModel`, 69 `Part` call sites), `:1022-1040` (`Landmarks`, no filtering).
- **Root cause** authoring convenience: every prop is its own React element, so every prop is its own
  draw call, doubled by the shadow pass. A static parse of the `LandmarkModel` range shows the prop
  library only ever uses **9 geometries** (`GEO.box` 31 sites, `GEO.cylinder` 13, `GEO.disc` 7,
  `GEO.cone` 6, `GEO.cylinder6` 4, `GEO.sphere` 3, `GEO.ico` 2, `GEO.cone4` 2, `GEO.torus` 1) with
  **13 materials** → **35 distinct (geometry, material) pairs** for all 427 instances.
- **Evidence** 427 meshes vs 35 pairs; the repo already proved this pattern twice —
  `buildCityBuildingGeometry` collapsed ~590 building meshes into 3 draws
  (`HexBuildings.tsx:15`, `src/world/building-geometry.ts`; `reports/performance/architecture-no-buildings.json`
  shows the old 1782-draw build), and `buildArticulatedOverview` (`ActorLayer.tsx:255-306`) merges
  the avatar glTF into ~14 instanced parts using
  `mergeGeometries` from `three/examples/jsm/utils/BufferGeometryUtils.js` (`ActorLayer.tsx:5`).
- **Proposed change** turn `LandmarkModel` from JSX into data: return
  `Array<{ geometry: keyof typeof GEO; material: keyof typeof MAT; matrix: THREE.Matrix4 }>` (bake
  `position/rotation/scale` into a local matrix once at module load), then have `Landmarks()` build
  **one `InstancedMesh` per (geometry, material) pair** (35 meshes, counts precomputed), composing
  `landmarkMatrix(position, ROAD_Y - 0.005, rotation, scale) × partMatrix`. All props already opt out
  of picking with `raycast={() => {}}`, so no hover/click behaviour depends on them.
- **Expected benefit** 427 → 35 draws in the main pass **and** 427 → 35 in the shadow pass:
  **−784 draw calls (−65% of the current frame)** plus ~−55k triangles of duplicated submission.
- **Regression risk** low. Same geometry, same material instances, same world matrices, same shadow
  behaviour; instancing preserves flat lighting because materials are non-`vertexColors` uniform
  colours. Only subtle risk: negative/non-uniform scale must be baked into matrices, not instance
  scale, in the rare case a prop uses it (the parse shows only positive scales).

## F3 — Hero compositions: 209 meshes, each one draw

- **file:line** `src/components/HeroLandmarks.tsx:215-235` (`HeroPart`), `:237` (`ContactShadow`),
  `:1672` (`HeroLandmarkModel`).
- **Root cause** same as F2: `HeroPart` returns one `<mesh castShadow receiveShadow>`; 7 hero
  compositions expand to 209 meshes (`LotusPagodas` alone is 59 because it nests 2 × `PagodaHero`
  (14 each, `:635`) and 2 × `BeastHead` (11 each, `:686)`).
- **Evidence** counted per composition: HSR 22, Stadium 14, Lotus 59, Weiwuying 19, Pier2 55,
  DreamMall 21, SkyTower 19 = 209; `ContactShadow` contributes 7 meshes.
- **Proposed change** per hero, merge all `HeroPart`s that share a material into one
  `BufferGeometry` at module init (bake transform with `applyMatrix4`, reuse the local
  `mergeGeometries` at `src/components/hero-geometry.ts:91`), then render **one mesh per distinct
  material per hero** (~5–9 each). Keep `ContactShadow` as is, or merge the 7 contact shadows into a
  single merged geometry with one material.
- **Expected benefit** 209 → ~45 (main) → total ≈ **−330 draw calls** including the shadow pass.
- **Regression risk** low. Near-only trims are conditionally rendered (`detail === 'near'`), so the
  merge must be built per detail level (two prebuilt geometries per hero, switch by
  `useLandmarkDetail`). The wheel's `instancedMesh` cabins and the animated `rotating` group must stay
  un-merged (5 parts inside `:1361-1384`).

## F4 — District focus spends 500 draw calls on 10 detailed candidate avatars

- **file:line** `src/components/ActorLayer.tsx:56` (`MAX_DETAILED_ACTORS = 10`), `:467`,
  `src/components/candidate-geometry.ts` (`buildCandidateModel`, 50 meshes / 18 materials / 73,476
  triangles per avatar), `src/components/CandidateChibi.tsx`.
- **Root cause** the detailed model is a `<primitive object={model.root}>` clone of
  `public/models/kaohsiung_chibi_base.glb` — 50 separate meshes, so 10 avatars = 500 draws and
  734,760 triangles.
- **Evidence** focus deltas: draws 1197 → 1361, triangles 232k → 1.02M, geometries 72 → 124.
  10 × 73,476 = 734,760 tri (72% of the focus triangle count) and 10 × 50 = 500 draws (37% of the
  focus draw calls). Also explains the "1.02M then settles to ~288k on mobile" sample: on the
  390×844 profile the LOD resolver stays in overview mode (`screenPx` below `detailEnterPx = 22`,
  `src/components/candidate-model.ts:42-45`), so the heavy models are never mounted.
- **Proposed change** apply the overview trick to the detailed model: merge per `(pivot, material)`
  group — 6 pivots × ~18 materials collapses to roughly 20–28 meshes per avatar instead of 50, or
  merge strictly per pivot and use `vertexColors` on a single material per pivot (6 draws/avatar,
  best case). The pivots are the only animated nodes (`head`, `leftArm`, `rightArm`, `leftLeg`,
  `rightLeg`, `body`), so merging inside a pivot is safe.
- **Expected benefit** 500 → 60–280 draws in focus (−44% to −88% of the focus frame) and no triangle
  change; alternatively/additionally lower `MAX_DETAILED_ACTORS` to 4–6.
- **Regression risk** medium-low: colour fidelity must be preserved (either keep one material per
  group, or bake colours into vertex colours as `buildCityBuildingGeometry` does). Per-avatar
  skeletal swing currently animates individual meshes inside a pivot? No — swing is applied at pivot
  level, so merging inside a pivot is visually identical.

## F5 — No per-district or distance filtering of landmarks; the whole 40-tile world is always submitted

- **file:line** `src/components/HexWorldLayer.tsx:1022-1040` (`Landmarks()` maps all 78
  `HEX_LANDMARKS` unconditionally).
- **Root cause** landmarks are static props keyed to tiles; there is no focus/radius gate like the
  one that exists for candidates (`focusAdminIds`, `ActorLayer.tsx:330`).
- **Evidence** `HEX_TILES` = 40 tiles, `HEX_LANDMARKS` = 78; overview draws all of them and only
  camera frustum culling removes any (measured ≈48 removed at zoom 20.57). `HEX_WORLD_BOUNDS` =
  x −15.95…20.30, z −40.18…17.58.
- **Proposed change** not required once F2 lands (35 instanced draws for the whole world is cheaper
  than any filtering logic). If filtering is still wanted for district focus, gate on
  `hexDistanceToCenter(tile.center, focus.target) <= focus.radius + 8`.
- **Expected benefit** 0 on its own after F2; before F2 it would save ~15–20% of prop draws in focus.
- **Regression risk** visual pop-in at the focus edge; conflicts with the "equal treatment of all
  candidates/districts" rule if applied asymmetrically — **recommend skipping this** in favour of F2.

## F6 — Frustum culling: only 5 meshes opt out, and those are intentional

- **file:line** `src/components/HexBuildings.tsx:79`, `src/components/ActorLayer.tsx:853`,
  `src/components/ActorLayer.tsx:864`, `src/components/HeroLandmarks.tsx:1380`, `:1385`.
- **Root cause / evidence** Those are the 3 merged building buckets (bounding sphere covers the whole
  map anyway), the 2 actor instanced meshes, and the 2 Ferris-wheel cabin instanced meshes. All
  instanced hex layers (`HexWorldLayer.tsx:1242`, `:1248`, `:1275`, trees) keep the default
  `frustumCulled = true`, but their bounding spheres span all instances, so they are effectively
  never culled — with 1 draw each this is the right trade.
- **Proposed change** none for correctness. If actor instanced meshes ever grow, keep
  `frustumCulled=false` (they must never vanish); instead reduce per-frame matrix work (F8).
- **Expected benefit** n/a. **Regression risk** n/a.

## F7 — Per-frame work: one global matrix rebuild of every actor instance, plus a per-frame buffer upload

- **file:line** `src/components/ActorLayer.tsx:693-800`.
- **Root cause** `useFrame` recomputes `helper` matrices and `setMatrixAt` for `visibleActors ×
  overview.parts.length` (~5 × 14 at overview, 7 × 14 in focus), then unconditionally does
  `mesh.instanceMatrix.setUsage(DynamicDrawUsage)` and `needsUpdate = true` for every part mesh and
  the shadow blob each frame, forcing 8–15 buffer re-uploads even when nothing moved.
- **Evidence** loop `:722-771` (per actor × per part), upload loop `:781-788`.
- **Proposed change** (a) only set `needsUpdate` when a value actually changed (compare
  `pose.position`/`heading` against a per-actor cache — actors move in discrete simulation steps,
  `advanceSimulationFrame(delta)` returns a blend alpha, so upload only when `alpha !== lastAlpha` or
  a pose changed); (b) move `setUsage(DynamicDrawUsage)` into a `useLayoutEffect` run once.
- **Expected benefit** ~10–15 fewer WebGL buffer uploads/frame and ~10–20% of the actor CPU frame
  budget; no draw-call change. Matters more on focus (10 detailed avatars each with their own
  `useFrame`).
- **Regression risk** low: animation cadence must be preserved; keep `needsUpdate` when
  `prefers-reduced-motion` toggles or LOD changes.

## F8 — 7 + 1 per-frame React state probes (`useLandmarkDetail`) and a per-frame `useFrame` in HexBuildings

- **file:line** `src/components/HeroLandmarks.tsx:183-195`, `src/components/HexBuildings.tsx:57-68`.
- **Root cause** each of the 7 hero components subscribes its own `useFrame` that reads
  `camera.zoom` and calls `setDetail` (guarded, so no re-render unless crossing 55); `HexBuildings`
  runs the same kind of check and only mutates `setDrawRange` on tier change.
- **Evidence** 8 `useFrame` callbacks doing zoom polling per frame; ~zero allocation (refs reused).
- **Proposed change** hoist the zoom into a single `useFrame` in `CityScene` that publishes a
  `detail` tier through a module-level store (or `useThree` selector with `subscribe`), letting the
  heroes read a prop. Removes 8 frame subscriptions.
- **Expected benefit** ~0.05–0.15 ms/frame on the main thread; no draw-call change. Low priority.
- **Regression risk** low.

## F9 — Ferris wheel rewrites 32 instance matrices every frame and forces a shadow re-render of itself

- **file:line** `src/components/HeroLandmarks.tsx:1314-1343` (`applyPoses`), `:1347` (`useFrame`),
  `:1377` (cabin body `castShadow`), `:1383` (glass, no shadow).
- **Root cause** `useFrame` advances `wheelAngle` by `delta * 0.12` and rewrites 16 cabin matrices
  for both cabin meshes, then `instanceMatrix.needsUpdate = true` twice per frame.
- **Evidence** 32 `setMatrixAt` + 2 uploads/frame; 16 cabins `< WHEEL_CABINS` see `:1218`.
- **Proposed change** keep the rotation (it's visible and it's the only justification for a live
  shadow pass). If F1's static shadow map is adopted, either accept the frozen cabin shadow or
  refresh at 4 Hz. Cheap extra win: rotate the cabin *group* only — the counter-rotation
  (`wheelCabinPose`) is required for the cabins to stay upright, so this cannot simply be a group
  rotation; instead reduce `WHEEL_CABINS` matrix work by updating every other frame (30 Hz).
- **Expected benefit** small (2 uploads/frame); mainly it is the one thing blocking a fully static
  shadow map.
- **Regression risk** visibly wrong cabin orientation if the counter-rotation is dropped.

## F10 — 38 drei `<Html>` district labels: per-frame DOM projection, not draw calls

- **file:line** `src/components/HexWorldLayer.tsx:1335-1350` (labels), `:1308-1318` (selection
  label), gate at `src/components/CityScene.tsx:491` (`showLabels = detail !== 'low' &&
  focus.radius > 13`).
- **Root cause** `HEX_TILES.filter((tile) => tile.districtTileIndex === 0)` yields **38** labels (38
  of 40 tiles are the first tile of their district); each `drei` `Html` runs its own `useFrame` that
  projects a 3D point and writes a DOM transform every frame.
- **Evidence** computed from `src/world/hex.ts`: 38 tiles with `districtTileIndex === 0`; measured
  `hex()` bridge reports `tiles: 40`, `landmarks: 78`.
- **Proposed change** (a) only show the labels of the ~8–12 nearest districts at overview zoom, or
  (b) render labels into a single `<canvas>`-texture sprite atlas (one draw call) and update it on
  camera settle instead of per frame; (c) minimal change: keep `<Html>` but wrap in
  `occlude={false}` and stop per-frame updates by memoising on `zoom` bucket.
- **Expected benefit** removes 38 per-frame DOM style writes + 38 React frame subscriptions
  (tens of `style` mutations per frame → main-thread jank, especially on mobile). No draw-call
  change. Labels are already hidden in district focus (`focus.radius ≤ 13`).
- **Regression risk** low; accessibility text must remain in the DOM (the labels are decorative
  headings — verify `aria-hidden` / `sr-only` alternative before converting to canvas).

## F11 — Pixel ratio and framebuffer settings

- **file:line** `src/components/CityScene.tsx:568` (`dpr={detail === 'low' ? 1 : [1, 1.7]}`),
  `:571` (`antialias: detail !== 'low'`), `:575-579` (`ACESFilmic`, exposure 1.03, `PCFShadowMap`).
- **Root cause** on a Retina display `devicePixelRatio = 2` → clamped to 1.7 → **2.89× the CSS
  pixels**, and `antialias: true` adds 4× MSAA on top (three.js default `samples = 4` on WebGL2).
  Combined fill cost ≈ 11.6× the CSS pixel count. Measured `dpr: 1` in this headless environment, so
  the current numbers do not include that multiplier — real hardware pays it.
- **Proposed change** `dpr={[1, 1.5]}` and `antialias: false` when `dpr >= 1.5` (polygonal content
  is stable without MSAA), or expose `quality` tiers: high `[1, 1.5]` + MSAA, medium `[1, 1.25]`,
  low `1`. Consider `powerPreference: 'high-performance'` (already set) and keep `alpha: false`
  (already set).
- **Expected benefit** 1.7² → 1.5² = 22% fewer pixels; dropping MSAA removes another ~4×
  multisample resolve on 1.7² pixels. On GPU-bound frames this is the largest single fill-rate win;
  it does not reduce draw calls.
- **Regression risk** medium: visible aliasing on thin geometry (fins, railings, spoked wheel).
  Acceptable if the quality tier is user-selectable and the default stays high.

## F12 — Contact shadows are 7 meshes + 7 unique `circleGeometry` resources

- **file:line** `src/components/HeroLandmarks.tsx:237-250`.
- **Root cause** each `ContactShadow` creates a `circleGeometry(radius, 40)` in JSX and a fresh
  `meshBasicMaterial` per instance (7 heroes → 7 geometries/7 materials).
- **Evidence** 7 instances; 40 segments each; `transparent, opacity 0.18, depthWrite:false` → alpha
  blended, sorted, and they never cast shadows.
- **Proposed change** share one `CircleGeometry(1, 40)` and one module-level material, scale per
  instance (identical look), or merge all seven into one geometry at module load.
- **Expected benefit** −6 draw calls and 6 fewer geometry/material allocations; negligible GPU cost
  but removes 7 transparent draw calls that also force depth-sorting work.
- **Regression risk** zero.

---

## Priority / expected outcome

| # | change | effort | draw calls removed | risk |
| --- | --- | --- | --- | --- |
| F1 | `shadowMap.autoUpdate = false` (+4 Hz refresh) | ~5 lines | **−637 (−53%)** | very low |
| F2 | instance landmark props by (geometry, material) | medium refactor | **−784 (−65%)** | low |
| F3 | merge hero parts per material | medium | −330 (−28%) | low |
| F4 | merge detailed avatar meshes per (pivot, material) / lower `MAX_DETAILED_ACTORS` | medium | −220 to −440 (focus only) | medium-low |
| F12 | share contact-shadow geometry/material | trivial | −6 | none |
| F7/F8 | stop redundant instance uploads / zoom polls | small | 0 (CPU) | low |
| F10 | fewer/cheaper district labels | small | 0 (CPU/DOM) | low |
| F11 | dpr cap 1.5, MSAA off at high dpr | 2 lines | 0 (fill-rate −22…−70%) | medium |

Projected end state (overview): 1197 → **≈240** draw calls if F1+F2+F3+F12 land (shadow pass ≈35,
props 35, heroes ~45, base ~12, actors ~15). Focus: 1361 → **≈420** with F1+F4.

## Single change that cuts the most draw calls at the lowest risk

**F1 — make the shadow map static (`gl.shadowMap.autoUpdate = false` + one `needsUpdate`, with a
4 Hz refresh only if the Ferris-wheel cabin shadow must keep moving).** It is a two-line change in
`src/components/CityScene.tsx:575-579`, removes ~637 of 1197 draw calls (−53%) and ~110k shadow-pass
triangles per frame, requires no geometry or component restructuring, and cannot change appearance
because no shadow caster in the scene moves except the 16 cabin instances (which the 4 Hz refresh, or
dropping `castShadow` on the two cabin `instancedMesh`es at `HeroLandmarks.tsx:1377/1383`, covers).
F2 removes more draws in absolute terms (−784) but is a multi-day refactor.

## Constraints / notes for the implementer

- Determinism rules in `AGENTS.md` apply: any merged geometry must be built from module-level
  constants with no `Math.random`; instance seeds stay `tile.id:districtId:town`-free here because
  nothing in this subsystem is procedural at runtime.
- Everything in this subsystem already disables picking (`raycast={() => {}}`), so merging/instancing
  cannot break `onPointerOver`/`onClick` except on the two hex instanced layers
  (`HexWorldLayer.tsx:1248` top plates with `event.instanceId`) which must keep their handlers.
- Verification: `?perf=1` exposes `window.__cityDiagnostics` (`drawCalls`, `triangles`, `geometries`,
  `programs`, `fps`). Existing evidence files: `reports/performance/architecture-geometry-after.json`
  (current baseline), `reports/performance/architecture-no-buildings.json` (pre-merge 1782 draws),
  `reports/performance/baseline-runtime.json`.
- Per-mesh scene enumeration from the page is **not** possible (`createRoot` from
  `@react-three/fiber` uses its own reconciler container; the canvas has no `__reactContainer$`), so
  draw-call attribution must come from static counts + `renderer.info` totals, as done here.
- `PadogaTower` in `HexWorldLayer.tsx` (10 parts) is never instantiated — dead code, safe to remove
  but irrelevant to the numbers.
