# Immersive city art direction and asset manifest

This document defines the visual language for the full-screen Zuoying–Nanzih
miniature city introduced by `improve-zuoying-nanzih-immersive-city`. It is an
artistic, non-surveying interpretation. Candidate facts, identities, provenance,
review states, and editorial policy remain in the existing HTML data pipeline and
are not encoded in 3D geometry.

## Art direction

**Reference blend:** warm neighbourhood readability of *The Sims*, premium
miniature-diorama craft, cozy exploration pacing, and recognisable Kaohsiung
urban character. The intended first impression is a hand-composed tabletop city,
not a website with a decorative canvas.

| Principle | Implementation |
| --- | --- |
| Readable silhouettes | Landmarks are composed from distinct tiers, roofs, arcades, and entrances rather than plain boxes. |
| Warm stylisation | Pastel plaster, cream stone, teal water, coral accents, green foliage, limited saturated temple red/gold. |
| Consistent daylight | One key direction `[16, 26, 13]`, warm `#fff0d6`; cool hemisphere fill; ACES tone mapping. |
| Soft shadowing | Directional shadow map, 2048 / 1024 / 512 by quality tier; no bloom, DOF, or expensive postprocessing. |
| Depth through layers | Terrain, water bodies, roads, sidewalks, trees, street furniture, vehicles, pedestrians, rooftops, harbour. |
| Restraint | Ambient animation is slow and deterministic; the scene must still look composed when paused or reduced-motion is on. |

The city is intentionally compact. A smaller, composed environment is preferred
over a large, repetitive one.

## World conventions

- Diorama base: **35 × 32 world units**, rounded timber-edged plinth.
- Symbolic scale: **1 unit ≈ 80 m**. Buildings, vehicles, scooters, and people use
  a shared stylised scale; they are not surveying measurements.
- Origin: centre of the diorama. `+x` points east (Nanzih), `+z` points south
  (harbour). `y = 0.05–0.11` is the ground/sidewalk plane.
- Camera: orthographic, direction derived from each focus preset; zoom fits the
  requested radius and viewport. Portrait uses a steeper direction and boost.
- Palette tokens remain `harbor-teal #4cafa8`, `warm-sand #f5e8d4`,
  `coral #e99679`, `deep-ocean #294858`, `soft-cream #fff9f0`, extended by
  material-specific plaster, roof, foliage, timber, stone, and vehicle keys in
  `src/city/materials.ts`.

### District composition

| Area | Coordinates (approx.) | Identity |
| --- | --- | --- |
| Lotus Pond | x −16.2..−2.55, z −9.6..−1.5 | Irregular shoreline, lotuses, reeds, promenade, nine-turn bridge. |
| Dragon & Tiger Pagodas | x −6.2, z −3.55 | Twin seven-tier towers, sky bridge, sculpted dragon/tiger entrance heads, forecourt. |
| Spring & Autumn Pavilions | x −11.8, z −6.2 | Twin lakeside pavilions, Guanyin figure, connecting bridge. |
| Zuoying old town | x −15.4..−4.2, z 1.0..7.5 | Shophouse rows, arcades, awnings, temple, old city gate, lanes. |
| Civic plaza | x −2.0..3.2, z 3.0..7.6 | Civic hall forecourt and neutral candidate marker grid. |
| Houjing River | meander around x 7.3..8.8, z −14.5..15.2 | Naturalistic ribbon, embankments, three bridges, riverside paths. |
| Metropolitan Park | x 10..15.5, z −9..−2 | Lake, boardwalk, playground, lawns, clumped trees, flower beds. |
| Nanzih neighbourhood | x 3..15, z −1..9 | Mid-rise apartments, towers, shopfronts, science-park offices. |
| Harbour front | z 10..16 | Quay, warehouses, containers, gantry cranes, ferry, ship, distant skyline. |
| Banping Mountain | x −12.2, z −12.4 | Flat-topped mesa silhouette behind the pond. |

**Reconstruction disclaimer:** the Dragon & Tiger Pagodas and other landmarks are
artistic reconstructions, not records of current construction or conservation
condition. The landmark card states this in the interface. No invented landmark is
presented as real; simplified geography is labelled as a stylised city model.

## Geometry and material rules

- Buildings use a shared kit: recessed windows with reveal/sill/mullions, arcade
  columns, shopfronts, awnings, balconies with railings and laundry, parapets,
  stair bulkheads, water tanks, solar heaters, antennas, AC units, and roof
  gardens. Repetition is varied by palette, floor count, roof profile, and detail.
- Roof profiles include flat, gable, hip, and upturned eaves. Temple roofs use a
  swallowtail silhouette; pagoda tiers use flared eave discs and balcony rings.
- Materials are shared keys, not per-object random colours. Roughness/metalness
  separate plaster, glass, metal, timber, stone, and tile. Two small procedural
  canvas textures (water ripple normal, ground noise) avoid external texture
  licensing and texture-density drift.
- No external models, photos, trademarks, or texture atlases are shipped for the
  city. Everything is generated deterministically at runtime from Three.js
  primitives.

## Asset manifest

All city assets are **original procedural geometry generated in this repository**.
License: project code license; no third-party asset licence obligations. The five
candidate GLBs are documented separately in `docs/CHARACTER_ASSETS.md`.

| Asset family | Source | Purpose | Format | Reuse / LOD |
| --- | --- | --- | --- | --- |
| Plinth, terrain, roads, rail, quay | `src/city/layout.ts`, `src/city/streets.ts` | Ground plane, streets, bridges, rail, harbour edge | Runtime merged BufferGeometry | One mesh per material; detail flag trims markings/furniture |
| Shophouse / apartment / tower / civic hall / temple / office kit | `src/city/buildings.ts` | Zuoying and Nanzih architecture | Runtime merged BufferGeometry | Reused across blocks with palette/floor/roof variation |
| Dragon & Tiger Pagodas | `src/city/landmarks.ts` | Primary Zuoying landmark | Runtime merged groups | Dedicated high-detail group; hover/selection lift |
| Spring & Autumn Pavilions, old city gate, park pavilion, Banping Mountain, skyline | `src/city/landmarks.ts` | Secondary identity anchors | Runtime merged groups | Shared helpers; distance-scale simplified |
| Trees: broadleaf, palm, banyan, pine, shrub, reed | `src/city/vegetation.ts` | Vegetation layers | InstancedMesh per kind (+ optional trunks) | 114 tree specs at high detail; clumped scatter avoids uniform grids |
| Lotus leaves / flowers | `src/city/water.ts`, `src/city/layout.ts` | Lotus Pond surface detail | InstancedMesh | 150 leaves, 26 flowers at high detail; halved at lower tiers |
| Street furniture, vehicles, pedestrians, containers, cranes, ship | `src/city/props.ts` | Everyday urban life and harbour scale | Runtime merged into city/landmark groups | Reused primitives; no continuous simulation |
| Water bodies | `src/city/water.ts` | Pond, river, park lake, harbour | ShapeGeometry / ribbon BufferGeometry | Shared water material; ripple normal only at medium/high |
| Candidate avatars | `public/assets/avatars/*.glb` | Fictional demo characters; neutral procedural fallback for official candidates | glTF binary | 5 original GLBs, 5,540 triangles total; documented and validated |

### Measured high-detail geometry (headless Chromium, 1600×1000)

- 62 shared material keys; 55 merged static-city parts; 9 landmark groups with 53
  merged parts.
- 114 trees, 150 lotus leaves, 26 lotus flowers (instanced families).
- ~139,590 static-city triangles before landmarks, vegetation, avatars, and water;
  the live renderer reported ~403,450 triangles and ~436 draw calls including the
  shadow pass at high quality.
- 242 geometries and 4 textures in the live renderer after the scene settled.

These are geometry facts, not performance claims. See
`reports/performance/after.json` and the caveat below.

## Lighting and environment

- Background `#dfeff0`; fog 55–105.
- Hemisphere light (`#fff4df` / `#8cb3a1`, 1.25), ambient 0.32, key directional
  2.15, fill 0.4, rim 0.28.
- ACES Filmic tone mapping, exposure 1.02, PCF shadows.
- Water uses a calm teal standard material with a subtle normal ripple; the
  ripple animation stops under `prefers-reduced-motion`.

## Camera and interaction states

| State | Trigger | Behaviour |
| --- | --- | --- |
| `city-overview` | Initial load, 全城, reset | Orthographic fit of the whole diorama. |
| `district-focused` | 左營 / 楠梓 | Fits the district zone with the same easing and bounds. |
| `landmark-focused` | Landmark hover/click, URL `focus` | Fits the landmark focus preset; card exposes label and disclaimer. |
| `candidate-focused` | Candidate marker/chip, URL `candidate` | Fits the plaza context and opens the candidate overlay; closing restores the prior view when possible. |
| `transitioning` | Any focus change | GSAP tween disables orbit input, then restores it; reduced motion snaps. |

Hover lift is limited to landmarks; candidate selection uses a neutral coloured
disc and a coral halo, never a ranking treatment. Drag guards prevent accidental
selection after camera movement. Escape closes settings → search → candidate →
tray → landmark in that order.

## Quality tiers

| Tier | Shadows | DPR | Vegetation | Water ripple | Antialias |
| --- | --- | --- | --- | --- | --- |
| High (desktop ≥1024) | 2048 map | [1, 1.7] | 100% | Yes | Yes |
| Medium (default mobile) | 1024 map | [1, 1.7] | 72% | Yes | Yes |
| Low (manual / constrained) | 512 map | 1 | 45% | No | No |

Users can switch tiers in settings. Tiers preserve the same layout, palette,
landmarks, and civic information.

## Measurement caveat

The available headless browser renders WebGL through **SwiftShader** (software),
not a representative GPU. The latest final run recorded 3.1 FPS average (1.1
minimum sample) at 1600 x 1000 and 2.4 FPS average (1.2 minimum sample) at
390 x 844. Software timing varies substantially between runs; an earlier run of
the same scene recorded 3.0 / 2.6 and 5.8 / 1.5. The minimum is the lowest of five
samples, not a percentile, and is the first (cold-start) sample; the remaining
desktop samples were 2.8–5.4 FPS and the remaining mobile samples 1.9–4.3 FPS.
Treat all of these as lower-bound smoke measurements,
not target-hardware performance. Host: MacBookPro18,3 (Apple M1 Pro, 16 GB),
macOS 26.3.1, headless Chromium 156.0.8078.4, SwiftShader. A physical-device
pass with GPU timing is still required before claiming the 60/30 FPS targets.
Draw calls and triangle counts are reliable renderer counters and should guide
the next optimisation pass.

## Known visual limitations

- The Dragon & Tiger Pagodas are recognisable as twin tiered towers with sculpted
  creature entrances, but the heads remain stylised mascots rather than literal
  architectural sculpture.
- Some park lawn areas are intentionally open and read as flat green at overview
  distance; close focus reveals paths, lake, playground, and tree clumps.
- Candidate avatars share a small fictional GLB set; official candidates use
  neutral procedural visuals, so all markers look similar by design.
- No Blender-authored hero GLB is shipped. The city is entirely runtime
  procedural geometry.
- Dev-toolbar screenshots are excluded; final captures use the production preview
  server.

## Unified Kaohsiung world layer

The original Zuoying–Nanzih diorama is now the first high-detail district
environment inside one 38-district Kaohsiung world. The full dataset, licence,
projection, topology, and hero migration are documented in
[WORLD_GEOGRAPHY.md](./WORLD_GEOGRAPHY.md); simulation details are in
[WORLD_SIMULATION.md](./WORLD_SIMULATION.md).

- **Projection:** 1 world unit = 1 km, centred at 120.30E, 22.70N. The hero
  is anchored at 120.298E, 22.700N with 0.18 km per horizontal hero unit and
  0.035 km per vertical hero unit.
- **Citywide layer:** district fills by terrain (urban warm sand, coastal sand,
  hill sage, mountain deep green), soft boundary lines, nine overview labels,
  merged low-detail massing, low-poly relief in mountain/hill districts, and a
  pale sea plane. The citywide overview is a stylized relief map, not a dense
  street-level model.
- **Hero streaming:** at city scale the high-detail hero is unmounted. A merged
  low-detail apron fills its footprint. The hero mounts only for close
  Zuoying–Nanzih focus, so the transition preserves spatial continuity without
  loading full geometry for all districts.
- **Actors:** one instanced marker pass for all candidates; full avatars for
  actors inside the hero; selected actor gets a ring, name tag, and full avatar
  even outside the hero. Marker colours come from the neutral candidate palette,
  never party or ranking colours.
- **Selection colour:** administrative districts use a pale sand fill with a
  coral outline; the treatment is geographic, not political.
- **Camera:** citywide, administrative, hero, landmark, and candidate follow
  states share the same orthographic rig. Focus radius drives the fit; reduced
  motion snaps instead of tweening. On portrait phones the citywide view rotates
  a quarter turn so the long coastline runs vertically and fills the screen;
  mayoral/indigenous follows frame about 8.4 km of district context, while
  council follows stay at neighbourhood scale.
- **Initial payload (production):** 565,184 B JavaScript transfer / 577,318 B
  total transfer across 13 requests; 3.13 MB decoded. The geography summary is
  loaded eagerly for the 38-district HUD; full polygons stay in the lazy scene
  chunk.

### Unified-world measurement caveat

The only automated rendering measurement available uses headless Chromium with
**SwiftShader**, so the numbers are software-WebGL lower bounds. In the latest
run (reports/performance/unified-world.json):

| Scenario | Viewport | Avg FPS | Min of 5 | Draw calls | Triangles |
| --- | --- | --- | --- | --- | --- |
| Citywide overview | 1600x1000 | 6.7 | 6.3 | 106 | 67,424 |
| Citywide overview | 390x844 | 15.3 | 14.0 | 106 | 67,424 |
| Hero Zuoying–Nanzih | 1600x1000 | 2.4 | 0.8 | 564 | 508,772 |
| Hero Zuoying–Nanzih | 390x844 | 3.6 | 0.8 | 550 | 412,251 |

The minimum is the lowest of five samples, not a percentile. Host: Apple M1 Pro,
16 GB, macOS 26.3.1, headless Chromium, SwiftShader. Physical-GPU 60/30 FPS
targets remain unverified.

### Unified-world limitations

- Low-detail districts are massing and relief, not street-level architecture.
- The mayoral corridor is a coarse centroid route proof, not a real itinerary.
- Mountain/village districts and remote islands are artistically simplified.
- Candidate avatars remain small relative to hero buildings; the name tag and
  selection ring carry identification.
