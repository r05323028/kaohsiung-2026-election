# Unified Kaohsiung World — Final Report

Date: 2026-11-08

## A. Repository and baseline

- Repository root: `/Users/seanchang/kaohsiung-2026-election`
- Git: **not a Git repository**. No commits, push, deployment, or branch were created.
- Stack: Astro 7.4.5 static, React 19.3, React Three Fiber 9.8, Three.js 0.187, GSAP 3.15, Tailwind 4, Zod 4, Vitest 5, Playwright 1.64.
- Baseline: the previous mission delivered a single high-detail Zuoying–Nanzih diorama inside a full-screen HUD (`reports/visual/after/`, `reports/final-report.md`). That stage had no 38-district geography, no persistent world simulation, and candidate markers were a fixed grid rather than moving actors.
- Unified-world captures: `reports/visual/world/` (10 screenshots, desktop/mobile sheets, walkthrough video). The old 9-view `reports/visual/after/` set remains the prior hero-only baseline.
- Existing test contracts were preserved: exact `h1`, `#scene-heading` district switching, election tabs, district/candidate names, search, profile tabs, direct candidate routes, WebGL fallback, and mobile profile sheet.

## B. Visual and world changes

- **38-district geography**: official township polygons, terrain fills, boundaries, label points, 86 adjacency gates, and 16 remote territories. The citywide view is a stylised relief map, not a survey or a dense street-level model.
- **One continuous world**: a pale sea plane, island landmass, clustered low-detail urban massing around district label points, mountain/hill relief cones, nine overview labels, and a low-detail apron around the hero footprint.
- **Hero streaming**: the original Zuoying–Nanzih diorama is migrated to world coordinates and is mounted only for close focus. At city scale it is replaced by low-detail massing, avoiding loading full hero geometry for all 38 districts.
- **Hero quality retained**: Lotus Pond, Dragon and Tiger Pagodas, Spring and Autumn Pavilions, old-city gate, temple, shophouse streets, Metropolitan Park, Houjing River, harbour, and candidate walking loop remain the high-detail first slice.
- **Actors**: 110 candidate actors use a shared instanced marker pass; actors inside the hero get full avatars; a selected actor gets a ring, full avatar, and a “模擬移動” name tag. Movement is explicitly fictional.
- **Portrait mobile**: the citywide view rotates a quarter turn so the long Kaohsiung coastline runs vertically and fills the portrait screen instead of becoming a thin horizontal ribbon.
- **Follow framing**: mayoral/indigenous candidates use an 8.4 km district-context radius; council candidates use a 1.8 km neighbourhood radius. The selected actor remains visible with a tag and ring.

## C. Immersive UX changes

- Admin district tray lists all 38 districts with terrain labels and 44 px mobile targets.
- Selecting an admin district opens a context card with English name, terrain, area, remote-territory count, adjacency, and an artistic-simplification note; “回到全市” restores the world overview.
- The citywide view is the desktop entry state; portrait entry defaults to the Zuoying hero unless a URL focus is supplied.
- Candidate selection follows the actor, opens the existing civic profile overlay, and closing restores the previous zone/landmark/admin/world context and DOM focus.
- Existing search, election filters, district switching, direct candidate pages, reduced-motion behaviour, and WebGL fallback remain operational.
- The HUD stays compact: brand, search, settings, zone buttons, admin/electoral/people toggles, and contextual cards. No large instructional paragraphs were added.

## D. Technical implementation

Geography data:

- Source: 內政部國土測繪中心, `TOWN_MOI_1140318`, dataset 7441, modified 2025-12-16, retrieved 2026-11-08.
- Licence: 政府資料開放授權條款第1版.
- Source CRS GCS_TWD97[2020], treated as WGS84 (<1 m documented difference).
- Generated `src/data/geography/kaohsiung-districts.json` (187,858 B; 38 districts, 86 gates, 16 remote territories) and `kaohsiung-districts-summary.json` (15,927 B).
- RDP simplification ε 0.0002° (~22 m). Qijin main island is the largest ring; Dongsha/Pratas/Taiping remain explicit remote records outside walkable bounds.

World modules:

- `src/world/projection.ts`: 1 world unit = 1 km, origin 120.30E/22.70N.
- `src/world/geography.ts`: polygons, point-in-district tests, adjacency, focus helpers.
- `src/world/hero.ts`: hero anchor 120.298E/22.700N, 0.18 km per horizontal hero unit, 0.035 km vertical scale, streaming thresholds.
- `src/world/constituencies.ts`: administrative/electoral separation and movement scopes.
- `src/world/navigation.ts`: sampled, polygon-validated routes; invalid routes keep actors idle rather than falling back to straight lines.
- `src/world/simulation.ts`: module-level deterministic 110-actor state independent of R3F.
- `src/world/summary.ts`: lightweight summary-only client data.

Rendering and HUD:

- `src/components/WorldLayer.tsx`: 38 district fills, boundaries, labels, merged clustered massing, relief, sea, hero apron.
- `src/components/ActorLayer.tsx`: instanced markers, hero avatars, selected avatar/ring/tag.
- `src/components/CityScene.tsx`: world/hero streaming, orthographic camera, portrait rotation, follow support, selection.
- `src/components/CityExplorer.tsx`: 38-district tray, admin card, URL state, follow/restore, focus priority.
- `src/city/layout.ts` and city modules: hero geometry and walking path.
- `src/styles/global.css`: compact HUD, admin tray, mobile 44 px controls.
- `tests/e2e/unified-world.spec.ts`, `src/world/world.test.ts`, extended mobile test.

Routes and simulation:

- `COUNCIL_04_ROUTE`: 6.63 km, 8 points, sampled only in E03 左營 and E04 楠梓.
- `MAYORAL_ROUTE`: 26.77 km, 7 points, E03/E04/E20/E19.
- 110 actors: 5 mayors, 91 council, 10 indigenous, 4 demo; 0 invalid routes, 0 idle at initial state.
- 31 of 38 districts contain at least one initially routed actor. Seven mountain/coastal districts have no candidate because their multi-district constituency contains fewer candidates than districts; this is not fabricated.

No candidate facts, provenance, review/publication policies, or editorial pipelines were modified.

## E. Visual evidence

Desktop:

- `reports/visual/world/01-kaohsiung-overview.png` — complete 38-district island, labels, relief, sea.
- `02-admin-tray.png` — 38-district tray.
- `03-admin-zuoying.png` — 左營 context, hero streaming, district card.
- `04-admin-taoyuan.png` — mountain district, selected fill and sparse relief.
- `05-admin-qijin.png` — Qijin main island; the view is sea-heavy because Qijin is a narrow island, but the island is visible and labelled.
- `06-council-04-follow.png` — 黃文志 after 360 simulated seconds, hero context, tag/ring, profile.
- `07-mayoral-follow.png` — 張靜 after 900 simulated seconds in 岡山 with district-context framing and profile.

Mobile:

- `08-mobile-zone.png` — zone-first Zuoying hero, compact dock, 44 px controls.
- `09-mobile-world.png` — rotated vertical citywide map, full island, compact dock.
- `10-mobile-admin-tray.png` — 38 districts in a 3-column touch tray.

Sheets and video:

- `reports/visual/world/desktop-sheet.png`
- `reports/visual/world/mobile-sheet.png`
- `reports/visual/world/contact-sheet.png`
- `reports/visual/world/walkthrough.mp4` (2.0 MB, ~70 s; WebM original 25 MB)

Self-review defects remaining:

- Low-detail districts are massing/relief, not street-level architecture; selected fills can look pale.
- 桃源’s mountain relief is sparse compared with the urban west.
- Qijin’s focus is geographically dominated by water; the narrow island is small.
- Selected avatars remain small beside hero buildings; the tag and ring carry identification.
- The mayoral corridor is a coarse centroid route proof, not a real itinerary.
- The prior 9-view baseline for Zuoying–Nanzih focus shots is not fully equivalent, and its river shot was invalid because the legacy app ignored focus URLs.

## F. Verification

Commands and results:

- `npx tsc --noEmit --ignoreDeprecations 6.0` — PASS.
- `./node_modules/.bin/biome check src scripts tests playwright.config.ts` — PASS, 122 files.
- `npm test` — PASS, 16 files / 109 tests.
- `npx playwright test --workers=1 --reporter=line` — PASS, 26/26 in 2.1 min.
- `npm run build` — PASS, 134 static pages.
- `npm exec --yes --package=@fission-ai/openspec@1.14.1 -- openspec validate establish-unified-kaohsiung-world --strict` — PASS.

Playwright default parallel workers was set to 1 in `playwright.config.ts`: multiple simultaneous SwiftShader scenes starved the browser and produced timeouts, not product regressions. The same tests pass serially.

Performance (headless Chromium + SwiftShader, software WebGL; **not physical-GPU evidence**):

| Scenario | Viewport | Avg FPS | Min of 5 | Draw calls | Triangles |
| --- | --- | --- | --- | --- | --- |
| Citywide | 1600×1000 | 6.7 | 6.3 | 106 | 67,424 |
| Citywide | 390×844 | 15.3 | 14.0 | 106 | 67,424 |
| Hero | 1600×1000 | 2.4 | 0.8 | 564 | 508,772 |
| Hero | 390×844 | 3.6 | 0.8 | 550 | 412,251 |

Host: Apple M1 Pro, 8 logical cores, 16 GB, macOS Darwin 25.3.0; renderer ANGLE SwiftShader. The minimum is the coldest of five samples, not a percentile. Physical-GPU 60/30 FPS remain unverified.

Initial payload (production `/`): 565,184 B JavaScript transfer / 577,318 B total transfer, 13 requests, 3.13 MB decoded. Largest chunks: `useAnimations` 266,650 B, candidate/data 95,149 B, `CityScene` 66,236 B, `summary` 57,040 B, client 64,237 B.

Mobile: 390×844, DPR 2; 44 px touch targets across search, settings, zones, trays, profile, and admin card; rotated citywide map; no horizontal overflow. WebGL fallback and direct candidate routes remain covered by the suite.

## G. Completion status

Completed and verified:

- All 38 administrative districts in one geographic model, each focusable.
- Official boundary data and licence documented.
- Hero migrated and streamed; Zuoying–Nanzih quality retained.
- Persistent 110-actor simulation independent of R3F.
- Council-04 route confined to 左營/楠梓; mayoral route crosses four districts.
- Admin tray, context card, world overview, candidate follow, restoration, search, mobile rotation, 44 px controls.
- Unit, Playwright, build, and OpenSpec gates pass.
- 10 screenshots, sheets, and walkthrough video.

Implemented but not verified:

- Desktop 60 FPS / mobile 30 FPS on physical hardware. SwiftShader numbers are lower bounds only.

Partially implemented:

- Low-detail district massing/relief; no street-level detail for the other 36 districts.
- 桃源 relief is sparse; Qijin is water-heavy by geography.
- The mayoral corridor is coarse, not a turn-by-turn itinerary.
- The prior hero-only focus baseline is not a complete before/after for the unified world.

Blocked:

- Git operations: no repository exists.
- Physical-GPU performance validation: no GPU-enabled automation available.

Not started:

- Street-level modelling for all 38 districts.
- Real transport links for remote islands.
- Production deployment.

## H. Git status

No Git repository was found at or above the project root. No commits, branches, push, or deployment were made. All work exists in the working tree only.
