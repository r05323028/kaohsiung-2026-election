# Unified Kaohsiung geography

## Source and licence

- Dataset: 內政部國土測繪中心, 鄉(鎮、市、區)界線(TWD97經緯度), edition **TOWN_MOI_1140318**, dataset 7441, <https://data.gov.tw/dataset/7441>.
- Snapshot: modified 2025-12-16, retrieved 2026-11-08.
- Licence: 政府資料開放授權條款第1版, <https://data.gov.tw/license>.
- Derived display files:
  - `src/data/geography/kaohsiung-districts.json` — 38 districts with simplified polygons, area, terrain, label point, adjacency, gates, and remote territories (about 188 KB).
  - `src/data/geography/kaohsiung-districts-summary.json` — the same districts without polygons (about 16 KB), used by the HUD so the initial chunk does not carry full geometry.
- Rebuild: `PYTHONPATH=/tmp/kaohsiung-pylibs python3 scripts/build-kaohsiung-geography.py` (requires `pyshp`; the committed JSON is the runtime source).

## Coordinate model

- Source CRS: TWD97[2020] geographic coordinates. For this display-only model it is treated as WGS84; the sub-metre datum difference is acknowledged, not hidden.
- Projection: local equirectangular centred at 120.30°E, 22.70°N. **One world unit = one kilometre.**
  - `x = (lon - 120.30) * 111.32 * cos(22.70°)`
  - `z = -(lat - 22.70) * 110.57`
- World bounds are approximately x −12.9…76.9, z −85.3…25.6. The full citywide camera fit targets this bound, not an arbitrary square.
- Simplification: Ramer–Douglas–Peucker at 0.0002° (about 22 m). Labels are chosen inside each polygon; areas are computed with the local projected shoelace formula. These values are for interactive orientation, not surveying, legal boundaries, or voter eligibility.
- Terrain classes (urban / coastal / hill / mountain) are illustrative categories used only for colour and low-detail massing.

## Topology and remote territories

- 38 districts, IDs **E01–E38**, sorted by TOWNID. Official names include the 區 suffix; adjacency keys use the short name without 區.
- Adjacency is derived from at least two exactly shared simplified vertices. The result is symmetric, every district has at least one neighbour, and all 38 districts form one connected graph (86 pairs).
- Gates are the midpoint of the farthest two shared boundary vertices for each pair. They are diagnostic reference points, not a routing graph.
- 旗津's main island is the walkable district. Sixteen remote rings — Dongsha/Pratas and Taiping — are kept as `remoteTerritories` with their own bounds and are excluded from the citywide camera bounds and walkable routes.
- 桃源 contains two main polygon rings, both retained.

## Hero migration

- The Zuoying–Nanzih diorama is anchored at **120.298°E, 22.700°N** (`HERO_ORIGIN` in `src/world/hero.ts`).
- Horizontal scale is **0.18 km per hero unit**. Vertical scale is **0.035 km per hero unit**; this is deliberate architectural exaggeration, not a survey.
- The hero's internal bearings, pond shape, river alignment, and Nanzih arrangement are artistic compressions. They preserve the recognizable relative composition of Lotus Pond, the pagodas, the old town, Houjing River, and Metropolitan Park, but are not survey-accurate.
- Streaming: the hero mounts only when focus is within 3.2 km of the anchor and the focus radius is at most 6.5 km. That threshold covers the authoritative 左營 (4.57 km focus radius) and 楠梓 (6.36 km) footprints. At city scale the hero is absent; a merged low-detail apron fills its footprint so the city does not show a hole.
- The hero remains the first high-detail district environment. Other districts currently use merged massing and low-poly relief.

## LOD and rendering

- Citywide: 38 district fills, boundary lines, nine major labels, merged massing by terrain palette, merged low-poly mountain/hill relief, and a sea plane.
- Detail: denser massing counts and smaller blocks; labels shown selectively; hero geometry mounted only for its close focus.
- District massing is merged by colour, not one mesh per building. Actors use one instanced marker pass; the selected actor gets a full avatar and tag.
- Full polygons are imported by the lazy `CityScene` chunk. The HUD imports only the summary module.

## HUD and authoritative focus

- The City Explorer restores the site identity: `港都人物誌` links home, desktop navigation exposes 城市探索 / 選舉區 / 關於計畫 / 資料與政策, and a 44×44 mobile menu provides the same links with Escape and focus restoration. Links use `withBase` for subpath deployments.
- Selecting a district computes its camera focus from the authoritative TOWNSHIP polygons, not from a bounding box or a fixed hero platform. All rings and holes are triangulated; selected fills are opaque. 桃源's two rings are kept, and 旗津's 16 remote islands remain metadata rather than walkable land.
- The hero diorama streams in for 左營 and 楠梓 when the focus radius is at most 6.5 km. No rectangular base is rendered under the district meshes.
- Append `?debug=boundaries` to show the 38 district labels, official gate points, hero bounds, and a walk-graph diagnostic overlay. This is opt-in and adds no production UI.
- District boundaries are simplified for display. The selected footprint is authoritative in shape, not a cadastral or legal-boundary claim.

## Known limitations

- Boundaries are simplified and display-only; no cadastral, legal, or eligibility claim is made.
- The mayoral demonstration route follows official district gates but uses schematic boundary connectors at the world scale; it is not a complete street-level survey. Low-detail districts do not resolve individual buildings, rivers, or sidewalks for route avoidance.
- The harbour basin and quay are stylized hero art. The basin is water, not authoritative land, and is tapered so it does not read as a rectangular platform; its footprint overlaps E03/E17 visually.
- Remote islands are not walkable and are not part of the citywide camera bounds.
- Village and mountain districts are represented by low-poly relief and massing, not street-level architecture.
- No Git repository exists at the project root; the geography snapshot is checked in as files only, not as a Git commit.
