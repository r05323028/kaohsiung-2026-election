# Candidate focus and architectural scale report

**Mission:** fix mayoral whiteout, selected-avatar enlargement, and flat hero architecture without changing geography, NPC behavior, electoral data, or site navigation.

**Repository:** `/Users/seanchang/kaohsiung-2026-election`. The directory **is a Git repository** with existing history (initial commit `d3d8c3e`, then `211883e`). This task did not initialize it and did not commit; all mission changes remain uncommitted.

**Date:** 2026-11-09.

## 1. Root causes

### A. Mayoral selection blanked the world

The candidate camera used a role-based focus radius:

```ts
const followRadius =
  scope.kind === 'mayoral' || scope.kind === 'indigenous' ? 8.4 : 1.8;
```

`CityWorld` then gated the hero scene with:

```ts
const heroVisible = heroVisibleForFocus(focus.radius) && heroDistance < 3.2;
```

`heroVisibleForFocus` returns true only up to 6.5 km. A mayoral candidate therefore disabled the hero even while standing in 左營. `WorldLayer` skips low-detail massing inside `inHero(x,z)`, so the hero was the only geometry in that area. The camera preserved zoom and panned correctly, but the result was a nearly empty beige polygon.

Confirmed with 洪方隆 (`hong-fang-long-2026`) at E03: zoom stayed `101.77758`, yet the hero disappeared and the district was blank.

### B. Selected and hovered avatars grew

Two independent scale multipliers stacked:

- `ActorLayer`: selected wrapper scale `ACTOR_AVATAR_SCALE * 1.7`.
- `CharacterAvatar`: outer scale `selected ? 1.14 : hovered ? 1.07 : 1`.

Combined selected scale was `0.07 × 1.7 × 1.14 = 0.13566`, about **1.94×** normal. The person appeared to grow when selected rather than remain a stable city inhabitant.

### C. Hero architecture was vertically compressed and viewed too steeply

The hero group used `HERO_KM_PER_UNIT = 0.18` horizontally and `HERO_HEIGHT_SCALE = 0.07` vertically. Vertical scale was only **0.389** of horizontal. Building generators already author plausible floor heights (`shophouse 0.56`, `apartment 0.52`, `tower 0.50`, podium `0.62`), so the flattening came from the shared transform, not from the generators.

District focus used `[0.78, 1.55, 0.95]`; elevation was `atan(1.55 / sqrt(0.78² + 0.95²)) ≈ 51.6°`. That angle showed mostly roofs and made side facades hard to read.

## 2. Implementation

### Scene streaming and camera

`src/components/CityScene.tsx`
- Hero visibility is state derived from geographic targets: the focus destination on focus changes, the followed actor each frame, and the OrbitControls target only after a manual canvas pointer-down. It never depends on candidate role.
- Hysteresis (3.45 when visible, 3.0 when hidden) prevents flicker at the hero boundary.
- Added `heroVisibleRef` and `window.__kaohsiungWorld.heroVisible()` for automated evidence.
- Candidate focus keeps `camera.zoom` clamped to `[3.2, 760]`, computes direction from the current camera to target, and places the camera at actor target + direction × 42. This is a pan, not a rescale.
- Profile open/close does not change the focus key or zoom.
- Close restores the exact saved position/target/zoom only when the user has not manually panned or zoomed; otherwise it leaves the user's viewpoint.
- OrbitControls start cancels an active GSAP tween. Drag and wheel remain available during and after transitions.
- Follow moves camera and orbit target by the same delta with `1 - Math.exp(-5.5 × min(delta, 0.1))`; look-ahead is 0.22 along the walking heading.

`src/components/CityExplorer.tsx`
- Candidate `followRadius` is now a role-independent `4.0`. It sizes the marker/ring only.

### Avatar scale

`src/components/ActorLayer.tsx`
- Selected and normal avatars both use `ACTOR_AVATAR_SCALE = 0.07`.
- Added `window.__kaohsiungActorScale(slug)` for measurement.

`src/components/CharacterAvatar.tsx`
- Removed selected and hovered scale multipliers and the hover state.
- Retained the selection ring, name tag, walking gait, and selected idle animation.

### Architectural proportion

`src/world/hero.ts`
- `HERO_HEIGHT_SCALE = 0.085`; vertical/horizontal ratio `0.472` (old `0.389`; original `0.035` gave `0.194`).

`src/world/district-geometry.ts`
- Focus direction `[0.9, 1.22, 1.08]`; elevation ≈ `40.9°` (old ≈ `51.6°`).
- Target point, radius, orthographic projection, and polygon geometry unchanged.

Representative massing, measured from authored floor heights and footprints:

| Building | Local body | Width | After 0.085 | Old 0.07 |
| --- | --- | --- | --- | --- |
| 3-storey shophouse | 3 × 0.56 = 1.68 | 1.05 | 0.76 | 0.65 |
| 3-storey shophouse | 1.68 | 1.00 | 0.79 | 0.65 |
| 6-storey apartment | 6 × 0.52 = 3.12 | 2.30 | 0.64 | 0.53 |
| 11-storey tower shaft | 11 × 0.50 = 5.50 | 1.80 | 1.44 | 1.19 |
| 11-storey tower + podium | 6.12 | 1.80 | 1.61 | 1.33 |

The shop remains low and wide, the apartment reads as a mid-rise block, and the tower reads as a tower. No individual landmark received an ad-hoc multiplier. Horizontal footprints, navigation, and world coordinates are unchanged.

## 3. Camera contract results

| State | Result |
| --- | --- |
| Citywide overview | zoom `10.482337`, position `[50.000585, 33.951916, -12.888059]` |
| 左營 focus | zoom `101.77758`, position `[19.491911, 27.527707, 26.345339]`, target `[-0.815414, 0, 1.976549]` |
| 楠梓 focus | zoom `73.117388`, position `[20.131662, 27.527707, 21.611836]` |
| Mayor 洪方隆 selected in hero | zoom `101.77758` preserved; hero true; mayor/council/normal scales `0.07` |
| Profile open | zoom unchanged |
| Close without manual input | exact previous position/target/zoom restored |
| Mayor 賴瑞隆 outside hero (E19) | zoom `101.77758` preserved; hero false; district fill and massing visible; target near actor |
| Citywide candidate 張靜 | zoom `10.482337` preserved; hero true |
| Mouse drag | pure pan; camera-target offset unchanged; no rotation |
| Wheel | `101.77758 → 107.134295` |
| Mobile citywide | zoom `72.55814` |
| Mobile mayor | zoom `42.868717`; hero true; scale `0.07` |

The old behavior for the same 左營 → mayor flow was a blank beige district at the same zoom. The new view keeps the hero, the pond, streets, buildings, and the mayor's tag.

## 4. Before/after evidence

### Before

`reports/visual/candidate-scale/before/` — 7 PNG and `manifest.json`. Captured with a temporary legacy build: height `0.07`, focus offset `[0.78, 1.55, 0.95]`, wrapper `0.07 × 1.7`, character `1.14`, and a temporary `?legacy-hide-hero=1`. The final source was restored before any gate ran; no legacy code remains.

- `06-mayor-in-hero.png`: blank beige authoritative district at zoom `101.77758`, no hero. This is the reported whiteout.
- `07-selected-avatar-close.png`: measured wrapper scale `0.119` (then `1.14` inner), about `1.938×` normal.
- `02-zuoying.png`, `05-zuoying-old-street.png`: higher pitch and flatter massing.

### After

`reports/visual/candidate-scale/after/` — 11 PNG, `manifest.json`, and two WebM. SwiftShader, 1600×1000 desktop and 390×844 mobile.

- `01-citywide.png` — citywide, unchanged scale.
- `02-zuoying.png` — hero visible, new height and pitch.
- `03-nanzih.png` — 楠梓 landmarks and river.
- `04-dragon-tiger-pagodas.png` — 600 zoom, pagoda side faces and roofs.
- `05-zuoying-old-street.png` — 430.663221 zoom, low-rise street volume.
- `06-mayor-in-hero.png` — mayor selected, hero visible, zoom preserved, profile open.
- `07-selected-avatar-close.png` — zoom 474.180796, wrapper scale 0.07, ring only.
- `08-mayor-outside-hero.png` — E19 after 7,200 s, authoritative district and massing, no whiteout.
- `09-citywide-candidate.png` — citywide zoom 10.482337 preserved, centered on actor.
- `10-mobile-citywide.png`, `11-mobile-mayor-focus.png` — mobile scale preservation.
- `walkthrough-desktop.webm` — VP9, 1600×1000, 25 fps, 97.84 s, 43,874,179 bytes. Citywide drag, 左營, manual pan away/back with hero streaming, mayor selection, profile, close, old street, pagodas, outside-hero mayor.
- `walkthrough-mobile.webm` — VP9, 390×844, 17.52 s, 1,905,440 bytes. Mobile mayor selection.

Screenshots and videos were inspected. The whiteout is gone; selected avatars no longer grow; the pagodas and old street now show side facades and roof profiles. The hero remains a stylized miniature, not survey-accurate architecture.

## 5. Automated verification

- `npm test`: **16 files, 123 tests passed**.
- `npx playwright test`: **45 passed, 0 failed** (~332 s).
- `npm run typecheck`: **147 files, 0 errors, 0 warnings, 0 hints**.
- Direct `./node_modules/.bin/biome check src scripts tests playwright.config.ts`: **135 files, exit 0**.
- Plain `npm run lint` still exits 1 with the local wrapper message `ESLint output (JSON parse failed: EOF while parsing a value at line 1 column 0)`; the configured Biome check above is clean.
- `npm run build`: **exit 0, 134 static pages**.
- OpenSpec `fix-candidate-focus-and-architectural-scale`: **strict valid** with pinned `@fission-ai/openspec@1.14.1`.

New browser coverage in `tests/e2e/refine-ux.spec.ts` (10 tests total, 4 added):
1. Mayor selected from 左營 keeps zoom, hero scene, and profile.
2. Selected/followed/profile-open avatars all measure `0.07`.
3. A manual drag away from the hero streams the dense scene out; dragging back restores it.
4. Mayor outside hero after 7,200 s keeps zoom, reports `heroVisible() === false`, and targets the actor.

The full browser run initially found a smoke-test failure: the profile tab was clicked before ProfileTabs hydrated. The test now waits for `data-hydrated="true"` after locating `profile-tabs` (five places). The product behavior was correct; the test was racing hydration. No assertion was weakened. A later full run also caught the mouse-drag test reading a still-running camera tween under SwiftShader; that test now calls the existing camera-settle helper before measuring. The product camera code did not change.

## 6. Performance

`reports/performance/candidate-scale.json` — Apple M1 Pro, headless Chromium, ANGLE Vulkan **SwiftShader** (software rendering), five samples per profile.

| Scenario | Viewport | Avg / low FPS | Draw calls | Triangles | Geometries |
| --- | --- | --- | --- | --- | --- |
| World overview | 1600×1000 | 8.1 / 7.0 | 106 | 47,888 | 68 |
| World overview | 390×844 | 19.1 / 18.3 | 106 | 47,888 | 68 |
| Hero 左營–楠梓 | 1600×1000 | 3.4 / 2.7 | 617 | 405,486 | 345 |
| Hero 左營–楠梓 | 390×844 | 6.8 / 6.1 | 595 | 324,029 | 336 |

The prior refine measurement was 106 calls / 47,888 triangles citywide and 617 calls / 405,486 triangles in the hero. The architecture and avatar changes did not add geometry; call/triangle counts are unchanged.

**These are software-renderer numbers.** They are not evidence of hardware-GPU performance, and no 60 FPS desktop or 30 FPS mobile target is claimed. The hero remains draw-call heavy (617 calls from many unique landmark meshes).

## 7. Completion status

### Completed

- Mayoral selection no longer hides the hero when the candidate is inside 左營/楠梓.
- Candidate focus preserves zoom and pans to the actor for council, mayoral, and indigenous candidates.
- Role no longer selects a camera radius or scene-streaming policy.
- Profile open/close does not change camera scale; close restores the pre-selection view unless the user took manual control.
- Outside-hero mayors remain visible within authoritative district geography and low-detail massing.
- Avatar scale is constant at `0.07` across normal, selected, followed, and profile-open states.
- Manual panning away from the hero streams the dense scene out; panning back restores it, with hysteresis at the boundary.
- Hero height scale is documented and measured; representative massing ratios improved from 0.65/0.53/1.19 to 0.79/0.64/1.44.
- District focus pitch lowered from ~51.6° to ~40.9° with the same target, radius, and orthographic projection.
- All 38 polygons, NPC routes, electoral permissions, actor identities, and shared header remain valid.
- Before/after screenshots, manifests, desktop/mobile videos, tests, performance, and OpenSpec are in place.

### Partial or unverified

- The architectural improvement targets the 左營–楠梓 hero. Low-detail massing in the other 36 districts remains schematic and was not re-proportioned.
- The hero is a stylized miniature. Height ratios are plausible for the art direction, not measured from real building surveys.
- The candidate-scale screenshots were captured before the final manual-pan streaming refinement. They remain valid for candidate focus, zoom preservation, avatar scale, architecture, and outside-hero geography, which did not change. The re-recorded desktop walkthrough and the Playwright test cover manual-pan streaming.
- Hero streaming is a discrete visibility switch at the 3.0/3.45 boundary. Hysteresis prevents flicker, but there is no cross-fade.
- SwiftShader cannot establish hardware frame rate. Physical-GPU profiling remains unverified.
- The citywide pedestrian network outside the validated 左營–楠梓 routes remains schematic; this change did not expand it.
- The repository has existing Git history, but this task produced no commit. The mission changes are uncommitted working-tree changes.

## 8. Files changed

- `src/components/CityScene.tsx` — geographic hero visibility, bridge `heroVisible`, preserved-scale candidate camera.
- `src/components/CityExplorer.tsx` — role-independent candidate radius.
- `src/components/ActorLayer.tsx` — constant avatar scale, measurement hook.
- `src/components/CharacterAvatar.tsx` — removed selection/hover scale.
- `src/world/hero.ts` — `HERO_HEIGHT_SCALE = 0.085`.
- `src/world/district-geometry.ts` — focus direction `[0.9, 1.22, 1.08]`.
- `tests/e2e/refine-ux.spec.ts` — 4 new scenarios, 10 total.
- `tests/e2e/smoke.spec.ts` — hydration wait for profile tabs.
- `scripts/capture-candidate-scale.ts`, `scripts/record-candidate-scale-walkthrough.ts` — repeatable evidence.
- `openspec/changes/fix-candidate-focus-and-architectural-scale/` — proposal, design, tasks, five specs.
