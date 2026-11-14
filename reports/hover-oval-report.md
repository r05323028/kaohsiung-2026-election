# Hover white-oval fix — verified app-side root cause

Date: 2026-11-10  
Repo: `/Users/seanchang/kaohsiung-2026-election` (Git history present; no commit made)  
Mission: m06099 — reproduce and fix the transient white oval that flashes when the cursor enters an administrative district in the 港都人物誌 3D explorer.

## Result

**Fixed.** The oval was an app-side WebGL artifact, not a screen-recorder overlay. It was caused by `ActorLayer` recreating its 106-instance marker mesh on every district hover. A new `InstancedMesh` briefly renders all instances with identity matrices at the world origin; because the marker material is white, uses `depthTest:false`, and has `renderOrder=4`, those overlapping unit circles appeared as a soft white disk above the map and below the DOM HUD for 1–2 frames.

The fix keeps the marker geometry, material, and `args` tuple stable across React renders. The mesh is no longer recreated by hover, selection, camera, or other parent re-renders.

## 1. Actual reproduction

The artifact was reproduced in a headed Chromium run with the real GPU on Apple M1 Pro, at 1512×982:

1. Open `/?debug=boundaries&admin=E03`; collect the 38 `.world-debug-label` centers.
2. Open `/?admin=E03`; wait for the camera to settle at position `[19.491911000000005, 27.527707, 26.345339]`, target `[-0.815414, 0, 1.976549]`, zoom `99.945583`.
3. Move the pointer to the E01·鹽埕 debug-label center `(284.00732421875, 772.5579833984375)`.
4. A large soft white/neutral oval appears for about two rendered frames, then disappears.

Evidence:

- Clean frame before hover: `reports/visual/hover-oval/before/01-clean-frame-49.jpg`
- Oval frame: `reports/visual/hover-oval/before/02-oval-frame-51.jpg`
- Clean frame after the transient: `reports/visual/hover-oval/before/03-clean-frame-53.jpg`
- Disk bbox in the 1512×982 frame: `872,342 145×165`; centroid `944.9,425.8`; sample at `(945,426)` is `rgb(227,227,227)` / `#E3E3E3`.
- The oval is inside the WebGL canvas. `document.elementsFromPoint(950,420)` returned the canvas first, with transparent wrappers and the page shell below; there is no large white DOM element at that point.

The previous report attributed the oval to the macOS screen-recording click highlight. That conclusion is **superseded**. The recorder evidence remains valid for the earlier supplied videos, but the current app-side reproduction identifies a real rendering defect and gives a controlled before/after.

## 2. Hover lifecycle and root cause

### Trigger path

1. `src/components/WorldLayer.tsx` renders each district mesh with `onPointerOver` and `onPointerOut`; entering a district calls `onHoverAdmin(district.id)`.
2. `src/components/CityExplorer.tsx` stores that value in `hoveredAdminId`.
3. The state change re-renders `CityWorld` and therefore `ActorLayer`.
4. `src/components/ActorLayer.tsx` previously rendered:

```tsx
<instancedMesh
  ref={markerRef}
  args={[
    new THREE.CircleGeometry(1, 24),
    new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
    }),
    actors.length,
  ]}
  renderOrder={4}
/>
```

The geometry, material, and `args` array were recreated on every render. React Three Fiber treats a changed `args` value as a new `InstancedMesh` and reconstructs it.

### Why the disk appears

A new `InstancedMesh` initializes its instance matrix buffer to identity transforms for all `count` instances. Before `useLayoutEffect` uploads the real 106 actor matrices, every instance is a unit circle at the origin. The marker material is white, `depthTest` is disabled, and `renderOrder` is 4, so the overlapping circles draw over the district terrain but below the DOM HUD. The real matrices arrive in the post-render layout effect, so the condition lasts only 1–2 rendered frames.

This explains the observed locality, color, soft edge, and transient lifetime. It also explains why it appeared on hover and not on most camera-only interactions: hover is a frequent parent re-render path.

### Controlled A/B

A temporary test-only bridge exposed `markerRef.current.uuid` and `count`:

| Code | Before hover UUID | After hover UUID | Result |
| --- | --- | --- | --- |
| Original inline `args` | `9c852588-bc46-4afa-952a-de9db12da408` | `74738624-9e62-4af2-8824-25f87b2e48b6` | mesh recreated |
| Stable args | `de00d32f-08a3-4d44-a774-faa434f09ae4` | `de00d32f-08a3-4d44-a774-faa434f09ae4` | mesh preserved |

The old code produced the `#E3E3E3` oval in frame 51. The fixed code produced beige map pixels at the same point in frames 10–15 of the after capture.

## 3. Fix

File: `src/components/ActorLayer.tsx`

- Lines 27–38: module-level stable `markerGeometry` and `markerMaterial`.
- Lines 67–75: `markerArgs` is memoized by `actors.length`, so its tuple identity is stable across hover/selection renders.
- Lines 272–275: the instanced mesh uses `args={markerArgs}`.

The fix is structural, not a visual mask:

- No global pointer handler was disabled.
- No hover delay was added.
- No CSS overlay was added or removed to hide the artifact.
- District hover feedback and the pointer cursor remain.
- Landmark hover lift and selection remain.
- District selection, camera navigation, map panning, wheel zoom, and mobile touch remain unchanged.
- The marker mesh is initialized once with its intended geometry/material before the first hover frame.

The only new hook is `window.__kaohsiungActorMarker`, a test-only read of the marker UUID and count. It is deleted when `ActorLayer` unmounts.

## 4. Regression coverage

Added to `tests/e2e/district-integrity.spec.ts`:

1. `does not recreate the actor marker mesh when a district is hovered` — opens the boundary-debug view, hovers E01, polls for the pointer cursor, and asserts the marker UUID is unchanged and count is 106.
2. `keeps actor markers stable across the district hover lifecycle` — covers all seven requested scenarios in one real-browser test:
   - repeated district enter/leave,
   - rapid movement between adjacent districts,
   - buildings and bare district ground,
   - hover across a polygon boundary,
   - hover after manual pan and wheel zoom,
   - switch overview / 左營 / 楠梓 without a reload,
   - select a candidate and close the profile.

Each stage asserts the same `InstancedMesh` UUID and a count of 106. The test fails on the old inline-args implementation and passes on the fixed implementation.

Targeted run:

```text
npx playwright test tests/e2e/district-integrity.spec.ts --project=chromium -g "keeps actor markers stable" --reporter=line
PASS (1) FAIL (0), 35.8s
```

## 5. Before/after evidence

Durable files:

- `reports/visual/hover-oval/before/01-clean-frame-49.jpg`
- `reports/visual/hover-oval/before/02-oval-frame-51.jpg`
- `reports/visual/hover-oval/before/02-oval-frame-51-crop.jpg`
- `reports/visual/hover-oval/before/03-clean-frame-53.jpg`
- `reports/visual/hover-oval/after/01-fixed-e01-hover.jpg`
- `reports/visual/hover-oval/after/01-fixed-e01-hover-crop.jpg`
- `reports/visual/hover-oval/after/frame-0010.jpg` through `frame-0015.jpg`
- `reports/visual/hover-oval/before-after-crops.jpg`
- `reports/visual/hover-oval/manifest.json`

The before crop shows the flat neutral disk. The after crop and all six neighboring after frames sample a beige map surface `rgb(214,202,180)` at the former disk center. No white oval appears in the after capture.

## 6. Preservation audit

The following previously validated behavior remains covered by the existing suite and the new test:

- 38 authoritative district polygons; grid-free official geometry.
- E03/E04 scene partition and explicit landmark ownership.
- 106 production actors; demo records excluded from production search and simulation.
- Candidate camera preserves zoom and pans to the actor; profile open does not reset scale; close restores the pre-selection view unless the user has manually moved the camera.
- Avatar scale is constant at `0.07` for selected, followed, and profile-open states.
- Hero streaming and hysteresis remain; outside-hero mayoral focus shows geographic massing rather than a blank stage.
- District hover, selection, pointer cursor, landmark hover lift, map drag, wheel zoom, and mobile touch remain functional.
- Shared 港都人物誌 header and navigation remain unchanged.
- HUD wording distinguishes `選舉區・CURRENT RACE` from `行政區：…`.

## 7. Gates

- `npm test`: 20 files, 153 tests passed.
- `npx playwright test`: 58 passed (9.2m).
- `npm run typecheck`: 165 files, 0 errors, 0 warnings, 0 hints.
- `npm run build`: 128 pages built; validators and typecheck passed.
- `./node_modules/.bin/biome check src tests playwright.config.ts`: exit 0; informational suggestions only.
- Targeted seven-scenario test: 1 passed, 35.8s.
- The plain `npm run lint` wrapper still exits 1 with `ESLint output (JSON parse failed: EOF while parsing a value at line 1 column 0)`; direct Biome is clean.

## 8. Limitations

- The automated regression asserts the structural invariant (same InstancedMesh UUID and count). The before/after pixel evidence is from a CDP screencast; there is no per-frame production telemetry.
- The capture used headed Chromium with ANGLE Metal on an Apple M1 Pro. This is a visual reproduction, not a hardware-FPS benchmark.
- The test-only marker hook is intentionally retained for the regression test; it is not used by production rendering.
- The repository has not been committed. All mission changes and evidence remain uncommitted.
- The earlier `reports/white-oval-report.md` is now marked as superseded for the app-side root cause; its recording metadata and panning/HUD findings remain historical evidence.
