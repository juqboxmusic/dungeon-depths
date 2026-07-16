# ⬢ Dungeon Depths

A Dungeons & Dragons inspired tabletop adventure that runs in the browser
and installs to a tablet home screen as an app (PWA).

**Seven rooms. Five monsters. One final boss.**

## How to run it

It's a plain static site — no build step. Serve the folder with any static
server:

```bash
cd "DND Game"
python3 -m http.server 8000
# then open http://localhost:8000
```

Or host the folder on GitHub Pages / Netlify / Cloudflare Pages and open the
URL on your tablet → browser menu → **Add to Home Screen**. After the first
load it works offline.

## How to play

1. **Design your campaign** — name it, pick a map theme, 1–4 heroes,
   5 monsters (one per room, in pick order) and the final boss.
2. **Explore** — one room is visible at a time. Walk a hero onto a glowing
   door stone and tap **Exit** to move the party to the next room.
3. **Fight** — entering a monster room slams the doors shut. On your turn:
   - 🎲 **Roll Move (d6)** then tap glowing stepping stones to move
   - ⚔ **Attack (d20)** from the inner ring of stones (d20 + bonus vs the
     monster's AC; a d6 + bonus for damage)
   - ✦ **Ability** — each hero has one special ability per room
   - Natural **20** = critical hit (double dice) + a chance of a boon;
     natural **1** = a plot twist event
4. The monster fights back after the whole party has acted.
5. Clear all 5 monster rooms to unseal the **Final Sanctum** (north door of
   Monster Room II) and face the boss you chose.

Pass-and-play: hand the tablet around, each player runs one hero.

## Online multiplayer

- **Host Online** → enter your name → design the campaign (you pick just
  *your* hero) → share the 5-letter **room code** from the lobby
- Friends tap **Join Game**, enter the code, pick + customize their hero,
  and ready up — the host starts when everyone's in
- Play is identical to solo: on your hero's turn your buttons go live;
  everyone else watches the same board, dice and effects in real time

Connections are peer-to-peer (WebRTC via PeerJS's free broker) — no server
or accounts needed; it works from any hosted copy of the game over the
internet. If a player disconnects mid-game, the host controls their hero
until they rejoin with the same name. Online games aren't saved to disk.

## Your 3D models & map art

- Hero models → [`models/characters/`](models/characters/README.md) (.glb, 10–20k tris)
- Monster models → [`models/monsters/`](models/monsters/README.md) (.glb, 15–30k tris)
- Final boss models → [`models/bosses/`](models/bosses/README.md) (.glb, up to 40k tris)
- Custom room floor art → [`maps/`](maps/README.md) (square jpg/png)

Everything is registered in [`js/data.js`](js/data.js) — stats, abilities,
themes, plot-twist tables. Edit that file to tune the game or add content.

## Dungeon layout

```
            [ FINAL BOSS ]        ← sealed until 5 monsters slain
 [ Room 3 ] [   Room 2   ] [ Room 4 ]
 [ Room 1 ] [   LOBBY    ] [ Room 5 ]
```

## Tech

- [Three.js](https://threejs.org) (loaded from CDN, cached offline by the
  service worker) for 3D rooms, tokens and GLB model loading
- No framework, no build step — plain ES modules
- Progress auto-saves to the device after every action
