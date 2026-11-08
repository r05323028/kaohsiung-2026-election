# Targeted review — final mobile touch-target and district-tray fixes

Reviewer: independent, read-only. No source file was modified.
Date: 2026-11-08
Scope: the fix batch that followed BLOCK `del_mw6r4un0_h3ev` (profile close/tabs, settings
close/quality/reduced-motion/reset, search clear, landmark return, and the mobile
district-tray auto-scroll regression).
App: dev server `http://127.0.0.1:4321` (already running), Chromium `mobile-chromium`
(Pixel 7 device profile, `isMobile`/`hasTouch`).

## Verdict

**PASS at the stated 390×844 acceptance viewport.** Every previously blocking P1 is resolved
and independently re-measured from rendered layout. The district-tray regression is gone in
both the programmatic path and the remount path (`scrollTop === 0`, tray head fully inside the
viewport, no horizontal overflow).

**One new P1 of the same class is open at narrower widths:** the district-tray election tab
`全部` measures 43.5×44 at 360×640 and 35.5×44 at 320×568, because the mobile rule only sets
`min-height` on `.city-tray .city-tabs button` while the base rule sets `min-width: 0` with
`flex: 1 1 auto`. 360 dp is a very common Android width and `html { min-width: 320px }`
declares that width supported, so **if the bar is "≥44 px at every supported mobile width"
rather than "at 390×844", this review is BLOCK.** No other essential target falls below 44 px
at any width tested (320/360/375/390).

## Method

Two independent evidence paths, neither relying on the repository's own test:

1. Ran the committed suite: `npx playwright test tests/e2e/mobile.spec.ts --reporter=line`
   (3 passed) and the full `npx playwright test --reporter=line` (21 passed / 30.7 s).
2. Wrote throwaway Playwright scripts (outside the repo) that drive the real dev server at
   390×844, 375×667, 360×640 and 320×568 and, for every control, record
   `getBoundingClientRect()`, the rect intersected with every `overflow`-clipping ancestor,
   `document.elementFromPoint()` hit tests at the centre and four inset corners, viewport
   containment, `scrollWidth` vs `clientWidth` of the control's scroll container, and
   `documentElement.scrollWidth` vs `innerWidth` for page overflow. The Astro dev toolbar
   (`astro-dev-toolbar`) was removed in every run, as the committed test does.

## P1 findings

### P1-1 (RESOLVED) — profile panel close and all six tabs ≥44×44, wrapped, not clipped
Measured at 390×844 with the panel open (`.profile-panel.is-open`):

| control | rect | notes |
| --- | --- | --- |
| `.profile-panel__close` | 44.0 × 44.0 @ (325, 160.1) | inside panel + viewport |
| 6 × `.tab-button` | h = 44.0; w = 52.8 / 52.8 / 52.8 / 44.0 / 64.0 / 64.0 | wraps to 2 rows (y = 261.0 and 310.6) |
| `.profile-tabs__list` | scrollWidth 348 = clientWidth 348 | no horizontal clip remains |

Both dimensions are satisfied and all six tabs are simultaneously visible in the viewport.
Fix confirmed at `src/styles/global.css:2762-2766` (min 2.75rem both axes) plus
`src/styles/global.css:2809-2813` (`flex-wrap: wrap; overflow-x: visible`).

### P1-2 (RESOLVED) — settings panel close / quality / reduced-motion / reset ≥44×44
`.city-settings__head button` 44.0 × 44.0; three `.city-settings__quality button` 81.5 × 44.0;
`.city-settings__toggle` 258.8 × 44.0; `.city-settings__reset` 258.8 × 44.0. Panel rect
63.2 → 362.8 is fully inside 390 px. Note the toggle is a `<label>` wrapping the
`<input type="checkbox">`, so the 44 px row is the real hit area while the 20 × 20 input inside
it is only visual — acceptable, and it is the row that the test measures.
Fix at `src/styles/global.css:2768-2788`.

### P1-3 (RESOLVED) — search clear and landmark return ≥44×44
`.city-search__clear` 44.0 × 44.0 (base rule is 20 × 20 at `src/styles/global.css:1689`, so the
mobile override at `:2791-2796` is load-bearing, together with the
`.city-search:has(.city-search__clear) input { width: 4.4rem }` companion rule that stops the
input from being squeezed). `.city-landmark-card__actions button` ("返回城市") 73.7 × 44.0,
card 115.2 → 288.5, fully in viewport.

### P1-4 (RESOLVED) — district tray no longer auto-scrolls; head visible at scrollTop 0
At 390×844 after opening the tray via `[aria-controls="city-district-tray"]`:
`scrollTop === 0`, `.city-tray__head` rect 565.9 → 616.1 inside the tray rect 560.8 → 830.8,
tray close 44.0 × 44.0, all five election tabs h = 44 with widths
49.5 / 58.8 / 58.8 / 68.0 / 68.0, district chips 179.3 × 44.0.
Also reproduced with a preselected district
(`/?district=kaohsiung-council-04&focus=lotus-pond`): head fully in viewport, `scrollTop` 0 at
375×667, 360×640 and 320×568. The tray is the only scrollable element
(`scrollHeight` 493 vs `clientHeight` 269), so chips below the fold stay reachable.
Fix at `src/components/CityExplorer.tsx:401-411` (early return at `:406`). Both trays are
conditionally rendered, so each open remounts with `scrollTop` 0 and the old regression cannot
return through the remount path either.

### P1-5 (RESOLVED) — previously fixed top bar / dock / people tray still compliant
Search input 89.6 × 44; settings icon 44 × 44; zone buttons 全城/左營/楠梓 44 × 44; dock toggles
108.2 × 44; people-tray close 44 × 44; candidate rows 179 × 50.6.
`documentElement.scrollWidth === innerWidth` (390, 375, 360, 320) at every step — no horizontal
page overflow. Hit tests at control centres and inset corners never resolve to an overlay; only
the rounded corners of circular close buttons fall outside the button, which is expected
geometry, not a defect.

### P1-6 (OPEN — narrow widths only) — election tab `全部` under 44 px
- 320×568: 35.5 × 44.0
- 360×640: 43.5 × 44.0
- 375×667: 46.5 × 44.0 (passes, barely)
- 390×844: 49.5 × 44.0 (passes)

Cause: `src/styles/global.css:2679-2683` sets only `min-height: 2.75rem` on
`.city-tray .city-tabs button`, while `src/styles/global.css:1897-1904`
(`.city-tabs button { flex: 1 1 auto; min-width: 0; padding: .34rem .45rem; white-space: nowrap }`)
and `:1887-1895` (`.city-tabs { display: flex; flex: 1 1 auto; min-width: 0 }`) let the five tabs
shrink to share the tray width. Suggested fix: add `min-width: 2.75rem` to the mobile tab rule
(the tray is already scrollable/wrappable, so nothing else has to change), or wrap `.city-tabs`
on narrow screens.

## P2 findings

1. **User-initiated scroll still hides the tray head.** `.city-tray__head` is `display: flex`
   only (`src/styles/global.css:2564-2569`), not sticky. Setting the tray's `scrollTop` to 120 px
   moves the head to `top: 445.9` with `trayTop: 560.8` — visible head height 0, close button
   invisible. The fix removed the *automatic* scroll, which was the P1; a swipe re-creates the
   same lost-controls state. `position: sticky; top: 0` on the head would close the class of bug.
2. **The selected district can be invisible on small screens.** With a deep link at 320×568 the
   active chip 第4選舉區 sits at `top: 529.2` with only 25.7 px visible (tray 373.1 → 554.8) and
   `scrollTop` 0. The right fix is probably a constrained `scrollIntoView({ block: 'nearest' })`
   *inside the tray* rather than skipping it entirely: it keeps the head in place (the tray's own
   scroll container is what moves) and still shows the user where they are. Worth confirming that
   the original header loss was really caused by page-level scrolling and not by the tray's own
   overflow — if it was `scrollIntoView` climbing to the page scroller,
   `scrollIntoView({ block: 'nearest', inline: 'nearest', container: 'nearest' })` semantics or a
   manual `tray.scrollTop = chip.offsetTop - headHeight` is enough.
3. **Hard-coded breakpoint in two languages.** `window.matchMedia('(max-width: 760px)')`
   (`src/components/CityExplorer.tsx:406`) duplicates the CSS breakpoint in
   `src/styles/global.css:2746` and friends. If the CSS breakpoint ever moves, the JS behaviour
   silently desynchronises. Extract a shared constant or drive the behaviour from a data attribute.
4. **Resize while the tray is open.** The effect's dependency array is `[dockPanel]`
   (`src/components/CityExplorer.tsx:411`), so a rotation/resize from ≤760 px to desktop while the
   tray is open will not re-run the desktop scroll logic. Low impact; noting for completeness.
5. **Profile panel can hide its own tabs.** `.profile-panel` scrolls
   (`src/styles/global.css:248-254`); after `panel.scrollTop = 500` the first tab is at
   `top: -239` and the close button at `top: -339.9`. Recovering requires scrolling back up, which
   is reachable but not obvious. A sticky `.profile-panel__top` would match the pattern the rest
   of the sheet already uses.
6. **Tabs lack the full WAI-ARIA tabs keyboard pattern.** `role="tab"` / `role="tablist"` /
   `role="tabpanel"` and `aria-controls` are present
   (`src/components/ProfileTabs.tsx:826-849`), but there is no roving `tabIndex` and no
   Arrow/Home/End handling anywhere in `src/components/ProfileTabs.tsx`. Pre-existing, outside
   this fix, but the touch review is a natural moment to note it.

## Test quality audit — `tests/e2e/mobile.spec.ts:40-158`

Meaningful, not cosmetic. It measures rendered geometry
(`locator(...).evaluateAll(el => el.getBoundingClientRect())`, `:54-68`), asserts **both** width
and height ≥ 44 (`:75-84`), asserts `targets.length > 0` per group so selector rot cannot pass
silently (`:74`), and asserts `.tab-button` count is 6. All the surfaces in the review request are
covered: top controls `:87-92`, district tray + `toBeInViewport()` + `scrollTop === 0` `:97-108`,
people tray `:115-120`, profile panel `:122-131`, settings `:135-142`, search clear `:145-148`,
landmark return `:150-158`. It is a real behavioural test.

Gaps, in priority order:

1. **Flaky — observed failure.** `npx playwright test tests/e2e/mobile.spec.ts -g "44px"
   --repeat-each=3` produced **1 failed / 2 passed**:
   `Error: expect(locator).toHaveCount(expected) failed … Locator: .profile-panel.is-open
   .tab-button … Expected: 6 Received: 0 … 7 × locator resolved to 0 elements`, at
   `tests/e2e/mobile.spec.ts:125`, with the page snapshot showing
   `paragraph: 載入人物資料…`. `ProfileTabs` is a `React.lazy` chunk
   (`src/components/CityExplorer.tsx:24`) behind
   `<Suspense fallback={<p className="profile-loading">載入人物資料…</p>}>`
   (`src/components/CityExplorer.tsx:955`), so `.is-open` exists before any `.tab-button` does and
   the 5 s default `toHaveCount` timeout is not a reliable wait under parallel workers.
   Three subsequent single runs passed (18.1 s / 23.0 s / 21.8 s), so this is load-dependent,
   not deterministic. Fix: `await expect(profile.locator('.tab-button').first()).toBeVisible({ timeout: 20_000 })`
   (or `await expect(profile.locator('.profile-loading')).toHaveCount(0)`) before the count
   assertion. Until then "21/21 PASS" is not a stable guarantee.
2. **Single viewport.** `page.setViewportSize({ width: 390, height: 844 })` (`:44`) — one width for
   a `max-width: 760px` stylesheet and `html { min-width: 320px }`. This is exactly why P1-6 went
   undetected. Loop over `[390, 360, 320]`.
3. **No clipping or occlusion check.** A control clipped by an ancestor, or covered by an overlay,
   still reports its full `getBoundingClientRect`. Add an ancestor-overflow intersection and/or a
   `document.elementFromPoint` hit test at the control centre (mirroring the profile of the probes
   used in this review).
4. **`toBeInViewport()` default ratio.** `expect(districtTray.locator('.city-tray__head')).toBeInViewport()`
   (`:101`) passes on a 1 px sliver. Use `{ ratio: 1 }` and, for the tabs, assert the tab rect is
   inside the tray rect.
5. **One-shot `scrollTop` assertion.** `expect(await districtTray.evaluate(...)).toBe(0)` (`:102`)
   reads once. Use `await expect.poll(...)` so a delayed/rAF scroll cannot escape.

## Documentation accuracy audit

Verified accurate:
- `reports/final-report.md:120` "PASS, 21/21" — the suite really has 21 tests
  (`npx playwright test --list` → "Total: 21 tests in 3 files") and all 21 pass. Caveat: not
  repeat-stable (P2/test gap 1).
- `openspec/changes/improve-zuoying-nanzih-immersive-city/tasks.md:35` "88 unit tests, 21
  Playwright tests" — `npm test` → 15 files / 88 tests passed.
- `reports/final-report.md:133` "Low FPS is the minimum of five samples, not a low-percentile
  statistic" — literally correct: `scripts/measure-city-performance.ts:100-108` computes
  `averageFps` as the mean and `lowFps` as `Math.min(...samples.map(s => s.fps))`.

Stale or overstated text (file:line):

1. `reports/final-report.md:43` — "every essential mobile control (… election tab … district
   chip …) renders at least 44 px in both dimensions at 390×844". True as literally scoped, but
   the sentence reads as a general mobile guarantee while the same elements are 43.5 px / 35.5 px
   at 360 / 320 (`src/styles/global.css:2679-2683`). Either add the width qualifier explicitly or
   fix P1-6.
2. `reports/final-report.md:139` — "Playwright measures every essential control in the top bar,
   district tray, people tray, profile panel, settings panel, search-clear action, and landmark
   card at a minimum of 44 px in both dimensions". No viewport qualifier at all; if the election
   tabs in the district tray are in scope (they are listed at `:43`), this is overstated for
   widths below ~357 px.
3. `reports/final-report.md:44` — "the mobile tray opens at the top so its election tabs and close
   control remain visible" is accurate for open time, but incomplete: the *active* district can be
   out of view (25.7 px visible at 320×568), and any user scroll hides the tabs and close
   (`src/styles/global.css:2564-2569`). Worth one clause, otherwise a reader assumes the tray head
   is permanently pinned.
4. `openspec/changes/improve-zuoying-nanzih-immersive-city/tasks.md:31` (§5.3) — "scripted
   keyboard/touch measurements confirm … 44 px targets for essential controls across the top bar,
   trays, profile panel, settings, search clear, and landmark card". "trays" includes the election
   tabs, so this is overstated below ~357 px for the same reason as (1).
5. `reports/final-report.md:145` and `:163` — the report still says the targeted re-review is
   *running* as `del_mw6scg4w_o18a` with output `reports/review/p1-touch-fix-review.md`, and
   "Final independent acceptance: re-review pending". Once this file is recorded the placeholder
   must be replaced by the verdict paragraph; `reports/review/` did not exist before this review,
   so the referenced path was empty at the time of writing.
6. `reports/final-report.md:128-133` — the table's `Low FPS` column is the *cold* first sample
   (`reports/performance/after.json`: desktop `[1.1, 5.4, 3.0, 2.8, 3.0]` → low 1.1, avg 3.1;
   mobile `[1.2, 4.3, 1.9, 2.2, 2.3]` → low 1.2, avg 2.4). The footnote defines the statistic but
   does not say the minimum is always sample 1, so the column reads as steady-state worst case
   when steady state is 2.8–5.4. Suggest labelling it "min of 5 samples (first sample is cold
   start)".

Not stale (the suspicions in the request are already resolved): there is no remaining "19/19" and
no "31x42"/"31×42" text anywhere in `reports/*.md` or in the OpenSpec change directory (grep
returns nothing); test counts (21 Playwright, 88 unit) and the low-FPS definition are correct.

## Reproduction

```bash
# suite
npx playwright test tests/e2e/mobile.spec.ts --reporter=line      # 3 passed
npx playwright test --reporter=line                               # 21 passed
npx playwright test tests/e2e/mobile.spec.ts -g "44px" --repeat-each=3   # 1 failed (flake)

# unit + lint (sanity, unchanged by this fix)
npm test                                                          # 15 files / 88 tests passed
./node_modules/.bin/biome check src scripts tests playwright.config.ts   # 109 files, clean
```

The width sweep (320/360/375/390) and the occlusion/hit-test measurements in this report were
produced by throwaway scripts outside the repository; nothing under `src/`, `tests/` or `scripts/`
was modified.

## Recommendation

Ship the batch against the 390×844 acceptance bar. Before the docs claim a *universal* mobile
44 px guarantee, add `min-width: 2.75rem` to `.city-tray .city-tabs button` in the mobile block
(`src/styles/global.css:2679-2683`), make `.city-tray__head` sticky (`:2564-2569`), parameterise
the mobile spec over 320/360/390, and replace the racy `toHaveCount(6)` with an explicit
`toBeVisible` wait on the lazily loaded tabs.
