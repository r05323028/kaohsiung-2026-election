# Living Kaohsiung — Final Report

Date: 2026-11-08

## A. Mission and repository state

This stage turns the existing unified 38-district world from animated route markers into a deterministic walking simulation with explicit navigation, electoral movement limits, autonomous behavior, camera follow, and behavioural evidence.

- Repository root: `/Users/seanchang/kaohsiung-2026-election`
- Git: **not a Git repository**. No commits, branches, push, or deployment were created.
- Existing editorial policies, candidate records, provenance, publication gates, immersive HUD, and 左營–楠梓 art assets were preserved.
- No new districts or decorative art were added.
- All simulated movement is explicitly fictional: `此為虛構互動模擬，不代表真實所在地、行程或競選活動。`

The OpenSpec change is `openspec/changes/make-living-kaohsiung-believable/`, with `proposal.md`, `design.md`, `tasks.md`, and six capability delta specs. Strict validation passes.

## B. Before and after

| Area | Before this change | After this change |
| --- | --- | --- |
| Actors | 110 actors including 4 fictional demo profiles | **106 official actors**; demo profiles excluded from simulation |
| Navigation | Routes sampled as straight lines between geographic waypoints | Hierarchical hero and world walk graphs; graph-sampled routes; explicit bridges and ferries |
| Council-04 route | Symbolic loop, 6.63 km | Graph-validated 15.97 km loop on verified 左營–楠梓 paths |
| Mayoral proof route | Coarse 26.77 km centroid corridor | Gate-graph 27.79 km simulated corridor, E03→E04→E20→E19 and back; six boundary connectors are schematic |
| Behavior | Continuous route progress, minimal state | Deterministic FSM: choosing, walking, turning, arriving, pausing, observing, transitioning, following |
| Boundary enforcement | District checks during route construction | Runtime position check against `allowedAdminIds`; rejected entries counted |
| Rendering | Marker matrices and bounds rebuilt every frame | Markers update at 12 Hz; dynamic instanced buffers; no per-frame bounds rebuild |
| Character motion | Route position update | Walking gait, smooth heading, walking/idle animation, camera look-ahead |
| Evidence | Static screenshots and route assertions | Screenshots, video, bridge telemetry, 30 world unit tests, 4 living-world E2E tests |
| Population | 31 of 38 districts initially populated | **31 of 38**, deliberately unchanged; no candidates fabricated to fill empty districts |

## C. Navigation

`src/world/walk-graph.ts` defines:

- **Hero graph** `hero-zuoying-nanzih`: 33 nodes and 33 edges using visible streets, footpaths, plazas, the Nanzih park loop, the boardwalk, and three explicit river bridges.
- **World graph** `world-district-connectivity`: 124 nodes and 172 edges — 38 district nodes, official boundary-gate nodes, and gate links.
- **Explicit sea transport**: six directed ferry edges for 前鎮↔旗津, 小港↔旗津, and 旗津↔鼓山. These are transit edges, not pedestrian water crossings.

`heroObstacleAt` checks the Lotus Pond polygon, the Houjing River corridor, and the modelled hero footprint. Route validation samples every 0.04 km and rejects:

- a missing graph edge,
- a water sample on a non-transit edge,
- a district outside the actor's allowed scope,
- a world district transition with no official gate.

No code path silently substitutes a straight line through a building, water, or inaccessible terrain. A route that cannot be validated stays invalid and the actor does not enter it.

### Route coverage and honest limitations

- The validated pedestrian network covers **selected routes in 左營 and 楠梓**, not all streets in those districts and not the other 36 districts.
- Other council candidates still use deterministic **schematic** loops around a permitted district (`validation: 'schematic'`). The UI and documentation disclose this.
- The mayoral route uses official gate nodes, but six simplified-boundary transitions are 1.1–4.0 km from the exact gate coordinate. These six connector segments are explicitly labeled schematic; the route does not claim continuous street-level walking or sidewalk continuity there.
- The mayoral corridor is one simulated gate-level multi-district proof of concept, not a fully surveyed pedestrian route and not a real campaign itinerary.
- The citywide pedestrian network is **not complete**.

## D. Autonomous behavior

`src/world/simulation.ts` runs outside React and keeps actor state stable when rendering chunks unload.

- 106 actors: 5 mayors, 91 council candidates, 10 indigenous candidates.
- Base speeds: 0.0024 km/s mayor, 0.0013 km/s council, 0.0016 km/s indigenous, with deterministic 0.82–0.98 variance.
- `TIME_SCALE = 4`; tests use `advanceSimulationSeconds` for reproducible runs.
- Graph actors choose reachable safe destinations, walk node-to-node, turn at bounded rate, pause for 1.2–4.6 s, and observe landmarks for 2.2–5.8 s.
- A pause resumes the interrupted edge instead of walking back to the last completed node.
- Route actors pause, reverse, and resume. A regression test covers the previously broken reverse case where `Math.max(0, ...)` clamped a negative step to zero and froze the actor.
- Turning is smooth; the avatar uses `actor.heading`, not an instant destination-derived rotation.
- Character identity, behavior, route, spawn, and transition counters persist independently of scene mounting.

## E. Electoral movement rules

- Council-04 may move only in **E03 左營 and E04 楠梓**, derived from the existing constituency mapping.
- Mayors may enter all 38 administrative districts, subject to route and transport connectivity.
- Indigenous scopes cover all 38 districts for travel, with an explicit note that eligibility is identity/residence-based, not inferred from geography.
- A rejected district entry does not move the actor and increments `blockedTransitions`.
- Search and profile navigation remain independent of simulated position.
- Council-04 evidence after 1,800 simulated seconds: 12 actors, visited only E03/E04, zero unauthorized entries, zero blocked transitions.
- Mayoral evidence: `zhang-jing-2026` reached E19 岡山 after visiting E03, E04, and E20, with seven accepted district transitions and zero blocked transitions.
- Demo profiles are not instantiated; `demoActors: 0` in simulation stats.

## F. Population distribution

- **106** production actors from 106 official candidates; 4 demo profiles excluded.
- **31 of 38** districts initially contain an actor.
- Empty districts: 路竹, 茄萣, 美濃, 甲仙, 杉林, 桃源, 那瑪夏. They remain empty because their multi-district constituencies contain fewer candidates than districts; no actor or candidate was fabricated to fill them.
- Council-04 actors use distinct verified hero spawn nodes. Other actors use deterministic route offsets; no duplicate slug or actor identity appears across loaded chunks.
- Simulated visibility is not a political ranking; every candidate remains discoverable through search and direct profile navigation.

## G. Character interaction and rendering

- Selecting a candidate highlights the avatar and ring, tweens the camera into focus, and opens the existing profile panel.
- Follow mode uses delta-based exponential smoothing: `1 - Math.exp(-5.5 * min(frameDelta, 0.1))`.
- Walking actors receive a small 0.22-unit look-ahead; the selected avatar remains visible with the surrounding city.
- Closing restores the prior district, zone, landmark, admin context, world mode, and DOM focus.
- Procedural avatars have walking leg/arm swing and idle breathing. Optional GLB avatars support a `Walk` action and fall back to Idle.
- No physical likeness is invented or presented as an accurate portrait.
- Marker instances update at 12 Hz, avatars and selected indicators every frame. Full avatars are limited to hero actors plus the selected actor.

## H. Visual and behavioural evidence

All captures are in `reports/visual/living-world/`; telemetry is in `manifest.json`. Screenshots use headless Chromium + SwiftShader and are behavioural evidence, not campaign itineraries.

Before baseline: `reports/visual/world/06-council-04-follow.png`, `reports/visual/world/07-mayoral-follow.png`, and `reports/unified-world-report.md` record the previous 110-actor, symbolic-route implementation. The new captures below are the after-behaviour evidence.

| Evidence | File | Observed result |
| --- | --- | --- |
| Council walking in 左營 | `01-council-walking-zuoying.png` | 李雅芬 selected in E03, walking, 106 actors, 0 invalid routes |
| Valid crossing into 楠梓 | `02-council-crossing-nanzih.png` | Same actor in E04 after a bridge crossing; visited E03/E04; blocked 0 |
| Unauthorized-district prevention | `03-council-boundary-audit.png` | After 1,800 s, only E03/E04 visited; zero unauthorized entries |
| Mayoral multi-district travel | `04-mayor-multi-district.png` | 張靜 in E19 岡山; visited E03/E04/E20/E19; blocked 0 |
| Stop and turn | `05a-council-stop-and-turn.png` | Actor in `pausing` state at a graph node |
| Continue | `05b-council-resume.png` | Same actor resumes walking after the pause |
| Camera follow | `06-camera-follow.png` | Actor moved 0.1020 km; camera moved 11.3644 world units |
| State persistence | `07-state-persistence.png` | Same actor and profile after 全城→左營 switch; elapsed simulation continued 11.08 s |
| Mobile selection | `08-mobile-candidate-selection.png` | 390×844 profile panel opens; actor moved 0.1004 km and camera moved 8.9037 units under follow |
| World overview | `09a-world-overview.png` | Citywide view before entering hero |
| World-to-hero streaming | `09b-hero-zuoying.png` | Same 106-actor state after choosing 左營 |
| Performance diagnostics | `10-performance-diagnostics.png` | SwiftShader counters exported to window; HUD not displayed in this build |

Mobile note: the existing profile panel intentionally fills the mobile viewport. Camera tracking is measured through `window.__kaohsiungWorld.camera()` while the panel is open, not inferred from the covered screen.

Video: `reports/visual/living-world/walkthrough.webm` — 40.48 s, 1024×640, 25 fps, 9.6 MB. It shows the profile panel, city walk, world overview, hero scene, and reopening the same candidate.

## I. Verification

Commands run in the final working tree:

- `npm test` — **PASS**, 16 files / 118 tests.
- `npx playwright test --workers=1 --reporter=line` — **PASS**, 30 tests.
- `npm run typecheck` — **PASS**, 138 files, 0 errors, 0 warnings, 0 hints.
- `./node_modules/.bin/biome check src scripts tests playwright.config.ts` — **PASS**, 126 files, exit 0.
- `npm run build` — **PASS**, 134 static pages.
- `npm exec --yes --package=@fission-ai/openspec@1.14.1 -- openspec validate make-living-kaohsiung-believable --strict` — **PASS**, change is valid.

Lint note: plain `npm run lint` is intercepted by the local agent wrapper, which tries to parse its non-JSON output as ESLint JSON and reports `ESLint output (JSON parse failed: EOF while parsing a value at line 1 column 0)`. The underlying Biome command was run directly and passes 126 files; no project lint rule was disabled or weakened.

### Performance measurements

Renderer for all runs: ANGLE Vulkan SwiftShader (software WebGL) on Apple M1 Pro, 8 logical cores, 16 GiB. **SwiftShader is nonrepresentative software rendering, not a physical-GPU lower bound; these numbers do not predict hardware FPS.**

| Scenario | Viewport | Avg FPS | Cold minimum | Draw calls | Triangles |
| --- | --- | --- | --- | --- | --- |
| Citywide | 1600×1000 | 6.8 | 5.6 | 106 | 67,232 |
| Citywide | 390×844 | 13.3 | 10.8 | 106 | 67,232 |
| Hero 左營–楠梓 | 1600×1000 | 2.6 | 1.8 | 621 | 511,260 |
| Hero 左營–楠梓 | 390×844 | 4.4 | 1.0 | 596 | 413,787 |

Prior baseline: citywide 106 calls / 67,424 triangles; hero 564 / 508,772. The hero increase of 57 draw calls and 2,488 triangles is consistent with added path connectors and avatars. The measurements do **not** prove a performance improvement; marker update throttling reduces per-frame matrix work but is not isolated in these counters.

Counters point to draw-call, material, and geometry overhead in the high-detail hero scene as the primary rendering bottleneck, not the single instanced marker pass. No hardware GPU profile was available, so no desktop 60 FPS or mobile 30 FPS target is claimed. The measurement file is `reports/performance/living-world.json`.

## J. Completion status

Completed and verified:

- 106 official actors, demo exclusion, stable identities, no duplicates.
- Hero and world walk graphs, explicit bridges and ferries, graph-sampled route validation.
- Council-04 movement confined to 左營/楠梓; simulated gate-level mayoral multi-district proof route; explicit indigenous rules.
- Deterministic walking/pausing/turning/observing behavior with smooth orientation.
- Camera follow, selection highlight, profile restore, mobile selection, walking animation.
- State persistence across district switches and scene streaming.
- 31-of-38 natural population distribution with no fabricated candidates.
- 30 world unit tests, 4 living-world E2E tests, full 118-test suite, 30 Playwright tests, typecheck, Biome, build, and OpenSpec validation.
- Screenshot and video evidence for the required behaviours.

Implemented but not verified:

- Physical-GPU desktop/mobile FPS.
- Street-level continuity for the mayoral route beyond the six official-gate transitions.
- Complete citywide pedestrian network.

Partially implemented / explicitly limited:

- Detailed walkable navigation only in the 左營–楠梓 hero slice.
- Other council districts use disclosed schematic loops.
- World graph is district-and-gate connectivity, not a surveyed sidewalk graph.
- Avatars still share procedural geometry; differentiation is through labels and selection, with no newly invented portrait likenesses.
- Qijin is reached by explicit ferry; other remote transport is outside this change.

Blocked:

- Git history operations: no repository exists.
- Hardware-GPU profiling: no GPU-enabled automation available.

Not started:

- Street-level modelling for all 38 districts.
- Complete transit network beyond the Qijin ferry links.
- Production deployment.

## K. Git status

No Git repository was found at or above the project root. No commits, branches, push, or deployment were made. All work exists in the working tree only.
