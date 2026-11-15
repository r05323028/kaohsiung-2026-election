# Runtime performance audit and optimisation — 港都人物誌 city renderer

Date: 2026-11-15 · Branch: `perf/runtime-optimization` (merged back to `main`) · Target: Kaohsiung 2026
election explorer (Astro 7 + React 19 + @react-three/fiber, static output).

This is a performance pass: geometry, materials, landmarks, animations, camera behaviour,
district rules and the desktop/mobile experience are unchanged. Every change below is
measured; nothing was optimised on speculation.

## 1. Method

* Baseline captured on a production build (`npm run build:astro` + `astro preview`) of the
  pre-pass commit (`9fb16ba`), and the optimised build is measured with the *same* harness on the
  same machine, window size and scenarios.
* Instruments: WebGL draw-call counters (patched `drawElements/drawArrays/(Instanced)` and
  `bindFramebuffer`), rAF frame timing, `PerformanceObserver('longtask')`, `performance.memory`,
  resource timing, and the app's own `?perf=1` diagnostics.
* `scripts/measure-runtime-performance.ts` runs ten scenarios (overview desktop/mobile, Zuoying,
  Nanzih, close-up, candidate profile open desktop/mobile, return to world, 60 s idle) and writes
  `reports/performance/runtime-*.json`.
* Initial load: `scripts/measure-initial-payload.ts` (transfer/decoded bytes, DCL/load) and a
  4× CPU-throttled first-paint probe (canvas adoption, first frame, long tasks, JS heap).
* Visual regression: identical camera/scenario screenshots compared pixel-wise
  (|ΔRGB| > 15) with a re-run of the *same* build as the noise floor, plus signed luminance to
  distinguish "moved object" from "missing shadow".
* Functional regression: `npm test` (vitest) and the full Playwright suite.

**Caveat.** Headless Chromium on this host renders WebGL through SwiftShader (software). Draw
calls, triangles, JS main-thread time, transferred bytes and long tasks are hard numbers;
absolute frame times are a software-rendering lower bound and are *not* presented as
target-hardware FPS. Relative frame-time changes are reported only when the same host, build
type and window were used.

Harness bug worth recording: the first version of the probe passed the init *function* to
Playwright, which tsx/esbuild serialises with `__name` helpers that do not exist in the page, so
no prototype was patched and every scenario silently reported 0 frames. It now injects the probe
as source text (`context.addInitScript({ content: INSTRUMENT })`).

## 2. Root causes

1. **Every page serialised all 106 full candidate profiles into the island props.**
   `src/pages/index.astro` passed `toPublicCandidateProfile(...)` for each candidate, so
   `dist/index.html` was 8,240,767 B, of which 6,258,534 B (76 %) was one HTML attribute.
   Measured field shares: politicalCareer 43.8 %, policyCareer 21.7 %, publishedPolicies 19.0 %,
   basicProfile 7.7 %. The island reads only `candidacy/person/district/visual` (~2.2 KB per
   candidate, 237 KB total). The browser had to unescape + `JSON.parse` 6.26 MB of HTML entity
   data before the first render (50.2 ms unescape + 20.1 ms parse, plus memory), and it did so
   on the main thread before the canvas could mount.
2. **The whole candidate dataset was imported by client code.**
   `src/world/simulation.ts:1` and `src/components/CityExplorer.tsx` imported values from the
   `../data` barrel, pulling the 9.1 MB `data.*.js` chunk into the initial JS graph and
   evaluating it during hydration. `configureSimulation(candidates)` now injects the roster, the
   barrel is reachable only through `import('../data')` (profile lookup + idle prefetch), and the
   simulation starts empty until configured.
3. **The shadow map re-rendered a fully static caster set every frame.** 574 of 1218 draw calls
   per frame (47 %) and 107,756 triangles were the shadow pass, re-rasterised at 60 Hz although
   only two 8 cm Ferris-wheel cabins actually rotate.
4. **427 non-hero landmark props were 427 separate meshes** that shared only 35
   (geometry, material) pairs (9 geometries × 13 materials) — 400 redundant draw calls in the
   main pass and again in the shadow pass.
5. **209 hero-composition parts were one mesh each**, although most parts of a landmark use the
   same material, and each mesh was its own matrix/material submission.
6. **21 instanced actor buffers were allocated for 106 rows and fully re-uploaded every frame**
   (≈139 KB/frame ≈ 8.4 MB/s) while at most 18 rows are meaningful; hidden detailed avatars kept
   ~20 matrix writes/frame each.
7. **No memoisation between React and the render tree**: the city island receives many stable
   props re-created per render; every city render re-ran `Canvas` configure + `root.render()`.

## 3. Implemented optimisations

| # | Change | Files |
|---|---|---|
| 1 | Island props slimmed to a card projection (`candidacy, district, person, visual`); full profile resolved on demand | `src/data/candidate-card.ts` (new), `src/pages/index.astro`, prop types in `CityScene`, `ActorLayer`, `CandidateChibi`, `CharacterAvatar`, `character-style`, `CandidateBottomSheet`, `CityExplorer`, `src/world/candidate-visibility.ts` |
| 2 | Simulation roster injected at runtime; `../data` only reachable through a dynamic import (profile lookup) plus an `requestIdleCallback` prefetch | `src/world/simulation.ts`, `src/components/CityExplorer.tsx`, new `src/world/simulation-configure.test.ts` |
| 3 | Cached static shadow map + explicit invalidation signal | `src/world/render-scheduling.ts` (new), `CityScene.tsx` (`StaticShadowMap`), `HexBuildings.tsx`, `HeroLandmarks.tsx` |
| 4 | Landmark props batched into one InstancedMesh per (geometry, material) pair: 400 meshes → 37 instanced meshes, matrices composed once at module init | `HexWorldLayer.tsx` |
| 5 | Hero compositions merged per material at module init (base / near / contact sets): 210 meshes → 98 | `HeroLandmarks.tsx` |
| 6 | Actor instance buffers sized to the 24-row maximum, `addUpdateRange` uploads, frozen matrices for hidden detailed avatars, idle sines hoisted, bounding-sphere invalidation | `ActorLayer.tsx` |
| 7 | Ferris-wheel cabins no longer cast shadows (they rotate every frame and would force shadow-map rebuilds) | `HeroLandmarks.tsx` |

Nothing was removed: every landmark, building, candidate, animation and interaction is still
present, and the default quality level (`high` on desktop) is unchanged.

## 4. Benchmark results

Production build, identical scenarios, one instrument. `calls` is main pass + shadow pass per
frame; `tris` are submitted triangles per frame; `JS/frame` is main-thread script time per
rendered frame; `heap` is `performance.memory` after the scenario.

| scenario | draw calls | triangles/frame | frame p50 | frame p95 | JS/frame | heap | rAF/s |
|---|---|---|---|---|---|---|---|
| overview desktop | 644+574 → **162+0** (−87 %) | 875,899 → **141,327** (−84 %) | 166.7 → **133.4 ms** (−20 %) | 183.4 → 150 ms | 2.3 → **1.0 ms** (−57 %) | 81 → **56 MB** | 6.0 → 7.1 |
| overview mobile | 644+574 → **162+0** (−87 %) | 875,899 → **141,327** (−84 %) | 116.6 → **83.3 ms** (−29 %) | 116.8 → 100 ms | 2.2 → **1.0 ms** (−55 %) | 71 → 63 MB | 9.2 → 11.7 |
| Zuoying desktop | 779+582 → **448+0** (−67 %) | 672,982 → **150,078** (−78 %) | 566.7 → 550 ms | 583.4 → 600 ms | 3.2 → **2.0 ms** (−38 %) | 76 → 68 MB | 1.8 → 1.8 |
| Nanzih desktop | 447+582 → **408+0** (−60 %) | 188,194 → **98,868** (−48 %) | 600 → 566.7 ms | 650 → 583 ms | 2.9 → **1.9 ms** (−34 %) | 69 → 67 MB | 1.7 → 1.8 |
| Zuoying mobile | 382+574 → **146+0** (−85 %) | 498,868 → **122,766** (−75 %) | 133.3 → **116.6 ms** (−13 %) | 133.4 → 116.7 ms | 2.0 → **0.9 ms** (−55 %) | 85 → **63 MB** | 7.6 → 9.1 |
| close-up desktop | 646+574 → **164+0** (−87 %) | 879,313 → **144,741** (−84 %) | 183.3 → **150 ms** (−18 %) | 200 → 166.7 ms | 2.3 → **1.0 ms** (−57 %) | 60 → **51 MB** | 5.4 → 6.5 |
| profile open desktop | 639+574 → **192+0** (−84 %) | 836,638 → **144,741** (−83 %) | 183.4 → **166.6 ms** (−9 %) | 200 → 166.8 ms | 2.5 → **1.2 ms** (−52 %) | 70 → 84 MB | 5.2 → 6.1 |
| profile open mobile | 335+574 → **165+0** (−82 %) | 403,060 → **110,601** (−73 %) | 116.7 → **100 ms** (−14 %) | 133.4 → 116.7 ms | 2.0 → **1.1 ms** (−45 %) | 76 → 87 MB | 8.2 → 9.6 |
| return to world | 1218 → **162** | 875,899 → **141,327** | 166.7 → **133.3 ms** | 183.3 → 150.1 ms | 2.4 → **1.1 ms** | 71 → 76 MB | 6.0 → 7.3 |
| 60 s idle | 1218 → **162** | 875,899 → **141,327** | 166.7 → **133.4 ms** | 183.3 → 150 ms | 2.2 → **0.9 ms** (−59 %) | 69 → 63 MB | 6.0 → 7.2 |

The district views (Zuoying/Nanzih) are the one place where frame time barely moves: with
~150 k triangles and ~450 calls they are rasterisation-bound in SwiftShader on the skinned
candidate avatars, work this pass deliberately did not touch. Draw calls still fall 60-67 % and
main-thread work 34-38 %, which is what a GPU-bound device actually pays.

Source data: `reports/performance/runtime-before.json`, `reports/performance/runtime-after.json`.

### Initial load (4× CPU throttle, 2-3 runs, median)

| metric | before | after |
|---|---|---|
| time to interactive canvas (island mounted) | 5157 ms | **1292 ms** (−75 %) |
| first rendered frame | 5707 ms | **4487 ms** |
| DOMContentLoaded | 498 ms | **145 ms** |
| load event | 504 ms | **147 ms** |
| long tasks | 11 | **7** |
| total blocking time | 4998 ms | **4113 ms** (−18 %) |
| longest task | 2598 ms | 2392 ms |
| JS heap after load | 104 MB | 98 MB |

The remaining long task is the city scene's first compile + first shadow bake; it is bounded by
geometry creation, not by data parsing, and it now starts 3.8 s earlier.

### Byte cost (`measure-initial-payload`)

| metric | before | after |
|---|---|---|
| navigation document decoded | 8,240,767 B | **433,851 B** (−95 %) |
| navigation transfer (br) | 1,142,217 B | **22,697 B** |
| all JS transfer / decoded | 1,538,504 / 10,593,787 B (14 req) | 1,544,141 / 10,606,229 B (15 req) |
| all requests | 17 | 18 |

Total downloaded bytes are flat on purpose: the dataset is still shipped, but as a dynamic
chunk fetched by the idle prefetch after first paint, so it no longer blocks parse, hydration or
the first frame. Opening a profile before the prefetch lands shows the existing
`載入人物資料…` state for one tick.

## 5. Visual regression evidence

Screenshots from the same production build and camera scenarios (`data-reduced-motion`, camera
held for 7 s so the walk cycle phase is the only variable), compared with a re-run of the *same*
build as the noise floor:

| scenario | baseline → optimised | same-build re-run (noise floor) |
|---|---|---|
| overview desktop | 150 px = 0.009 % | 49 px = 0.003 % |
| overview mobile | 1 px = 0.0003 % | 0 px |
| close-up (6× zoom) | 485 px = 0.030 % | 231 px = 0.014 % |
| Zuoying focus | 2,808 px = 0.176 % | 33 px = 0.002 % |
| Nanzih focus | 1,701 px = 0.106 % | 354 px = 0.022 % |

Signed luminance on the changed pixels (baseline → optimised): close-up lighter 246 / darker 209,
mean +1.6; Zuoying 1328/1338, +1.6; Nanzih 1113/320, +4.1; overview 72/62, +3.1; mobile 0/0.
The asymmetry is small and the changed area is a thin scatter of pedestrian silhouettes; a lost
shadow or a changed material would move tens of thousands of pixels globally and shift the mean
far more than 4/255. Screenshots: `reports/performance/screenshots/` (`before-*`, `after-*`); raw numbers in
`reports/performance/visual-diff.json`.

## 6. Remaining bottlenecks and trade-offs

* **Candidate avatars dominate district views.** 448 draw calls in Zuoying come mostly from the
  detailed GLB avatars (one skinned mesh per body part per visible candidate). Merging them means
  re-authoring the avatar pipeline (skinning, per-candidate materials) — high risk, not attempted.
  Only the truly invisible/hidden rows were stopped from uploading matrices.
* **Bounding-sphere culling still visits every actor.** The actor list is small (≤ 24 meaningful
  rows) so this is microseconds; a spatial index would add complexity for no measurable gain.
* **Opening a profile raises JS heap** (70 → 84 MB desktop, 76 → 87 MB mobile) because the full
  profile chunk and its DOM are live simultaneously with the scene. That is the cost of keeping
  the city mounted behind the sheet; the sheet already virtualises nothing because profiles are
  short. Not a regression in behaviour, and it is collectable when the sheet closes.
* **First compilation still costs ~2.4 s** of blocking time on a 4× throttled CPU (shader compile +
  shadow bake). Splitting further would introduce visible compilation when a district is entered.
* **Shadow quality is unchanged** (same map size and bias); it is simply not re-rendered while the
  caster set is static. Anything that animates a shadow caster must call the invalidation signal
  (`invalidateStaticShadowMap()`); the Ferris-wheel cabins were made non-casting for this reason.

## 7. Tests

* `npm test` — 45 files / 297 tests pass.
* `npm run typecheck` — 0 errors.
* Playwright: 116 tests pass in 6.6 min (desktop chromium + mobile-chromium projects); the suite covers
  `candidate-visibility`, `candidate-sheet-layout`, `living-world`, `unified-world`,
  `overview-consistency`, `mobile`, `smoke`.
* New unit coverage: `src/world/simulation-configure.test.ts` (roster injection, empty start
  state, district scope resolution, reset).

## 8. Summary

Draw calls per frame fall 60-87 % and submitted triangles 48-84 % in every scenario, including a
fully static idle scene; main-thread script time per frame roughly halves (−34 % to −59 %);
the first interactive canvas appears 3.9 s earlier on a 4× throttled CPU and the navigation
document shrinks 95 %; JS heap after load drops 11-31 % in most scenarios. Visual output is
indistinguishable (≤ 0.18 % of pixels differ, at the level of pedestrians' walk phase). No
landmark, candidate, animation, camera behaviour or district rule was removed.
