# Final Boss Models (drop your Tripo AI exports here)

The boss waits in Room 7 behind the sealed door — it deserves your best model.

## File format
- **`.glb`** (binary glTF) — export from Tripo AI as GLB. One file per boss.
- Include an **idle animation** if you can — the game auto-plays the first animation clip in the file.

## Recommended specs (for smooth tablet performance)
| Property | Target |
|---|---|
| Polygons | up to **40,000 triangles** (only one boss is ever on screen) |
| Textures | **1024 × 1024** (2048 max) |
| Materials | 1 per model |
| File size | Under ~12 MB |

## Expected filenames
The game looks for these paths (set in `js/data.js`):

- `Cult-Leader.glb` — Cult Leader ✓
- `Nemihydra.glb` — Nemihydra ✓
- `The-Smiler.glb` — The Smiler ✓
- `The-Yellow-King.glb` — The Yellow King ✓

Missing files are fine — the game shows a horned placeholder token instead.

## Adding a brand-new boss
Open `js/data.js`, copy an entry in the `BOSSES` array and change the
`id`, `name`, stats and `model` path (pointing into this folder). It will
appear in the "Crown the Final Boss" step of the campaign designer
automatically.

Bosses are rendered larger than regular monsters and attack twice per
turn — models are auto-scaled, so export scale doesn't matter.
