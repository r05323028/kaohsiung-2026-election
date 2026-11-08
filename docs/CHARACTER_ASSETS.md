# Character asset pipeline

## Boundary

This project uses original low-poly/chibi-style 3D assets as an information interface, not as gameplay and not as evidence about a person. The current generated assets are fictional demonstration avatars only. They are not likenesses of real candidates, and `not-applicable-fictional` is not a visual approval state for real people.

Official candidate profiles continue to use neutral procedural visuals. A candidate can resolve to a GLB only when an explicit manifest mapping exists and the asset is in a permitted generated/validated/approved state. Missing, rejected, superseded, or unmapped assets resolve to the procedural fallback.

## Asset inventory

`public/assets/avatars/` contains one shared base plus four fictional variants:

- `avatar-base.glb`
- `avatar-lantern.glb`
- `avatar-reading.glb`
- `avatar-civic.glb`
- `avatar-harbor.glb`

The checked-in `data/avatars/manifest.json` records stable asset IDs, static model paths, SHA-256, byte size, mesh/material/triangle counts, height, animation clips, visual-review state, and explicit candidate mappings. The current generated snapshot is `2026-11-06`; it contains 5 validated GLBs, 292664 total bytes, and 5540 total triangles.

## Generation and validation

```bash
npm run avatars:generate
npm run avatars:validate
npm run openspec:validate:avatars
```

`scripts/generate-avatar-assets.ts` uses deterministic Three.js primitives and `GLTFExporter`; it writes the GLBs and manifest without network access. `scripts/validate-avatar-assets.ts` reopens every file and verifies safe `public/` paths, GLB v2 magic/version/chunk structure, file length, SHA-256, manifest statistics, animation names, the base-plus-variant minimum, and fictional mappings. Generated source bytes are not hand-edited after export.

When the generator changes, regenerate the manifest and assets together, run validation, and inspect the developer preview. Do not edit a checksum to silence a failed validation.

## Runtime architecture

- `src/data/avatars/schema.ts` is the strict manifest contract and blocks unsafe paths or unapproved real-person assets.
- `src/data/avatars/index.ts` is the mapping/resolution boundary; it never performs network requests.
- `src/components/CharacterAvatar.tsx` loads GLBs with Drei, shares animation names, invalidates demand-rendered frames, and falls back to the existing procedural avatar on load failure.
- `src/components/CityScene.tsx` owns scene placement/camera interaction; political content remains outside model implementation details.
- `src/components/AvatarPreviewApp.tsx` is a developer-only asset inspector with animation controls, metadata, reduced-motion handling, and an error state.

The asset URL is passed through `withBase()` so GitHub Pages-style `BASE_PATH` deployments do not assume the repository root. The public Astro output does not load the preview packet or editorial review data; `/avatar-preview/` renders a disabled shell in production.

## Animation and accessibility

The shared clips are `Idle`, `Selected`, `Greeting`, and `Walking`. Selection and greeting effects are subtle; reduced-motion users receive static pose behavior and no unnecessary camera/animation motion. Every 3D selection has an accessible HTML candidate-list alternative, and factual content is never placed only in the canvas. WebGL failure, GLB load failure, and preview errors remain recoverable states.

## Future real-person assets

Do not map a real candidate to a generated fictional variant. A future real-person asset requires an appropriately sourced reference package, respectful human visual review, a provenance record, and a separate publication decision. The avatar manifest must not be treated as evidence of identity, party, office, policy, popularity, or endorsement. Equivalent scale, lighting, controls, and neutral presentation are required for every published candidate.

## Known limitations

The current meshes are deliberately simple prototypes, the city is an artistic approximation, and no real-person likeness has been implemented or approved. The measured triangle/byte totals are build-time asset facts; device-specific frame rate, memory use, and visual-regression acceptance still need testing on representative mobile hardware.
