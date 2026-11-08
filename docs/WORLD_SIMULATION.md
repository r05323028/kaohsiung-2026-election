# Unified world simulation

## Two geographies, one world

- **Administrative geography** — 38 official districts, stable IDs E01–E38, polygons, labels, adjacency. Rendered by `src/components/WorldLayer.tsx`.
- **Electoral geography** — existing candidate-data electoral districts (mayoral, council 01–11, indigenous, demo). Defined in `src/world/constituencies.ts`.
- The mapping is explicit: constituency 4 = 楠梓 + 左營; 鳳山 = council-09; and so on. Scene geometry contains no party, eligibility, or constituency rule.
- Indigenous scopes cover all 38 districts for travel, but carry an explicit note that eligibility is based on identity/residence, not geography.

## Candidate actors

Every **official** candidate profile creates exactly one `WorldActor`. Demo profiles are fixture data and are excluded from the production simulation.

| Field | Meaning |
| --- | --- |
| `id`, `slug`, `candidateId` | Stable identity; slug is the existing candidate slug. |
| `role` | `mayor`, `council`, `indigenous`, or the legacy `demo` type (not instantiated). |
| `electoralDistrictSlug` | Existing candidate-data district. |
| `allowedAdminIds/Names` | Explicit movement scope; derived from the electoral domain. |
| `routeId/Label/Valid/LengthKm/Warnings` | Validated route metadata. |
| `pathMode`, `graphId`, `currentNodeId`, `pathNodeIds` | Graph navigation state; graph actors choose destinations on the validated network. |
| `speedKmPerSec`, `progressKm` | Bounded deterministic speed and symbolic route progress. |
| `position`, `destination` | World kilometres (x east, z south). |
| `currentAdminId/Name` | Admin polygon containing the current position, tolerant of simplified boundary gaps. |
| `state`, `behavior`, `behaviorTimer` | `state` is `walking`/`idle`; `behavior` is the visible FSM state. |
| `districtTransitions`, `blockedTransitions` | Accepted boundary changes and rejected illegal entries. |
| `simulated`, `note` | Always true / fictional-movement disclaimer. |

- **106 actors** are produced from 106 official candidates. The four demo profiles are excluded.
- Council-04 actors spawn on distinct verified hero graph nodes. Other actors use a deterministic route offset and district-scoped placement; 31 of 38 districts are populated naturally, not filled artificially.
- The simulation is module-level: opening a profile, closing it, switching district, or unmounting the hero does not reset actor state.
- Time scale is **4**. Base speeds are 0.0024 km/s (mayor), 0.0013 (council), 0.0016 (indigenous), with deterministic 0.82–0.98 variance.
- `advanceSimulation(delta)` clamps per-frame deltas; `advanceSimulationSeconds(seconds)` is the deterministic one-second-step entry point for tests.
- Reduced motion stops autonomous advancement; camera transitions snap.

## Navigation and behavior

- The hero scene uses `HERO_WALK_GRAPH` (`hero-zuoying-nanzih`): footpaths, streets, plazas, park paths and three explicit river bridges. `heroObstacleAt` rejects pond water, river water and positions outside the modelled hero area.
- The world layer uses `WORLD_WALK_GRAPH` (`world-district-connectivity`): one node per district, one node per official boundary gate, and explicit ferry edges for the Qijin sea links. Land gate edges are schematic connectors, not surveyed sidewalks; ferries are transport transitions, not walking across water.
- Graph actors deterministically choose a reachable destination, then move node-to-node through `shortestWalkPath`. They alternate walking, turning, pausing (1.2–4.6 s) and observing landmarks (2.2–5.8 s); pauses resume the interrupted edge rather than walking back to the previous node.
- Route actors follow graph-validated world routes, reverse direction at pauses, smoothly turn, and never clamp a reversed step to zero. All position changes are checked against the actor's allowed districts before being applied.
- `advanceSimulationSeconds(seconds)` is used by unit and Playwright checks for reproducible behavior.

## Routes

- Every route is sampled every 0.04 km. Graph routes must resolve every consecutive node pair to a real walk edge and every sample to an allowed district (or an explicit transit edge). Invalid routes keep the actor idle; the app never falls back to a straight line through unauthorized geography.
- **COUNCIL_04_ROUTE** is a 15.97 km graph-validated loop on `hero-zuoying-nanzih`, using the river bridges and the Nanzih park paths. Samples are confined to E03 左營 and E04 楠梓.
- **MAYORAL_ROUTE** is a 27.79 km graph-validated route 左營 → 楠梓 → 橋頭 → 岡山 → 橋頭 → 楠梓 → 左營, following official boundary gates. It is intentionally a selected demonstration corridor, not a complete citywide pedestrian survey.
- Six simplified boundary transition points sit 1.1–4.0 km from the official gate coordinates; the route validates that the corresponding gate exists and reports this as a warning. Those six connectors are explicitly schematic, and the route does not claim continuous street-level walking there.
- Other council candidates receive a deterministic **schematic** loop around a point inside one permitted district (`validation: 'schematic'`), explicitly disclosed as not yet street-validated.
- Low-detail districts do not resolve street-level obstacles. No route is presented as a real campaign itinerary.

## Rendering and follow

- `src/components/ActorLayer.tsx` renders one instanced marker pass for all actors, full avatars for hero actors, and a selected-avatar + ring + simulated-movement tag. Marker matrices update at **12 Hz**; avatars and the selected ring update every frame. Instanced matrices use `DynamicDrawUsage`, and no per-frame bounding-sphere rebuild runs.
- Selected candidates use the existing profile overlay. The camera follows the actor's world position with delta-based exponential smoothing and a small walking look-ahead; mayoral/indigenous candidates use an 8.4 km district-context radius, council candidates a 1.8 km neighbourhood radius. Closing restores the previous district/zone/landmark/admin/world context and DOM focus.
- Search covers all candidates, including actors outside the loaded hero.
- `window.__kaohsiungWorld` exposes `advance`, `actors`, `snapshot`, `stats`, and `camera` for automated verification. It is presentation-only and never writes candidate facts.

## Tests and evidence

- `src/world/world.test.ts`: projection, 38 districts, topology, constituency mapping, graph connectivity, explicit ferries, the validated council-04 route and gate-level mayoral corridor, unauthorized-boundary rejection, unique spawns, behavior transitions, reversed-route movement, state persistence and determinism.
- `tests/e2e/living-world.spec.ts`: council walking/pausing/turning, council-04 boundary enforcement, mayoral multi-district travel, and camera follow.
- `tests/e2e/unified-world.spec.ts`: all 38 district focus, admin return, council-04 follow, simulation persistence across profile/district changes, mayoral multi-district travel.
- `tests/e2e/hud-geo.spec.ts`: HUD brand/navigation, authoritative district query focus, 38-label boundary debug overlay, and mobile menu focus handling.
- Behavioral screenshots and video: `reports/visual/living-world/`; performance measurements: `reports/performance/living-world.json`; narrative: `reports/living-world-report.md`.
- Candidate facts, provenance, review/publication pipelines, and direct routes are unchanged.

## Disclosure

All movement is **fictional simulation**. It must not be presented as a candidate's real whereabouts, schedule, or campaign activity. The name tag says 模擬移動; profiles retain official-source provenance. Only selected hero routes are street-validated; the citywide network is not claimed to be complete.
