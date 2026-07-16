# Side Characters (drop your Tripo AI exports here)

Mysterious allies who appear mid-campaign — usually after the third monster
falls — to send the party on a relic quest. They are **not** pickable in the
campaign designer: one is chosen **at random** each campaign.

Drop `.glb` files here — any filename works, no registration needed. The
character's name comes from the filename (`Wise-Elder.glb` → "Wise Elder").
With no files here, a placeholder "Mysterious Stranger" token appears instead.

## Recommended specs
| Property | Target |
|---|---|
| Polygons | **10,000 – 20,000 triangles** |
| Textures | **1024 × 1024** |
| File size | Under ~8 MB |

## Local play vs. hosted
- **Local server**: just drop files in — auto-discovered on next page load.
- **Hosted online**: also list filenames in `manifest.json` here, e.g.
  `["Wise-Elder.glb", "Lost-Merchant.glb"]`
  (saying "refresh models" to Claude regenerates it for you).
