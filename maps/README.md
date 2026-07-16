# Room Map Art (optional)

Each room's floor is a square image. The game generates a themed floor
automatically, but you can replace any room with your own art (like the
Necroforge / crystal cavern battle maps).

## How to add your art
Create a folder named after the theme id and drop in square images named
by room number:

```
maps/
  necroforge/
    room-0.jpg   ← lobby
    room-1.jpg   ← monster room I
    room-2.jpg   ← monster room II
    room-3.jpg
    room-4.jpg
    room-5.jpg
    room-6.jpg   ← final boss room
  embercavern/
    room-0.jpg
    ...
```

Theme ids: `necroforge`, `embercavern`, `shadowcrypt`, `verdantruin`
(add more in `js/data.js`).

## Image specs
- **Square** (the floor is square) — e.g. 1024×1024 or 2048×2048
- `.jpg` or `.png` (jpg loads faster)
- Keep the **centre clear-ish** — the monster platform sits in the middle
  and stepping stones circle around it
- Doors appear at the middle of each edge (north/south/east/west)
