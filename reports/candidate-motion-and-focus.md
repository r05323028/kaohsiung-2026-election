# Candidate movement, animation, and district-focus visibility

Implementation report for the miniature Kaohsiung world. Covers four linked
requirements: no candidate-to-candidate blocking, constituency-aware visibility
under district focus, unrestricted mayoral movement, and continuous walking
animation for both GLB LODs.

## 1. Root cause of the choppy walking animation

No transform throttle exists in `6bc3ecf`: `ActorLayer` writes every overview
instance matrix inside `useFrame`, and the simulation already runs fixed 1/60 s
ticks with per-frame alpha interpolation (`advanceSimulationFrame`,
`VISUAL_STEP_SECONDS = 1 / 60`). A headed probe measured 119.8 FPS at full city
and matrices changed on every rendered frame (`limbMoved 100/100`,
`phaseRegressions 0`). The reported 14 FPS update rate could not be reproduced
in this revision.

The visible stepping came from articulation, not update frequency: every
overview part mesh received the *same* whole-body matrix
(`for (const mesh of meshes) mesh?.setMatrixAt(index, helper.matrix)`), so limbs
never moved while the body glided along the road. All 106 actors use the
overview LOD at full-city zoom, so the entire crowd read as sliding figures.

## 2. Root cause of missing mayoral walking animation

The detailed pivots (`LeftArmPivot`, `RightArmPivot`, `LeftLegPivot`,
`RightLegPivot`, `HeadPivot`) are driven per rendered frame by
`CandidateChibi`, but only for the at most 10 nearest detailed avatars. A mayor
roaming citywide is normally rendered by the overview LOD, whose rigid matrices
froze arms and legs regardless of `walkPhase`. The walk phase and movement were
correct; only the overview presentation was static.

## 3. Collision and crowd-avoidance logic removed

Removed from `src/world/simulation.ts`:

- `MIN_ACTOR_SEPARATION` (0.24) and `CROWD_AWARENESS`
- `actorHasCloseNeighbour` and `movementWouldCrowd`
- `spaceOutSpawns` (spawn spacing now only picks deterministic edge progress)
- `reverseActor` head-on deadlock reversal
- `actor.blocked`, `actor.blockedTimer` and the idle "wait for crowd" branch
- collision-driven pause / speed reduction (`pauseRemaining`, `behavior = 'pausing'`)

`blockedTransitions` was renamed `territoryRejections`; it now counts only
electoral territory rejections rather than crowd waits. No physics engine or
replacement avoidance was added: actors advance solely on road topology, speed,
route, simulation time, and electoral permissions.

## 4. District-focused visibility

`src/world/candidate-visibility.ts` is the single predicate
(`isCandidateVisibleInFocus`, `visibleCandidatesForFocus`) used by the scene:

- no focus (full-city scope): every official candidate is eligible
- mayors: always eligible
- ordinary council: visible when the focused district id is part of the
  candidate constituency's `adminDistrictIds` from the existing
  `COUNCIL_CONSTITUENCIES` mapping (so E03 and E04 both resolve to
  `kaohsiung-council-04`, never separate constituencies)
- indigenous: follows the existing identity-based coverage, not the ordinary
  geographic partition
- constituency focus: that constituency plus mayors

`ActorLayer` computes `visibleActors` once per frame, and the same filtered
list drives articulated instanced parts, shadows, instance→slug picking,
selection rings, labels, and detail avatar mounting. Filtered slugs have no
instance and `__kaohsiungActorScreenPosition` returns `null`, so hidden
candidates cannot be clicked. Measured sets: full city 106; 左營 (E03), 楠梓
(E04), 三民 (E05) each 22 = 5 mayors + 12 council-04 + 5 indigenous, with
council-04 hidden for E05 and council-07 hidden for E03/E04.

## 5. Mayors remain citywide

Allowed admin ids for every mayor stay at all 38 districts; visibility filtering
only controls presentation. Across overview → E03 → E04 → E05 → overview the
sampler recorded 5/5 mayors with `allowedAdminIds.length === 38`, 5 walking,
5 outside the focused district, `mayorMaxPhaseDrop 0`, and position continuity
(`maxActorDelta 0.236–0.4` world units over ~1.4 s, i.e. normal walking, no
teleport). Simulation and animation keep running while a mayor is offscreen or
hidden.

## 6. Simulation and rendering synchronization

The authoritative simulation remains fixed-step (`VISUAL_STEP_SECONDS = 1 / 60`,
max 12 catch-up steps) and publishes `{from, to, alpha}` transitions; the
renderer samples `actorRenderPose(actor, alpha)` every frame for position,
heading, and walk phase. No change was needed here; the change was to stop
discarding that per-frame pose data for the overview representation.

## 7. Detailed and overview animation behavior

Overview, without regenerating the GLB: each merged material mesh is split into
connected components (union-find over welded triangle positions), each component
is classified to `body | head | leftArm | rightArm | leftLeg | rightLeg` from its
bounds against the detailed-model pivot ratios (`classifyOverviewPivot`,
`overviewPivots`), and components of the same pivot and role are merged with
`mergeGeometries` to keep one instanced mesh per part. Every frame each part
matrix is `bodyMatrix · pivotTranslation · pivotRotation`:

- legs `±sin(walkPhase · 4π) · 0.5`, arms `∓cos(walkPhase · 4π) · 0.34`
- walking blend ramps at 9/s and fades to idle head sway
- reduced motion forces the walking blend to 0 (limbs freeze, bodies still move)

Detailed avatars keep driving the five GLB pivots from the same live pose, so
both LODs share position, heading, scale, ground offset, movement progress, and
walk phase. Hiding a candidate for the overview LOD writes scale 0 for that
instance, and the detail avatar only mounts for visible slugs, so LOD changes
never duplicate an actor or reset its phase.

## 8. Performance measurements

Headed Chromium, Apple M1 Pro / ANGLE Metal, 1600×1000, `?perf=1`, 3.5 s rAF
sampling:

| Scene | Baseline 6bc3ecf | This change |
| --- | --- | --- |
| Full city, overview | 119.8 FPS (median 8.3 ms), 1801 draw calls, 609,018 tris | 119.79 FPS, 1811 draw calls, 609,018 tris |
| Full city, detail | 120.1 FPS, 1518 draw calls | ~109 FPS (instrumented run), 1528 draw calls |
| E03 focus | 98.0 FPS, 1835 draw calls | 108.8 FPS, 1845 draw calls |
| Mobile 390×844 full city | — | 115.9 FPS (median 8.6 ms) |

Articulation costs about 10 extra instanced draw calls and zero triangles; the
frame-time difference at 120 FPS is below measurement noise. Per-frame sampling
with 9 actors × 4 bridge calls plus video capture lowers full city to 73.7 FPS:
that is instrumentation overhead, not scene cost. Headless Chromium is
SwiftShader-only (1.3–2 FPS at full city) and cannot be used for smoothness
claims.

## 9. Automated test results

- `vitest run`: 28 files, 177 tests passed
- `playwright test`: 82 tests passed (chromium + mobile-chromium), 15.5 min
- `astro check`: 187 files, 0 errors / 0 warnings / 0 hints
- `biome check`: exit 0 (pre-existing warnings only)
- `npm run build`: all validators, 126 static pages, profile-copy validation passed

New/updated coverage: pass-through with equal speeds and no reversal, two actors
on one node, long deterministic walks staying on the graph, mayoral 38-district
reach under focus, council-04 territory enforcement, mayors walking citywide
across focus transitions, articulated overview and detailed pivots during
walking, frozen limbs under reduced motion, focus-filtered counts and picking,
and LOD/focus transitions.

## 10. Animation and visual evidence

Artifacts under `reports/visual/candidate-motion/`:

- `measurements-gpu.json`: full city 106 actors, 100 frames, every sampled
  walker `limbMoved 100/100`, `poseMoved 100/100`, `stepMean` 0.0018–0.0022
  world units per frame
- `detail-lod.json`: 6 detailed actors, arms/legs changed 120/120 frames
  (0.019–0.028 rad), detail→overview→detail round trip with 0 missing actors and
  0 phase regressions
- `motion-desktop.webm`, `motion-mobile.webm`: headed recordings
- `10-full-city-overview-gpu.png` … `17-mobile-zuoying-gpu.png`,
  `18-detail-closeup-gpu.png`: full city, 左營/楠梓/三民 focus, restored
  overview, mobile full/focus
- `overview-closeups/`: forced-overview close-ups showing the articulated
  overview character with attached head, arms, legs, shoes and shadow, legs
  swinging between frames
- `perf-branch-focus-e03.png`, `perf-baseline-focus-e03.png`: A/B scene captures

## 11. Remaining limitations

- Overview articulation is rigid-part animation over split merged geometry, not
  skinned animation; it cannot reproduce the detailed model's exact joint
  deformation, only its limb swing around the same pivots.
- Read-only HTML labels share the same visibility predicate, but the label
  component is mounted per detailed avatar only; at overview zoom labels are
  intentionally absent as before.
- Headless WebGL remains SwiftShader-bound, so automated tests assert state and
  matrix change rather than frame rate; FPS claims come from headed GPU runs.
- Instrumented sampling (bridge calls per frame) depresses FPS and is reported
  separately from passive measurements.
