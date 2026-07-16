# Room Props (drop your Tripo AI exports here)

Drop `.glb` prop models into a theme's subfolder and rooms with that theme
use **your props instead of the built-in ones** — scattered around the room
edges with random rotation and size variation, always clear of the stepping
stones and door walkways.

```
models/props/
  scifi/         🛸  e.g. crates, terminals, reactor cores
  darkforest/    🌲  e.g. trees, mushrooms, standing stones
  dungeon/       ⛓  e.g. barrels, torches, cages, bones
  crystalcave/   💎  e.g. crystal clusters, stalagmites
  backrooms/     🚪  e.g. office chairs, filing cabinets, wet-floor signs
  cult/          🕯  e.g. altars, candles, obelisks, braziers
  temple/        🏛  e.g. columns, statues, urns
```

Any filename works — no registration needed. Add several models to a folder
for variety; the game cycles through them. A theme with an empty folder
keeps its built-in procedural props (torches, fireflies, holo-cubes...).

## Where to get props
- **Tripo AI** — export as `.glb`, drop it in. Easiest.
- **Poly Haven (polyhaven.com/models)** — free CC0 photoscans (rocks, stumps,
  barrels...). Download as **glTF** and extract the WHOLE zip into the theme
  folder — the `.gltf` needs its `textures/` folder and `.bin` beside it.
  ⚠ These are photoreal scans and can be heavy — check the polycount on the
  asset page and prefer their lower-poly LOD if offered.
- **Low-poly packs that match the game's look**: Quaternius.com, Kenney.nl,
  KayKit (kaylousberg.itch.io) — all free, game-ready `.glb`/glTF, very light.

## Recommended specs
| Property | Target |
|---|---|
| Polygons | **1,000 – 5,000 triangles** (up to ~10 props appear per room) |
| Textures | **512 × 512** (1024 max) |
| File size | Under ~2 MB each |

Props are auto-scaled to roughly hero height (with variation) and stood on
the floor, so export scale doesn't matter.

## Local play vs. hosted
- **Local server** (`python3 -m http.server`): just drop files in — they're
  discovered automatically on the next page load.
- **Hosted online** (GitHub Pages / Netlify): static hosts can't list folder
  contents, so also add the filename to `manifest.json` in this folder, e.g.
  ```json
  { "dungeon": ["Barrel.glb", "Torch.glb"], ... }
  ```
  (Saying "refresh models" to Claude regenerates this manifest for you.)
