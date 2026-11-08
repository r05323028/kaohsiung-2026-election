# Design System

## Visual intent

原創、溫暖、低多邊形的港灣城市立體模型；它是資訊閱讀的入口，不是遊戲規則。沒有 points、排名、combat、attributes、achievements 或任何暗示候選人好壞的玩法。

## Tokens

| Token | Value | Use |
| --- | --- | --- |
| Harbor Teal | `#4CAFA8` | water, active controls, landmarks |
| Warm Sand | `#F5E8D4` | side panels, city ground |
| Coral | `#E99679` | focus, accent, status emphasis |
| Deep Ocean | `#294858` | text, ink, primary actions |
| Soft Cream | `#FFF9F0` | page background, cards |

Tokens live in `src/styles/global.css` through Tailwind v4 `@theme` plus project classes.

## Typography and language

Traditional Chinese is the primary reading language. English appears only in small classification/route tokens. The UI uses system Traditional Chinese fallbacks rather than requiring a remote font. Body text is relaxed and high contrast; headings are heavy but never used to editorially rank people.

## Component states

- Buttons and links have visible focus rings (`#E99679`) and pointer hover lift.
- Active district/tab uses teal or coral, never a positive/negative score.
- `虛構示範` badges appear wherever demo content can be mistaken for real information.
- Source/status chips make provenance visible near claims.
- Empty states say that missing data is not proof of absence.
- The mobile profile becomes a bottom sheet; the scene remains the primary context.

## 3D language

Orthographic/isometric framing, warm directional light, soft shadows, simple building masses, harbor, light rail, civic building, palms and original chibi adult prototypes. Character visual metadata is separate from content. All candidate avatars have equivalent scale, lighting and interaction treatment. Current GLB assets are five original Three.js primitive meshes (one base plus four fictional demo variants), with shared `Idle`、`Selected`、`Greeting`、`Walking` clips; official candidates remain procedural and neutral.

## Accessibility and motion

Critical facts are HTML. The scene has a fallback and an adjacent accessible candidate list. Controls are keyboard-operable buttons, tabs use `role=tab`, focus is visible, and reduced-motion disables focus/greeting effects. Future real-person assets need appropriately sourced reference material, human review for respectful likeness and source provenance, and a separate publication decision. The current manifest marks every generated asset `not-applicable-fictional`; this is not visual approval for any real person.

## Immersive Zuoying–Nanzih city layer

The homepage now presents a full-screen orthographic miniature city rather than a small scene inside a three-column information layout. The visual language, world scale, district composition, camera states, quality tiers, asset manifest, and measurement caveats are documented in `docs/CITY_ART_DIRECTION.md`. Candidate facts, provenance, review states, and accessible HTML alternatives remain in the existing content layer; the 3D scene is presentation, never evidence.
