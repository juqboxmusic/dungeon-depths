# Hero Models (drop your Tripo AI exports here)

## File format
- **`.glb`** (binary glTF) — export from Tripo AI as GLB. One file per hero.
- Include an **idle animation** if you can — the game auto-plays the first animation clip in the file.

## Recommended specs (for smooth tablet performance)
| Property | Target |
|---|---|
| Polygons | **10,000 – 20,000 triangles** |
| Textures | **1024 × 1024** (single texture atlas if possible) |
| Materials | 1 per model |
| File size | Under ~8 MB |

## Expected filenames
The game looks for these paths (set in `js/data.js`):

- `Mage.glb` — Mage ✓
- `Jester.glb` — Jester ✓
- `Redwarrior.glb` — Red Warrior ✓
- `Purple.glb` — Purple ✓
- `Bob.glb` — Bob ✓
- `Hamster-God.glb` — Hamster God ✓

Missing files are fine — the game shows a colored placeholder token instead.

## Adding a brand-new hero
Open `js/data.js`, copy an entry in the `HEROES` array, and change the
`id`, `name`, stats, ability and `model` path. It will appear in the
campaign designer automatically.

Models are auto-scaled to the right height and placed feet-on-ground,
so you don't need to worry about export scale.
