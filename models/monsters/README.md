# Monster Models (drop your Tripo AI exports here)

> Final boss models go in **`models/bosses/`** — see the README there.

## File format
- **`.glb`** (binary glTF) — export from Tripo AI as GLB. One file per monster.
- Include an **idle animation** if you can — the game auto-plays the first animation clip in the file.

## Recommended specs (for smooth tablet performance)
| Property | Target |
|---|---|
| Monster polygons | **15,000 – 30,000 triangles** |
| Textures | **1024 × 1024** (2048 max for bosses) |
| Materials | 1 per model |
| File size | Under ~10 MB |

## Expected filenames
Monsters (set in `js/data.js`):

- `ExperimentD.glb` — Experiment D ✓
- `Necromancer.glb` — Necromancer ✓
- `Scarecrow.glb` — Scarecrow ✓
- `Smiler-Mech.glb` — Smiler Mech ✓
- `Wicker-Wendigo.glb` — Wicker Wendigo ✓
- `Wicker-Worm.glb` — Wicker Worm ✓
- `Dr-Halvek.glb` — Dr. Halvek ✓
- `Janitor.glb` — The Janitor ✓
- `Nemi-Symbiote.glb` — Nemi Symbiote ✓
- `NemiMountain.glb` — Nemi Mountain ✓
- `Nemigorgon.glb` — Nemigorgon ✓
- `Smiler-Spider.glb` — Smiler Spider ✓
- `Wicker-Cyclops.glb` — Wicker Cyclops ✓

Missing files are fine — the game shows a horned placeholder token instead.

## Adding a brand-new monster or boss
Open `js/data.js`, copy an entry in the `MONSTERS` (or `BOSSES`) array and
change the `id`, `name`, stats and `model` path. It will appear in the
campaign designer automatically.

Models are auto-scaled and stood on the central platform, so export scale
doesn't matter.
