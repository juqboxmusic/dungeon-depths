# Floor Textures (drop seamless/tileable images here)

Drop **tileable texture images** (`.jpg` / `.png` / `.webp`) into a theme's
subfolder and that theme's rooms use your texture as the floor — tiled 4×4
across the room, darkened slightly to match the board lighting, with the
theme's iconic markings still drawn on top (the cult pentagram, sci-fi
circuit traces, temple gold inlay, the glowing centre ring) plus the edge
vignette.

These are **flat images, not .glb** — 3D models are for monsters and props;
the floor is a flat surface that gets an image "wallpapered" onto it.

```
floor-textures/
  scifi/         🛸  metal plating, hex panels
  darkforest/    🌲  forest floor, moss, leaf litter
  dungeon/       ⛓  stone slabs, cobblestone
  crystalcave/   💎  dark rock, amethyst veins
  backrooms/     🚪  yellowed carpet (you know the one)
  cult/          🕯  dark stone, dried blood stains
  temple/        🏛  sandstone, marble
```

Any filename works — no registration needed. With multiple textures in a
folder, different rooms of that theme pick different ones (stable per room).
An empty folder keeps the built-in generated floor.

## Where to download (free, CC0)
- **ambientCG.com** — search "forest floor", "sci-fi panel", "carpet",
  "cobblestone"... download the **1K JPG**, drop in the **Color** map only
- **Poly Haven (polyhaven.com/textures)** — same idea: the diffuse/albedo image

Downloads often come as a bundle like:
```
forest_ground_05_diff_1k.jpg   ← the color map — THIS one is used
forest_ground_05_disp_1k.png   ← ignored automatically
forest_ground_05_nor_gl_1k.exr ← ignored (browsers can't read .exr)
forest_ground_05_rough_1k.exr  ← ignored
```
You can drop the whole set in if you like — the game automatically picks
color/diffuse images (`diff`, `col`, `albedo`...) and skips the technical
maps (`nor`, `disp`, `rough`, `ao`, `arm`...).

## Specs
| Property | Target |
|---|---|
| Format | `.jpg` (smallest), `.png`, `.webp` |
| Resolution | **512–1024 px**, square |
| Must be | **seamless / tileable** (texture sites label this) |
| File size | Under ~1 MB each |

## Local play vs. hosted
- **Local server**: just drop files in — auto-discovered on next page load.
- **Hosted online**: also list the filename in `manifest.json` here
  (saying "refresh models" to Claude regenerates it for you).
