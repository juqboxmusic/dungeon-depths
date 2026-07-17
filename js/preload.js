// ============================================================
//  PRELOAD — boot-time download of every model & texture.
//  First open grabs everything (shown behind the "Loading data"
//  veil); later opens are served from the service-worker cache
//  in moments and kept warm in memory for instant use — whether
//  playing solo or online.
// ============================================================
import { HEROES, MONSTERS, BOSSES, ROOM_THEMES } from './data.js';
import { loadGLTF, loadImage, propFilesFor, floorTextureFilesFor, sideCharacterFiles } from './tokens.js';

export const preloadState = { total: 0, done: 0, finished: false };

const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn(preloadState));
/** Subscribe to progress; fires immediately with the current state. */
export function onPreloadProgress(fn) { listeners.add(fn); fn(preloadState); }

let promise = null;
/** Heroes first (the picker opens them next), then the bestiary, then room dressing. */
export function preloadAll() {
  if (!promise) promise = (async () => {
    const files = [];
    for (const h of HEROES) files.push({ glb: true, path: h.model });
    for (const m of MONSTERS) files.push({ glb: true, path: m.model });
    for (const b of BOSSES) files.push({ glb: true, path: b.model });
    const side = await sideCharacterFiles().catch(() => []);
    for (const f of side) files.push({ glb: true, path: `models/side-characters/${f}` });
    for (const t of Object.keys(ROOM_THEMES)) {
      const props = await propFilesFor(t).catch(() => []);
      for (const f of props) files.push({ glb: true, path: `models/props/${t}/${f}` });
      const texs = await floorTextureFilesFor(t).catch(() => []);
      for (const f of texs) files.push({ glb: false, path: `floor-textures/${t}/${f}` });
    }
    preloadState.total = files.length;
    emit();
    for (const f of files) { // sequential — don't choke the connection
      await (f.glb ? loadGLTF(f.path) : loadImage(f.path)).catch(() => {});
      preloadState.done++;
      emit();
    }
    preloadState.finished = true;
    emit();
  })();
  return promise;
}
