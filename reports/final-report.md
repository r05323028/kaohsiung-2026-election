# Final report — improve-zuoying-nanzih-immersive-city

Date: 2026-11-08
Project: 港都人物誌 (Kaohsiung Civic Portraits)
Scope: Zuoying–Nanzih immersive 3D city experience

## A. Repository and baseline

- Repository root: `/Users/seanchang/kaohsiung-2026-election`
- Git: **not a Git repository**. `git rev-parse --show-toplevel` fails and no parent `.git` exists. No branch, commit, push, or deployment was possible or claimed.
- Stack verified: Astro 7.4.5 static output, React 19.3, TypeScript 6, React Three Fiber 9.8, drei 10.7, Three.js 0.187, GSAP 3.15, Tailwind 4, Zod 4, Vitest 5, Playwright 1.64, GitHub Actions configuration in the repository.
- Existing architecture before this change: a conventional three-column explorer (`src/components/CityExplorer.tsx`), a small orthographic `MiniCityScene` with six box buildings and sphere palms, a large hero paragraph, a notice card, two information cards, a permanent sidebar, a toolbar, a legend, and a right-hand profile panel.
- Baseline rendering problems: the scene was a small decorative panel rather than an explorable world; almost all buildings were single boxes; there were no landmark-specific models, no Lotus Pond geometry, no real Houjing River, no park composition, no architectural detail, and no contextual interaction.
- Baseline artifacts: `reports/visual/baseline/` (9 PNGs) and `reports/visual/baseline/manifest.json`.
- Baseline performance: no instrumentation existed in the legacy scene, so a truthful baseline FPS was not captured. It is not estimated here.

### Baseline evidence limitation

The baseline URLs included `focus=...` and `candidate=lee-mei-chen`, but the legacy application ignored those focus URLs and the candidate slug does not exist. Therefore the baseline focus shots (02–08) are **not equivalent camera views** to the after shots, and baseline 05 (Houjing River) is effectively unusable for a focused comparison. The overview and mobile baseline (01, 09) are valid UI comparisons. This evidence gap is disclosed rather than presented as a complete nine-view before/after set.

## B. Visual improvements

All city geometry is original runtime procedural geometry; no Blender-authored hero GLB, external model, photograph, texture atlas, or trademark asset is shipped.

- **Dragon and Tiger Pagodas**: dedicated twin seven-tier towers with flared green eaves, red/cream bands, balcony rings, gold finials, shared terrace, sky bridge, lanterns, sculpted teal/gold dragon and ochre/black-striped tiger entrance heads, and a lantern-lit forecourt. The landmark card states that it is an artistic reconstruction, not a construction or conservation record.
- **Lotus Pond**: irregular shoreline with sand edge, calm teal water with subtle ripple normals, instanced lotus leaves and flowers, reeds, promenade, nine-turn bridge, Spring and Autumn Pavilions with Guanyin figure, and surrounding trees.
- **Zuoying old town**: shophouse rows with arcades, recessed shopfronts, striped awnings, upper windows, balconies, rooftop equipment, a temple with swallowtail roof and stone lions, and a brick old city gate.
- **Nanzih**: distinct modern identity through mid-rise apartments, glazed towers, balcony ribbons, science-park office blocks, wide roads, street furniture, light rail, and harbour industry.
- **Houjing River**: meandering ribbon geometry, both-bank embankments, east–west pedestrian bridges with approach paths, riverside planting, and bridges that connect the banks rather than ending in grass.
- **Metropolitan Park**: lake, boardwalk, footpaths, benches, playground, flower beds, clumped broadleaf/pine/banyan vegetation, and an observation deck.
- **Harbour and skyline**: quay, warehouses, containers, gantry cranes, ferry, ship, lighthouse, and a simplified distant skyline including an 85 Sky Tower-inspired silhouette.
- **Materials and lighting**: shared material keys for plaster, roofs, glass, timber, stone, temple red/gold, foliage, roads, vehicles, and water; ACES Filmic tone mapping, warm key light, cool hemisphere fill, soft PCF shadows, contact-like grounding, restrained roughness variation.
- **Environmental life**: slow water ripple, subtle landmark hover lift, selection ring on compact landmarks, and no continuous simulation or physics.

## C. Immersive UX improvements

- Removed the permanent hero paragraph, demo notice, information cards, three-column layout, scene toolbar, legend, and always-open side panels. The scene is full-screen.
- The existing heading 在港灣城市裡，慢慢認識公共人物。 remains as a small brand line so it remains accessible and testable.
- Minimal HUD: compact top bar (brand, scene heading, search, settings), a bottom dock with 全城 / 左營 / 楠梓 zone controls, a district tray, a people tray, and contextual landmark/profile cards.
- Camera states: city overview, district focus, landmark focus, candidate focus, and transitions. Radius-based orthographic framing, GSAP easing, disabled orbit input during a tween, reduced-motion snap, stable reset, and Escape-to-close.
- Interaction: landmark hover lift, click focus, empty-canvas dismissal, candidate markers with neutral coloured discs, selected coral halo, drag guards to prevent accidental selection, and direct candidate links.
- Progressive disclosure: district, people, and candidate information appear on demand; candidate facts, policies, public records, news, relationships, timeline, sources, and review status remain available through `ProfileTabs`.
- Accessibility: keyboard focus moves to the profile close control and is restored to the invoking control; visible focus styles; every essential mobile control (search, settings, zone, dock toggle, tray close, election tab, district chip, candidate row, profile close, profile tabs, settings close, quality option, reduced-motion toggle, reset, search clear, landmark return) renders at least 44 px in both dimensions at 390×844, with a post-review 320/360-width probe finding no essential control below 44×44; labels; reduced motion; WebGL detection; static fallback with usable candidate buttons; direct candidate routes.
- Mobile: zone-first portrait framing, compact dock, scrollable trays, and no horizontal page scroll at 390×844. District chips use a two-column grid on narrow screens so several choices are visible at once. The active district is marked with `aria-current`; the desktop rail scrolls it into view, while the mobile tray opens at the top so its election tabs and close control remain visible.

## D. Technical implementation

Because there is no Git repository, there is no diff or commit history. Files added or changed for this work:

### City modules (new)

- `src/city/materials.ts` — shared material palette, procedural ripple/ground textures.
- `src/city/builder.ts` — merged-material geometry builder, frames, roofs, eave helpers, seeded randomness, detail levels, compatible-attribute merge/index fix.
- `src/city/buildings.ts` — shophouse, apartment, tower, civic hall, temple, office, windows, balconies, rooftops.
- `src/city/landmarks.ts` — Dragon/Tiger Pagodas, heads, Spring/Autumn Pavilions, old city gate, Banping Mountain, park pavilion, skyline.
- `src/city/streets.ts` — roads, crossings, streetlights, utility poles/wires, boardwalk, arch bridges, nine-turn bridge, plaza, rail, footpaths.
- `src/city/props.ts` — scooters, cars, buses, pedestrians, benches, planters, bins, bus stops, stalls, containers, cranes, ships, ferries, lanterns.
- `src/city/water.ts` — pond/river/lake/harbour geometry, water material, lotus geometry.
- `src/city/vegetation.ts` — broadleaf, palm, banyan, pine, shrubs, reeds, clumped scatter.
- `src/city/layout.ts` — world composition, districts, landmarks, focus presets, trees, lotus, reeds.
- `src/city/anchors.ts` — renderer-free candidate marker grid.

### Application components

- `src/components/CityScene.tsx` — R3F scene, instanced vegetation/lotus, merged city, landmark groups, water, candidate markers, camera rig, diagnostics, fallback/error boundary integration.
- `src/components/CityExplorer.tsx` — full-screen HUD, URL state, camera focus priority, trays, search, settings, candidate overlay, keyboard focus restoration, reduced motion, WebGL fallback.
- `src/components/CharacterAvatar.tsx` — optional marker position/rotation override and drag guard.
- `src/layouts/BaseLayout.astro` — `immersive` mode that suppresses site topbar/footer.
- `src/pages/index.astro` — immersive homepage, server-side landmark metadata passed as plain props to keep Three.js in the lazy scene chunk.
- `src/styles/global.css` — full-screen HUD, dock/tray, profile overlay, mobile, focus, and reduced-motion styles.

### Tooling and documentation

- `scripts/capture-city-screenshots.ts` — deterministic nine-view Playwright capture with reduced motion.
- `scripts/measure-city-performance.ts` — browser FPS/draw-call/geometry sampling via `?perf=1`.
- `scripts/measure-initial-payload.ts` — initial resource transfer measurement.
- `tests/e2e/city-experience.spec.ts` — Escape order and URL focus/candidate behavior.
- `docs/CITY_ART_DIRECTION.md` — art direction and asset manifest.
- `openspec/changes/improve-zuoying-nanzih-immersive-city/` — proposal, design, specs, tasks.

### Architecture decisions

- One merged mesh per material for the static city; instanced vegetation and lotus; dedicated landmark groups so hover/selection can act on one group.
- Orthographic miniature-diorama camera with radius-based framing instead of raw coordinates, so desktop and portrait fit the same focus state.
- Candidate markers are neutral by default; selection uses a coral halo, not party or ranking treatment. Candidate data, identities, provenance, review/publication policy, and enrichment/remediation scripts were not modified.
- Lightweight `anchors.ts` and server-to-client landmark metadata keep the initial HTML/JS path free of the full Three.js world module.

## E. Visual evidence

- Before: `reports/visual/baseline/` (9 PNGs; see evidence limitation above).
- After: `reports/visual/after/` (9 PNGs + manifest).
- Side-by-side pairs: `reports/visual/comparison/` (9 PNGs + contact sheet).
- Contact sheets: `reports/visual/after/contact-sheet.png`, `reports/visual/comparison/contact-sheet.png`.

Required after views:

1. `reports/visual/after/01-district-overview.png`
2. `reports/visual/after/02-lotus-pond.png`
3. `reports/visual/after/03-dragon-tiger-pagodas.png`
4. `reports/visual/after/04-zuoying-neighborhood.png`
5. `reports/visual/after/05-houjing-river.png`
6. `reports/visual/after/06-metropolitan-park.png`
7. `reports/visual/after/07-nanzih-neighborhood.png`
8. `reports/visual/after/08-candidate-selection.png`
9. `reports/visual/after/09-mobile.png`

Visible changes: the after overview fills the viewport with a composed diorama containing the pond, pagodas, old town, temple, plaza, river, park, Nanzih towers, and harbour; the pagoda close-up shows twin tiered towers, sky bridge, and dragon/tiger heads; the river view shows both banks, bridge, and paths; the park view shows lake, boardwalk, paths, playground, and vegetation; the candidate view shows the plaza with the selected coral halo and a readable profile overlay; mobile is legible with a one-line brand, compact dock, and full-height city.

Remaining visual defects: pagoda heads are stylised mascots rather than literal sculpture; some park lawn areas remain intentionally open; candidate GLB avatars are shared and visually similar; a few tree canopies can still occlude narrow paths at overview distance.

## F. Verification

Commands actually run and results:

| Command | Result |
| --- | --- |
| `npx tsc --noEmit --ignoreDeprecations 6.0` | PASS |
| `./node_modules/.bin/biome check src scripts tests playwright.config.ts` | PASS, 109 files |
| `npm test` | PASS, 15 files / 88 tests / ~1.1 s |
| `npx playwright test --reporter=line` | PASS, 21/21, Chromium desktop + Pixel 7 |
| `npm run build` | PASS, 134 pages, all data validators + `astro check` + static build |
| OpenSpec strict validation | PASS for `improve-zuoying-nanzih-immersive-city` |
| Mobile 44 px test, 5 repeats | PASS 5/5 after removing a dev-toolbar race |

### Performance (measured, not inferred)

Measured with headless Chromium against production preview `http://127.0.0.1:4322`, viewport 1600×1000 and 390×844, DPR 1 reported by the renderer, five samples each. Files: `reports/performance/after.json`, `reports/performance/initial-payload.json`.

| Viewport | Avg FPS | Low FPS | Draw calls | Triangles | Geometries |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1600×1000 | 3.1 | 1.1 | 436 | 401,938 | 242 |
| 390×844 | 2.4 | 1.2 | 414 | 304,435 | 232 |

Host: MacBookPro18,3 (Apple M1 Pro, 16 GB), macOS 26.3.1. Browser: headless Chromium 156.0.8078.4, 8 logical cores. Renderer: `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)`. Low FPS is the minimum of five samples, not a low-percentile statistic; the minimum is the first, cold-start sample in both profiles. The remaining desktop samples were 2.8–5.4 FPS and the remaining mobile samples were 1.9–4.3 FPS. Software timing varies widely: an earlier run recorded 3.0/2.6 desktop and 5.8/1.5 mobile.

**These are software-WebGL lower bounds, not target-hardware performance.** The 60 FPS desktop / 30 FPS mobile targets are **not verified**; a physical GPU pass remains required.

Initial payload: 420 KiB JavaScript transfer (430,144 B), 431 KiB total transfer (441,751 B), 12 requests, 1.56 MB decoded. Navigation HTML: 42,855 B transfer / 1,087,008 B decoded. Largest chunk: `useAnimations` 266,632 B transfer; `CityScene` 57,608 B transfer.

Mobile/accessibility checks: 390×844 no horizontal page scroll; Playwright measures every essential control in the top bar, district tray, people tray, profile panel, settings panel, search-clear action, and landmark card at a minimum of 44 px in both dimensions; a 320/360-width probe after the final min-width fix measured no essential control below 44×44; profile close focus and restoration; Escape order settings → search → candidate → tray → landmark; reduced-motion snap and stopped ripple; WebGL-null fallback retains selectable candidate buttons.

### Independent review

Previous review `b560a747-e019-471e-924c-fd788e4418ae` returned BLOCK with P1 findings (bridge/embankment defects, portrait mobile thumbnail/touch targets, candidate panel keyboard focus, low-tier boardwalk cost, unproven performance/payload). The implementing fixes are present.

Review `0b166957-6c82-4d65-bf18-bd49d819ab7c` also returned BLOCK for the first batch of undersized mobile controls. Those were enlarged, after which targeted review `del_mw6r4un0_h3ev` returned BLOCK for a second batch: profile close/tabs, settings close/quality/toggle/reset, search clear, landmark return, plus a mobile district-tray auto-scroll regression that pushed the tray header out of view. The fixes are now implemented: profile controls and settings actions have 44 px targets, profile tabs wrap instead of clipping, the search-clear and landmark-return actions meet 44 px, and the tray auto-scroll is skipped at 760 px and below. Playwright now measures these surfaces and asserts the district tray header is in the viewport with `scrollTop` at zero. Final targeted re-review `del_mw6scg4w_o18a` returned PASS at the stated 390×844 acceptance viewport (`reports/review/p1-touch-fix-review.md`). It found one remaining narrow-width issue: the district election tab measured 43.5×44 at 360×640 and 35.5×44 at 320×568. The mobile tab rule now sets `min-width: 2.75rem`; an implementer sweep at 320/360/390 after that change found no essential control below 44×44, with only scroll-offscreen district rows noted. The review's non-blocking P2 findings remain documented: the tray header can scroll away when the user swipes the tray, the selected district chip may sit below the fold at 320 px, the JS/CSS 760 px breakpoint is duplicated, and a deeply scrolled profile panel can hide its own tabs and close control until the user scrolls back.

## G. Completion status

### Completed and verified

- Full-screen immersive city scene and compact HUD.
- Zuoying landmarks and neighborhoods, Lotus Pond, Dragon/Tiger Pagodas, old town, city gate.
- Nanzih riverfront, Metropolitan Park, neighborhoods, harbour.
- Procedural architecture/materials/lighting and instanced vegetation/lotus.
- Camera focus states, URL deep links, drag guards, selection treatment, Escape handling, focus restoration.
- Candidate profiles, provenance, direct routes, and non-WebGL fallback preserved.
- Nine after screenshots, contact sheets, and comparisons generated from production preview.
- Unit tests, e2e tests, typecheck, Biome, full build, and OpenSpec validation pass.
- Independent targeted review PASS at 390×844; the narrow-width P1 it found was fixed and re-measured at 320/360/390, with non-blocking P2 notes documented.

### Implemented but not verified

- 60 FPS desktop / 30 FPS mobile targets: only SwiftShader software measurements exist.
- Physical-device touch/keyboard visual pass beyond Playwright and scripted measurements.

### Partially implemented / evidence limitation

- Before/after comparison is fully valid for overview and mobile UI, but focus views 02–08 baseline framing is not equivalent and baseline 05/08 are invalid (legacy app ignored focus URLs; `lee-mei-chen` slug did not exist). This is a documented evidence gap, not a claimed complete nine-view comparison.
- Pagoda heads remain stylised rather than literal; park lawn and shared avatars remain simplified.

### Blocked

- Git commits, branch reporting, push, and deployment: blocked by the absence of a Git repository.
- Representative GPU performance validation: blocked by the available headless software renderer.

### Not started

- No deployment or production push.
- No Blender-authored hero GLB pipeline.

## H. Git status

- Git operations genuinely occurred: **none**.
- Repository root is not a Git worktree; there is no branch, commit, or remote to report.
- All modified files are working-directory changes only; no commit or push is claimed.

## Remaining limitations (honest summary)

1. Landmark/pagoda sculptural fidelity is stylised; the heads are recognisable mascots, not literal architectural sculpture.
2. Performance is measured only under software WebGL; target hardware FPS is unverified.
3. Baseline focus-view comparisons are incomplete because the legacy app did not implement focus URLs; baseline 05/08 are invalid.
4. Mobile is legible and touch-sized but crops some map edges in portrait.
5. Open park lawn and shared candidate avatars are deliberately simplified.
6. No Git repository means no commits, branch history, push, or deployment evidence.
