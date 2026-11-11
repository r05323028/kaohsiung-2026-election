# City art direction: stylised Taiwanese architecture

This document describes the architectural layer of the unified Kaohsiung hex
world. It replaces the earlier single-diorama art notes, which referenced the
removed `src/city/*` scene. Candidate data, provenance, review status, and
editorial policy remain outside the 3D layer and are never encoded in geometry.

## Intent

**Premium stylised Taiwanese miniature city.** The city should read as a
handcrafted tabletop model: strong silhouettes, painted plaster and tile, warm
raking sunlight, and enough rooftop life to feel inhabited. It is deliberately
not photorealistic, and it is not a surveying reconstruction.

| Principle | Implementation |
| --- | --- |
| Architectural depth | Recessed windows, arcades, balconies, awnings, parapets, water tanks, solar panels, AC units, pipes, and shopfronts are modelled geometry, not decals. |
| Regional identity | Zuoying is historic low-rise with gables, arcades, and warm plaster; Nanzih is industrial and modern with sawtooth warehouses, flat roofs, and cooler metal. |
| Restrained palette | Warm sand, cream, faded mint, pale blue, terracotta, slate, and blue-grey metal. Saturation stays low; no glossy toy plastic. |
| Readable at gameplay zoom | Massing, roofs, awnings, and rooftop clutter carry the silhouette; fine facade detail is reserved for close inspection. |
| Preserved landmarks | Landmark models, identifiers, ownership, placement, hover, click, and camera focus are untouched. Buildings keep clear of them. |

## World conventions

- The world is a 40-tile hex map covering 38 administrative districts; tiles are
  decorative stage sets, not cadastral footprints.
- Each tile has a landmark at its centre. Candidate roads are the ring roads at
  radius 2.009 and the selected connectors; buildings never intrude on them.
- Buildings occupy the plaza ring at radius **0.96–1.06** from the tile centre.
  Their facades face the landmark at the centre, and their local +z points away
  from it.
- The **camera-facing arc** (±0.55 rad around the camera azimuth) is kept free of
  buildings so the landmark and approaching candidates stay readable.
- Landmark clearance circles are derived from landmark kind and scale
  (`LANDMARK_CLEARANCE`, plus a small pad). A candidate lot whose oriented
  footprint intersects a circle is skipped, leaving organic gaps rather than
  overlapping models.
- Height is capped by `maxSilhouetteHeight(radius) = max(0.3, (1.383 − 0.69·radius) / 0.712)`
  so a building's roof stays below the far ring road in screen space and never
  hides candidates walking there.
- Tree rows sit outside the building ring (radius 1.58–1.62) and are filtered
  against landmark footprints.

## File map

| File | Responsibility |
| --- | --- |
| `src/world/buildings.ts` | Pure layout and specification: archetypes, district profiles, palettes, seeded PRNG, landmark clearance, height cap, LOD selector. No Three.js import. |
| `src/world/building-geometry.ts` | Converts specs into three merged, vertex-coloured geometry buckets with cumulative LOD index ranges. |
| `src/components/HexBuildings.tsx` | Renders the three buckets with shared PBR materials and switches draw ranges from camera zoom. |
| `src/components/HexWorldLayer.tsx` | Places the building layer, keeps trees outside the ring, and handles tile interaction. |
| `src/components/CityScene.tsx` | Camera, key/hemisphere/ambient light, shadows, tone mapping. |

## Archetypes and profiles

Six reusable archetypes share one geometry vocabulary. Variants change width,
depth, floors, roof, arcade, awning, balconies, setback, signage, colours, and
rooftop equipment.

| Archetype | Character |
| --- | --- |
| `townhouse` (透天厝) | Narrow, 2–4 floors, steep gable or hip roof, water tank, occasional shuttered shopfront. |
| `arcadeShophouse` (騎樓) | Recessed ground floor with columns, shop glass, sign band, awning, flat or gable roof. |
| `apartment` | Wider 3–5 floor block, balconies, flat roof and parapet, optional stepped-back top floor. |
| `cornerCommercial` | Mid-width commercial block, shopfront, blade sign, hip or flat roof. |
| `modernBlock` | 3–6 floors, ribbon windows, flat roof, setback terrace, minimal ornament. |
| `warehouse` | Single tall volume, roller door, sawtooth or flat roof, vents, chimney, cooler metal palette. |

District profiles map the 38 official district IDs to six urban characters:
`historic` (E03 Zuoying), `industrial` (E04 Nanzih and the industrial belt),
`denseUrban`, `harbor`, `rural`, and `mountain`. Each profile controls the
archetype weights, floor range, maximum height, palette, and the chance of
arcades, awnings, balconies, signage, and water tanks. The first few lots of a
tile are forced to signature archetypes so the regional character is legible
even when a tile only has room for three or four buildings.

## Determinism

All layout randomness comes from FNV-1a hashing of
`tile.id + ':' + districtId + ':town'` and a mulberry32 generator. There is no
`Math.random()` in the building path, so a tile renders identically on every
load, resize, or revisit. Colours are chosen from per-profile arrays; geometry
is merged once per page load.

## Detail tiers

The same geometry buffer holds all tiers. Index ranges are cumulative, so a tier
switch only adds or removes fine parts; the silhouette never pops.

| Tier | Contents | Trigger |
| --- | --- | --- |
| Low | Massing, foundation, roof, parapet, arcade columns, shopfront, awning, balconies, blade sign, water tank, stair bulkhead. | Camera zoom < 62 px/unit, or reduced quality at overview. |
| Medium | Front and camera-side windows with reveals and glass, floor bands, sign band, frieze, pitched-roof tanks. | Zoom ≥ 62. |
| High | Sills, mullions, balcony rails, roof ACs, antenna, downpipe, eave trim, ridge caps, rooftop edge trim. | Zoom ≥ 155 and quality is not low. |

The selection function is `buildingDetailForZoom(zoom, quality)`. It uses the
orthographic camera's zoom (projected screen size), not world distance, because
distance is constant along the view ray in an orthographic scene. Low-quality
hardware still gets medium facades when the user zooms in, but never the high
tier.

## Materials and lighting

- Three shared `MeshStandardMaterial` instances with vertex colours:
  wall (roughness 0.88, metalness 0), glass (0.24, 0.2, low env intensity), metal
  (0.52, 0.35). No per-building textures or unique materials.
- The three buckets cost three draw calls in the main pass (six with the shadow
  pass). Geometry is frustum-culled off deliberately because it is one merged
  citywide mesh; culling individual buildings would require splitting it again.
- Key light: warm `#fff0d6` at `[27, 33, 5]`, intensity 1.45. Hemisphere
  `#fff4df` / `#8cb3a1` at 1.35, ambient 0.5. ACES exposure 1.03.
  Shadows are 2048 / 1024 / 512 by quality tier; no bloom, DOF, or SSAO.
- Roofs are the primary colour accent from the elevated camera: terracotta and
  slate for historic tiles, blue-grey metal and pale grey for industrial tiles.

## Verification and evidence

- `src/world/buildings.test.ts` — determinism, district ownership, ring
  placement, height cap, six-archetype coverage, landmark clearance, open camera
  arc, and LOD thresholds.
- `src/world/building-geometry.test.ts` — bucket counts, monotonic tiers,
  finite vertex data, world bounds.
- `scripts/capture-architecture.ts` — deterministic before/after capture set.
- `scripts/measure-architecture-performance.ts` — draw calls, triangles, and
  FPS samples at desktop and mobile viewports.
- Evidence: `reports/visual/architecture/{before,after}/` and
  `reports/performance/architecture-*.json`.

## Known limitations

- Building placement is procedural and decorative. It is not a footprint survey
  and must not be read as one.
- Tiles whose landmarks have large clearance circles can only fit a few
  buildings. Nanzih's park and wetland leave three; that sparseness is honest to
  the model, not a missing render.
- Facade detail is most legible at district focus or closer (zoom ≥ 100). At the
  full-city view the buildings read through massing, roofs, and colour.
- Landmarks remain dedicated low-poly groups. They are not replaced by generic
  procedural buildings, and no landmark was moved to improve composition.
