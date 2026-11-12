# Hero landmark rebuild — verification report

Worktree: `/Users/seanchang/kaohsiung-2026-election.refine-landmarks`
Files changed: `src/components/HeroLandmarks.tsx`, `src/components/hero-geometry.ts`
New test: `src/components/hero-geometry.test.ts` (13 tests)
Capture scripts: `scripts/capture-landmark-views.ts` (inspector, 4 views/landmark), `scripts/capture-hero-city.ts` (city zoom per admin district)

## Method

1. Audited all seven dedicated hero compositions in `HeroLandmarks.tsx` against real photographs (HSR Zuoying, World Games Stadium, Dragon & Tiger Pagodas / Lotus Pond, Weiwuying, Pier-2, Dream Mall, 85 Sky Tower) — silhouette and structural relationships first, decoration last.
2. Rebuilt every landmark from shared parametric primitives (`G` table) and new authored geometry helpers in `hero-geometry.ts` (radial shell with holes, curved curtain wall, flared crown, gable roof, strut rings, box clusters).
3. Captured before/after screenshots from the same isometric camera and from four orbit views, plus city-zoom shots per district, and iterated on the renders until the geometry read correctly.

All hero geometry is generated once at module scope, shares one material palette (`HERO_MAT`) and one geometry table (`G`), and is never rebuilt per frame — no per-frame allocation, no new dependency, no runtime asset download.

## Geometric defects corrected

### 85 Sky Tower (85 大樓)
- Before: squat tapered prism (aspect ~3:1) with a chopped crown; chevron bands spanned the full width and filled the slot; maroon fins sat buried inside the octagon and rendered as a dashed zipper; crown read as a mushroom cap.
- After: twin octagonal legs (x ±0.072) with a real open slot and dark service core, 9 slab bands per leg, 8 continuous vertical mullions standing proud of the bands, transfer slab, single upper shaft of the same width, flared notched crown, antenna mast and aviation light. Overall aspect ≈7.6:1, matching the real tower.

### Weiwuying (衛武營)
- Before: featureless flat plate swallowing the glass drum; the two courtyards were teal stickers floating on the roof; columns started inside the drum so none were visible; box deck narrower than the column ring so the outer columns floated.
- After: `makeRadialShellGeometry` accepts a `holeAt` predicate and skips both shell surfaces inside the two courtyard rectangles, giving genuinely recessed courtyards with a floor that sits below the shell (min-sampled height); a 12 + 6 column ring now runs from the podium deck (y 0.1) to the roof underside; the deck is a cylinder so the elliptical column ring always lands on it; a darker perimeter fascia tube gives the shell a crisp edge.

### Dream Mall (夢時代)
- Before: an oversized cream mass poked in front of the curved glass, so the facade was invisible; the whale logo was a sticker; the entrance canopy floated on hairline columns.
- After: the cream mass was pushed back so the curved curtain wall stands proud; the curtain wall winding was fixed (normals were reversed and the whole facade was back-face culled); mullions, fascia and whale plaque follow the same curvature (`MALL_FACADE_SQUASH`); the canopy is a real slab on two columns. Ferris wheel sits on a roof deck.

### Ferris wheel (Dream Mall roof)
- Before: disconnected rim/spokes/cabins, flat flag-like cabins.
- After: one parent group; rim, inner rim, hub, spokes and A-frame legs in one coordinate system; 12 cabins placed by `angle = i / count * 2π` on the rim radius; each cabin hangs from a pin under its own group, with body, roof, floor, glass band and hanger; cabins are counter-rotated so they stay upright while the wheel turns; muted four-colour palette.

### World Games Stadium (世運主場館)
- Before: field and track discs were sized as diameters although `G.disc` is a unit-radius cylinder, so both overlapped the first seat ring and burst through the bowl wall as blue/green bands; canopy was a flat disc on nine floating columns.
- After: field/track/lane-ring rescaled to radii, bowl, seat rings, spiral horseshoe canopy with increasing lift, truss legs that meet the bowl rim, floodlights and sign gantry attached to the bowl.

### HSR Zuoying (高鐵左營站)
- Before: barrel-vault tube floating over the hall, intersecting teal glass, no thickness or supports.
- After: flat cantilevered roof on splayed V struts over a colonnade, glazed hall with real wall thickness, platform canopy, rails, train, kiosk and the dark signage band inset so it no longer reads as a wedge.

### Dragon & Tiger Pagodas (龍虎塔)
- Before: five tiers, alternating teal/red roof plates with gaps; beast heads detached at the bridge ends; bridges were four disconnected planks that never met the mouths; shore slab floated.
- After: seven tiers with red-orange tiled eaves, upturned corners and visible roof thickness, cream walls, red columns and balconies, gold finial, red-pillared base over the water; beast heads sit at the tower base facing the zigzag bridge; six deck segments plus posts per side reach the mouths; a continuous stone shore slab with cream coping.

### Pier-2 (駁二)
- Before: gabled warehouses plus a floating orange sphere and gold torus on a post.
- After: low brick/concrete warehouses with correct ridge direction, steel windows, rail track, crate stack and rooftop sign frame; the unexplained floating ornaments are gone.

## Screenshots

- `reports/visual/landmarks/before/<landmark>-<view>.png` — 28 baseline shots (pre-rewrite).
- `reports/visual/landmarks/after/<landmark>-<view>.png` — 28 matching shots, same camera, same 1214×559 canvas.
- `reports/visual/landmarks/after-city/{E03,E08,E09,E12}-*.png` — 1600×1000 city-zoom shots at real explorer zoom (`?admin=<district>`), used to check scale against neighbouring buildings and recognisability at normal zoom.
- Views per landmark: three-quarter (default isometric), front, side, top.

## Performance

- Hero mesh instances: 122 `<HeroPart>` draw calls for all seven landmarks (was 156) — 22% fewer meshes for more detail, because repeated parts are merged into single box/strut cluster geometries (`makeBoxClusterGeometry`, `makeStrutGeometry`, `makeRadialShellGeometry`).
- One shared material palette (`HERO_MAT`, ~40 materials total, each created once at module scope) and one shared geometry table, so instanced parts share GPU buffers and three.js can batch state changes.
- All new geometry is authored once at import time; nothing is rebuilt per frame, so the Ferris wheel rotation (a single group rotation) and cabin counter-rotation add no allocation and no stutter.
- No new runtime assets or dependencies: the build stays a fully static Astro site; no GLB download, so no new network waterfall and no LOD switching cost. Detail is controlled per landmark by geometry resolution (e.g. roof shell 88 segments × 16 rings, curved facade 24 segments).
- Reduced-motion is respected by the existing explorer animation gate (captures were taken with `reducedMotion: 'reduce'` and the wheel still renders in its static pose).

## Test results

- `npm run typecheck` (astro check): 0 errors, 0 warnings, 0 hints (225 files).
- `npx vitest run src/components/hero-geometry.test.ts`: 13/13 pass (roof height fields, stadium canopy lift ordering, shell hole clipping, crown/notch bounds, curved facade normals, strut ring continuity).
- `npx astro build`: 126 pages built, complete.
- `npx playwright test tests/e2e/city-experience.spec.ts`: 4/4 pass.
- `npx playwright test tests/e2e/unified-world.spec.ts`: 5/5 pass (including "every one of the 38 administrative districts can be focused") when run against a stable dev server; earlier failures in the same file were `ERR_CONNECTION_REFUSED` because the Playwright-managed dev server died mid-run under SwiftShader, not geometry regressions.
