# White-oval root cause and district/candidate interaction verification

Date: 2026-11-09  
Repo: `/Users/seanchang/kaohsiung-2026-election` (Git history present; no commit made)  
Mission: m04751 — fix the white-oval flicker, verify district/candidate interactions, preserve all previously validated behavior.

> **Correction — 2026-11-10.** The app-side white oval was subsequently reproduced in a headed real-GPU browser and traced to a WebGL defect: district hover re-rendered `ActorLayer`, whose inline `instancedMesh` `args` recreated the 106-instance marker mesh. A new instanced mesh briefly draws all instances with identity matrices at the world origin, producing a white disk for 1–2 frames. This is an app defect and it has been fixed by keeping the marker geometry, material, and `args` tuple stable. The external-recorder explanation below is retained as historical analysis of the earlier supplied videos, but it is **not** the current root cause or conclusion. See `reports/hover-oval-report.md` and `reports/visual/hover-oval/`.

## Result summary

- **Confirmed and fixed one real app defect:** vertical mouse drags were using OrbitControls screen-space panning. The camera target moved below the ground plane on vertical drags; horizontal drags also changed Z unexpectedly. `screenSpacePanning={false}` now keeps panning on the world ground plane.
- **White-oval root cause (historical; superseded 2026-11-10): macOS screen-recording click highlight.** The supplied videos use macOS screen recording with **Show Mouse Clicks** enabled (the `screencapture -k` click-highlight mode). That recorder draws a large, soft, flat neutral-gray ellipse at each click. It is not produced by the app. A control recording made with the same click-highlight mode has the same 3024x1964, 120 fps, `ReplayKitRecording` signature as the supplied videos. The app did not reproduce the oval under SwiftShader or hardware Metal, and DOM/mesh scans found no matching element. No app change was made during that earlier investigation for the oval.
- **Browser mouse-event/DOM simulation (`m05942`):** 11 interaction steps (hover candidate tag, hover the map with the profile open, pan, wheel zoom, close/reopen profile, map click, switch 左營/楠梓) produced **no app-generated oval**, **no oversized neutral DOM element**, and at most a 243×1 px near-`#DEDEDE` component. Evidence: `reports/visual/white-oval/mouse-dom/`.
- **Frame 155 reviewed:** the current `~/Desktop/repro.mov` shows the same soft flat `#E0E0E0` recorder-style ellipse over the hero at 1.291667 s, but the exact app URL/state in headed Chromium and SwiftShader has no oval, and a DOM scan finds no large neutral element. The file at that path was replaced; current metadata is 8.373333 s / 483 frames, not the earlier 25.555 s recording.
- **HUD wording clarified without changing data meaning.** The top card now says `選舉區・CURRENT RACE` and explicitly labels the administrative area below it with `行政區：…`. The admin card and bottom dock remain `ADMIN DISTRICT` / `行政區`.
- **All previously validated behaviors are preserved:** candidate zoom and viewpoint restoration, constant avatar scale, hero streaming/hysteresis, explicit landmark ownership, demo-character removal, E03/E04 scene partition, 38 authoritative district polygons, and the shared site header.

## 1. White-oval evidence and root cause (historical; superseded 2026-11-10)

Two supplied recordings show the same artifact:

1. `/var/folders/0c/h8c1y10n1fs_xpx543p2zdyh0000gn/T/codex-file-preview-nVq82k/螢幕錄影 2026-11-09 晚上7.59.53.mov`
   - 3024x1964, H.264, 120 fps, 7.675 s, `com.apple.quicktime.author = ReplayKitRecording`.
   - URL: `http://localhost:4321/?district=kaohsiung-council-04&admin=E03&candidate=kaohsiung-council-04-16f09b7e`; selected candidate 陳冠宇.
   - The disk appears at approximately 4.70 s and 5.30 s and is gone by 5.80 s.
2. `~/Desktop/repro.mov` — current replacement; the user pointed to **frame 155**
   - 3024x1964, H.264, 120 fps, **8.373333 s, 483 frames**, `com.apple.quicktime.author = ReplayKitRecording`, creation time `2026-11-09T16:03:57Z`.
   - URL: `http://localhost:4321/?district=kaohsiung-council-04&admin=E03`; **no candidate**, admin 左營 open, profile closed.
   - Frame 155 is at **1.291667 s**. A soft-edged flat ellipse covers the hero/harbour area: connected-component bbox **`246x277+1694+856`** in the 3024x1964 frame, centroid **`1816.7,994.4`**, area **46,292 px**, centre sample **`#E0E0E0`**. The cursor remains near the pond, away from the disk centre.
   - This path previously held a **25.555 s / 1474-frame** recording. Its frames (`repro-6.70.png`, etc.) are historical and are not used as the current frame-155 metadata.

Measured disk appearance:

- First recording at 4.70 s: connected-component bbox `415x368+578+255` in the 1512x982 extracted frame (frame includes Chrome chrome and the macOS menu bar).
- Flat neutral colour, not an app palette colour: sampled `#dddddd` / `srgb(221,221,221)` in the first video. In the historical 25.555 s second-video crop `300x420+780+240`, the histogram contains 43,407 px `#DEDEDE`, 7,458 px `#DDDDDD`, and 2,579 px `#DBDBDB`.
- **Current frame 155:** a 246x277 px soft ellipse, area 46,292 px, sampled `#E0E0E0`; it is present without a selected candidate or open profile. This is not the candidate tag, selection ring, admin card, or scene geometry.
- **App reproduction at the same state:** headed Chromium / ANGLE Metal loaded exactly `http://localhost:4321/?district=kaohsiung-council-04&admin=E03` at 1512x982. The page showed the same admin focus with no candidate/profile; page screenshot `reports/visual/white-oval/app-admin-e03-current.png` had no oval and the DOM scan found **0 large neutral elements**. Camera settled at position `[19.491911, 27.527707, 26.345339]`, target `[-0.815414, 0, 1.976549]`, zoom `99.945583`. SwiftShader early frames at the same URL also showed no oval.

- Soft edge, no text, border, icon, or interaction affordance.
- The disk is screen-space and transient. It does not align with the candidate, a landmark, terrain, or any app geometry. The HUD and dark candidate tag remain readable through/over it, consistent with a translucent recorder overlay.
- App palette does not contain the sampled gray: stone is `#d6cdbd`, cream is `#fff7e8`, and the profile panel is `#fff9f0`. The app source contains no `#ddd`/`#dedede` overlay.

### Decisive recording evidence

- `screencapture -h` documents: `-k        show clicks in video recording mode`.
- `strings /usr/sbin/screencapture` contains `showMouseClicks`, `showClicksInVideo`, `updateMouseClicks`, `mclicks`, and `receivedMouseDown`.
- Control recording: `screencapture -v -k -V 4 /tmp/click-test.mov` produced **3024x1964, `r_frame_rate=120/1`, duration 4.011667 s, author `ReplayKitRecording`** — the same capture signature as the supplied videos.
- The videos contain Chrome browser chrome and ReplayKit metadata. The gray oval appears only in the recordings, never in the app under Playwright/SwiftShader or headed Apple Metal.

**Root cause:** the oval is the macOS screen recorder's click-highlight overlay. The `-k` (Show Mouse Clicks) setting enables it; without that setting the recorder does not add click highlights. This is an external recording artifact, not an app rendering or interaction defect.

Durable evidence:

- `reports/visual/white-oval/before-video-frame-4.70.png`
- `reports/visual/white-oval/after-video-frame-5.80.png`
- `reports/visual/white-oval/oval-timeline.png`
- `reports/visual/white-oval/repro-6.70.png` (historical previous recording)
- `reports/visual/white-oval/repro-frame-155.png`
- `reports/visual/white-oval/repro-frame-155-crop.png`
- `reports/visual/white-oval/app-admin-e03-current.png`
- `reports/visual/white-oval/app-admin-e03-early.png`
- `reports/visual/white-oval/manifest.json`

## 2. Reproduction attempts

All current-code attempts were made at 1512×900 unless noted.

| State | Renderer | Result |
| --- | --- | --- |
| Direct candidate URL, initial zoom 18 | Playwright Chromium / SwiftShader | No disk |
| `/?admin=E03`, select 陳冠宇, zoom 91.599822 | SwiftShader | No disk |
| Wheel zoom to 208.121499 | SwiftShader | No disk |
| Dragon-tiger focus, zoom 553.709856, then select candidate | SwiftShader | No disk |
| Direct candidate URL, headed browser | ANGLE Metal Renderer: Apple M1 Pro | No disk |
| Scene mesh scan at zoom 18 | Runtime `THREE.Scene` bridge (temporary, removed) | 264 visible meshes; no large ellipse; no `#dddddd` material |
| DOM scans at several zooms | Browser DOM | No large white element; only dock buttons, profile panel, vignette |
| **Desktop frame 155**, admin focus, no candidate | **screen recording** | Oval present; soft flat `#E0E0E0` ellipse |
| **Same URL**, headed Chromium / ANGLE Metal, 1512x982 | App | **No oval**; 0 large neutral DOM elements |
| **Same URL**, SwiftShader early frames | App | **No oval** |

### Browser mouse-event/DOM simulation

To answer the follow-up request to simulate the oval with mouse events while monitoring HTML changes, `reports/visual/white-oval/mouse-dom/oval-mouse-dom.mjs` drove the exact candidate URL at 1512×982 under Playwright Chromium/SwiftShader:

- 11 steps: initial profile open, hover the candidate tag, sweep 40 pointer positions over the map, drag-pan with the profile open, wheel zoom, close the profile, reopen it via search, click the map, switch to 楠梓, switch to 左營.
- A `MutationObserver` recorded added/removed nodes; every step had **zero large neutral DOM elements** (area ≥ 12,000 px). Hover, tag, pan and wheel produced **zero DOM mutations**; profile close/reopen and admin-card changes produced only cream `rgba(255,249,240,.95)` panels/search results, never `#DEDEDE`.
- A sharp pixel scan found 29–565 near-`#DEDEDE` pixels per screenshot, but the **largest connected component was 9–243 px**, typically a one-pixel-high UI line. No 300×400 px disk was present.
- The final run produced `results.json`, 10 screenshots (`screens/00-start-profile-open.png` … `09-switch-zuoying.png`) and `walkthrough.webm`. The first run failed on `video.saveAs` after the page closed; the script now writes results before closing and saves the video before the context closes. The initial-run extra screenshots are not authoritative.
- Playwright mouse events are browser/CDP-level, not OS-level; they cannot trigger the external macOS recorder click highlight. The result rules out an app DOM overlay and corroborates the recorder root cause. One pre-existing React lifecycle warning appeared in the console; it is unrelated.


Additional checks:

- No app CSS defines a `#dddddd` or 300–400 px white circle.
- No app geometry creates a large white circle/ellipse.
- Actor markers use `CircleGeometry` but are 106 instanced markers; at the relevant state the maximum marker scale was 0 because markers are hidden inside the hero.
- The selected avatar torus is coral and much smaller than the recorded disk.
- GLB animations `Idle`, `Selected`, `Greeting`, and `Walking` contain no white disk; `Selected` only scales the `Body` node from 1.0 to 1.08 and back over 0.72 s.
- The browser recording includes full Chrome chrome. Its ReplayKit signature matches a `screencapture` recording; the recorder's click-highlight overlay is the only known source that matches the flat gray disk. No browser extension produced a filled disk of this size (see section 7).

**Historical conclusion (superseded 2026-11-10):** no app-side reproduction was found in the earlier investigation. The verified app-side defect, root cause, fix, and before/after evidence are in `reports/hover-oval-report.md` and `reports/visual/hover-oval/`.

### How to remove it

1. In the macOS Screenshot toolbar, open **Options** and uncheck **Show Mouse Clicks**, then record again.
2. Or use the command line without `-k`:

   ```bash
   screencapture -v /tmp/clean-recording.mov
   ```

3. Use QuickTime or another recorder with click highlighting disabled.

A clean-profile recording is optional now; it is no longer needed to explain the oval. If a gray disk still appears with click highlighting explicitly disabled, send that recording and its timestamp for a new investigation.

## 3. Confirmed bug: vertical panning sank the camera target

### Root cause

`OrbitControls` defaults to `screenSpacePanning = true`. For an orthographic top-down/angled camera, a vertical drag moves the target in the screen plane rather than across the ground plane. During the baseline pan sweep, a 180 px upward drag produced:

- target `[-1.4846, -5.4299, 9.8433]` (below the terrain),
- `heroVisible = false` after most vertical drags.

### Fix

In `src/components/CityScene.tsx` the controls now include:

```tsx
// Pan across the world's ground plane; screen-space panning drives the
// orthographic target below the terrain on vertical drags.
screenSpacePanning={false}
```

### Controlled A/B evidence

The before set was captured by temporarily restoring `screenSpacePanning={true}`; the source was then restored to `false`. It is a controlled A/B, not a historical commit.

```
zoom 101.77757972927634 in both runs
before: target y -1.0530810157834365, camera y 26.474625897203772
after:  target y  0,                  camera y 27.52770691298721
```

- `reports/visual/district-pan/before/01-before-drag.png`
- `reports/visual/district-pan/before/02-after-drag.png`
- `reports/visual/district-pan/after/01-before-drag.png`
- `reports/visual/district-pan/after/02-after-drag.png`
- `reports/visual/district-pan/manifest.json`

The after screenshot shows the hero scene on the ground plane with the camera target at `y = 0`; the before screenshot shows the target below ground and the framing shifted.

### Regression test

`tests/e2e/refine-ux.spec.ts` now includes:

```
vertical mouse drag pans on the ground without sinking the target
```

It asserts:

- zoom is unchanged,
- target Y change is below 0.05 and target Y stays above −0.05,
- the target moves horizontally by more than 1 world unit,
- `heroVisible` remains true after a 120 px vertical drag.

The first version used a 180 px drag and failed only the hero-visibility assertion because the target moved outside the hero streaming hysteresis (visible below 3.45, hidden below 3.0). The test now uses 120 px so it verifies ground-plane panning without intentionally leaving the hero area.

## 4. HUD wording

`src/components/CityExplorer.tsx` now renders:

- kicker: `選舉區・CURRENT RACE`
- strong text: the selected electoral district, e.g. `高雄市議員第4選舉區`
- zone text: `行政區：左營 × 楠梓・高細節區` or `行政區：左營・藝術化量體`, depending on world mode

No candidate, district, electoral, or editorial data was changed. The bottom dock and admin card still use `行政區` / `ADMIN DISTRICT`, so the two concepts are now visually distinct.

A Playwright assertion was added in `tests/e2e/district-integrity.spec.ts`:

```
labels the electoral district and administrative district separately
```

## 5. Preservation checks

The following were verified through the existing and new tests:

- 106 official simulated actors; fictional demo characters remain excluded from production data, search, and routes.
- E03 scene shows only Zuoying-owned landmarks and geometry; E04 shows only Nanzih-owned landmarks and geometry; overview shows both.
- Landmark ownership remains explicit metadata, not an `x > 4` coordinate heuristic.
- No `.city-hover-card` exists; the retired hover oval markup and CSS remain removed.
- Candidate camera selection preserves zoom and pans to the actor; profile open does not reset the view; closing restores the saved view unless the user manually moved the camera.
- Avatar scale remains `0.07` for normal, selected, followed, and profile-open states.
- The 38 authoritative district polygons and shared site header are unchanged.

## 6. Gates

| Check | Result |
| --- | --- |
| `npm test` (Vitest) | 17 files, 133 tests passed |
| `npx playwright test` | 51 passed |
| `npm run typecheck` | 152 files, 0 errors/warnings/hints |
| `./node_modules/.bin/biome check src scripts tests playwright.config.ts` | 140 files, exit 0 |
| `npm run build` | 128 static pages built |

The plain `npm run lint` wrapper still exits with `ESLint output (JSON parse failed: EOF while parsing a value at line 1 column 0)`, a known local wrapper issue. The direct Biome invocation above is clean and is the lint evidence used here.

## 7. Screen-recording root cause

### What was tested

- `screencapture -h` reports `-k        show clicks in video recording mode`.
- A control clip recorded with `screencapture -v -k -V 4 /tmp/click-test.mov` has the identical capture signature as the supplied videos: 3024x1964, 120 fps, `ReplayKitRecording`.
- `strings /usr/sbin/screencapture` exposes `showMouseClicks`, `showClicksInVideo`, `updateMouseClicks`, `mclicks`, and `receivedMouseDown`.
- The oval is flat neutral `#DEDEDE/#DDDDDD`, not the warm app stone/cream palette, and it is absent from the app DOM, WebGL scene, actor markers, selection ring, avatar GLB animation, and CSS.

### Extension audit

The normal Chrome profile has Automatio 3.15.4, ChatGPT 1.26.901.11451, Responsive Viewer, JSON Formatter/JSONVue, React/Vue/Redux devtools, Elasticvue, TradingView, Google Finance, 模擬股市, 遊戲橘子, and internal extensions.

- Automatio's `clickEffect(t)` is a fixed div with a **transparent center and a `#6f6f6f` ring border**, `border-radius:50%`, 0.2 s animation, and `z-index:99999`; it is not a filled gray disk. Rejected.
- ChatGPT's `#codex-agent-overlay-root` is a closed-shadow-root overlay for a 24x24 cursor; its `#DEDEDE` references are a radar-chart graticule and a CSS border. Rejected.
- React/Vue devtools `#dedede` hits are panel/theme colors. No extension produced a 300x400 filled gray oval.

### Fix

This is a recording setting, not a site defect. In the macOS Screenshot toolbar choose **Options → uncheck Show Mouse Clicks**, or record with `screencapture -v` **without** `-k`. The app needs no oval-specific code change.

### What remains honest

The app fix in this report is the ground-plane panning correction; the HUD copy is also clarified. The white-oval artifact is external and is not claimed as fixed in app code. No physical-GPU FPS target is claimed.

## 8. Status

### Completed

- Identified the white oval as the macOS screen-recording click highlight; no app fix is required for it.
- Confirmed and fixed the ground-plane panning bug.
- Added a regression test for vertical mouse panning and hero visibility.
- Clarified electoral-district vs administrative-district HUD wording.
- Added a Playwright assertion for the wording.
- Preserved the previous district-integrity, candidate-camera, avatar-scale, and scene-partition behavior.
- Updated durable recording evidence and the manifest with the root cause.
- Performed the requested browser mouse-event/DOM simulation; no app-generated oval or oversized neutral DOM node was found.
- Examined current `repro.mov` frame 155 and reproduced the exact app URL/state in headed Metal and SwiftShader; no app oval was present.

### Partial / unresolved

- The white oval is external to the app; there is no unresolved app-side oval defect to fix.
- No fixed hardware-GPU FPS claim is made.

### Not claimed

- The app is not claimed to have fixed an app-rendered white oval; the oval is a recorder overlay.
- No commit was made.
- No OpenSpec change was requested for this follow-up and none was added.


## 9. Supersession — 2026-11-10

The white oval was subsequently reproduced in the actual app during an administrative-district hover and found to be a rendering defect in `src/components/ActorLayer.tsx`. The actor marker `<instancedMesh>` recreated its geometry, material, and `args` on parent re-render; a newly created instanced mesh briefly renders all 106 instances with identity matrices at the world origin. The marker material is white with `depthTest: false` and `renderOrder: 4`, so that cluster appeared as a white disk for 1–2 frames.

The fix keeps the marker geometry, material, and memoized `args` tuple stable. A seven-scenario Playwright regression test and before/after frames are in `reports/hover-oval-report.md` and `reports/visual/hover-oval/`. The external-recorder analysis in sections 1–8 remains historical and must not be read as the current root cause. The ground-plane panning fix and HUD wording changes documented above remain valid.
